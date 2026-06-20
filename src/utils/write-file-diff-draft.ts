export type JsonRecord = Record<string, unknown>;

export interface WriteFileDraftInput {
  path: string;
  mode: string;
  content: string;
  accessProfile: string;
  oldSha256: string;
  requestId: string;
  payload: JsonRecord;
}

export interface WriteFileDiffHunk {
  id: string;
  fileId: string;
  targetPath: string;
  mode: string;
  accessProfile: string;
  oldSha256: string;
  requestId: string;
  title: string;
  status: "pending" | "accepted" | "rejected" | "completed";
  writeContent: string;
  content: string;
}

export interface WriteFileDiffDraft {
  status: "draft";
  decision: string;
  detail: string;
  planItems: Array<{ label: string; status: string; detail: string }>;
  request: JsonRecord;
  proposal: JsonRecord;
  hunks: WriteFileDiffHunk[];
  targetPaths: string[];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asRecordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function pathBaseName(value: string) {
  const normalized = String(value || "").replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || normalized || "未命名文件";
}

export function commandFileIdFromPath(path: string, fallbackPath = "bridge/agent-files/command-center-plan.md") {
  return `command-${path || fallbackPath}`;
}

export function writeFileDraftInputsFromPayload(payload: JsonRecord, fallbackPath: string): WriteFileDraftInput[] {
  const sharedAccessProfile = asString(payload.access_profile, "workspace") || "workspace";
  const sharedMode = asString(payload.mode, "append") || "append";
  const sharedExpectedSha = asString(payload.expected_sha256, asString(payload.expected_hash));
  const sharedRequestId = asString(payload.request_id);
  const fileRecords = asRecordList(payload.files);
  if (fileRecords.length) {
    return fileRecords.map((file, index) => {
      const path = asString(
        file.path,
        asString(file.target_path, asString(file.target_relative, "")),
      );
      const content = asString(file.content, asString(file.text));
      const mode = asString(file.mode, sharedMode) || sharedMode;
      const accessProfile = asString(file.access_profile, sharedAccessProfile) || sharedAccessProfile;
      return {
        path,
        mode,
        content,
        accessProfile,
        oldSha256: asString(file.expected_sha256, asString(file.expected_hash, sharedExpectedSha)),
        requestId: asString(file.request_id, sharedRequestId || `file-${index + 1}`),
        payload: {
          ...payload,
          ...file,
          path,
          mode,
          access_profile: accessProfile,
          content,
        },
      };
    }).filter((item) => item.path && item.content.trim());
  }
  const path = asString(
    payload.path,
    asString(payload.target_path, asString(payload.target_relative, fallbackPath)),
  ) || fallbackPath;
  const content = asString(payload.content, asString(payload.text, ""));
  if (!path || !content.trim()) return [];
  return [{
    path,
    mode: sharedMode,
    content,
    accessProfile: sharedAccessProfile,
    oldSha256: sharedExpectedSha,
    requestId: sharedRequestId,
    payload: {
      ...payload,
      path,
      mode: sharedMode,
      access_profile: sharedAccessProfile,
      content,
    },
  }];
}

export function buildWriteFileDiffDraftFromPayload(params: {
  payload: JsonRecord;
  fallbackPath: string;
  purpose?: string;
  requestId?: string;
  round?: number;
  hunkId?: (input: WriteFileDraftInput, index: number) => string;
}): WriteFileDiffDraft | null {
  const draftInputs = writeFileDraftInputsFromPayload(params.payload, params.fallbackPath);
  if (!draftInputs.length) return null;
  const purpose = (params.purpose || "AI 请求写入文件").replace(/\r?\n/g, " ").trim();
  const hunks = draftInputs.map((item, index): WriteFileDiffHunk => {
    const contentLines = item.content.replace(/\r\n/g, "\n").split("\n").slice(0, 220);
    return {
      id: params.hunkId?.(item, index) || `write-file-diff-${index + 1}`,
      fileId: commandFileIdFromPath(item.path, params.fallbackPath),
      targetPath: item.path,
      mode: item.mode,
      accessProfile: item.accessProfile,
      oldSha256: item.oldSha256,
      requestId: item.requestId || params.requestId || "",
      title: `${pathBaseName(item.path)} · ${item.mode}`,
      status: "pending",
      writeContent: item.content,
      content: [
        `--- ${item.path}`,
        `+++ ${item.path}`,
        `@@ AI write_file proposal · ${item.mode} · file ${index + 1}/${draftInputs.length} @@`,
        `+<!-- 来源：AI write_file bridge-request${params.round ? ` · 第 ${params.round} 轮` : ""} -->`,
        purpose ? `+<!-- 目的：${purpose} -->` : "",
        ...contentLines.map((line) => `+${line}`),
        contentLines.length >= 220 ? "+...内容过长，Diff 草案已截断；完整写入仍需重新审查 payload。" : "",
      ].filter(Boolean).join("\n"),
    };
  });
  const targetPaths = draftInputs.map((item) => item.path);
  return {
    status: "draft",
    decision: "等待审查 Diff",
    detail: `AI 请求 write_file：${draftInputs.length} 个文件、${hunks.length} 个待审 hunk；尚未写入。`,
    planItems: [
      { label: "捕获 write_file", status: "ready", detail: purpose },
      { label: "生成多文件 Diff 草案", status: "draft", detail: targetPaths.join(" / ") },
      { label: "人工审查", status: "pending", detail: "接受或拒绝 hunk。" },
      { label: "文件级写入审批", status: "approval_required", detail: "每个文件接受 hunk 后分别提交 write_file 审批。" },
    ],
    request: params.payload,
    proposal: {
      target_path: targetPaths[0] || params.fallbackPath,
      target_relative: targetPaths[0] || params.fallbackPath,
      files: draftInputs.map((item) => ({
        path: item.path,
        mode: item.mode,
        access_profile: item.accessProfile,
        old_sha256: item.oldSha256,
        request_id: item.requestId || params.requestId || "",
      })),
      mode: draftInputs[0]?.mode || "append",
      old_sha256: draftInputs[0]?.oldSha256 || "",
      source: "ai_write_file_bridge_request",
      request_id: params.requestId || "",
    },
    hunks,
    targetPaths,
  };
}

export interface WorkspaceReadPreviewSnapshot {
  status: string;
  path: string;
  targetPath: string;
  content: string;
}

export interface WorkspaceReadPreviewAttachmentInput {
  preview: WorkspaceReadPreviewSnapshot;
  title?: string;
  maxChars?: number;
}

export interface WorkspaceReadPreviewAttachmentDraft {
  attachment: {
    kind: "file";
    title: string;
    detail: string;
    ref: string;
    source: string;
    status: string;
  };
  previewText: string;
  totalChars: number;
  truncated: boolean;
}

export interface WorkspacePreviewDiffDraftInput {
  preview: WorkspaceReadPreviewSnapshot;
  taskText: string;
  hunkId: string;
  fallbackTargetPath?: string;
  sourcePreviewChars?: number;
  sourcePreviewLines?: number;
}

export interface WorkspacePreviewDiffHunk {
  id: string;
  fileId: string;
  targetPath: string;
  mode: "append";
  accessProfile: "workspace";
  title: string;
  status: "pending";
  writeContent: string;
  content: string;
}

export interface WorkspacePreviewDiffDraft {
  targetPath: string;
  sourcePath: string;
  taskText: string;
  hunk: WorkspacePreviewDiffHunk;
  approval: {
    status: "draft";
    decision: string;
    detail: string;
    at: number;
    planItems: Array<{ label: string; status: string; detail: string }>;
    request: null;
    proposal: {
      target_path: string;
      target_relative: string;
      mode: "append";
      source: "read_file_preview";
      source_path: string;
    };
    writeRequest: null;
    writeResult: null;
  };
}

function formatPreviewNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 1 : 2)}万`;
  return String(value);
}

function pathBaseName(value: string) {
  return value.split(/[\\/]/).filter(Boolean).pop() || value || "未命名文件";
}

function commandFileIdFromPath(path: string) {
  return `command-${path || "bridge/agent-files/command-center-plan.md"}`;
}

function commandWriteContentFromDraft(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const additions = lines
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
  if (additions.length) return additions.join("\n").trimEnd();
  return lines
    .filter((line) => !line.startsWith("@@") && !line.startsWith("--- ") && !line.startsWith("+++ "))
    .join("\n")
    .trimEnd();
}

export function buildWorkspaceReadPreviewAttachment(
  input: WorkspaceReadPreviewAttachmentInput,
): WorkspaceReadPreviewAttachmentDraft {
  const maxChars = input.maxChars ?? 1800;
  const content = input.preview.content || "";
  const previewText = content.slice(0, maxChars);
  const truncated = content.length > previewText.length;
  const sourcePath = input.preview.path || "unknown";
  const targetPath = input.preview.targetPath || "unknown";
  return {
    attachment: {
      kind: "file",
      title: input.title || sourcePath || "真实文件预览",
      detail: [
        `路径：${sourcePath}`,
        `读取目标：${targetPath}`,
        `正文片段：${formatPreviewNumber(content.length)} 字符，已截取前 ${formatPreviewNumber(previewText.length)} 字符进入线程上下文。`,
        "",
        "```text",
        previewText,
        truncated ? "\n...预览已截断，完整正文未持久保存。" : "",
        "```",
      ].filter((line) => line !== undefined && line !== null).join("\n"),
      ref: input.preview.targetPath || input.preview.path,
      source: "Gateway read_file 预览",
      status: input.preview.status || "read",
    },
    previewText,
    totalChars: content.length,
    truncated,
  };
}

export function buildWorkspacePreviewDiffDraft(input: WorkspacePreviewDiffDraftInput): WorkspacePreviewDiffDraft {
  const targetPath = input.preview.targetPath || input.preview.path || input.fallbackTargetPath || "workspace-preview.txt";
  const sourcePath = input.preview.path || targetPath;
  const taskText = (input.taskText.trim() || "请在这里填写基于已读文件的修改说明。").slice(0, 900);
  const sourcePreviewChars = input.sourcePreviewChars ?? 900;
  const sourcePreviewLines = input.sourcePreviewLines ?? 28;
  const sourcePreview = (input.preview.content || "").slice(0, sourcePreviewChars);
  const draftContent = [
    `--- ${targetPath}`,
    `+++ ${targetPath}`,
    "@@ Agent proposed draft @@",
    `+<!-- Agent Diff 草案：基于 ${sourcePath} 的 read_file 预览生成。 -->`,
    `+<!-- 当前任务：${taskText.replace(/\r?\n/g, " ").trim()} -->`,
    "+",
    "+## 建议修改",
    "+",
    "+请让 AI 根据已读取的文件正文继续生成具体修改，或手动编辑此草案后再进入 write_file 审批。",
    "+",
    "+## 已读文件片段",
    ...sourcePreview.split(/\r?\n/).slice(0, sourcePreviewLines).map((line) => `+${line}`),
    input.preview.content.length > sourcePreview.length ? "+...预览已截断，完整文件仍需再次 read_file。" : "",
  ].filter(Boolean).join("\n");
  const hunk: WorkspacePreviewDiffHunk = {
    id: input.hunkId,
    fileId: commandFileIdFromPath(targetPath),
    targetPath,
    mode: "append",
    accessProfile: "workspace",
    title: `基于 ${pathBaseName(targetPath)} 的修改草案`,
    status: "pending",
    writeContent: commandWriteContentFromDraft(draftContent),
    content: draftContent,
  };
  return {
    targetPath,
    sourcePath,
    taskText,
    hunk,
    approval: {
      status: "draft",
      decision: "等待审查 Diff",
      detail: `已根据 ${sourcePath} 生成 1 个待审 hunk；接受后可进入 write_file 审批。`,
      at: Date.now(),
      planItems: [
        { label: "读取文件", status: "ready", detail: sourcePath },
        { label: "生成 Diff 草案", status: "draft", detail: "当前只生成待审 hunk，不写入磁盘。" },
        { label: "人工审查", status: "pending", detail: "接受或拒绝 hunk。" },
        { label: "写入审批", status: "approval_required", detail: "只有接受 hunk 后才可提交 write_file 审批。" },
      ],
      request: null,
      proposal: {
        target_path: targetPath,
        target_relative: targetPath,
        mode: "append",
        source: "read_file_preview",
        source_path: sourcePath,
      },
      writeRequest: null,
      writeResult: null,
    },
  };
}

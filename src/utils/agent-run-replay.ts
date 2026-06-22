export type AgentRunReplayKind = "request" | "assistant" | "tool" | "approval" | "diff" | "worker" | "result";

export interface AgentRunReplayInputRow {
  id: string;
  kind: string;
  label: string;
  title: string;
  detail: string;
  status: string;
  at: number;
  source: string;
  ref?: string;
  meta?: string[];
}

export interface AgentRunReplayItem {
  id: string;
  kind: AgentRunReplayKind;
  phase: string;
  title: string;
  detail: string;
  nextStep: string;
  status: string;
  at: number;
  source: string;
  ref?: string;
  meta: string[];
}

export interface AgentRunReplayMarkdownOptions {
  limit?: number;
  detailLimit?: number;
  formatDateTime?: (value: unknown) => string;
  title?: string;
}

export interface AgentLoopToolReplayResultLike {
  requestId?: string;
  action: string;
  purpose?: string;
  status: string;
  resultText?: string;
  resultJson?: Record<string, unknown>;
  reviewGate?: string;
  approvalId?: string;
  runId?: string;
  at: number;
}

export interface AgentDirectChatToolReplayResultLike {
  action: string;
  status: string;
  detail: string;
  result?: Record<string, unknown> | null;
}

function normalizeText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function compactReplayJson(value: Record<string, unknown> | undefined, limit = 900) {
  if (!value || !Object.keys(value).length) return "";
  return JSON.stringify(value, null, 2).slice(0, limit);
}

function toolPathMeta(action: string, resultJson: Record<string, unknown>) {
  const nestedScan = asRecord(resultJson.workspace_scan);
  const target = asString(resultJson.target, asString(resultJson.path));
  const root = action === "workspace_scan"
    ? asString(nestedScan.root, asString(resultJson.root, target))
    : "";
  const rootInput = action === "workspace_scan"
    ? asString(nestedScan.root_input, asString(resultJson.root_input))
    : "";
  const fileCount = action === "workspace_scan"
    ? asString(nestedScan.file_count, asString(resultJson.file_count))
    : "";
  const path = action === "read_file" ? target : "";
  return {
    detail: [
      path ? `路径：${path}` : "",
      root ? `扫描根：${root}` : "",
      rootInput && rootInput !== root ? `输入根：${rootInput}` : "",
      fileCount ? `文件数：${fileCount}` : "",
    ].filter(Boolean),
    meta: [
      path ? `path:${path}` : "",
      root ? `root:${root}` : "",
      rootInput && rootInput !== root ? `root_input:${rootInput}` : "",
      fileCount ? `files:${fileCount}` : "",
    ].filter(Boolean),
  };
}

function classifyReplayKind(row: AgentRunReplayInputRow): AgentRunReplayKind {
  const text = `${row.kind}\n${row.label}\n${row.title}\n${row.detail}\n${row.source}`.toLowerCase();
  if (row.label.includes("用户") || row.id.startsWith("message:") && row.source === "message" && row.label.includes("消息")) return "request";
  if (row.label.includes("Agent 回复") || row.label.includes("AI 回复") || text.includes("assistant")) return "assistant";
  if (row.kind === "approvals" || text.includes("审批") || text.includes("approval")) return "approval";
  if (row.kind === "diffs" || text.includes("diff") || text.includes("变更")) return "diff";
  if (row.kind === "workers" || text.includes("worker") || text.includes("后台")) return "worker";
  if (text.includes("完成") || text.includes("result") || text.includes("执行证据") || text.includes("stdout") || text.includes("stderr")) return "result";
  return "tool";
}

function phaseFromKind(kind: AgentRunReplayKind) {
  const labels: Record<AgentRunReplayKind, string> = {
    request: "用户请求",
    assistant: "模型思考",
    tool: "工具调用",
    approval: "审批审查",
    diff: "变更审查",
    worker: "后台执行",
    result: "结果复核",
  };
  return labels[kind];
}

function compactDetail(value: string, limit: number) {
  const text = value.trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function stripNextStepPrefix(value: string) {
  return value.replace(/^下一步\s*[：:]\s*/, "").trim();
}

function replayNextStepForStatus(input: {
  kind: AgentRunReplayKind;
  status: string;
  title: string;
  detail: string;
  meta: string[];
}) {
  const status = input.status.toLowerCase();
  const text = `${input.kind}\n${input.status}\n${input.title}\n${input.detail}\n${input.meta.join("\n")}`.toLowerCase();
  if (input.kind === "approval" || status.includes("approval") || status.includes("waiting_approval") || text.includes("审批")) {
    return "到审批面板确认、拒绝或等待人工处理。";
  }
  if (input.kind === "diff" || status.includes("diff") || text.includes("changes / diff") || text.includes("hunk")) {
    return "到变更 / Diff 面板逐项审查 hunk。";
  }
  if (status.includes("error") || status.includes("blocked") || status.includes("failed") || status.includes("validation")) {
    return "检查错误原因，调整请求或配置后重试。";
  }
  if (status.includes("partial")) {
    return "先处理部分失败项，再让模型继续推理。";
  }
  if (status.includes("queued") || status.includes("running") || status.includes("pending")) {
    return "等待执行返回，必要时查看实时日志或取消任务。";
  }
  if (input.kind === "request") {
    return "交给模型规划；如需要本地能力，会进入 Gateway / Diff / 审批链路。";
  }
  if (input.kind === "assistant") {
    return "查看模型回复；如包含工具请求，继续交给 Gateway 执行并回灌结果。";
  }
  if (input.kind === "worker") {
    return "Worker 结果已回灌，可继续复核证据或让模型续写。";
  }
  if (input.kind === "result") {
    return "证据已保留，可继续复核结果或让模型收尾。";
  }
  return "结果已回灌，模型可以基于证据继续推理。";
}

function detailWithNextStep(detail: string, nextStep: string) {
  if (!nextStep || /下一步\s*[：:]/.test(detail)) return detail;
  return [detail, `下一步：${stripNextStepPrefix(nextStep)}`].filter(Boolean).join("\n");
}

export function buildAgentRunReplayTimeline(rows: AgentRunReplayInputRow[], options: { limit?: number; detailLimit?: number } = {}) {
  const limit = Math.max(1, options.limit || 40);
  const detailLimit = Math.max(120, options.detailLimit || 900);
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => a.at - b.at)
    .flatMap((row): AgentRunReplayItem[] => {
      const kind = classifyReplayKind(row);
      const title = normalizeText(row.title || row.label || kind);
      const rawDetail = compactDetail(row.detail || row.ref || "无详情", detailLimit);
      const meta = row.meta || [];
      const nextStep = replayNextStepForStatus({
        kind,
        status: row.status || "recorded",
        title,
        detail: rawDetail,
        meta,
      });
      const detail = detailWithNextStep(rawDetail, nextStep);
      const dedupeKey = [
        Math.floor((row.at || 0) / 1000),
        kind,
        title,
        normalizeText(detail).slice(0, 180),
        row.status,
      ].join("|");
      if (seen.has(dedupeKey)) return [];
      seen.add(dedupeKey);
      return [{
        id: row.id,
        kind,
        phase: phaseFromKind(kind),
        title,
        detail,
        nextStep,
        status: row.status || "recorded",
        at: row.at || 0,
        source: row.source || "thread",
        ref: row.ref,
        meta,
      }];
    })
    .slice(0, limit);
}

export function buildAgentLoopToolReplayRows(
  results: AgentLoopToolReplayResultLike[] = [],
  options: { source?: string; refPrefix?: string; detailLimit?: number } = {},
): AgentRunReplayInputRow[] {
  const source = options.source || "agent_loop";
  const refPrefix = options.refPrefix || "agent-loop-tool";
  const detailLimit = Math.max(240, options.detailLimit || 1200);
  return results.map((tool, index) => {
    const isContextPack = tool.action === "context_pack";
    const resultJson = asRecord(tool.resultJson);
    const requestId = tool.requestId || asString(resultJson.request_id, asString(resultJson.requestId));
    const approvalId = tool.approvalId || asString(resultJson.approval_id, asString(resultJson.approvalId));
    const runId = tool.runId || asString(resultJson.run_id, asString(resultJson.runId));
    const pathMeta = toolPathMeta(tool.action, resultJson);
    const ref = runId || approvalId || requestId || `${refPrefix}-${tool.action}-${tool.at || index}`;
    const resultText = asString(tool.resultText);
    const jsonPreview = compactReplayJson(resultJson, detailLimit);
    const rowKind = tool.reviewGate === "changes_diff" || tool.status === "diff_draft" ? "diffs" : approvalId ? "approvals" : "tools";
    const replayKind: AgentRunReplayKind = rowKind === "diffs" ? "diff" : rowKind === "approvals" ? "approval" : "tool";
    const title = isContextPack ? "Agent Loop · context_pack 上下文" : `Agent Loop · ${tool.action}`;
    const meta = [
      requestId ? `request:${requestId}` : "",
      tool.purpose ? `purpose:${tool.purpose}` : "",
      approvalId ? `approval:${approvalId}` : "",
      runId ? `run:${runId}` : "",
      tool.reviewGate ? `review:${tool.reviewGate}` : "",
      isContextPack ? "phase:context_pack" : "",
      ...pathMeta.meta,
    ].filter(Boolean);
    const rawDetail = [
      requestId ? `请求：${requestId}` : "",
      tool.purpose ? `目的：${tool.purpose}` : "",
      approvalId ? `审批：${approvalId}` : "",
      runId ? `运行：${runId}` : "",
      tool.reviewGate ? `审查门：${tool.reviewGate}` : "",
      ...pathMeta.detail,
      resultText,
      !resultText && jsonPreview ? jsonPreview : "",
    ].filter(Boolean).join("\n").slice(0, detailLimit);
    const detail = detailWithNextStep(rawDetail || "Agent Loop 工具已返回空结果。", replayNextStepForStatus({
      kind: replayKind,
      status: tool.status || "unknown",
      title,
      detail: rawDetail,
      meta,
    }));
    return {
      id: `${refPrefix}:${tool.action}:${tool.at || index}:${index}`,
      kind: rowKind,
      label: rowKind === "diffs"
        ? "Agent Loop Diff"
        : rowKind === "approvals"
          ? "Agent Loop 审批"
          : isContextPack
            ? "Agent Loop 上下文打包"
            : "Agent Loop 工具结果",
      title,
      detail,
      status: tool.status || "unknown",
      at: tool.at || 0,
      source,
      ref,
      meta,
    };
  });
}

export function buildAgentDirectChatToolReplayRows(
  results: AgentDirectChatToolReplayResultLike[] = [],
  options: { round?: number; source?: string; refPrefix?: string; at?: number; detailLimit?: number } = {},
): AgentRunReplayInputRow[] {
  const round = Math.max(1, options.round || 1);
  const at = options.at || Date.now();
  const refPrefix = options.refPrefix || `direct-chat-round-${round}`;
  return buildAgentLoopToolReplayRows(results.map((tool, index): AgentLoopToolReplayResultLike => {
    const resultJson = asRecord(tool.result);
    const requestId = asString(resultJson.request_id, asString(resultJson.requestId));
    const approvalId = asString(resultJson.approval_id, asString(resultJson.approvalId));
    const runId = asString(resultJson.run_id, asString(resultJson.runId));
    const reviewGate = tool.status === "diff_draft"
      ? "changes_diff"
      : asString(resultJson.review_gate, asString(resultJson.reviewGate));
    const jsonPreview = compactReplayJson(resultJson, options.detailLimit || 900);
    const resultText = [
      tool.detail,
      jsonPreview && !normalizeText(tool.detail).includes(normalizeText(jsonPreview).slice(0, 80)) ? jsonPreview : "",
    ].filter(Boolean).join("\n");
    return {
      action: tool.action,
      purpose: `直接对话第 ${round} 轮工具回灌`,
      status: tool.status,
      resultText,
      resultJson,
      requestId,
      reviewGate,
      approvalId,
      runId,
      at: at + index,
    };
  }), {
    source: options.source || "direct_chat",
    refPrefix,
    detailLimit: options.detailLimit,
  }).map((row) => ({
    ...row,
    label: row.kind === "diffs" ? "直接对话 Diff" : row.kind === "approvals" ? "直接对话审批" : "直接对话工具结果",
    title: row.title.replace(/^Agent Loop · /, "直接对话 · "),
    source: options.source || "direct_chat",
  }));
}

function defaultFormatDateTime(value: unknown) {
  const raw = typeof value === "number" ? value : Number(value);
  const time = Number.isFinite(raw) && raw > 0 ? raw : Date.parse(String(value || ""));
  if (!Number.isFinite(time)) return "未记录";
  return new Date(time).toLocaleString("zh-CN");
}

function markdownBlock(value: unknown, fallback = "无详情", maxLength = 1600) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n\n...已截断，本地线程仍保留完整摘要。` : text;
}

export function buildAgentRunReplayMarkdown(rows: AgentRunReplayInputRow[], options: AgentRunReplayMarkdownOptions = {}) {
  const formatDateTime = options.formatDateTime || defaultFormatDateTime;
  const detailLimit = Math.max(120, options.detailLimit || 780);
  const replayTimeline = buildAgentRunReplayTimeline(rows, {
    limit: options.limit || 36,
    detailLimit,
  });
  const lines = [
    `## ${options.title || "任务回放"}`,
    "",
    ...(replayTimeline.length ? replayTimeline.map((item, index) => [
      `### ${index + 1}. ${item.phase} · ${item.title}`,
      "",
      `- 时间: ${formatDateTime(item.at)}`,
      `- 状态: ${item.status}`,
      `- 来源: ${item.source}`,
      item.ref ? `- 引用: ${item.ref}` : "",
      item.meta.length ? `- 标记: ${item.meta.join(" / ")}` : "",
      item.nextStep ? `- 下一步: ${item.nextStep}` : "",
      "",
      markdownBlock(item.detail, "无详情", detailLimit),
      "",
    ].filter(Boolean).join("\n")) : ["暂无任务回放。", ""]),
  ];
  return lines.join("\n");
}

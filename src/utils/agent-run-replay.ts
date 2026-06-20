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

export function buildAgentRunReplayTimeline(rows: AgentRunReplayInputRow[], options: { limit?: number; detailLimit?: number } = {}) {
  const limit = Math.max(1, options.limit || 40);
  const detailLimit = Math.max(120, options.detailLimit || 900);
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => a.at - b.at)
    .flatMap((row): AgentRunReplayItem[] => {
      const kind = classifyReplayKind(row);
      const title = normalizeText(row.title || row.label || kind);
      const detail = compactDetail(row.detail || row.ref || "无详情", detailLimit);
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
        status: row.status || "recorded",
        at: row.at || 0,
        source: row.source || "thread",
        ref: row.ref,
        meta: row.meta || [],
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
    const resultJson = asRecord(tool.resultJson);
    const approvalId = tool.approvalId || asString(resultJson.approval_id, asString(resultJson.approvalId));
    const runId = tool.runId || asString(resultJson.run_id, asString(resultJson.runId));
    const ref = runId || approvalId || `${refPrefix}-${tool.action}-${tool.at || index}`;
    const resultText = asString(tool.resultText);
    const jsonPreview = compactReplayJson(resultJson, detailLimit);
    const detail = [
      tool.purpose ? `目的：${tool.purpose}` : "",
      approvalId ? `审批：${approvalId}` : "",
      runId ? `运行：${runId}` : "",
      tool.reviewGate ? `审查门：${tool.reviewGate}` : "",
      resultText,
      !resultText && jsonPreview ? jsonPreview : "",
    ].filter(Boolean).join("\n").slice(0, detailLimit);
    return {
      id: `${refPrefix}:${tool.action}:${tool.at || index}:${index}`,
      kind: tool.reviewGate === "changes_diff" || tool.status === "diff_draft" ? "diffs" : approvalId ? "approvals" : "tools",
      label: tool.reviewGate === "changes_diff" || tool.status === "diff_draft" ? "Agent Loop Diff" : approvalId ? "Agent Loop 审批" : "Agent Loop 工具结果",
      title: `Agent Loop · ${tool.action}`,
      detail: detail || "Agent Loop 工具已返回空结果。",
      status: tool.status || "unknown",
      at: tool.at || 0,
      source,
      ref,
      meta: [
        tool.purpose ? `purpose:${tool.purpose}` : "",
        approvalId ? `approval:${approvalId}` : "",
        runId ? `run:${runId}` : "",
        tool.reviewGate ? `review:${tool.reviewGate}` : "",
      ].filter(Boolean),
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
      "",
      markdownBlock(item.detail, "无详情", detailLimit),
      "",
    ].filter(Boolean).join("\n")) : ["暂无任务回放。", ""]),
  ];
  return lines.join("\n");
}

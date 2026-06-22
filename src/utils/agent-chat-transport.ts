import { type ChatContent, type ChatMessage } from "../store/settings";

export interface AgentChatAttachmentLike {
  kind: "image" | "file";
  name: string;
  mimeType?: string;
  size?: number;
  dataUrl?: string;
  textPreview?: string;
  parseStatus?: "parsed" | "metadata" | "failed";
  parser?: string;
  warning?: string;
}

interface RetryMessageLike {
  content: string;
  task?: string;
  attachments?: unknown[];
}
interface AgentChatHistoryMessageLike {
  role: string;
  content: string;
  attachments?: AgentChatAttachmentLike[];
}

export interface AgentThreadContextItemLike {
  id?: unknown;
  kind?: unknown;
  dimension?: unknown;
  title?: unknown;
  summary?: unknown;
  detail?: unknown;
  content?: unknown;
  source?: unknown;
  ref?: unknown;
  status?: unknown;
}

export interface AgentChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface AgentChatRequestReceipt {
  textPartCount: number;
  textChars: number;
  imagePartCount: number;
  imageWireFormat: string;
  attachmentCount: number;
  parsedFileCount: number;
  imageAttachmentCount: number;
  historyCount: number;
  contextItemCount: number;
}

export interface AgentAttachmentTransportEvent {
  attachmentCount: number;
  imageAttachmentCount: number;
  parsedFileCount: number;
  metadataFileCount: number;
  failedFileCount: number;
  summary: string;
  compactSummary: string;
  detail: string;
  hasModelPayload: boolean;
}

export interface AgentDirectChatFallbackDecision {
  shouldFallbackToWorker: boolean;
  reason: string;
  userDetail: string;
}

export interface AgentEmptyReplyDecision {
  ok: boolean;
  status: "completed" | "empty";
  detail: string;
}

interface AgentBridgeRequestLike {
  action: string;
  id?: string;
  purpose?: string;
  mode?: string;
  approvalRequired?: boolean;
  validation?: Array<{ severity?: string }>;
}

export interface AgentBridgeRequestSummary {
  requestCount: number;
  actions: string[];
  actionText: string;
  hasRequests: boolean;
  sidePanelDetail: string;
}

export interface AgentBridgeLoopSummary {
  roundCount: number;
  requestTotal: number;
  remainingCount: number;
  hitLimit: boolean;
  chatDetail: string;
  blockedDetail: string;
  completionStatus: "completed" | "blocked";
}

export interface AgentBridgeToolResultLike {
  action: string;
  status: string;
  detail: string;
  result: Record<string, unknown> | null;
}

export interface AgentBridgeToolResultReplay {
  toolResultText: string;
  conversationPrompt: string;
}

export interface AgentBridgeToolResultSummaryOptions {
  statusLabel?: (status: string) => string;
  compactApprovalId?: (id: string) => string;
}

export interface AgentBridgeRequestContextHint {
  source: "direct_chat";
  action: string;
  purpose: string;
  requestId: string;
  round: number;
  requestIndex: number;
  requestCount: number;
}

export interface AgentBridgeRequestTraceRecord {
  request_id: string;
  action: string;
  purpose: string;
  round: number;
  request_index: number;
  request_count: number;
  mode: string;
  approval_required: boolean;
  validation_blocks: number;
  validation_warnings: number;
}

export interface AgentBridgeRequestDisplaySummaryOptions {
  sanitizePurpose?: (purpose: string) => string;
}

export function agentRetryTextFromMessage(message: RetryMessageLike) {
  const content = message.content.trim();
  const placeholderContent = /^(已附加图片\/文件上下文。?|已附加图片\/文件上下文|附件消息)$/i.test(content);
  const fallbackForAttachmentOnly = message.attachments?.length
    ? "请根据已附加的图片/文件上下文继续分析。"
    : "";
  return (message.task || (placeholderContent ? "" : content) || fallbackForAttachmentOnly).trim();
}

function formatBytes(value?: number) {
  const safe = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (safe >= 10000) return `${(safe / 10000).toFixed(safe >= 100000 ? 1 : 2)}万`;
  return String(safe);
}

function attachmentParseLabel(attachment: AgentChatAttachmentLike) {
  if (attachment.kind === "image") return "图片输入";
  if (attachment.parseStatus === "parsed") return attachment.parser || "已解析文本";
  if (attachment.parseStatus === "failed") return attachment.parser ? `${attachment.parser} 失败` : "解析失败";
  return attachment.warning || "仅元数据";
}

function attachmentDeliveryLabel(attachment: AgentChatAttachmentLike) {
  if (attachment.kind === "image" && attachment.dataUrl) return "多模态图片";
  if (attachment.kind === "image") return "图片摘要";
  if (attachment.parseStatus === "parsed") return "文本片段";
  if (attachment.parseStatus === "metadata") return "仅元数据";
  if (attachment.parseStatus === "failed") return "仅保留文件信息";
  return "附件上下文";
}

function asContextString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

export function buildAgentThreadContextText(items: AgentThreadContextItemLike[] = [], maxChars = 6000) {
  if (!items.length) return "";
  const safeMaxChars = Math.max(0, Math.floor(maxChars));
  if (!safeMaxChars) return "";
  const lines = items.slice(0, 8).map((item, index) => {
    const kind = asContextString(item.kind, asContextString(item.dimension, "context"));
    const title = asContextString(item.title, `上下文 ${index + 1}`);
    const summary = asContextString(item.summary, asContextString(item.detail, asContextString(item.content, ""))).slice(0, 900);
    const source = asContextString(item.source);
    const ref = asContextString(item.ref, asContextString(item.id));
    const status = asContextString(item.status);
    return [
      `${index + 1}. [${kind}] ${title}`,
      [source ? `来源：${source}` : "", ref ? `ref=${ref}` : "", status ? `状态：${status}` : ""].filter(Boolean).join(" · "),
      summary,
    ].filter(Boolean).join("\n");
  });
  return `[当前线程上下文]\n${lines.join("\n\n")}`.slice(0, safeMaxChars);
}

export function agentChatAttachmentSummaryText(attachments: AgentChatAttachmentLike[] = []) {
  if (!attachments.length) return "";
  return attachments.map((item) => {
    const size = `${formatBytes(item.size)} bytes`;
    const parse = attachmentParseLabel(item);
    const delivery = attachmentDeliveryLabel(item);
    const preview = item.textPreview ? `\n${item.textPreview.slice(0, 1200)}` : "";
    const warning = item.warning ? `\n提示：${item.warning}` : "";
    return `[${item.kind}] ${item.name} · ${item.mimeType || "unknown"} · ${size} · ${parse} · ${delivery}${preview}${warning}`;
  }).join("\n\n");
}

export function buildAgentAttachmentTransportEvent(attachments: AgentChatAttachmentLike[] = []): AgentAttachmentTransportEvent {
  const imageAttachmentCount = attachments.filter((item) => item.kind === "image" && item.dataUrl).length;
  const parsedFileCount = attachments.filter((item) => item.kind === "file" && item.parseStatus === "parsed").length;
  const metadataFileCount = attachments.filter((item) => item.kind === "file" && item.parseStatus === "metadata").length;
  const failedFileCount = attachments.filter((item) => item.kind === "file" && item.parseStatus === "failed").length;
  const summary = [
    imageAttachmentCount ? `${imageAttachmentCount} 张图片` : "",
    parsedFileCount ? `${parsedFileCount} 个文件文本片段` : "",
    metadataFileCount ? `${metadataFileCount} 个文件仅元数据` : "",
    failedFileCount ? `${failedFileCount} 个文件解析失败` : "",
  ].filter(Boolean).join(" · ") || (attachments.length ? `${attachments.length} 个附件` : "纯文本");
  const compactSummary = [
    imageAttachmentCount ? `${imageAttachmentCount} 图片` : "",
    parsedFileCount ? `${parsedFileCount} 文本` : "",
    metadataFileCount ? `${metadataFileCount} 元数据` : "",
    failedFileCount ? `${failedFileCount} 失败` : "",
  ].filter(Boolean).join(" / ") || (attachments.length ? `${attachments.length} 个` : "0");
  const detail = [
    imageAttachmentCount ? `${imageAttachmentCount} 张图片作为多模态 part 发送；模型需要支持视觉输入。` : "",
    parsedFileCount ? `${parsedFileCount} 个文件片段进入文本上下文。` : "",
    metadataFileCount || failedFileCount ? "元数据/解析失败的文件只进入摘要，不假装已读取正文。" : "",
  ].filter(Boolean).join(" ");
  return {
    attachmentCount: attachments.length,
    imageAttachmentCount,
    parsedFileCount,
    metadataFileCount,
    failedFileCount,
    summary,
    compactSummary,
    detail,
    hasModelPayload: Boolean(imageAttachmentCount || parsedFileCount),
  };
}

export function decideAgentDirectChatFallback(input: {
  aborted: boolean;
  gatewayOnline: boolean;
  authFailure: boolean;
  attachments?: AgentChatAttachmentLike[];
}): AgentDirectChatFallbackDecision {
  if (input.aborted) {
    return {
      shouldFallbackToWorker: false,
      reason: "aborted",
      userDetail: "用户已停止生成，不启动 Worker 兜底。",
    };
  }
  if (!input.gatewayOnline) {
    return {
      shouldFallbackToWorker: false,
      reason: "gateway_offline",
      userDetail: "Gateway 未在线，无法切换到模型 Worker。",
    };
  }
  if (input.authFailure) {
    return {
      shouldFallbackToWorker: false,
      reason: "auth_failure",
      userDetail: "模型密钥或权限失败，需要先修复配置，不启动 Worker 兜底。",
    };
  }
  const hasImage = Boolean((input.attachments || []).some((item) => item.kind === "image" && item.dataUrl));
  if (hasImage) {
    return {
      shouldFallbackToWorker: false,
      reason: "image_multimodal_requires_direct_provider",
      userDetail: "本次包含图片，多模态输入必须由支持视觉的 Provider 处理；不会降级成只含文字摘要的 Worker 回复。",
    };
  }
  return {
    shouldFallbackToWorker: true,
    reason: "text_fallback_allowed",
    userDetail: "文本对话可切换到 Gateway 模型 Worker 兜底。",
  };
}

export function decideAgentModelReplyContent(value: string): AgentEmptyReplyDecision {
  if (value.trim()) {
    return {
      ok: true,
      status: "completed",
      detail: "模型已返回可显示内容。",
    };
  }
  return {
    ok: false,
    status: "empty",
    detail: "模型没有返回可显示内容；本次不标记为完成，请检查模型输出、流式接口或重试。",
  };
}

export function buildAgentBridgeRequestSummary(requests: AgentBridgeRequestLike[] = []): AgentBridgeRequestSummary {
  const actions = requests.map((request) => request.action).filter(Boolean);
  const actionText = actions.join(" / ");
  return {
    requestCount: requests.length,
    actions,
    actionText,
    hasRequests: requests.length > 0,
    sidePanelDetail: requests.length
      ? `模型请求本地工具：${actionText || `${requests.length} 个请求`}；已打开右侧轨迹面板。`
      : "",
  };
}

export function buildAgentBridgeRequestContextHint(
  request: AgentBridgeRequestLike,
  round: number,
  requestIndex: number,
  requestCount: number,
): AgentBridgeRequestContextHint {
  return {
    source: "direct_chat",
    action: request.action,
    purpose: request.purpose || "",
    requestId: request.id || "",
    round,
    requestIndex: requestIndex + 1,
    requestCount,
  };
}

export function buildAgentBridgeRequestTraceRecord(
  request: AgentBridgeRequestLike,
  round: number,
  requestIndex: number,
  requestCount: number,
): AgentBridgeRequestTraceRecord {
  const validation = request.validation || [];
  const validationBlocks = validation.filter((item) => item.severity === "block").length;
  const validationWarnings = validation.filter((item) => item.severity === "warn").length;
  return {
    request_id: request.id || "",
    action: request.action,
    purpose: request.purpose || "",
    round,
    request_index: requestIndex + 1,
    request_count: requestCount,
    mode: request.mode || "",
    approval_required: Boolean(request.approvalRequired),
    validation_blocks: validationBlocks,
    validation_warnings: validationWarnings,
  };
}

export function buildAgentBridgeRequestDisplaySummary(
  requests: AgentBridgeRequestLike[],
  options: AgentBridgeRequestDisplaySummaryOptions = {},
) {
  const sanitizePurpose = options.sanitizePurpose || ((purpose: string) => purpose);
  const nextStepForRequest = (trace: AgentBridgeRequestTraceRecord) => {
    if (trace.validation_blocks) return "下一步：先处理阻断校验，本次不应直接执行。";
    if (trace.approval_required) return "下一步：进入审批队列，等待用户确认或拒绝。";
    if (trace.action === "write_file") return "下一步：转成 Diff 草案，等待人工审查变更。";
    return "下一步：交给 Gateway 执行，并把结果回灌到当前对话。";
  };
  return requests.map((request, index) => {
    const trace = buildAgentBridgeRequestTraceRecord(request, 0, index, requests.length);
    const purpose = sanitizePurpose(trace.purpose);
    return [
      `${index + 1}. ${trace.action}`,
      purpose ? `目的：${purpose}` : "",
      `审批：${trace.approval_required ? "需要" : "不需要"}`,
      trace.validation_blocks || trace.validation_warnings
        ? `校验：${trace.validation_blocks} 阻断 / ${trace.validation_warnings} 警告`
        : "校验：通过",
      nextStepForRequest(trace),
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

export function buildAgentBridgeLoopSummary(input: {
  roundCount: number;
  requestTotal: number;
  remainingCount: number;
}): AgentBridgeLoopSummary {
  const hitLimit = input.requestTotal > 0 && input.remainingCount > 0;
  const chatDetail = hitLimit
    ? `工具循环达到上限：已跑 ${input.roundCount} 轮 / ${input.requestTotal} 个请求，仍有 ${input.remainingCount} 个请求未执行。`
    : input.requestTotal > 0
      ? `工具闭环完成：${input.roundCount} 轮 / ${input.requestTotal} 个请求`
      : "";
  return {
    roundCount: input.roundCount,
    requestTotal: input.requestTotal,
    remainingCount: input.remainingCount,
    hitLimit,
    chatDetail,
    blockedDetail: hitLimit
      ? `已执行 ${input.roundCount} 轮工具请求；续答仍包含 ${input.remainingCount} 个 bridge-request，等待用户继续或手动审批。`
      : "",
    completionStatus: hitLimit ? "blocked" : "completed",
  };
}

export function buildAgentBridgeToolResultReplay(input: {
  roundCount: number;
  toolResults: AgentBridgeToolResultLike[];
  maxBridgeRounds: number;
}): AgentBridgeToolResultReplay {
  const toolResultText = input.toolResults.map((item, index) => [
    `## 工具结果 ${index + 1}: ${item.action}`,
    `状态：${item.status}`,
    item.detail,
    item.result ? JSON.stringify(item.result, null, 2).slice(0, 4000) : "",
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");
  const conversationPrompt = [
    `下面是本地 Gateway 返回的第 ${input.roundCount} 轮工具结果。`,
    "请基于这些结果继续完成用户任务；如果工具被审批、阻塞或失败，请说明当前状态和下一步，不要假装已经完成。",
    input.roundCount < input.maxBridgeRounds
      ? "如果仍需要继续读取文件、查询状态或调用工具，可以继续输出新的 <bridge-request> JSON 标签。"
      : "这是当前直接对话允许的最后一轮工具回灌；如仍需更多工具，请明确说明剩余步骤。",
    "",
    toolResultText,
  ].join("\n");
  return {
    toolResultText,
    conversationPrompt,
  };
}

function agentBridgeResultId(result: Record<string, unknown> | null, snakeKey: string, camelKey: string) {
  const value = result?.[snakeKey] ?? result?.[camelKey] ?? "";
  return String(value || "").trim();
}

export function buildAgentBridgeToolResultSummary(
  items: AgentBridgeToolResultLike[],
  options: AgentBridgeToolResultSummaryOptions = {},
) {
  const labelStatus = options.statusLabel || ((status: string) => status || "unknown");
  const compactApproval = options.compactApprovalId || ((id: string) => id);
  const nextStepForResult = (item: AgentBridgeToolResultLike) => {
    const status = (item.status || "").toLowerCase();
    if (status.includes("approval") || status.includes("waiting_approval")) return "下一步：到审批面板确认、拒绝或等待人工处理。";
    if (status.includes("diff")) return "下一步：到变更 / Diff 面板逐项审查 hunk。";
    if (status.includes("error") || status.includes("blocked") || status.includes("failed")) return "下一步：检查错误原因，调整请求或配置后重试。";
    if (status.includes("partial")) return "下一步：先处理部分失败项，再让模型继续推理。";
    return "下一步：结果已回灌，模型可以基于证据继续推理。";
  };
  return items.map((item, index) => {
    const requestId = agentBridgeResultId(item.result, "request_id", "requestId");
    const approvalId = agentBridgeResultId(item.result, "approval_id", "approvalId");
    const runId = agentBridgeResultId(item.result, "run_id", "runId");
    return [
      `${index + 1}. ${item.action}`,
      `状态：${labelStatus(item.status)}`,
      requestId ? `请求：${requestId}` : "",
      approvalId ? `审批：${compactApproval(approvalId)}` : "",
      runId ? `运行：${runId}` : "",
      item.detail ? `结果：${item.detail.slice(0, 420)}` : "",
      nextStepForResult(item),
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

export function agentThreadMessageToChatHistory(message: AgentChatHistoryMessageLike) {
  if (!["user", "assistant"].includes(message.role)) return null;
  const content = [
    message.content.trim(),
    agentChatAttachmentSummaryText(message.attachments || []),
  ].filter(Boolean).join("\n\n");
  if (!content) return null;
  return {
    role: message.role as "user" | "assistant",
    content,
  };
}

export function buildAgentChatHistory(messages: AgentChatHistoryMessageLike[] = [], limit = 8): AgentChatHistoryItem[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (!safeLimit) return [];
  return messages
    .map(agentThreadMessageToChatHistory)
    .filter((item): item is AgentChatHistoryItem => Boolean(item))
    .slice(-safeLimit);
}

export function buildAgentChatMessages(input: {
  systemPrompt: string;
  history?: AgentChatHistoryItem[];
  promptText: string;
  attachments?: AgentChatAttachmentLike[];
  threadContextText?: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: input.systemPrompt,
    },
    ...(input.history || []),
    {
      role: "user",
      content: buildAgentChatContent(input.promptText, input.attachments || [], input.threadContextText || ""),
    },
  ];
}

export function buildAgentChatRequestReceipt(input: {
  content: ChatContent;
  provider: string;
  attachmentCount: number;
  parsedFileCount: number;
  imageAttachmentCount: number;
  historyCount: number;
  contextItemCount: number;
}): AgentChatRequestReceipt {
  const receipt = agentChatContentReceipt(input.content, input.provider);
  return {
    ...receipt,
    attachmentCount: input.attachmentCount,
    parsedFileCount: input.parsedFileCount,
    imageAttachmentCount: input.imageAttachmentCount,
    historyCount: input.historyCount,
    contextItemCount: input.contextItemCount,
  };
}

export function buildAgentChatContent(text: string, attachments: AgentChatAttachmentLike[] = [], threadContextText = ""): ChatContent {
  const lines = [text.trim()];
  if (threadContextText) lines.push(threadContextText);
  const fileSummaries = attachments.map((item) => {
    const label = item.kind === "image" ? "图片" : "文件";
    const header = `${label}：${item.name} (${item.mimeType || "unknown"}, ${formatBytes(item.size)} bytes, ${attachmentParseLabel(item)})`;
    const warning = item.warning ? `\n提示：${item.warning}` : "";
    return item.textPreview ? `${header}\n${item.textPreview}${warning}` : `${header}${warning}`;
  });
  if (fileSummaries.length) lines.push(`[附件上下文]\n${fileSummaries.join("\n\n")}`);
  const textPart = lines.filter(Boolean).join("\n\n") || "请根据附件继续分析。";
  const imageParts = attachments
    .filter((item) => item.kind === "image" && item.dataUrl)
    .map((item) => ({
      type: "image" as const,
      dataUrl: item.dataUrl || "",
      mimeType: item.mimeType || "image/png",
      detail: "auto" as const,
    }));
  if (!imageParts.length) return textPart;
  return [
    { type: "text" as const, text: textPart },
    ...imageParts,
  ];
}

export function agentChatContentReceipt(content: ChatContent, provider: string) {
  if (typeof content === "string") {
    return {
      textPartCount: content.trim() ? 1 : 0,
      imagePartCount: 0,
      textChars: content.length,
      imageWireFormat: "none",
    };
  }
  const textPartCount = content.filter((part) => part.type === "text" && part.text.trim()).length;
  const imagePartCount = content.filter((part) => part.type === "image" && part.dataUrl).length;
  const textChars = content
    .filter((part) => part.type === "text")
    .reduce((sum, part) => sum + (part.type === "text" ? part.text.length : 0), 0);
  const imageWireFormat = imagePartCount
    ? provider === "anthropic"
      ? "Anthropic base64 image"
      : provider === "gemini"
        ? "Gemini inlineData"
        : provider === "ollama"
          ? "Ollama images"
          : "OpenAI image_url"
    : "none";
  return {
    textPartCount,
    imagePartCount,
    textChars,
    imageWireFormat,
  };
}

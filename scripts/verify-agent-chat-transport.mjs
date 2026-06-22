import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function compileTsModule(relativePath, name, stripImports = false) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: sourcePath.pathname,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  const modulePath = join(tmpdir(), `zhimeng-verify-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  writeFileSync(modulePath, stripImports ? compiled.replace(/import\s+[^;]+;\s*/g, "") : compiled, "utf8");
  return import(pathToFileURL(modulePath).href);
}

const {
  agentChatContentReceipt,
  agentRetryTextFromMessage,
  agentThreadMessageToChatHistory,
  buildAgentAttachmentTransportEvent,
  buildAgentBridgeLoopSummary,
  buildAgentBridgeRequestContextHint,
  buildAgentBridgeRequestDisplaySummary,
  buildAgentBridgeRequestSummary,
  buildAgentBridgeRequestTraceRecord,
  buildAgentBridgeToolResultReplay,
  buildAgentBridgeToolResultSummary,
  buildAgentChatHistory,
  buildAgentChatContent,
  buildAgentChatMessages,
  buildAgentChatRequestReceipt,
  buildAgentThreadContextText,
  decideAgentDirectChatFallback,
  decideAgentModelReplyContent,
} = await compileTsModule("../src/utils/agent-chat-transport.ts", "agent-chat-transport", true);
const storeStubDir = join(tmpdir(), `zhimeng-verify-store-${Date.now()}-${Math.random().toString(16).slice(2)}`);
mkdirSync(storeStubDir, { recursive: true });
writeFileSync(join(storeStubDir, "settings"), "export {};\n", "utf8");
writeFileSync(join(storeStubDir, "settings.js"), "export {};\n", "utf8");
const providerSource = readFileSync(new URL("../src/store/api-providers.ts", import.meta.url), "utf8")
  .replace(/from "\.\/settings"/g, `from ${JSON.stringify(pathToFileURL(join(storeStubDir, "settings.js")).href)}`);
const providerModulePath = join(tmpdir(), `zhimeng-verify-api-providers-${Date.now()}.mjs`);
const providerCompiled = ts.transpileModule(providerSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2020,
    verbatimModuleSyntax: false,
  },
}).outputText;
writeFileSync(providerModulePath, providerCompiled, "utf8");
const { ProviderApiError, buildProviderRequest, previewProviderWireMessage } = await import(pathToFileURL(providerModulePath).href);

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const imageContent = [
  { type: "text", text: "看图说明" },
  { type: "image", dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
];
const imageMessage = { role: "user", content: imageContent };
const assembledContent = buildAgentChatContent("分析这个截图", [
  {
    kind: "file",
    name: "notes.md",
    mimeType: "text/markdown",
    size: 1200,
    parseStatus: "parsed",
    parser: "Markdown",
    textPreview: "这里是文件正文片段。",
  },
  {
    kind: "image",
    name: "screen.png",
    mimeType: "image/png",
    size: 2048,
    dataUrl: "data:image/png;base64,BBBB",
  },
], "[当前线程上下文]\n项目目标：AI 对话可用");

assertEqual(agentChatContentReceipt(imageContent, "openai-compatible").imageWireFormat, "OpenAI image_url", "openai image wire format");
assertEqual(agentChatContentReceipt(imageContent, "anthropic").imageWireFormat, "Anthropic base64 image", "anthropic image wire format");
assertEqual(agentChatContentReceipt(imageContent, "gemini").imageWireFormat, "Gemini inlineData", "gemini image wire format");
assertEqual(agentChatContentReceipt(imageContent, "ollama").imageWireFormat, "Ollama images", "ollama image wire format");
assertEqual(agentChatContentReceipt("纯文本", "openai-compatible").imagePartCount, 0, "text-only image count");
assertEqual(agentRetryTextFromMessage({ content: "已附加图片/文件上下文。", attachments: [{}] }), "请根据已附加的图片/文件上下文继续分析。", "attachment-only retry fallback");
assertEqual(agentRetryTextFromMessage({ content: "显示文本", task: "原始任务", attachments: [{}] }), "原始任务", "retry prefers saved task");
assert(Array.isArray(assembledContent), "assembled content should be multipart when image exists");
assertEqual(assembledContent[0].type, "text", "assembled first part text");
assert(assembledContent[0].text.includes("分析这个截图"), "assembled includes user text");
assert(assembledContent[0].text.includes("[当前线程上下文]"), "assembled includes thread context");
assert(assembledContent[0].text.includes("[附件上下文]"), "assembled includes attachment context");
assert(assembledContent[0].text.includes("notes.md"), "assembled includes file name");
assert(assembledContent[0].text.includes("这里是文件正文片段。"), "assembled includes parsed file preview");
assertEqual(assembledContent[1].type, "image", "assembled second part image");
assertEqual(assembledContent[1].dataUrl, "data:image/png;base64,BBBB", "assembled image data url");
const emptyAttachmentTransport = buildAgentAttachmentTransportEvent([]);
assertEqual(emptyAttachmentTransport.summary, "纯文本", "empty attachment transport summary");
assertEqual(emptyAttachmentTransport.compactSummary, "0", "empty attachment compact summary");
assertEqual(emptyAttachmentTransport.hasModelPayload, false, "empty attachment has no model payload");
const mixedAttachmentTransport = buildAgentAttachmentTransportEvent([
  {
    kind: "image",
    name: "shot.png",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,DDDD",
  },
  {
    kind: "file",
    name: "parsed.md",
    mimeType: "text/markdown",
    parseStatus: "parsed",
    textPreview: "parsed file",
  },
  {
    kind: "file",
    name: "meta.zip",
    mimeType: "application/zip",
    parseStatus: "metadata",
  },
  {
    kind: "file",
    name: "broken.pdf",
    mimeType: "application/pdf",
    parseStatus: "failed",
    warning: "解析失败",
  },
]);
assertEqual(mixedAttachmentTransport.attachmentCount, 4, "mixed attachment total count");
assertEqual(mixedAttachmentTransport.imageAttachmentCount, 1, "mixed image count");
assertEqual(mixedAttachmentTransport.parsedFileCount, 1, "mixed parsed file count");
assertEqual(mixedAttachmentTransport.metadataFileCount, 1, "mixed metadata file count");
assertEqual(mixedAttachmentTransport.failedFileCount, 1, "mixed failed file count");
assert(mixedAttachmentTransport.summary.includes("1 张图片"), "mixed summary includes image");
assert(mixedAttachmentTransport.summary.includes("1 个文件文本片段"), "mixed summary includes parsed file");
assert(mixedAttachmentTransport.summary.includes("1 个文件仅元数据"), "mixed summary includes metadata file");
assert(mixedAttachmentTransport.summary.includes("1 个文件解析失败"), "mixed summary includes failed file");
assert(mixedAttachmentTransport.detail.includes("多模态 part"), "mixed detail includes multimodal delivery");
assert(mixedAttachmentTransport.detail.includes("文本上下文"), "mixed detail includes parsed delivery");
assert(mixedAttachmentTransport.detail.includes("不假装已读取正文"), "mixed detail includes metadata/failed caveat");
assertEqual(mixedAttachmentTransport.hasModelPayload, true, "mixed attachment has model payload");
const textFallback = decideAgentDirectChatFallback({
  aborted: false,
  gatewayOnline: true,
  authFailure: false,
  attachments: [{
    kind: "file",
    name: "notes.md",
    parseStatus: "parsed",
    textPreview: "文本可以兜底",
  }],
});
assertEqual(textFallback.shouldFallbackToWorker, true, "text failure can fall back to worker");
assertEqual(textFallback.reason, "text_fallback_allowed", "text fallback reason");
const imageFallback = decideAgentDirectChatFallback({
  aborted: false,
  gatewayOnline: true,
  authFailure: false,
  attachments: [{
    kind: "image",
    name: "screen.png",
    dataUrl: "data:image/png;base64,BBBB",
  }],
});
assertEqual(imageFallback.shouldFallbackToWorker, false, "image failure must not fall back to text worker");
assertEqual(imageFallback.reason, "image_multimodal_requires_direct_provider", "image fallback reason");
assert(imageFallback.userDetail.includes("不会降级成只含文字摘要"), "image failure should explain no fake vision fallback");
const authFallback = decideAgentDirectChatFallback({
  aborted: false,
  gatewayOnline: true,
  authFailure: true,
  attachments: [],
});
assertEqual(authFallback.shouldFallbackToWorker, false, "auth failure must not fall back to worker");
assertEqual(authFallback.reason, "auth_failure", "auth fallback reason");
const offlineFallback = decideAgentDirectChatFallback({
  aborted: false,
  gatewayOnline: false,
  authFailure: false,
  attachments: [],
});
assertEqual(offlineFallback.shouldFallbackToWorker, false, "offline gateway cannot fall back to worker");
assertEqual(offlineFallback.reason, "gateway_offline", "offline fallback reason");
const abortedFallback = decideAgentDirectChatFallback({
  aborted: true,
  gatewayOnline: true,
  authFailure: false,
  attachments: [],
});
assertEqual(abortedFallback.shouldFallbackToWorker, false, "aborted chat should not fall back");
assertEqual(abortedFallback.reason, "aborted", "aborted fallback reason");
const normalReplyDecision = decideAgentModelReplyContent(" 有内容 ");
assertEqual(normalReplyDecision.ok, true, "non-empty reply is ok");
assertEqual(normalReplyDecision.status, "completed", "non-empty reply is completed");
const emptyReplyDecision = decideAgentModelReplyContent(" \n\t ");
assertEqual(emptyReplyDecision.ok, false, "empty reply is not ok");
assertEqual(emptyReplyDecision.status, "empty", "empty reply status");
assert(emptyReplyDecision.detail.includes("不标记为完成"), "empty reply explains not completed");
const emptyBridgeSummary = buildAgentBridgeRequestSummary([]);
assertEqual(emptyBridgeSummary.hasRequests, false, "empty bridge summary has no requests");
assertEqual(emptyBridgeSummary.sidePanelDetail, "", "empty bridge summary detail");
const bridgeSummary = buildAgentBridgeRequestSummary([{ action: "read_file" }, { action: "write_file" }]);
assertEqual(bridgeSummary.requestCount, 2, "bridge summary request count");
assertEqual(bridgeSummary.actionText, "read_file / write_file", "bridge summary action text");
assert(bridgeSummary.sidePanelDetail.includes("模型请求本地工具"), "bridge summary detail prefix");
assert(bridgeSummary.sidePanelDetail.includes("read_file / write_file"), "bridge summary detail actions");
const requestDisplaySummary = buildAgentBridgeRequestDisplaySummary([
  {
    action: "read_file",
    purpose: "读取\nREADME",
    approvalRequired: false,
    validation: [],
  },
  {
    action: "run_command",
    purpose: "运行测试",
    approvalRequired: true,
    validation: [{ severity: "block" }, { severity: "warn" }],
  },
], {
  sanitizePurpose: (purpose) => purpose.replace(/\s+/g, " "),
});
assert(requestDisplaySummary.includes("1. read_file"), "request display first action");
assert(requestDisplaySummary.includes("目的：读取 README"), "request display sanitized purpose");
assert(requestDisplaySummary.includes("审批：不需要"), "request display no approval");
assert(requestDisplaySummary.includes("校验：通过"), "request display validation pass");
assert(requestDisplaySummary.includes("下一步：交给 Gateway 执行，并把结果回灌到当前对话。"), "request display explains direct Gateway next step");
assert(requestDisplaySummary.includes("2. run_command"), "request display second action");
assert(requestDisplaySummary.includes("审批：需要"), "request display approval required");
assert(requestDisplaySummary.includes("校验：1 阻断 / 1 警告"), "request display validation counts");
assert(requestDisplaySummary.includes("下一步：先处理阻断校验，本次不应直接执行。"), "request display explains blocked validation next step");
const requestForTrace = {
  id: "exec-1",
  action: "run_command",
  purpose: "验证构建",
  mode: "approval-required",
  approvalRequired: true,
  validation: [
    { severity: "block" },
    { severity: "warn" },
    { severity: "warn" },
    { severity: "info" },
  ],
};
const bridgeHint = buildAgentBridgeRequestContextHint(requestForTrace, 2, 0, 3);
assertEqual(bridgeHint.source, "direct_chat", "bridge hint source");
assertEqual(bridgeHint.requestIndex, 1, "bridge hint one based index");
assertEqual(bridgeHint.requestCount, 3, "bridge hint request count");
assertEqual(bridgeHint.requestId, "exec-1", "bridge hint request id");
const bridgeTrace = buildAgentBridgeRequestTraceRecord(requestForTrace, 2, 0, 3);
assertEqual(bridgeTrace.request_id, "exec-1", "bridge trace request id");
assertEqual(bridgeTrace.action, "run_command", "bridge trace action");
assertEqual(bridgeTrace.round, 2, "bridge trace round");
assertEqual(bridgeTrace.request_index, 1, "bridge trace one based index");
assertEqual(bridgeTrace.mode, "approval-required", "bridge trace mode");
assertEqual(bridgeTrace.approval_required, true, "bridge trace approval");
assertEqual(bridgeTrace.validation_blocks, 1, "bridge trace block count");
assertEqual(bridgeTrace.validation_warnings, 2, "bridge trace warning count");
const bridgeLoopDone = buildAgentBridgeLoopSummary({ roundCount: 2, requestTotal: 3, remainingCount: 0 });
assertEqual(bridgeLoopDone.hitLimit, false, "bridge loop done not limited");
assertEqual(bridgeLoopDone.completionStatus, "completed", "bridge loop done status");
assertEqual(bridgeLoopDone.chatDetail, "工具闭环完成：2 轮 / 3 个请求", "bridge loop done detail");
const bridgeLoopBlocked = buildAgentBridgeLoopSummary({ roundCount: 3, requestTotal: 5, remainingCount: 2 });
assertEqual(bridgeLoopBlocked.hitLimit, true, "bridge loop blocked hit limit");
assertEqual(bridgeLoopBlocked.completionStatus, "blocked", "bridge loop blocked status");
assert(bridgeLoopBlocked.chatDetail.includes("工具循环达到上限"), "bridge loop blocked chat detail");
assert(bridgeLoopBlocked.blockedDetail.includes("等待用户继续或手动审批"), "bridge loop blocked detail");
const replay = buildAgentBridgeToolResultReplay({
  roundCount: 1,
  maxBridgeRounds: 3,
  toolResults: [
    {
      action: "read_file",
      status: "ok",
      detail: "读取完成",
      result: { path: "README.md", content: "hello" },
    },
    {
      action: "write_file",
      status: "approval_required",
      detail: "等待审批",
      result: { approval_id: "appr-123" },
    },
  ],
});
assert(replay.toolResultText.includes("## 工具结果 1: read_file"), "replay includes first tool heading");
assert(replay.toolResultText.includes("状态：ok"), "replay includes raw status");
assert(replay.toolResultText.includes("README.md"), "replay includes result json");
assert(replay.conversationPrompt.includes("第 1 轮工具结果"), "replay prompt includes round");
assert(replay.conversationPrompt.includes("可以继续输出新的 <bridge-request>"), "replay prompt allows more tools before limit");
const finalReplay = buildAgentBridgeToolResultReplay({
  roundCount: 3,
  maxBridgeRounds: 3,
  toolResults: [{
    action: "workspace_scan",
    status: "ok",
    detail: "扫描完成",
    result: { content: "x".repeat(6000) },
  }],
});
assert(finalReplay.conversationPrompt.includes("最后一轮工具回灌"), "final replay prompt warns last round");
assert(finalReplay.toolResultText.length < 4300, "final replay result json is capped");
const toolResultSummary = buildAgentBridgeToolResultSummary([
  {
    action: "read_file",
    status: "ok",
    detail: "读取完成",
    result: { request_id: "req-read-1", run_id: "run-1" },
  },
  {
    action: "write_file",
    status: "approval_required",
    detail: "x".repeat(500),
    result: { requestId: "req-write-1", approvalId: "approval-abcdef123456" },
  },
], {
  statusLabel: (status) => status === "approval_required" ? "需审批" : status,
  compactApprovalId: (id) => id.slice(0, 12),
});
assert(toolResultSummary.includes("1. read_file"), "tool result summary first action");
assert(toolResultSummary.includes("状态：ok"), "tool result summary raw ok status");
assert(toolResultSummary.includes("请求：req-read-1"), "tool result summary first request id");
assert(toolResultSummary.includes("运行：run-1"), "tool result summary run id");
assert(toolResultSummary.includes("下一步：结果已回灌，模型可以基于证据继续推理。"), "tool result summary explains completed next step");
assert(toolResultSummary.includes("2. write_file"), "tool result summary second action");
assert(toolResultSummary.includes("状态：需审批"), "tool result summary injected status label");
assert(toolResultSummary.includes("请求：req-write-1"), "tool result summary second request id");
assert(toolResultSummary.includes("审批：approval-abc"), "tool result summary compact approval");
assert(toolResultSummary.includes("下一步：到审批面板确认、拒绝或等待人工处理。"), "tool result summary explains approval next step");
assert(!toolResultSummary.includes("x".repeat(430)), "tool result summary detail is capped");
const diffAndErrorToolResultSummary = buildAgentBridgeToolResultSummary([
  {
    action: "write_file",
    status: "diff_draft",
    detail: "已转为 Diff 草案。",
    result: { request_id: "req-diff-1" },
  },
  {
    action: "web_fetch",
    status: "error",
    detail: "网络失败。",
    result: { request_id: "req-web-1" },
  },
]);
assert(diffAndErrorToolResultSummary.includes("下一步：到变更 / Diff 面板逐项审查 hunk。"), "tool result summary explains diff review next step");
assert(diffAndErrorToolResultSummary.includes("下一步：检查错误原因，调整请求或配置后重试。"), "tool result summary explains error next step");
const historyUser = agentThreadMessageToChatHistory({
  role: "user",
  content: "上一轮问题",
  attachments: [{
    kind: "file",
    name: "old.txt",
    mimeType: "text/plain",
    size: 88,
    parseStatus: "parsed",
    textPreview: "旧文件片段",
  }],
});
assertEqual(historyUser.role, "user", "history keeps user role");
assert(historyUser.content.includes("上一轮问题"), "history includes message content");
assert(historyUser.content.includes("old.txt"), "history includes attachment name");
assert(historyUser.content.includes("旧文件片段"), "history includes attachment preview");
assertEqual(agentThreadMessageToChatHistory({ role: "tool", content: "工具结果", attachments: [] }), null, "history excludes tool role");
assertEqual(agentThreadMessageToChatHistory({ role: "system", content: "系统提示", attachments: [] }), null, "history excludes system role");
const compactHistory = buildAgentChatHistory([
  { role: "user", content: "第一轮", attachments: [] },
  { role: "tool", content: "工具结果会被排除", attachments: [] },
  { role: "assistant", content: "第二轮", attachments: [] },
  { role: "system", content: "系统提示会被排除", attachments: [] },
  {
    role: "user",
    content: "第三轮",
    attachments: [{
      kind: "file",
      name: "kept.md",
      mimeType: "text/markdown",
      size: 128,
      parseStatus: "parsed",
      textPreview: "应该进入最近历史的附件片段",
    }],
  },
], 2);
assertEqual(compactHistory.length, 2, "compact history keeps last two sendable messages");
assertEqual(compactHistory[0].role, "assistant", "compact history first role after filtering");
assertEqual(compactHistory[0].content, "第二轮", "compact history first content after filtering");
assertEqual(compactHistory[1].role, "user", "compact history second role after filtering");
assert(compactHistory[1].content.includes("第三轮"), "compact history includes final user message");
assert(compactHistory[1].content.includes("kept.md"), "compact history keeps attachment summary");
assert(compactHistory[1].content.includes("应该进入最近历史的附件片段"), "compact history keeps attachment preview");
assertEqual(buildAgentChatHistory([{ role: "user", content: "不会发送", attachments: [] }], 0).length, 0, "zero history limit");
const readFileThreadContext = buildAgentThreadContextText([{
  id: "context-read-file-preview",
  kind: "file",
  title: "agent-loop.ts",
  summary: [
    "路径：src/agent-loop.ts",
    "读取目标：C:\\Projects\\Zhimeng\\src\\agent-loop.ts",
    "正文片段：64 字符，已截取前 64 字符进入线程上下文。",
    "",
    "```text",
    "export async function runAgentLoop() { return 'loop'; }",
    "```",
  ].join("\n"),
  ref: "C:\\Projects\\Zhimeng\\src\\agent-loop.ts",
  source: "Gateway read_file 预览",
  status: "ok",
}]);
assert(readFileThreadContext.includes("[当前线程上下文]"), "read_file context text has thread context header");
assert(readFileThreadContext.includes("[file] agent-loop.ts"), "read_file context text includes file title");
assert(readFileThreadContext.includes("Gateway read_file 预览"), "read_file context text keeps source");
assert(readFileThreadContext.includes("C:\\Projects\\Zhimeng\\src\\agent-loop.ts"), "read_file context text keeps target path");
assert(readFileThreadContext.includes("runAgentLoop"), "read_file context text keeps preview snippet");
assertEqual(buildAgentThreadContextText([{ title: "x", summary: "y" }], 0), "", "zero context max chars returns empty");
const modelMessages = buildAgentChatMessages({
  systemPrompt: "系统协议",
  history: compactHistory,
  promptText: "当前问题",
  attachments: [{
    kind: "image",
    name: "current.png",
    mimeType: "image/png",
    size: 256,
    dataUrl: "data:image/png;base64,CCCC",
  }],
  threadContextText: readFileThreadContext,
});
assertEqual(modelMessages.length, 4, "model messages include system history and user");
assertEqual(modelMessages[0].role, "system", "model messages start with system");
assertEqual(modelMessages[0].content, "系统协议", "model system content");
assertEqual(modelMessages[1].role, "assistant", "model history order first");
assertEqual(modelMessages[1].content, "第二轮", "model history first content");
assertEqual(modelMessages[2].role, "user", "model history order second");
assert(modelMessages[2].content.includes("kept.md"), "model history keeps attachment summary");
assertEqual(modelMessages[3].role, "user", "model messages end with user");
assert(Array.isArray(modelMessages[3].content), "model final user content is multipart with image");
assert(modelMessages[3].content[0].text.includes("当前问题"), "model final user includes prompt");
assert(modelMessages[3].content[0].text.includes("[当前线程上下文]"), "model final user includes thread context");
assert(modelMessages[3].content[0].text.includes("Gateway read_file 预览"), "model final user includes read_file preview source");
assert(modelMessages[3].content[0].text.includes("runAgentLoop"), "model final user includes read_file preview snippet");
assertEqual(modelMessages[3].content[1].dataUrl, "data:image/png;base64,CCCC", "model final user keeps image data");
const requestReceipt = buildAgentChatRequestReceipt({
  content: modelMessages[3].content,
  provider: "openai-compatible",
  attachmentCount: 1,
  parsedFileCount: 0,
  imageAttachmentCount: 1,
  historyCount: compactHistory.length,
  contextItemCount: 3,
});
assertEqual(requestReceipt.textPartCount, 1, "request receipt text part count");
assert(requestReceipt.textChars > 0, "request receipt text chars");
assertEqual(requestReceipt.imagePartCount, 1, "request receipt image part count");
assertEqual(requestReceipt.imageWireFormat, "OpenAI image_url", "request receipt image wire");
assertEqual(requestReceipt.attachmentCount, 1, "request receipt attachment count");
assertEqual(requestReceipt.parsedFileCount, 0, "request receipt parsed file count");
assertEqual(requestReceipt.imageAttachmentCount, 1, "request receipt image attachment count");
assertEqual(requestReceipt.historyCount, compactHistory.length, "request receipt history count");
assertEqual(requestReceipt.contextItemCount, 3, "request receipt context count");

const openaiWire = previewProviderWireMessage("openai-compatible", imageMessage);
assertEqual(openaiWire.content[1].type, "image_url", "openai wire image type");
assertEqual(openaiWire.content[1].image_url.url, "data:image/png;base64,AAAA", "openai wire image url");

const anthropicWire = previewProviderWireMessage("anthropic", imageMessage);
assertEqual(anthropicWire.content[1].type, "image", "anthropic wire image type");
assertEqual(anthropicWire.content[1].source.type, "base64", "anthropic wire source type");
assertEqual(anthropicWire.content[1].source.media_type, "image/png", "anthropic wire media type");
assertEqual(anthropicWire.content[1].source.data, "AAAA", "anthropic wire base64");

const geminiWire = previewProviderWireMessage("gemini", imageMessage);
assertEqual(geminiWire.role, "user", "gemini user role");
assertEqual(geminiWire.parts[1].inlineData.mimeType, "image/png", "gemini inlineData mime");
assertEqual(geminiWire.parts[1].inlineData.data, "AAAA", "gemini inlineData base64");

const ollamaWire = previewProviderWireMessage("ollama", imageMessage);
assertEqual(ollamaWire.content, "看图说明", "ollama text content");
assert(Array.isArray(ollamaWire.images) && ollamaWire.images[0] === "AAAA", "ollama images base64");

const providerRequestBase = {
  apiUrl: "https://example.test/v1",
  apiKey: "test-key",
  modelId: "vision-model",
  messages: [
    { role: "system", content: "系统提示" },
    imageMessage,
  ],
  systemPrompt: "外层系统提示",
  temperature: 0.2,
  maxTokens: 123,
};

const openaiRequest = buildProviderRequest({ ...providerRequestBase, provider: "openai-compatible" });
assertEqual(openaiRequest.url, "https://example.test/v1/chat/completions", "openai request url");
assertEqual(openaiRequest.headers.Authorization, "Bearer test-key", "openai auth header");
assertEqual(openaiRequest.body.stream, true, "openai request streams");
assertEqual(openaiRequest.body.temperature, 0.2, "openai request temperature");
assertEqual(openaiRequest.body.max_tokens, 123, "openai request max tokens");
assertEqual(openaiRequest.body.messages[0].role, "system", "openai request injects system prompt");
const openaiUserMessage = openaiRequest.body.messages.find((message) => message.role === "user");
assertEqual(openaiUserMessage.content[1].type, "image_url", "openai request image type");
assertEqual(openaiUserMessage.content[1].image_url.url, "data:image/png;base64,AAAA", "openai request image url");

const anthropicRequest = buildProviderRequest({ ...providerRequestBase, provider: "anthropic", apiUrl: "https://api.anthropic.com/v1" });
assertEqual(anthropicRequest.url, "https://api.anthropic.com/v1/messages", "anthropic request url");
assert(anthropicRequest.body.system.includes("外层系统提示"), "anthropic request top-level system");
assert(anthropicRequest.body.system.includes("系统提示"), "anthropic request merges message system");
assertEqual(anthropicRequest.body.messages.length, 1, "anthropic request removes system message");
assertEqual(anthropicRequest.body.messages[0].content[1].type, "image", "anthropic request image type");
assertEqual(anthropicRequest.body.messages[0].content[1].source.media_type, "image/png", "anthropic request image mime");
assertEqual(anthropicRequest.body.messages[0].content[1].source.data, "AAAA", "anthropic request image base64");

const geminiRequest = buildProviderRequest({ ...providerRequestBase, provider: "gemini", apiUrl: "https://generativelanguage.googleapis.com/v1beta" });
assert(geminiRequest.url.includes(":streamGenerateContent?alt=sse&key=test-key"), "gemini stream url");
assert(geminiRequest.fallbackUrl.includes(":generateContent?key=test-key"), "gemini fallback url");
assertEqual(geminiRequest.body.contents.length, 1, "gemini request removes system message");
assertEqual(geminiRequest.body.contents[0].parts[1].inlineData.mimeType, "image/png", "gemini request image mime");
assertEqual(geminiRequest.body.contents[0].parts[1].inlineData.data, "AAAA", "gemini request image base64");
assert(geminiRequest.body.systemInstruction.parts[0].text.includes("外层系统提示"), "gemini request system instruction");
assertEqual(geminiRequest.body.generationConfig.maxOutputTokens, 123, "gemini request max tokens");

const ollamaRequest = buildProviderRequest({ ...providerRequestBase, provider: "ollama", apiUrl: "http://localhost:11434" });
assertEqual(ollamaRequest.url, "http://localhost:11434/api/chat", "ollama request url");
assertEqual(ollamaRequest.streamMode, "ndjson", "ollama stream mode");
assertEqual(ollamaRequest.body.messages[0].role, "system", "ollama request injects system");
assertEqual(ollamaRequest.body.messages[1].content, "看图说明", "ollama request text content");
assertEqual(ollamaRequest.body.messages[1].images[0], "AAAA", "ollama request image base64");
assertEqual(ollamaRequest.body.options.num_predict, 123, "ollama request max tokens");

const ollamaV1Request = buildProviderRequest({ ...providerRequestBase, provider: "ollama", apiUrl: "http://localhost:11434/v1", apiKey: "" });
assertEqual(ollamaV1Request.provider, "openai-compatible", "ollama v1 falls back to openai compatible request");
assertEqual(ollamaV1Request.headers.Authorization, "Bearer ollama", "ollama v1 fills fallback key");
const ollamaV1UserMessage = ollamaV1Request.body.messages.find((message) => message.role === "user");
assertEqual(ollamaV1UserMessage.content[1].type, "image_url", "ollama v1 keeps image_url");
const authError = new ProviderApiError(401, "Unauthorized", "invalid_api_key");
assertEqual(authError.status, 401, "provider api error carries status");
assertEqual(authError.detail, "invalid_api_key", "provider api error carries detail");
assert(authError.message.includes("401 Unauthorized"), "provider api error message includes status");

console.log("agent-chat-transport ok");

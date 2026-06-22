import { readFileSync } from "node:fs";

const doc = readFileSync(new URL("../docs/phase1-chat-acceptance-20260619.md", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const coreRunner = readFileSync(new URL("./verify-phase1-chat-core.mjs", import.meta.url), "utf8");
const phase2BrowserRunner = readFileSync(new URL("./verify-phase2-agent-home-browser.mjs", import.meta.url), "utf8");
const agentControlCenter = readFileSync(new URL("../src/components/AgentControlCenter.tsx", import.meta.url), "utf8");
const workbenchMessageList = readFileSync(new URL("../src/components/WorkbenchMessageList.tsx", import.meta.url), "utf8");
const workbenchComposer = readFileSync(new URL("../src/components/WorkbenchComposer.tsx", import.meta.url), "utf8");
const modalsSource = readFileSync(new URL("../src/components/Modals.tsx", import.meta.url), "utf8");
const indexCss = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const messageSurfaceSource = `${agentControlCenter}\n${workbenchMessageList}\n${workbenchComposer}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const heading of [
  "## 1. 核心链路",
  "## 2. 卡点与验证",
  "## 3. API 优先原则",
  "## 4. Spec 成功标准",
  "## 6. 手动冒烟测试",
]) {
  assert(doc.includes(heading), `missing heading: ${heading}`);
}

for (const required of [
  "用户输入 / 附件",
  "Agent 线程保存",
  "API Provider 模型请求",
  "解析 <bridge-request>",
  "Gateway / Diff / 审批",
  "工具结果回灌到线程",
  "模型继续推理或停止",
]) {
  assert(doc.includes(required), `core chain missing: ${required}`);
}

for (const command of [
  "npm run verify:phase1",
  "npm run verify:phase1-chat-core",
  "npm run verify:provider-config",
  "npm run verify:agent-chat",
  "npm run verify:agent-chat-api-smoke",
  "npm run verify:agent-chat-attachment-api-smoke",
  "npm run verify:model-test-empty-reply",
  "npm run verify:agent-attachment",
  "npm run verify:executor-bridge",
  "npm run verify:agent-loop-read-tool",
  "npm run verify:agent-loop-write-file",
  "npm run verify:workspace-root",
  "npm run verify:workspace-scan",
  "npm run verify:workspace-read",
  "npm run verify:agent-home-sidebar",
  "npm run verify:agent-thread-store",
]) {
  assert(doc.includes(command), `verification command missing: ${command}`);
}

assert(
  packageJson.scripts?.typecheck === "tsc --noEmit --pretty false",
  "package.json must register typecheck",
);
assert(
  packageJson.scripts?.["verify:phase1"] === "npm run typecheck && npm run build && npm run verify:phase1-chat-core",
  "package.json must register verify:phase1 as the Phase 1 entrypoint with typecheck, build, then core checks",
);
assert(
  packageJson.scripts?.["verify:phase1-chat-core"] === "node scripts/verify-phase1-chat-core.mjs",
  "package.json must register verify:phase1-chat-core",
);
assert(
  packageJson.scripts?.["verify:phase1-browser-chat"] === "node scripts/verify-phase1-browser-chat.mjs",
  "package.json must register verify:phase1-browser-chat",
);

for (const script of [
  "verify-agent-home-sidebar-contract.mjs",
  "verify-agent-thread-store.mjs",
  "verify-agent-chat-transport.mjs",
  "verify-agent-chat-api-smoke.mjs",
  "verify-agent-chat-attachment-api-smoke.mjs",
  "verify-model-test-empty-reply-guard.mjs",
  "verify-provider-config-boundary.mjs",
  "verify-agent-attachment-intake.mjs",
  "verify-executor-bridge.mjs",
  "verify-agent-loop-bridge.mjs",
  "verify-agent-loop-read-tool-followup.mjs",
  "verify-agent-loop-write-file-intercept.mjs",
  "verify-agent-loop-command-approval.mjs",
  "verify-gateway-command-approval.py",
  "verify-agent-loop-resume-state.mjs",
  "verify-agent-loop-resume-prompt.mjs",
  "verify-workspace-root-binding.mjs",
  "verify-workspace-scan-index.mjs",
  "verify-workspace-read-preview.mjs",
  "verify-write-file-diff-draft.mjs",
  "verify-phase1-browser-chat.mjs",
]) {
  assert(coreRunner.includes(script), `phase1 core runner missing: ${script}`);
}

assert(doc.includes("Gateway 不应该阻塞基础聊天"), "API priority must keep Gateway from blocking basic chat");
assert(doc.includes("文件写入永远先变成 Diff / 审批"), "success criteria must protect write_file approval flow");
assert(doc.includes("API / Provider 配置只在模型中心、设置或后续桌面配置工具中处理"), "provider config boundary missing");
assert(doc.includes("首页轻量设置可直接填写自定义 baseURL / API key / 模型 ID"), "custom Provider quick settings success criteria missing");
assert(doc.includes("cc switch / JSON / 普通文本"), "paste-based Provider setup should be documented");
assert(doc.includes("粘贴配置并解析"), "paste parser browser evidence should be documented");
assert(doc.includes("保存 API 配置"), "custom Provider save action should use current Chinese label");
assert(doc.includes("填入草稿"), "model discovery draft selection should be documented");
assert(doc.includes("首页空状态必须把“配置模型”放进主动作"), "Phase 1 doc should require a primary model setup action in the empty Agent Home");
assert(doc.includes("agent-home-starter-config-model"), "Phase 1 doc should name the browser-tested primary model setup action");
assert(doc.includes("当前首页正在使用"), "active Provider status should be documented");
assert(doc.includes("草稿未保存"), "unsaved Provider draft state should be documented");
assert(doc.includes("带前后空格的 baseURL 和 API key"), "Provider pasted whitespace cleanup should be documented");
assert(doc.includes("去掉空格和尾部 `/` 的干净值"), "Provider saved config normalization should be documented");
assert(doc.includes("端点模板默认保持折叠"), "Provider endpoint templates should stay secondary by default");
assert(doc.includes("不是模型清单"), "Provider endpoint templates must not look like stale model choices");
assert(doc.includes("只填端点模板，模型从账号读取"), "Provider preset cards should avoid foregrounding placeholder model IDs");
assert(doc.includes("白色轻量桌面浮层"), "Phase 1 doc should require a light desktop Provider settings panel");
assert(doc.includes("宽度不超过 760px"), "Phase 1 doc should document the Provider settings panel width guard");
assert(doc.includes("圆角不超过 14px"), "Phase 1 doc should document the Provider settings panel radius guard");
assert(doc.includes("浏览器内保存自定义 Provider 后可从首页直接发送并收到回复"), "browser custom Provider direct chat criteria missing");
assert(doc.includes("npm run verify:phase1-browser-chat"), "browser Agent Home chat verification command missing from Phase 1 doc");
assert(doc.includes("npm run verify:phase2-agent-home-browser"), "Phase 1 doc should reference the browser Provider settings surface guard");
assert(doc.includes("2026-06-20 已把本机 mock OpenAI-compatible 服务升级为自动浏览器门禁"), "current custom Provider browser evidence missing");
assert(doc.includes("mock Provider 的 `/__last-chat` 证明请求带着 `smoke-model`、Authorization header 和用户输入文本"), "browser Provider request evidence missing");
assert(doc.includes("mock Provider 的 `/__last-chat` 证明首页请求包含文本附件文件名"), "browser attachment request evidence missing");
assert(doc.includes("phase2-receipt.txt"), "browser attachment text filename evidence missing");
assert(doc.includes("phase2-image.png"), "browser attachment image filename evidence missing");
assert(doc.includes("真实页面刷新后仍能看到用户消息、AI 回复、文本附件卡和图片附件卡"), "thread persistence success criteria must include browser reload");
assert(doc.includes("文本附件卡和图片附件卡"), "thread persistence criteria should include attachment cards");
assert(doc.includes("浏览器刷新持久化冒烟"), "browser reload persistence evidence missing");
assert(doc.includes("Phase1 刷新持久化"), "browser reload persistence marker missing");
assert(doc.includes("zhimeng-agent-thread-spaces"), "thread persistence evidence should name the storage key");
assert(doc.includes("unbound"), "thread persistence evidence should name free conversation space");
assert(doc.includes("agent-home-focused"), "browser reload evidence should keep Agent Home as the restored surface");
assert(doc.includes("空回复不能标记为完成"), "empty model replies must be explicit failures, not completed fake replies");
assert(doc.includes("decideAgentModelReplyContent"), "empty reply verification function should be documented");
assert(doc.includes("测试对话空回复不能算成功"), "model test empty replies must fail instead of passing");
assert(doc.includes("鉴权/权限类 4xx 错误不能被 non-stream fallback 掩盖"), "auth/permission errors must not be hidden by fallback requests");
assert(doc.includes("401 必须解释为“密钥没有通过认证”"), "Phase 1 doc should require human-readable 401 guidance");
assert(doc.includes("403 必须指向权限 / 额度 / 白名单"), "Phase 1 doc should require human-readable 403 guidance");
assert(doc.includes("404/405 必须指向 baseURL 或模型 ID"), "Phase 1 doc should require baseURL/model guidance for 404/405");
assert(doc.includes("保存后点“重试”继续"), "Phase 1 doc should require a concrete retry-after-settings next step");
assert(doc.includes("auth-fail-model"), "auth failure smoke model should be documented");
assert(doc.includes("超大附件必须在进入模型请求前被拒绝"), "oversized attachment model-request boundary missing");
assert(doc.includes("validateAgentAttachmentFile"), "attachment validation helper should be documented");
assert(doc.includes("未进入模型请求"), "oversized attachment rejection text should be documented");
assert(doc.includes("失败消息必须提供模型设置和重试入口"), "Phase 1 doc should require visible recovery actions after chat failure");
assert(modalsSource.includes("只是少打接口地址，不是模型清单"), "Settings endpoint template summary should say presets are not model lists");
assert(modalsSource.includes("只填端点模板，模型从账号读取"), "Settings preset cards should avoid showing placeholder model IDs as choices");
assert(modalsSource.includes("<details") && modalsSource.includes('data-testid="settings-provider-presets"'), "Settings endpoint templates should be collapsed details, not a default model list");

assert(messageSurfaceSource.includes('data-testid="message-open-model-settings"'), "failed message card should expose a model settings action");
assert(messageSurfaceSource.includes('data-testid="message-retry-last"'), "failed message card should expose retry action");
assert(agentControlCenter.includes("providerChatFailureGuidance"), "direct chat failures should use human-readable Provider failure guidance");
assert(agentControlCenter.includes("密钥没有通过认证"), "Provider chat failure guidance should explain 401 auth failures");
assert(agentControlCenter.includes("服务端拒绝当前密钥或模型权限"), "Provider chat failure guidance should explain 403 permission failures");
assert(agentControlCenter.includes("模型地址或模型 ID 可能不对"), "Provider chat failure guidance should explain 404/405 endpoint/model failures");
assert(agentControlCenter.includes("保存后点“重试”继续这条消息"), "Provider chat failure guidance should tell users how to recover");
assert(messageSurfaceSource.includes("message.status === \"setup-needed\" || messageLooksError"), "retry action should appear for real error messages, not only setup-needed placeholders");
assert(messageSurfaceSource.includes('className="codex-composer-action is-primary"'), "composer blocker should use text actions instead of icon-only buttons");
assert(agentControlCenter.includes("title: \"AI 请求回执\""), "direct chat should append a visible AI request receipt");
assert(agentControlCenter.includes("`模型 ${settings.modelId || \"未设置\"} · Provider ${effectiveProvider}`"), "AI request receipt should visibly name model and Provider");
assert(agentControlCenter.includes("`历史 ${contentReceipt.historyCount} 条 · 上下文 ${contentReceipt.contextItemCount} 条`"), "AI request receipt should visibly name history and context counts");
assert(indexCss.includes(".codex-message-action"), "message recovery actions should have stable compact styling");
assert(indexCss.includes(".codex-composer-action"), "composer recovery actions should have stable compact styling");

for (const browserRunnerSnippet of [
  "smoke-openai-compatible-server.mjs",
  "settings-custom-api-url-input",
  "settings-custom-api-key-input",
  "agent-home-starter-config-model",
  "empty Agent Home should expose the primary model setup action",
  "settings-custom-model-id-input",
  "settings-quick-save-button",
  "settings-provider-config-paste-input",
  "settings-parse-provider-config-button",
  "pasteParserDraft",
  "pasteParserMessage",
  "已解析并填入草稿",
  "paste-parser-preflight-model",
  "settings-current-provider-status",
  "presetsDefaultClosed",
  "presetsSummaryText",
  "不是模型清单",
  "storage?.apiUrl === `http://127.0.0.1:${mockProviderPort}/v1`",
  "获取账号模型",
  "填入草稿",
  "discoveredDraftStatus",
  "usedQuickSave",
  "panelRect?.width <= 760",
  "panelRect?.top >= 40",
  "backgroundColor",
  "borderRadius",
  "Custom Provider saved in browser but direct chat did not return a reply",
  "lastChat.model === \"smoke-model\"",
  "lastChat.authorization === \"[present]\"",
  "attachmentLastChat.model === \"smoke-model\"",
  "attachmentLastChat.imagePartCount",
  "attachmentLastChat.imageUrls",
  "phase2-receipt.txt",
  "phase2-image.png",
  "zhimeng-agent-thread-spaces",
  "hasUnboundStorage",
  "请回复浏览器模型配置冒烟。",
  "浏览器模型配置冒烟成功。",
  "auth-fail-model",
  "message-open-model-settings",
  "密钥没有通过认证",
  "保存后点“重试”",
  "browser chat failure did not expose model settings and retry actions",
]) {
  assert(phase2BrowserRunner.includes(browserRunnerSnippet), `phase2 browser runner missing custom Provider chat coverage: ${browserRunnerSnippet}`);
}

for (const smokeCase of [
  "纯文本 API 对话",
  "模型不可用暂存",
  "文件附件",
  "图片 / 多模态",
  "工具请求回灌",
]) {
  assert(doc.includes(smokeCase), `manual smoke test missing: ${smokeCase}`);
}

console.log("phase1-chat-acceptance ok");

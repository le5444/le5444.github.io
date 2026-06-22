import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const doc = readProjectFile("docs/phase2-agent-home-acceptance-20260619.md");
const component = readProjectFile("src/components/AgentControlCenter.tsx");
const composer = readProjectFile("src/components/WorkbenchComposer.tsx");
const threadHeader = readProjectFile("src/components/WorkbenchThreadHeader.tsx");
const chatStarter = readProjectFile("src/components/WorkbenchChatStarter.tsx");
const threadFilterBar = readProjectFile("src/components/WorkbenchThreadFilterBar.tsx");
const threadListSection = readProjectFile("src/components/WorkbenchThreadListSection.tsx");
const toolTracePanel = readProjectFile("src/components/WorkbenchToolTracePanel.tsx");
const workspaceListSection = readProjectFile("src/components/WorkbenchWorkspaceListSection.tsx");
const css = readProjectFile("src/index.css");
const packageJson = JSON.parse(readProjectFile("package.json"));
const indexHtml = readProjectFile("index.html");
const homeSurface = `${component}\n${composer}\n${threadHeader}`;

for (const phrase of [
  "织梦写作台 / Zhimeng Writing Agent",
  "## 1. 核心链路",
  "## 2. 卡点与验证",
  "## 3. API 优先原则",
  "## 4. Spec 成功标准",
  "核心链路是什么",
  "每个卡点怎么验证",
  "能不能优先用 API",
  "spec 文档里有没有成功标准",
  "Chat-first 三栏",
  "左侧 Primary Sidebar",
  "中间 Main Content",
  "右侧 Secondary Sidebar",
  "API / Provider 配置只能走设置",
  "白色轻量桌面浮层",
  "宽度不超过 760px",
  "粘贴 cc switch / JSON 配置解析到草稿",
  "不得回到黑色全屏配置页",
  "需要配置模型",
  "模型异常",
  "仅保存到线程",
  "模型可用",
  "不能把未配置和本地服务离线都混成“暂存模式”",
  "npm run verify:phase2-agent-home",
]) {
  assert(doc.includes(phrase), `Phase 2 acceptance doc missing: ${phrase}`);
}

assert(indexHtml.includes("织梦写作台 / Zhimeng Writing Agent"), "public browser title must remain Zhimeng-first");
assert(!indexHtml.includes("<title>灵枢") && !indexHtml.includes("<title>LumenOS"), "public browser title must not become LumenOS-first");

for (const snippet of [
  'data-testid="agent-home-focused"',
  "codex-left-sidebar",
  "codex-main-panel",
  'data-testid="agent-home-side-tabs"',
  'data-testid="agent-thread-composer"',
  'data-testid="agent-send-button"',
  'data-testid="agent-home-composer-attach"',
  'data-testid="agent-home-composer-attachment-receipt"',
  'data-testid="composer-model-pill"',
  "<WorkbenchToolTracePanel",
]) {
  assert(homeSurface.includes(snippet), `Agent Home structural contract missing: ${snippet}`);
}

for (const snippet of [
  'data-testid="home-tool-trace-row"',
  'data-testid="home-tool-trace-next-step"',
  'data-next-step-tone={nextStepTone}',
  'traceNextStepForRow(entry)',
]) {
  assert(toolTracePanel.includes(snippet), `Agent Home tool trace panel contract missing: ${snippet}`);
}

for (const tab of [
  'id: "context"',
  'id: "files"',
  'id: "diff"',
  'id: "approvals"',
  'id: "status"',
]) {
  assert(component.includes(tab), `Agent Home right rail missing tab: ${tab}`);
}
assert(!component.includes('id: "model", label: "模型"'), "Agent Home right rail must not include a model/API tab");
assert(!component.includes('setAgentHomeSideTab("model")'), "Agent Home must not route API settings into right rail");
assert(!component.includes("agent-model-drawer"), "Agent Home must not keep legacy model drawer");

for (const snippet of [
  'data-testid="agent-home-new-free-thread"',
  'data-testid="agent-home-more-menu"',
  'data-testid="agent-home-new-project-thread"',
  'data-testid="agent-home-workspace-create"',
  "<WorkbenchThreadFilterBar",
  "<WorkbenchThreadListSection",
  "<WorkbenchWorkspaceListSection",
  'data-testid="agent-home-footer-archive-toggle"',
]) {
  assert(component.includes(snippet), `Agent Home left navigation contract missing: ${snippet}`);
}

for (const snippet of [
  'data-testid={`agent-thread-row-menu-${thread.id}`}',
  'data-testid={`agent-thread-menu-pin-${thread.id}`}',
  'data-testid={`agent-thread-menu-rename-${thread.id}`}',
  'data-testid={`agent-thread-menu-delete-${thread.id}`}',
]) {
  assert(threadListSection.includes(snippet), `Agent Home thread list contract missing: ${snippet}`);
}

for (const snippet of [
  'data-testid={`agent-home-workspace-row-${item.id}`}',
  'data-testid={`agent-home-workspace-menu-${item.id}`}',
  'data-testid={`agent-home-workspace-menu-open-${item.id}`}',
  'data-testid={`agent-home-workspace-menu-files-${item.id}`}',
  'data-testid={`agent-home-workspace-menu-pin-${item.id}`}',
  'data-testid={`agent-home-workspace-menu-rename-${item.id}`}',
  'data-testid={`agent-home-workspace-menu-delete-${item.id}`}',
]) {
  assert(workspaceListSection.includes(snippet), `Agent Home workspace list contract missing: ${snippet}`);
}

for (const snippet of [
  'data-testid={`agent-home-thread-filter-${item.key}`}',
  '{ key: "all", label: "全部" }',
  '{ key: "pinned", label: "置顶" }',
  '{ key: "project", label: "项目" }',
  '{ key: "free", label: "自由" }',
]) {
  assert(threadFilterBar.includes(snippet), `Agent Home thread filter contract missing: ${snippet}`);
}

assert(component.includes("const showComposerSendModeStatus = !canSendToModelNow"), "composer model blocker must be controlled by a focused visibility flag");
assert(component.includes("showSendModeStatus={showComposerSendModeStatus}"), "composer model blocker should be passed through the dedicated Composer visibility flag");
assert(composer.includes("{showSendModeStatus && ("), "composer model blocker should not render directly from model unavailable state");
assert(component.includes(':"暂存到线程"') || component.includes(': "暂存到线程"'), "unavailable send button should say it stores into the thread, not a vague save action");
assert(component.includes("当前不会请求模型，只会把消息和附件记录在本线程"), "unavailable send button detail should explain no model call is made");
assert(component.includes("模型可用后点“重试”继续生成"), "unavailable send button detail should explain retry after model recovery");
assert(component.includes('? "需要配置模型"'), "Agent Home should name missing model setup explicitly");
assert(component.includes('? "仅保存到线程"'), "Agent Home should distinguish local/offline save-only mode");
assert(component.includes("本地模型服务未连接，消息会先保存到线程。"), "Agent Home should explain local model service offline without implying a hidden local model");
assert(component.includes("仅保存到线程：连接模型后可继续生成。"), "Agent Home save-only banner should be clear");
assert(!component.includes('const publicModelStateLabel = modelRuntimeReady ? "模型可用" : providerRuntimeProbeFailure ? "模型异常" : "暂存模式"'), "Agent Home must not collapse all unavailable states into 暂存模式");
assert(component.includes("attachmentTransport={homeAttachmentTransport}"), "attachment receipt should receive the computed model payload transport state");
assert(composer.includes('data-has-model-payload={attachmentTransport.hasModelPayload ? "true" : "false"}'), "attachment receipt should expose whether attachments enter the model payload");
assert(composer.includes('data-image-count={attachmentTransport.imageAttachmentCount}'), "attachment receipt should expose image count for multimodal checks");
assert(composer.includes('data-parsed-file-count={attachmentTransport.parsedFileCount}'), "attachment receipt should expose parsed file count");
assert(homeSurface.includes("附件回执"), "attachment receipt should have a visible label");
assert(composer.includes('canSendToModelNow ? <Send className="h-5 w-5" /> : <Save className="h-5 w-5" />'), "home send button should show a save icon when it only stores into the thread");
assert(component.includes(' : homeModelStatusLabel'), "unavailable model pill should show a short status label instead of a long profile name");
assert(component.includes("当前配置档案：${settings.modelName || settings.modelId || \"未命名模型\"}"), "unavailable model title should keep the saved config profile detail");
assert(component.includes("不代表本地模型服务已启动"), "unavailable model title should prevent local-model availability confusion");
assert(component.includes("const homeLeftContextStripVisible = projectModeActive"), "left mode strip should only appear for project mode");
assert(component.includes("homeLeftContextStripVisible && ("), "left mode strip must be conditionally rendered");
assert(component.includes('data-testid="agent-home-left-mode-strip"'), "left mode strip needs a stable test id when visible");
assert(doc.includes("自由对话默认不显示"), "Phase 2 doc should name the free-chat left-rail noise rule");
assert(component.includes("const [agentHomeSidePanelOpen, setAgentHomeSidePanelOpen] = useState(false)"), "Agent Home right rail should default to collapsed");
assert(component.includes('data-panel-state={agentHomeSidePanelOpen ? "open" : "collapsed"}'), "Agent Home right rail needs an explicit DOM state");
assert(component.includes('aria-label="右侧辅助栏"'), "Agent Home right rail needs a clear accessible label");
assert(component.includes('data-testid="agent-home-side-return-chat"'), "Agent Home right rail should expose a visible return-to-chat action");
assert(component.includes('data-testid="agent-home-side-collapse"'), "Agent Home right rail should expose a visible collapse action");
assert(component.includes("回到对话"), "Agent Home right rail return action should use visible Chinese text");
assert(component.includes("收起"), "Agent Home right rail collapse action should use visible Chinese text");
assert(doc.includes('data-panel-state="collapsed"'), "Phase 2 doc should require collapsed right-rail DOM evidence");
assert(doc.includes("回到对话"), "Phase 2 doc should require a visible return-to-chat affordance in the right rail");
assert(doc.includes("收起侧栏"), "Phase 2 doc should require a visible collapse affordance in the right rail");
assert(component.includes("if (isThreadMetadataMessage(message)) return false;"), "Thread metadata messages should not occupy the main chat surface");
assert(component.includes("<WorkbenchChatStarter"), "Agent Home should mount a dedicated Main Content starter component");
assert(chatStarter.includes('data-testid={`agent-home-starter-${action.id}`}'), "Agent Home empty/light thread state should expose starter actions");
assert(chatStarter.includes("需要我做什么？"), "Agent Home should show a lightweight starter prompt when there is no user-facing message");

for (const selector of [
  ".codex-home-light [data-testid=\"agent-home-focused\"]",
  ".codex-home-light [data-testid=\"agent-home-focused\"] > aside:first-of-type",
  ".codex-home-light [data-testid=\"agent-home-focused\"] > main",
  ".codex-home-light [data-testid=\"agent-home-side-tabs\"]",
  ".codex-home-light [data-testid=\"agent-home-focused\"] .codex-left-sidebar .codex-left-row",
  ".codex-home-light [data-testid=\"agent-home-focused\"] .codex-composer-blocker",
  ".codex-home-light .codex-toolchain-strip",
  ".codex-home-light .codex-trace-next-step",
  ".codex-home-light .codex-trace-next-label",
  ".codex-home-light .codex-trace-next-copy",
]) {
  assert(css.includes(selector), `Agent Home light/Codex-like CSS missing: ${selector}`);
}

assert(packageJson.scripts?.["verify:agent-home-sidebar"] === "node scripts/verify-agent-home-sidebar-contract.mjs", "agent-home sidebar verifier script missing");
assert(packageJson.scripts?.["verify:phase2"] === "node scripts/verify-phase2.mjs", "phase2 aggregate verifier script missing");
assert(packageJson.scripts?.["verify:phase2-agent-home"] === "node scripts/verify-phase2-agent-home.mjs", "phase2 agent home verifier script missing");
assert(packageJson.scripts?.["verify:phase2-agent-home-browser"] === "node scripts/verify-phase2-agent-home-browser.mjs", "phase2 browser smoke script missing");
assert(doc.includes("npm run verify:phase2"), "Phase 2 doc should include the aggregate verifier command");
assert(doc.includes("npm run verify:phase2-agent-home-browser"), "Phase 2 doc should include the browser smoke command");
assert(doc.includes("phase2-agent-home-browser-collapsed.png"), "Phase 2 doc should name the default collapsed screenshot");
assert(doc.includes("phase2-agent-home-browser-status-open.png"), "Phase 2 doc should name the status-open screenshot");
const phase2BrowserRunner = readProjectFile("scripts/verify-phase2-agent-home-browser.mjs");
assert(phase2BrowserRunner.includes("phase2-agent-home-browser-collapsed.png"), "Phase 2 browser smoke should write the collapsed screenshot");
assert(phase2BrowserRunner.includes("phase2-agent-home-browser-status-open.png"), "Phase 2 browser smoke should write the status-open screenshot");
for (const snippet of [
  "panelRect?.width <= 760",
  "panelRect?.top >= 40",
  "backgroundColor",
  "borderRadius",
  "settings-provider-config-paste-input",
  "settings-parse-provider-config-button",
  "pasteParserDraft",
  "已解析并填入草稿",
  "settings modal should render as a light Codex-style panel",
  "settings modal should stay a lightweight desktop panel",
]) {
  assert(phase2BrowserRunner.includes(snippet), `Phase 2 browser smoke missing Provider settings surface guard: ${snippet}`);
}
const lightEmptyBlocks = Array.from(css.matchAll(/\.codex-home-light \.codex-chat-empty\s*\{[\s\S]*?\}/g)).map((match) => match[0]).join("\n");
assert(lightEmptyBlocks.includes("background: transparent !important"), "Agent Home empty starter should not render as a large filled card");
assert(!lightEmptyBlocks.includes("background: #fbfcfd !important"), "Agent Home empty starter must not keep the old large grey block background");

console.log("phase2-agent-home ok");

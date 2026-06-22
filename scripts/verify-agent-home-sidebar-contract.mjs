import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const component = readProjectFile("src/components/AgentControlCenter.tsx");
const composer = readProjectFile("src/components/WorkbenchComposer.tsx");
const threadHeader = readProjectFile("src/components/WorkbenchThreadHeader.tsx");
const chatStarter = readProjectFile("src/components/WorkbenchChatStarter.tsx");
const threadFilterBar = readProjectFile("src/components/WorkbenchThreadFilterBar.tsx");
const threadListSection = readProjectFile("src/components/WorkbenchThreadListSection.tsx");
const workspaceListSection = readProjectFile("src/components/WorkbenchWorkspaceListSection.tsx");
const css = readProjectFile("src/index.css");
const homeSurface = `${component}\n${composer}\n${threadHeader}`;

const sideTabType = component.match(/type\s+AgentHomeSideTab\s*=\s*([^;]+);/);
assert(sideTabType, "AgentHomeSideTab type not found");
const sideTabTypeText = sideTabType[1];
for (const tab of ["context", "approvals", "files", "diff", "status"]) {
  assert(sideTabTypeText.includes(`"${tab}"`), `AgentHomeSideTab missing ${tab}`);
}
assert(!sideTabTypeText.includes('"model"'), "AgentHomeSideTab must not include model");

const homeSideTabs = component.match(/const\s+homeSideTabs:[\s\S]*?\n\s*\];/);
assert(homeSideTabs, "homeSideTabs declaration not found");
const homeSideTabsText = homeSideTabs[0];
for (const tab of ["context", "approvals", "files", "diff", "status"]) {
  assert(homeSideTabsText.includes(`id: "${tab}"`), `homeSideTabs missing ${tab}`);
}
assert(!homeSideTabsText.includes('id: "model"'), "homeSideTabs must not include model");

assert(!component.includes('setAgentHomeSideTab("model")'), "Agent Home must not route model config into the right sidebar");
assert(!component.includes('setWorkbenchSideTab("model")'), "Workbench side tab must not route to a model panel");
assert(!component.includes('workbenchSideTab === "model"'), "Workbench side title must not special-case model");
assert(!component.includes("agent-home-side-tab-model"), "Agent Home side rail must not render a model tab");
assert(!component.includes("agent-model-drawer"), "Agent Home must not keep the legacy model drawer JSX");
assert(component.includes('data-testid="agent-home-side-return-chat"'), "Agent Home right side panel should expose a visible return-to-chat action");
assert(component.includes('data-testid="agent-home-side-collapse"'), "Agent Home right side panel should expose a visible collapse action");
const returnToChatIndex = component.indexOf('data-testid="agent-home-side-return-chat"');
const returnToChatHandler = component.slice(Math.max(0, returnToChatIndex - 420), returnToChatIndex + 120);
assert(returnToChatHandler.includes("setAgentHomeSidePanelOpen(false);") && returnToChatHandler.includes("focusAgentChat();"), "Return-to-chat should collapse the side panel and focus the composer");
assert(component.includes("回到对话"), "Right side return action should use visible Chinese text");
assert(component.includes("收起"), "Right side collapse action should use visible Chinese text");
assert(component.includes("const hasPinnedThreadRows = pinnedAgentThreads.length > 0"), "Agent Home should track whether pinned thread rows exist");
assert(component.includes("const hasProjectThreadRows = projectAgentThreads.length > 0"), "Agent Home should track whether project thread rows exist");
assert(component.includes("const hasFreeThreadRows = plainAgentThreads.length > 0"), "Agent Home should track whether free thread rows exist");
assert(component.includes('const showPinnedThreadSection = agentThreadKindFilter !== "free" && (hasPinnedThreadRows || agentThreadKindFilter === "pinned")'), "Agent Home should hide empty pinned groups unless pinned filter is active");
assert(component.includes('const showProjectThreadSection = agentThreadKindFilter !== "free" && (hasProjectThreadRows || agentThreadKindFilter === "project")'), "Agent Home should hide empty project thread groups unless project filter is active");
assert(component.includes('const showFreeThreadSection = agentThreadKindFilter !== "project" && (hasFreeThreadRows || agentThreadKindFilter === "free")'), "Agent Home should hide empty free thread groups unless free filter is active");
assert(component.includes("const composerHasPendingInput = Boolean(threadComposer.trim() || threadComposerAttachments.length)"), "Agent Home should only show the composer model blocker after pending input, attachments, or a model notice");
assert(component.includes('const composerHasModelNotice = Boolean(agentChatDetail && (agentChatStatus === "error" || agentChatStatus === "setup-needed"))'), "Agent Home should track explicit model setup/error notices");
assert(component.includes('const composerHasRetryNotice = Boolean(lastUserThreadMessage && (agentChatStatus === "error" || agentChatStatus === "setup-needed"))'), "Agent Home should track retryable setup/error notices");
assert(component.includes("const showComposerSendModeStatus = !canSendToModelNow"), "Agent Home should centralize composer blocker visibility");
assert(homeSurface.includes("{showSendModeStatus && (") || homeSurface.includes("{showComposerSendModeStatus && ("), "Composer blocker should use showComposerSendModeStatus");
assert(component.includes("function providerConfigReadiness(settings: ApiSettings)"), "Agent Home should centralize Provider config readiness diagnostics");
assert(component.includes('missing.push("接口地址")'), "Provider config readiness should name missing API URL");
assert(component.includes('missing.push("模型 ID")'), "Provider config readiness should name missing model ID");
assert(component.includes('missing.push("API key")'), "Provider config readiness should name missing API key");
assert(component.includes("const providerReadiness = providerConfigReadiness(settings)"), "Agent Home should derive current provider readiness");
assert(component.includes("providerReadiness.detail"), "Agent Home blocked detail should use provider readiness detail");
assert(component.includes("providerReadiness.label"), "Agent Home short status should name the missing config item");
assert(homeSurface.includes('data-testid="agent-home-header-mode-switch"'), "Agent Home header should expose a clear chat/project mode switch");
assert(component.includes("const homeHeaderModeStatus = projectModeActive"), "Agent Home header should summarize whether project mode has a bound directory");
assert(component.includes("const homeHeaderModeTitle = projectModeActive"), "Agent Home header mode switch should explain chat/project mode boundaries");
assert(component.includes("对话模式不强制绑定项目目录"), "Agent Home should explain free chat mode does not require a project directory");
assert(component.includes("项目模式建议绑定本机文件夹"), "Agent Home should explain project mode binding when no local directory is present");
assert(component.includes("selectedWorkspaceScanIndex.fileCount"), "Agent Home header should expose indexed project file count when available");
assert(component.includes('? "需要配置模型"'), "Public model state should clearly say when model setup is missing");
assert(component.includes('? "仅保存到线程"'), "Public model state should distinguish local/offline save-only mode");
assert(component.includes("本地模型服务未连接，消息会先保存到线程。"), "Local model offline detail should avoid implying a hidden working model");
assert(component.includes("仅保存到线程：连接模型后可继续生成。"), "Agent Home save-only banner should be clear and actionable");
assert(!component.includes('const publicModelStateLabel = modelRuntimeReady ? "模型可用" : providerRuntimeProbeFailure ? "模型异常" : "暂存模式"'), "Public model state must not collapse all unavailable states into 暂存模式");
assert(component.includes(' : homeModelStatusLabel'), "Composer model pill should keep the visible text short while checking or blocked");
assert(component.includes("当前配置档案：${settings.modelName || settings.modelId || \"未命名模型\"}"), "Composer model title should still expose the saved custom model while checking or blocked");
assert(component.includes("不代表本地模型服务已启动"), "Composer model title should distinguish saved config profiles from live local model availability");
const composerStatusIndex = homeSurface.indexOf('data-testid="composer-send-mode-status"');
assert(composerStatusIndex >= 0, "composer-send-mode-status not found");
const composerStatusPrefix = homeSurface.slice(Math.max(0, composerStatusIndex - 400), composerStatusIndex);
assert(!composerStatusPrefix.includes("{!canSendToModelNow && !agentChatBusy && ("), "Composer model blocker must not render on idle home just because model is unavailable");

const modelPanel = component.match(/const\s+openWorkbenchModelPanel\s*=[\s\S]*?\n\s*\},\s*\[updateWorkbenchLayout\]\);/);
assert(modelPanel, "openWorkbenchModelPanel callback not found");
assert(modelPanel[0].includes('activeView: "providers"'), "Model config should open the providers/model center view");
assert(modelPanel[0].includes("agentHomeFocused: false"), "Model config should leave focused Agent Home instead of occupying the right sidebar");

const quickSettings = component.match(/const\s+openQuickModelSettings\s*=[\s\S]*?\n\s*\},\s*\[onOpenSettings\]\);/);
assert(quickSettings, "openQuickModelSettings callback not found");
assert(quickSettings[0].includes("onOpenSettings()"), "Quick model settings should open the lightweight settings modal");
assert(!quickSettings[0].includes('activeView: "providers"'), "Quick model settings must not jump to the full Provider workbench");

assert(component.includes('label: "打开模型设置"'), "Command palette should expose the model settings action");
assert(component.includes('label: selectedWorkspaceRootProfile?.rootPath?.trim() ? "刷新项目目录索引" : "绑定项目目录"'), "Command palette should expose a project index refresh action");
assert(component.includes("scanReady ? `扫描 ${formatTime(scanIndex.at)}`"), "Workspace rows should expose last scan time as a compact chip");

assert(component.includes("<WorkbenchChatStarter"), "Agent Home should mount a dedicated chat starter component");
assert(component.includes("onOpenModelSettings={openQuickModelSettings}"), "Agent Home starter should open lightweight model settings");
assert(chatStarter.includes('data-testid="agent-home-empty-model-link"'), "Agent Home starter should expose the empty-state model link");
assert(chatStarter.includes("onClick={onOpenModelSettings}"), "Agent Home starter model link should use the lightweight settings callback");

for (const testId of ["composer-model-pill", "composer-open-model"]) {
  const index = homeSurface.indexOf(`data-testid="${testId}"`);
  assert(index >= 0, `${testId} not found`);
  const before = homeSurface.slice(Math.max(0, index - 800), index);
  assert(before.includes("onClick={openQuickModelSettings}") || before.includes("onClick={onOpenModelSettings}"), `${testId} should open lightweight model settings`);
  assert(!before.includes("onClick={openWorkbenchModelPanel}"), `${testId} should not jump to the full Provider workbench`);
}

for (const testId of [
  "agent-home-new-free-thread",
  "agent-home-more-menu",
  "agent-home-more-menu-panel",
  "agent-home-new-project-thread",
  "agent-home-workspace-create",
  "agent-home-footer-archive-toggle",
  "agent-home-composer-attachment-receipt",
  "agent-home-composer-attachment-card",
  "composer-clear-attachments",
]) {
  assert(homeSurface.includes(`data-testid="${testId}"`), `Agent Home left navigation missing ${testId}`);
}
for (const snippet of [
  "homeAttachmentTransport = buildAgentAttachmentTransportEvent(threadComposerAttachments)",
  "attachmentTransport={homeAttachmentTransport}",
  "data-has-model-payload={attachmentTransport.hasModelPayload ? \"true\" : \"false\"}",
  "data-image-count={attachmentTransport.imageAttachmentCount}",
  "data-parsed-file-count={attachmentTransport.parsedFileCount}",
  "data-metadata-file-count={attachmentTransport.metadataFileCount}",
  "data-failed-file-count={attachmentTransport.failedFileCount}",
  "data-rejected-from-model={attachmentRejectedFromModel ? \"true\" : \"false\"}",
  "未进入模型请求",
  "附件回执",
]) {
  assert(homeSurface.includes(snippet), `Agent Home attachment receipt contract missing: ${snippet}`);
}
assert(component.includes("<WorkbenchThreadFilterBar"), "Agent Home should mount a dedicated thread filter bar component");
assert(threadFilterBar.includes('data-testid={`agent-home-thread-filter-${item.key}`}'), "Agent Home thread filter buttons need stable test ids");
for (const filter of ['{ key: "all", label: "全部" }', '{ key: "pinned", label: "置顶" }', '{ key: "project", label: "项目" }', '{ key: "free", label: "自由" }']) {
  assert(threadFilterBar.includes(filter), `Agent Home missing thread filter: ${filter}`);
}

assert(!component.includes('data-testid={`agent-thread-row-pin-${thread.id}`}'), "Thread row should not show a separate pin button");
assert(!component.includes('data-testid={`workbench-sidebar-project-pin-${item.book.id}`}'), "Project sidebar row should not show a separate pin button");
assert(!component.includes('data-testid={`agent-home-workspace-pin-${item.book.id}`}'), "Agent Home project row should not show a separate pin button");
assert(component.includes("<WorkbenchThreadListSection"), "Agent Home should mount a dedicated thread list section component");
assert(component.includes("<WorkbenchWorkspaceListSection"), "Agent Home should mount a dedicated workspace list section component");

for (const snippet of [
  'data-testid={`agent-thread-row-menu-${thread.id}`}',
  'data-testid={`agent-thread-menu-open-${thread.id}`}',
  'data-testid={`agent-thread-menu-pin-${thread.id}`}',
  'data-testid={`agent-thread-menu-rename-${thread.id}`}',
  'data-testid={`agent-thread-menu-branch-${thread.id}`}',
  'data-testid={`agent-thread-menu-export-${thread.id}`}',
  'data-testid={`agent-thread-menu-archive-${thread.id}`}',
  'data-testid={`agent-thread-menu-delete-${thread.id}`}',
]) {
  assert(threadListSection.includes(snippet), `Agent thread row actions should keep Codex-style management affordance: ${snippet}`);
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
  assert(workspaceListSection.includes(snippet), `Agent Home workspace row actions should keep Codex-style project management affordance: ${snippet}`);
}

for (const snippet of [
  "onTogglePin={togglePinAgentThread}",
  "requestAgentThreadAction(threadId, kind",
  "onBranch={branchAgentThread}",
  "onExport={exportAgentThread}",
  "onRestore={restoreAgentThread}",
  "onTogglePin={togglePinWorkspace}",
  "requestWorkspaceAction(workspaceId, kind",
  "onOpenWorkspace={selectWorkspaceFromAgentHome}",
  "onOpenFiles={openWorkspaceFilesFromAgentHome}",
]) {
  assert(component.includes(snippet), `Agent thread action wiring missing: ${snippet}`);
}

for (const selector of [
  ".codex-home-light .codex-model-drawer",
  ".codex-home-light .codex-model-status-card",
  ".codex-home-light .codex-model-current-card",
  ".codex-home-light .codex-model-quick-config",
  ".codex-home-light .codex-model-more",
]) {
  assert(!css.includes(selector), `Legacy model drawer CSS should not remain: ${selector}`);
}
assert(css.includes(".codex-home-light .codex-side-header-button-text"), "Right side header buttons should support visible text labels");
assert(css.includes("width: auto !important"), "Right side return button should not be forced into a tiny icon-only width");

console.log("agent-home-sidebar-contract ok");

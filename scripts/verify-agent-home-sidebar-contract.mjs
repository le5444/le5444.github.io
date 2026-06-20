import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const component = readProjectFile("src/components/AgentControlCenter.tsx");
const css = readProjectFile("src/index.css");

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
assert(component.includes("{showComposerSendModeStatus && ("), "Composer blocker should use showComposerSendModeStatus");
const composerStatusIndex = component.indexOf('data-testid="composer-send-mode-status"');
assert(composerStatusIndex >= 0, "composer-send-mode-status not found");
const composerStatusPrefix = component.slice(Math.max(0, composerStatusIndex - 400), composerStatusIndex);
assert(!composerStatusPrefix.includes("{!canSendToModelNow && !agentChatBusy && ("), "Composer model blocker must not render on idle home just because model is unavailable");

const modelPanel = component.match(/const\s+openWorkbenchModelPanel\s*=[\s\S]*?\n\s*\},\s*\[updateWorkbenchLayout\]\);/);
assert(modelPanel, "openWorkbenchModelPanel callback not found");
assert(modelPanel[0].includes('activeView: "providers"'), "Model config should open the providers/model center view");
assert(modelPanel[0].includes("agentHomeFocused: false"), "Model config should leave focused Agent Home instead of occupying the right sidebar");

const quickSettings = component.match(/const\s+openQuickModelSettings\s*=[\s\S]*?\n\s*\},\s*\[onOpenSettings\]\);/);
assert(quickSettings, "openQuickModelSettings callback not found");
assert(quickSettings[0].includes("onOpenSettings()"), "Quick model settings should open the lightweight settings modal");
assert(!quickSettings[0].includes('activeView: "providers"'), "Quick model settings must not jump to the full Provider workbench");

for (const testId of ["agent-home-empty-model-link", "composer-model-pill", "composer-open-model"]) {
  const index = component.indexOf(`data-testid="${testId}"`);
  assert(index >= 0, `${testId} not found`);
  const before = component.slice(Math.max(0, index - 600), index);
  assert(before.includes("onClick={openQuickModelSettings}"), `${testId} should open lightweight model settings`);
  assert(!before.includes("onClick={openWorkbenchModelPanel}"), `${testId} should not jump to the full Provider workbench`);
}

for (const testId of [
  "agent-home-new-free-thread",
  "agent-home-more-menu",
  "agent-home-more-menu-panel",
  "agent-home-new-project-thread",
  "agent-home-workspace-create",
  "agent-home-footer-archive-toggle",
]) {
  assert(component.includes(`data-testid="${testId}"`), `Agent Home left navigation missing ${testId}`);
}
assert(component.includes('data-testid={`agent-home-thread-filter-${item.key}`}'), "Agent Home thread filter buttons need stable test ids");
for (const filter of ['{ key: "all" as const, label: "全部" }', '{ key: "pinned" as const, label: "置顶" }', '{ key: "project" as const, label: "项目" }', '{ key: "free" as const, label: "自由" }']) {
  assert(component.includes(filter), `Agent Home missing thread filter: ${filter}`);
}

for (const snippet of [
  'data-testid={`agent-thread-row-pin-${thread.id}`}',
  'data-testid={`agent-thread-row-menu-${thread.id}`}',
  'data-testid={`agent-thread-menu-open-${thread.id}`}',
  'data-testid={`agent-thread-menu-pin-${thread.id}`}',
  'data-testid={`agent-thread-menu-rename-${thread.id}`}',
  'data-testid={`agent-thread-menu-branch-${thread.id}`}',
  'data-testid={`agent-thread-menu-export-${thread.id}`}',
  'data-testid={`agent-thread-menu-archive-${thread.id}`}',
  'data-testid={`agent-thread-menu-delete-${thread.id}`}',
]) {
  assert(component.includes(snippet), `Agent thread row actions should keep Codex-style management affordance: ${snippet}`);
}

for (const snippet of [
  'togglePinAgentThread(thread.id)',
  'requestAgentThreadAction(thread.id, "rename")',
  'requestAgentThreadAction(thread.id, "archive")',
  'requestAgentThreadAction(thread.id, "delete")',
  'branchAgentThread(thread.id)',
  'exportAgentThread(thread.id)',
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

console.log("agent-home-sidebar-contract ok");

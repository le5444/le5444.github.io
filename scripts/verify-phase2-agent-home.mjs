import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const doc = readProjectFile("docs/phase2-agent-home-acceptance-20260619.md");
const component = readProjectFile("src/components/AgentControlCenter.tsx");
const css = readProjectFile("src/index.css");
const packageJson = JSON.parse(readProjectFile("package.json"));
const indexHtml = readProjectFile("index.html");

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
  'data-testid="composer-model-pill"',
]) {
  assert(component.includes(snippet), `Agent Home structural contract missing: ${snippet}`);
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
  'data-testid={`agent-home-thread-filter-${item.key}`}',
  'data-testid="agent-home-footer-archive-toggle"',
  'data-testid={`agent-thread-row-pin-${thread.id}`}',
  'data-testid={`agent-thread-row-menu-${thread.id}`}',
  'data-testid={`agent-thread-menu-rename-${thread.id}`}',
  'data-testid={`agent-thread-menu-delete-${thread.id}`}',
]) {
  assert(component.includes(snippet), `Agent Home left navigation contract missing: ${snippet}`);
}

assert(component.includes("const showComposerSendModeStatus = !canSendToModelNow"), "composer model blocker must be controlled by a focused visibility flag");
assert(component.includes("{showComposerSendModeStatus && ("), "composer model blocker should not render directly from model unavailable state");
assert(component.includes("const homeLeftContextStripVisible = projectModeActive"), "left mode strip should only appear for project mode");
assert(component.includes("homeLeftContextStripVisible && ("), "left mode strip must be conditionally rendered");
assert(component.includes('data-testid="agent-home-left-mode-strip"'), "left mode strip needs a stable test id when visible");
assert(doc.includes("自由对话默认不显示"), "Phase 2 doc should name the free-chat left-rail noise rule");
assert(component.includes("const [agentHomeSidePanelOpen, setAgentHomeSidePanelOpen] = useState(false)"), "Agent Home right rail should default to collapsed");
assert(component.includes('data-panel-state={agentHomeSidePanelOpen ? "open" : "collapsed"}'), "Agent Home right rail needs an explicit DOM state");
assert(component.includes('aria-label="右侧辅助栏"'), "Agent Home right rail needs a clear accessible label");
assert(doc.includes('data-panel-state="collapsed"'), "Phase 2 doc should require collapsed right-rail DOM evidence");

for (const selector of [
  ".codex-home-light [data-testid=\"agent-home-focused\"]",
  ".codex-home-light [data-testid=\"agent-home-focused\"] > aside:first-of-type",
  ".codex-home-light [data-testid=\"agent-home-focused\"] > main",
  ".codex-home-light [data-testid=\"agent-home-side-tabs\"]",
  ".codex-home-light [data-testid=\"agent-home-focused\"] .codex-left-sidebar .codex-left-row",
  ".codex-home-light [data-testid=\"agent-home-focused\"] .codex-composer-blocker",
  ".codex-home-light .codex-toolchain-strip",
]) {
  assert(css.includes(selector), `Agent Home light/Codex-like CSS missing: ${selector}`);
}

assert(packageJson.scripts?.["verify:agent-home-sidebar"] === "node scripts/verify-agent-home-sidebar-contract.mjs", "agent-home sidebar verifier script missing");
assert(packageJson.scripts?.["verify:phase2"] === "node scripts/verify-phase2.mjs", "phase2 aggregate verifier script missing");
assert(packageJson.scripts?.["verify:phase2-agent-home"] === "node scripts/verify-phase2-agent-home.mjs", "phase2 agent home verifier script missing");
assert(packageJson.scripts?.["verify:phase2-agent-home-browser"] === "node scripts/verify-phase2-agent-home-browser.mjs", "phase2 browser smoke script missing");
assert(doc.includes("npm run verify:phase2"), "Phase 2 doc should include the aggregate verifier command");
assert(doc.includes("npm run verify:phase2-agent-home-browser"), "Phase 2 doc should include the browser smoke command");

console.log("phase2-agent-home ok");

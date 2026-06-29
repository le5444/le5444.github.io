import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function run(label, command, args) {
  console.log(`\n[phase3-project-mode] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`[phase3-project-mode] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[phase3-project-mode] ${label} failed`);
    process.exit(result.status || 1);
  }
}

const doc = readProjectFile("docs/phase3-project-mode-acceptance-20260619.md");
const component = readProjectFile("src/components/AgentControlCenter.tsx");
const composer = readProjectFile("src/components/WorkbenchComposer.tsx");
const threadHeader = readProjectFile("src/components/WorkbenchThreadHeader.tsx");
const homeSurface = `${component}\n${composer}\n${threadHeader}`;
const agentRunReplayScript = readProjectFile("scripts/verify-agent-run-replay.mjs");
const phase3ProjectBrowserScript = readProjectFile("scripts/verify-phase3-project-browser.mjs");
const packageJson = JSON.parse(readProjectFile("package.json"));

for (const phrase of [
  "## 1. 核心链路",
  "## 2. 卡点与验证",
  "## 3. API / Gateway 优先原则",
  "## 5. Spec 成功标准",
  "核心链路是什么",
  "每个卡点怎么验证",
  "能不能优先用 API / Gateway",
  "spec 文档里有没有成功标准",
  "选择 / 新建项目对话",
  "绑定本机工作目录",
  "workspace_scan 目录索引",
  "上次扫描时间",
  "手动刷新入口",
  "不是实时监听文件变化",
  "不能把它宣传成已经完成实时目录监听",
  "read_file 读取预览",
  "Provider 请求收到文件 marker",
  "生成 Changes / Diff 草案",
  "write_file 审批草案",
  "Gateway 审批执行",
  "写后复核",
  "自动用 `read_file` 读取目标文件片段",
  "不能假装已复核",
  "显示左侧项目模式条和 composer 项目条",
  "避免“点了项目但仍是自由聊天”的假入口",
  "项目文件工作流",
  "当前步骤",
  "不把项目工具散成一堆首页按钮",
  "文件 / 目录来源追踪",
  "path:",
  "root:",
  "files:",
  "`run_command` 默认只验证",
  "npm run verify:phase3",
  "npm run verify:phase3-project-mode",
  "npm run verify:phase3-project-browser",
]) {
  assert(doc.includes(phrase), `Phase 3 acceptance doc missing: ${phrase}`);
}

for (const script of [
  "verify:phase2",
  "verify:phase3",
  "verify:workspace-root",
  "verify:workspace-scan",
  "verify:workspace-read",
  "verify:workspace-read-context",
  "verify:phase3-project-browser",
  "verify:agent-run-replay",
  "verify:write-file-diff",
  "verify:executor-bridge",
  "verify:gateway-command-approval",
  "verify:phase3-project-mode",
]) {
  assert(packageJson.scripts?.[script], `package script missing: ${script}`);
}
for (const snippet of [
  "read replay row has path meta",
  "workspace_scan replay row has root meta",
  "workspace_scan replay row has file count meta",
  "tool replay markdown includes workspace root marker",
  "direct read keeps path meta",
]) {
  assert(agentRunReplayScript.includes(snippet), `Project mode should guard Tool Trace path/root evidence through agent-run-replay: ${snippet}`);
}
for (const snippet of [
  "Phase3 browser read_file context marker",
  "createMockGatewayServer",
  "workspace_scan",
  "read_file",
  "context_pack",
  "Gateway read_file 预览",
  "完整正文未持久保存",
  "Provider request must include read_file preview marker",
  "Phase3 mock queued write_file for approval",
  "Phase3 mock executed write_file approval",
  "Phase3 write_file executed marker",
  "write_file approval draft after Diff review",
  "write_file should be submitted as an approval draft without execute=true",
  "approval_decide should execute the queued write_file with request execute=true",
  "write_file execution should trigger read_file verification with execute=true",
  "hasDiffEventInThreadStorage",
  "hasApprovalEventInThreadStorage",
  "hasApprovalExecutedInThreadStorage",
  "hasWriteVerificationMessageInThreadStorage",
  "hasWriteVerificationContextInThreadStorage",
  "hasExecutedMarkerInThreadStorage",
]) {
  assert(phase3ProjectBrowserScript.includes(snippet), `Phase 3 browser smoke should prove project file context reaches Provider request: ${snippet}`);
}

for (const snippet of [
  'data-testid="agent-home-new-project-thread"',
  'data-testid="composer-open-files"',
  'data-testid="composer-scan-workspace"',
  'data-testid="composer-bind-workspace-root"',
  'data-testid="composer-project-strip"',
  'data-testid="agent-home-header-mode-switch"',
  'data-testid="agent-home-left-mode-strip"',
  'data-testid="workbench-side-project-root"',
  'data-testid="workbench-side-scan-index"',
  'data-testid="workbench-side-scan-refresh-status"',
  'data-testid="workbench-side-scan-refresh-button"',
  'data-testid="workbench-side-diff-next-step"',
  'data-testid="workbench-side-approval-next-step"',
  'data-testid="home-diff-review-actions"',
  'data-testid="home-diff-accept-all"',
  'data-testid="home-diff-reject-all"',
  'data-testid="home-diff-create-approval"',
  'data-testid={`home-approval-row-${id}`}',
  'testId="editor-approval-execute-button"',
  'testId="bottom-approval-execute-button"',
  'data-testid="workbench-files-workflow"',
  'data-testid="workbench-files-next-action"',
  'data-testid={`workbench-files-workflow-step-${step.id}`}',
  'data-testid={`workbench-files-next-action-${action.id}`}',
]) {
  assert(homeSurface.includes(snippet), `Project mode UI contract missing: ${snippet}`);
}
assert(component.includes('data-testid={`agent-home-side-tab-${tab.id}`}'), "Agent Home side tabs need stable dynamic test ids");
for (const sideTab of ['id: "files"', 'id: "diff"', 'id: "approvals"']) {
  assert(component.includes(sideTab), `Project mode side tab missing: ${sideTab}`);
}
assert(component.includes("文件预览已挂入对话"), "read_file preview attach should produce visible runtime evidence");
assert(component.includes("上次扫描"), "Project scan index should show the last scan time");
assert(component.includes("手动刷新，不是实时监听"), "Project scan index should avoid claiming live directory watching");
assert(component.includes("手动刷新目录索引"), "Project scan index should expose a manual refresh action");
assert(component.includes("完整正文未持久保存"), "read_file preview attach should keep the preview-only persistence boundary visible");
assert(component.includes('persistence_boundary: "完整正文未持久保存"'), "read_file preview attach record should keep the persistence boundary");
assert(component.includes('setAgentHomeSideTab(bindWorkspace ? "files" : "context")'), "new project thread should open the files side tab");
assert(component.includes("setAgentHomeSidePanelOpen(Boolean(bindWorkspace))"), "new project thread should open the side panel when bound to a project");
assert(component.includes("setAgentWorkMode(bindWorkspace ? \"project\" : \"chat\")"), "new project thread should switch work mode based on workspace binding");
assert(component.includes("homeHeaderModeStatus"), "project mode should expose binding/index status in the main thread header");
assert(component.includes("homeHeaderModeTitle"), "project mode should keep chat/project boundary in the main thread header title");
assert(component.includes("const homeLeftContextStripVisible = projectModeActive"), "project mode should control the left project strip");
assert(component.includes("projectModeActive && ("), "project mode should conditionally render project-only composer controls");
assert(component.includes("openProjectRootBinderFromComposer"), "project composer should expose the root binder action");
assert(component.includes("runWorkspaceRootScanPreview(true)"), "project composer should expose the workspace scan action");
for (const snippet of [
  'source: "write_file_approval_verify"',
  'type: "write_file_verify_read"',
  'type: "write_file_verify_read_result"',
  'type: "write_file_verify_read_error"',
  'type: "write_file_verify_read_skipped"',
  'title: "写入后 read_file 复核"',
  'title: "写入后 read_file 复核完成"',
  'title: "写入后文件复核"',
  '挂载写入后 read_file 复核',
  'reviewStatus: verifyStatus === "ok" ? "verified" : "failed"',
  'reviewStatus: "skipped"',
  '文件片段已挂入线程上下文',
  '复核预览已截断，完整正文未持久保存。',
]) {
  assert(component.includes(snippet), `write_file approval should keep automatic read_file verification evidence: ${snippet}`);
}
for (const snippet of [
  "workbenchFileWorkflowSteps",
  "activeWorkbenchFileWorkflowStep",
  "workbenchFileNextActions",
  "读文件",
  "挂上下文",
  "生成 Diff",
  "进入审批",
  "把项目模式收成一条路：读文件、挂上下文、生成 Diff，再进入审批。",
]) {
  assert(component.includes(snippet), `Project file workflow should keep the IDE-like next-step path: ${snippet}`);
}

for (const snippet of [
  'action === "read_file" || action === "workspace_scan"',
  'request.action === "write_file"',
  'createDiffDraftFromWriteFileRequest',
  'setCommandDiffHunks',
  'bridgeAction("write_file", request)',
  'bridgeAction("read_file", verifyRequest, { execute: true })',
  "DEFAULT_COMMAND_APPROVAL_TARGET_PATH",
]) {
  assert(component.includes(snippet), `Project tool chain wiring missing: ${snippet}`);
}

const checks = [
  ["目录绑定计划", process.execPath, ["scripts/verify-workspace-root-binding.mjs"]],
  ["目录扫描索引", process.execPath, ["scripts/verify-workspace-scan-index.mjs"]],
  ["文件读取预览和预览 Diff", process.execPath, ["scripts/verify-workspace-read-preview.mjs"]],
  ["文件预览注入模型上下文", process.execPath, ["scripts/verify-workspace-read-context-injection.mjs"]],
  ["项目文件浏览器闭环", process.execPath, ["scripts/verify-phase3-project-browser.mjs"]],
  ["项目工具来源回放", process.execPath, ["scripts/verify-agent-run-replay.mjs"]],
  ["写文件 Diff 草案", process.execPath, ["scripts/verify-write-file-diff-draft.mjs"]],
  ["Bridge 请求协议", process.execPath, ["scripts/verify-executor-bridge.mjs"]],
  ["Agent Loop 写文件 Diff 截获", process.execPath, ["scripts/verify-agent-loop-write-file-intercept.mjs"]],
  ["Agent Loop 读写审查", process.execPath, ["scripts/verify-agent-loop-read-write-review.mjs"]],
  ["Gateway 命令审批", "python", ["scripts/verify-gateway-command-approval.py"]],
];

for (const [label, command, args] of checks) {
  run(label, command, args);
}

console.log("\nphase3-project-mode ok");

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
  "read_file 读取预览",
  "生成 Changes / Diff 草案",
  "write_file 审批草案",
  "Gateway 审批执行",
  "`run_command` 默认只验证",
  "npm run verify:phase3",
  "npm run verify:phase3-project-mode",
]) {
  assert(doc.includes(phrase), `Phase 3 acceptance doc missing: ${phrase}`);
}

for (const script of [
  "verify:phase2",
  "verify:phase3",
  "verify:workspace-root",
  "verify:workspace-scan",
  "verify:workspace-read",
  "verify:write-file-diff",
  "verify:executor-bridge",
  "verify:gateway-command-approval",
  "verify:phase3-project-mode",
]) {
  assert(packageJson.scripts?.[script], `package script missing: ${script}`);
}

for (const snippet of [
  'data-testid="agent-home-new-project-thread"',
  'data-testid="composer-open-files"',
  'data-testid="composer-scan-workspace"',
  'data-testid="composer-bind-workspace-root"',
  'data-testid="workbench-side-project-root"',
  'data-testid="workbench-side-scan-index"',
  'data-testid="workbench-side-diff-next-step"',
  'data-testid="workbench-side-approval-next-step"',
]) {
  assert(component.includes(snippet), `Project mode UI contract missing: ${snippet}`);
}
assert(component.includes('data-testid={`agent-home-side-tab-${tab.id}`}'), "Agent Home side tabs need stable dynamic test ids");
for (const sideTab of ['id: "files"', 'id: "diff"', 'id: "approvals"']) {
  assert(component.includes(sideTab), `Project mode side tab missing: ${sideTab}`);
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

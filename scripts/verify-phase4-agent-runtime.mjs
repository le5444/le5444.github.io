import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function run(label, command, args) {
  console.log(`\n[phase4-agent-runtime] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`[phase4-agent-runtime] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[phase4-agent-runtime] ${label} failed`);
    process.exit(result.status || 1);
  }
}

const doc = readProjectFile("docs/phase4-agent-runtime-acceptance-20260619.md");
const component = readProjectFile("src/components/AgentControlCenter.tsx");
const agentLoop = readProjectFile("src/os/kernel/agent-loop.ts");
const agentLoopBridge = readProjectFile("src/os/kernel/agent-loop-bridge.ts");
const executorBridge = readProjectFile("src/utils/executor-bridge.ts");
const contextPack = readProjectFile("src/utils/agent-context-pack.ts");
const healthcheck = readProjectFile("bridge/healthcheck_bridge.py");
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
  "Runbook 归纳当前阶段",
  "Instruction Stack 注入项目规则",
  "context_pack 汇总线程上下文",
  "解析 <bridge-request>",
  "tool result 回灌模型继续推理",
  "Worker / runtime_events 记录后台任务",
  "npm run verify:phase4-agent-runtime",
  "npm run verify:phase4",
]) {
  assert(doc.includes(phrase), `Phase 4 acceptance doc missing: ${phrase}`);
}

for (const script of [
  "verify:agent-loop-tools",
  "verify:agent-loop-bridge",
  "verify:agent-loop-resume",
  "verify:agent-loop-resume-prompt",
  "verify:agent-run-replay",
  "verify:agent-run-report-scope",
  "verify:agent-thread-store",
  "verify:phase3",
  "verify:phase4",
  "verify:phase4-agent-runtime",
]) {
  assert(packageJson.scripts?.[script], `package script missing: ${script}`);
}

for (const snippet of [
  "Agent Loop 预取 context_pack",
  "Phase 4+5+6: Act/Verify/Writeback Loop",
  "pendingReviews.length ? \"Agent Loop 已暂停，等待 Diff 审查或审批。\"",
  "buildWriteFileDiffDraftFromPayload",
  "async function callGateway",
  "shouldExecuteReadOnlyBridgeAction(action)",
  "onToolCall",
  "onLoopPrompt",
]) {
  assert(agentLoop.includes(snippet), `Agent Loop runtime contract missing: ${snippet}`);
}

for (const action of [
  "runtime_events",
  "memory_status",
  "memory_retrieve",
  "skill_route",
  "worker_status",
]) {
  assert(agentLoopBridge.includes(`"${action}"`), `Agent Loop Bridge safe action missing: ${action}`);
}

for (const action of [
  "memory_retrieve",
  "context_pack",
  "skill_route",
  "skill_run",
  "worker_run",
  "worker_status",
  "runtime_events",
  "swarm_bootstrap",
]) {
  assert(executorBridge.includes(`"${action}"`), `Executor Bridge action missing: ${action}`);
}
assert(executorBridge.includes("skill_run 只有 Gateway 显式 --execute-skill 且 payload.execute=true"), "executor bridge must gate skill_run");
assert(executorBridge.includes("worker_run 的 model_task 需要 execute_model=true"), "executor bridge must gate model worker execution");

for (const snippet of [
  'action: "skill_route"',
  'action: "memory_retrieve"',
  "activeSkills",
  "toolPolicy",
  "excludedToolScopes",
]) {
  assert(contextPack.includes(snippet), `context_pack contract missing: ${snippet}`);
}

for (const snippet of [
  'add("memory_autodream", memory)',
  'add("skill_router", skill_router)',
  'add("skill_runtime", skill_runtime)',
  'add("worker_job", worker)',
  'add("swarm_bootstrap", swarm_bootstrap)',
  'assert_true("memory_retrieve" in pack.get("schema", {}).get("uses", [])',
  'assert_true("skill_route" in pack.get("schema", {}).get("uses", [])',
]) {
  assert(healthcheck.includes(snippet), `Gateway healthcheck evidence missing: ${snippet}`);
}

for (const snippet of [
  "deriveAgentThreadRunbook",
  "createAgentThreadRunbookAttachment",
  "createInstructionStackAttachment",
  "recordThreadContextSnapshot",
  "runtimeReplayRowsFromLog",
  "runtimeLogMatchesThreadContext",
  "replay_rows",
  "buildAgentDirectChatToolReplayRows",
  'type: "bridge_round_complete"',
  "buildAgentRunReplayMarkdown",
  "## 证据范围",
  "按 `agent_context.thread_id` 过滤后的 direct_chat / agent_loop 工具证据",
  "Agent Loop / 直接对话 / 最近运行日志段同样按当前 Thread ID 过滤。",
  "runtimeLogs: runtimeLogRows.filter((entry) => runtimeLogMatchesThreadContext(entry, thread.id))",
  "currentThreadRunReports",
  "latestCurrentThreadRunReport",
  "filterRunReportsForThread",
  "latestRunReportForThread",
  "planRunReportAttachToThread",
  "resolveRunReportWorkspaceScope",
  "打开当前线程运行报告",
  "当前线程报告",
  "activeEditorRunReportAttachBlocked",
  "run_report_attach_blocked",
  "report_thread_id",
  'bridgeAction("runtime_events"',
  'bridgeAction("worker_status"',
  'bridgeAction("memory_status"',
  'bridgeAction("skill_route"',
  'data-testid="workbench-side-agent-loop-run"',
  'data-testid="workbench-side-agent-loop-resume"',
  'data-testid="workbench-side-worker-quicklook"',
  'data-testid="workbench-side-run-report-open"',
  'data-testid="home-runtime-summary"',
  'data-testid="home-runtime-log-details"',
  'data-testid="home-toolchain-strip"',
  "codex-toolchain-step",
  'data-testid="home-context-attach-runbook"',
  'data-testid="home-context-attach-skills"',
]) {
  assert(component.includes(snippet), `Agent runtime UI/wiring missing: ${snippet}`);
}

const checks = [
  ["Agent Loop 工具链", process.execPath, ["scripts/verify-agent-loop-tools.mjs"]],
  ["Agent Loop Bridge 回灌", process.execPath, ["scripts/verify-agent-loop-bridge.mjs"]],
  ["审批续跑状态", process.execPath, ["scripts/verify-agent-loop-resume-state.mjs"]],
  ["审批续跑提示", process.execPath, ["scripts/verify-agent-loop-resume-prompt.mjs"]],
  ["任务回放报告", process.execPath, ["scripts/verify-agent-run-replay.mjs"]],
  ["运行报告线程作用域", process.execPath, ["scripts/verify-agent-run-report-scope.mjs"]],
  ["线程/上下文/分支存储", process.execPath, ["scripts/verify-agent-thread-store.mjs"]],
];

for (const [label, command, args] of checks) {
  run(label, command, args);
}

console.log("\nphase4-agent-runtime ok");

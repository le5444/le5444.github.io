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
const toolTracePanel = readProjectFile("src/components/WorkbenchToolTracePanel.tsx");
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
  "Phase 3 read_file 预览必须继续进入模型请求上下文",
  "直接对话请求追踪",
  "request:...",
  "read_file、run_command 审批和 write_file Diff",
  "文件 / 项目来源追踪",
  "路径：...",
  "扫描根：...",
  "npm run verify:workspace-read-context",
  "npm run verify:memory-skills-context",
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
  "verify:workspace-read-context",
  "verify:runbook-context",
  "verify:instruction-stack-context",
  "verify:memory-skills-context",
  "verify:phase3",
  "verify:phase4",
  "verify:phase4-agent-runtime",
]) {
  assert(packageJson.scripts?.[script], `package script missing: ${script}`);
}

const phase3ProjectModeRunner = readProjectFile("scripts/verify-phase3-project-mode.mjs");
const agentRunReplayScript = readProjectFile("scripts/verify-agent-run-replay.mjs");
const agentLoopReadToolScript = readProjectFile("scripts/verify-agent-loop-read-tool-followup.mjs");
assert(phase3ProjectModeRunner.includes("verify-workspace-read-context-injection.mjs"), "Phase 3 project runner must include read_file context injection guard");
for (const snippet of [
  "direct-req-read-1",
  "direct-req-command-1",
  "direct-req-write-1",
  "direct approval keeps request id meta",
  "direct diff keeps request id meta",
  "Agent Loop 上下文打包",
  "phase:context_pack",
  "tool replay markdown includes context_pack preparation",
  "read replay row has path meta",
  "workspace_scan replay row has root meta",
  "tool replay markdown includes workspace root marker",
  "direct read keeps path meta",
]) {
  assert(agentRunReplayScript.includes(snippet), `Agent run replay should guard direct chat request ids: ${snippet}`);
}
for (const snippet of [
  "context_pack is the first retained tool result",
  "tool result evidence keeps context before read tools",
]) {
  assert(agentLoopReadToolScript.includes(snippet), `Agent Loop read tool followup should guard context_pack evidence order: ${snippet}`);
}

for (const snippet of [
  "Agent Loop 预取 context_pack",
  "state.toolResults.push(gatewayContextPack)",
  "Phase 4+5+6: Act/Verify/Writeback Loop",
  "pendingReviews.length ? \"Agent Loop 已暂停，等待 Diff 审查或审批。\"",
  "buildWriteFileDiffDraftFromPayload",
  "async function callGateway",
  "shouldExecuteReadOnlyBridgeAction(action)",
  "onToolCall",
  "onLoopPrompt",
  "requestId?: string",
  "request-id=",
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
  "result: { ...result, request_id: request.id }",
  'type: "bridge_error"',
  'toolResults.some((item) => item.status === "error") ? "partial" : "completed"',
  'type: "bridge_round_complete"',
  "buildAgentRunReplayMarkdown",
  "## 证据范围",
  "按 `agent_context.thread_id` 过滤后的 direct_chat / agent_loop 工具证据",
  "Agent Loop / 直接对话 / 最近运行日志段同样按当前 Thread ID 过滤。",
  "runtimeLogs: runtimeLogRows.filter((entry) => runtimeLogMatchesThreadContext(entry, thread.id))",
  "nextAction: agentThreadRunbook.nextAction",
  'data-testid="run-report-next-action"',
  'data-testid="run-report-thread-scope"',
  "只显示当前线程",
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
  'data-testid="agent-home-side-primary-action"',
  'label: agentLoopCanResume ? "继续 Agent Loop" : agentLoopStatus.status === "running" ? "运行中" : "运行 Agent Loop"',
  "() => void runDeepAgentLoop()",
  "function agentLoopTaskFromThread",
  "const activeAgentLoopTask = agentLoopTaskFromThread(activeThread)",
  "const fallbackTask = agentLoopTaskFromThread(loopThread)",
  "threadComposer.trim() || commandTask.trim() || fallbackTask",
  'activeAgentLoopTask ? "当前线程" : "暂无任务"',
  "!threadComposer.trim() && !commandTask.trim() && !activeAgentLoopTask",
  "<WorkbenchToolTracePanel",
  "rows={homeToolTraceRows}",
  "gatewayCount={gatewayToolTraceAllRows.length}",
  "approvalCount={activeThreadLinkedApprovalRows.length + changeFileRows.length}",
  "reportCount={currentThreadRunReports.length}",
  'data-testid="home-context-attach-runbook"',
  'data-testid="home-context-attach-skills"',
]) {
  assert(component.includes(snippet), `Agent runtime UI/wiring missing: ${snippet}`);
}

for (const snippet of [
  "traceNextStepForRow",
  "traceDetailWithoutNextStep",
  "data-testid=\"home-tool-trace-next-step\"",
  "data-next-step-tone={nextStepTone}",
  "function formatTraceMetaChip",
  "formatTraceMetaChip(item)",
  "function prioritizedTraceMeta",
  "traceMetaPriority",
  "if (kind === \"path\") return `文件",
  "if (kind === \"root\") return `目录",
  "if (kind === \"files\") return `${body} 文件`",
  "const meta = prioritizedTraceMeta(entry.meta || [])",
  "meta.slice(0, 3)",
  'data-testid="home-toolchain-strip"',
  'data-testid="home-tool-trace-meta"',
  "codex-toolchain-step",
]) {
  assert(toolTracePanel.includes(snippet), `Agent runtime tool trace panel missing: ${snippet}`);
}

const checks = [
  ["Agent Loop 工具链", process.execPath, ["scripts/verify-agent-loop-tools.mjs"]],
  ["Agent Loop Bridge 回灌", process.execPath, ["scripts/verify-agent-loop-bridge.mjs"]],
  ["Runbook 入模上下文", process.execPath, ["scripts/verify-runbook-context-injection.mjs"]],
  ["指令栈入模上下文", process.execPath, ["scripts/verify-instruction-stack-context-injection.mjs"]],
  ["Memory / Skills 入模上下文", process.execPath, ["scripts/verify-memory-skills-context-injection.mjs"]],
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

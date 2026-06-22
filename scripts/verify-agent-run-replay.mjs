import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function compileTsModule(relativePath, name) {
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
  writeFileSync(modulePath, compiled, "utf8");
  return import(pathToFileURL(modulePath).href);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const { buildAgentDirectChatToolReplayRows, buildAgentLoopToolReplayRows, buildAgentRunReplayMarkdown, buildAgentRunReplayTimeline } = await compileTsModule("../src/utils/agent-run-replay.ts", "agent-run-replay");

const rows = [
  {
    id: "worker-1",
    kind: "workers",
    label: "后台任务",
    title: "模型 Worker",
    detail: "后台模型任务返回合并草案",
    status: "completed",
    at: 5000,
    source: "worker",
  },
  {
    id: "user-1",
    kind: "messages",
    label: "用户消息",
    title: "用户请求",
    detail: "读取 README，修改摘要，并运行验证。",
    status: "submitted",
    at: 1000,
    source: "message",
  },
  {
    id: "tool-1",
    kind: "tools",
    label: "工具结果",
    title: "Gateway · read_file",
    detail: "读取 README 成功。",
    status: "ok",
    at: 2000,
    source: "agent_loop",
  },
  {
    id: "approval-1",
    kind: "approvals",
    label: "审批队列",
    title: "run_command 审批",
    detail: "等待执行 node --version。",
    status: "approval_required",
    at: 3000,
    source: "Gateway 实时",
  },
  {
    id: "diff-1",
    kind: "diffs",
    label: "变更",
    title: "README.md",
    detail: "1 个 hunk 等待审查。",
    status: "pending",
    at: 4000,
    source: "diff",
  },
  {
    id: "result-1",
    kind: "tools",
    label: "工具结果",
    title: "续跑证据",
    detail: "命令执行证据：退出码：0 stdout：v22.19.0",
    status: "executed",
    at: 6000,
    source: "agent_loop",
  },
  {
    id: "dupe-result-1",
    kind: "tools",
    label: "工具结果",
    title: "续跑证据",
    detail: "命令执行证据：退出码：0 stdout：v22.19.0",
    status: "executed",
    at: 6001,
    source: "agent_loop",
  },
];

const timeline = buildAgentRunReplayTimeline(rows, { limit: 20, detailLimit: 160 });
assertEqual(timeline.length, 6, "deduped replay count");
assertEqual(timeline[0].id, "user-1", "timeline sorted oldest first");
assertEqual(timeline.map((item) => item.kind).join(","), "request,tool,approval,diff,worker,result", "timeline classifies phases");
assertEqual(timeline.map((item) => item.phase).join(","), "用户请求,工具调用,审批审查,变更审查,后台执行,结果复核", "timeline phase labels");
assert(timeline[5].detail.includes("stdout"), "result evidence kept");
assertEqual(timeline[0].nextStep, "交给模型规划；如需要本地能力，会进入 Gateway / Diff / 审批链路。", "request next step");
assertEqual(timeline[2].nextStep, "到审批面板确认、拒绝或等待人工处理。", "approval next step");
assertEqual(timeline[3].nextStep, "到变更 / Diff 面板逐项审查 hunk。", "diff next step");
assertEqual(timeline[4].nextStep, "Worker 结果已回灌，可继续复核证据或让模型续写。", "worker next step");
assertEqual(timeline[5].nextStep, "证据已保留，可继续复核结果或让模型收尾。", "result next step");
assert(timeline[0].detail.includes("下一步：交给模型规划"), "request detail includes next step");
assert(timeline[2].detail.includes("下一步：到审批面板确认、拒绝或等待人工处理。"), "approval detail includes next step");
assert(timeline[3].detail.includes("下一步：到变更 / Diff 面板逐项审查 hunk。"), "diff detail includes next step");
assert(timeline[5].detail.includes("下一步：证据已保留"), "result detail includes next step");

const limited = buildAgentRunReplayTimeline(rows, { limit: 3 });
assertEqual(limited.length, 3, "limit applies after sorting");
assertEqual(limited[2].kind, "approval", "limited timeline keeps chronological prefix");

const markdown = buildAgentRunReplayMarkdown(rows, {
  limit: 20,
  detailLimit: 160,
  formatDateTime: (value) => `T${value}`,
});
assert(markdown.includes("## 任务回放"), "markdown includes replay section heading");
assert(markdown.includes("### 1. 用户请求 · 用户请求"), "markdown starts with user request");
assert(markdown.includes("### 2. 工具调用 · Gateway · read_file"), "markdown keeps tool call after request");
assert(markdown.includes("### 3. 审批审查 · run_command 审批"), "markdown includes approval review");
assert(markdown.includes("### 4. 变更审查 · README.md"), "markdown includes diff review");
assert(markdown.includes("### 5. 后台执行 · 模型 Worker"), "markdown includes worker step");
assert(markdown.includes("### 6. 结果复核 · 续跑证据"), "markdown includes final evidence review");
assert(markdown.includes("- 时间: T1000"), "markdown uses provided date formatter");
assert(markdown.includes("- 下一步: 到审批面板确认、拒绝或等待人工处理。"), "markdown includes approval next step line");
assert(markdown.includes("下一步：到变更 / Diff 面板逐项审查 hunk。"), "markdown detail includes diff next step");
assert(markdown.indexOf("用户请求 · 用户请求") < markdown.indexOf("工具调用 · Gateway · read_file"), "markdown order request before tool");
assert(markdown.indexOf("审批审查 · run_command 审批") < markdown.indexOf("结果复核 · 续跑证据"), "markdown order approval before result");

const toolReplayRows = buildAgentLoopToolReplayRows([
  {
    action: "context_pack",
    requestId: "req-context-1",
    purpose: "Agent Loop 预取 context_pack",
    status: "ok",
    resultText: "上下文：3 条；线程上下文：1 条；Skills：2",
    resultJson: { status: "ok", context_pack: { context_pack: [{ title: "README", summary: "项目入口" }] } },
    at: 6500,
  },
  {
    action: "read_file",
    requestId: "req-read-1",
    purpose: "读取 README",
    status: "ok",
    resultText: "{\"status\":\"ok\",\"content\":\"# 织梦写作台\"}",
    resultJson: { status: "ok", target: "C:\\Projects\\Zhimeng\\README.md", content: "# 织梦写作台" },
    runId: "run-read-1",
    at: 7000,
  },
  {
    action: "workspace_scan",
    requestId: "req-scan-1",
    purpose: "扫描项目目录",
    status: "ok",
    resultText: "{\"status\":\"ok\",\"workspace_scan\":{\"root\":\"C:\\\\Projects\\\\Zhimeng\",\"file_count\":2}}",
    resultJson: { status: "ok", target: "C:\\Projects\\Zhimeng", workspace_scan: { root: "C:\\Projects\\Zhimeng", root_input: ".", file_count: 2 } },
    at: 7500,
  },
  {
    action: "run_command",
    requestId: "req-command-1",
    purpose: "执行验证",
    status: "approval_required",
    resultText: "等待审批执行 npm run build。",
    resultJson: { status: "approval_required", approval_id: "approval-command-1" },
    approvalId: "approval-command-1",
    at: 8000,
  },
  {
    action: "write_file",
    requestId: "req-write-1",
    purpose: "更新 README",
    status: "diff_draft",
    resultText: "write_file 已转为 Changes / Diff 草案：1 个文件、1 个待审 hunk。",
    resultJson: { status: "diff_draft", review_gate: "Changes / Diff" },
    reviewGate: "changes_diff",
    at: 9000,
  },
], { source: "agent_loop", refPrefix: "loop-test" });
assertEqual(toolReplayRows.length, 5, "tool results become replay rows");
assertEqual(toolReplayRows[0].kind, "tools", "context_pack result remains tool replay row");
assertEqual(toolReplayRows[0].label, "Agent Loop 上下文打包", "context_pack replay row has explicit context label");
assertEqual(toolReplayRows[0].title, "Agent Loop · context_pack 上下文", "context_pack replay row has explicit context title");
assert(toolReplayRows[0].meta.includes("phase:context_pack"), "context_pack replay row has phase meta");
assert(toolReplayRows[0].detail.includes("Agent Loop 预取 context_pack"), "context_pack replay row keeps purpose");
assert(toolReplayRows[0].detail.includes("下一步：结果已回灌，模型可以基于证据继续推理。"), "context_pack replay row explains next step");
assertEqual(toolReplayRows[1].kind, "tools", "read result remains tool replay row");
assertEqual(toolReplayRows[1].ref, "run-read-1", "read replay row keeps run id ref");
assert(toolReplayRows[1].detail.includes("请求：req-read-1"), "read replay row keeps request id detail");
assert(toolReplayRows[1].detail.includes("路径：C:\\Projects\\Zhimeng\\README.md"), "read replay row exposes target path detail");
assert(toolReplayRows[1].meta.includes("request:req-read-1"), "read replay row has request meta");
assert(toolReplayRows[1].meta.includes("path:C:\\Projects\\Zhimeng\\README.md"), "read replay row has path meta");
assert(toolReplayRows[1].detail.includes("读取 README"), "read replay row keeps purpose");
assert(toolReplayRows[1].detail.includes("下一步：结果已回灌，模型可以基于证据继续推理。"), "read replay row explains next step");
assertEqual(toolReplayRows[2].kind, "tools", "workspace_scan result remains tool replay row");
assert(toolReplayRows[2].detail.includes("扫描根：C:\\Projects\\Zhimeng"), "workspace_scan replay row exposes root detail");
assert(toolReplayRows[2].detail.includes("输入根：."), "workspace_scan replay row exposes root input detail");
assert(toolReplayRows[2].detail.includes("文件数：2"), "workspace_scan replay row exposes file count detail");
assert(toolReplayRows[2].meta.includes("root:C:\\Projects\\Zhimeng"), "workspace_scan replay row has root meta");
assert(toolReplayRows[2].meta.includes("root_input:."), "workspace_scan replay row has root input meta");
assert(toolReplayRows[2].meta.includes("files:2"), "workspace_scan replay row has file count meta");
assertEqual(toolReplayRows[3].kind, "approvals", "approval result becomes approval replay row");
assertEqual(toolReplayRows[3].ref, "approval-command-1", "approval replay row keeps approval id");
assert(toolReplayRows[3].meta.includes("approval:approval-command-1"), "approval replay row has approval meta");
assert(toolReplayRows[3].meta.includes("request:req-command-1"), "approval replay row has request meta");
assert(toolReplayRows[3].detail.includes("下一步：到审批面板确认、拒绝或等待人工处理。"), "approval replay row explains next step");
assertEqual(toolReplayRows[4].kind, "diffs", "diff draft becomes diff replay row");
assert(toolReplayRows[4].meta.includes("review:changes_diff"), "diff replay row has review meta");
assert(toolReplayRows[4].meta.includes("request:req-write-1"), "diff replay row has request meta");
assert(toolReplayRows[4].detail.includes("下一步：到变更 / Diff 面板逐项审查 hunk。"), "diff replay row explains next step");

const toolReplayTimeline = buildAgentRunReplayTimeline(toolReplayRows, { limit: 10 });
assertEqual(toolReplayTimeline.map((item) => item.kind).join(","), "tool,tool,tool,approval,diff", "tool replay timeline classifies rows");
const toolReplayMarkdown = buildAgentRunReplayMarkdown(toolReplayRows, {
  title: "Agent Loop 工具证据",
  formatDateTime: (value) => `T${value}`,
});
assert(toolReplayMarkdown.includes("## Agent Loop 工具证据"), "tool replay markdown keeps custom title");
assert(toolReplayMarkdown.includes("工具调用 · Agent Loop · context_pack 上下文"), "tool replay markdown includes context_pack preparation");
assert(toolReplayMarkdown.includes("phase:context_pack"), "tool replay markdown includes context_pack meta");
assert(toolReplayMarkdown.includes("工具调用 · Agent Loop · read_file"), "tool replay markdown includes read tool");
assert(toolReplayMarkdown.includes("request:req-read-1"), "tool replay markdown includes request id marker");
assert(toolReplayMarkdown.includes("path:C:\\Projects\\Zhimeng\\README.md"), "tool replay markdown includes read path marker");
assert(toolReplayMarkdown.includes("工具调用 · Agent Loop · workspace_scan"), "tool replay markdown includes workspace_scan tool");
assert(toolReplayMarkdown.includes("root:C:\\Projects\\Zhimeng"), "tool replay markdown includes workspace root marker");
assert(toolReplayMarkdown.includes("files:2"), "tool replay markdown includes workspace file count marker");
assert(toolReplayMarkdown.includes("审批审查 · Agent Loop · run_command"), "tool replay markdown includes approval tool");
assert(toolReplayMarkdown.includes("变更审查 · Agent Loop · write_file"), "tool replay markdown includes diff tool");
assert(toolReplayMarkdown.includes("- 下一步: 到审批面板确认、拒绝或等待人工处理。"), "tool replay markdown includes approval next step");
assert(toolReplayMarkdown.includes("下一步：到变更 / Diff 面板逐项审查 hunk。"), "tool replay markdown includes diff detail next step");

const directChatReplayRows = buildAgentDirectChatToolReplayRows([
  {
    action: "read_file",
    status: "ok",
    detail: "直接对话读取 README 成功。",
    result: { status: "ok", request_id: "direct-req-read-1", run_id: "direct-run-1", target: "C:\\Projects\\Zhimeng\\README.md", content: "# 织梦写作台" },
  },
  {
    action: "run_command",
    status: "approval_required",
    detail: "等待用户审批 npm run build。",
    result: { status: "approval_required", request_id: "direct-req-command-1", approval_id: "direct-approval-1" },
  },
  {
    action: "write_file",
    status: "diff_draft",
    detail: "write_file 已截获为 Diff 草案。",
    result: { status: "diff_draft", request_id: "direct-req-write-1", review_gate: "Changes / Diff" },
  },
], {
  round: 2,
  refPrefix: "direct-round-test",
  at: 10000,
});
assertEqual(directChatReplayRows.length, 3, "direct chat tool results become replay rows");
assertEqual(directChatReplayRows[0].source, "direct_chat", "direct chat replay source");
assertEqual(directChatReplayRows[0].kind, "tools", "direct read result is tool row");
assertEqual(directChatReplayRows[0].title, "直接对话 · read_file", "direct read title");
assertEqual(directChatReplayRows[0].ref, "direct-run-1", "direct read keeps run ref");
assert(directChatReplayRows[0].detail.includes("请求：direct-req-read-1"), "direct read keeps request id detail");
assert(directChatReplayRows[0].detail.includes("路径：C:\\Projects\\Zhimeng\\README.md"), "direct read keeps path detail");
assert(directChatReplayRows[0].meta.includes("request:direct-req-read-1"), "direct read keeps request id meta");
assert(directChatReplayRows[0].meta.includes("path:C:\\Projects\\Zhimeng\\README.md"), "direct read keeps path meta");
assert(directChatReplayRows[0].detail.includes("直接对话第 2 轮工具回灌"), "direct read keeps round purpose");
assert(directChatReplayRows[0].detail.includes("下一步：结果已回灌，模型可以基于证据继续推理。"), "direct read explains next step");
assertEqual(directChatReplayRows[1].kind, "approvals", "direct approval result is approval row");
assertEqual(directChatReplayRows[1].label, "直接对话审批", "direct approval label");
assert(directChatReplayRows[1].detail.includes("请求：direct-req-command-1"), "direct approval keeps request id detail");
assert(directChatReplayRows[1].meta.includes("request:direct-req-command-1"), "direct approval keeps request id meta");
assert(directChatReplayRows[1].meta.includes("approval:direct-approval-1"), "direct approval keeps approval meta");
assert(directChatReplayRows[1].detail.includes("下一步：到审批面板确认、拒绝或等待人工处理。"), "direct approval explains next step");
assertEqual(directChatReplayRows[2].kind, "diffs", "direct write_file result is diff row");
assertEqual(directChatReplayRows[2].label, "直接对话 Diff", "direct diff label");
assert(directChatReplayRows[2].detail.includes("请求：direct-req-write-1"), "direct diff keeps request id detail");
assert(directChatReplayRows[2].meta.includes("request:direct-req-write-1"), "direct diff keeps request id meta");
assert(directChatReplayRows[2].detail.includes("下一步：到变更 / Diff 面板逐项审查 hunk。"), "direct diff explains next step");
const directChatTimeline = buildAgentRunReplayTimeline(directChatReplayRows, { limit: 10 });
assertEqual(directChatTimeline.map((item) => item.kind).join(","), "tool,approval,diff", "direct chat timeline classifies rows");
const directChatMarkdown = buildAgentRunReplayMarkdown(directChatReplayRows, {
  title: "直接对话工具证据",
  formatDateTime: (value) => `T${value}`,
});
assert(directChatMarkdown.includes("## 直接对话工具证据"), "direct chat replay markdown keeps custom title");
assert(directChatMarkdown.includes("工具调用 · 直接对话 · read_file"), "direct chat markdown includes tool");
assert(directChatMarkdown.includes("审批审查 · 直接对话 · run_command"), "direct chat markdown includes approval");
assert(directChatMarkdown.includes("变更审查 · 直接对话 · write_file"), "direct chat markdown includes diff");
assert(directChatMarkdown.includes("- 下一步: 到审批面板确认、拒绝或等待人工处理。"), "direct chat markdown includes approval next step");

console.log("agent-run-replay ok");

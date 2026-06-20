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
assert(markdown.indexOf("用户请求 · 用户请求") < markdown.indexOf("工具调用 · Gateway · read_file"), "markdown order request before tool");
assert(markdown.indexOf("审批审查 · run_command 审批") < markdown.indexOf("结果复核 · 续跑证据"), "markdown order approval before result");

const toolReplayRows = buildAgentLoopToolReplayRows([
  {
    action: "read_file",
    purpose: "读取 README",
    status: "ok",
    resultText: "{\"status\":\"ok\",\"content\":\"# 织梦写作台\"}",
    resultJson: { status: "ok", content: "# 织梦写作台" },
    runId: "run-read-1",
    at: 7000,
  },
  {
    action: "run_command",
    purpose: "执行验证",
    status: "approval_required",
    resultText: "等待审批执行 npm run build。",
    resultJson: { status: "approval_required", approval_id: "approval-command-1" },
    approvalId: "approval-command-1",
    at: 8000,
  },
  {
    action: "write_file",
    purpose: "更新 README",
    status: "diff_draft",
    resultText: "write_file 已转为 Changes / Diff 草案：1 个文件、1 个待审 hunk。",
    resultJson: { status: "diff_draft", review_gate: "Changes / Diff" },
    reviewGate: "changes_diff",
    at: 9000,
  },
], { source: "agent_loop", refPrefix: "loop-test" });
assertEqual(toolReplayRows.length, 3, "tool results become replay rows");
assertEqual(toolReplayRows[0].kind, "tools", "read result remains tool replay row");
assertEqual(toolReplayRows[0].ref, "run-read-1", "read replay row keeps run id ref");
assert(toolReplayRows[0].detail.includes("读取 README"), "read replay row keeps purpose");
assertEqual(toolReplayRows[1].kind, "approvals", "approval result becomes approval replay row");
assertEqual(toolReplayRows[1].ref, "approval-command-1", "approval replay row keeps approval id");
assert(toolReplayRows[1].meta.includes("approval:approval-command-1"), "approval replay row has approval meta");
assertEqual(toolReplayRows[2].kind, "diffs", "diff draft becomes diff replay row");
assert(toolReplayRows[2].meta.includes("review:changes_diff"), "diff replay row has review meta");

const toolReplayTimeline = buildAgentRunReplayTimeline(toolReplayRows, { limit: 10 });
assertEqual(toolReplayTimeline.map((item) => item.kind).join(","), "tool,approval,diff", "tool replay timeline classifies rows");
const toolReplayMarkdown = buildAgentRunReplayMarkdown(toolReplayRows, {
  title: "Agent Loop 工具证据",
  formatDateTime: (value) => `T${value}`,
});
assert(toolReplayMarkdown.includes("## Agent Loop 工具证据"), "tool replay markdown keeps custom title");
assert(toolReplayMarkdown.includes("工具调用 · Agent Loop · read_file"), "tool replay markdown includes read tool");
assert(toolReplayMarkdown.includes("审批审查 · Agent Loop · run_command"), "tool replay markdown includes approval tool");
assert(toolReplayMarkdown.includes("变更审查 · Agent Loop · write_file"), "tool replay markdown includes diff tool");

const directChatReplayRows = buildAgentDirectChatToolReplayRows([
  {
    action: "read_file",
    status: "ok",
    detail: "直接对话读取 README 成功。",
    result: { status: "ok", run_id: "direct-run-1", content: "# 织梦写作台" },
  },
  {
    action: "run_command",
    status: "approval_required",
    detail: "等待用户审批 npm run build。",
    result: { status: "approval_required", approval_id: "direct-approval-1" },
  },
  {
    action: "write_file",
    status: "diff_draft",
    detail: "write_file 已截获为 Diff 草案。",
    result: { status: "diff_draft", review_gate: "Changes / Diff" },
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
assert(directChatReplayRows[0].detail.includes("直接对话第 2 轮工具回灌"), "direct read keeps round purpose");
assertEqual(directChatReplayRows[1].kind, "approvals", "direct approval result is approval row");
assertEqual(directChatReplayRows[1].label, "直接对话审批", "direct approval label");
assert(directChatReplayRows[1].meta.includes("approval:direct-approval-1"), "direct approval keeps approval meta");
assertEqual(directChatReplayRows[2].kind, "diffs", "direct write_file result is diff row");
assertEqual(directChatReplayRows[2].label, "直接对话 Diff", "direct diff label");
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

console.log("agent-run-replay ok");

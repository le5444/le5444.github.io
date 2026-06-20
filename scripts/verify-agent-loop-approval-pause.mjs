import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function compileTsModule(relativePath, name, replacements = []) {
  const sourcePath = new URL(relativePath, import.meta.url);
  let source = readFileSync(sourcePath, "utf8");
  for (const [pattern, replacement] of replacements) {
    source = source.replace(pattern, replacement);
  }
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

const stubPath = join(tmpdir(), `zhimeng-agent-loop-stubs-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
writeFileSync(stubPath, [
  "export function planPersonalOS(){ return { domain: 'general', phase: 'plan', risk: 'low' }; }",
  "export function renderPersonalOSContext(){ return ''; }",
  "export function planAgentIntent(){ return { contextMode: 'lean' }; }",
  "export function selectAgentMemoryShards(){ return { memories: [] }; }",
  "export function selectAgentSkills(){ return []; }",
  "export function buildAgentContextPack(){ return {}; }",
  "export function renderAgentContextPack(){ return ''; }",
  "export function buildToolRouteBundle(){ return { approvalRequired: false }; }",
  "export function sendRawChat(){ return Promise.resolve('ZHIMENG_TASK_COMPLETE'); }",
  "export function buildExecutorBridgeManifest(){ return {}; }",
  "export function extractExecutorBridgeRequestsFromText(){ return []; }",
  "export function buildWriteFileDiffDraftFromPayload(){ return null; }",
  "export function assembleSkills(){ return []; }",
  "export function buildWorkflowDag(){ return {}; }",
  "export function htmlToPlainText(value){ return String(value || ''); }",
  "export function buildOneShotToolFollowupPrompt(){ return ''; }",
].join("\n"), "utf8");

const stubUrl = pathToFileURL(stubPath).href;
const replacements = [
  [/import \{ planPersonalOS[\s\S]*?from "\.\.\/\.\.\/utils\/personal-os";/g, `import { planPersonalOS, renderPersonalOSContext } from ${JSON.stringify(stubUrl)};`],
  [/import \{ planAgentIntent[\s\S]*?from "\.\.\/\.\.\/utils\/agent-memory";/g, `import { planAgentIntent, selectAgentMemoryShards, selectAgentSkills } from ${JSON.stringify(stubUrl)};`],
  [/import \{ buildAgentContextPack[\s\S]*?from "\.\.\/\.\.\/utils\/agent-context-pack";/g, `import { buildAgentContextPack, renderAgentContextPack } from ${JSON.stringify(stubUrl)};`],
  [/import \{ buildToolRouteBundle \} from "\.\.\/\.\.\/utils\/tool-registry";/g, `import { buildToolRouteBundle } from ${JSON.stringify(stubUrl)};`],
  [/import \{ sendRawChat[\s\S]*?from "\.\.\/\.\.\/store\/settings";/g, `import { sendRawChat } from ${JSON.stringify(stubUrl)};`],
  [/import \{ buildExecutorBridgeManifest[\s\S]*?from "\.\.\/\.\.\/utils\/executor-bridge";/g, `import { buildExecutorBridgeManifest, extractExecutorBridgeRequestsFromText } from ${JSON.stringify(stubUrl)};`],
  [/import \{ buildWriteFileDiffDraftFromPayload \} from "\.\.\/\.\.\/utils\/write-file-diff-draft";/g, `import { buildWriteFileDiffDraftFromPayload } from ${JSON.stringify(stubUrl)};`],
  [/import \{ assembleSkills \} from "\.\.\/\.\.\/utils\/skill-registry";/g, `import { assembleSkills } from ${JSON.stringify(stubUrl)};`],
  [/import \{ buildWorkflowDag \} from "\.\.\/\.\.\/utils\/workflow-dag";/g, `import { buildWorkflowDag } from ${JSON.stringify(stubUrl)};`],
  [/import \{ htmlToPlainText \} from "\.\.\/\.\.\/utils\/helpers";/g, `import { htmlToPlainText } from ${JSON.stringify(stubUrl)};`],
  [/import type \{ PromptTemplate, WorkspaceFile \} from "\.\.\/\.\.\/store\/workspace";/g, ""],
  [/import \{ buildOneShotToolFollowupPrompt \} from "\.\/agent-loop-bridge";/g, `import { buildOneShotToolFollowupPrompt } from ${JSON.stringify(stubUrl)};`],
];

const {
  agentLoopStopReasonFromToolResults,
  buildAgentLoopApprovalPauseSummary,
} = await compileTsModule("../src/os/kernel/agent-loop.ts", "agent-loop-approval-pause", replacements);

const okResults = [
  { action: "read_file", purpose: "读取项目文件", status: "ok", resultText: "done", at: 1 },
  { action: "workspace_scan", purpose: "扫描目录", status: "completed", resultText: "done", at: 2 },
];
assertEqual(agentLoopStopReasonFromToolResults(okResults), "no_progress", "read-only tools continue loop");

const errorResults = [
  { action: "read_file", purpose: "读取项目文件", status: "error", resultText: "Gateway 调用失败", at: 1 },
];
assertEqual(agentLoopStopReasonFromToolResults(errorResults), "gateway_error", "error tool stops as gateway error");

const approvalResults = [
  {
    action: "write_file",
    purpose: "写入修复草案",
    status: "approval_required",
    resultText: "等待审批",
    approvalId: "approval-123",
    resultJson: { approval_id: "approval-123" },
    at: 3,
  },
  {
    action: "run_command",
    purpose: "执行构建",
    status: "queued",
    resultText: "等待授权",
    resultJson: { approvalId: "approval-456" },
    at: 4,
  },
];
assertEqual(agentLoopStopReasonFromToolResults(approvalResults), "approval_required", "approval tools pause loop");
const diffDraftResults = [
  {
    action: "write_file",
    purpose: "写入修复草案",
    status: "diff_draft",
    resultText: "write_file 已转为 Changes / Diff 草案",
    resultJson: { status: "diff_draft", review_gate: "Changes / Diff" },
    reviewGate: "changes_diff",
    diffDraft: {
      proposal: { request_id: "request-1" },
      targetPaths: ["src/example.ts"],
      hunks: [{ id: "hunk-1" }, { id: "hunk-2" }],
    },
    at: 5,
  },
];
assertEqual(agentLoopStopReasonFromToolResults(diffDraftResults), "approval_required", "diff drafts pause loop for review");
const summary = buildAgentLoopApprovalPauseSummary(approvalResults);
assert(summary.includes("Agent Loop 已暂停，等待审批。"), "summary states pause");
assert(summary.includes("不会继续调用模型"), "summary promises no further model call");
assert(summary.includes("write_file · 写入修复草案 · approval-123"), "summary lists write approval");
assert(summary.includes("run_command · 执行构建 · approval-456"), "summary lists queued approval");
const diffSummary = buildAgentLoopApprovalPauseSummary(diffDraftResults);
assert(diffSummary.includes("等待 Diff 审查或审批"), "diff summary states review pause");
assert(diffSummary.includes("待审 Diff："), "diff summary has review section");
assert(diffSummary.includes("write_file · 写入修复草案 · 2 个 hunk · src/example.ts"), "diff summary lists review target");

const mixedResults = [...okResults, ...approvalResults, ...errorResults];
assertEqual(agentLoopStopReasonFromToolResults(mixedResults), "gateway_error", "gateway errors outrank approvals");

console.log("agent-loop-approval-pause ok");

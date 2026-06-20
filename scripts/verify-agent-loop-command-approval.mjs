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

const stubPath = join(tmpdir(), `zhimeng-agent-loop-command-approval-stubs-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
writeFileSync(stubPath, [
  "export const sentMessages = [];",
  "export function planPersonalOS(){ return { domain: 'coding', phase: 'act', risk: 'medium' }; }",
  "export function renderPersonalOSContext(){ return 'personal-os'; }",
  "export function planAgentIntent(){ return { contextMode: 'lean' }; }",
  "export function selectAgentMemoryShards(){ return { memories: [] }; }",
  "export function selectAgentSkills(){ return []; }",
  "export function buildAgentContextPack(){ return {}; }",
  "export function renderAgentContextPack(){ return 'context-pack'; }",
  "export function buildToolRouteBundle(){ return { approvalRequired: true }; }",
  "export function sendRawChat(_settings, _system, messages){ sentMessages.push(messages.map((message) => ({ role: message.role, content: message.content }))); return Promise.resolve('需要先读文件再执行构建\\n<bridge-request>{\"requests\":[{\"id\":\"req-read-1\",\"action\":\"read_file\",\"purpose\":\"读取 README\",\"payload\":{\"path\":\"README.md\",\"access_profile\":\"workspace\"}},{\"id\":\"req-command-1\",\"action\":\"run_command\",\"purpose\":\"执行构建\",\"payload\":{\"command\":\"npm run build\",\"cwd\":\".\"}}]}</bridge-request>'); }",
  "export function buildExecutorBridgeManifest(){ return {}; }",
  "export function extractExecutorBridgeRequestsFromText(){ return [{ id: 'req-read-1', action: 'read_file', purpose: '读取 README', payload: { path: 'README.md', access_profile: 'workspace' } }, { id: 'req-command-1', action: 'run_command', purpose: '执行构建', payload: { command: 'npm run build', cwd: '.' } }]; }",
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

const { runAgentLoop } = await compileTsModule("../src/os/kernel/agent-loop.ts", "agent-loop-command-approval", replacements);
const { sentMessages } = await import(stubUrl);

const fetchCalls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, init = {}) => {
  const body = init.body ? JSON.parse(String(init.body)) : {};
  fetchCalls.push({ action: body.action, body });
  if (body.action === "context_pack") {
    const response = {
      status: "ok",
      context_pack: {
        context_pack: [],
        thread_context: [],
        active_skill_keys: [],
        tool_policy: {},
      },
    };
    return {
      ok: true,
      json: async () => response,
      text: async () => JSON.stringify(response),
    };
  }
  if (body.action === "read_file") {
    const response = {
      status: "ok",
      target: "README.md",
      content: "# 织梦写作台\nAgent workbench",
    };
    return {
      ok: true,
      json: async () => response,
      text: async () => JSON.stringify(response),
    };
  }
  if (body.action === "run_command") {
    const response = {
      status: "approval_required",
      approval_id: "approval-command-1",
      message: "命令已进入审批队列，尚未执行。",
      command: body.payload?.command,
    };
    return {
      ok: true,
      json: async () => response,
      text: async () => JSON.stringify(response),
    };
  }
  throw new Error(`unexpected Gateway action: ${body.action}`);
};

try {
  const loopPrompts = [];
  const toolCalls = [];
  const result = await runAgentLoop("运行构建并汇报结果", { provider: "openai", apiKey: "test", apiUrl: "http://example.test/v1", modelId: "test-model" }, {
    maxIterations: 3,
    onLoopPrompt: (prompt) => loopPrompts.push(prompt),
    onToolCall: (tool) => toolCalls.push(tool),
  });

  assertEqual(result.stopReason, "approval_required", "run_command pauses for approval");
  assertEqual(result.success, false, "approval pause is not completed");
  assertEqual(result.toolCalls, 2, "mixed read and command tool requests");
  assertEqual(result.pendingApprovals.length, 1, "one pending command approval");
  assertEqual(result.pendingApprovals[0].approvalId, "approval-command-1", "pending approval id");
  assertEqual(result.pendingApprovals[0].action, "run_command", "pending approval action");
  assertEqual(result.pendingReviews.length, 0, "command has no diff review");
  assert(result.summary.includes("Agent Loop 已暂停，等待审批。"), "summary says approval pause");
  assert(result.summary.includes("本轮已完成工具："), "summary lists completed tools before approval");
  assert(result.summary.includes("read_file · 读取 README · ok"), "summary lists completed read_file");
  assert(result.summary.includes("run_command · 执行构建 · approval-command-1"), "summary lists command approval");
  assert(result.toolResults.some((tool) => tool.action === "read_file" && tool.status === "ok"), "read_file result is kept before approval pause");
  assert(toolCalls.some((tool) => tool.action === "run_command" && tool.approvalId === "approval-command-1"), "onToolCall receives command approval");
  assert(toolCalls.some((tool) => tool.action === "read_file" && tool.status === "ok"), "onToolCall receives read result");
  const readCall = fetchCalls.find((call) => call.action === "read_file");
  const commandCall = fetchCalls.find((call) => call.action === "run_command");
  assert(readCall, "read_file hits Gateway before command pause");
  assert(commandCall, "run_command hits Gateway");
  assertEqual(readCall.body.execute, true, "read_file still executes in mixed request");
  assertEqual(readCall.body.payload.execute, true, "read_file payload still executes in mixed request");
  assertEqual(commandCall.body.execute, undefined, "run_command does not force execute");
  assertEqual(commandCall.body.payload.execute, undefined, "run_command payload does not force execute");
  assertEqual(commandCall.body.payload.command, "npm run build", "run_command keeps command");
  assertEqual(loopPrompts.length, 0, "approval pause does not produce followup prompt");
  assertEqual(sentMessages.length, 1, "model not called again after approval pause");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("agent-loop-command-approval ok");

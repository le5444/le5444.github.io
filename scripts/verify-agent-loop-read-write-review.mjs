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

const stubPath = join(tmpdir(), `zhimeng-agent-loop-read-write-stubs-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
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
  "export function sendRawChat(_settings, _system, messages){ sentMessages.push(messages.map((message) => ({ role: message.role, content: message.content }))); return Promise.resolve('先读文件，再提出修改\\n<bridge-request>{\"requests\":[{\"id\":\"req-read-1\",\"action\":\"read_file\",\"purpose\":\"读取 README\",\"payload\":{\"path\":\"README.md\",\"access_profile\":\"workspace\"}},{\"id\":\"req-write-1\",\"action\":\"write_file\",\"purpose\":\"修改 README 摘要\",\"payload\":{\"path\":\"README.md\",\"mode\":\"replace\",\"access_profile\":\"workspace\",\"content\":\"# 织梦写作台\\n\\nAI Agent 工作台。\"}}]}</bridge-request>'); }",
  "export function buildExecutorBridgeManifest(){ return {}; }",
  "export function extractExecutorBridgeRequestsFromText(){ return [{ id: 'req-read-1', action: 'read_file', purpose: '读取 README', payload: { path: 'README.md', access_profile: 'workspace' } }, { id: 'req-write-1', action: 'write_file', purpose: '修改 README 摘要', payload: { path: 'README.md', mode: 'replace', access_profile: 'workspace', content: '# 织梦写作台\\n\\nAI Agent 工作台。' } }]; }",
  "export function buildWriteFileDiffDraftFromPayload({ payload, requestId }){ return { status: 'draft', decision: '等待审查 Diff', detail: 'AI 请求 write_file：1 个文件、1 个待审 hunk；尚未写入。', planItems: [], request: payload, proposal: { request_id: requestId || 'req-write-1' }, targetPaths: [payload.path], hunks: [{ id: 'hunk-1', fileId: 'command-README.md', targetPath: payload.path, mode: payload.mode, accessProfile: payload.access_profile, oldSha256: '', requestId: requestId || 'req-write-1', title: 'README.md · replace', status: 'pending', writeContent: payload.content, content: '+# 织梦写作台\\n+\\n+AI Agent 工作台。' }] }; }",
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

const { runAgentLoop } = await compileTsModule("../src/os/kernel/agent-loop.ts", "agent-loop-read-write-review", replacements);
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
      content: "# 织梦写作台\n\n旧摘要。",
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
  const result = await runAgentLoop("读取 README 后提出摘要修改", { provider: "openai", apiKey: "test", apiUrl: "http://example.test/v1", modelId: "test-model" }, {
    maxIterations: 3,
    onLoopPrompt: (prompt) => loopPrompts.push(prompt),
    onToolCall: (tool) => toolCalls.push(tool),
  });

  assertEqual(result.stopReason, "approval_required", "read + write pauses for diff review");
  assertEqual(result.success, false, "diff review pause is not completed");
  assertEqual(result.toolCalls, 2, "mixed read and write tool requests");
  assertEqual(result.pendingReviews.length, 1, "one pending diff review");
  assertEqual(result.pendingApprovals.length, 0, "diff draft has no approval id yet");
  assertEqual(result.pendingReviews[0].action, "write_file", "pending review action");
  assertEqual(result.pendingReviews[0].hunkCount, 1, "pending review hunk count");
  assertEqual(result.pendingReviews[0].targetPaths[0], "README.md", "pending review target path");
  assert(result.summary.includes("Agent Loop 已暂停，等待 Diff 审查或审批。"), "summary says diff review pause");
  assert(result.summary.includes("本轮已完成工具："), "summary lists completed tools before diff review");
  assert(result.summary.includes("read_file · 读取 README · ok"), "summary lists completed read_file");
  assert(result.summary.includes("待审 Diff："), "summary lists pending diff section");
  assert(result.summary.includes("write_file · 修改 README 摘要 · 1 个 hunk · README.md"), "summary lists write diff draft");
  assert(result.toolResults.some((tool) => tool.action === "read_file" && tool.status === "ok"), "read_file result is kept before diff pause");
  assert(result.toolResults.some((tool) => tool.action === "write_file" && tool.status === "diff_draft"), "write_file becomes diff draft");
  assert(toolCalls.some((tool) => tool.action === "read_file" && tool.status === "ok"), "onToolCall receives read result");
  assert(toolCalls.some((tool) => tool.action === "write_file" && tool.diffDraft), "onToolCall receives diff draft");
  const contextCalls = fetchCalls.filter((call) => call.action === "context_pack");
  const readCalls = fetchCalls.filter((call) => call.action === "read_file");
  const writeCalls = fetchCalls.filter((call) => call.action === "write_file");
  assertEqual(contextCalls.length, 1, "context_pack hits Gateway once");
  assertEqual(readCalls.length, 1, "read_file hits Gateway once");
  assertEqual(writeCalls.length, 0, "write_file never hits Gateway directly");
  assertEqual(readCalls[0].body.execute, true, "read_file outer request executes");
  assertEqual(readCalls[0].body.payload.execute, true, "read_file payload executes");
  assertEqual(readCalls[0].body.payload.path, "README.md", "read_file keeps path");
  assertEqual(loopPrompts.length, 0, "diff review pause does not produce followup prompt");
  assertEqual(sentMessages.length, 1, "model not called again after diff review pause");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("agent-loop-read-write-review ok");

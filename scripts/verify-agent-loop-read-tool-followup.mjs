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

const stubPath = join(tmpdir(), `zhimeng-agent-loop-read-tool-stubs-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
writeFileSync(stubPath, [
  "export const sentMessages = [];",
  "let modelCalls = 0;",
  "export function planPersonalOS(){ return { domain: 'coding', phase: 'act', risk: 'low' }; }",
  "export function renderPersonalOSContext(){ return 'personal-os'; }",
  "export function planAgentIntent(){ return { contextMode: 'lean' }; }",
  "export function selectAgentMemoryShards(){ return { memories: [] }; }",
  "export function selectAgentSkills(){ return []; }",
  "export function buildAgentContextPack(){ return {}; }",
  "export function renderAgentContextPack(){ return 'context-pack'; }",
  "export function buildToolRouteBundle(){ return { approvalRequired: false }; }",
  "export function sendRawChat(_settings, _system, messages){ sentMessages.push(messages.map((message) => ({ role: message.role, content: message.content }))); modelCalls += 1; return Promise.resolve(modelCalls === 1 ? '需要读取和扫描\\n<bridge-request>{\"requests\":[{\"id\":\"req-read-1\",\"action\":\"read_file\",\"purpose\":\"读取 README\",\"payload\":{\"path\":\"README.md\",\"access_profile\":\"workspace\"}},{\"id\":\"req-scan-1\",\"action\":\"workspace_scan\",\"purpose\":\"扫描工作区\",\"payload\":{\"root\":\".\",\"max_depth\":2}}]}</bridge-request>' : '已读取 README 并扫描工作区。ZHIMENG_TASK_COMPLETE'); }",
  "export function buildExecutorBridgeManifest(){ return {}; }",
  "export function extractExecutorBridgeRequestsFromText(text){ return text.includes('req-read-1') ? [{ id: 'req-read-1', action: 'read_file', purpose: '读取 README', payload: { path: 'README.md', access_profile: 'workspace' } }, { id: 'req-scan-1', action: 'workspace_scan', purpose: '扫描工作区', payload: { root: '.', max_depth: 2 } }] : []; }",
  "export function buildWriteFileDiffDraftFromPayload(){ return null; }",
  "export function assembleSkills(){ return []; }",
  "export function buildWorkflowDag(){ return {}; }",
  "export function htmlToPlainText(value){ return String(value || ''); }",
  "export function buildOneShotToolFollowupPrompt({ userText, toolResultTexts }){ return ['FOLLOWUP', userText, ...toolResultTexts].join('\\n---\\n'); }",
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

const { runAgentLoop } = await compileTsModule("../src/os/kernel/agent-loop.ts", "agent-loop-read-tool-followup", replacements);
const { sentMessages } = await import(stubUrl);

const fetchCalls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, init = {}) => {
  const body = init.body ? JSON.parse(String(init.body)) : {};
  fetchCalls.push({ action: body.action, body });
  if (body.action === "context_pack") {
    const contextPackResponse = {
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
      json: async () => contextPackResponse,
      text: async () => JSON.stringify(contextPackResponse),
    };
  }
  if (body.action === "read_file") {
    const readFileResponse = {
      status: "ok",
      target: "README.md",
      content: "# 织梦写作台\nAgent workbench",
    };
    return {
      ok: true,
      json: async () => readFileResponse,
      text: async () => JSON.stringify(readFileResponse),
    };
  }
  if (body.action === "workspace_scan") {
    const scanResponse = {
      status: "ok",
      root: ".",
      file_count: 2,
      items: [
        { path: "README.md", kind: "file" },
        { path: "src/os/kernel/agent-loop.ts", kind: "file" },
      ],
    };
    return {
      ok: true,
      json: async () => scanResponse,
      text: async () => JSON.stringify(scanResponse),
    };
  }
  throw new Error(`unexpected Gateway action: ${body.action}`);
};

try {
  const loopPrompts = [];
  const result = await runAgentLoop("读取 README 并总结", { provider: "openai", apiKey: "test", apiUrl: "http://example.test/v1", modelId: "test-model" }, {
    maxIterations: 3,
    onLoopPrompt: (prompt) => loopPrompts.push(prompt),
  });

  assertEqual(result.stopReason, "completed", "read tool followup completes");
  assertEqual(result.success, true, "result succeeds");
  assertEqual(result.toolCalls, 2, "two read-only tool requests");
  assert(result.summary.includes("ZHIMENG_TASK_COMPLETE"), "summary keeps completion marker");
  const contextCall = fetchCalls.find((call) => call.action === "context_pack");
  const readCall = fetchCalls.find((call) => call.action === "read_file");
  const scanCall = fetchCalls.find((call) => call.action === "workspace_scan");
  assert(contextCall, "context_pack was requested");
  assert(readCall, "read_file was requested");
  assert(scanCall, "workspace_scan was requested");
  assertEqual(readCall.body.execute, true, "read_file outer request executes");
  assertEqual(readCall.body.payload.execute, true, "read_file payload executes");
  assertEqual(readCall.body.payload.path, "README.md", "read_file keeps path");
  assertEqual(scanCall.body.execute, true, "workspace_scan outer request executes");
  assertEqual(scanCall.body.payload.execute, true, "workspace_scan payload executes");
  assert(loopPrompts.length === 1 && loopPrompts[0].reason === "tool_result", "tool result followup prompt emitted");
  assert(loopPrompts[0].content.includes("<tool-result action=\"read_file\" status=\"ok\">"), "followup includes read_file tool result");
  assert(loopPrompts[0].content.includes("<tool-result action=\"workspace_scan\" status=\"ok\">"), "followup includes workspace_scan tool result");
  assert(loopPrompts[0].content.includes("# 织梦写作台"), "followup includes read content");
  assert(loopPrompts[0].content.includes("src/os/kernel/agent-loop.ts"), "followup includes scan content");
  assertEqual(sentMessages.length, 2, "model called twice");
  assert(sentMessages[1].some((message) => message.role === "user" && message.content.includes("<tool-result action=\"read_file\" status=\"ok\">")), "second model call receives tool result");
  assert(sentMessages[1].some((message) => message.role === "user" && message.content.includes("<tool-result action=\"workspace_scan\" status=\"ok\">")), "second model call receives scan result");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("agent-loop-read-tool-followup ok");

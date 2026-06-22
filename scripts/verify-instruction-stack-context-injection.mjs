import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function compileTsModule(relativePath, name, stripImports = false) {
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
  writeFileSync(modulePath, stripImports ? compiled.replace(/import\s+[^;]+;\s*/g, "") : compiled, "utf8");
  return import(pathToFileURL(modulePath).href);
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const component = readFileSync(new URL("../src/components/AgentControlCenter.tsx", import.meta.url), "utf8");
const phase4Doc = readFileSync(new URL("../docs/phase4-agent-runtime-acceptance-20260619.md", import.meta.url), "utf8");

const {
  buildAgentThreadContextText,
  buildAgentChatContent,
  buildAgentChatRequestReceipt,
} = await compileTsModule("../src/utils/agent-chat-transport.ts", "instruction-stack-context-agent-chat", true);

const instructionStackAttachment = {
  id: "ctx-instruction-stack",
  kind: "instruction",
  dimension: "instruction",
  title: "Agent 指令栈 / Instruction Stack",
  summary: [
    "目标模式: always · 织梦写作台是公开入口；高级能力服务于 AI 对话、项目文件、上下文和审批。",
    "Codex AGENTS.md: project-scope · 已读取项目级 Agent 指令。",
    "Claude CLAUDE.md: project-and-user-memory · 项目记忆与协作约定作为可审查规则层。",
    "Kiro Steering: spec-driven · Specs / Steering / Hooks 可进入 context_pack。",
    "Gateway 安全闸门: always · 写文件、联网、远程模型、MCP、Scheduler、Skill runtime、命令执行全部走审批或显式授权。",
  ].join(" | "),
  ref: "instruction-stack:current",
  source: "Instruction Stack",
  status: "active",
  injected_by: "instruction_stack",
};

const threadContextText = buildAgentThreadContextText([instructionStackAttachment], 4000);
assert(threadContextText.includes("[当前线程上下文]"), "Instruction Stack context should render inside thread context");
assert(threadContextText.includes("[instruction] Agent 指令栈 / Instruction Stack"), "Instruction Stack title missing from thread context");
assert(threadContextText.includes("来源：Instruction Stack"), "Instruction Stack source missing from thread context");
assert(threadContextText.includes("ref=instruction-stack:current"), "Instruction Stack ref missing from thread context");
assert(threadContextText.includes("状态：active"), "Instruction Stack active status missing from thread context");
assert(threadContextText.includes("Codex AGENTS.md"), "Codex AGENTS layer missing from thread context");
assert(threadContextText.includes("Claude CLAUDE.md"), "Claude memory layer missing from thread context");
assert(threadContextText.includes("Kiro Steering"), "Kiro Steering layer missing from thread context");
assert(threadContextText.includes("Gateway 安全闸门"), "Gateway safety layer missing from thread context");
assert(threadContextText.includes("写文件、联网、远程模型"), "Safety execution boundary missing from thread context");

const modelContent = buildAgentChatContent("按当前项目规则继续任务。", [], threadContextText);
assertEqual(typeof modelContent, "string", "Instruction Stack-only context should stay text content");
assert(modelContent.includes("按当前项目规则继续任务。"), "user prompt missing from Instruction Stack model content");
assert(modelContent.includes("Agent 指令栈 / Instruction Stack"), "Instruction Stack title missing from model content");
assert(modelContent.includes("Codex AGENTS.md"), "Codex AGENTS missing from model content");
assert(modelContent.includes("Claude CLAUDE.md"), "Claude CLAUDE missing from model content");
assert(modelContent.includes("Specs / Steering / Hooks"), "Kiro rules missing from model content");
assert(modelContent.includes("命令执行全部走审批或显式授权"), "Gateway execution boundary missing from model content");

const receipt = buildAgentChatRequestReceipt({
  content: modelContent,
  provider: "openai-compatible",
  attachmentCount: 0,
  parsedFileCount: 0,
  imageAttachmentCount: 0,
  historyCount: 0,
  contextItemCount: 1,
});
assertEqual(receipt.contextItemCount, 1, "Instruction Stack request receipt should count one injected context item");
assertEqual(receipt.textPartCount, 1, "Instruction Stack context should be one text payload");
assertEqual(receipt.imagePartCount, 0, "Instruction Stack context must not create image parts");
assert(receipt.textChars >= threadContextText.length, "Instruction Stack request text should include thread context");

for (const snippet of [
  "function createInstructionStackAttachment",
  "title: \"Agent 指令栈 / Instruction Stack\"",
  "ref: \"instruction-stack:current\"",
  "source: \"Instruction Stack\"",
  "instructionStackAttachment = createInstructionStackAttachment(instructionStackLayers)",
  "const instructionProtocolAttachments = [",
  "activeProtocolContextAttachments = instructionProtocolAttachments",
  "injected_by: item.source === \"Instruction Stack\"",
  "? \"instruction_stack\"",
  "instruction_stack: \"auto-injected-project-agent-rules\"",
  "uses: [\"instruction_stack\", \"instruction_rule_match\", \"agent_thread_runbook\"",
  "buildAgentThreadContextText(effectiveDirectThreadContextItems, MAX_THREAD_ATTACHMENT_TEXT)",
]) {
  assert(component.includes(snippet), `Agent Home Instruction Stack injection contract missing: ${snippet}`);
}

for (const phrase of [
  "Instruction Stack 注入项目规则 / Skills / 安全边界",
  "Codex AGENTS、Claude CLAUDE、Kiro Steering/Specs/Hooks、Runbook 和安全闸门以只读规则层进入上下文",
  "Runbook、Instruction Stack、thread_context、context_pack 在任务前形成可审查上下文层",
]) {
  assert(phase4Doc.includes(phrase), `Phase 4 doc missing Instruction Stack success standard: ${phrase}`);
}

console.log("instruction-stack-context-injection ok");

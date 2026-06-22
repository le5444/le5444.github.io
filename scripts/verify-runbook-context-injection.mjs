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
} = await compileTsModule("../src/utils/agent-chat-transport.ts", "runbook-context-agent-chat", true);

const runbookAttachment = {
  id: "ctx-runbook-thread-1",
  kind: "context_pack",
  dimension: "runbook",
  title: "任务状态协议 / Runbook",
  summary: "阶段：等待处理 · 下一步：复核审批、变更和证据后再决定是否执行受控写入。 · 阻塞：1 条审批等待复核。 · 证据：5 条任务轨迹；3 条消息；2 个上下文附件",
  ref: "runbook:thread-1:current",
  source: "Agent Thread Runbook",
  status: "blocked",
  injected_by: "agent_thread_runbook",
};

const threadContextText = buildAgentThreadContextText([runbookAttachment], 3000);
assert(threadContextText.includes("[当前线程上下文]"), "Runbook context should render inside thread context");
assert(threadContextText.includes("[context_pack] 任务状态协议 / Runbook"), "Runbook title missing from thread context");
assert(threadContextText.includes("来源：Agent Thread Runbook"), "Runbook source missing from thread context");
assert(threadContextText.includes("ref=runbook:thread-1:current"), "Runbook ref missing from thread context");
assert(threadContextText.includes("状态：blocked"), "Runbook blocked status missing from thread context");
assert(threadContextText.includes("阶段：等待处理"), "Runbook phase missing from thread context");
assert(threadContextText.includes("下一步：复核审批、变更和证据后再决定是否执行受控写入"), "Runbook next action missing from thread context");
assert(threadContextText.includes("阻塞：1 条审批等待复核"), "Runbook blocker missing from thread context");
assert(threadContextText.includes("证据：5 条任务轨迹"), "Runbook evidence missing from thread context");

const modelContent = buildAgentChatContent("继续这个任务。", [], threadContextText);
assertEqual(typeof modelContent, "string", "Runbook-only context should stay text content");
assert(modelContent.includes("继续这个任务。"), "user prompt missing from Runbook model content");
assert(modelContent.includes("任务状态协议 / Runbook"), "Runbook title missing from model content");
assert(modelContent.includes("下一步：复核审批"), "Runbook next action missing from model content");
assert(modelContent.includes("阻塞：1 条审批等待复核"), "Runbook blocker missing from model content");

const receipt = buildAgentChatRequestReceipt({
  content: modelContent,
  provider: "openai-compatible",
  attachmentCount: 0,
  parsedFileCount: 0,
  imageAttachmentCount: 0,
  historyCount: 0,
  contextItemCount: 1,
});
assertEqual(receipt.contextItemCount, 1, "Runbook request receipt should count one injected context item");
assertEqual(receipt.textPartCount, 1, "Runbook context should be one text payload");
assertEqual(receipt.imagePartCount, 0, "Runbook context must not create image parts");
assert(receipt.textChars >= threadContextText.length, "Runbook request text should include thread context");

for (const snippet of [
  "createAgentThreadRunbookAttachment",
  "source: \"Agent Thread Runbook\"",
  "ref: `runbook:${thread.id}:current`",
  "agent_thread_runbook",
  "runbook: \"auto-injected-current-thread-status\"",
  "uses: [\"instruction_stack\", \"instruction_rule_match\", \"agent_thread_runbook\"",
  "activeProtocolContextAttachments",
  "const agentThreadRunbookAttachment = createAgentThreadRunbookAttachment(agentThreadRunbook, activeThread)",
  "agentThreadRunbookAttachment ? [agentThreadRunbookAttachment] : []",
  "buildAgentThreadContextText(effectiveDirectThreadContextItems, MAX_THREAD_ATTACHMENT_TEXT)",
]) {
  assert(component.includes(snippet), `Agent Home Runbook injection contract missing: ${snippet}`);
}

for (const phrase of [
  "Runbook、Instruction Stack、thread_context、context_pack 在任务前形成可审查上下文层",
  "当前线程可归纳阶段、阻塞点、下一步，并能作为线程上下文附件",
  "Runbook 和安全闸门以只读规则层进入上下文",
]) {
  assert(phase4Doc.includes(phrase), `Phase 4 doc missing Runbook success standard: ${phrase}`);
}

console.log("runbook-context-injection ok");

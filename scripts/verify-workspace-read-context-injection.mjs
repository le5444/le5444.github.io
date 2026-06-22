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

const {
  buildWorkspaceReadPreviewAttachment,
} = await compileTsModule("../src/utils/workspace-read-preview.ts", "workspace-read-context-preview");

const {
  buildAgentChatContent,
  buildAgentChatMessages,
  buildAgentChatRequestReceipt,
  buildAgentThreadContextText,
} = await compileTsModule("../src/utils/agent-chat-transport.ts", "workspace-read-context-agent-chat", true);

const preview = {
  status: "ok",
  path: "src/os/kernel/agent-loop.ts",
  targetPath: "C:\\Projects\\Zhimeng\\src\\os\\kernel\\agent-loop.ts",
  content: [
    "export async function runAgentLoop(task) {",
    "  const plan = await planPersonalOS(task);",
    "  const contextPack = await buildAgentContextPack(plan);",
    "  return { plan, contextPack };",
    "}",
    "const phase3Marker = 'read_file preview must enter model context';",
  ].join("\n"),
};

const { attachment } = buildWorkspaceReadPreviewAttachment({
  preview,
  title: "agent-loop.ts",
  maxChars: 220,
});

const threadContextText = buildAgentThreadContextText([attachment], 3000);
assert(threadContextText.includes("[当前线程上下文]"), "thread context header missing");
assert(threadContextText.includes("[file] agent-loop.ts"), "read_file preview attachment title missing from thread context");
assert(threadContextText.includes("Gateway read_file 预览"), "read_file source missing from thread context");
assert(threadContextText.includes("src/os/kernel/agent-loop.ts"), "source path missing from thread context");
assert(threadContextText.includes("runAgentLoop"), "preview content missing from thread context");
assert(threadContextText.includes("完整正文未持久保存"), "thread context must keep read_file persistence warning");

const content = buildAgentChatContent("请基于刚才读取的文件继续分析项目模式链路。", [], threadContextText);
assertEqual(typeof content, "string", "project read context without images should stay text content");
assert(content.includes("请基于刚才读取的文件继续分析项目模式链路。"), "user prompt missing from model content");
assert(content.includes("[当前线程上下文]"), "thread context missing from model content");
assert(content.includes("phase3Marker"), "read_file preview body missing from model content");
assert(content.includes("完整正文未持久保存"), "model content must not hide preview-only boundary");

const messages = buildAgentChatMessages({
  systemPrompt: "你是织梦项目模式验证助手。",
  promptText: "继续完成项目模式。",
  threadContextText,
});
assertEqual(messages.length, 2, "chat messages should include system and user message");
assertEqual(messages[1].role, "user", "second message should be user");
assert(String(messages[1].content).includes("runAgentLoop"), "read_file preview missing from assembled user chat message");

const receipt = buildAgentChatRequestReceipt({
  content: messages[1].content,
  provider: "openai-compatible",
  attachmentCount: 0,
  parsedFileCount: 0,
  imageAttachmentCount: 0,
  historyCount: 0,
  contextItemCount: 1,
});
assertEqual(receipt.contextItemCount, 1, "request receipt should count injected context item");
assertEqual(receipt.textPartCount, 1, "request receipt should expose text payload");
assert(receipt.textChars > preview.content.length, "request text should include prompt plus read_file context");
assertEqual(receipt.attachmentCount, 0, "read_file context injection should not masquerade as a user attachment");
assertEqual(receipt.imagePartCount, 0, "read_file context injection should stay text-only unless images are attached");
assertEqual(receipt.imageWireFormat, "none", "read_file context injection should not create image wire parts");
assert(receipt.textChars >= threadContextText.length, "request receipt should include the read_file thread context text length");

console.log("workspace-read-context-injection ok");

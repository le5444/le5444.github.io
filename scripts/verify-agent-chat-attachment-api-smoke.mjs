import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

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

function fileLike(name, type, content) {
  const blob = new Blob([content], { type });
  return {
    name,
    type,
    size: blob.size,
    slice: (...args) => blob.slice(...args),
    arrayBuffer: () => blob.arrayBuffer(),
  };
}

async function waitForJson(url, timeoutMs = 6000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

const {
  buildAgentThreadAttachmentFromFile,
} = await compileTsModule("../src/utils/agent-attachment-intake.ts", "attachment-api-intake");

const {
  buildAgentChatContent,
} = await compileTsModule("../src/utils/agent-chat-transport.ts", "attachment-api-transport", true);

const {
  sendChatViaProvider,
} = await compileTsModule("../src/store/api-providers.ts", "attachment-api-provider");

const port = 5194;
const server = spawn(process.execPath, [fileURLToPath(new URL("./smoke-openai-compatible-server.mjs", import.meta.url)), String(port)], {
  stdio: "ignore",
  windowsHide: true,
});

try {
  await waitForJson(`http://127.0.0.1:${port}/v1/models`);

  const textAttachment = await buildAgentThreadAttachmentFromFile(
    fileLike("phase1-notes.txt", "text/plain", "Phase1 attachment text preview: 文件片段进入模型请求。"),
    {
      idFactory: () => "attachment-text",
      readAsTextPreview: async () => "Phase1 attachment text preview: 文件片段进入模型请求。",
    },
  );
  const imageAttachment = await buildAgentThreadAttachmentFromFile(
    fileLike("tiny.png", "image/png", Buffer.from("fake-png")),
    {
      idFactory: () => "attachment-image",
      readAsDataUrl: async () => "data:image/png;base64,VEVTVF9QTkc=",
    },
  );

  assertEqual(textAttachment.kind, "file", "text attachment kind");
  assertEqual(textAttachment.parseStatus, "parsed", "text attachment parsed");
  assert(textAttachment.textPreview.includes("文件片段进入模型请求"), "text preview should contain attachment text");
  assertEqual(imageAttachment.kind, "image", "image attachment kind");
  assertEqual(imageAttachment.dataUrl, "data:image/png;base64,VEVTVF9QTkc=", "image data URL");

  const content = buildAgentChatContent(
    "请根据附件简要确认你收到了文件和图片。",
    [textAttachment, imageAttachment],
    "线程上下文：Phase 1 附件冒烟。",
  );
  assert(Array.isArray(content), "chat content should become multipart when an image is attached");
  assert(content[0].text.includes("phase1-notes.txt"), "multipart text should include file name");
  assert(content[0].text.includes("文件片段进入模型请求"), "multipart text should include parsed file preview");
  assertEqual(content[1].type, "image", "multipart second part should be image");

  const reply = await sendChatViaProvider({
    provider: "openai-compatible",
    apiUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: "test-local-key",
    modelId: "smoke-model",
    messages: [{ role: "user", content }],
  });
  assertEqual(reply, "浏览器模型配置冒烟成功。", "mock provider reply");

  const lastChat = await waitForJson(`http://127.0.0.1:${port}/__last-chat`);
  assertEqual(lastChat.model, "smoke-model", "mock recorded model");
  assertEqual(lastChat.imagePartCount, 1, "mock recorded image part count");
  assert(lastChat.textPartCount >= 1, "mock should record at least one text part");
  assert(lastChat.text.includes("phase1-notes.txt"), "mock recorded text should include file name");
  assert(lastChat.text.includes("文件片段进入模型请求"), "mock recorded text should include parsed file preview");
  assert(lastChat.text.includes("线程上下文：Phase 1 附件冒烟。"), "mock recorded text should include thread context");
  assert(Array.isArray(lastChat.imageUrls) && lastChat.imageUrls[0].startsWith("data:image/png;base64,"), "mock recorded image data URL");
} finally {
  server.kill("SIGTERM");
}

console.log("agent-chat-attachment-api-smoke ok");

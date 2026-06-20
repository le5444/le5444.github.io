import http from "node:http";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function compileProviderModule() {
  const providerSource = readFileSync(new URL("../src/store/api-providers.ts", import.meta.url), "utf8");
  const modulePath = join(tmpdir(), `zhimeng-agent-chat-api-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  const compiled = ts.transpileModule(providerSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  writeFileSync(modulePath, compiled, "utf8");
  return import(pathToFileURL(modulePath).href);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function createMockOpenAIServer() {
  const captured = [];
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readRequestBody(req);
      captured.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      });

      if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "not found" } }));
        return;
      }

      if (body.model === "fallback-model" && body.stream === true) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: "STREAM_BLOCKED", message: "mock stream blocked" } }));
        return;
      }

      if (body.model === "auth-fail-model") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: "invalid_api_key", message: "mock invalid key" } }));
        return;
      }

      if (body.stream === false) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          choices: [
            { message: { content: "fallback-ok" } },
          ],
        }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write('data: {"choices":[{"delta":{"content":"zhimeng-"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"api-ok"}}]}\n\n');
      res.end("data: [DONE]\n\n");
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : "mock error" } }));
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object", "mock server address unavailable");
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    captured,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

const { sendChatViaProvider } = await compileProviderModule();
const mock = await createMockOpenAIServer();

try {
  const chunks = [];
  const streamed = await sendChatViaProvider({
    provider: "openai-compatible",
    apiUrl: mock.baseUrl,
    apiKey: "test-key-api-smoke",
    modelId: "vision-model",
    systemPrompt: "system smoke prompt",
    temperature: 0.2,
    maxTokens: 64,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this attached image in one short line." },
          { type: "image", dataUrl: "data:image/png;base64,QUJDRA==", mimeType: "image/png" },
        ],
      },
    ],
    onChunk: (text) => chunks.push(text),
  });

  assertEqual(streamed, "zhimeng-api-ok", "streamed reply");
  assertEqual(chunks.join("|"), "zhimeng-|zhimeng-api-ok", "cumulative stream chunks");
  assertEqual(mock.captured.length, 1, "stream request count");

  const streamRequest = mock.captured[0];
  assertEqual(streamRequest.method, "POST", "stream method");
  assertEqual(streamRequest.url, "/v1/chat/completions", "stream URL");
  assertEqual(streamRequest.headers.authorization, "Bearer test-key-api-smoke", "stream auth header");
  assert(!JSON.stringify(streamRequest.body).includes("test-key-api-smoke"), "API key must not be placed in request body");
  assertEqual(streamRequest.body.model, "vision-model", "stream model");
  assertEqual(streamRequest.body.stream, true, "stream flag");
  assertEqual(streamRequest.body.temperature, 0.2, "stream temperature");
  assertEqual(streamRequest.body.max_tokens, 64, "stream max tokens");
  assertEqual(streamRequest.body.messages[0].role, "system", "system message role");
  assertEqual(streamRequest.body.messages[0].content, "system smoke prompt", "system prompt content");
  const userMessage = streamRequest.body.messages.find((message) => message.role === "user");
  assert(userMessage, "user message missing");
  assert(Array.isArray(userMessage.content), "multimodal user content should be an array");
  assertEqual(userMessage.content[0].type, "text", "text part type");
  assertEqual(userMessage.content[1].type, "image_url", "image part wire type");
  assertEqual(userMessage.content[1].image_url.url, "data:image/png;base64,QUJDRA==", "image data URL");

  const fallbackChunks = [];
  const fallback = await sendChatViaProvider({
    provider: "openai-compatible",
    apiUrl: mock.baseUrl,
    apiKey: "test-key-api-smoke",
    modelId: "fallback-model",
    messages: [{ role: "user", content: "Trigger non-stream fallback." }],
    onChunk: (text) => fallbackChunks.push(text),
  });

  assertEqual(fallback, "fallback-ok", "fallback reply");
  assertEqual(fallbackChunks.join("|"), "fallback-ok", "fallback chunk");
  assertEqual(mock.captured.length, 3, "stream plus fallback request count");
  assertEqual(mock.captured[1].body.stream, true, "fallback first attempt streams");
  assertEqual(mock.captured[2].body.stream, false, "fallback second attempt disables stream");
  assertEqual(mock.captured[2].headers.authorization, "Bearer test-key-api-smoke", "fallback auth header");

  let authError = null;
  try {
    await sendChatViaProvider({
      provider: "openai-compatible",
      apiUrl: mock.baseUrl,
      apiKey: "bad-key",
      modelId: "auth-fail-model",
      messages: [{ role: "user", content: "Trigger auth failure." }],
    });
  } catch (error) {
    authError = error;
  }
  assert(authError, "auth failure should throw");
  assert(String(authError.message || authError).includes("401"), "auth failure should include HTTP status");
  assert(String(authError.message || authError).includes("invalid_api_key"), "auth failure should include provider error code");
  assertEqual(mock.captured.length, 4, "auth failure must not trigger non-stream fallback request");
  assertEqual(mock.captured[3].body.stream, true, "auth failure only attempts stream request");
  assertEqual(mock.captured[3].headers.authorization, "Bearer bad-key", "auth failure auth header");
} finally {
  await mock.close();
}

console.log("agent-chat-api-smoke ok");

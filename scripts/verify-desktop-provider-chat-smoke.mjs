import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import ts from "typescript";

const root = new URL("../", import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function parseJsonOutput(label, output) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error.message}\n${output}`);
  }
}

function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed\nSTDOUT:\n${result.stdout || ""}\nSTDERR:\n${result.stderr || ""}`);
  }
  return result.stdout || "";
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
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
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function compileProviderModule() {
  const providerSource = readFileSync(new URL("../src/store/api-providers.ts", import.meta.url), "utf8");
  const modulePath = join(tmpdir(), `zhimeng-desktop-provider-chat-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
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

const tmp = mkdtempSync(join(tmpdir(), "zhimeng-desktop-provider-chat-"));
const configPath = join(tmp, "provider-settings.json");
const port = await getFreePort();
const apiUrl = `http://127.0.0.1:${port}/v1`;
const apiKey = "sk-test-desktop-provider-chat";

const mock = spawn(process.execPath, ["scripts/smoke-openai-compatible-server.mjs", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
mock.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await waitForJson(`${apiUrl}/models`);

  const applyOutput = run("Provider switch apply chat smoke profile", "python", [
    "desktop/zhimeng_provider_switch.py",
    "apply",
    "--config",
    configPath,
    "--profile-id",
    "desktop-chat-smoke",
    "--name",
    "Desktop Chat Smoke",
    "--provider",
    "openai-compatible",
    "--api-url",
    apiUrl,
    "--model-id",
    "smoke-model",
    "--api-key",
    apiKey,
  ]);
  const applyResult = parseJsonOutput("Provider switch apply chat smoke profile", applyOutput);
  assertEqual(applyResult.status, "ok", "provider switch apply status");
  assertEqual(applyResult.activeProfile?.apiKey, "[present:redacted]", "provider switch apply should redact key");

  const gatewayOutput = run("Gateway provider_config_status chat smoke", "python", [
    "bridge/zhimeng_bridge.py",
    "--json",
    JSON.stringify({
      action: "provider_config_status",
      purpose: "verify desktop Provider config can drive chat transport",
      payload: {
        include_secret: true,
        import_to_frontend: true,
      },
    }),
  ], {
    env: { ...process.env, ZHIMENG_PROVIDER_CONFIG: configPath },
  });
  const gateway = parseJsonOutput("Gateway provider_config_status chat smoke", gatewayOutput);
  const settings = gateway.provider_config_status?.settings || {};
  assertEqual(gateway.status, "ok", "gateway config status");
  assertEqual(settings.apiUrl, apiUrl, "gateway settings apiUrl");
  assertEqual(settings.apiKey, apiKey, "gateway settings apiKey gated import");
  assertEqual(settings.modelId, "smoke-model", "gateway settings modelId");
  assertEqual(settings.provider, "openai-compatible", "gateway settings provider");
  assertEqual(settings.desktopConfigSource, "desktop-provider-switch", "gateway settings source");

  const { sendChatViaProvider } = await compileProviderModule();
  const chunks = [];
  const reply = await sendChatViaProvider({
    provider: settings.provider,
    apiUrl: settings.apiUrl,
    apiKey: settings.apiKey,
    modelId: settings.modelId,
    messages: [
      { role: "system", content: "你是织梦写作台的连接冒烟助手。" },
      { role: "user", content: "请回复：桌面配置聊天链路成功。" },
    ],
    onChunk: (text) => chunks.push(text),
  });

  assertEqual(reply, "浏览器模型配置冒烟成功。", "desktop config chat reply");
  assert(chunks.length >= 1, "chat smoke should receive streaming chunks");
  assertEqual(chunks.at(-1), reply, "last chunk should equal full reply");

  const lastChat = await waitForJson(`http://127.0.0.1:${port}/__last-chat`);
  assertEqual(lastChat.model, "smoke-model", "mock recorded model");
  assertEqual(lastChat.authorization, "[present]", "mock recorded authorization presence only");
  assert(lastChat.text.includes("桌面配置聊天链路成功"), "mock recorded user text");
  assert(!JSON.stringify(lastChat).includes(apiKey), "mock diagnostics must not echo API key");
} finally {
  mock.kill("SIGTERM");
  if (stderr.trim()) {
    // Keep stderr captured for thrown errors without adding noise to successful runs.
  }
}

console.log("desktop-provider-chat-smoke ok");

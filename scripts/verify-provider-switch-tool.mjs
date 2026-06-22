import { mkdtempSync, readFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);

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

async function waitForModels(url, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url, timeoutMs = 5000) {
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

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function parseJsonOutput(label, output) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error.message}\n${output}`);
  }
}

const tmp = mkdtempSync(join(tmpdir(), "zhimeng-provider-switch-"));
const configPath = join(tmp, "provider-settings.json");

const list = run("Provider switch list", "python", ["desktop/zhimeng_provider_switch.py", "list", "--group", "router", "--limit", "4"]);
assert(list.includes("codex2api-codex") || list.includes("openrouter-auto"), "Provider switch list should show router presets");

const applyOutput = run("Provider switch apply", "python", [
  "desktop/zhimeng_provider_switch.py",
  "apply",
  "--config",
  configPath,
  "--preset",
  "codex2api-codex",
  "--api-key",
  "sk-test-local-provider-switch",
]);
const applyResult = parseJsonOutput("Provider switch apply", applyOutput);
assert(applyResult.status === "ok", "Provider switch apply should succeed");
assert(applyResult.activeProfile?.apiKey === "[present:redacted]", "Provider switch apply output should redact apiKey");

const config = JSON.parse(readFileSync(configPath, "utf8"));
assert(config.schema === "zhimeng.provider-settings.v1", "Provider switch config schema mismatch");
assert(config.activeProfileId === "codex2api-codex", "Provider switch active profile mismatch");
assert(config.profiles?.[0]?.apiKey === "sk-test-local-provider-switch", "Provider switch should write local test key to temp config");

const statusOutput = run("Provider switch status", "python", [
  "desktop/zhimeng_provider_switch.py",
  "status",
  "--config",
  configPath,
]);
const status = parseJsonOutput("Provider switch status", statusOutput);
assert(status.profiles?.[0]?.apiKey === "[present:redacted]", "Provider switch status should redact apiKey");

const remoteBlockedOutput = run("Provider switch remote probe blocked", "python", [
  "desktop/zhimeng_provider_switch.py",
  "probe",
  "--config",
  configPath,
]);
const remoteBlocked = parseJsonOutput("Provider switch remote probe blocked", remoteBlockedOutput);
assert(remoteBlocked.status === "approval_required", "Remote provider probe should require --allow-remote");
assert(/allow_remote_model/.test(remoteBlocked.reason || ""), "Remote probe block reason should mention allow_remote_model");

const gatewayOutput = run("Gateway provider_config_status", "python", [
  "bridge/zhimeng_bridge.py",
  "--json",
  JSON.stringify({
    action: "provider_config_status",
    purpose: "verify desktop provider switch import",
    payload: { include_secret: true, import_to_frontend: true },
  }),
], {
  env: { ...process.env, ZHIMENG_PROVIDER_CONFIG: configPath },
});
const gateway = parseJsonOutput("Gateway provider_config_status", gatewayOutput);
assert(gateway.status === "ok", "Gateway provider_config_status should succeed");
assert(gateway.provider_config_status?.settings?.apiUrl === "https://www.codex2api.com/v1", "Gateway should expose frontend-ready apiUrl");
assert(gateway.provider_config_status?.settings?.apiKey === "sk-test-local-provider-switch", "Gateway should expose secret only for explicit frontend import");

const port = await getFreePort();
const mock = spawn(process.execPath, ["scripts/smoke-openai-compatible-server.mjs", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
mock.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
try {
  await waitForModels(`http://127.0.0.1:${port}/v1/models`);
  const localApplyOutput = run("Provider switch apply local mock", "python", [
    "desktop/zhimeng_provider_switch.py",
    "apply",
    "--config",
    configPath,
    "--profile-id",
    "local-smoke",
    "--name",
    "Local Smoke",
    "--provider",
    "openai-compatible",
    "--api-url",
    `http://127.0.0.1:${port}/v1`,
    "--model-id",
    "smoke-model",
    "--api-key",
    "sk-test-local-provider-switch",
  ]);
  const localApply = parseJsonOutput("Provider switch apply local mock", localApplyOutput);
  assert(localApply.status === "ok", "Local mock profile apply should succeed");
  const localProbeOutput = run("Provider switch local probe", "python", [
    "desktop/zhimeng_provider_switch.py",
    "probe",
    "--config",
    configPath,
  ]);
  const localProbe = parseJsonOutput("Provider switch local probe", localProbeOutput);
  assert(localProbe.status === "ok", "Local Provider probe should succeed");
  assert(localProbe.modelCount >= 1, "Local Provider probe should report returned models");
  assert(localProbe.models?.some((model) => model.id === "smoke-model"), "Local Provider probe should include smoke-model");
  assert(localProbe.config?.apiKey === "[present:redacted]", "Local Provider probe output should redact apiKey");
  const chatSmokeOutput = run("Provider switch local chat smoke", "python", [
    "desktop/zhimeng_provider_switch.py",
    "chat-smoke",
    "--config",
    configPath,
    "--prompt",
    "Reply provider switch chat smoke.",
  ]);
  const chatSmoke = parseJsonOutput("Provider switch local chat smoke", chatSmokeOutput);
  assert(chatSmoke.status === "ok", "Local Provider chat-smoke should succeed");
  assert(Number(chatSmoke.outputChars || 0) > 0, `Local Provider chat-smoke should return non-empty model output: ${chatSmokeOutput}`);
  assert(chatSmoke.config?.apiKey === "[present:redacted]", "Local Provider chat-smoke output should redact apiKey");
  assert(!chatSmokeOutput.includes("sk-test-local-provider-switch"), "Local Provider chat-smoke output must not echo apiKey");
  const chatLast = await waitForJson(`http://127.0.0.1:${port}/__last-chat`);
  assert(chatLast.model === "smoke-model", "Local Provider chat-smoke should send saved model id");
  assert(chatLast.authorization === "[present]", "Local Provider chat-smoke should send authorization without echoing key");
  assert(String(chatLast.text || "").includes("Reply provider switch chat smoke."), "Local Provider chat-smoke should send prompt text");
} finally {
  mock.kill("SIGTERM");
  if (stderr.trim()) {
    // Keep stderr available in failures without making successful runs noisy.
  }
}

console.log("provider-switch-tool ok");

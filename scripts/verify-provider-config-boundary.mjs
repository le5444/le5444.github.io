import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function unique(values) {
  return Array.from(new Set(values));
}

function compileProviderModule() {
  const storeStubDir = join(tmpdir(), `zhimeng-provider-boundary-store-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(storeStubDir, { recursive: true });
  writeFileSync(join(storeStubDir, "settings.js"), "export {};\n", "utf8");
  const providerSource = readFileSync(new URL("../src/store/api-providers.ts", import.meta.url), "utf8")
    .replace(/from "\.\/settings"/g, `from ${JSON.stringify(pathToFileURL(join(storeStubDir, "settings.js")).href)}`);
  const modulePath = join(tmpdir(), `zhimeng-verify-provider-config-${Date.now()}.mjs`);
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

function parseGatewayPresets(source) {
  const start = source.indexOf("PROVIDER_PRESETS = [");
  const end = source.indexOf("]\n_LOCAL_SKILL_CACHE", start);
  assert(start >= 0 && end > start, "Gateway PROVIDER_PRESETS block not found");
  const block = source.slice(start, end);
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.includes('"id"'))
    .map((line) => {
      const record = {};
      for (const match of line.matchAll(/"([^"]+)":\s*"([^"]*)"/g)) {
        record[match[1]] = match[2];
      }
      return record;
    });
}

const {
  PROVIDER_PRESETS,
  allowsEmptyApiKey,
  inferProvider,
} = await compileProviderModule();

const gatewaySource = readFileSync(new URL("../bridge/zhimeng_bridge.py", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/store/settings.ts", import.meta.url), "utf8");
const modalsSource = readFileSync(new URL("../src/components/Modals.tsx", import.meta.url), "utf8");
const controlCenterSource = readFileSync(new URL("../src/components/AgentControlCenter.tsx", import.meta.url), "utf8");
const phase1Doc = readFileSync(new URL("../docs/phase1-chat-acceptance-20260619.md", import.meta.url), "utf8");

const gatewayPresets = parseGatewayPresets(gatewaySource);
const frontendIds = PROVIDER_PRESETS.map((preset) => preset.id);
const gatewayIds = gatewayPresets.map((preset) => preset.id);

assert(PROVIDER_PRESETS.length >= 30, "Frontend provider preset catalog should stay broad enough for API-first setup");
assertEqual(frontendIds.length, unique(frontendIds).length, "Frontend provider preset ids must be unique");
assertEqual(gatewayIds.length, unique(gatewayIds).length, "Gateway provider preset ids must be unique");
assertEqual(PROVIDER_PRESETS.length, gatewayPresets.length, "Frontend and Gateway provider preset counts must match");
assertEqual(
  unique(frontendIds).sort().join("\n"),
  unique(gatewayIds).sort().join("\n"),
  "Frontend and Gateway provider preset ids must match",
);

const gatewayById = new Map(gatewayPresets.map((preset) => [preset.id, preset]));
for (const preset of PROVIDER_PRESETS) {
  const gatewayPreset = gatewayById.get(preset.id);
  assert(gatewayPreset, `Gateway preset missing: ${preset.id}`);
  assertEqual(gatewayPreset.label, preset.label, `${preset.id} label`);
  assertEqual(gatewayPreset.provider, preset.provider, `${preset.id} provider`);
  assertEqual(gatewayPreset.api_url, preset.apiUrl, `${preset.id} api_url`);
  assertEqual(gatewayPreset.model_id, preset.modelId, `${preset.id} model_id`);
  assertEqual(gatewayPreset.model_name, preset.modelName, `${preset.id} model_name`);
  assertEqual(gatewayPreset.group || "global", preset.group || "global", `${preset.id} group`);
}

const codex2api = PROVIDER_PRESETS.find((preset) => preset.id === "codex2api-codex");
assert(codex2api, "Codex2API preset missing");
assertEqual(codex2api.provider, "openai-compatible", "Codex2API provider");
assertEqual(codex2api.apiUrl, "https://www.codex2api.com/v1", "Codex2API base URL");
assertEqual(codex2api.group, "router", "Codex2API group");
assert(codex2api.modelId.includes("codex"), "Codex2API preset should default to a Codex model id");
assert((codex2api.notes || "").includes("/models"), "Codex2API notes should mention model list discovery");
assert((codex2api.notes || "").includes("密钥"), "Codex2API notes should mention local key storage");
assertEqual(inferProvider(codex2api.apiUrl), "openai-compatible", "Codex2API inferred provider");
assertEqual(allowsEmptyApiKey(codex2api.apiUrl, codex2api.provider), false, "Codex2API should require an API key");

for (const localPreset of PROVIDER_PRESETS.filter((preset) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(preset.apiUrl))) {
  assertEqual(allowsEmptyApiKey(localPreset.apiUrl, localPreset.provider), true, `${localPreset.id} local preset should allow an empty key`);
}

assert(gatewaySource.includes('"provider_probe requires Gateway --execute-provider before any network probe"'), "Gateway provider_probe must require --execute-provider");
assert(gatewaySource.includes('"provider_probe requires payload execute=true before any network probe"'), "Gateway provider_probe must require request execute=true");
assert(gatewaySource.includes("if not is_local_model_url(api_url) and not bool(payload.get(\"allow_remote_model\"))"), "Gateway provider_probe must check allow_remote_model for remote endpoints");
assert(gatewaySource.includes('"remote provider probes require allow_remote_model=true"'), "Gateway provider_probe must explain the remote allow gate");
assert(gatewaySource.includes('"record": redact_record_secrets(record or {})'), "Gateway provider actions should redact records");
assert(gatewaySource.includes('"request": redact_record_secrets(req)'), "Gateway save_record should redact request secrets");
assert(gatewaySource.includes('"result": redact_record_secrets(result)'), "Gateway save_record should redact result secrets");
assert(gatewaySource.includes("def is_sensitive_record_key"), "Gateway should centralize record secret detection");
assert(gatewaySource.includes("authorization|cookie|set-cookie|x-api-key"), "Gateway redaction should cover sensitive headers");
assert(gatewaySource.includes("api[-_]?key|apikey"), "Gateway redaction should cover api_key, api-key, and apiKey");
assert(gatewaySource.includes("password|passwd|token|secret"), "Gateway redaction should cover common secret names");

const historyTypeBlock = settingsSource.slice(
  settingsSource.indexOf("export interface ModelDiscoveryHistoryEntry"),
  settingsSource.indexOf("const STORAGE_KEY"),
);
assert(historyTypeBlock.includes("keyPresent: boolean"), "Model discovery history should store only key presence");
assert(!historyTypeBlock.includes("apiKey"), "Model discovery history must not store apiKey");
assert(!historyTypeBlock.includes("api_key"), "Model discovery history must not store api_key");

const modalReplayBlock = modalsSource.slice(
  modalsSource.indexOf("const replayDiscoveryHistory"),
  modalsSource.indexOf("const clearModelDiscoveryHistory"),
);
assert(modalReplayBlock.includes("不会恢复密钥"), "Settings model discovery history replay should tell the user the key is not restored");
assert(!modalReplayBlock.includes("apiKey:"), "Settings model discovery history replay must not restore apiKey");
assert(!modalReplayBlock.includes("api_key:"), "Settings model discovery history replay must not restore api_key");
assert(modalsSource.includes("record: false"), "Settings model discovery should default to non-recorded probes");
assert(modalsSource.includes("action: \"provider_probe\""), "Settings model discovery should use provider_probe");
assert(modalsSource.includes("allow_remote_model: modelDiscoveryNeedsRemoteAllow"), "Settings model discovery should pass explicit remote allow gate");
assert(modalsSource.includes("keyPresent: Boolean(form.apiKey.trim())"), "Settings model discovery should store key presence only");
assert(modalsSource.includes("不会保存或回显密钥"), "Settings model discovery history UI should explain secret handling");
assert(modalsSource.includes("settings-modal-overlay"), "Settings modal should use the lightweight overlay shell");
assert(modalsSource.includes("settings-modal-panel"), "Settings modal should use the lightweight desktop panel shell");
assert(modalsSource.includes('data-testid="settings-provider-presets"'), "Settings modal should expose provider presets test id");
assert(modalsSource.includes('data-testid="settings-provider-manual-form"'), "Settings modal should expose manual provider form test id");
assert(modalsSource.includes('data-testid="settings-model-discovery"'), "Settings modal should expose model discovery test id");
assert(phase1Doc.includes("不默认占右侧栏或全屏打断"), "Phase 1 doc should reject disruptive provider config surfaces");

const controlHistoryLoadBlock = controlCenterSource.slice(
  controlCenterSource.indexOf("const loadModelDiscoveryHistoryToDraft"),
  controlCenterSource.indexOf("const inspectModelDiscoveryHistory"),
);
assert(controlHistoryLoadBlock.includes("不会恢复或显示 API key"), "Provider center history replay should tell the user the key is not restored");
assert(!controlHistoryLoadBlock.includes("apiKey:"), "Provider center history replay must not restore apiKey");
assert(!controlHistoryLoadBlock.includes("api_key:"), "Provider center history replay must not restore api_key");
assert(controlCenterSource.includes("redactedProviderPayload"), "Provider center should render redacted provider payloads");
assert(controlCenterSource.includes("[present:redacted]"), "Provider center payload preview should redact present keys");
assert(controlCenterSource.includes('bridgeAction("provider_catalog", { limit: 80 })'), "Provider center should request the full-ish provider catalog");
assert(controlCenterSource.includes("PROVIDER_PRESETS.map(providerPresetRecord)"), "Provider center should fall back to frontend provider presets");
assert(controlCenterSource.includes("API key is not stored or replayed from discovery history"), "Provider center history inspection should keep the no-secret policy");

for (const requiredDocText of [
  "API 优先原则",
  "模型配置",
  "Provider",
  "密钥",
  "模型中心",
  "npm run verify:provider-config",
]) {
  assert(phase1Doc.includes(requiredDocText), `Phase 1 acceptance doc missing provider boundary text: ${requiredDocText}`);
}

console.log("provider-config-boundary ok");

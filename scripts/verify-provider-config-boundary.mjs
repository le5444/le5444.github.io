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
const threadHeaderSource = readFileSync(new URL("../src/components/WorkbenchThreadHeader.tsx", import.meta.url), "utf8");
const controlSurface = `${controlCenterSource}\n${threadHeaderSource}`;
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

const openaiAuto = PROVIDER_PRESETS.find((preset) => preset.id === "openai-auto-discover");
assert(openaiAuto, "OpenAI discover preset missing");
assertEqual(openaiAuto.apiUrl, "https://api.openai.com/v1", "OpenAI discover base URL");
assert(openaiAuto.modelId !== "gpt-5.5", "OpenAI discover should not pin guessed future model ids");
assert(openaiAuto.modelId.includes("获取模型列表"), "OpenAI discover should read as a model discovery template, not a pinned recommendation");
assert((openaiAuto.notes || "").includes("/models"), "OpenAI discover preset should push real model discovery");
assert((openaiAuto.notes || "").includes("账号 /models 返回"), "OpenAI discover preset should frame /models as the source of truth");
const openaiCodex = PROVIDER_PRESETS.find((preset) => preset.id === "openai-codex-discover");
assert(openaiCodex, "OpenAI Codex discover preset missing");
assert((openaiCodex.notes || "").includes("Codex"), "OpenAI Codex discover preset should explain coding-agent use");
assert((openaiCodex.notes || "").includes("/models"), "OpenAI Codex discover preset should push account model discovery");
assert(openaiCodex.modelId.includes("from-models"), "OpenAI Codex preset should be a discovery placeholder");

for (const localPreset of PROVIDER_PRESETS.filter((preset) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(preset.apiUrl))) {
  assertEqual(allowsEmptyApiKey(localPreset.apiUrl, localPreset.provider), true, `${localPreset.id} local preset should allow an empty key`);
  if (localPreset.group === "local") {
    assert((localPreset.label || "").includes("本地服务端点"), `${localPreset.id} should be labeled as a local service endpoint`);
    assert((localPreset.notes || "").includes("不代表电脑已有本地模型"), `${localPreset.id} should avoid implying a local model exists`);
  }
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
assert(modalsSource.includes('data-testid="settings-provider-custom-quickstart"'), "Settings modal should expose custom API quickstart before presets");
assert(modalsSource.indexOf('data-testid="settings-provider-custom-quickstart"') < modalsSource.indexOf('data-testid="settings-provider-presets"'), "Custom API quickstart should appear before provider presets");
assert(modalsSource.includes('data-testid="settings-custom-api-url-input"'), "Settings modal should expose custom API URL input");
assert(modalsSource.includes('data-testid="settings-custom-api-key-input"'), "Settings modal should expose custom API key input");
assert(modalsSource.includes('data-testid="settings-custom-api-key-field"'), "Settings modal should make the API key field easy to locate");
assert(modalsSource.includes('data-testid="settings-custom-model-id-input"'), "Settings modal should expose custom model ID input");
assert(modalsSource.includes('data-testid="settings-save-button"'), "Settings modal should expose save button for browser smoke");
assert(modalsSource.includes('data-testid="settings-quick-save-button"'), "Settings modal should expose quick save beside custom API inputs");
assert(modalsSource.includes('data-testid="settings-save-status"'), "Settings modal should expose save validation status");
assert(modalsSource.includes("还没填接口地址 / baseURL"), "Settings save should block missing baseURL with a clear message");
assert(modalsSource.includes("还没填模型 ID"), "Settings save should block missing model id with a clear message");
assert(modalsSource.includes("这个接口需要 API key"), "Settings save should block missing API key with a clear message");
assert(modalsSource.includes("请把 key 粘贴到上方密钥输入框"), "Settings save validation should point to the key input");
assert(modalsSource.includes("if (!next.apiUrl)"), "Settings save should validate apiUrl before closing");
assert(modalsSource.includes("if (!next.modelId)"), "Settings save should validate modelId before closing");
assert(modalsSource.includes("if (!nextKeyOptional && !next.apiKey)"), "Settings save should validate required API key before closing");
assert(modalsSource.includes('data-testid="settings-provider-paste-parser"'), "Settings modal should expose a paste-to-config parser");
assert(modalsSource.includes('data-testid="settings-provider-config-paste-input"'), "Settings modal should expose a paste input for cc switch / JSON configs");
assert(modalsSource.includes('data-testid="settings-parse-provider-config-button"'), "Settings modal should expose a parse-to-draft button");
assert(modalsSource.includes("parseProviderConfigPaste"), "Settings modal should parse pasted Provider config snippets");
assert(modalsSource.includes("applyPastedProviderConfig"), "Settings modal should apply pasted Provider config into the draft");
assert(modalsSource.includes("解析只填草稿，不会自动保存或请求模型"), "Settings paste parser must not imply instant activation or model calls");
assert(modalsSource.includes("支持 cc switch / JSON / 普通文本里的 baseURL、apiUrl、apiKey、modelId"), "Settings paste parser should explain supported config shapes");
assert(modalsSource.includes("已解析并填入草稿"), "Settings paste parser should confirm draft-only parsing");
assert(modalsSource.includes("const nextApiUrl = (parsed.apiUrl || prev.apiUrl).trim().replace(/\\/+$"), "Settings paste parser should normalize pasted API URL before showing the draft");
assert(modalsSource.includes("apiKey: parsed.apiKey.trim() || prev.apiKey"), "Settings paste parser should trim pasted API keys before showing the draft");
assert(modalsSource.includes('data-testid="settings-current-provider-status"'), "Settings modal should show the current saved Provider status");
assert(modalsSource.includes('data-testid="settings-config-flow"'), "Settings modal should show a compact API setup flow");
assert(modalsSource.includes('data-testid="settings-model-discovery"'), "Settings modal should expose model discovery test id");
assert(modalsSource.includes("buildDirectModelDiscoveryRequest"), "Settings model discovery should have a browser direct /models fallback");
assert(modalsSource.includes("正在尝试浏览器直连 /models"), "Settings model discovery should explain Gateway fallback to direct /models");
assert(modalsSource.includes("这里就是你要输 key 的地方"), "Settings custom API entry should make key input obvious");
assert(modalsSource.includes("自定义 API 是主入口"), "Settings modal should make custom API the primary path");
assert(modalsSource.includes("复制 key 到这里"), "Settings modal should make the API key input target explicit");
assert(modalsSource.includes("粘贴配置并解析"), "Settings custom API entry should support paste-based setup");
assert(modalsSource.includes("解析到草稿"), "Settings custom API entry should make parsed config a draft action");
for (const flowText of ["填接口和密钥", "获取账号模型", "保存并用于聊天", "回到输入框测试"]) {
  assert(modalsSource.includes(flowText), `Settings setup flow missing step: ${flowText}`);
}
assert(modalsSource.includes("保存时会自动去掉复制进来的前后空格"), "Settings save path should explain pasted key/baseURL trimming");
assert(modalsSource.includes("不知道模型 ID？"), "Settings custom API entry should expose model discovery beside key inputs");
assert(modalsSource.includes("AI 对话立即使用"), "Settings custom API entry should explain chat activation");
assert(modalsSource.includes("本地服务端点"), "Settings modal should call local entries service endpoints, not local models");
assert(!modalsSource.includes("例：Codex2API / DeepSeek / 本地模型"), "Settings model name placeholder must not imply a discovered local model");
assert(modalsSource.includes("用当前密钥获取模型列表"), "Settings model discovery button should mention current key");
assert(modalsSource.includes("当前首页正在使用"), "Settings modal should tell the user which Provider is currently active");
assert(modalsSource.includes("草稿未保存"), "Settings modal should distinguish unsaved drafts from the active Provider");
assert(modalsSource.includes("填入草稿"), "Settings model discovery cards should make selection a draft action");
assert(modalsSource.includes("草稿已选，保存 API 配置后首页生效"), "Settings model discovery cards should show selected draft status");
assert(modalsSource.includes("保存 API 配置"), "Settings modal should name the save action consistently");
assert(modalsSource.includes("要修改接口、key 或模型 ID，请使用最上方"), "Settings modal should avoid duplicate API/key entry areas");
assert(modalsSource.includes("不是模型清单"), "Provider presets should be framed as endpoint templates, not model choices");
assert(modalsSource.includes("只填端点模板，模型从账号读取"), "Provider preset cards should not foreground placeholder model ids");
assert(modalsSource.includes("模型 ID 不会用模板覆盖"), "Provider preset click should explain it does not overwrite the model ID");
assert(modalsSource.includes("点击不会覆盖你手填或读取到的模型 ID"), "Provider preset summary should say templates do not replace real model IDs");
assert(modalsSource.includes("保存 API 配置并用于聊天"), "Settings save action should clearly activate chat");
const applyPresetBlock = modalsSource.slice(
  modalsSource.indexOf("const applyPreset"),
  modalsSource.indexOf("const profiles"),
);
assert(applyPresetBlock.includes("apiUrl: preset.apiUrl"), "Provider preset should still fill endpoint URL");
assert(applyPresetBlock.includes("provider: preset.provider"), "Provider preset should still fill provider type");
assert(!applyPresetBlock.includes("modelId: preset.modelId"), "Provider preset must not overwrite custom/discovered model ID");
assert(!applyPresetBlock.includes("modelName: preset.modelName"), "Provider preset must not overwrite custom/discovered model display name");
assert(modalsSource.includes("const normalizedForm"), "Settings save should normalize pasted API URL/key/model values before persisting");
assert(modalsSource.includes("apiKey: next.apiKey.trim()"), "Settings save should trim pasted API keys");
assert(modalsSource.includes("apiUrl: next.apiUrl.trim().replace(/\\/+$"), "Settings save should trim API URLs");
for (const stalePresetId of ["openai-gpt-4o-mini", "openai-gpt-4o", "claude-opus-4-7", "gpt-5.3-codex"]) {
  assert(!frontendIds.includes(stalePresetId), `Provider presets should not include stale preset id: ${stalePresetId}`);
  assert(!gatewayIds.includes(stalePresetId), `Gateway presets should not include stale preset id: ${stalePresetId}`);
}
for (const staleModelId of ["gpt-4o-mini", "gpt-4o", "gpt-5.5", "gpt-5-codex", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-opus-4-1", "claude-opus-4-8", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-1.5-pro", "gemini-2.0-flash", "anthropic/claude-sonnet-4.6", "Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3", "qwen-max", "qwen-plus", "moonshot-v1-128k", "glm-4-plus", "glm-4-flash", "Baichuan4", "step-2-16k", "abab6.5s-chat", "yi-large", "doubao-seed-1-6", "hunyuan-turbo", "llama-3.3-70b-versatile", "mistral-large-latest", "sonar-pro", "grok-2-latest"]) {
  assert(!PROVIDER_PRESETS.some((preset) => preset.modelId === staleModelId), `Frontend provider presets should not pin stale model id: ${staleModelId}`);
  assert(!gatewayPresets.some((preset) => preset.model_id === staleModelId), `Gateway provider presets should not pin stale model id: ${staleModelId}`);
}
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
assert(controlSurface.includes('data-testid="agent-home-header-model-settings"'), "Agent Home header should expose a visible model settings entry");
assert(controlCenterSource.includes("homeHeaderModelLabel"), "Agent Home should compute a clear header model label");
assert(controlCenterSource.includes("填写接口地址、API key 和模型 ID"), "Agent Home header should explain custom API setup when unconfigured");
assert(controlCenterSource.includes("onOpenModelSettings={openQuickModelSettings}") || threadHeaderSource.includes("onClick={onOpenModelSettings}"), "Agent Home header model entry should open the lightweight settings modal");
assert(controlCenterSource.includes('id: "config-model"'), "Agent Home empty state should expose a direct model configuration action when setup is missing");
assert(controlCenterSource.includes('label: "配置模型"'), "Agent Home model configuration action should be named plainly in Chinese");
assert(controlCenterSource.includes("onClick: openQuickModelSettings"), "Agent Home model configuration action should open the lightweight settings modal");
assert(controlCenterSource.includes('data-testid="provider-center-quick-api-key-input"'), "Provider center quick setup should allow direct API key entry");
assert(controlCenterSource.includes('data-testid="provider-center-api-key-input"'), "Provider center full draft form should allow direct API key entry");
assert(controlCenterSource.includes("providerDraftSecret = providerConfigDraft.apiKey.trim()"), "Provider center should prefer the draft API key before saved keys");
assert(controlCenterSource.includes("api_key: providerDraftSecret"), "Provider center probes and model tests should use the draft-aware API key");
assert(controlCenterSource.includes("保存或测试会优先使用这次粘贴的密钥"), "Provider center should explain draft API key behavior");
assert(controlCenterSource.includes("不在页面明文回显"), "Provider center should not imply saved keys are visible");
assert(controlCenterSource.includes('bridgeAction("provider_catalog", { limit: 80 })'), "Provider center should request the full-ish provider catalog");
assert(controlCenterSource.includes("PROVIDER_PRESETS.map(providerPresetRecord)"), "Provider center should fall back to frontend provider presets");
assert(controlCenterSource.includes("API key is not stored or replayed from discovery history"), "Provider center history inspection should keep the no-secret policy");
const controlApplyPresetBlock = controlCenterSource.slice(
  controlCenterSource.indexOf("const applyProviderPresetToDraft"),
  controlCenterSource.indexOf("const applyProviderProfileToDraft"),
);
assert(controlApplyPresetBlock.includes("apiUrl: asString(preset.api_url)"), "Provider center preset should still fill endpoint URL");
assert(!controlApplyPresetBlock.includes("modelId: asString(preset.model_id)"), "Provider center preset must not overwrite custom/discovered model ID");
assert(controlApplyPresetBlock.includes("模型 ID 不用模板覆盖"), "Provider center preset copy should frame presets as endpoint templates");
assert(!controlCenterSource.includes("gpt-4o-mini / qwen2.5:14b"), "Provider center model ID placeholder should not pin stale examples");

for (const requiredDocText of [
  "API 优先原则",
  "模型配置",
  "Provider",
  "密钥",
  "模型中心",
  "模型中心同样可以直接粘贴新的 API key",
  "npm run verify:provider-config",
]) {
  assert(phase1Doc.includes(requiredDocText), `Phase 1 acceptance doc missing provider boundary text: ${requiredDocText}`);
}

console.log("provider-config-boundary ok");

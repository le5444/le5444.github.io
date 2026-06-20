import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

function projectPath(relativePath) {
  return join(root, relativePath);
}

function readProjectFile(relativePath) {
  return readFileSync(projectPath(relativePath), "utf8");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertNotIncludes(source, needle, label) {
  assert(!source.includes(needle), label);
}

function run(label, command, args) {
  console.log(`\n[phase5-desktop-readiness] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", cwd: root });
  if (result.error) {
    console.error(`[phase5-desktop-readiness] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[phase5-desktop-readiness] ${label} failed`);
    process.exit(result.status || 1);
  }
}

function excludedFromSecretScan(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  return [
    "node_modules",
    "dist",
    "dist-pwa",
    "desktop-build",
    "desktop-release",
    "bridge/runs",
    "bridge/approvals",
    "bridge/workers/worker-state.json",
    "bridge/kairos/daily",
    ".codex-runtime",
    ".git",
  ].some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function walkFiles(relativeDir = "", files = []) {
  if (excludedFromSecretScan(relativeDir)) return files;
  const absoluteDir = projectPath(relativeDir);
  if (!existsSync(absoluteDir)) return files;
  for (const entry of readdirSync(absoluteDir)) {
    const relative = relativeDir ? `${relativeDir}/${entry}` : entry;
    if (excludedFromSecretScan(relative)) continue;
    const absolute = join(absoluteDir, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      walkFiles(relative, files);
    } else if (stats.isFile()) {
      files.push(relative.replace(/\\/g, "/"));
    }
  }
  return files;
}

function assertNoRealApiKeys() {
  const allowedExtensions = new Set([
    ".cmd",
    ".html",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".py",
    ".spec",
    ".ts",
    ".tsx",
    ".txt",
  ]);
  const findings = [];
  const keyPattern = /\bsk-(?!test\b|local\b|mock\b|example\b|dummy\b|redacted\b|ant-\.\.\.|proj-\.\.\.)[A-Za-z0-9_-]{20,}\b/g;
  for (const file of walkFiles("")) {
    if (!allowedExtensions.has(extname(file))) continue;
    if (file === "package-lock.json") continue;
    const text = readProjectFile(file);
    for (const match of text.matchAll(keyPattern)) {
      findings.push(`${file}: ${match[0].slice(0, 10)}...[redacted]`);
    }
  }
  assert(findings.length === 0, `Real-looking API keys found:\n${findings.join("\n")}`);
}

const doc = readProjectFile("docs/phase5-desktop-readiness-acceptance-20260619.md");
const packageJson = JSON.parse(readProjectFile("package.json"));
const indexHtml = readProjectFile("index.html");
const readme = readProjectFile("README.md");
const viteConfig = readProjectFile("vite.config.ts");
const bridgeReadme = readProjectFile("bridge/README.md");
const desktopLauncher = readProjectFile("desktop/zhimeng_desktop_launcher.py");
const desktopSpec = readProjectFile("desktop/zhimeng_desktop_launcher.spec");
const providerSwitch = readProjectFile("desktop/zhimeng_provider_switch.py");
const packageCmd = readProjectFile("打包织梦PersonalOS桌面版.cmd");
const providerSwitchCmd = readProjectFile("启动织梦Provider配置工具.cmd");
const modals = readProjectFile("src/components/Modals.tsx");
const controlCenter = readProjectFile("src/components/AgentControlCenter.tsx");
const settings = readProjectFile("src/store/settings.ts");
const apiProviders = readProjectFile("src/store/api-providers.ts");
const providerImport = readProjectFile("src/utils/provider-config-import.ts");
const executorBridge = readProjectFile("src/utils/executor-bridge.ts");
const gateway = readProjectFile("bridge/zhimeng_bridge.py");

for (const phrase of [
  "核心链路是什么",
  "卡点怎么验证",
  "能不能优先用 API",
  "spec 里有没有成功标准",
  "不等同于宣布正式 EXE 产品完成",
  "织梦写作台 / Zhimeng Writing Agent",
  "provider_probe",
  "provider_config_status",
  "allow_remote_model",
  "npm run verify:phase5-desktop-readiness",
  "npm run verify:phase5",
]) {
  assert(doc.includes(phrase), `Phase 5 acceptance doc missing: ${phrase}`);
}

for (const script of [
  "build",
  "build:pwa",
  "typecheck",
  "verify:provider-config",
  "verify:provider-switch",
  "verify:phase4",
  "verify:phase5",
  "verify:phase2-agent-home",
  "verify:phase4-agent-runtime",
  "verify:phase5-desktop-readiness",
]) {
  assert(packageJson.scripts?.[script], `package script missing: ${script}`);
}

assert(indexHtml.includes("<title>织梦写作台 / Zhimeng Writing Agent</title>"), "index title must stay Zhimeng-first");
assert(readme.startsWith("# 织梦写作台 / Zhimeng Writing Agent"), "README title must stay Zhimeng-first");
assert(viteConfig.includes('name: "织梦写作台 / Zhimeng Writing Agent"'), "PWA manifest name must stay Zhimeng-first");
assert(viteConfig.includes('short_name: "织梦 Agent"'), "PWA manifest short name must stay Zhimeng-branded");
assert(bridgeReadme.startsWith("# 织梦写作台 Agent Gateway"), "Bridge README should not be LumenOS-first");
assertNotIncludes(bridgeReadme.slice(0, 500), "Zhimeng/织梦 is the built-in Writing Agent domain", "Bridge README must not say Zhimeng is only a built-in domain");
assert(desktopLauncher.includes("Windows desktop launcher for 织梦写作台 / Zhimeng Writing Agent"), "Desktop launcher should be Zhimeng-first");
assert(desktopLauncher.includes('"app": "织梦写作台 / Zhimeng Writing Agent"'), "Desktop launcher runtime summary should be Zhimeng-first");
assertNotIncludes(desktopLauncher, '"app": "LumenOS Personal Agent OS"', "Desktop launcher app summary must not be LumenOS-first");

for (const profile of ["safe", "workspace", "network", "full", "autonomy", "dev"]) {
  assert(desktopLauncher.includes(`"${profile}": {`), `Desktop permission profile missing: ${profile}`);
}
assert(desktopLauncher.includes('or "workspace"'), "Desktop launcher should default to workspace profile");
assert(desktopLauncher.includes('"execute_provider": True'), "Desktop launcher workspace-like profiles should include Provider execution gate");
assert(desktopLauncher.includes("run_doctor"), "Desktop launcher should expose doctor mode");
assert(desktopSpec.includes('(str(project_root / "dist"), "dist")'), "PyInstaller spec should package dist");
assert(desktopSpec.includes('(str(project_root / "bridge"), "bridge")'), "PyInstaller spec should package bridge");
assert(desktopSpec.includes('name="ZhimengPersonalOS"'), "PyInstaller EXE name should stay Zhimeng-branded");
assert(packageCmd.includes("call npm run build"), "Desktop package script should build frontend first");
assert(packageCmd.includes("PyInstaller"), "Desktop package script should use PyInstaller");
assert(packageCmd.includes("--doctor --profile %%P"), "Desktop package script should run packaged profile doctors");
assert(providerSwitch.includes("zhimeng.provider-settings.v1"), "Provider switch tool should write the shared desktop config schema");
assert(providerSwitch.includes("provider_catalog"), "Provider switch tool should reuse Gateway provider catalog");
assert(providerSwitch.includes("resolve_provider_config"), "Provider switch tool should reuse Gateway provider preset resolution");
assert(providerSwitch.includes("[present:redacted]"), "Provider switch tool should redact keys in normal output");
assert(providerSwitch.includes("apply"), "Provider switch tool should support apply command");
assert(providerSwitch.includes("export-env"), "Provider switch tool should support env export");
assert(providerSwitchCmd.includes("zhimeng_provider_switch.py status"), "Provider switch cmd should expose status");

assert(modals.includes("settings-modal-overlay"), "Settings modal should stay a lightweight overlay");
assert(modals.includes("settings-modal-panel"), "Settings modal should stay a lightweight panel");
assert(modals.includes("max-w-3xl"), "Settings modal should not become a full-width app shell");
assert(modals.includes('data-testid="settings-provider-presets"'), "Settings modal provider presets test id missing");
assert(modals.includes('data-testid="settings-model-discovery"'), "Settings modal model discovery test id missing");
assert(modals.includes('action: "provider_probe"'), "Settings model discovery should use provider_probe");
assert(modals.includes("record: false"), "Settings model discovery should default to non-recorded probes");
assert(modals.includes("allow_remote_model: modelDiscoveryNeedsRemoteAllow"), "Settings model discovery should pass explicit remote gate");
assert(modals.includes("keyPresent: Boolean(form.apiKey.trim())"), "Settings history should store only key presence");
assert(providerImport.includes('action: "provider_config_status"'), "Frontend should import desktop Provider config through Gateway");
assert(providerImport.includes("import_to_frontend: true"), "Frontend import should require explicit import flag");
assert(providerImport.includes("desktopConfigImportedAt"), "Frontend import should avoid replaying unchanged desktop config");

const historyTypeBlock = settings.slice(
  settings.indexOf("export interface ModelDiscoveryHistoryEntry"),
  settings.indexOf("const STORAGE_KEY"),
);
assert(historyTypeBlock.includes("keyPresent: boolean"), "Model discovery history must store key presence");
assert(!historyTypeBlock.includes("apiKey"), "Model discovery history must not store apiKey");
assert(!historyTypeBlock.includes("api_key"), "Model discovery history must not store api_key");
assert(settings.includes("desktopConfigImportedAt"), "ApiSettings should record desktop config import timestamp");

for (const preset of ["codex2api-codex", "ollama-qwen", "lmstudio-local", "vllm-local"]) {
  assert(apiProviders.includes(`id: "${preset}"`), `Provider preset missing: ${preset}`);
}
assert(apiProviders.includes("buildProviderRequest"), "Provider layer should expose shared request builder");
assert(apiProviders.includes("sendChatViaProvider"), "Provider layer should be the shared chat transport");
assert(controlCenter.includes('bridgeAction("provider_catalog", { limit: 80 })'), "Provider center should use Gateway provider_catalog");
assert(controlCenter.includes("redactedProviderPayload"), "Provider center should render redacted payloads");
assert(controlCenter.includes("不会保存、显示或从历史恢复 API key"), "Provider center should explain key history policy");
assert(executorBridge.includes("provider_config_status"), "Executor bridge should include provider_config_status");

for (const snippet of [
  "PROVIDER_SWITCH_SCHEMA",
  "def provider_config_status",
  '"provider_probe requires Gateway --execute-provider before any network probe"',
  '"provider_probe requires payload execute=true before any network probe"',
  '"remote provider probes require allow_remote_model=true"',
  '"request": redact_record_secrets(req)',
  '"result": redact_record_secrets(result)',
  "def is_sensitive_record_key",
  'parser.add_argument("--execute-provider"',
  'parser.add_argument("--execute-skill"',
  'parser.add_argument("--execute-scheduler"',
  'parser.add_argument("--execute-mcp"',
]) {
  assert(gateway.includes(snippet), `Gateway desktop/provider gate missing: ${snippet}`);
}

assertNoRealApiKeys();
run("Provider switch tool", process.execPath, ["scripts/verify-provider-switch-tool.mjs"]);
run("Provider config boundary", process.execPath, ["scripts/verify-provider-config-boundary.mjs"]);

console.log("\nphase5-desktop-readiness ok");

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

async function compilePasteModule() {
  const storeStubDir = join(tmpdir(), `zhimeng-provider-paste-store-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(storeStubDir, { recursive: true });
  writeFileSync(join(storeStubDir, "settings.js"), "export {};\n", "utf8");
  const source = readFileSync(new URL("../src/utils/provider-config-paste.ts", import.meta.url), "utf8")
    .replace(/from "\.\.\/store\/settings"/g, `from ${JSON.stringify(pathToFileURL(join(storeStubDir, "settings.js")).href)}`);
  const modulePath = join(tmpdir(), `zhimeng-provider-config-paste-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  writeFileSync(modulePath, compiled, "utf8");
  return import(pathToFileURL(modulePath).href);
}

const { parseProviderConfigPaste } = await compilePasteModule();

const nested = parseProviderConfigPaste(JSON.stringify({
  activeProvider: "codex2api",
  providers: {
    codex2api: {
      baseURL: "  https://www.codex2api.com/v1/  ",
      authToken: "  sk-nested-provider-key  ",
      defaultModel: "codex-real-from-account",
      provider: "openai-compatible",
      displayName: "Codex2API Account",
    },
  },
}));
assertEqual(nested.apiUrl, "https://www.codex2api.com/v1/", "nested apiUrl");
assertEqual(nested.apiKey, "sk-nested-provider-key", "nested apiKey");
assertEqual(nested.modelId, "codex-real-from-account", "nested modelId");
assertEqual(nested.modelName, "Codex2API Account", "nested modelName");
assertEqual(nested.provider, "openai-compatible", "nested provider");

const bearerText = parseProviderConfigPaste(`
  endpointUrl = http://127.0.0.1:1234/v1
  Authorization: Bearer sk-bearer-provider-key
  activeModel: local-chat-model
  apiType: OpenAI Compatible
`);
assertEqual(bearerText.apiUrl, "http://127.0.0.1:1234/v1", "bearer text apiUrl");
assertEqual(bearerText.apiKey, "sk-bearer-provider-key", "bearer text apiKey");
assertEqual(bearerText.modelId, "local-chat-model", "bearer text modelId");
assertEqual(bearerText.provider, "openai-compatible", "bearer text provider");

const gemini = parseProviderConfigPaste(JSON.stringify({
  modelProviders: [
    {
      server_url: "https://generativelanguage.googleapis.com/v1beta",
      access_token: "gemini-key",
      deploymentName: "gemini-from-account",
      kind: "google gemini",
    },
  ],
}));
assertEqual(gemini.apiUrl, "https://generativelanguage.googleapis.com/v1beta", "gemini apiUrl");
assertEqual(gemini.apiKey, "gemini-key", "gemini apiKey");
assertEqual(gemini.modelId, "gemini-from-account", "gemini modelId");
assertEqual(gemini.provider, "gemini", "gemini provider");

const empty = parseProviderConfigPaste("hello world");
assert(!empty.apiUrl && !empty.apiKey && !empty.modelId && !empty.modelName && !empty.provider, "empty text should not invent config");

console.log("provider-config-paste ok");

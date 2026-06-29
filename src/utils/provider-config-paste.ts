import type { ProviderId } from "../store/settings";

export interface ParsedProviderConfig {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  modelName: string;
  provider: ProviderId | "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function normalizeConfigKey(key: string) {
  return key.toLowerCase().replace(/[\s_.-]+/g, "");
}

function collectConfigRecords(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 6 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectConfigRecords(item, depth + 1));
  const record = asRecord(value);
  return [
    record,
    ...Object.values(record).flatMap((item) => collectConfigRecords(item, depth + 1)),
  ];
}

function findConfigValue(records: Record<string, unknown>[], aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeConfigKey));
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (!normalizedAliases.has(normalizeConfigKey(key))) continue;
      const text = asString(value).trim();
      if (text) return text;
    }
  }
  return "";
}

function extractConfigValueFromText(source: string, aliases: string[]) {
  const escapedAliases = aliases.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`["']?(${escapedAliases})["']?\\s*[:=]\\s*["']?([^"',\\n\\r}]+)`, "i");
  const match = source.match(pattern);
  return match?.[2]?.trim() || "";
}

function extractBearerToken(source: string) {
  const match = source.match(/\bBearer\s+([A-Za-z0-9._~+/=-]+)/i);
  return match?.[1]?.trim() || "";
}

function normalizeApiKey(raw: string) {
  return raw.trim().replace(/^Bearer\s+/i, "").trim();
}

function normalizeProviderIdFromText(rawProvider: string): ProviderId | "" {
  const value = rawProvider.trim().toLowerCase();
  if (!value) return "";
  if (value.includes("anthropic") || value.includes("claude")) return "anthropic";
  if (value.includes("gemini") || value.includes("google")) return "gemini";
  if (value.includes("ollama")) return "ollama";
  if (value.includes("openai") || value.includes("compatible") || value.includes("router") || value.includes("codex2api") || value.includes("oneapi") || value.includes("litellm")) return "openai-compatible";
  return "";
}

export function parseProviderConfigPaste(source: string): ParsedProviderConfig {
  const text = source.trim();
  const records: Record<string, unknown>[] = [];
  if (text) {
    for (const candidate of [text, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)]) {
      if (!candidate || !candidate.trim().startsWith("{")) continue;
      try {
        records.push(...collectConfigRecords(JSON.parse(candidate)));
        break;
      } catch {
        /* fall through to loose text parsing */
      }
    }
  }
  const get = (aliases: string[]) => (
    findConfigValue(records, aliases) || extractConfigValueFromText(text, aliases)
  ).trim();
  const apiUrl = get(["apiUrl", "api_url", "baseURL", "baseUrl", "base_url", "base-url", "endpoint", "endpointUrl", "endpoint_url", "serverUrl", "server_url", "url"]);
  const apiKey = normalizeApiKey(get(["apiKey", "api_key", "apikey", "api-key", "key", "token", "accessToken", "access_token", "authToken", "auth_token", "authorization"]) || extractBearerToken(text));
  const modelId = get(["modelId", "model_id", "model", "modelName", "model_name", "defaultModel", "default_model", "activeModel", "active_model", "deployment", "deploymentName", "deployment_name"]);
  const modelName = get(["displayName", "display_name", "modelLabel", "model_label", "name", "title", "label"]);
  const rawProvider = get(["provider", "providerId", "provider_id", "type", "apiType", "api_type", "kind"]);
  const provider = normalizeProviderIdFromText(rawProvider || apiUrl);
  return {
    apiUrl,
    apiKey,
    modelId,
    modelName,
    provider,
  };
}

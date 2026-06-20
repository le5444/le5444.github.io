import { type ApiProfile, type ApiSettings, inferProvider } from "../store/settings";

const GATEWAY_BRIDGE_URL = "http://127.0.0.1:8765/bridge";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function isRealKey(value: string) {
  return Boolean(value.trim()) && !/^\[present:redacted\]$/i.test(value.trim());
}

function toNumberOrUndefined(value: unknown) {
  if (value === "" || value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDesktopProfile(raw: Record<string, unknown>, current: ApiSettings): ApiProfile {
  const apiUrl = asString(raw.apiUrl || raw.api_url);
  const apiKey = asString(raw.apiKey || raw.api_key);
  const modelId = asString(raw.modelId || raw.model_id);
  const modelName = asString(raw.modelName || raw.model_name || raw.name || modelId);
  const provider = asString(raw.provider) || inferProvider(apiUrl);
  return {
    id: asString(raw.id || raw.profileId, `desktop-provider-${Date.now()}`),
    name: asString(raw.name, modelName || modelId || "Desktop Provider"),
    apiUrl,
    apiKey: isRealKey(apiKey) ? apiKey : current.apiKey,
    modelId,
    modelName,
    provider: provider as ApiSettings["provider"],
    temperature: toNumberOrUndefined(raw.temperature),
    maxTokens: toNumberOrUndefined(raw.maxTokens || raw.max_tokens),
  };
}

function mergeProfiles(current: ApiProfile[], incoming: ApiProfile[]) {
  const byId = new Map<string, ApiProfile>();
  for (const profile of current) byId.set(profile.id, profile);
  for (const profile of incoming) byId.set(profile.id, profile);
  return Array.from(byId.values()).slice(0, 60);
}

export async function importDesktopProviderConfig(current: ApiSettings): Promise<ApiSettings | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(GATEWAY_BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        action: "provider_config_status",
        purpose: "Import desktop Provider switch config",
        record: false,
        payload: {
          include_secret: true,
          import_to_frontend: true,
        },
      }),
    });
    if (!response.ok) return null;
    const body = asRecord(await response.json());
    const envelope = asRecord(body.result || body);
    const status = asRecord(envelope.provider_config_status);
    const settings = asRecord(status.settings);
    const config = asRecord(status.config);
    const updatedAt = asString(settings.desktopConfigImportedAt || config.updatedAt);
    if (!updatedAt || current.desktopConfigImportedAt === updatedAt) return null;
    const apiUrl = asString(settings.apiUrl);
    const modelId = asString(settings.modelId);
    if (!apiUrl || !modelId) return null;
    const rawProfiles = Array.isArray(settings.profiles) ? settings.profiles.map(asRecord) : [];
    const desktopProfiles = rawProfiles.map((profile) => normalizeDesktopProfile(profile, current));
    const activeProfileId = asString(settings.activeProfileId) || desktopProfiles[0]?.id || current.activeProfileId;
    const activeProfile = desktopProfiles.find((profile) => profile.id === activeProfileId) || desktopProfiles[0];
    const apiKey = asString(settings.apiKey);
    return {
      ...current,
      apiUrl,
      apiKey: isRealKey(apiKey) ? apiKey : (activeProfile?.apiKey || current.apiKey),
      modelId,
      modelName: asString(settings.modelName, activeProfile?.modelName || modelId),
      provider: (asString(settings.provider) || inferProvider(apiUrl)) as ApiSettings["provider"],
      temperature: toNumberOrUndefined(settings.temperature) ?? current.temperature,
      maxTokens: toNumberOrUndefined(settings.maxTokens) ?? current.maxTokens,
      profiles: mergeProfiles(current.profiles || [], desktopProfiles),
      activeProfileId,
      desktopConfigImportedAt: updatedAt,
      desktopConfigSource: "desktop-provider-switch",
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

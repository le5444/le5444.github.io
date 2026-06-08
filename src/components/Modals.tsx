import { useEffect, useState, useMemo } from "react";
import { CheckCircle2, Eye, EyeOff, ListChecks, Loader2, Pencil, RotateCcw, Search, Settings, Sparkles, Trash2, Upload, X, Zap } from "lucide-react";
import { type ApiSettings, PROVIDER_LABELS, PROVIDER_PRESETS, allowsEmptyApiKey, inferProvider, type ProviderId } from "../store/settings";
import { type BookProject } from "../store/library";
import { type PromptTemplate, type WorkspaceFile } from "../store/workspace";
import { type DistilledProfile } from "../store/distillation";
import { prompts } from "../data/prompts";
import { extractPromptParams, iconForCategory, normalizePromptTemplate, parseSkillMetadata, summarizeContent, wordCount, type ChatSession } from "../utils/helpers";
import { loadHistory, type VersionEntry } from "../store/history";
import { CopyButton } from "./shared";

const modalPanelClass = "w-full max-h-[90vh] min-h-0 rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden";

const providerGroupTabs = [
  { id: "all", label: "全部" },
  { id: "official", label: "官方" },
  { id: "china", label: "国内" },
  { id: "router", label: "聚合" },
  { id: "global", label: "海外" },
  { id: "local", label: "本地" },
] as const;

type ProviderGroupTab = (typeof providerGroupTabs)[number]["id"];
type ModelDiscoveryStatus = "idle" | "running" | "ok" | "approval_required" | "http_error" | "network_error" | "error";

interface ModelDiscoveryItem {
  id: string;
  displayName: string;
  ownedBy: string;
  type: string;
  created: number;
}

const GATEWAY_BRIDGE_URL = "http://127.0.0.1:8765/bridge";

const providerGroupLabel: Record<ProviderGroupTab, string> = providerGroupTabs.reduce(
  (acc, item) => ({ ...acc, [item.id]: item.label }),
  {} as Record<ProviderGroupTab, string>,
);

function formatPresetHost(apiUrl: string) {
  try {
    return new URL(apiUrl).host;
  } catch {
    return apiUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function isLocalEndpoint(apiUrl: string) {
  try {
    const host = new URL(apiUrl).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host);
  } catch {
    return false;
  }
}

function modelKeyEnv(provider: ProviderId) {
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "gemini") return "GEMINI_API_KEY";
  if (provider === "ollama") return "";
  return "ZHIMENG_MODEL_API_KEY";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function providerModelsFromGatewayResult(result: unknown): ModelDiscoveryItem[] {
  const data = asRecord(result);
  const probe = asRecord(data.provider_probe || data);
  const json = asRecord(probe.json);
  const rawItems = asRecordList(json.data).length ? asRecordList(json.data) : asRecordList(json.models);
  return rawItems
    .map((item, index) => {
      const id = asString(item.id, asString(item.name, asString(item.model, `model-${index + 1}`))).trim();
      const displayName = asString(item.display_name, asString(item.name, id)).trim();
      return {
        id,
        displayName: displayName || id,
        ownedBy: asString(item.owned_by, asString(item.owner, asString(item.provider, "provider"))),
        type: asString(item.type, asString(item.object, "model")),
        created: asNumber(item.created),
      };
    })
    .filter((item) => item.id);
}

// Settings Modal
export function SettingsModal({ open, settings, onClose, onSave }: { open: boolean; settings: ApiSettings; onClose: () => void; onSave: (next: ApiSettings) => void; }) {
  const [form, setForm] = useState<ApiSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [presetSearch, setPresetSearch] = useState("");
  const [presetGroup, setPresetGroup] = useState<ProviderGroupTab>("all");
  const [modelDiscoveryStatus, setModelDiscoveryStatus] = useState<ModelDiscoveryStatus>("idle");
  const [modelDiscoveryMessage, setModelDiscoveryMessage] = useState("");
  const [modelDiscoveryItems, setModelDiscoveryItems] = useState<ModelDiscoveryItem[]>([]);
  useEffect(() => { if (open) setForm(settings); }, [open, settings]);
  useEffect(() => { if (open) { setPresetSearch(""); setPresetGroup("all"); } }, [open]);
  useEffect(() => {
    if (!open) return;
    setModelDiscoveryStatus("idle");
    setModelDiscoveryMessage("");
    setModelDiscoveryItems([]);
  }, [open, form.apiKey, form.apiUrl, form.provider]);
  const filteredPresets = useMemo(() => {
    const q = presetSearch.trim().toLowerCase();
    return PROVIDER_PRESETS.filter((preset) => {
      const group = preset.group || "global";
      if (presetGroup !== "all" && group !== presetGroup) return false;
      if (!q) return true;
      return [
        preset.label,
        preset.modelName,
        preset.modelId,
        preset.apiUrl,
        preset.notes || "",
        PROVIDER_LABELS[preset.provider],
        providerGroupLabel[group],
      ].join(" ").toLowerCase().includes(q);
    });
  }, [presetGroup, presetSearch]);
  const activePresetId = useMemo(() => {
    return PROVIDER_PRESETS.find((preset) => (
      preset.provider === (form.provider || inferProvider(form.apiUrl))
      && preset.apiUrl === form.apiUrl
      && preset.modelId === form.modelId
    ))?.id;
  }, [form.apiUrl, form.modelId, form.provider]);
  if (!open) return null;
  const effectiveProvider: ProviderId = form.provider || inferProvider(form.apiUrl);
  const keyOptional = allowsEmptyApiKey(form.apiUrl, effectiveProvider);
  const setField = <K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const applyPreset = (presetId: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      apiUrl: preset.apiUrl,
      modelId: preset.modelId,
      modelName: preset.modelName,
      provider: preset.provider,
    }));
  };
  const profiles = form.profiles || [];
  const modelDiscoveryNeedsRemoteAllow = !isLocalEndpoint(form.apiUrl);
  const canDiscoverModels = Boolean(form.apiUrl.trim()) && (keyOptional || Boolean(form.apiKey.trim())) && modelDiscoveryStatus !== "running";
  const saveCurrentProfile = () => {
    if (!form.apiUrl.trim() || !form.modelId.trim()) {
      window.alert("请先填写端点 URL 和模型 ID。");
      return;
    }
    const id = form.activeProfileId || `api-profile-${Date.now()}`;
    const name = (form.modelName || form.modelId || formatPresetHost(form.apiUrl)).trim();
    const snapshot = {
      id,
      name,
      apiUrl: form.apiUrl,
      apiKey: form.apiKey,
      modelId: form.modelId,
      modelName: form.modelName || name,
      provider: effectiveProvider,
      temperature: form.temperature,
      maxTokens: form.maxTokens,
    };
    setForm((prev) => {
      const existing = prev.profiles || [];
      const next = existing.some((profile) => profile.id === id)
        ? existing.map((profile) => profile.id === id ? snapshot : profile)
        : [snapshot, ...existing].slice(0, 60);
      return { ...prev, profiles: next, activeProfileId: id };
    });
  };
  const loadProfile = (profileId: string) => {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    setForm((prev) => ({
      ...prev,
      apiUrl: profile.apiUrl,
      apiKey: profile.apiKey,
      modelId: profile.modelId,
      modelName: profile.modelName,
      provider: profile.provider || inferProvider(profile.apiUrl),
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
      activeProfileId: profile.id,
    }));
  };
  const deleteProfile = (profileId: string) => {
    setForm((prev) => ({
      ...prev,
      profiles: (prev.profiles || []).filter((profile) => profile.id !== profileId),
      activeProfileId: prev.activeProfileId === profileId ? undefined : prev.activeProfileId,
    }));
  };
  const useDiscoveredModel = (model: ModelDiscoveryItem, saveProfile = false) => {
    const modelName = model.displayName || model.id;
    const nextProfileId = saveProfile ? (form.activeProfileId || `api-profile-${Date.now()}`) : form.activeProfileId;
    setForm((prev) => {
      const base = {
        ...prev,
        modelId: model.id,
        modelName,
        provider: effectiveProvider,
        activeProfileId: nextProfileId,
      };
      if (!saveProfile) return base;
      const snapshot = {
        id: nextProfileId || `api-profile-${Date.now()}`,
        name: `${modelName} · ${formatPresetHost(prev.apiUrl)}`,
        apiUrl: prev.apiUrl,
        apiKey: prev.apiKey,
        modelId: model.id,
        modelName,
        provider: effectiveProvider,
        temperature: prev.temperature,
        maxTokens: prev.maxTokens,
      };
      const existing = prev.profiles || [];
      const nextProfiles = existing.some((profile) => profile.id === snapshot.id)
        ? existing.map((profile) => profile.id === snapshot.id ? snapshot : profile)
        : [snapshot, ...existing].slice(0, 60);
      return { ...base, profiles: nextProfiles, activeProfileId: snapshot.id };
    });
    setModelDiscoveryMessage(saveProfile ? `已选择并保存 ${model.id}，点击“保存设置”后生效。` : `已填入模型 ID：${model.id}`);
  };
  const discoverModels = async () => {
    if (!form.apiUrl.trim()) {
      setModelDiscoveryStatus("error");
      setModelDiscoveryMessage("请先填写 base URL。");
      return;
    }
    if (!keyOptional && !form.apiKey.trim()) {
      setModelDiscoveryStatus("error");
      setModelDiscoveryMessage("这个端点需要 API key，填入后再获取模型列表。");
      return;
    }
    setModelDiscoveryStatus("running");
    setModelDiscoveryMessage("正在通过 Gateway 读取 /models；不会调用模型生成。");
    setModelDiscoveryItems([]);
    try {
      const res = await fetch(GATEWAY_BRIDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "provider_probe",
          purpose: "Settings modal model discovery",
          record: false,
          payload: {
            provider: effectiveProvider,
            api_url: form.apiUrl,
            model_id: form.modelId,
            model_name: form.modelName,
            api_key: form.apiKey,
            api_key_env: modelKeyEnv(effectiveProvider),
            execute: true,
            allow_remote_model: modelDiscoveryNeedsRemoteAllow,
            timeout_seconds: 12,
          },
        }),
      });
      const result = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error(asString(result.error, `${res.status} ${res.statusText}`));
      const probe = asRecord(asRecord(result.result).provider_probe || result.provider_probe);
      const status = asString(probe.status, asString(result.status, "error")) as ModelDiscoveryStatus;
      const models = providerModelsFromGatewayResult(probe);
      setModelDiscoveryStatus(status);
      setModelDiscoveryItems(models);
      if (status === "ok") {
        setModelDiscoveryMessage(models.length ? `已获取 ${models.length} 个模型；选择一个填入当前配置。` : "请求成功，但没有解析到模型列表。");
      } else if (status === "approval_required") {
        setModelDiscoveryMessage(asString(probe.reason, "Gateway 未开启 --execute-provider，或远程探针未授权。"));
      } else {
        setModelDiscoveryMessage(asString(probe.reason, asString(probe.text, "模型列表获取失败。")).slice(0, 260));
      }
    } catch (error) {
      setModelDiscoveryStatus("error");
      setModelDiscoveryMessage(error instanceof Error ? error.message : "模型列表获取失败。");
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4">
      <div className={`${modalPanelClass} max-w-5xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600"><Settings className="h-7 w-7 text-white" /></div>
            <div>
              <h2 className="text-2xl font-bold text-white">AI 模型设置</h2>
              <p className="text-sm text-slate-500">支持几十种 OpenAI 兼容平台、Claude、Gemini、Ollama、本地模型与自部署端点。</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 px-6 py-6 overflow-y-auto">
          {/* 快速预设 */}
          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-purple-200"><Zap className="h-4 w-4" /> API 预设库</div>
                <p className="mt-1 text-xs text-slate-500">点选后自动填端点和模型 ID，密钥仍由你自己填写；所有字段都可以再手动改。</p>
              </div>
              <div className="relative w-full lg:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={presetSearch}
                  onChange={(e) => setPresetSearch(e.target.value)}
                  placeholder="搜索 DeepSeek / Claude / 本地..."
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:border-purple-500"
                />
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {providerGroupTabs.map((tab) => {
                const count = tab.id === "all"
                  ? PROVIDER_PRESETS.length
                  : PROVIDER_PRESETS.filter((preset) => (preset.group || "global") === tab.id).length;
                const active = presetGroup === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setPresetGroup(tab.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${active ? "border-purple-400 bg-purple-500/20 text-purple-100" : "border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-600 hover:text-slate-200"}`}
                  >
                    {tab.label} {count}
                  </button>
                );
              })}
            </div>
            <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPresets.map((preset) => {
                const active = activePresetId === preset.id;
                const group = preset.group || "global";
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    title={preset.notes || ""}
                    className={`min-h-24 rounded-2xl border p-3 text-left transition-colors ${active ? "border-purple-400 bg-purple-500/20" : "border-slate-800 bg-slate-950/45 hover:border-purple-500/50 hover:bg-purple-500/10"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{preset.label}</div>
                        <div className="mt-1 truncate text-xs text-slate-400">{preset.modelId}</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{providerGroupLabel[group]}</span>
                    </div>
                    <div className="mt-2 truncate text-[11px] text-slate-500">{formatPresetHost(preset.apiUrl)}</div>
                    {preset.notes && <div className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-purple-200/70">{preset.notes}</div>}
                  </button>
                );
              })}
              {filteredPresets.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
                  没有匹配的预设。可以直接在下面填写任意 OpenAI 兼容 / 本地端点。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-blue-200">常用模型配置</div>
                <p className="mt-1 text-xs text-slate-500">可以保存多个 API、模型和密钥，本地一键切换。</p>
              </div>
              <button
                onClick={saveCurrentProfile}
                className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-200 hover:bg-blue-500/20"
              >
                {form.activeProfileId ? "更新当前配置" : "保存为常用配置"}
              </button>
            </div>
            {profiles.length > 0 ? (
              <div className="grid max-h-44 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {profiles.map((profile) => {
                  const active = form.activeProfileId === profile.id;
                  return (
                    <button
                      key={profile.id}
                      onClick={() => loadProfile(profile.id)}
                      className={`group min-w-0 rounded-2xl border p-3 text-left transition-colors ${active ? "border-blue-400 bg-blue-500/20" : "border-slate-800 bg-slate-950/45 hover:border-blue-500/40 hover:bg-blue-500/10"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white">{profile.name}</div>
                          <div className="mt-1 truncate text-xs text-slate-400">{profile.modelId}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{PROVIDER_LABELS[profile.provider || inferProvider(profile.apiUrl)]}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="truncate text-[11px] text-slate-500">{formatPresetHost(profile.apiUrl)}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); deleteProfile(profile.id); } }}
                          className="rounded-lg px-2 py-1 text-[11px] text-slate-500 opacity-80 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                        >
                          删除
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-5 text-center text-sm text-slate-500">还没有保存常用配置。先点预设或手动填写，再保存。</div>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-300">Provider 类型</label>
              <select
                value={effectiveProvider}
                onChange={(e) => setField("provider", e.target.value as ProviderId)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500"
              >
                {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((id) => (
                  <option key={id} value={id}>{PROVIDER_LABELS[id]}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">不同 Provider 的 wire format 不同：Anthropic 用 x-api-key + Messages API；Gemini 用 query key + generateContent；Ollama 走 /api/chat 或 /v1。</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">显示名称</label>
              <input value={form.modelName} onChange={(e) => setField("modelName", e.target.value)} placeholder="例：DeepSeek Chat" className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">模型 ID *</label>
              <input value={form.modelId} onChange={(e) => setField("modelId", e.target.value)} placeholder={effectiveProvider === "anthropic" ? "claude-sonnet-4-6" : effectiveProvider === "gemini" ? "gemini-2.0-flash" : "deepseek-chat / gpt-4o / qwen2.5:14b"} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-300">端点 URL *</label>
              <input value={form.apiUrl} onChange={(e) => setField("apiUrl", e.target.value)} placeholder={effectiveProvider === "anthropic" ? "https://api.anthropic.com/v1" : effectiveProvider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : effectiveProvider === "ollama" ? "http://localhost:11434" : "https://api.deepseek.com/v1"} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
              <p className="mt-1 text-xs text-slate-500">OpenAI 兼容只需填到 /v1；其它 provider 也只填 base URL，路径会自动补全。</p>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-300">API 密钥 {!keyOptional && "*"}{keyOptional && <span className="ml-2 text-xs text-slate-500">(本地端点可留空)</span>}</label>
              <div className="relative">
                <input type={showKey ? "text" : "password"} value={form.apiKey} onChange={(e) => setField("apiKey", e.target.value)} placeholder={effectiveProvider === "anthropic" ? "sk-ant-..." : "sk-..."} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 pr-12 text-sm text-white outline-none focus:border-purple-500" />
                <button onClick={() => setShowKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </div>
            <div className="md:col-span-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-cyan-200"><ListChecks className="h-4 w-4" /> 模型发现</div>
                  <p className="mt-1 text-xs text-slate-500">按当前 base URL 和 API key 读取 `/models`，只获取模型名称，不调用模型生成。</p>
                </div>
                <button
                  type="button"
                  onClick={discoverModels}
                  disabled={!canDiscoverModels}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {modelDiscoveryStatus === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
                  获取模型列表
                </button>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <span className="text-slate-500">端点</span>
                  <div className="mt-1 truncate text-slate-200">{form.apiUrl ? formatPresetHost(form.apiUrl) : "未填写"}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <span className="text-slate-500">API key</span>
                  <div className={form.apiKey || keyOptional ? "mt-1 text-emerald-300" : "mt-1 text-amber-300"}>{form.apiKey ? "已填写" : keyOptional ? "可留空" : "必填"}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <span className="text-slate-500">远程授权</span>
                  <div className={modelDiscoveryNeedsRemoteAllow ? "mt-1 text-blue-300" : "mt-1 text-emerald-300"}>{modelDiscoveryNeedsRemoteAllow ? "请求内显式允许" : "本地端点"}</div>
                </div>
              </div>
              {modelDiscoveryMessage && (
                <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                  modelDiscoveryStatus === "ok"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                    : modelDiscoveryStatus === "approval_required"
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
                      : modelDiscoveryStatus === "running"
                        ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-200"
                        : "border-red-500/20 bg-red-500/10 text-red-200"
                }`}>
                  {modelDiscoveryMessage}
                </div>
              )}
              {modelDiscoveryItems.length > 0 && (
                <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                  {modelDiscoveryItems.slice(0, 60).map((model) => {
                    const active = form.modelId === model.id;
                    return (
                      <div key={model.id} className={`rounded-2xl border p-3 ${active ? "border-cyan-400 bg-cyan-500/15" : "border-slate-800 bg-slate-950/45"}`}>
                        <button type="button" onClick={() => useDiscoveredModel(model)} className="block w-full min-w-0 text-left">
                          <div className="truncate text-sm font-medium text-white">{model.displayName || model.id}</div>
                          <div className="mt-1 truncate font-mono text-[11px] text-cyan-300">{model.id}</div>
                        </button>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="truncate">{model.ownedBy} · {model.type}</span>
                          {active && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => useDiscoveredModel(model)} className="rounded-xl border border-slate-700 px-2.5 py-1.5 text-[11px] text-cyan-100 hover:border-cyan-500/40 hover:bg-cyan-500/10">
                            填入
                          </button>
                          <button type="button" onClick={() => useDiscoveredModel(model, true)} className="rounded-xl border border-slate-700 px-2.5 py-1.5 text-[11px] text-emerald-100 hover:border-emerald-500/40 hover:bg-emerald-500/10">
                            保存档案
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Temperature</label>
              <input type="number" step="0.05" min="0" max="2" value={form.temperature ?? 0.85} onChange={(e) => setField("temperature", Number(e.target.value))} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
              <p className="mt-1 text-xs text-slate-500">建议 0.75-0.9。太低板，太高乱。</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Max Tokens</label>
              <input type="number" step="256" min="0" value={form.maxTokens ?? ""} onChange={(e) => setField("maxTokens", e.target.value ? Number(e.target.value) : (undefined as unknown as number))} placeholder="留空使用 provider 默认" className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
              <p className="mt-1 text-xs text-slate-500">写长章节建议 4096-8192。Anthropic 默认 8192。</p>
            </div>
          </div>

          {/* 反崩盘默认开关 */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-200"><Sparkles className="h-4 w-4" /> 反崩盘默认行为</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input type="checkbox" checked={!!form.antiCollapseDefault} onChange={(e) => setField("antiCollapseDefault", e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                默认启用反崩盘（约束卡 + 5 维 AI 腔扫描 + 一致性检查）
              </label>
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input type="checkbox" checked={!!form.voiceLockDefault} onChange={(e) => setField("voiceLockDefault", e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                默认启用声音指纹锁定（防角色对白同质化）
              </label>
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input type="checkbox" checked={!!form.chroniclerAuto} onChange={(e) => setField("chroniclerAuto", e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                每章生成后自动跑事实编年（chronicler）
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-5 shrink-0">
          <button onClick={() => setForm((prev) => ({ apiUrl: "", apiKey: "", modelId: "", modelName: "", provider: undefined, temperature: 0.85, maxTokens: undefined, profiles: prev.profiles || [], activeProfileId: undefined, antiCollapseDefault: true, voiceLockDefault: true, chroniclerAuto: false }))} className="text-sm text-red-400">重置当前配置</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded-2xl px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800">取消</button>
            <button onClick={() => { onSave({ ...form, provider: effectiveProvider }); onClose(); }} className="rounded-2xl bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-500">保存设置</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Book Modal
export function BookModal({ open, initial, onClose, onSubmit }: { open: boolean; initial?: Partial<BookProject> | null; onClose: () => void; onSubmit: (payload: { title: string; description: string; type: string; cover: string }) => void; }) {
  const [form, setForm] = useState({ title: initial?.title || "", description: initial?.description || "", type: initial?.type || "Writing Agent", cover: initial?.cover || "◇" });
  useEffect(() => { if (open) setForm({ title: initial?.title || "", description: initial?.description || "", type: initial?.type || "Writing Agent", cover: initial?.cover || "◇" }); }, [open, initial]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className={`${modalPanelClass} max-w-xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0"><div><h2 className="text-2xl font-bold text-white">{initial ? "编辑 Workspace" : "新建 Workspace"}</h2><p className="mt-1 text-sm text-slate-500">Workspace 可以是写作、编码、研究、知识库或自动化域。</p></div><button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button></div>
        <div className="space-y-4 overflow-y-auto px-6 py-6"><div className="grid gap-4 md:grid-cols-[120px_1fr]"><div><label className="mb-1 block text-sm font-medium text-slate-300">图标</label><input value={form.cover} onChange={(e) => setForm((prev) => ({ ...prev, cover: e.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-center text-2xl text-white outline-none" /></div><div className="space-y-4"><div><label className="mb-1 block text-sm font-medium text-slate-300">Workspace 名称</label><input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="例如 Personal Workspace" className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none" /></div><div><label className="mb-1 block text-sm font-medium text-slate-300">Domain Agent</label><input value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} placeholder="Writing Agent / Coding Agent / Research Agent" className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none" /></div></div></div><div><label className="mb-1 block text-sm font-medium text-slate-300">上下文说明</label><textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="这个 Workspace 的目标、边界、常用工具或长期上下文..." className="h-28 w-full resize-none rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none" /></div></div>
        <div className="flex justify-end gap-3 border-t border-slate-800 px-6 py-5 shrink-0"><button onClick={onClose} className="rounded-2xl px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800 transition-colors">取消</button><button onClick={() => onSubmit(form)} className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">保存 Workspace</button></div>
      </div>
    </div>
  );
}

// Prompt Picker Modal
export function PromptPickerModal({ open, selectedIds, customPrompts, distillations, onClose, onConfirm, onCreateCustomPrompt, onCreateAiPrompt, onEditPrompt, onDeletePrompt, onResetDefaults, hasOverrides }: { open: boolean; selectedIds: string[]; customPrompts: PromptTemplate[]; distillations: DistilledProfile[]; onClose: () => void; onConfirm: (ids: string[]) => void; onCreateCustomPrompt: () => void; onCreateAiPrompt: () => void; onEditPrompt: (p: PromptTemplate) => void; onDeletePrompt: (id: string) => void; onResetDefaults: () => void; hasOverrides: boolean; }) {
  const [search, setSearch] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  useEffect(() => { if (open) setDraftIds(selectedIds); }, [open, selectedIds]);
  const distillationMap = useMemo(() => new Map(distillations.map((item) => [item.id, item])), [distillations]);
  const builtInMap = useMemo(() => new Map(prompts.map((p) => [p.id, normalizePromptTemplate({ id: p.id, title: p.title, category: p.category, content: p.content, description: p.content.slice(0, 50).replace(/\n/g, " "), builtIn: true })])), []);
  const allTemplates: PromptTemplate[] = useMemo(() => {
    const map = new Map(builtInMap);
    for (const cp of customPrompts) { if (map.has(cp.id)) map.set(cp.id, normalizePromptTemplate({ ...cp, builtIn: false })); }
    const pureCustom = customPrompts.filter((cp) => !map.has(cp.id) || (cp.builtIn === false && !prompts.some((p) => p.id === cp.id)));
    return [...pureCustom.map((item) => normalizePromptTemplate(item)), ...Array.from(map.values())];
  }, [customPrompts, builtInMap]);
  const filtered = allTemplates.filter((p) => {
    const q = search.trim().toLowerCase();
    const meta = parseSkillMetadata(p.content || "");
    const linkedTitles = (p.linkedDistillationIds || []).map((id) => distillationMap.get(id)?.title || "").join(" ");
    return q === "" || [p.title, p.category, p.content, p.primarySkill || meta.primarySkill, (p.skillTags || meta.skillTags).join(" "), linkedTitles].join(" ").toLowerCase().includes(q);
  });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4">
      <div className={`${modalPanelClass} max-w-6xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0"><div><h2 className="text-2xl font-bold text-white">选择 Skill</h2><p className="mt-1 text-sm text-slate-500">确认后，所选 Skill 会作为本轮 AI 的执行技能；关联蒸馏会自动进入上下文。</p></div><div className="flex items-center gap-2"><span className="rounded-xl bg-purple-500/10 px-3 py-2 text-xs text-purple-300">已选 {draftIds.length}</span>{hasOverrides && <button onClick={() => { if (window.confirm("确定还原？")) onResetDefaults(); }} className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/20"><RotateCcw className="h-3.5 w-3.5" /> 还原默认</button>}<button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"><X className="h-5 w-5" /></button></div></div>
        <div className="border-b border-slate-800 px-6 py-4 flex gap-3 shrink-0"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索 Skill..." className="w-full rounded-2xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-purple-500 transition-colors" /></div><button onClick={onCreateAiPrompt} className="rounded-2xl border border-purple-500/30 bg-purple-600/10 px-4 py-3 text-sm text-purple-300">🤖 AI生成 Skill</button><button onClick={onCreateCustomPrompt} className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-300">+ 新建 Skill</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">{filtered.map((template) => { const checked = draftIds.includes(template.id); const params = extractPromptParams(template.content); const meta = parseSkillMetadata(template.content || ""); const skillTags = template.skillTags?.length ? template.skillTags : meta.skillTags; const validationLayers = template.validationLayers?.length ? template.validationLayers : meta.validationLayers; const linkedCount = (template.linkedDistillationIds || []).length; const isOverride = template.builtIn === false && prompts.some((p) => p.id === template.id); const toggle = () => setDraftIds((prev) => prev.includes(template.id) ? prev.filter((id) => id !== template.id) : [...prev, template.id]); return ( <div key={template.id} onClick={toggle} className={`cursor-pointer rounded-2xl border p-5 transition-colors ${checked ? "border-purple-500/60 bg-purple-500/10" : "border-slate-800 bg-slate-950/40 hover:border-slate-700"}`}> <div className="flex items-start gap-4"> <input type="checkbox" checked={checked} onChange={(e) => { e.stopPropagation(); toggle(); }} onClick={(e) => e.stopPropagation()} className="mt-1 h-5 w-5 accent-purple-500" /> <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-white">{template.title}</h3>{checked && <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs text-white">已选</span>}<span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-300">{params.length}个参数</span><span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-500">{template.category}</span>{template.autoSkillClusterKey && <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-xs text-fuchsia-300">蒸馏积累</span>}{skillTags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-300">{tag}</span>)}{validationLayers.length > 0 && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">验证 {validationLayers.length}</span>}{linkedCount > 0 && <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-xs text-fuchsia-300">关联 {linkedCount}</span>}{isOverride && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">已修改</span>}</div><p className="mb-3 text-sm text-slate-400">{template.description}</p><pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-500">{template.content}</pre></div> <div className="flex flex-col gap-2 shrink-0"><button onClick={(e) => { e.stopPropagation(); onEditPrompt(template); }} className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"><Pencil className="h-3 w-3" /> 编辑</button>{!template.builtIn && <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`确定删除「${template.title}」？`)) onDeletePrompt(template.id); }} className="flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/20 transition-colors"><Trash2 className="h-3 w-3" /> 删除</button>}</div> </div> </div> ); })}</div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-6 py-5 shrink-0"><button onClick={() => setDraftIds([])} className="rounded-2xl px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800">清空选择</button><div className="flex gap-3"><button onClick={onClose} className="rounded-2xl px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800">取消</button><button onClick={() => { onConfirm(draftIds); onClose(); }} className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">确认选择 {draftIds.length}</button></div></div>
      </div>
    </div>
  );
}

// Edit Prompt Modal
export function EditPromptModal({ open, prompt, onClose, onSave }: { open: boolean; prompt: PromptTemplate | null; onClose: () => void; onSave: (updated: PromptTemplate) => void; }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  useEffect(() => { if (prompt) { setTitle(prompt.title); setCategory(prompt.category); setDescription(prompt.description || ""); setContent(prompt.content); } }, [prompt]);
  if (!open || !prompt) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className={`${modalPanelClass} max-w-3xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0"><div><h2 className="text-2xl font-bold text-white">编辑 Skill</h2></div><button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"><X className="h-5 w-5" /></button></div>
        <div className="space-y-4 px-6 py-6 overflow-y-auto"><div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium text-slate-300">标题</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500 transition-colors" /></div><div><label className="mb-1 block text-sm font-medium text-slate-300">分类</label><input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500 transition-colors" /></div></div><div><label className="mb-1 block text-sm font-medium text-slate-300">描述</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500 transition-colors" /></div><div><label className="mb-1 block text-sm font-medium text-slate-300">Skill 内容</label><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={12} className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500 transition-colors" /></div></div>
        <div className="flex justify-end gap-3 border-t border-slate-800 px-6 py-5 shrink-0"><button onClick={onClose} className="rounded-2xl px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800">取消</button><button onClick={() => { onSave({ ...prompt, title: title.trim(), category: category.trim() || "自定义 Skill", description: description.trim(), content: content.trim() }); }} className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">保存修改</button></div>
      </div>
    </div>
  );
}

// Chat History Modal
export function ChatHistoryModal({ open, sessions, onClose, onRestore, onDelete }: { open: boolean; sessions: ChatSession[]; onClose: () => void; onRestore: (s: ChatSession) => void; onDelete: (id: string) => void; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4">
      <div className={`${modalPanelClass} max-w-3xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0"><div><h2 className="text-2xl font-bold text-white">历史对话</h2></div><button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"><X className="h-5 w-5" /></button></div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">{sessions.length === 0 ? <p className="text-center text-slate-500 py-12">暂无历史记录</p> : sessions.map((s) => ( <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3"> <button onClick={() => onRestore(s)} className="min-w-0 flex-1 text-left truncate text-sm font-medium text-white hover:text-purple-400 transition-colors">{s.title}</button> <button onClick={() => onDelete(s.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300 transition-colors"><Trash2 className="h-4 w-4" /></button> </div> ))}</div>
      </div>
    </div>
  );
}

// Version History Modal
export function VersionHistoryModal({ open, file, onClose, onRestore }: { open: boolean; file: WorkspaceFile | null; onClose: () => void; onRestore: (v: VersionEntry) => void; }) {
  const [history, setHistory] = useState<VersionEntry[]>([]);
  useEffect(() => { if (open && file) {
    setHistory(loadHistory(file.id));
  } }, [open, file]);
  if (!open || !file) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
      <div className={`${modalPanelClass} max-w-4xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0"><div><h2 className="text-2xl font-bold text-white">「{file.title}」版本历史</h2><p className="mt-1 text-sm text-slate-500">点击列表项恢复内容。</p></div><button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"><X className="h-5 w-5" /></button></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">{history.length === 0 ? <p className="text-center text-slate-500 py-12">该章节暂无版本历史</p> : history.map((h, i) => ( <button key={i} onClick={() => onRestore(h)} className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left hover:border-purple-500/50 transition-all"> <div className="text-xs font-medium text-white">{new Date(h.createdAt).toLocaleString()}</div> <div className="mt-1 text-[10px] text-slate-500">{h.wordCount || 0} 字符</div> </button> ))}</div>
      </div>
    </div>
  );
}

// Highlight Config Modal
export function HighlightConfigModal({ open, aiWords, onClose, onSave }: { open: boolean; aiWords: string; onClose: () => void; onSave: (words: string) => void; }) {
  const [val, setVal] = useState(aiWords);
  useEffect(() => { if (open) setVal(aiWords); }, [open, aiWords]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
      <div className={`${modalPanelClass} max-w-xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0"><h2 className="text-xl font-bold text-white">配置 AI 高频词库</h2><button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"><X className="h-5 w-5" /></button></div>
        <div className="p-6 space-y-4 overflow-y-auto"><textarea value={val} onChange={(e) => setVal(e.target.value)} rows={10} className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-4 text-sm text-white outline-none focus:border-purple-500 transition-colors" placeholder="仿佛,缓缓,不禁..." /></div>
        <div className="flex justify-end gap-3 border-t border-slate-800 px-6 py-5 shrink-0"><button onClick={onClose} className="text-sm text-slate-400 px-4 py-2 hover:bg-slate-800 rounded-xl transition-colors">取消</button><button onClick={() => { onSave(val); onClose(); }} className="rounded-2xl bg-purple-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-purple-500 shadow-lg shadow-purple-900/20 transition-all">保存词库</button></div>
      </div>
    </div>
  );
}

// File Associate Modal
export function FileAssociateModal({ open, files, categories, selectedFileIds, onClose, onConfirm, onImportFiles }: { open: boolean; files: WorkspaceFile[]; categories: string[]; selectedFileIds: string[]; onClose: () => void; onConfirm: (ids: string[]) => void; onImportFiles: (files: File[]) => void; }) {
  const [search, setSearch] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>(selectedFileIds);
  useEffect(() => { if (open) setDraftIds(selectedFileIds); }, [open, selectedFileIds]);
  const filteredFiles = files.filter((f) => { const q = search.trim().toLowerCase(); return q === "" || f.title.toLowerCase().includes(q) || f.content.toLowerCase().includes(q); });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4">
      <div className={`${modalPanelClass} max-w-5xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0"><div><h2 className="text-2xl font-bold text-white">关联内容</h2></div><button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"><X className="h-5 w-5" /></button></div>
        <div className="border-b border-slate-800 px-6 py-4 flex gap-3 shrink-0"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索文件..." className="w-full rounded-2xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-purple-500 transition-colors" /></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition-colors"><Upload className="h-4 w-4" /> 添加文件<input type="file" multiple accept=".txt,.md" className="hidden" onChange={(e) => { const list = Array.from(e.target.files || []); if (list.length) onImportFiles(list); e.currentTarget.value = ""; }} /></label></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">{categories.map((category) => { const group = filteredFiles.filter((f) => f.category === category); if (!group.length) return null; return ( <div key={category} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"> <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300"><span>{iconForCategory(category)}</span>{category}<span className="text-xs text-slate-500">{group.length}</span></div> <div className="space-y-2">{group.map((file) => { const checked = draftIds.includes(file.id); const toggle = () => setDraftIds((prev) => prev.includes(file.id) ? prev.filter((id) => id !== file.id) : [...prev, file.id]); return ( <div key={file.id} onClick={toggle} className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors ${checked ? "bg-blue-500/10 ring-1 ring-blue-500/30" : "bg-slate-900/60 hover:bg-slate-800/60"}`}> <input type="checkbox" checked={checked} onChange={(e) => { e.stopPropagation(); toggle(); }} onClick={(e) => e.stopPropagation()} className="mt-1 h-4 w-4 accent-blue-500" /> <div className="min-w-0 flex-1"> <div className="flex items-center justify-between gap-3"><div className="truncate text-sm font-medium text-white">{file.title}</div><div className="text-[10px] text-slate-500">{wordCount(file.content).total} 字</div></div> <div className="mt-1 text-xs text-slate-500">{summarizeContent(file.content || "")}</div> </div> </div> ); })}</div> </div> ); })}</div>
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-5 shrink-0"><div className="text-sm text-slate-500">已选择 {draftIds.length}</div><button onClick={() => { onConfirm(draftIds); onClose(); }} className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">设置关联</button></div>
      </div>
    </div>
  );
}

// Preview Modal
export function PreviewModal({ open, text, onClose }: { open: boolean; text: string; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4">
      <div className={`${modalPanelClass} max-w-5xl`}><div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0"><div><h2 className="text-2xl font-bold text-white">预览发送内容</h2></div><div className="flex gap-2"><CopyButton text={text} /><button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"><X className="h-5 w-5" /></button></div></div><pre className="flex-1 overflow-y-auto whitespace-pre-wrap px-6 py-5 text-xs leading-relaxed text-slate-300 bg-slate-950/40">{text || "无内容"}</pre></div>
    </div>
  );
}

// Recycle Bin Modal
export function RecycleBinModal({ open, items, onClose, onRestore, onPurge, onClear }: { open: boolean; items: { id: string; type: "file" | "book"; title: string; deletedAt: number }[]; onClose: () => void; onRestore: (id: string) => void; onPurge: (id: string) => void; onClear: () => void; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4">
      <div className={`${modalPanelClass} max-w-3xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0"><div><h2 className="text-2xl font-bold text-white">回收站</h2></div><div className="flex gap-2">{items.length > 0 && <button onClick={onClear} className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 transition-colors">清空</button>}<button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"><X className="h-5 w-5" /></button></div></div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">{items.length === 0 ? <p className="text-center text-slate-500 py-12">回收站空</p> : items.map((i) => ( <div key={i.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 hover:border-slate-700 transition-colors"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[10px] bg-slate-800 px-1.5 rounded text-slate-400">{i.type === "book" ? "书" : "文"}</span><div className="truncate text-sm font-medium text-white">{i.title}</div></div><div className="mt-1 text-xs text-slate-500">删除于 {new Date(i.deletedAt).toLocaleString()}</div></div><div className="flex gap-2"><button onClick={() => onRestore(i.id)} className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">恢复</button><button onClick={() => onPurge(i.id)} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300">彻底删除</button></div></div> ))}</div>
      </div>
    </div>
  );
}

export function DistillationPickerModal({
  open,
  profiles,
  selectedIds,
  onClose,
  onConfirm,
}: {
  open: boolean;
  profiles: DistilledProfile[];
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds || []);
  const [search, setSearch] = useState("");
  useEffect(() => { if (open) setDraftIds(selectedIds || []); }, [open, selectedIds]);
  if (!open) return null;
  const q = search.trim().toLowerCase();
  const filtered = profiles.filter((profile) => !q || profile.title.toLowerCase().includes(q) || profile.summary.toLowerCase().includes(q) || profile.lexicon.join(" ").toLowerCase().includes(q) || (profile.targetLabel || "").toLowerCase().includes(q) || (profile.primarySkill || "").toLowerCase().includes(q) || (profile.skillTags || []).join(" ").toLowerCase().includes(q));
  const toggle = (id: string) => {
    setDraftIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4">
      <div className={`${modalPanelClass} max-w-4xl`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white">选择 Writing Agent 蒸馏</h2>
            <p className="mt-1 text-sm text-slate-500">选中的蒸馏会作为 Writing Agent 的叙事技能与上下文切片。</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-slate-800 px-6 py-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索蒸馏名称、摘要、语感词..." className="w-full rounded-2xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-purple-500 transition-colors" />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {filtered.map((profile) => {
            const checked = draftIds.includes(profile.id);
            return (
              <button
                key={profile.id}
                onClick={() => toggle(profile.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${checked ? "border-fuchsia-500/60 bg-fuchsia-500/10" : "border-slate-800 bg-slate-950/40 hover:border-slate-700"}`}
              >
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={checked} onChange={() => toggle(profile.id)} onClick={(e) => e.stopPropagation()} className="mt-1 h-4 w-4 accent-fuchsia-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{profile.title}</span>
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-300">{profile.targetLabel || "作品蒸馏"}</span>
                      {profile.primarySkill && <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300">{profile.primarySkill}</span>}
                      <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-300">{Math.round(profile.wordCount / 1000)}k 字样本</span>
                      {checked && <span className="rounded-full bg-fuchsia-500 px-2 py-0.5 text-[10px] text-white">已选</span>}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{profile.summary}</p>
                    <p className="mt-2 line-clamp-1 text-xs text-slate-500">技能标签：{profile.skillTags?.join("、") || "未分类"} · 语感词：{profile.lexicon.join("、") || "无"}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-12 text-center text-sm text-slate-500">没有匹配的蒸馏。先从 Writing Agent 域上传文本样本。</div>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-6 py-5 shrink-0">
          <button onClick={() => setDraftIds([])} className="rounded-2xl px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800">清空选择</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded-2xl px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800">取消</button>
            <button onClick={() => { onConfirm(draftIds); onClose(); }} className="rounded-2xl bg-fuchsia-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-fuchsia-500 transition-colors">确认选择 {draftIds.length}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

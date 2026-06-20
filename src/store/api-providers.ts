// 多 Provider 适配层：OpenAI 兼容 / Anthropic / Gemini / Ollama
// 设计原则：上层只看到统一的 ChatMessage 流，下面适配各 provider 不同 wire format。

export type ProviderId = "openai-compatible" | "anthropic" | "gemini" | "ollama";

export interface ProviderPreset {
  id: string;
  label: string;
  provider: ProviderId;
  apiUrl: string;
  modelId: string;
  modelName: string;
  group?: "official" | "china" | "router" | "global" | "local";
  notes?: string;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  "openai-compatible": "OpenAI 兼容 / 聚合平台 / 自部署",
  anthropic: "Anthropic Claude (Messages API)",
  gemini: "Google Gemini",
  ollama: "Ollama / LM Studio (本地)",
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai-gpt-4o-mini",
    label: "OpenAI · gpt-4o-mini",
    provider: "openai-compatible",
    apiUrl: "https://api.openai.com/v1",
    modelId: "gpt-4o-mini",
    modelName: "OpenAI GPT-4o mini",
    group: "official",
  },
  {
    id: "openai-gpt-4o",
    label: "OpenAI · gpt-4o",
    provider: "openai-compatible",
    apiUrl: "https://api.openai.com/v1",
    modelId: "gpt-4o",
    modelName: "OpenAI GPT-4o",
    group: "official",
  },
  {
    id: "deepseek-chat",
    label: "DeepSeek · chat",
    provider: "openai-compatible",
    apiUrl: "https://api.deepseek.com/v1",
    modelId: "deepseek-chat",
    modelName: "DeepSeek Chat",
    group: "china",
    notes: "性价比首选，中文网文友好",
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek · reasoner",
    provider: "openai-compatible",
    apiUrl: "https://api.deepseek.com/v1",
    modelId: "deepseek-reasoner",
    modelName: "DeepSeek R1",
    group: "china",
    notes: "推理强，适合做大纲和拆书",
  },
  {
    id: "siliconflow-qwen",
    label: "硅基流动 · Qwen2.5-72B",
    provider: "openai-compatible",
    apiUrl: "https://api.siliconflow.cn/v1",
    modelId: "Qwen/Qwen2.5-72B-Instruct",
    modelName: "Qwen2.5 72B (SiliconFlow)",
    group: "china",
  },
  {
    id: "siliconflow-deepseek-v3",
    label: "硅基流动 · DeepSeek V3",
    provider: "openai-compatible",
    apiUrl: "https://api.siliconflow.cn/v1",
    modelId: "deepseek-ai/DeepSeek-V3",
    modelName: "DeepSeek V3 (SiliconFlow)",
    group: "china",
  },
  {
    id: "tongyi-qwen-max",
    label: "阿里通义 · qwen-max",
    provider: "openai-compatible",
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelId: "qwen-max",
    modelName: "通义千问 Max",
    group: "china",
  },
  {
    id: "tongyi-qwen-plus",
    label: "阿里通义 · qwen-plus",
    provider: "openai-compatible",
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelId: "qwen-plus",
    modelName: "通义千问 Plus",
    group: "china",
  },
  {
    id: "moonshot-kimi-128k",
    label: "月之暗面 · Kimi 128K",
    provider: "openai-compatible",
    apiUrl: "https://api.moonshot.cn/v1",
    modelId: "moonshot-v1-128k",
    modelName: "Kimi Moonshot 128K",
    group: "china",
    notes: "长上下文友好，模型 ID 以控制台为准",
  },
  {
    id: "zhipu-glm-4-plus",
    label: "智谱 · GLM-4 Plus",
    provider: "openai-compatible",
    apiUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelId: "glm-4-plus",
    modelName: "智谱 GLM-4 Plus",
    group: "china",
  },
  {
    id: "zhipu-glm-4-flash",
    label: "智谱 · GLM-4 Flash",
    provider: "openai-compatible",
    apiUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelId: "glm-4-flash",
    modelName: "智谱 GLM-4 Flash",
    group: "china",
  },
  {
    id: "baichuan4",
    label: "百川 · Baichuan4",
    provider: "openai-compatible",
    apiUrl: "https://api.baichuan-ai.com/v1",
    modelId: "Baichuan4",
    modelName: "百川 Baichuan4",
    group: "china",
  },
  {
    id: "stepfun-step-2",
    label: "阶跃星辰 · step-2",
    provider: "openai-compatible",
    apiUrl: "https://api.stepfun.com/v1",
    modelId: "step-2-16k",
    modelName: "StepFun step-2",
    group: "china",
    notes: "模型 ID 以控制台为准",
  },
  {
    id: "minimax-abab",
    label: "MiniMax · abab",
    provider: "openai-compatible",
    apiUrl: "https://api.minimax.chat/v1",
    modelId: "abab6.5s-chat",
    modelName: "MiniMax abab",
    group: "china",
    notes: "模型 ID 以控制台为准",
  },
  {
    id: "yi-large",
    label: "零一万物 · yi-large",
    provider: "openai-compatible",
    apiUrl: "https://api.lingyiwanwu.com/v1",
    modelId: "yi-large",
    modelName: "Yi Large",
    group: "china",
  },
  {
    id: "volcengine-doubao",
    label: "火山方舟 · Doubao",
    provider: "openai-compatible",
    apiUrl: "https://ark.cn-beijing.volces.com/api/v3",
    modelId: "doubao-seed-1-6",
    modelName: "火山方舟 Doubao",
    group: "china",
    notes: "很多方舟模型需要填控制台 endpoint/model ID",
  },
  {
    id: "tencent-hunyuan",
    label: "腾讯混元 · hunyuan",
    provider: "openai-compatible",
    apiUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    modelId: "hunyuan-turbo",
    modelName: "腾讯混元 Turbo",
    group: "china",
    notes: "模型 ID 以控制台为准",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6 (官方)",
    provider: "anthropic",
    apiUrl: "https://api.anthropic.com/v1",
    modelId: "claude-sonnet-4-6",
    modelName: "Claude Sonnet 4.6",
    group: "official",
    notes: "长篇一致性强",
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7 (官方)",
    provider: "anthropic",
    apiUrl: "https://api.anthropic.com/v1",
    modelId: "claude-opus-4-7",
    modelName: "Claude Opus 4.7",
    group: "official",
    notes: "最强写作力",
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    provider: "gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelId: "gemini-2.0-flash",
    modelName: "Gemini 2.0 Flash",
    group: "official",
  },
  {
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro (长上下文)",
    provider: "gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelId: "gemini-1.5-pro",
    modelName: "Gemini 1.5 Pro",
    group: "official",
  },
  {
    id: "openrouter-auto",
    label: "OpenRouter · Auto",
    provider: "openai-compatible",
    apiUrl: "https://openrouter.ai/api/v1",
    modelId: "openrouter/auto",
    modelName: "OpenRouter Auto",
    group: "router",
    notes: "聚合平台，可在模型 ID 中填写 openai/、anthropic/、google/ 等",
  },
  {
    id: "openrouter-claude",
    label: "OpenRouter · Claude",
    provider: "openai-compatible",
    apiUrl: "https://openrouter.ai/api/v1",
    modelId: "anthropic/claude-3.5-sonnet",
    modelName: "Claude via OpenRouter",
    group: "router",
  },
  {
    id: "openrouter-gpt",
    label: "OpenRouter · GPT",
    provider: "openai-compatible",
    apiUrl: "https://openrouter.ai/api/v1",
    modelId: "openai/gpt-4o-mini",
    modelName: "GPT via OpenRouter",
    group: "router",
  },
  {
    id: "codex2api-codex",
    label: "Codex2API · gpt-5.3-codex",
    provider: "openai-compatible",
    apiUrl: "https://www.codex2api.com/v1",
    modelId: "gpt-5.3-codex",
    modelName: "GPT-5.3 Codex via Codex2API",
    group: "router",
    notes: "OpenAI-compatible 聚合端点；模型列表可通过 /models 探测，密钥只保存在本机设置或环境变量中。",
  },
  {
    id: "oneapi-local",
    label: "One API / New API",
    provider: "openai-compatible",
    apiUrl: "http://localhost:3000/v1",
    modelId: "gpt-4o-mini",
    modelName: "One API / New API Gateway",
    group: "router",
    notes: "适合自建聚合网关，模型 ID 按后台渠道映射填写",
  },
  {
    id: "litellm-proxy",
    label: "LiteLLM Proxy",
    provider: "openai-compatible",
    apiUrl: "http://localhost:4000/v1",
    modelId: "gpt-4o-mini",
    modelName: "LiteLLM Proxy",
    group: "router",
    notes: "适合把 OpenAI、Claude、Gemini、Bedrock 等统一转成 OpenAI-compatible",
  },
  {
    id: "groq-llama",
    label: "Groq · Llama",
    provider: "openai-compatible",
    apiUrl: "https://api.groq.com/openai/v1",
    modelId: "llama-3.3-70b-versatile",
    modelName: "Groq Llama 70B",
    group: "global",
  },
  {
    id: "mistral-large",
    label: "Mistral · large",
    provider: "openai-compatible",
    apiUrl: "https://api.mistral.ai/v1",
    modelId: "mistral-large-latest",
    modelName: "Mistral Large",
    group: "global",
  },
  {
    id: "perplexity-sonar",
    label: "Perplexity · sonar",
    provider: "openai-compatible",
    apiUrl: "https://api.perplexity.ai",
    modelId: "sonar-pro",
    modelName: "Perplexity Sonar Pro",
    group: "global",
  },
  {
    id: "xai-grok",
    label: "xAI · Grok",
    provider: "openai-compatible",
    apiUrl: "https://api.x.ai/v1",
    modelId: "grok-2-latest",
    modelName: "xAI Grok",
    group: "global",
    notes: "模型 ID 以账号可用列表为准",
  },
  {
    id: "together-llama",
    label: "Together · Llama",
    provider: "openai-compatible",
    apiUrl: "https://api.together.xyz/v1",
    modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    modelName: "Together Llama 70B",
    group: "global",
  },
  {
    id: "fireworks-llama",
    label: "Fireworks · Llama",
    provider: "openai-compatible",
    apiUrl: "https://api.fireworks.ai/inference/v1",
    modelId: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    modelName: "Fireworks Llama",
    group: "global",
  },
  {
    id: "nvidia-nim",
    label: "NVIDIA NIM",
    provider: "openai-compatible",
    apiUrl: "https://integrate.api.nvidia.com/v1",
    modelId: "meta/llama-3.1-70b-instruct",
    modelName: "NVIDIA NIM",
    group: "global",
  },
  {
    id: "cerebras-llama",
    label: "Cerebras · Llama",
    provider: "openai-compatible",
    apiUrl: "https://api.cerebras.ai/v1",
    modelId: "llama-3.3-70b",
    modelName: "Cerebras Llama",
    group: "global",
  },
  {
    id: "ollama-qwen",
    label: "Ollama · qwen2.5",
    provider: "ollama",
    apiUrl: "http://localhost:11434",
    modelId: "qwen2.5:14b",
    modelName: "Ollama Qwen2.5 14B",
    group: "local",
    notes: "本地，不需密钥",
  },
  {
    id: "lmstudio-local",
    label: "LM Studio (本地)",
    provider: "openai-compatible",
    apiUrl: "http://localhost:1234/v1",
    modelId: "local-model",
    modelName: "LM Studio Local",
    group: "local",
    notes: "本地，密钥可填任意值",
  },
  {
    id: "vllm-local",
    label: "vLLM / llama.cpp server",
    provider: "openai-compatible",
    apiUrl: "http://localhost:8000/v1",
    modelId: "local-model",
    modelName: "Local OpenAI-compatible Server",
    group: "local",
    notes: "适合 vLLM、llama.cpp、FastChat 等 OpenAI-compatible 服务",
  },
];

export interface ChatTextPart {
  type: "text";
  text: string;
}

export interface ChatImagePart {
  type: "image";
  dataUrl: string;
  mimeType: string;
  name?: string;
  detail?: "auto" | "low" | "high";
}

export type ChatContentPart = ChatTextPart | ChatImagePart;
export type ChatContent = string | ChatContentPart[];

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: ChatContent;
}

export interface SendOptions {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  provider: ProviderId;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
  systemPrompt?: string;
}

export interface ProviderRequestPreview {
  provider: ProviderId;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  fallbackUrl?: string;
  streamMode: "sse" | "ndjson";
}

// 自动嗅探 provider：根据 URL 推断
export function inferProvider(apiUrl: string): ProviderId {
  const url = apiUrl.toLowerCase();
  if (url.includes("anthropic.com") || url.includes("claude")) return "anthropic";
  if (url.includes("generativelanguage.googleapis.com") || url.includes("gemini")) return "gemini";
  if (url.includes("localhost:11434") || url.includes("127.0.0.1:11434") || url.includes("/api/chat") || url.includes("ollama")) return "ollama";
  return "openai-compatible";
}

export function allowsEmptyApiKey(apiUrl: string, provider?: ProviderId) {
  const effectiveProvider = provider || inferProvider(apiUrl);
  if (effectiveProvider === "ollama") return true;
  const url = apiUrl.trim().toLowerCase();
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)/.test(url);
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export class ProviderApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, statusText: string, detail: string) {
    super(`API 错误 (${status}${statusText ? ` ${statusText}` : ""})${detail ? `：${detail}` : ""}`);
    this.name = "ProviderApiError";
    this.status = status;
    this.detail = detail;
  }
}

function apiErrorDetailFromText(raw: string) {
  const text = raw.trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const error = (parsed.error && typeof parsed.error === "object" ? parsed.error : {}) as Record<string, unknown>;
    const code = stringFromUnknown(parsed.code) || stringFromUnknown(error.code);
    const message = stringFromUnknown(parsed.message)
      || stringFromUnknown(error.message)
      || stringFromUnknown(parsed.error_description)
      || stringFromUnknown(parsed.detail);
    const detail = [code, message].filter(Boolean).join("：");
    if (detail) return detail;
  } catch {
    /* fall through to raw text */
  }
  return text.slice(0, 400);
}

async function apiErrorFromResponse(resp: Response) {
  const raw = await resp.text().catch(() => "");
  const detail = apiErrorDetailFromText(raw);
  return new ProviderApiError(resp.status, resp.statusText || "", detail);
}

function shouldTryNonStreamFallback(error: unknown) {
  if (error instanceof ProviderApiError) {
    return error.status < 400 || error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
  }
  return true;
}

// 退避重试包装
async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 800, signal?: AbortSignal): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    if (signal?.aborted) throw new Error("已停止");
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // 不重试 4xx 客户端错误（除 429）
      const msg = e instanceof Error ? e.message : String(e);
      if (/4\d{2}/.test(msg) && !/429/.test(msg)) throw e;
      if (i < retries) {
        await new Promise((res) => setTimeout(res, baseDelayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

function normalizeUrl(url: string, suffix: string) {
  const cleaned = url.trim().replace(/\/+$/, "");
  if (cleaned.endsWith(suffix)) return cleaned;
  return cleaned + suffix;
}

function isMultipartContent(content: ChatContent): content is ChatContentPart[] {
  return Array.isArray(content);
}

export function chatContentToText(content: ChatContent) {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is ChatTextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function getContentImages(content: ChatContent) {
  if (!isMultipartContent(content)) return [] as ChatImagePart[];
  return content.filter((part): part is ChatImagePart => part.type === "image");
}

function dataUrlToBase64(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  return match ? { mimeType: match[1], data: match[2] } : { mimeType: "", data: dataUrl };
}

function toOpenAIContent(content: ChatContent) {
  if (!isMultipartContent(content)) return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    return {
      type: "image_url",
      image_url: {
        url: part.dataUrl,
        detail: part.detail || "auto",
      },
    };
  });
}

function toAnthropicContent(content: ChatContent) {
  if (!isMultipartContent(content)) return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    const parsed = dataUrlToBase64(part.dataUrl);
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: part.mimeType || parsed.mimeType || "image/png",
        data: parsed.data,
      },
    };
  });
}

function toGeminiParts(content: ChatContent) {
  if (!isMultipartContent(content)) return [{ text: content }];
  return content.map((part) => {
    if (part.type === "text") return { text: part.text };
    const parsed = dataUrlToBase64(part.dataUrl);
    return {
      inlineData: {
        mimeType: part.mimeType || parsed.mimeType || "image/png",
        data: parsed.data,
      },
    };
  });
}

function toOllamaMessage(message: ChatMessage) {
  const images = getContentImages(message.content)
    .map((image) => dataUrlToBase64(image.dataUrl).data)
    .filter(Boolean);
  return {
    role: message.role,
    content: chatContentToText(message.content),
    ...(images.length ? { images } : {}),
  };
}

export function previewProviderWireMessage(provider: ProviderId, message: ChatMessage) {
  if (provider === "anthropic") return { ...message, content: toAnthropicContent(message.content) };
  if (provider === "gemini") return { role: message.role === "assistant" ? "model" : "user", parts: toGeminiParts(message.content) };
  if (provider === "ollama") return toOllamaMessage(message);
  return { ...message, content: toOpenAIContent(message.content) };
}

export function buildProviderRequest(opts: SendOptions): ProviderRequestPreview {
  const provider = opts.provider || inferProvider(opts.apiUrl);
  if (provider === "anthropic") {
    const url = normalizeUrl(opts.apiUrl, "/messages");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    const sys = opts.systemPrompt;
    const msgs = opts.messages.filter((m) => m.role !== "system");
    const explicitSys = chatContentToText(opts.messages.find((m) => m.role === "system")?.content || "");
    const finalSystem = [sys, explicitSys].filter(Boolean).join("\n\n");
    const body: Record<string, unknown> = {
      model: opts.modelId,
      messages: msgs.map((message) => ({ ...message, content: toAnthropicContent(message.content) })),
      max_tokens: opts.maxTokens ?? 8192,
      stream: true,
    };
    if (finalSystem) body.system = finalSystem;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    return { provider, url, headers, body, streamMode: "sse" };
  }
  if (provider === "gemini") {
    const base = opts.apiUrl.trim().replace(/\/+$/, "");
    const url = `${base}/models/${opts.modelId}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey)}`;
    const fallbackUrl = `${base}/models/${opts.modelId}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const sysParts: string[] = [];
    if (opts.systemPrompt) sysParts.push(opts.systemPrompt);
    const sysFromMsg = chatContentToText(opts.messages.find((m) => m.role === "system")?.content || "");
    if (sysFromMsg) sysParts.push(sysFromMsg);
    const contents = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: toGeminiParts(m.content) }));
    const body: Record<string, unknown> = { contents };
    if (sysParts.length) body.systemInstruction = { parts: [{ text: sysParts.join("\n\n") }] };
    if (opts.temperature !== undefined || opts.maxTokens !== undefined) {
      body.generationConfig = {
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { maxOutputTokens: opts.maxTokens } : {}),
      };
    }
    return { provider, url, fallbackUrl, headers, body, streamMode: "sse" };
  }
  if (provider === "ollama") {
    const base = opts.apiUrl.trim().replace(/\/+$/, "");
    if (base.endsWith("/v1")) {
      return buildProviderRequest({ ...opts, provider: "openai-compatible", apiKey: opts.apiKey || "ollama" });
    }
    const url = base + "/api/chat";
    const sys = opts.systemPrompt || chatContentToText(opts.messages.find((m) => m.role === "system")?.content || "");
    const msgs = opts.messages.filter((m) => m.role !== "system");
    const messages = sys
      ? [{ role: "system" as const, content: sys }, ...msgs].map(toOllamaMessage)
      : msgs.map(toOllamaMessage);
    const body: Record<string, unknown> = {
      model: opts.modelId,
      messages,
      stream: true,
      options: {
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { num_predict: opts.maxTokens } : {}),
      },
    };
    return { provider, url, headers: { "Content-Type": "application/json" }, body, streamMode: "ndjson" };
  }
  const url = normalizeUrl(opts.apiUrl, "/chat/completions");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey?.trim()) headers.Authorization = `Bearer ${opts.apiKey}`;
  const body: Record<string, unknown> = {
    model: opts.modelId,
    messages: opts.systemPrompt
      ? [{ role: "system", content: opts.systemPrompt }, ...opts.messages.map((message) => ({ ...message, content: toOpenAIContent(message.content) }))]
      : opts.messages.map((message) => ({ ...message, content: toOpenAIContent(message.content) })),
    stream: true,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  return { provider, url, headers, body, streamMode: "sse" };
}

// --------- OpenAI 兼容 ---------
async function sendOpenAICompatible(opts: SendOptions): Promise<string> {
  const { url, headers, body } = buildProviderRequest({ ...opts, provider: "openai-compatible" });

  try {
    return await streamSSE(url, headers, body, opts.onChunk, opts.signal, (json) => {
      return json.choices?.[0]?.delta?.content || "";
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    if (!shouldTryNonStreamFallback(e)) throw e;
    // fallback non-stream
    return await postJson(url, headers, { ...body, stream: false }, opts.signal, (json) => {
      const text = json.choices?.[0]?.message?.content || "";
      opts.onChunk?.(text);
      return text;
    });
  }
}

// --------- Anthropic Messages API ---------
async function sendAnthropic(opts: SendOptions): Promise<string> {
  const { url, headers, body } = buildProviderRequest({ ...opts, provider: "anthropic" });

  try {
    return await streamSSE(url, headers, body, opts.onChunk, opts.signal, (json) => {
      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
        return json.delta.text || "";
      }
      return "";
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    if (!shouldTryNonStreamFallback(e)) throw e;
    return await postJson(url, headers, { ...body, stream: false }, opts.signal, (json) => {
      const text = (json.content || []).map((b: { type: string; text?: string }) => (b.type === "text" ? b.text || "" : "")).join("");
      opts.onChunk?.(text);
      return text;
    });
  }
}

// --------- Google Gemini ---------
async function sendGemini(opts: SendOptions): Promise<string> {
  // Gemini URL: {base}/models/{model}:streamGenerateContent?alt=sse&key=...
  const { url: streamUrl, fallbackUrl, headers, body } = buildProviderRequest({ ...opts, provider: "gemini" });
  try {
    return await streamSSE(streamUrl, headers, body, opts.onChunk, opts.signal, (json) => {
      const parts = json.candidates?.[0]?.content?.parts || [];
      return parts.map((p: { text?: string }) => p.text || "").join("");
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    if (!shouldTryNonStreamFallback(e)) throw e;
    return await postJson(fallbackUrl || streamUrl, headers, body, opts.signal, (json) => {
      const parts = json.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p: { text?: string }) => p.text || "").join("");
      opts.onChunk?.(text);
      return text;
    });
  }
}

// --------- Ollama 本地 ---------
async function sendOllama(opts: SendOptions): Promise<string> {
  const base = opts.apiUrl.trim().replace(/\/+$/, "");
  // 优先用 OpenAI 兼容路径，更稳
  if (base.endsWith("/v1")) {
    return sendOpenAICompatible({ ...opts, apiKey: opts.apiKey || "ollama" });
  }
  const { url, headers, body } = buildProviderRequest({ ...opts, provider: "ollama" });
  // Ollama 用 JSONL 而不是 SSE
  return streamNDJSON(url, headers, body, opts.onChunk, opts.signal, (json) => {
    return json.message?.content || "";
  });
}

// --------- 流式工具 ---------
async function streamSSE(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  onChunk: ((t: string) => void) | undefined,
  signal: AbortSignal | undefined,
  extract: (json: any) => string,
): Promise<string> {
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!resp.ok) {
    throw await apiErrorFromResponse(resp);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const evt of events) {
      const dataLines = evt.split(/\r?\n/).filter((l) => l.startsWith("data:"));
      for (const line of dataLines) {
        const data = line.replace(/^data:\s*/, "").trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as Record<string, unknown>;
          const delta = extract(json);
          if (delta) {
            fullText += delta;
            onChunk?.(fullText);
          }
        } catch {
          /* skip bad json line */
        }
      }
    }
  }
  return fullText;
}

async function streamNDJSON(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  onChunk: ((t: string) => void) | undefined,
  signal: AbortSignal | undefined,
  extract: (json: any) => string,
): Promise<string> {
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!resp.ok) {
    throw await apiErrorFromResponse(resp);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed) as Record<string, unknown>;
        const delta = extract(json);
        if (delta) {
          fullText += delta;
          onChunk?.(fullText);
        }
      } catch {
        /* skip */
      }
    }
  }
  return fullText;
}

async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal | undefined,
  pick: (json: any) => T,
): Promise<T> {
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!resp.ok) {
    throw await apiErrorFromResponse(resp);
  }
  const json = (await resp.json()) as Record<string, unknown>;
  return pick(json);
}

// --------- 统一入口 ---------
export async function sendChatViaProvider(opts: SendOptions): Promise<string> {
  const provider = opts.provider || inferProvider(opts.apiUrl);
  const run = () => {
    switch (provider) {
      case "anthropic":
        return sendAnthropic(opts);
      case "gemini":
        return sendGemini(opts);
      case "ollama":
        return sendOllama(opts);
      default:
        return sendOpenAICompatible(opts);
    }
  };
  return withRetry(run, 2, 800, opts.signal);
}

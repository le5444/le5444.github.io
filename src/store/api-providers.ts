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
  ollama: "Ollama 本地服务端点",
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai-auto-discover",
    label: "OpenAI · 填 key 后获取模型",
    provider: "openai-compatible",
    apiUrl: "https://api.openai.com/v1",
    modelId: "填 key 后点获取模型列表",
    modelName: "OpenAI Account Models",
    group: "official",
    notes: "只负责填官方端点；模型 ID 以你的账号 /models 返回为准，不把静态预设当最新版。",
  },
  {
    id: "openai-codex-discover",
    label: "OpenAI · Codex / 编程模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.openai.com/v1",
    modelId: "codex-from-models",
    modelName: "Codex / Coding Model from /models",
    group: "official",
    notes: "面向 Codex / 编程 Agent 场景；填 key 后用 /models 选择账号真实可用的 codex / coding 模型。",
  },
  {
    id: "deepseek-chat",
    label: "DeepSeek · 账号模型列表",
    provider: "openai-compatible",
    apiUrl: "https://api.deepseek.com/v1",
    modelId: "deepseek-model-from-models",
    modelName: "DeepSeek from /models",
    group: "china",
    notes: "只填 DeepSeek 端点；具体 chat / reasoner 模型以账号 /models 返回为准。",
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek · 推理模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.deepseek.com/v1",
    modelId: "deepseek-reasoner-from-models",
    modelName: "DeepSeek Reasoner from /models",
    group: "china",
    notes: "只填 DeepSeek 端点；推理模型 ID 以账号 /models 或控制台为准。",
  },
  {
    id: "siliconflow-qwen",
    label: "硅基流动 · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.siliconflow.cn/v1",
    modelId: "siliconflow-model-from-models",
    modelName: "SiliconFlow Model from /models",
    group: "china",
    notes: "只填硅基流动端点；模型 ID 以你的账号 /models 返回为准。",
  },
  {
    id: "siliconflow-deepseek-v3",
    label: "硅基流动 · DeepSeek V3",
    provider: "openai-compatible",
    apiUrl: "https://api.siliconflow.cn/v1",
    modelId: "siliconflow-deepseek-from-models",
    modelName: "DeepSeek via SiliconFlow /models",
    group: "china",
    notes: "只填硅基流动端点；DeepSeek 具体模型以你的账号 /models 返回为准。",
  },
  {
    id: "tongyi-qwen-max",
    label: "阿里通义 · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelId: "dashscope-qwen-from-models",
    modelName: "通义千问 from /models",
    group: "china",
    notes: "只填通义兼容端点；具体 qwen 模型以控制台或 /models 返回为准。",
  },
  {
    id: "tongyi-qwen-plus",
    label: "阿里通义 · 备用端点模板",
    provider: "openai-compatible",
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelId: "dashscope-qwen-from-models",
    modelName: "通义千问 from /models",
    group: "china",
    notes: "只填通义兼容端点；具体 qwen 模型以控制台或 /models 返回为准。",
  },
  {
    id: "moonshot-kimi-128k",
    label: "月之暗面 · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.moonshot.cn/v1",
    modelId: "moonshot-model-from-models",
    modelName: "Kimi / Moonshot from /models",
    group: "china",
    notes: "只填 Moonshot 端点；具体模型 ID 以账号 /models 或控制台为准。",
  },
  {
    id: "zhipu-glm-4-plus",
    label: "智谱 · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelId: "zhipu-model-from-models",
    modelName: "智谱 GLM from /models",
    group: "china",
    notes: "只填智谱端点；具体模型以控制台或 /models 返回为准。",
  },
  {
    id: "zhipu-glm-4-flash",
    label: "智谱 · 备用端点模板",
    provider: "openai-compatible",
    apiUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelId: "zhipu-model-from-models",
    modelName: "智谱 GLM from /models",
    group: "china",
    notes: "只填智谱端点；具体模型以控制台或 /models 返回为准。",
  },
  {
    id: "baichuan4",
    label: "百川 · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.baichuan-ai.com/v1",
    modelId: "baichuan-model-from-models",
    modelName: "百川 from /models",
    group: "china",
    notes: "只填百川端点；具体模型以控制台或 /models 返回为准。",
  },
  {
    id: "stepfun-step-2",
    label: "阶跃星辰 · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.stepfun.com/v1",
    modelId: "stepfun-model-from-models",
    modelName: "阶跃星辰 from /models",
    group: "china",
    notes: "只填阶跃星辰端点；具体模型 ID 以账号 /models 或控制台为准。",
  },
  {
    id: "minimax-abab",
    label: "MiniMax · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.minimax.chat/v1",
    modelId: "minimax-model-from-models",
    modelName: "MiniMax from /models",
    group: "china",
    notes: "只填 MiniMax 端点；具体模型 ID 以账号 /models 或控制台为准。",
  },
  {
    id: "yi-large",
    label: "零一万物 · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.lingyiwanwu.com/v1",
    modelId: "lingyi-model-from-models",
    modelName: "零一万物 from /models",
    group: "china",
    notes: "只填零一万物端点；具体模型以控制台或 /models 返回为准。",
  },
  {
    id: "volcengine-doubao",
    label: "火山方舟 · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://ark.cn-beijing.volces.com/api/v3",
    modelId: "volcengine-model-from-console",
    modelName: "火山方舟模型 / Endpoint",
    group: "china",
    notes: "很多方舟模型需要填控制台 endpoint/model ID",
  },
  {
    id: "tencent-hunyuan",
    label: "腾讯混元 · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    modelId: "hunyuan-model-from-models",
    modelName: "腾讯混元 from /models",
    group: "china",
    notes: "只填腾讯混元端点；具体模型 ID 以账号 /models 或控制台为准。",
  },
  {
    id: "claude-sonnet-latest",
    label: "Claude · Sonnet / 账号发现",
    provider: "anthropic",
    apiUrl: "https://api.anthropic.com/v1",
    modelId: "claude-sonnet-from-models",
    modelName: "Claude Sonnet from /models",
    group: "official",
    notes: "官方 Anthropic Messages API；不要依赖静态版本号，具体模型以控制台和模型列表为准。",
  },
  {
    id: "claude-opus-latest",
    label: "Claude · Opus / 账号发现",
    provider: "anthropic",
    apiUrl: "https://api.anthropic.com/v1",
    modelId: "claude-opus-from-models",
    modelName: "Claude Opus from /models",
    group: "official",
    notes: "官方 Anthropic Messages API；不要依赖静态版本号，具体模型以控制台和模型列表为准。",
  },
  {
    id: "gemini-flash-latest",
    label: "Gemini · Flash / 账号发现",
    provider: "gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelId: "gemini-flash-from-models",
    modelName: "Gemini Flash from /models",
    group: "official",
    notes: "Google Gemini；官方模型页会持续更新，具体可用模型以 /models 或 Google AI Studio 为准。",
  },
  {
    id: "gemini-pro-latest",
    label: "Gemini · Pro / 账号发现",
    provider: "gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelId: "gemini-pro-from-models",
    modelName: "Gemini Pro from /models",
    group: "official",
    notes: "Google Gemini 高推理/Agent 场景；具体可用模型以 /models 或 Google AI Studio 为准。",
  },
  {
    id: "openrouter-auto",
    label: "OpenRouter · Auto",
    provider: "openai-compatible",
    apiUrl: "https://openrouter.ai/api/v1",
    modelId: "openrouter-model-from-models",
    modelName: "OpenRouter Model from /models",
    group: "router",
    notes: "聚合平台，可在模型 ID 中填写 openai/、anthropic/、google/ 等",
  },
  {
    id: "openrouter-claude",
    label: "OpenRouter · Claude / 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://openrouter.ai/api/v1",
    modelId: "anthropic/claude-model-from-models",
    modelName: "Claude via OpenRouter /models",
    group: "router",
    notes: "聚合平台模型 ID 更新快，可在设置中用 /models 获取账号实际可用列表。",
  },
  {
    id: "openrouter-gpt",
    label: "OpenRouter · GPT / 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://openrouter.ai/api/v1",
    modelId: "openai/model-from-models",
    modelName: "GPT via OpenRouter /models",
    group: "router",
  },
  {
    id: "codex2api-codex",
    label: "Codex2API · 自定义模型",
    provider: "openai-compatible",
    apiUrl: "https://www.codex2api.com/v1",
    modelId: "codex-from-models",
    modelName: "Codex2API Model from /models",
    group: "router",
    notes: "OpenAI-compatible 聚合端点；先填密钥后通过 /models 获取真实模型名，密钥只保存在本机设置或环境变量中。",
  },
  {
    id: "oneapi-local",
    label: "One API / New API",
    provider: "openai-compatible",
    apiUrl: "http://localhost:3000/v1",
    modelId: "gateway-model-from-models",
    modelName: "One API / New API Model",
    group: "router",
    notes: "适合自建聚合网关，模型 ID 按后台渠道映射填写",
  },
  {
    id: "litellm-proxy",
    label: "LiteLLM Proxy",
    provider: "openai-compatible",
    apiUrl: "http://localhost:4000/v1",
    modelId: "litellm-model-from-models",
    modelName: "LiteLLM Model from /models",
    group: "router",
    notes: "适合把 OpenAI、Claude、Gemini、Bedrock 等统一转成 OpenAI-compatible",
  },
  {
    id: "groq-llama",
    label: "Groq · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.groq.com/openai/v1",
    modelId: "groq-model-from-models",
    modelName: "Groq Model from /models",
    group: "global",
    notes: "只填 Groq 端点；具体模型以账号 /models 返回为准。",
  },
  {
    id: "mistral-large",
    label: "Mistral · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.mistral.ai/v1",
    modelId: "mistral-model-from-models",
    modelName: "Mistral Model from /models",
    group: "global",
    notes: "只填 Mistral 端点；具体模型以账号 /models 返回为准。",
  },
  {
    id: "perplexity-sonar",
    label: "Perplexity · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.perplexity.ai",
    modelId: "perplexity-model-from-models",
    modelName: "Perplexity Model from /models",
    group: "global",
    notes: "只填 Perplexity 端点；具体模型以账号 /models 返回为准。",
  },
  {
    id: "xai-grok",
    label: "xAI · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.x.ai/v1",
    modelId: "xai-model-from-models",
    modelName: "xAI Model from /models",
    group: "global",
    notes: "只填 xAI 端点；具体模型 ID 以账号 /models 或控制台为准。",
  },
  {
    id: "together-llama",
    label: "Together · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.together.xyz/v1",
    modelId: "together-model-from-models",
    modelName: "Together Model from /models",
    group: "global",
    notes: "只填 Together 端点；具体模型以账号 /models 返回为准。",
  },
  {
    id: "fireworks-llama",
    label: "Fireworks · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.fireworks.ai/inference/v1",
    modelId: "fireworks-model-from-models",
    modelName: "Fireworks Model from /models",
    group: "global",
    notes: "只填 Fireworks 端点；具体模型以账号 /models 返回为准。",
  },
  {
    id: "nvidia-nim",
    label: "NVIDIA NIM",
    provider: "openai-compatible",
    apiUrl: "https://integrate.api.nvidia.com/v1",
    modelId: "nvidia-model-from-models",
    modelName: "NVIDIA NIM Model from /models",
    group: "global",
    notes: "只填 NVIDIA NIM 端点；具体模型以账号 /models 返回为准。",
  },
  {
    id: "cerebras-llama",
    label: "Cerebras · 模型发现",
    provider: "openai-compatible",
    apiUrl: "https://api.cerebras.ai/v1",
    modelId: "cerebras-model-from-models",
    modelName: "Cerebras Model from /models",
    group: "global",
    notes: "只填 Cerebras 端点；具体模型以账号 /models 返回为准。",
  },
  {
    id: "ollama-qwen",
    label: "Ollama · 本地服务端点",
    provider: "ollama",
    apiUrl: "http://localhost:11434",
    modelId: "ollama-model-from-tags",
    modelName: "Ollama from /api/tags",
    group: "local",
    notes: "只是本地服务端点模板，不代表电脑已有本地模型；需要 Ollama 已启动并已拉取模型，再点获取模型读取 /api/tags。",
  },
  {
    id: "lmstudio-local",
    label: "LM Studio · 本地服务端点",
    provider: "openai-compatible",
    apiUrl: "http://localhost:1234/v1",
    modelId: "lmstudio-model-from-models",
    modelName: "LM Studio from /models",
    group: "local",
    notes: "只是本地服务端点模板，不代表电脑已有本地模型；需要 LM Studio server 已启动并加载模型，再读取 /models。",
  },
  {
    id: "vllm-local",
    label: "vLLM / llama.cpp · 本地服务端点",
    provider: "openai-compatible",
    apiUrl: "http://localhost:8000/v1",
    modelId: "local-model-from-models",
    modelName: "Local OpenAI-compatible from /models",
    group: "local",
    notes: "只是本地服务端点模板，不代表电脑已有本地模型；适合已启动并加载模型的 vLLM、llama.cpp、FastChat 等 OpenAI-compatible 服务。",
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

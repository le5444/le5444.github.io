import { STORAGE_ERROR_EVENT } from "../utils/helpers";
import {
  allowsEmptyApiKey,
  chatContentToText,
  inferProvider,
  sendChatViaProvider,
  type ChatContent,
  type ChatMessage as ProviderChatMessage,
  type ProviderId,
} from "./api-providers";

export type { ChatContent, ChatContentPart, ChatImagePart, ChatTextPart, ProviderId } from "./api-providers";
export { PROVIDER_PRESETS, PROVIDER_LABELS, allowsEmptyApiKey, chatContentToText, inferProvider } from "./api-providers";

export interface ApiSettings {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  modelName: string;
  provider?: ProviderId; // 新增；缺省时按 URL 自动嗅探
  temperature?: number;
  maxTokens?: number;
  profiles?: ApiProfile[];
  activeProfileId?: string;
  modelDiscoveryHistory?: ModelDiscoveryHistoryEntry[];
  desktopConfigImportedAt?: string;
  desktopConfigSource?: string;
  // 反崩盘默认开关（在设置面板暴露）
  antiCollapseDefault?: boolean;
  voiceLockDefault?: boolean;
  chroniclerAuto?: boolean; // 写完章节自动跑 chronicler
}

export interface ApiProfile {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  modelId: string;
  modelName: string;
  provider?: ProviderId;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelDiscoveryHistoryEntry {
  id: string;
  apiUrl: string;
  provider?: ProviderId;
  status: string;
  statusCode?: number;
  message: string;
  modelCount: number;
  models: Array<{
    id: string;
    displayName: string;
    ownedBy?: string;
    type?: string;
    created?: number;
    tags?: string[];
  }>;
  keyPresent: boolean;
  createdAt: number;
}

const STORAGE_KEY = "novelsmith-api-settings";

const defaultSettings: ApiSettings = {
  apiUrl: "",
  apiKey: "",
  modelId: "",
  modelName: "",
  provider: undefined,
  temperature: 0.85,
  maxTokens: undefined,
  profiles: [],
  activeProfileId: undefined,
  modelDiscoveryHistory: [],
  desktopConfigImportedAt: undefined,
  desktopConfigSource: undefined,
  antiCollapseDefault: true,
  voiceLockDefault: true,
  chroniclerAuto: false,
};

export function loadSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ApiSettings>;
      return { ...defaultSettings, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...defaultSettings };
}

export function saveSettings(s: ApiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch (error) {
    console.error("Novelsmith settings write failed:", error);
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key: STORAGE_KEY } }));
    return false;
  }
}

export function isConfigured(s: ApiSettings) {
  // Ollama 等本地服务可以无 apiKey
  const provider = s.provider || inferProvider(s.apiUrl);
  const needsKey = !allowsEmptyApiKey(s.apiUrl, provider);
  return s.apiUrl.trim() !== "" && (!needsKey || s.apiKey.trim() !== "") && s.modelId.trim() !== "";
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: ChatContent;
}

const SYSTEM_PROMPT = `你是织梦写作台 / Zhimeng Writing Agent 里的 AI Agent 工作台助手。公开产品名保持“织梦写作台”，但你的工作方式是个人 Agent IDE：围绕对话线程、项目、文件、工具、审批、记忆和 Skills 协作推进任务。默认用中文，回答要简洁、自然、具体。
写作是内置的重要 Domain Agent 之一，不是所有任务的默认解释框架。你也要同等认真处理 coding、research、automation、knowledge、project 和 general 任务。
先判断用户任务属于 writing、coding、research、automation、knowledge、project 或 general 哪个域；只有任务明确进入写作/小说/文案创作时，才挂载 Writing Agent 规则。
优先使用当前输入、已选 Skill、关联文件、Memory 摘要和 Workspace 上下文；不要把不相关的大段资料塞进回答。
如果用户只是在寒暄，短句回应即可；如果用户提出明确任务，直接给可执行结果、代码改动、检查结论或下一步动作。
不要反复自我介绍，不要主动展开功能清单。

【工作台协作原则】
1. 任何文件写入、联网、MCP、调度、Skill runtime 或模型 Worker 执行，都必须尊重显式权限门和可审查草案。
2. 需要长期事实、用户偏好或项目真值时，必须依赖可见上下文或证据，不伪造记忆。
3. coding/research/automation 任务不能被 Writing Agent 规则污染；写作任务也要隔离危险工具。
4. 输出优先面向完成任务：少讲抽象愿景，多给可运行、可检查、可继续的结果。
5. 需要本地工具时，不要假装已经执行；应按当前工作台协议请求工具、说明审批状态或等待 Gateway 结果。

【Writing Agent 触发时的反崩盘原则】
1. 不复写用户提供素材中的原句、人名、专有设定和标志性桥段；只学其叙事机制、节奏、冲突结构。
2. 任何"约束卡 / 角色指纹 / 时间线 / 活跃伏笔"在上下文中出现时，视为最高优先级宪法，必须遵守；与之冲突时先回退重写，不要硬出。
3. 若上下文给出验证层 / 自检清单，必须按层执行；任一层不通过先内部重写再输出最终稿。
4. 不要写"总之 / 归根结底 / 这意味着 / 这是因为 / 本质上"等总结性陈述；不要把情绪直接命名，改用具体动作和身体反应。
5. 段落不要全长或全短；该克制时给悬置，不要每场都给答案。`;

export async function sendChat(
  settings: ApiSettings,
  messages: ChatMessage[],
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const provider: ProviderId = settings.provider || inferProvider(settings.apiUrl);
  // 把 system 直接传到 provider 层，避免在 messages 里和用户 system 冲突
  const userSystem = chatContentToText(messages.find((m) => m.role === "system")?.content || "");
  const nonSystem = messages.filter((m) => m.role !== "system") as ProviderChatMessage[];
  const composedSystem = userSystem
    ? `${SYSTEM_PROMPT}\n\n${userSystem}`
    : SYSTEM_PROMPT;
  return sendChatViaProvider({
    apiUrl: settings.apiUrl,
    apiKey: settings.apiKey,
    modelId: settings.modelId,
    provider,
    messages: nonSystem,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    systemPrompt: composedSystem,
    onChunk,
    signal,
  });
}

// 无系统提示的"裸 chat"：用于反崩盘子任务（chronicler/continuity-checker 等内部 agent）
export async function sendRawChat(
  settings: ApiSettings,
  systemPrompt: string,
  messages: ChatMessage[],
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const provider: ProviderId = settings.provider || inferProvider(settings.apiUrl);
  return sendChatViaProvider({
    apiUrl: settings.apiUrl,
    apiKey: settings.apiKey,
    modelId: settings.modelId,
    provider,
    messages: messages.filter((m) => m.role !== "system") as ProviderChatMessage[],
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    systemPrompt,
    onChunk,
    signal,
  });
}

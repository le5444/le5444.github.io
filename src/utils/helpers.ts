import type { ChatContent } from "../store/api-providers";
import type { PromptTemplate } from "../store/workspace";

export const CHAT_HISTORY_KEY = "novelsmith-chat-sessions";
export const CUSTOM_PROMPTS_KEY = "novelsmith-global-custom-prompts";
export const RECYCLE_BIN_KEY = "novelsmith-recycle-bin";
export const STORAGE_ERROR_EVENT = "novelsmith-storage-error";

export const categoryIconMap: Record<string, string> = {
  织梦工作台: "🧠",
  主要内容: "📄",
  设定: "📁",
  角色: "👤",
  组织势力: "🏰",
  知识库: "📚",
};

export const aiTools = [
  {
    key: "split-book",
    label: "AI拆书",
    icon: "📖",
    prompt:
      "请把当前内容当成一个小说片段进行拆解：分析黄金三章、人物亮点、矛盾冲突、章末钩子、爽点密度、继续提升方向，并重点指出是否符合番茄小说的节奏。",
  },
  {
    key: "review",
    label: "AI审稿",
    icon: "📝",
    prompt:
      "请以小说编辑身份对当前内容进行深度审稿，从钩子、伏笔、冲突、情感、角色、节奏、语言质量七个维度打分并给出具体修改建议。",
  },
  {
    key: "de-ai",
    label: "AI消痕",
    icon: "✨",
    prompt:
      "请把当前内容做 AI 痕迹优化：减少机械句式、去掉空泛抒情、压缩过度修饰词、让对白更像真人、让叙述更像成熟网文作者。只输出修改稿。",
  },
  {
    key: "check",
    label: "错AI检查",
    icon: "🔍",
    prompt:
      "请全面检查当前内容里的错别字、逻辑问题、人设矛盾、时间线错误、重复表达和明显 AI 腔，逐条列出问题并给出修复建议。",
  },
  {
    key: "control-card",
    label: "控制卡",
    icon: "📌",
    prompt:
      "请把当前章节/章纲整理成下一步写作可执行的【章节控制卡】。输出：本章使命、必须推进、必须保留、可延后、禁止越界、出场人物职责、活跃伏笔、信息边界、情绪落点、章末钩子、失败风险。要求具体可写，不要空泛理论。",
  },
  {
    key: "acceptance-gate",
    label: "接收闸门",
    icon: "✅",
    prompt:
      "请把当前章节当作待接收稿进行【章节接收闸门】审查。按通过/局部修补/整章重写/需要重规划四档判断，并输出：缺失义务、断裂的人物或伏笔、可局部替换的原文片段、修复建议、最终分数。不要泛泛表扬。",
  },
  {
    key: "writeback",
    label: "状态回灌",
    icon: "🔁",
    prompt:
      "请从当前章节提取写后需要回灌到项目文件的状态变化。输出：角色状态变化、关系变化、获得/失去的物品资源、地点时间变化、伏笔新增/推进/回收、读者已知信息、下一章必须继承的边界。只提取会影响后续写作的信息。",
  },
];

export const editorTools = [
  { key: "expand", label: "扩写", prompt: "请把以下文本扩写得更生动详细，保持网文风格，增加细节描写和动作描写：\n\n" },
  { key: "shrink", label: "缩写", prompt: "请把以下文本精简浓缩，保留核心信息，去掉冗余，保持网文流畅感：\n\n" },
  { key: "rewrite", label: "改写", prompt: "请把以下文本改写一遍，保持原意但用不同表达，提升网感：\n\n" },
  { key: "de-ai-selected", label: "去AI味", prompt: "请把以下文本去掉 AI 痕迹，去除机械句式和空泛抒情，让它读起来像成熟网文作者写的：\n\n" },
  { key: "polish", label: "润色", prompt: "请润色以下文本，提升语言质感，但不改变原意：\n\n" },
  { key: "continue", label: "续写", prompt: "请按下面文本的风格和节奏继续往下写 500 字左右：\n\n" },
];

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Novelsmith storage write failed:", key, error);
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key } }));
    return false;
  }
}

export function loadCustomPrompts(): PromptTemplate[] {
  return loadJSON<PromptTemplate[]>(CUSTOM_PROMPTS_KEY, []).map(normalizePromptTemplate);
}

export function saveCustomPrompts(promptsList: PromptTemplate[]) {
  saveJSON(CUSTOM_PROMPTS_KEY, promptsList.map(normalizePromptTemplate));
}

export function wordCount(text: string) {
  const clean = htmlToPlainText(text);
  const chinese = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (clean.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length;
  return { chinese, english, total: chinese + english };
}

export function summarizeContent(text: string) {
  const clean = htmlToPlainText(text).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.slice(0, 100) + (clean.length > 100 ? "..." : "");
}

export function htmlToPlainText(input: string) {
  if (!input) return "";

  const withLineBreaks = input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");

  const decoded = withLineBreaks
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");

  return decoded
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const AI_WORDS_KEY = "novelsmith-ai-words";
const PROMPT_USAGE_KEY = "novelsmith-prompt-usage";

export const DEFAULT_AI_WORDS = [
  "不禁", "仿佛", "缓缓", "淡淡", "忽然", "顿时", "忍不住", "似乎",
  "目光", "嘴角", "下一刻", "深吸一口气", "良久", "骤然", "宛如",
  "霎时间", "刹那间", "不由得", "蓦地", "顷刻", "陡然",
];

export function loadAiWords(): string[] {
  return loadJSON<string[]>(AI_WORDS_KEY, DEFAULT_AI_WORDS);
}

export function saveAiWords(words: string[]) {
  saveJSON(AI_WORDS_KEY, words);
}

export function detectAiWords(text: string, wordsList: string[]) {
  if (!wordsList || wordsList.length === 0) return [];
  return wordsList.filter((w) => text.includes(w));
}

export function loadPromptUsage(): Record<string, number> {
  return loadJSON<Record<string, number>>(PROMPT_USAGE_KEY, {});
}

export function recordPromptUsage(promptId: string) {
  const usage = loadPromptUsage();
  usage[promptId] = (usage[promptId] || 0) + 1;
  saveJSON(PROMPT_USAGE_KEY, usage);
}

export function extractPromptParams(content: string) {
  const found = [...content.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
  return [...new Set(found)].filter(Boolean);
}

export function substituteParams(content: string, values: Record<string, string>) {
  return content.replace(/\[([^\]]+)\]/g, (_, key: string) => {
    const val = values[key.trim()];
    return val?.trim() ? val : `[${key}]`;
  });
}

export interface SkillMetadata {
  primarySkill: string;
  skillTags: string[];
  validationLayers: string[];
}

export const DEFAULT_VALIDATION_LAYERS = [
  "输入完整性：确认任务目标、类型、平台、字数、阶段和禁忌是否明确；不明确时先补问或按上下文补齐。",
  "Skill 命中：检查所选 Skill 和蒸馏是否匹配当前任务；不匹配时只取通用机制，不强行套用。",
  "结构验证：输出必须有目标、阻力、推进、回报、钩子或可执行步骤，不能只给空泛建议。",
  "风格验证：只模仿形，不复刻魂；学习节奏、冲突、信息释放和情绪曲线，不复写原句、专有设定和标志性桥段。",
  "人物验证：角色要有欲望、处境、选择和代价，不能只有标签化人设。",
  "生成性验证：结果必须能直接写入大纲、正文、章节结尾、反转或修改清单。",
  "边界验证：发现过度复刻、逻辑断裂、AI 腔、平台不适配或读者承诺不兑现时，先重写再输出最终稿。",
];

const CATEGORY_PRIMARY_SKILL: Record<string, string> = {
  黄金三章: "开篇留存",
  书名简介: "卖点包装",
  番茄专项: "番茄平台适配",
  角色设定: "人物驱动",
  大纲设计: "长线结构",
  场景描写: "场景表现",
  "战斗/打脸": "冲突爽点",
  章末留扣: "章节钩子",
  金手指设计: "升级引擎",
  各类型专项: "类型公式",
  拆书分析: "机制拆解",
  情绪流与关系: "情绪循环",
  卡文急救: "续写推进",
  对话写作: "对话驱动",
  世界观设定: "世界观引擎",
  伏笔管理: "悬念引擎",
  高光场景: "情绪爆点",
  AI工作流: "AI 写作流程",
  "AI 网文工作流": "网文工作流",
  平台特化: "平台读者承诺",
  毒点防御: "质量防线",
  节奏切割: "节奏控制",
  网感消痕: "文本去 AI 味",
  设定校验: "一致性校验",
  开书向导: "开书系统",
  爆款评估: "商业性评估",
  读者反馈: "读者视角",
  中后期规划: "中后期续航",
  短剧短篇: "短篇强钩子",
};

const KEYWORD_TAG_RULES: Array<[RegExp, string]> = [
  [/黄金|第一章|开局|前三章/, "黄金开局"],
  [/番茄|免费文|完读|追读/, "番茄节奏"],
  [/起点|男频|升级|金手指/, "男频升级"],
  [/晋江|女频|情感|暧昧|拉扯/, "女频情感"],
  [/角色|人物|人设|主角|反派/, "人物塑造"],
  [/大纲|卷纲|细纲|结构/, "结构设计"],
  [/钩子|留扣|悬念|伏笔|反转/, "悬念钩子"],
  [/打脸|战斗|爽点|压迫|冲突/, "冲突爽点"],
  [/对话|对白|台词/, "对话驱动"],
  [/世界观|设定|势力|体系/, "世界观"],
  [/去AI|AI味|润色|改写|消痕/, "文本优化"],
  [/短剧|短篇|小程序/, "短篇转化"],
];

function normalizeSkillLine(text: string) {
  return text
    .replace(/^【|】$/g, "")
    .replace(/^[\s\-*•\d.、]+/, "")
    .trim();
}

function splitMetadataList(text: string) {
  return text
    .split(/[、,，/|;；]+/)
    .map(normalizeSkillLine)
    .filter(Boolean);
}

function extractInlineValue(lines: string[], labels: string[]) {
  for (const line of lines) {
    const clean = line.trim();
    for (const label of labels) {
      const pattern = new RegExp(`^(?:【)?${label}(?:】)?[：:](.+)$`);
      const match = clean.match(pattern);
      if (match) return match[1].trim();
    }
  }
  return "";
}

function extractSectionItems(lines: string[], labels: string[]) {
  const start = lines.findIndex((line) => labels.some((label) => {
    const clean = line.trim();
    return clean.startsWith(`【${label}】`) || clean.startsWith(`${label}：`) || clean.startsWith(`${label}:`);
  }));
  if (start < 0) return [] as string[];
  const items: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) {
      if (items.length) break;
      continue;
    }
    if (/^【.+】$/.test(raw) && items.length) break;
    const bullet = raw.match(/^(?:\d+[.、]|[-*•])\s*(.+)$/);
    if (bullet) {
      items.push(normalizeSkillLine(bullet[1]));
      continue;
    }
    if (/^[^：:]{1,12}[：:]/.test(raw) && items.length) break;
    if (items.length) items.push(normalizeSkillLine(raw));
  }
  return items.filter(Boolean);
}

export function parseSkillMetadata(content: string): SkillMetadata {
  const lines = content.split(/\r?\n/);
  const primarySkill = extractInlineValue(lines, ["主技能", "核心技能", "技能定位", "适配技能"]);
  const tagLine = extractInlineValue(lines, ["技能标签", "技能分类", "标签", "适配标签", "风格标签"]);
  const validationLine = extractInlineValue(lines, ["验证层", "验证", "校验层", "自检"]);
  const validationLayers = extractSectionItems(lines, ["验证层", "验证", "校验层", "自检"]);
  const skillTags = tagLine ? splitMetadataList(tagLine) : [];
  const inlineValidationLayers = validationLine ? splitMetadataList(validationLine) : [];
  return {
    primarySkill: normalizeSkillLine(primarySkill),
    skillTags: [...new Set(skillTags)],
    validationLayers: [...new Set(validationLayers.length ? validationLayers : inlineValidationLayers)],
  };
}

function inferPromptSkillMetadata(prompt: PromptTemplate): Pick<SkillMetadata, "primarySkill" | "skillTags"> {
  const primarySkill = CATEGORY_PRIMARY_SKILL[prompt.category] || prompt.category || "通用写作 Skill";
  const haystack = [prompt.title, prompt.category, prompt.description || "", prompt.content || ""].join(" ");
  const tags = new Set<string>();
  if (prompt.category) tags.add(prompt.category);
  KEYWORD_TAG_RULES.forEach(([pattern, tag]) => {
    if (pattern.test(haystack)) tags.add(tag);
  });
  return {
    primarySkill,
    skillTags: [...tags].slice(0, 8),
  };
}

export function normalizePromptTemplate(prompt: PromptTemplate) {
  const meta = parseSkillMetadata(prompt.content || "");
  const inferred = inferPromptSkillMetadata(prompt);
  return {
    ...prompt,
    primarySkill: prompt.primarySkill || meta.primarySkill || inferred.primarySkill,
    skillTags: prompt.skillTags?.length ? prompt.skillTags : (meta.skillTags.length ? meta.skillTags : inferred.skillTags),
    validationLayers: prompt.validationLayers?.length ? prompt.validationLayers : (meta.validationLayers.length ? meta.validationLayers : DEFAULT_VALIDATION_LAYERS),
  };
}

export function formatNovelText(text: string) {
  return text
    .replace(/。/g, "。\n")
    .replace(/！/g, "！\n")
    .replace(/？/g, "？\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function iconForCategory(category: string) {
  return categoryIconMap[category] ?? "🗂️";
}

export interface ChatSession {
  id: string;
  title: string;
  messages: { role: "user" | "assistant" | "system"; content: ChatContent }[];
  updatedAt: number;
}

export interface AIResult {
  id: string;
  title: string;
  source: string;
  content: string;
  createdAt: number;
  type: "tool" | "editor" | "manual";
}

export type ContextMenuState =
  | { x: number; y: number; type: "file"; fileId: string }
  | { x: number; y: number; type: "category"; category: string };

export interface RecycledFile {
  id: string;
  type: "file" | "book";
  title: string;
  data: unknown;
  deletedAt: number;
}

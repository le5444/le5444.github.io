import { prompts as builtInPrompts } from "../data/prompts";
import type { PromptTemplate, WorkspaceFile } from "../store/workspace";
import { htmlToPlainText, normalizePromptTemplate, parseSkillMetadata } from "./helpers";

export interface AgentMemoryShard {
  id: string;
  fileId: string;
  category: string;
  title: string;
  kind: "canon" | "state" | "outline" | "character" | "world" | "knowledge" | "chapter";
  summary: string;
  keywords: string[];
  anchors: string[];
  updatedAt: number;
  charCount: number;
}

export interface RankedMemoryShard extends AgentMemoryShard {
  score: number;
  reason: string[];
}

export interface RoutedAgentSkill {
  prompt: PromptTemplate;
  score: number;
  reason: string[];
}

export interface AgentIntentPlan {
  intent: "continue" | "review" | "rewrite" | "plan" | "writeback" | "memory_audit" | "chat";
  tools: string[];
  queryTerms: string[];
  contextMode: "lean" | "balanced" | "deep";
}

const MEMORY_CATEGORIES = new Set(["个人OS", "项目底本", "剧情大纲", "反崩盘", "设定", "角色", "组织势力", "知识库", "主要内容"]);
const IMPORTANT_TITLE_TERMS = ["SOUL.md", "COORDINATOR.md", "MEMORY.md", "KAIROS.md", "BRIDGE.md", "Coordinator", "Goal Mode", "MCP", "Gateway", "bridge-request", "执行桥", "工具观察", "项目任务", "长期目标", "开书控制卡", "故事底本", "续写卡", "伏笔账本", "章纲", "节拍", "文风", "世界观", "主角", "角色", "反派", "控制卡"];
const STOP_TERMS = new Set(["请", "帮我", "一下", "这个", "那个", "现在", "需要", "内容", "小说", "章节", "正文", "输出", "不要"]);

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function classifyMemory(file: WorkspaceFile): AgentMemoryShard["kind"] {
  const text = `${file.category} ${file.title}`;
  if (file.category === "个人OS" && /SOUL|身份|偏好|边界/.test(text)) return "canon";
  if (file.category === "个人OS" && /COORDINATOR|Coordinator|Goal Mode|MEMORY|KAIROS|BRIDGE|MCP|Gateway|bridge-request|记忆|工具观察|任务|长期目标|执行器|执行桥|编排器|闸门/.test(text)) return "state";
  if (file.category === "项目底本" || /底本|控制卡|开书/.test(text)) return "canon";
  if (file.category === "反崩盘" || /续写卡|状态|伏笔账本|约束|边界/.test(text)) return "state";
  if (file.category === "剧情大纲" || /大纲|章纲|节拍|主线|分卷/.test(text)) return "outline";
  if (file.category === "角色" || /主角|配角|反派|人物|角色/.test(text)) return "character";
  if (file.category === "设定" || file.category === "组织势力" || /世界|势力|规则|组织/.test(text)) return "world";
  if (file.category === "主要内容") return "chapter";
  return "knowledge";
}

export function extractAgentTerms(text: string) {
  const normalized = htmlToPlainText(text || "")
    .replace(/[，。！？、；："'“”‘’（）()[\]{}<>《》【】\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) return [];
  const terms: string[] = [];
  for (const raw of normalized.split(" ")) {
    const term = raw.trim();
    if (term.length < 2 || STOP_TERMS.has(term)) continue;
    terms.push(term);
    if (/[\u4e00-\u9fff]/.test(term) && term.length >= 6) {
      terms.push(term.slice(0, 4));
      terms.push(term.slice(-4));
    }
  }
  return unique(terms).slice(0, 120);
}

function extractAnchors(text: string) {
  const lines = htmlToPlainText(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .filter((line) => /^(#{1,3}\s*)?[\u4e00-\u9fffA-Za-z0-9].{0,48}[:：]?$/.test(line) || /^[\-*]\s/.test(line))
    .slice(0, 8);
}

function makeSummary(file: WorkspaceFile, plain: string) {
  const summary = htmlToPlainText(file.summary || "").trim();
  if (summary) return summary.slice(0, 360);
  const anchors = extractAnchors(plain);
  const first = plain.replace(/\s+/g, " ").trim().slice(0, 360);
  return anchors.length ? `${anchors.slice(0, 4).join("；")}\n${first}`.slice(0, 520) : first;
}

export function buildAgentMemoryIndex(files: WorkspaceFile[], selectedFileId: string | null): AgentMemoryShard[] {
  return files
    .filter((file) => MEMORY_CATEGORIES.has(file.category))
    .map((file) => {
      const plain = htmlToPlainText(file.content || "");
      const source = `${file.category} ${file.title} ${file.summary || ""} ${plain.slice(0, 3000)}`;
      return {
        id: `${file.id}:${file.updatedAt}`,
        fileId: file.id,
        category: file.category,
        title: file.title,
        kind: classifyMemory(file),
        summary: makeSummary(file, plain),
        keywords: extractAgentTerms(source).slice(0, 36),
        anchors: extractAnchors(plain),
        updatedAt: file.updatedAt,
        charCount: plain.length,
      };
    })
    .filter((memory) => memory.fileId !== selectedFileId && (memory.summary || memory.keywords.length || memory.anchors.length));
}

export function planAgentIntent(raw: string, currentText: string): AgentIntentPlan {
  const text = `${raw}\n${currentText.slice(-1200)}`;
  const queryTerms = extractAgentTerms(text);
  if (/回灌|状态|伏笔账本|写后|同步|更新记忆/.test(raw)) {
    return { intent: "writeback", tools: ["状态回灌", "伏笔账本更新", "信息边界检查"], queryTerms, contextMode: "balanced" };
  }
  if (/审稿|检查|闸门|接收|评分|问题|毒点|AI味|逻辑/.test(raw)) {
    return { intent: "review", tools: ["接收闸门", "一致性检查", "AI腔扫描"], queryTerms, contextMode: "deep" };
  }
  if (/改写|润色|修文|重写|去AI|消痕/.test(raw)) {
    return { intent: "rewrite", tools: ["局部改写", "去AI味", "文风保护"], queryTerms, contextMode: "balanced" };
  }
  if (/大纲|章纲|开书|设定|角色|世界观|规划|拆章|节拍/.test(raw)) {
    return { intent: "plan", tools: ["规划", "控制卡", "图谱查漏"], queryTerms, contextMode: "deep" };
  }
  if (/记忆|图谱|查漏|冷线|矛盾|关系|遗忘/.test(raw)) {
    return { intent: "memory_audit", tools: ["故事图谱查漏", "冷线召回", "关系审计"], queryTerms, contextMode: "deep" };
  }
  if (/续写|继续|往下写|下一章|下一段/.test(raw)) {
    return { intent: "continue", tools: ["续写", "章节控制卡", "章末钩子"], queryTerms, contextMode: "balanced" };
  }
  return { intent: "chat", tools: ["问答", "上下文检索"], queryTerms, contextMode: "lean" };
}

export function selectAgentMemoryShards(params: {
  files: WorkspaceFile[];
  selectedFileId: string | null;
  associatedFileIds: string[];
  raw: string;
  currentText: string;
  maxShards?: number;
}) {
  const maxShards = params.maxShards ?? 8;
  const plan = planAgentIntent(params.raw, params.currentText);
  const associated = new Set(params.associatedFileIds);
  const memories = buildAgentMemoryIndex(params.files, params.selectedFileId);
  const ranked = memories
    .filter((memory) => !associated.has(memory.fileId))
    .map((memory): RankedMemoryShard => {
      const reason: string[] = [];
      let score = 0;
      const haystack = `${memory.category} ${memory.title} ${memory.summary} ${memory.keywords.join(" ")}`.toLowerCase();

      if (memory.kind === "canon") { score += 7; reason.push("项目真值"); }
      if (memory.kind === "state") { score += 6; reason.push("动态状态"); }
      if (plan.intent === "plan" && memory.kind === "outline") { score += 8; reason.push("规划相关"); }
      if (plan.intent === "continue" && (memory.kind === "state" || memory.kind === "outline")) { score += 6; reason.push("续写相关"); }
      if (plan.intent === "review" && (memory.kind === "state" || memory.kind === "character")) { score += 5; reason.push("审稿约束"); }
      if (plan.intent === "memory_audit" && ["state", "character", "world"].includes(memory.kind)) { score += 7; reason.push("图谱节点"); }
      if (plan.intent === "writeback" && memory.kind === "state") { score += 8; reason.push("回灌目标"); }
      IMPORTANT_TITLE_TERMS.forEach((term) => {
        if (memory.title.includes(term)) { score += 4; reason.push(term); }
      });
      plan.queryTerms.forEach((term) => {
        if (haystack.includes(term)) score += term.length >= 4 ? 3 : 1;
      });
      if (Date.now() - memory.updatedAt < 7 * 24 * 60 * 60 * 1000) {
        score += 1;
        reason.push("近期更新");
      }
      return { ...memory, score, reason: unique(reason).slice(0, 5) };
    })
    .filter((memory) => memory.score > 0)
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, maxShards);

  return { plan, memories: ranked };
}

export function selectAgentSkills(params: {
  raw: string;
  currentText: string;
  customPrompts: PromptTemplate[];
  selectedPromptIds: string[];
  maxSkills?: number;
}) {
  const plan = planAgentIntent(params.raw, params.currentText);
  const terms = new Set([...plan.queryTerms, plan.intent, ...plan.tools.map((tool) => tool.toLowerCase())]);
  const manual = new Set(params.selectedPromptIds);
  const merged = new Map<string, PromptTemplate>();
  builtInPrompts.forEach((prompt) => merged.set(prompt.id, normalizePromptTemplate({ ...prompt, builtIn: true })));
  params.customPrompts.forEach((prompt) => merged.set(prompt.id, normalizePromptTemplate({ ...prompt, builtIn: false })));

  return Array.from(merged.values())
    .filter((prompt) => !manual.has(prompt.id))
    .map((prompt): RoutedAgentSkill => {
      const meta = parseSkillMetadata(prompt.content || "");
      const tags = prompt.skillTags?.length ? prompt.skillTags : meta.skillTags;
      const haystack = `${prompt.title} ${prompt.category} ${tags.join(" ")} ${prompt.primarySkill || meta.primarySkill || ""} ${(prompt.content || "").slice(0, 1200)}`.toLowerCase();
      const reason: string[] = [];
      let score = 0;
      if (prompt.category === "长篇生产链") { score += 5; reason.push("长篇生产链"); }
      if (prompt.category === "反崩盘工作流" && ["review", "writeback", "memory_audit"].includes(plan.intent)) { score += 5; reason.push("反崩盘"); }
      if (prompt.category === "开书向导" && plan.intent === "plan") { score += 5; reason.push("开书规划"); }
      if (/续写|continue/.test(haystack) && plan.intent === "continue") { score += 6; reason.push("续写"); }
      if (/接收|审稿|检查|review|闸门/.test(haystack) && plan.intent === "review") { score += 6; reason.push("审稿"); }
      if (/回灌|状态|伏笔账本|writeback/.test(haystack) && plan.intent === "writeback") { score += 6; reason.push("回灌"); }
      if (/图谱|记忆|查漏|冷线/.test(haystack) && plan.intent === "memory_audit") { score += 6; reason.push("图谱记忆"); }
      terms.forEach((term) => {
        if (term && haystack.includes(String(term).toLowerCase())) score += String(term).length >= 4 ? 2 : 1;
      });
      return { prompt, score, reason: unique(reason).slice(0, 4) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, params.maxSkills ?? 2);
}

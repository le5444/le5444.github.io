import { htmlToPlainText, uid } from "./helpers";

export type AutoDreamDimension =
  | "identity"
  | "preference"
  | "project"
  | "episode"
  | "skill"
  | "tool";

export interface AutoDreamL1Event {
  id: string;
  at: number;
  dimension: AutoDreamDimension;
  source: string;
  title: string;
  content: string;
  tags: string[];
  salience: number;
}

export interface AutoDreamL2Memory {
  id: string;
  at: number;
  dimension: AutoDreamDimension;
  title: string;
  summary: string;
  evidence: string[];
  tags: string[];
  confidence: "low" | "medium" | "high";
}

const DIMENSION_LABELS: Record<AutoDreamDimension, string> = {
  identity: "身份/边界",
  preference: "偏好",
  project: "项目",
  episode: "事件",
  skill: "技能",
  tool: "工具观察",
};

function cleanText(text: string) {
  return htmlToPlainText(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstUsefulLine(text: string, fallback: string) {
  const line = cleanText(text)
    .split(/[。！？.!?]\s*/)
    .map((item) => item.trim())
    .find((item) => item.length >= 8);
  return (line || fallback).slice(0, 180);
}

function tagText(text: string) {
  const tags: string[] = [];
  const rules: Array<[RegExp, string]> = [
    [/小说|章节|正文|人物|世界观|大纲|伏笔|写作|创作/, "writing"],
    [/代码|构建|测试|组件|typescript|react|vite|github|codex|claude/i, "coding"],
    [/记忆|memory|soul|autodream|长期|偏好/i, "memory"],
    [/工具|tool|shell|命令|浏览器|mcp/i, "tool-use"],
    [/安全|权限|泄露|密钥|密码|审批|风险/, "safety"],
    [/计划|项目|里程碑|验收|进度/, "project"],
  ];
  rules.forEach(([pattern, tag]) => {
    if (pattern.test(text)) tags.push(tag);
  });
  return Array.from(new Set(tags)).slice(0, 8);
}

export function classifyAutoDreamDimension(text: string, source = ""): AutoDreamDimension {
  const haystack = `${source}\n${text}`;
  if (/SOUL|身份|边界|原则|不可|安全|权限/i.test(haystack)) return "identity";
  if (/偏好|喜欢|以后|长期|习惯|风格/i.test(haystack)) return "preference";
  if (/skill|技能|挂载|路由|prompt/i.test(haystack)) return "skill";
  if (/工具|tool|命令|shell|浏览器|mcp|验证|构建/i.test(haystack)) return "tool";
  if (/项目|目标|阶段|里程碑|验收|Personal OS|KAIROS|AutoDream/i.test(haystack)) return "project";
  return "episode";
}

export function createAutoDreamEvent(params: {
  source: string;
  title: string;
  content: string;
  dimension?: AutoDreamDimension;
  tags?: string[];
  salience?: number;
  at?: number;
}): AutoDreamL1Event {
  const content = cleanText(params.content);
  const sourceText = `${params.source}\n${params.title}\n${content}`;
  return {
    id: uid(),
    at: params.at ?? Date.now(),
    dimension: params.dimension ?? classifyAutoDreamDimension(sourceText, params.source),
    source: params.source,
    title: params.title.slice(0, 80),
    content: content.slice(0, 1200),
    tags: Array.from(new Set([...(params.tags || []), ...tagText(sourceText)])).slice(0, 10),
    salience: params.salience ?? Math.min(10, Math.max(1, Math.ceil(content.length / 240))),
  };
}

export function compressL1ToL2(events: AutoDreamL1Event[], now = Date.now()): AutoDreamL2Memory[] {
  const grouped = new Map<AutoDreamDimension, AutoDreamL1Event[]>();
  events.forEach((event) => {
    if (!event.content.trim()) return;
    grouped.set(event.dimension, [...(grouped.get(event.dimension) || []), event]);
  });

  return Array.from(grouped.entries()).map(([dimension, items]) => {
    const sorted = items.slice().sort((a, b) => b.salience - a.salience || b.at - a.at);
    const tags = Array.from(new Set(sorted.flatMap((item) => item.tags))).slice(0, 10);
    const evidence = sorted.slice(0, 4).map((item) => `${item.source}: ${firstUsefulLine(item.content, item.title)}`);
    const summary = evidence.map((item) => item.replace(/^[^:]+:\s*/, "")).join("；").slice(0, 420);
    return {
      id: uid(),
      at: now,
      dimension,
      title: `${DIMENSION_LABELS[dimension]}沉淀`,
      summary: summary || `${DIMENSION_LABELS[dimension]}暂无足够内容。`,
      evidence,
      tags,
      confidence: sorted.length >= 3 ? "high" : sorted.length >= 2 ? "medium" : "low",
    };
  });
}

export function dreamConsolidate(entries: AutoDreamL2Memory[], now = Date.now()): AutoDreamL2Memory[] {
  const grouped = new Map<string, AutoDreamL2Memory[]>();
  entries.forEach((entry) => {
    const key = `${entry.dimension}:${entry.tags.slice(0, 3).join(",") || "general"}`;
    grouped.set(key, [...(grouped.get(key) || []), entry]);
  });

  return Array.from(grouped.values()).map((items) => {
    if (items.length === 1) return items[0];
    const first = items[0];
    const evidence = Array.from(new Set(items.flatMap((item) => item.evidence))).slice(0, 6);
    const tags = Array.from(new Set(items.flatMap((item) => item.tags))).slice(0, 10);
    return {
      ...first,
      id: uid(),
      at: now,
      summary: items.map((item) => item.summary).join("；").slice(0, 520),
      evidence,
      tags,
      confidence: items.some((item) => item.confidence === "high") ? "high" : "medium",
    };
  });
}

export function renderAutoDreamMarkdown(params: {
  events: AutoDreamL1Event[];
  memories: AutoDreamL2Memory[];
  at?: number;
}) {
  const at = new Date(params.at ?? Date.now()).toLocaleString();
  const l1 = params.events
    .map((event) => `- [${DIMENSION_LABELS[event.dimension]}] ${event.title}｜tags=${event.tags.join(",") || "-"}｜${event.content.slice(0, 220)}`)
    .join("\n");
  const l2 = params.memories
    .map((memory) => {
      const evidence = memory.evidence.map((item) => `  - ${item}`).join("\n");
      return `- [${DIMENSION_LABELS[memory.dimension]}] ${memory.title}｜confidence=${memory.confidence}｜tags=${memory.tags.join(",") || "-"}\n  摘要：${memory.summary}\n  证据：\n${evidence || "  - -"}`;
    })
    .join("\n");

  return `\n\n---\n\n## AutoDream ${at}\n\n### L1 工作记忆\n${l1 || "- 无"}\n\n### L2 长期沉淀\n${l2 || "- 无"}\n`;
}

export function appendAutoDreamMarkdown(existingContent: string, params: {
  events: AutoDreamL1Event[];
  memories?: AutoDreamL2Memory[];
  at?: number;
}) {
  const memories = params.memories ?? dreamConsolidate(compressL1ToL2(params.events, params.at), params.at);
  const base = existingContent?.trim()
    ? existingContent.trim()
    : "## L1 工作记忆\n\n- 当前活跃目标、最近决策、工具观察。\n\n## L2 长期记忆\n\n- 经用户确认后沉淀的项目事实、偏好、技能和复盘。";
  return `${base}${renderAutoDreamMarkdown({ events: params.events, memories, at: params.at })}`;
}

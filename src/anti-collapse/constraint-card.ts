// 约束卡生成器：写作前的执行合同
// 把 L1-L7 七层约束（核心承诺 / 本章细纲 / 出场人物指纹 / 已用技能与时间线 / 活跃伏笔 / 风格参数 / 硬禁忌）
// 拼装成一份"AI 必须遵守、人类可审核"的写前合同。
import type {
  ConstraintCard,
  CharacterFingerprint,
  ObligationEntry,
  WorldAxiom,
} from "./types";
import type { MemoryStore } from "./memory-tier";
import { buildFingerprintBriefing } from "./voice-fingerprint";

export interface ConstraintCardInput {
  bookId: string;
  chapter: number;
  coreSeed: string;
  chapterOutline: string;
  beatPlan: string[];
  targetWordCount: number;
  onStageCharacters: CharacterFingerprint[];
  povCharacter: string;
  narrativeDistance?: "close" | "medium" | "far";
  paragraphStyle?: "short-burst" | "mixed" | "long-immersive";
  exclamationDensity?: "low" | "medium" | "high";
  extraHardConstraints?: string[];
  memory: MemoryStore;
}

export function buildConstraintCard(input: ConstraintCardInput): ConstraintCard {
  const {
    bookId,
    chapter,
    coreSeed,
    chapterOutline,
    beatPlan,
    targetWordCount,
    onStageCharacters,
    povCharacter,
    narrativeDistance = "close",
    paragraphStyle = "mixed",
    exclamationDensity = "low",
    extraHardConstraints = [],
    memory,
  } = input;

  // L4 已用技能：扫描前面章节摘要的 growthDelta / beats 找技能名（简化版：直接传 skillUsageLog 由调用方维护）
  const skillUsageLog: string[] = [];
  memory.chapterSummaries
    .filter((s) => s.chapter < chapter)
    .forEach((s) => {
      if (s.growthDelta) skillUsageLog.push(`[第${s.chapter}章] ${s.growthDelta}`);
    });

  // L4 时间线锁：金/银 trust 的时间线条目
  const timelineLocks = memory.timeline
    .filter((t) => t.trust === "gold" || t.trust === "silver")
    .map((t) => `[第${t.chapter}章·${t.inStoryTime}] ${t.event}`);

  // L5 活跃伏笔
  const activeObligations: ObligationEntry[] = memory.obligations.filter(
    (o) => o.status === "active",
  );

  // L7 硬禁忌：默认 + 信息边界 + 用户补充
  const hardConstraints: string[] = [
    "禁止使用「总之/归根结底/这意味着/换言之/事实证明」等总结性陈述。",
    "禁止「这是因为/原因在于/本质上讲」等分析式旁白；让人物自己在场景里揭示。",
    "禁止直接命名情绪（如「他很愤怒」「她非常悲伤」）；用具体动作+身体反应替代，且避免拳头紧握/下巴绷紧/瞳孔骤缩等套式动作。",
    "禁止连续 3 段使用相同的字开头。",
    "禁止「X的Y的Z的某某」连用 3 个以上形容词。",
    "禁止「眼中闪过/心中暗想/不是A而是B」等网文 AI 腔。",
    "禁止角色知道他/她在本章前未在文本中出现过的信息（除非约束卡明确允许）。",
  ];

  // 注入"信息边界"：每个角色 stateSnapshot 中的 unknownInformation
  onStageCharacters.forEach((c) => {
    const u = c.stateSnapshot?.unknownInformation || [];
    u.forEach((info) => {
      hardConstraints.push(`${c.name} 在本章不应知道：${info}（违反 = P0 拦截）`);
    });
  });

  // 注入金/银世界圣典作为硬约束
  memory.worldAxioms
    .filter((a: WorldAxiom) => a.trust === "gold")
    .forEach((a) => {
      hardConstraints.push(`【世界宪法·${a.category}】${a.rule}`);
    });

  hardConstraints.push(...extraHardConstraints);

  return {
    bookId,
    chapter,
    generatedAt: Date.now(),
    coreSeed,
    chapterOutline,
    beatPlan,
    targetWordCount,
    onStageCharacters,
    skillUsageLog,
    timelineLocks,
    activeObligations,
    povCharacter,
    narrativeDistance,
    paragraphStyle,
    exclamationDensity,
    hardConstraints,
  };
}

// 把约束卡渲染成可丢给 AI 的系统/用户提示文本
export function renderConstraintCard(card: ConstraintCard): string {
  const lines: string[] = [];

  lines.push("════════════════════════════════════════");
  lines.push(`【约束卡 · 第 ${card.chapter} 章 · 写前合同】`);
  lines.push("════════════════════════════════════════");
  lines.push("");

  lines.push("【L1 · 核心承诺（贯穿全书）】");
  lines.push(card.coreSeed || "（未设定）");
  lines.push("");

  lines.push("【L2 · 本章细纲与节拍】");
  lines.push(card.chapterOutline);
  if (card.beatPlan.length) {
    lines.push("节拍计划：");
    card.beatPlan.forEach((b, i) => lines.push(`  ${i + 1}. ${b}`));
  }
  lines.push(`目标字数：约 ${card.targetWordCount} 字`);
  lines.push("");

  lines.push("【L3 · 出场角色与指纹】");
  if (card.onStageCharacters.length) {
    card.onStageCharacters.forEach((c) => {
      lines.push(buildFingerprintBriefing(c));
      lines.push("");
    });
  } else {
    lines.push("（未指定出场角色）");
    lines.push("");
  }

  lines.push("【L4 · 已用技能 / 时间线锁定】");
  if (card.skillUsageLog.length) {
    lines.push("已用技能（同一招式不可重复用得太频繁、技能不可「突然遗忘」）：");
    card.skillUsageLog.slice(-10).forEach((s) => lines.push(`  - ${s}`));
  } else {
    lines.push("（无已用技能日志）");
  }
  if (card.timelineLocks.length) {
    lines.push("时间线锁（不可逆事件，违反 = P0 拦截）：");
    card.timelineLocks.slice(-15).forEach((t) => lines.push(`  - ${t}`));
  }
  lines.push("");

  lines.push("【L5 · 活跃伏笔（必须在合适时机兑现，超期会标红）】");
  if (card.activeObligations.length) {
    card.activeObligations.forEach((o) => {
      lines.push(
        `  - [${o.type}] 第${o.setupChapter}章设：${o.setupText}` +
          (o.expectedPayoffChapter ? `（预计第${o.expectedPayoffChapter}章兑现）` : ""),
      );
    });
  } else {
    lines.push("（暂无活跃伏笔）");
  }
  lines.push("");

  lines.push("【L6 · 风格参数】");
  lines.push(`- 视角人物：${card.povCharacter || "未指定"}`);
  lines.push(`- 叙事距离：${distanceLabel(card.narrativeDistance)}`);
  lines.push(`- 段落节奏：${paragraphLabel(card.paragraphStyle)}`);
  lines.push(`- 感叹号密度：${exclamationLabel(card.exclamationDensity)}`);
  lines.push("");

  lines.push("【L7 · 硬禁忌（违反任意一条均视为本章失败）】");
  card.hardConstraints.forEach((h, i) => lines.push(`  ${i + 1}. ${h}`));
  lines.push("");

  lines.push("════════════════════════════════════════");
  lines.push("写作执行口令：严格按上述合同写作。优先展现而非告知，优先动作而非情绪命名，优先具体而非抽象。");
  lines.push("════════════════════════════════════════");

  return lines.join("\n");
}

function distanceLabel(d: ConstraintCard["narrativeDistance"]): string {
  return {
    close: "极近（贴角色内心，能闻见呼吸）",
    medium: "中距（旁观但不冷漠）",
    far: "远距（俯瞰，史官口吻）",
  }[d];
}

function paragraphLabel(p: ConstraintCard["paragraphStyle"]): string {
  return {
    "short-burst": "短句爆破（每段 1-2 句，节奏快）",
    mixed: "长短交错（默认）",
    "long-immersive": "长段沉浸（每段 4-8 句，气氛厚）",
  }[p];
}

function exclamationLabel(e: ConstraintCard["exclamationDensity"]): string {
  return {
    low: "低（全章 ≤2 个，仅在真正震惊处使用）",
    medium: "中（每千字 ≤1 个）",
    high: "高（情绪类型小说，每千字 2-3 个）",
  }[e];
}

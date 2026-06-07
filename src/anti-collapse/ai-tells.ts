// AI 腔扫描器 · 白泽 A2 五维量化 + tian-gong 套式动作库
// 核心理念：不只是查词表，而是查"是否在该克制时给了解释/在该悬置时给了答案"
import type { AiTellsReport } from "./types";

// 维度 1: 总结性陈述
const SUMMARIZING_TRIGGERS = [
  /总之[，。]/g,
  /归根结底/g,
  /这意味着/g,
  /换而言之|换言之/g,
  /简而言之/g,
  /(?:正|恰)是因为.+(?:所以|才)/g,
  /这就是.+的(?:原因|缘故|根本|本质)/g,
];

// 维度 2: 分析式旁白
const ANALYTIC_ASIDE_TRIGGERS = [
  /这是因为/g,
  /原因(?:在|就在)于/g,
  /本质上(?:讲|来说)?/g,
  /从某种(?:意义|程度)上(?:讲|来说)?/g,
  /事实(?:上|证明)/g,
  /(?:可以|不难)看出/g,
  /(?:这|那)正是.+的(?:写照|体现|象征)/g,
];

// 维度 3: 情绪标签（直接命名情绪）
const EMOTION_LABELS = [
  /(?:他|她|它|.{1,4})(?:很|十分|非常|极其|颇为|相当)(?:愤怒|生气|高兴|开心|悲伤|难过|害怕|恐惧|惊讶|震惊|无奈|绝望|兴奋|激动|平静|冷静|失望|羞愧|嫉妒|尴尬)/g,
  /心中(?:充满了|涌起|涌上)(?:.{1,6})(?:之意|之情|的情绪|的感觉)/g,
  /(?:复杂|矛盾)的情(?:感|绪)/g,
  /五味杂陈/g,
  /(?:.{1,4})的眼中(?:闪过|流露出)(?:一丝|一抹|一缕)/g,
];

// 维度 4: 过度修饰（同一名词被连用 ≥3 个形容词的近似检测）
function detectOverModifier(text: string): string[] {
  const samples: string[] = [];
  // 简化版：检测三连形容词模式 "ADJ的ADJ的ADJ的NOUN"
  const re = /([一-龥]{1,4}的){3,}[一-龥]{1,6}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    samples.push(m[0]);
    if (samples.length >= 5) break;
  }
  return samples;
}

// 维度 5: 句式重复（连续 3 段同结构开头）
function detectRepetitiveSyntax(text: string): string[] {
  const samples: string[] = [];
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  for (let i = 0; i < paras.length - 2; i++) {
    const head1 = paras[i].slice(0, 4);
    const head2 = paras[i + 1].slice(0, 4);
    const head3 = paras[i + 2].slice(0, 4);
    if (head1 && head1 === head2 && head2 === head3) {
      samples.push(`段 ${i + 1}-${i + 3} 同开头：「${head1}…」`);
      if (samples.length >= 4) break;
    }
  }
  return samples;
}

// 套式身体动作 · tian-gong stock-tells trap
// 这些不是查"是否出现"，而是查"出现频率过高"
const STOCK_TELLS = [
  "拳头紧握", "拳头攥紧", "手指紧握", "手紧紧攥", "握紧拳头",
  "下巴绷紧", "下颌绷紧", "牙关紧咬", "咬紧牙关",
  "心猛地一沉", "心狠狠一沉", "心脏猛地一跳", "心跳骤停",
  "胃部下坠", "胃里翻江倒海",
  "脊背一凉", "后背发凉", "脊柱一寒",
  "瞳孔骤缩", "瞳孔一缩", "眸光一闪",
  "嘴角抽搐", "嘴角一抽", "嘴角扯出",
  "深吸一口气", "吸了一口气", "猛吸一口气",
  "眉头紧锁", "眉头深锁", "眉毛拧成一团",
  "脸色一沉", "脸色铁青", "脸色苍白",
];

// 千面新增"网文 AI 腔"禁忌
const WEBNOVEL_TROPES = [
  /不是.{1,8}而是.{1,8}/g,             // 排比对偶
  /(?:然而|尽管如此|与此同时|不仅如此)/g,  // 过渡词堆砌
  /眼中闪过/g,
  /心中暗想|心中暗道/g,
  /(?:清冷|清雅|清丽|阴冷)(?:得|地)(?:像|如|似)/g,  // 文艺比喻
];

function countMatches(text: string, patterns: RegExp[]): { count: number; samples: string[] } {
  let count = 0;
  const samples: string[] = [];
  for (const pat of patterns) {
    const re = new RegExp(pat.source, pat.flags.includes("g") ? pat.flags : pat.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      count++;
      if (samples.length < 3) samples.push(m[0]);
      if (count > 200) break;
    }
  }
  return { count, samples };
}

export function scanAiTells(text: string, chaptersScanned = 1): AiTellsReport {
  const summarizing = countMatches(text, SUMMARIZING_TRIGGERS);
  const analyticAside = countMatches(text, ANALYTIC_ASIDE_TRIGGERS);
  const emotionLabel = countMatches(text, EMOTION_LABELS);
  const overModifierSamples = detectOverModifier(text);
  const overModifier = { count: overModifierSamples.length, samples: overModifierSamples };
  const repetitiveSamples = detectRepetitiveSyntax(text);
  const repetitiveSyntax = { count: repetitiveSamples.length, samples: repetitiveSamples };

  // 套式动作
  const stockTells: string[] = [];
  const stockHitCount: Record<string, number> = {};
  for (const tell of STOCK_TELLS) {
    let i = 0;
    let c = 0;
    while ((i = text.indexOf(tell, i)) !== -1) {
      c++;
      i += tell.length;
    }
    if (c > 0) stockHitCount[tell] = c;
  }
  for (const [t, c] of Object.entries(stockHitCount)) {
    if (c >= 2) stockTells.push(`${t} ×${c}`);
  }

  const tropeHits = countMatches(text, WEBNOVEL_TROPES);

  const perChapterRate = {
    summarizing: summarizing.count / chaptersScanned,
    analyticAside: analyticAside.count / chaptersScanned,
    overModifier: overModifier.count / chaptersScanned,
    emotionLabel: emotionLabel.count / chaptersScanned,
    repetitiveSyntax: repetitiveSyntax.count / chaptersScanned,
  };

  // 白泽阈值：>1/章 (总结) / >3/章 (分析) / >2/章 (过度修饰) / >3/章 (情绪标签) / >1/章 (重复)
  let warnings = 0;
  if (perChapterRate.summarizing > 1) warnings++;
  if (perChapterRate.analyticAside > 3) warnings++;
  if (perChapterRate.overModifier > 2) warnings++;
  if (perChapterRate.emotionLabel > 3) warnings++;
  if (perChapterRate.repetitiveSyntax > 1) warnings++;
  if (stockTells.length >= 3) warnings++;
  if (tropeHits.count > 5) warnings++;

  const total = Math.min(100, warnings * 14 + Math.min(40, tropeHits.count * 2));
  const level: AiTellsReport["level"] =
    warnings === 0 ? "clean" : warnings <= 1 ? "light" : warnings <= 3 ? "obvious" : "severe";

  const suggestions: string[] = [];
  if (perChapterRate.summarizing > 1) suggestions.push("拆掉总结性陈述：把「总之/归根结底/这意味着」替换为具体动作或场景反应。");
  if (perChapterRate.analyticAside > 3) suggestions.push("少做旁白解释：把「这是因为/原因在于」改为让人物在场景里自己揭示。");
  if (perChapterRate.overModifier > 2) suggestions.push("削掉形容词链：连续 3 个「X的Y的Z的」减到 1 个，留最准的那个。");
  if (perChapterRate.emotionLabel > 3) suggestions.push("不要直接命名情绪：「他很愤怒」→ 用具体动作 + 身体反应，且避免套式动作（拳头紧握等）。");
  if (perChapterRate.repetitiveSyntax > 1) suggestions.push("打散重复开头：连续 3 段同字开头视为节奏崩，重写其中 1-2 段。");
  if (stockTells.length >= 3) suggestions.push(`检出套式动作 ${stockTells.length} 种，全部替换为"只有这个角色才会做"的细节。命中：${stockTells.slice(0, 3).join("、")}`);
  if (tropeHits.count > 5) suggestions.push(`检出网文 AI 腔 ${tropeHits.count} 处（眼中闪过/心中暗想/不是A而是B/过渡词堆砌等）。`);
  if (!suggestions.length) suggestions.push("清干净。继续保持。");

  return {
    total,
    level,
    dimensions: {
      summarizing,
      analyticAside,
      overModifier,
      emotionLabel,
      repetitiveSyntax,
    },
    stockTells,
    perChapterRate,
    suggestions,
  };
}

export function formatAiTellsReport(r: AiTellsReport): string {
  const levelLabel = { clean: "✅ 清爽", light: "⚠️ 轻度", obvious: "⚠️⚠️ 明显", severe: "🛑 严重" }[r.level];
  return `【AI 腔扫描·5 维量化】 ${levelLabel}  总分 ${r.total}/100
- 总结性陈述：${r.dimensions.summarizing.count}（阈值 ≤1/章）${r.dimensions.summarizing.samples.length ? "  样本：" + r.dimensions.summarizing.samples.join(" / ") : ""}
- 分析式旁白：${r.dimensions.analyticAside.count}（阈值 ≤3/章）${r.dimensions.analyticAside.samples.length ? "  样本：" + r.dimensions.analyticAside.samples.join(" / ") : ""}
- 过度修饰：${r.dimensions.overModifier.count}（阈值 ≤2/章）${r.dimensions.overModifier.samples.length ? "  样本：" + r.dimensions.overModifier.samples.join(" / ") : ""}
- 情绪标签：${r.dimensions.emotionLabel.count}（阈值 ≤3/章）${r.dimensions.emotionLabel.samples.length ? "  样本：" + r.dimensions.emotionLabel.samples.join(" / ") : ""}
- 句式重复：${r.dimensions.repetitiveSyntax.count}（阈值 ≤1/章）${r.dimensions.repetitiveSyntax.samples.length ? "  位置：" + r.dimensions.repetitiveSyntax.samples.join("；") : ""}
- 套式动作命中：${r.stockTells.length ? r.stockTells.join("、") : "无"}

【修改建议】
${r.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

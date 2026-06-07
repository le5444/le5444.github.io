// 成长审计 growth-audit
// 任务：扫描近 N 章的成长曲线（战力/心智/地位），识别"暴涨/停滞/早熟/幼稚"等失衡。
// 来源：白泽 45 岗成长审计
import type { GrowthAudit, ChapterSummary } from "./types";

export interface GrowthAuditInput {
  chapter: number;
  recentSummaries: ChapterSummary[]; // 最近 5-10 章
  expectedCurve?: {
    power?: string;    // 用户预设：本章应达到的战力描述
    mental?: string;   // 心智阶段
    status?: string;   // 地位
  };
}

// 启发式审计：根据 growthDelta / beats 关键词推断
export function heuristicGrowthAudit(input: GrowthAuditInput): GrowthAudit {
  const { chapter, recentSummaries, expectedCurve } = input;

  // === 战力曲线 ===
  const powerJumps: number[] = [];
  const powerWords = /(?:突破|晋升|觉醒|进阶|领悟|蜕变|脱胎换骨|斩杀.+大成|越级)/g;
  recentSummaries.forEach((s) => {
    const text = (s.growthDelta || "") + " " + s.beats.join("。");
    const hits = (text.match(powerWords) || []).length;
    powerJumps.push(hits);
  });
  const totalJumps = powerJumps.reduce((a, b) => a + b, 0);
  const avgJump = recentSummaries.length ? totalJumps / recentSummaries.length : 0;

  let powerVerdict: GrowthAudit["powerCurve"]["verdict"] = "ok";
  let powerActual = "";
  if (avgJump > 1.5) {
    powerVerdict = "inflation";
    powerActual = `近 ${recentSummaries.length} 章共 ${totalJumps} 次重大战力跳升（平均 ${avgJump.toFixed(1)}/章），明显通胀`;
  } else if (avgJump === 0 && recentSummaries.length >= 5) {
    powerVerdict = "stagnation";
    powerActual = `近 ${recentSummaries.length} 章无战力相关描述，可能停滞`;
  } else {
    powerActual = `近 ${recentSummaries.length} 章共 ${totalJumps} 次战力变化，节奏正常`;
  }

  // === 心智曲线 ===
  // 检测过于成熟/老练的标志 vs 仍然幼稚/冲动的标志
  const matureCount = recentSummaries.reduce((sum, s) => {
    const t = s.beats.join("。") + " " + s.oneLineHook;
    return sum + ((t.match(/(?:深谋远虑|城府|算计|布局|权衡|按捺|城堡之主)/g) || []).length);
  }, 0);
  const naiveCount = recentSummaries.reduce((sum, s) => {
    const t = s.beats.join("。") + " " + s.oneLineHook;
    return sum + ((t.match(/(?:冲动|莽撞|轻信|天真|懵懂|没多想)/g) || []).length);
  }, 0);

  let mentalVerdict: GrowthAudit["mentalCurve"]["verdict"] = "ok";
  let mentalActual = `成熟标志 ${matureCount} · 幼稚标志 ${naiveCount}`;
  if (chapter < 30 && matureCount > naiveCount * 3) {
    mentalVerdict = "too-mature";
    mentalActual += "（前期心智过于老练，可能令读者难以共情）";
  } else if (chapter > 100 && naiveCount > matureCount * 2) {
    mentalVerdict = "too-naive";
    mentalActual += "（后期主角心智仍然幼稚，与成长不符）";
  }

  // === 地位曲线 ===
  const statusJumps = recentSummaries.reduce((sum, s) => {
    const t = (s.growthDelta || "") + s.beats.join("。");
    return sum + ((t.match(/(?:封侯|拜相|登基|继位|加冕|执掌|册封|被逐|失势|流放)/g) || []).length);
  }, 0);

  let statusVerdict: GrowthAudit["statusCurve"]["verdict"] = "ok";
  let statusActual = `近 ${recentSummaries.length} 章地位变动 ${statusJumps} 次`;
  if (statusJumps >= 2) {
    statusVerdict = "jump";
    statusActual += "（跨度过大，建议给读者过渡章节）";
  } else if (chapter > 50 && statusJumps === 0 && recentSummaries.length >= 8) {
    statusVerdict = "stagnation";
    statusActual += "（长期无地位变化，建议安排小升迁/小失势保持势头）";
  }

  // === 总建议 ===
  const recs: string[] = [];
  if (powerVerdict === "inflation") recs.push("战力通胀：下一卷设置一个「打不过/智取」的对手，让战力增长被迫减速。");
  if (powerVerdict === "stagnation") recs.push("战力停滞：在合适章节插入一次「小突破+代价」，避免成长曲线变成直线。");
  if (mentalVerdict === "too-mature") recs.push("心智过熟：写一场「小赌气/小冲动」，让读者看到主角还有少年气。");
  if (mentalVerdict === "too-naive") recs.push("心智过嫩：让主角主动布一次局，哪怕只是小算计，也要表现成长。");
  if (statusVerdict === "jump") recs.push("地位跳跃：补一两个「消化新身份」的章节，写他/她如何熟悉新位置。");
  if (statusVerdict === "stagnation") recs.push("地位停滞：安排一次「被波及」的事件，地位虽未变但圈层关系变了。");
  if (!recs.length) recs.push("成长曲线平衡，继续保持节奏。");

  return {
    chapter,
    powerCurve: {
      expected: expectedCurve?.power || "（未设定预期）",
      actual: powerActual,
      delta: totalJumps,
      verdict: powerVerdict,
    },
    mentalCurve: {
      expected: expectedCurve?.mental || "（未设定预期）",
      actual: mentalActual,
      verdict: mentalVerdict,
    },
    statusCurve: {
      expected: expectedCurve?.status || "（未设定预期）",
      actual: statusActual,
      verdict: statusVerdict,
    },
    recommendation: recs.join(" "),
  };
}

export function formatGrowthAudit(a: GrowthAudit): string {
  const verdictIcon = (v: string) =>
    v === "ok" ? "✅" : v === "inflation" || v === "jump" || v === "too-mature" ? "⚠️" : "🟡";
  return `【成长审计·第 ${a.chapter} 章】
- ${verdictIcon(a.powerCurve.verdict)} 战力曲线：${a.powerCurve.actual}
    预期：${a.powerCurve.expected}
- ${verdictIcon(a.mentalCurve.verdict)} 心智曲线：${a.mentalCurve.actual}
    预期：${a.mentalCurve.expected}
- ${verdictIcon(a.statusCurve.verdict)} 地位曲线：${a.statusCurve.actual}
    预期：${a.statusCurve.expected}

【调整建议】
${a.recommendation}`;
}

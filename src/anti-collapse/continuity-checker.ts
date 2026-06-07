// 一致性检查 continuity-checker
// 任务：把刚写完的章节文本与 MemoryStore（时间线锁/世界宪法/角色快照/活跃伏笔）做比对，
//      抽出 P0/P1/P2 三级冲突，并给出修改建议。
//
// 实现策略：
//  - P0 = 硬冲突（违反金/银 trust 的事实，如"已死角色出现"、"已销毁物品被使用"、"信息边界穿透"）
//  - P1 = 软冲突（地理/技能/世界规则矛盾，需人工裁决）
//  - P2 = 风格/伏笔提醒（超期未兑现 / 长时间未出现的角色突然出现）
//
// 同样提供两条路径：
//  1) 启发式扫描（无需 AI 调用）
//  2) AI 提示模板（让模型按 JSON 回答）
import type {
  ContinuityIssue,
  ContinuityReport,
  CharacterFingerprint,
} from "./types";
import type { MemoryStore } from "./memory-tier";
import { checkOverdueObligations } from "./memory-tier";

export interface ContinuityCheckInput {
  text: string;
  chapter: number;
  memory: MemoryStore;
  onStageCharacters: CharacterFingerprint[];
}

// === 启发式扫描 ===
export function heuristicContinuityCheck(input: ContinuityCheckInput): ContinuityReport {
  const { text, chapter, memory, onStageCharacters } = input;
  const issues: ContinuityIssue[] = [];

  // 1) 时间线锁穿透：金/银 trust 的不可逆事件，文本中不应出现与之矛盾的表述
  memory.timeline
    .filter((t) => t.trust === "gold" || t.trust === "silver")
    .forEach((t) => {
      // 简化检测：参与者中标记为死亡/销毁的，如果在本章再次以活跃状态出现 → P0
      const deathHints = t.consequences.some((c) => /死|亡|殒|殁|碎|毁|销毁|断绝/.test(c));
      if (deathHints) {
        t.participants.forEach((p) => {
          // 在文本中找到该角色 + 主动动作
          const re = new RegExp(`${escapeReg(p)}(?:走|跑|笑|说|看|喊|拔|举|喝|站|坐|握|挥)`, "g");
          if (re.test(text)) {
            issues.push({
              severity: "P0",
              dimension: "established-fact",
              claim: `${p} 在本章主动行动`,
              conflict: `第${t.chapter}章已锁定：${t.event}（影响：${t.consequences.join("；")}）`,
              source: `时间线锁 #${t.id}`,
              suggestion: `若需复活/回溯，必须先在金/银事实层添加合理机制；否则删除本章中 ${p} 的主动行动。`,
            });
          }
        });
      }
    });

  // 2) 信息边界穿透：角色 stateSnapshot.unknownInformation 不应出现在该角色的对白/内心中
  onStageCharacters.forEach((c) => {
    const u = c.stateSnapshot?.unknownInformation || [];
    u.forEach((info) => {
      // 简化：找到含角色名的段，看是否提到该信息关键词
      const paragraphs = text.split(/\n+/);
      const namedParas = paragraphs.filter((p) => p.includes(c.name));
      const informationLeak = namedParas.some((p) => containsConcept(p, info));
      if (informationLeak) {
        issues.push({
          severity: "P0",
          dimension: "character-state",
          claim: `${c.name} 似乎已知道：${info}`,
          conflict: `角色当前快照标记：本章不应知道该信息`,
          source: `角色状态快照·${c.name}`,
          suggestion: `若该信息确应在本章揭示，请同步更新 ${c.name} 的 stateSnapshot.knownInformation；否则改写该段落让角色保持未知。`,
        });
      }
    });
  });

  // 3) 世界宪法（金 trust）违反
  memory.worldAxioms
    .filter((a) => a.trust === "gold")
    .forEach((a) => {
      // 简化：如果规则中有"不可/禁止/必须/只能"关键词且文本中出现明显反例 → P1
      const negativeRule = /(?:不可|禁止|必须|只能|永不|无法)/.test(a.rule);
      if (negativeRule) {
        const ruleKey = extractRuleKeyword(a.rule);
        if (ruleKey && text.includes(ruleKey)) {
          issues.push({
            severity: "P1",
            dimension: "world-rule",
            claim: `文本中疑似涉及"${ruleKey}"`,
            conflict: `世界宪法[${a.category}]：${a.rule}`,
            source: `世界圣典 #${a.id}`,
            suggestion: `人工核验：本章是否违反此规则？若违反，重写或将规则降为 silver/gray。`,
          });
        }
      }
    });

  // 4) 超期伏笔 → P2
  const overdue = checkOverdueObligations(memory, chapter);
  overdue.forEach((o) => {
    issues.push({
      severity: "P2",
      dimension: "obligation",
      claim: `伏笔超期未兑现`,
      conflict: `第${o.setupChapter}章设：${o.setupText}（预计第${o.expectedPayoffChapter}章兑现，已逾期）`,
      source: `伏笔台账 #${o.id}`,
      suggestion: `选择：1) 本章触发兑现；2) 延期并更新 expectedPayoffChapter；3) 在文本中给角色一个"暗中关注"的小镜头维持热度。`,
    });
  });

  // 5) 长时间未出现的角色突然出现且无铺垫 → P2
  const recentChapters = memory.chapterSummaries.filter((s) => s.chapter >= chapter - 10 && s.chapter < chapter);
  onStageCharacters.forEach((c) => {
    const recentAppearances = recentChapters.filter((s) => s.charactersOnStage.includes(c.name));
    if (recentChapters.length >= 5 && recentAppearances.length === 0) {
      issues.push({
        severity: "P2",
        dimension: "character-state",
        claim: `${c.name} 在前 10 章无出场记录，但本章登场`,
        conflict: `读者可能已遗忘该角色`,
        source: `近章摘要`,
        suggestion: `在登场处补一句"自从XX之后再没见过"的回溯铺垫；或确认是否需要给读者一段简短的角色回忆。`,
      });
    }
  });

  const hasP0 = issues.some((i) => i.severity === "P0");
  const counts = {
    P0: issues.filter((i) => i.severity === "P0").length,
    P1: issues.filter((i) => i.severity === "P1").length,
    P2: issues.filter((i) => i.severity === "P2").length,
  };
  const summary = hasP0
    ? `🛑 检出 P0 硬冲突 ${counts.P0} 处 · P1 ${counts.P1} · P2 ${counts.P2}。建议先修 P0 再发稿。`
    : counts.P1 > 0
      ? `⚠️ P0 已清 · P1 软冲突 ${counts.P1} · P2 ${counts.P2}。建议复核 P1 后发稿。`
      : counts.P2 > 0
        ? `✅ P0/P1 已清 · P2 提醒 ${counts.P2} 处（不阻塞发稿）。`
        : `✅ 一致性扫描通过，未检出冲突。`;

  return {
    issues,
    passed: !hasP0,
    summary,
  };
}

// === AI 提示模板 ===
export function buildContinuityCheckPrompt(input: ContinuityCheckInput): string {
  const { text, chapter, memory, onStageCharacters } = input;

  const goldFacts = [
    ...memory.worldAxioms.filter((a) => a.trust === "gold" || a.trust === "silver").map((a) => `[世界·${a.category}] ${a.rule}`),
    ...memory.timeline.filter((t) => t.trust === "gold" || t.trust === "silver").map((t) => `[第${t.chapter}章·锁定] ${t.event} → ${t.consequences.join("；")}`),
  ].join("\n");

  const characterBoundaries = onStageCharacters
    .map((c) => {
      const known = c.stateSnapshot?.knownInformation || [];
      const unknown = c.stateSnapshot?.unknownInformation || [];
      return `${c.name}:\n  已知：${known.join("；") || "无"}\n  不应知道：${unknown.join("；") || "无"}`;
    })
    .join("\n");

  const activeOb = memory.obligations
    .filter((o) => o.status === "active")
    .map((o) => `- [${o.type}·第${o.setupChapter}章设] ${o.setupText}${o.expectedPayoffChapter ? `（预计第${o.expectedPayoffChapter}章兑现）` : ""}`)
    .join("\n");

  return `你是【tian-gong·continuity-checker】，对刚完成的第 ${chapter} 章做一致性扫描。
按下方"已确立的事实"对比章节文本，找出所有冲突。只输出严格 JSON：

{
  "issues": [
    {
      "severity": "P0" | "P1" | "P2",
      "dimension": "timeline" | "character-state" | "geography" | "established-fact" | "skill-usage" | "world-rule" | "obligation",
      "claim": "章节文本中的问题主张（引用原文片段）",
      "conflict": "与什么冲突（引用已确立事实）",
      "source": "冲突来源（章节号/字段名）",
      "suggestion": "具体修改建议"
    }
  ]
}

判级标准：
- P0 = 硬冲突，违反金/银 trust 的不可逆事实或信息边界（如已死角色行动、角色穿透信息边界）
- P1 = 软冲突，违反世界宪法/技能规则/地理逻辑（需人工裁决）
- P2 = 风格/伏笔提醒（如超期未兑现、长缺席角色突然出现）

==== 已确立的事实 ====
${goldFacts || "（无）"}

==== 角色信息边界 ====
${characterBoundaries || "（无）"}

==== 活跃伏笔 ====
${activeOb || "（无）"}

==== 章节正文 ====
${text}
==== 正文结束 ====

只输出 JSON。若无问题，输出 {"issues":[]}。`;
}

export function parseContinuityResponse(raw: string): ContinuityReport | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const j = JSON.parse(cleaned);
    const issues: ContinuityIssue[] = Array.isArray(j.issues) ? j.issues : [];
    const counts = {
      P0: issues.filter((i) => i.severity === "P0").length,
      P1: issues.filter((i) => i.severity === "P1").length,
      P2: issues.filter((i) => i.severity === "P2").length,
    };
    const passed = counts.P0 === 0;
    return {
      issues,
      passed,
      summary: passed
        ? `✅ AI 复核通过 · P1 ${counts.P1} · P2 ${counts.P2}`
        : `🛑 AI 复核：P0 ${counts.P0} · P1 ${counts.P1} · P2 ${counts.P2}`,
    };
  } catch {
    return null;
  }
}

export function formatContinuityReport(r: ContinuityReport): string {
  const lines: string[] = [];
  lines.push(`【一致性扫描】 ${r.summary}`);
  if (!r.issues.length) {
    lines.push("（无冲突）");
    return lines.join("\n");
  }
  const groups: Record<string, ContinuityIssue[]> = { P0: [], P1: [], P2: [] };
  r.issues.forEach((i) => groups[i.severity].push(i));
  (["P0", "P1", "P2"] as const).forEach((sev) => {
    if (!groups[sev].length) return;
    const tag = { P0: "🛑 P0 硬冲突", P1: "⚠️ P1 软冲突", P2: "💡 P2 提醒" }[sev];
    lines.push("");
    lines.push(`[${tag}]`);
    groups[sev].forEach((i, idx) => {
      lines.push(`  ${idx + 1}. [${i.dimension}] ${i.claim}`);
      lines.push(`     冲突：${i.conflict}`);
      lines.push(`     来源：${i.source}`);
      lines.push(`     建议：${i.suggestion}`);
    });
  });
  return lines.join("\n");
}

// === helpers ===
function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsConcept(text: string, concept: string): boolean {
  // 简化：拆出关键词（长度 ≥ 2 的连续汉字/字母段），任一命中即视为涉及
  const tokens = (concept.match(/[一-龥a-zA-Z0-9]{2,}/g) || []).filter((t) => t.length >= 2);
  if (!tokens.length) return false;
  return tokens.some((t) => text.includes(t));
}

function extractRuleKeyword(rule: string): string | null {
  // 取规则中第一个长度 ≥ 3 的连续汉字段（粗暴但有效）
  const m = rule.match(/[一-龥]{3,8}/);
  return m ? m[0] : null;
}

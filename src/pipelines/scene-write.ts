// 场景写作管线 plan → draft → critique → revise
// 集成反崩盘引擎：约束卡 / AI腔扫描 / 一致性检查 / 声音漂移
// 最多 5 轮，达到质量阈值即停。
import { sendRawChat, type ApiSettings, type ChatMessage } from "../store/settings";
import type {
  ConstraintCard,
  CharacterFingerprint,
  AiTellsReport,
  ContinuityReport,
} from "../anti-collapse/types";
import { renderConstraintCard } from "../anti-collapse/constraint-card";
import { scanAiTells, formatAiTellsReport } from "../anti-collapse/ai-tells";
import { detectVoiceDrift } from "../anti-collapse/voice-fingerprint";
import { heuristicContinuityCheck, formatContinuityReport } from "../anti-collapse/continuity-checker";
import type { MemoryStore } from "../anti-collapse/memory-tier";

export interface SceneWriteOptions {
  settings: ApiSettings;
  card: ConstraintCard;
  memory: MemoryStore;
  onStageCharacters: CharacterFingerprint[];
  maxRounds?: number;
  signal?: AbortSignal;
  // 流式回调（每个阶段独立流）
  onPhase?: (phase: PipelinePhase, info: PhaseInfo) => void;
  onStream?: (phase: PipelinePhase, text: string) => void;
}

export type PipelinePhase =
  | "planning"
  | "drafting"
  | "critiquing"
  | "revising"
  | "done"
  | "aborted";

export interface PhaseInfo {
  round: number;
  message: string;
}

export interface CritiqueResult {
  aiTells: AiTellsReport;
  continuity: ContinuityReport;
  voiceDrift: Array<{ character: string; score: number; issues: string[] }>;
  combinedReport: string;
  passed: boolean;
  score: number; // 0-100 综合分
}

export interface SceneWriteResult {
  finalText: string;
  rounds: Array<{
    round: number;
    text: string;
    critique: CritiqueResult;
  }>;
  finalCritique: CritiqueResult;
}

// === 核心管线 ===
export async function runSceneWritePipeline(opts: SceneWriteOptions): Promise<SceneWriteResult> {
  const {
    settings,
    card,
    memory,
    onStageCharacters,
    maxRounds = 5,
    signal,
    onPhase,
    onStream,
  } = opts;

  const rounds: SceneWriteResult["rounds"] = [];
  const systemPrompt = renderConstraintCard(card);

  let currentText = "";
  let currentCritique: CritiqueResult | null = null;

  for (let round = 1; round <= maxRounds; round++) {
    if (signal?.aborted) {
      onPhase?.("aborted", { round, message: "用户已中止" });
      break;
    }

    // === Draft / Revise 阶段 ===
    const isFirst = round === 1;
    const phase: PipelinePhase = isFirst ? "drafting" : "revising";
    onPhase?.(phase, {
      round,
      message: isFirst ? "正在撰写初稿…" : `第 ${round} 轮：根据反馈修订…`,
    });

    const writingMessages: ChatMessage[] = [];
    if (isFirst) {
      writingMessages.push({
        role: "user",
        content: `请严格按约束卡写出本章正文。要求：
- 字数 ≈ ${card.targetWordCount}
- 视角人物：${card.povCharacter}
- 节拍按 L2 计划展开
- 不要写大纲/章节标题/出版说明，直接输出小说正文
- 段落之间用空行分隔`,
      });
    } else {
      const critiqueReport = currentCritique?.combinedReport || "";
      writingMessages.push(
        { role: "assistant", content: currentText },
        {
          role: "user",
          content: `你刚才写的版本经【白泽 + tian-gong + 千面】三方审稿，下面是问题清单。请只修订必要部分，保持其余文本不变，输出完整修订稿（不要写解释）：

${critiqueReport}

修订要求：
- 优先处理 P0 硬冲突（必须改）和 AI 腔严重项（必须改）
- 不要全文重写，只动有问题的句段
- 输出完整章节正文（修订后版本）`,
        },
      );
    }

    let buffer = "";
    currentText = await sendRawChat(
      settings,
      systemPrompt,
      writingMessages,
      (t) => {
        buffer = t;
        onStream?.(phase, t);
      },
      signal,
    );
    if (!currentText && buffer) currentText = buffer;

    // === Critique 阶段 ===
    if (signal?.aborted) {
      onPhase?.("aborted", { round, message: "用户已中止" });
      break;
    }
    onPhase?.("critiquing", { round, message: `第 ${round} 轮：三方审稿中…` });

    currentCritique = critiqueText({
      text: currentText,
      chapter: card.chapter,
      memory,
      onStageCharacters,
    });

    rounds.push({ round, text: currentText, critique: currentCritique });

    // 达标即停
    if (currentCritique.passed && currentCritique.score >= 80) {
      onPhase?.("done", {
        round,
        message: `✅ 第 ${round} 轮已达标（综合分 ${currentCritique.score}）。`,
      });
      break;
    }

    if (round === maxRounds) {
      onPhase?.("done", {
        round,
        message: `已用尽 ${maxRounds} 轮，输出最后一稿（综合分 ${currentCritique.score}）。可手动二次修订。`,
      });
    }
  }

  return {
    finalText: currentText,
    rounds,
    finalCritique: currentCritique || emptyCritique(),
  };
}

// === Critique：纯本地三方审稿（无需 AI 调用） ===
export function critiqueText(input: {
  text: string;
  chapter: number;
  memory: MemoryStore;
  onStageCharacters: CharacterFingerprint[];
}): CritiqueResult {
  const { text, chapter, memory, onStageCharacters } = input;

  const aiTells = scanAiTells(text, 1);
  const continuity = heuristicContinuityCheck({
    text,
    chapter,
    memory,
    onStageCharacters,
  });
  const voiceDrift = onStageCharacters.map((c) => {
    const d = detectVoiceDrift(text, c);
    return { character: c.name, score: d.score, issues: d.issues };
  });

  const passed =
    continuity.passed && // 无 P0
    aiTells.level !== "severe" &&
    aiTells.level !== "obvious" &&
    voiceDrift.every((v) => v.score >= 60);

  // 综合分：AI 腔（40%）+ 一致性（30%）+ 声音（30%）
  const aiTellsScore = 100 - Math.min(100, aiTells.total);
  const continuityScore =
    continuity.issues.length === 0
      ? 100
      : Math.max(
          0,
          100 -
            continuity.issues.filter((i) => i.severity === "P0").length * 35 -
            continuity.issues.filter((i) => i.severity === "P1").length * 15 -
            continuity.issues.filter((i) => i.severity === "P2").length * 5,
        );
  const voiceScore = voiceDrift.length
    ? voiceDrift.reduce((sum, v) => sum + v.score, 0) / voiceDrift.length
    : 100;
  const score = Math.round(aiTellsScore * 0.4 + continuityScore * 0.3 + voiceScore * 0.3);

  const lines: string[] = [];
  lines.push(`═══════ 三方审稿 · 综合分 ${score}/100 ${passed ? "✅ 达标" : "🛑 未达标"} ═══════`);
  lines.push("");
  lines.push(formatAiTellsReport(aiTells));
  lines.push("");
  lines.push(formatContinuityReport(continuity));
  lines.push("");
  lines.push("【声音指纹漂移】");
  voiceDrift.forEach((v) => {
    const icon = v.score >= 80 ? "✅" : v.score >= 60 ? "⚠️" : "🛑";
    lines.push(`  ${icon} ${v.character}: ${v.score}/100${v.issues.length ? "  · " + v.issues.join("；") : ""}`);
  });
  if (!voiceDrift.length) lines.push("  （未指定角色指纹，跳过）");

  return {
    aiTells,
    continuity,
    voiceDrift,
    combinedReport: lines.join("\n"),
    passed,
    score,
  };
}

function emptyCritique(): CritiqueResult {
  return {
    aiTells: {
      total: 0,
      level: "clean",
      dimensions: {
        summarizing: { count: 0, samples: [] },
        analyticAside: { count: 0, samples: [] },
        overModifier: { count: 0, samples: [] },
        emotionLabel: { count: 0, samples: [] },
        repetitiveSyntax: { count: 0, samples: [] },
      },
      stockTells: [],
      perChapterRate: {
        summarizing: 0,
        analyticAside: 0,
        overModifier: 0,
        emotionLabel: 0,
        repetitiveSyntax: 0,
      },
      suggestions: [],
    },
    continuity: { issues: [], passed: true, summary: "" },
    voiceDrift: [],
    combinedReport: "",
    passed: true,
    score: 100,
  };
}

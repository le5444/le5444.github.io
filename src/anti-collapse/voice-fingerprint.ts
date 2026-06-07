// 角色声音指纹库 + 状态快照
// 千面对话指纹库 (P0)：句长 / 句式 / 口头禅 / 情绪playbook / 内心OS / 三层人格 / 视角锁
import { saveJSON, loadJSON, uid } from "../utils/helpers";
import type { CharacterFingerprint, CharacterStateSnapshot } from "./types";

const STORAGE_KEY = "novelsmith-character-fingerprints";

export function loadFingerprints(bookId: string): CharacterFingerprint[] {
  return loadJSON<CharacterFingerprint[]>(`${STORAGE_KEY}:${bookId}`, []);
}

export function saveFingerprints(bookId: string, list: CharacterFingerprint[]) {
  saveJSON(`${STORAGE_KEY}:${bookId}`, list);
}

export function createBlankFingerprint(name: string): CharacterFingerprint {
  return {
    id: "char-" + uid(),
    name: name.trim() || "未命名角色",
    aliases: [],
    sentenceLengthBias: "mixed",
    speechPatterns: [],
    catchPhrases: [],
    forbiddenLines: [],
    emotionPlaybook: {
      anger: "",
      joy: "",
      fear: "",
      calm: "",
    },
    innerVoiceRatio: 0.2,
    innerVoiceFormat: "圆括号或独立段",
    surfacePersona: "",
    privatePersona: "",
    extremePersona: "",
    pov: "side",
    knownAs: "",
  };
}

export function buildFingerprintBriefing(fp: CharacterFingerprint): string {
  const lines: string[] = [];
  lines.push(`【角色：${fp.name}${fp.aliases?.length ? "（别名：" + fp.aliases.join("、") + "）" : ""}】`);
  lines.push(`视角定位：${fp.pov} / 别人称呼：${fp.knownAs || "未指定"}`);
  lines.push("");
  lines.push("[对话指纹]");
  lines.push(`- 句长偏好：${fp.sentenceLengthBias}（short=短促 / mixed=长短交错 / long=连绵）`);
  if (fp.speechPatterns.length) lines.push(`- 句式偏好：${fp.speechPatterns.join("；")}`);
  if (fp.catchPhrases.length) lines.push(`- 口头禅（每章可出现 1-2 次，禁止滥用）：${fp.catchPhrases.join(" / ")}`);
  if (fp.forbiddenLines.length) lines.push(`- 禁用表达：${fp.forbiddenLines.join(" / ")}`);
  lines.push("");
  lines.push("[情绪 × 反应 矩阵]");
  if (fp.emotionPlaybook.anger) lines.push(`- 愤怒时：${fp.emotionPlaybook.anger}`);
  if (fp.emotionPlaybook.joy) lines.push(`- 喜悦时：${fp.emotionPlaybook.joy}`);
  if (fp.emotionPlaybook.fear) lines.push(`- 恐惧时：${fp.emotionPlaybook.fear}`);
  if (fp.emotionPlaybook.calm) lines.push(`- 冷静时：${fp.emotionPlaybook.calm}`);
  if (fp.emotionPlaybook.grief) lines.push(`- 悲痛时：${fp.emotionPlaybook.grief}`);
  if (fp.emotionPlaybook.shame) lines.push(`- 羞愧时：${fp.emotionPlaybook.shame}`);
  lines.push("");
  lines.push(`[内心 OS] 占比约 ${Math.round(fp.innerVoiceRatio * 100)}%，格式：${fp.innerVoiceFormat}`);
  lines.push("");
  lines.push("[三层人格]");
  if (fp.surfacePersona) lines.push(`- 表层（外人见）：${fp.surfacePersona}`);
  if (fp.privatePersona) lines.push(`- 中层（独处时）：${fp.privatePersona}`);
  if (fp.extremePersona) lines.push(`- 深层（极端处境）：${fp.extremePersona}`);
  if (fp.stateSnapshot) {
    lines.push("");
    lines.push(buildSnapshotBriefing(fp.stateSnapshot));
  }
  return lines.join("\n");
}

export function buildSnapshotBriefing(s: CharacterStateSnapshot): string {
  const lines: string[] = [];
  lines.push(`[第 ${s.chapter} 章前·状态快照]`);
  lines.push(`- 情绪：${s.emotion || "未指定"}`);
  lines.push(`- 身体：${s.body || "正常"}`);
  lines.push(`- 刚经历：${s.justExperienced || "无显著事件"}`);
  lines.push(`- 当前目标：${s.currentGoal || "未指定"}`);
  lines.push(`- 位置：${s.location || "未指定"}`);
  if (Object.keys(s.relations).length) {
    lines.push("- 当下关系：");
    Object.entries(s.relations).forEach(([who, rel]) => lines.push(`  · 与 ${who}：${rel}`));
  }
  if (s.knownInformation.length) lines.push(`- 已知信息：${s.knownInformation.join("；")}`);
  if (s.unknownInformation.length) lines.push(`- 不应知道（信息边界，违反=P0 拦截）：${s.unknownInformation.join("；")}`);
  return lines.join("\n");
}

// 对白指纹检测：遮名抽 5 句对白能否还原说话人？
// 这里只做轻量启发式：找到角色发言段，统计句长/口头禅命中
export function detectVoiceDrift(text: string, fp: CharacterFingerprint): { score: number; issues: string[] } {
  const issues: string[] = [];
  // 抓出含角色名的对白段
  const lines = text.split(/\n+/);
  const speeches: string[] = [];
  for (const line of lines) {
    if (line.includes(fp.name) && /["「『""].+?["」』""]/.test(line)) {
      const match = line.match(/["「『""](.+?)["」』""]/);
      if (match) speeches.push(match[1]);
    }
  }
  if (!speeches.length) return { score: 100, issues: ["未检出该角色对白，跳过指纹比对"] };

  let hits = 0;
  let total = 0;
  // 句长
  const avgLen = speeches.reduce((s, x) => s + x.length, 0) / speeches.length;
  total++;
  if (fp.sentenceLengthBias === "short" && avgLen < 25) hits++;
  else if (fp.sentenceLengthBias === "long" && avgLen > 40) hits++;
  else if (fp.sentenceLengthBias === "mixed") hits++;
  else issues.push(`平均句长 ${avgLen.toFixed(1)} 字与设定（${fp.sentenceLengthBias}）不符`);

  // 禁用表达
  for (const forbidden of fp.forbiddenLines) {
    total++;
    if (!speeches.some((s) => s.includes(forbidden))) hits++;
    else issues.push(`使用了禁用表达：${forbidden}`);
  }

  // 口头禅出现率（每章不超过 1-2 次）
  for (const phrase of fp.catchPhrases) {
    const count = speeches.filter((s) => s.includes(phrase)).length;
    total++;
    if (count >= 1 && count <= 2) hits++;
    else if (count > 2) issues.push(`口头禅"${phrase}"出现 ${count} 次（建议每章 1-2 次）`);
  }

  const score = total ? Math.round((hits / total) * 100) : 100;
  return { score, issues };
}

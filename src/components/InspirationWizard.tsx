import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, ChevronLeft, ChevronRight, Sparkles, User, Globe, Users, Zap, BookOpen, CheckCircle2 } from "lucide-react";
import { isConfigured, sendChat, type ApiSettings } from "../store/settings";
import { type WorkspaceFile } from "../store/workspace";
import { loadMemory, saveMemory } from "../anti-collapse";
import { showToast } from "../utils/toast";

// ===== 标签数据 =====
const GENRES = ["玄幻", "仙侠", "都市", "科幻", "历史", "言情", "悬疑", "武侠", "奇幻", "末世", "游戏", "军事", "灵异", "轻小说", "同人"];
const CHANNELS = ["男频·青年向", "男频·中年向", "女频·青年向", "女频·中年向", "双男主", "无 CP", "全品类"];
const SCALES = ["超短篇 (5-10 万字)", "短篇 (10-30 万字)", "中长篇 (30-80 万字)", "长篇 (100-200 万字)", "超长篇 (200-500 万字)", "超长篇 (500-1000 万字)"];
const TARGET_PRESETS = [
  { label: "5万试开", scale: "超短篇 (5-10 万字)", targetWordCount: 50000, wordsPerChapter: 2000 },
  { label: "10万短篇", scale: "短篇 (10-30 万字)", targetWordCount: 100000, wordsPerChapter: 2000 },
  { label: "30万轻长篇", scale: "中长篇 (30-80 万字)", targetWordCount: 300000, wordsPerChapter: 2500 },
  { label: "100万长篇", scale: "长篇 (100-200 万字)", targetWordCount: 1000000, wordsPerChapter: 2500 },
];

const TAG_CATEGORIES = {
  叙事套路: ["系统流", "升级流", "无敌流", "种田流", "练功流", "技术流", "宠物流", "鉴宝流", "直播流", "经营流", "建设流", "领主流", "签到流", "抽奖流", "模拟器流"],
  角色处境: ["重生", "穿越", "夺舍", "快穿", "女扮男装", "扮猪吃虎", "废柴逆袭", "天才", "退隐强者", "赘婿", "孤儿", "皇族"],
  题材方向: ["宫斗", "探险", "末日求生", "星际", "盗墓", "航海", "校园", "职场", "电竞", "美食", "医术", "娱乐圈", "体育", "音乐"],
  节奏风格: ["慢热", "快节奏", "日常", "群像", "单女主", "后宫", "争霸", "复仇", "阴谋", "轻松", "暗黑", "治愈", "搞笑", "虐心"],
};

const PLOT_STRUCTURES = [
  { name: "五幕式", desc: "铺垫→发展→高潮→转折→结局" },
  { name: "三幕式", desc: "开端→发展→结局" },
  { name: "英雄之旅", desc: "平凡→召唤→考验→归来" },
  { name: "起承转合", desc: "经典四段式结构" },
  { name: "序破急", desc: "日式三段式结构" },
];

const STYLE_PREFERENCES = ["轻松搞笑", "热血燃向", "严肃深沉", "细腻温情", "黑暗压抑", "诙谐讽刺", "史诗磅礴", "清新治愈"];

const POWER_SYSTEMS = {
  修炼类: ["修仙体系", "仙道体系", "武道体系", "斗气体系", "内力体系", "炼体体系", "炼丹体系", "符箓体系", "阵法体系"],
  超凡类: ["魔法体系", "元素体系", "精神力体系", "异能体系", "血脉体系", "龙脉体系", "契约体系", "召唤体系", "神力体系"],
  职业类: ["职业体系", "技能体系", "天赋体系", "星辰体系", "图腾体系", "灵魂体系", "规则体系", "源力体系"],
  科技类: ["科技体系", "机甲体系", "基因体系", "纳米体系", "赛博体系", "灵能科技", "星能体系"],
  特殊类: ["气运体系", "因果体系", "命运体系", "混沌体系", "法则体系", "位面体系", "无力量体系"],
};

const CHEAT_SYSTEMS = {
  系统类: ["系统金手指", "签到金手指", "抽奖金手指", "商城金手指", "任务金手指", "模拟器金手指", "面板金手指", "属性金手指", "成就金手指"],
  能力类: ["血脉觉醒", "技能获取", "复制能力", "进化体质", "融合能力", "吞噬能力", "时间能力", "空间能力", "精神异能", "预知能力"],
  外物类: ["神奇道具", "至高宝物", "神秘书籍", "藏宝地图", "储物戒指", "棋盘世界", "万物图鉴"],
  身份类: ["宿主觉醒", "天命之子", "穿越赠品", "重生记忆", "剧本预知", "气运之子", "因果之力", "转世传承"],
  特殊类: ["无金手指", "反派金手指", "读心能力", "鉴定能力", "经营天赋", "建设天赋", "收藏天赋"],
};

export interface WizardResult {
  title: string;
  protagonistName: string;
  creativeDirection: string;
  genre: string;
  tags: string[];
  channel: string;
  scale: string;
  targetWordCount: number;
  wordsPerChapter: number;
  plotStructure: string;
  stylePreferences: string[];
  powerSystem: string;
  cheatType: string;
  mainConflict: string;
  // AI generated
  bookTitles: string[];
  protagonistProfiles: ProtagonistProfile[];
  worldSettings: WorldSetting[];
  supportingCast: SupportingCast[][];
  cheatOptions: CheatOption[];
  projectProposal: ProjectProposal | null;
  // Selected
  selectedTitleIndex: number;
  selectedProtagonistIndex: number;
  selectedWorldIndex: number;
  selectedSupportingIndex: number;
  selectedCheatIndex: number;
  customTitle: string;
  customProtagonist: string;
  customWorld: string;
  customSupporting: string;
  customCheat: string;
}

export interface ProtagonistProfile {
  name: string;
  identity: string;
  description: string;
}

export interface WorldSetting {
  title: string;
  coreSellingPoint: string;
  description: string;
}

export interface SupportingCast {
  name: string;
  role: string;
  personality: string;
  relationship: string;
}

export interface CheatOption {
  name: string;
  type: string;
  function: string;
  limitation: string;
}

export interface ProjectProposal {
  titles: string[];
  intro: string;
  sellingPoints: string[];
  rhythmTable: ChapterPlan[];
  storyBible?: StoryBibleProposal;
  continuationCard?: ContinuationCardProposal;
  styleProfile?: StyleProfileProposal;
}

export interface ChapterPlan {
  chapterTitle: string;
  coreEvent: string;
  isShuangdian: boolean;
  beatType?: BeatType;
  hook?: string;
}

type BeatType = "normal" | "setup" | "minor_beat" | "major_beat" | "climax" | "transition";

interface OpeningSceneBeat {
  chapter: number;
  goal: string;
  event: string;
  conflict?: string;
  hook?: string;
  beatType?: BeatType;
}

interface ForeshadowSeed {
  id?: string;
  plantedChapter: number;
  payoffChapter?: number;
  type?: string;
  content: string;
  progress?: number;
}

interface StoryBibleProposal {
  premise: string;
  powerSystem: string;
  worldFactions: string;
  goldenFinger: string;
  characterCards: string;
  openingScene: OpeningSceneBeat[];
  foreshadowSeeds: ForeshadowSeed[];
  mainArc: string;
}

interface ContinuationCardProposal {
  protagonistState: string;
  activeConflicts: string[];
  foreshadowLedger: ForeshadowSeed[];
  rhythmState: string;
  boundaries: string[];
  knowledgeState: string;
}

interface StyleProfileProposal {
  sentenceLength: string;
  adjectiveDensity: string;
  pacingSpeed: string;
  toneKeywords: string[];
  chapterRule: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => textValue(item)).filter(Boolean);
}

function numberValue(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "是" || value === "爽点";
}

function beatTypeValue(value: unknown): BeatType {
  const raw = textValue(value);
  if (["normal", "setup", "minor_beat", "major_beat", "climax", "transition"].includes(raw)) return raw as BeatType;
  if (raw.includes("高潮")) return "climax";
  if (raw.includes("大爽")) return "major_beat";
  if (raw.includes("爽")) return "minor_beat";
  if (raw.includes("铺垫")) return "setup";
  if (raw.includes("过渡")) return "transition";
  return "normal";
}

function extractJsonPayload(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || raw;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return source.slice(start, end + 1);
}

function normalizeOpeningScene(value: unknown): OpeningSceneBeat[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const rec = asRecord(item);
    return {
      chapter: numberValue(rec.chapter, index + 1),
      goal: textValue(rec.goal, `第${index + 1}章推进主线`),
      event: textValue(rec.event || rec.coreEvent, textValue(item)),
      conflict: textValue(rec.conflict),
      hook: textValue(rec.hook),
      beatType: beatTypeValue(rec.beatType),
    };
  }).filter((item) => item.event || item.goal);
}

function normalizeForeshadowSeeds(value: unknown): ForeshadowSeed[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const rec = asRecord(item);
    return {
      id: textValue(rec.id, `f${String(index + 1).padStart(2, "0")}`),
      plantedChapter: numberValue(rec.plantedChapter || rec.setupChapter, index + 1),
      payoffChapter: numberValue(rec.payoffChapter || rec.expectedPayoffChapter, Math.max(index + 8, index + 1)),
      type: textValue(rec.type, "foreshadow"),
      content: textValue(rec.content || rec.setupText, textValue(item)),
      progress: numberValue(rec.progress, 0),
    };
  }).filter((item) => item.content);
}

function normalizeRhythmTable(value: unknown): ChapterPlan[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const rec = asRecord(item);
    const coreEvent = textValue(rec.coreEvent || rec.event, textValue(item));
    const beatType = beatTypeValue(rec.beatType);
    return {
      chapterTitle: textValue(rec.chapterTitle || rec.title, `第${index + 1}章`),
      coreEvent,
      isShuangdian: booleanValue(rec.isShuangdian) || beatType === "minor_beat" || beatType === "major_beat" || beatType === "climax",
      beatType,
      hook: textValue(rec.hook),
    };
  }).filter((item) => item.chapterTitle || item.coreEvent);
}

function parseProjectProposal(raw: string): ProjectProposal | null {
  const payload = extractJsonPayload(raw);
  if (!payload) return null;
  try {
    const root = asRecord(JSON.parse(payload));
    const bible = asRecord(root.storyBible);
    const card = asRecord(root.continuationCard);
    const style = asRecord(root.styleProfile);
    const storyBible: StoryBibleProposal | undefined = Object.keys(bible).length ? {
      premise: textValue(bible.premise),
      powerSystem: textValue(bible.powerSystem),
      worldFactions: textValue(bible.worldFactions),
      goldenFinger: textValue(bible.goldenFinger),
      characterCards: textValue(bible.characterCards),
      openingScene: normalizeOpeningScene(bible.openingScene),
      foreshadowSeeds: normalizeForeshadowSeeds(bible.foreshadowSeeds),
      mainArc: textValue(bible.mainArc),
    } : undefined;
    const continuationCard: ContinuationCardProposal | undefined = Object.keys(card).length ? {
      protagonistState: textValue(card.protagonistState),
      activeConflicts: stringArray(card.activeConflicts),
      foreshadowLedger: normalizeForeshadowSeeds(card.foreshadowLedger),
      rhythmState: textValue(card.rhythmState),
      boundaries: stringArray(card.boundaries),
      knowledgeState: textValue(card.knowledgeState),
    } : undefined;
    const styleProfile: StyleProfileProposal | undefined = Object.keys(style).length ? {
      sentenceLength: textValue(style.sentenceLength, "中短句"),
      adjectiveDensity: textValue(style.adjectiveDensity, "适中"),
      pacingSpeed: textValue(style.pacingSpeed, "快"),
      toneKeywords: stringArray(style.toneKeywords),
      chapterRule: textValue(style.chapterRule, "每章推进一个冲突或伏笔，章末留钩子。"),
    } : undefined;
    return {
      titles: stringArray(root.titles).slice(0, 3),
      intro: textValue(root.intro),
      sellingPoints: stringArray(root.sellingPoints).slice(0, 5),
      rhythmTable: normalizeRhythmTable(root.rhythmTable),
      storyBible,
      continuationCard,
      styleProfile,
    };
  } catch {
    return null;
  }
}

function targetWordCountForScale(scale: string) {
  if (scale.includes("5-10")) return 50000;
  if (scale.includes("10-30")) return 100000;
  if (scale.includes("30-80")) return 300000;
  if (scale.includes("100-200")) return 1000000;
  if (scale.includes("200-500")) return 2500000;
  return 5000000;
}

function wordsPerChapterForScale(scale: string) {
  if (scale.includes("5-10") || scale.includes("10-30")) return 2000;
  return 2500;
}

function resolveTargetWordCount(result: Pick<WizardResult, "scale" | "targetWordCount">) {
  return Math.max(10000, Math.round(numberValue(result.targetWordCount, targetWordCountForScale(result.scale))));
}

function resolveWordsPerChapter(result: Pick<WizardResult, "scale" | "wordsPerChapter">) {
  return Math.max(800, Math.round(numberValue(result.wordsPerChapter, wordsPerChapterForScale(result.scale))));
}

function resolveTargetChapters(result: Pick<WizardResult, "scale" | "targetWordCount" | "wordsPerChapter">) {
  return Math.max(1, Math.ceil(resolveTargetWordCount(result) / resolveWordsPerChapter(result)));
}

function getScopeAdvice(targetWordCount: number) {
  if (targetWordCount <= 60000) {
    return "5万字聚焦：一个主地点、一个核心规则、一个主要反派链，支线不超过2条，伏笔少埋快收。";
  }
  if (targetWordCount <= 120000) {
    return "10万字短篇：主线清晰，允许一条副线和一次中段反转，伏笔集中在70%-100%回收。";
  }
  if (targetWordCount <= 300000) {
    return "30万字轻长篇：按3-4个阶段推进，每阶段有小目标和一次大爽点回收。";
  }
  return "长篇模式：必须按卷维护底本、伏笔账本、人物状态和信息边界，卷末回填续写卡。";
}

function formatArcCheckpoints(targetChapters: number) {
  const firstTurn = Math.max(3, Math.round(targetChapters * 0.12));
  const midpoint = Math.max(firstTurn + 1, Math.round(targetChapters * 0.45));
  const payoffStart = Math.max(midpoint + 1, Math.round(targetChapters * 0.7));
  const finale = targetChapters;
  return [
    `第1-${firstTurn}章：锁定主角困境、核心规则、短期目标和第一个读者承诺。`,
    `第${firstTurn + 1}-${midpoint}章：连续升级冲突，完成一次明显爽点兑现。`,
    `第${midpoint + 1}-${payoffStart - 1}章：揭开中段真相或代价，压缩无效支线。`,
    `第${payoffStart}-${finale}章：集中回收伏笔，完成主要反派链和情绪闭环。`,
  ];
}

function getSelectedTitle(result: WizardResult) {
  return result.selectedTitleIndex >= 0 ? result.bookTitles[result.selectedTitleIndex] : result.customTitle || result.title || "未命名作品";
}

function getSelectedProtagonistText(result: WizardResult) {
  const p = result.selectedProtagonistIndex >= 0 ? result.protagonistProfiles[result.selectedProtagonistIndex] : null;
  if (p) return `${p.name}，${p.identity}。${p.description}`;
  return result.customProtagonist || result.protagonistName || "待生成主角";
}

function getSelectedWorldText(result: WizardResult) {
  const w = result.selectedWorldIndex >= 0 ? result.worldSettings[result.selectedWorldIndex] : null;
  if (w) return `${w.title}\n核心卖点：${w.coreSellingPoint}\n${w.description}`;
  return result.customWorld || `${result.genre || "未定类型"}世界观待补全`;
}

function getSelectedCheatText(result: WizardResult) {
  const c = result.selectedCheatIndex >= 0 ? result.cheatOptions[result.selectedCheatIndex] : null;
  if (c) return `${c.name}（${c.type}）\n功能：${c.function}\n限制：${c.limitation}`;
  return result.customCheat || result.cheatType || "待补全金手指";
}

function buildFallbackStoryBible(result: WizardResult, proposal?: ProjectProposal | null): StoryBibleProposal {
  const targetWordCount = resolveTargetWordCount(result);
  const wordsPerChapter = resolveWordsPerChapter(result);
  const targetChapters = resolveTargetChapters(result);
  const foreshadowCount = targetWordCount <= 60000 ? 4 : targetWordCount <= 120000 ? 6 : 8;
  const rhythm = proposal?.rhythmTable.length ? proposal.rhythmTable : Array.from({ length: Math.min(10, targetChapters) }, (_, index) => ({
    chapterTitle: `第${index + 1}章`,
    coreEvent: index === 0 ? "异常开局，主角获得核心问题和短期目标" : "推进冲突、线索或爽点",
    isShuangdian: index % 3 === 2,
    beatType: index === 0 ? "setup" as BeatType : index % 5 === 4 ? "major_beat" as BeatType : "normal" as BeatType,
    hook: "章末留下行动钩子或信息钩子",
  }));
  return {
    premise: `${getSelectedProtagonistText(result)}\n核心创意：${result.creativeDirection || result.mainConflict || "待补全"}\n失败代价：主角的目标、关系或世界秩序被不可逆破坏。`,
    powerSystem: `体系：${result.powerSystem}\n要求：每一层都写清能力上限、突破条件、失败代价和社会地位。悬疑、都市、言情等题材应替换成贴合题材的能力层级，不要强行套修仙名词。`,
    worldFactions: getSelectedWorldText(result),
    goldenFinger: getSelectedCheatText(result),
    characterCards: getSelectedProtagonistText(result),
    openingScene: rhythm.slice(0, 10).map((item, index) => ({
      chapter: index + 1,
      goal: item.chapterTitle,
      event: item.coreEvent,
      conflict: result.mainConflict || "短期冲突待补全",
      hook: item.hook || "章末留钩子",
      beatType: item.beatType || "normal",
    })),
    foreshadowSeeds: Array.from({ length: foreshadowCount }, (_, index) => ({
      id: `f${String(index + 1).padStart(2, "0")}`,
      plantedChapter: Math.max(1, index * 2 + 1),
      payoffChapter: Math.min(targetChapters, Math.max(8, Math.round(targetChapters * (0.7 + index * (0.25 / Math.max(1, foreshadowCount - 1)))))),
      type: ["物品", "人物", "世界观", "事件", "身世"][index] || "伏笔",
      content: `围绕「${result.creativeDirection || result.mainConflict || getSelectedTitle(result)}」设置第${index + 1}条可回收伏笔。`,
      progress: 0,
    })),
    mainArc: `篇幅：${result.scale}\n目标字数：${targetWordCount.toLocaleString("zh-CN")} 字\n单章字数：${wordsPerChapter.toLocaleString("zh-CN")} 字\n目标章数：约 ${targetChapters} 章\n结构：${result.plotStructure}\n篇幅策略：${getScopeAdvice(targetWordCount)}\n阶段检查点：\n${formatArcCheckpoints(targetChapters).map((item) => `- ${item}`).join("\n")}`,
  };
}

function buildFallbackContinuationCard(storyBible: StoryBibleProposal): ContinuationCardProposal {
  return {
    protagonistState: "初始状态：尚未开写。请在第1章后更新境界/伤势/物品/技能/已知情报/当前目标。",
    activeConflicts: storyBible.openingScene.slice(0, 3).map((item) => item.conflict || item.event).filter(Boolean),
    foreshadowLedger: storyBible.foreshadowSeeds,
    rhythmState: "lastChapterBeat=normal; suggestedNextBeat=setup; minorBeatCount=0; majorBeatCount=0; climaxCount=0",
    boundaries: [
      "不得突破力量体系和金手指限制。",
      "每章至少推进一个冲突、线索或伏笔。",
      "章末必须有情绪钩子、信息钩子或行动钩子。",
    ],
    knowledgeState: "初始化：拆分主角知道、反派知道、读者知道的信息，避免角色提前知道不该知道的秘密。",
  };
}

function buildFallbackStyleProfile(result: WizardResult): StyleProfileProposal {
  const targetWordCount = resolveTargetWordCount(result);
  const isShort = targetWordCount <= 120000;
  return {
    sentenceLength: isShort ? "短句/中短句" : "中短句为主，关键场面可中长句",
    adjectiveDensity: "少到适中",
    pacingSpeed: isShort ? "极快" : "快",
    toneKeywords: result.stylePreferences.length ? result.stylePreferences : ["强钩子", "高密度", "清晰推进"],
    chapterRule: isShort
      ? "一个地点 + 一个规则 + 三个势力 + 一个倒计时 + 五条伏笔 + 一个结尾反转。"
      : "章纲驱动，写完一章更新续写卡；每章推进冲突或伏笔，卷末收束并生长新底本。",
  };
}

function formatLaunchControlCard(result: WizardResult, storyBible: StoryBibleProposal) {
  const targetWordCount = resolveTargetWordCount(result);
  const wordsPerChapter = resolveWordsPerChapter(result);
  const targetChapters = resolveTargetChapters(result);
  return `# 开书控制卡\n\n## 篇幅参数\n- 篇幅档位：${result.scale}\n- 目标字数：${targetWordCount.toLocaleString("zh-CN")} 字\n- 单章字数：${wordsPerChapter.toLocaleString("zh-CN")} 字\n- 目标章数：约 ${targetChapters} 章\n\n## 篇幅策略\n${getScopeAdvice(targetWordCount)}\n\n## 阶段检查点\n${formatArcCheckpoints(targetChapters).map((item) => `- ${item}`).join("\n")}\n\n## 开书硬约束\n- 第1章必须出现核心冲突、主角短期目标和失败代价。\n- 第3章前必须兑现一次可感知收益或情绪满足。\n- 每章至少推进一个冲突、线索或伏笔。\n- 伏笔必须记录 id、埋设章、预计回收章和进度。\n- 写完每章后刷新「续写卡·当前状态」，再写下一章。\n\n## 当前底本摘要\n- 圆心：${storyBible.premise.slice(0, 180)}\n- 主线：${storyBible.mainArc.slice(0, 220)}`;
}

function formatStoryBible(storyBible: StoryBibleProposal) {
  return `# 故事底本·八字段\n\n## 圆心钩子\n${storyBible.premise}\n\n## 力量体系\n${storyBible.powerSystem}\n\n## 世界势力\n${storyBible.worldFactions}\n\n## 金手指\n${storyBible.goldenFinger}\n\n## 人物设定\n${storyBible.characterCards}\n\n## 开篇十章\n${storyBible.openingScene.map((item) => `第${item.chapter}章：${item.goal}\n- 事件：${item.event}\n- 冲突：${item.conflict || "待补全"}\n- 节拍：${item.beatType || "normal"}\n- 钩子：${item.hook || "待补全"}`).join("\n\n")}\n\n## 伏笔种子\n${storyBible.foreshadowSeeds.map((seed) => `- ${seed.id || ""} 第${seed.plantedChapter}章埋，第${seed.payoffChapter || "待定"}章收｜${seed.type || "伏笔"}｜${seed.content}`).join("\n")}\n\n## 主线方向\n${storyBible.mainArc}`;
}

function formatBeatPlan(storyBible: StoryBibleProposal, rhythmTable: ChapterPlan[]) {
  const rows = rhythmTable.length ? rhythmTable : storyBible.openingScene.map((item) => ({
    chapterTitle: `第${item.chapter}章：${item.goal}`,
    coreEvent: item.event,
    isShuangdian: item.beatType === "minor_beat" || item.beatType === "major_beat" || item.beatType === "climax",
    beatType: item.beatType,
    hook: item.hook,
  }));
  return `# 章纲节拍表\n\n节拍类型：normal 常规 / setup 铺垫 / minor_beat 小爽 / major_beat 大爽 / climax 高潮 / transition 过渡\n\n${rows.map((item, index) => `## 第${index + 1}章 ${item.chapterTitle}\n- 节拍：${item.beatType || (item.isShuangdian ? "minor_beat" : "normal")}\n- 核心事件：${item.coreEvent}\n- 爽点：${item.isShuangdian ? "是" : "否"}\n- 章末钩子：${item.hook || "待补全"}`).join("\n\n")}`;
}

function formatForeshadowSeeds(seeds: ForeshadowSeed[]) {
  return `# 伏笔账本\n\n${seeds.map((seed) => `## ${seed.id || "foreshadow"}\n- 类型：${seed.type || "伏笔"}\n- 埋设章节：第${seed.plantedChapter}章\n- 回收章节：第${seed.payoffChapter || "待定"}章\n- 进度：${seed.progress ?? 0}%\n- 内容：${seed.content}`).join("\n\n")}`;
}

function formatContinuationCard(card: ContinuationCardProposal) {
  return `# 续写卡·当前状态\n\n## 主角状态\n${card.protagonistState}\n\n## 活跃冲突\n${card.activeConflicts.map((item) => `- ${item}`).join("\n") || "（待补全）"}\n\n## 伏笔账本\n${formatForeshadowSeeds(card.foreshadowLedger)}\n\n## 节奏状态\n${card.rhythmState}\n\n## 规则边界\n${card.boundaries.map((item) => `- ${item}`).join("\n") || "（待补全）"}\n\n## 知识状态\n${card.knowledgeState}`;
}

function formatStyleProfile(style: StyleProfileProposal) {
  return `# 文风参数卡\n\n- 句长：${style.sentenceLength}\n- 形容词密度：${style.adjectiveDensity}\n- 节奏速度：${style.pacingSpeed}\n- 关键词：${style.toneKeywords.join("、") || "待补全"}\n- 章节规则：${style.chapterRule}\n\n使用原则：学习节奏、冲突、信息释放和句式参数，不复刻具体作者原句、专有设定或标志性桥段。`;
}

function syncProposalToMemory(bookId: string | undefined, storyBible: StoryBibleProposal, card: ContinuationCardProposal) {
  if (!bookId) return;
  const memory = loadMemory(bookId);
  saveMemory({
    ...memory,
    worldAxioms: [
      ...memory.worldAxioms,
      { id: `axiom-power-${Date.now()}`, category: "power-system", rule: storyBible.powerSystem.slice(0, 600), trust: "gold" as const },
      { id: `axiom-cheat-${Date.now()}`, category: "other", rule: storyBible.goldenFinger.slice(0, 600), trust: "gold" as const },
      ...card.boundaries.map((rule, index) => ({ id: `axiom-boundary-${Date.now()}-${index}`, category: "other" as const, rule, trust: "gold" as const })),
    ],
    obligations: [
      ...memory.obligations,
      ...card.foreshadowLedger.map((seed, index) => ({
        id: seed.id || `ob-${Date.now()}-${index}`,
        type: "foreshadow" as const,
        setupChapter: seed.plantedChapter,
        setupText: seed.content,
        expectedPayoffChapter: seed.payoffChapter,
        status: "active" as const,
        notes: seed.type,
      })),
    ],
    chapterSummaries: [
      ...memory.chapterSummaries,
      ...storyBible.openingScene.map((item) => ({
        chapter: item.chapter,
        title: item.goal || `第${item.chapter}章`,
        oneLineHook: item.hook || item.event,
        beats: [item.goal, item.event, item.conflict || "", item.hook || ""].filter(Boolean),
        charactersOnStage: [],
        newFactsLearned: [],
        unresolvedThreads: item.hook ? [item.hook] : [],
        emotionCurve: item.beatType || "normal",
        trust: "gold" as const,
      })),
    ],
    updatedAt: Date.now(),
  });
}

export function InspirationWizard({
  open,
  bookId,
  onClose,
  settings,
  onOpenSettings,
  onAddToProject,
}: {
  open: boolean;
  bookId?: string;
  onClose: () => void;
  settings: ApiSettings;
  onOpenSettings: () => void;
  onAddToProject: (files: WorkspaceFile[]) => void;
}) {
  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const [wizardResult, setWizardResult] = useState<WizardResult>({
    title: "",
    protagonistName: "",
    creativeDirection: "",
    genre: "",
    tags: [],
    channel: "男频·青年向",
    scale: "超短篇 (5-10 万字)",
    targetWordCount: 50000,
    wordsPerChapter: 2000,
    plotStructure: "五幕式",
    stylePreferences: [],
    powerSystem: "修仙体系",
    cheatType: "系统金手指",
    mainConflict: "",
    bookTitles: [],
    protagonistProfiles: [],
    worldSettings: [],
    supportingCast: [],
    cheatOptions: [],
    projectProposal: null,
    selectedTitleIndex: -1,
    selectedProtagonistIndex: -1,
    selectedWorldIndex: -1,
    selectedSupportingIndex: -1,
    selectedCheatIndex: -1,
    customTitle: "",
    customProtagonist: "",
    customWorld: "",
    customSupporting: "",
    customCheat: "",
  });

  const updateResult = (patch: Partial<WizardResult>) => setWizardResult(prev => ({ ...prev, ...patch }));

  const handleGenerate = async (stepNum: number) => {
    if (!isConfigured(settings)) {
      onOpenSettings();
      return;
    }

    const targetWordCount = resolveTargetWordCount(wizardResult);
    const wordsPerChapter = resolveWordsPerChapter(wizardResult);
    const targetChapters = resolveTargetChapters(wizardResult);
    const ctx = `创作方向：${wizardResult.creativeDirection || "无"}
类型：${wizardResult.genre || "未选择"}
频道：${wizardResult.channel}
规模：${wizardResult.scale}
目标字数：${targetWordCount} 字
单章字数：${wordsPerChapter} 字
目标章数：约 ${targetChapters} 章
篇幅策略：${getScopeAdvice(targetWordCount)}
标签：${wizardResult.tags.join(", ") || "无"}
力量体系：${wizardResult.powerSystem}
金手指：${wizardResult.cheatType}`;

    let prompt = "";
    switch (stepNum) {
      case 2:
        prompt = `${ctx}\n\n请生成 6 个小说书名方案，每个书名 10-20 字，要吸引眼球，符合网文风格。只输出书名，每行一个。`;
        break;
      case 3:
        prompt = `${ctx}\n\n请生成 6 个主角人设方案，每个方案包含：姓名、身份标签、人设描述。每个方案之间用"---"分隔。`;
        break;
      case 4:
        prompt = `${ctx}\n\n请生成 6 个世界观设定方案，每个方案包含：标题、核心卖点、详细描述。每个方案之间用"---"分隔。`;
        break;
      case 5:
        prompt = `${ctx}\n\n请生成 6 组配角团方案，每组 4-5 个角色，每个角色包含：姓名、角色定位、性格、与主角关系。每组之间用"---"分隔。`;
        break;
      case 6:
        prompt = `${ctx}\n\n请生成 6 个金手指/系统方案，每个方案包含：名称、类型、功能、限制。每个方案之间用"---"分隔。`;
        break;
      case 7:
        const title = wizardResult.selectedTitleIndex >= 0 ? wizardResult.bookTitles[wizardResult.selectedTitleIndex] : wizardResult.customTitle;
        prompt = `${ctx}
书名：${title || "待定"}
主角：${getSelectedProtagonistText(wizardResult)}
世界观：${getSelectedWorldText(wizardResult)}
金手指：${getSelectedCheatText(wizardResult)}
主要冲突：${wizardResult.mainConflict || "待补全"}
目标字数：${targetWordCount}
单章字数：${wordsPerChapter}
目标章数：${targetChapters}
篇幅策略：${getScopeAdvice(targetWordCount)}

请整合以上所有选择，生成“笔落式开书底本”。严格输出 JSON，不要 Markdown，不要解释。
字段格式如下：
{
  "titles": ["3个备选书名"],
  "intro": "100字左右简介",
  "sellingPoints": ["3-5个核心卖点"],
  "rhythmTable": [
    {
      "chapterTitle": "章节名",
      "coreEvent": "核心事件",
      "beatType": "setup|normal|minor_beat|major_beat|climax|transition",
      "isShuangdian": true,
      "hook": "章末钩子"
    }
  ],
  "storyBible": {
    "premise": "圆心钩子：主角+核心冲突+失败代价",
    "powerSystem": "力量/能力体系：等级、上限、突破条件、代价、边界",
    "worldFactions": "世界势力：每个势力包含资源、规模、对主角态度、前10章行动",
    "goldenFinger": "金手指：来源、当前能力、代价、限制、成长阶段、终极暗示",
    "characterCards": "人物卡：主角、反派、盟友，包含欲望、恐惧、底线、说话方式、弧线",
    "openingScene": [
      {
        "chapter": 1,
        "goal": "本章目标",
        "event": "核心事件",
        "conflict": "冲突",
        "hook": "章末钩子",
        "beatType": "setup"
      }
    ],
    "foreshadowSeeds": [
      {
        "id": "f01",
        "plantedChapter": 1,
        "payoffChapter": 18,
        "type": "物品/人物/世界观/事件/身世",
        "content": "伏笔内容",
        "progress": 0
      }
    ],
    "mainArc": "按目标字数和目标章数规划主线。5万字聚焦一个地点一个规则；长篇必须按卷规划。"
  },
  "continuationCard": {
    "protagonistState": "开写前主角状态：能力、物品、已知情报、当前目标",
    "activeConflicts": ["当前活跃冲突"],
    "foreshadowLedger": [
      {
        "id": "f01",
        "plantedChapter": 1,
        "payoffChapter": 18,
        "type": "物品",
        "content": "伏笔内容",
        "progress": 0
      }
    ],
    "rhythmState": "上一章节拍、下一章建议节拍、当前卷进度",
    "boundaries": ["不可突破的能力边界/世界规则/人物底线"],
    "knowledgeState": "主角知道什么、反派知道什么、读者知道什么"
  },
  "styleProfile": {
    "sentenceLength": "短句/中短句/中长句",
    "adjectiveDensity": "少/适中/较多",
    "pacingSpeed": "极快/快/适中/慢",
    "toneKeywords": ["情绪关键词"],
    "chapterRule": "每章推进规则"
  }
}

要求：
- rhythmTable 至少给 10 章；如果目标章数不足 30 章，按目标章数完整规划关键节点。
- 如果目标字数 <= 60000：人物不超过 6 个核心角色，地点不超过 3 个，活跃支线不超过 2 条，伏笔 4-6 条即可。
- 伏笔回收点压在 70%-100% 篇幅，短篇不要把伏笔拖到故事外。
- foreshadowSeeds 必须是 JSON 数组，不要用“第几章埋|第几章收”的字符串。
- 风格只写参数，不模仿具体在世作者。`;
        break;
    }

    setGenerating(`step${stepNum}`);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await sendChat(settings, [{ role: "user", content: prompt }], undefined, controller.signal);

      switch (stepNum) {
        case 2:
          updateResult({ bookTitles: result.split("\n").filter((l: string) => l.trim()).slice(0, 6) });
          break;
        case 3: {
          const profiles = result.split(/---+/).filter((l: string) => l.trim()).slice(0, 6);
          updateResult({ protagonistProfiles: profiles.map((p: string) => {
            const lines = p.split("\n");
            return { name: lines[0]?.replace(/姓名[：:]/, "") || "未命名", identity: lines[1]?.replace(/身份[：:]/, "") || "", description: lines.slice(2).join("\n") };
          })});
          break;
        }
        case 4: {
          const worlds = result.split(/---+/).filter((l: string) => l.trim()).slice(0, 6);
          updateResult({ worldSettings: worlds.map((w: string) => {
            const lines = w.split("\n");
            return { title: lines[0]?.replace(/标题[：:]/, "") || "未命名", coreSellingPoint: lines[1]?.replace(/核心卖点[：:]/, "") || "", description: lines.slice(2).join("\n") };
          })});
          break;
        }
        case 5: {
          const groups = result.split(/---+/).filter((l: string) => l.trim()).slice(0, 6);
          updateResult({ supportingCast: groups.map((group: string) => {
            const chars = group.split("\n\n").filter((l: string) => l.trim());
            return chars.map((c: string) => {
              const lines = c.split("\n");
              return { name: lines[0]?.replace(/姓名[：:]/, "") || "未命名", role: lines[1]?.replace(/角色[定位 ]*[：:]/, "") || "", personality: lines[2]?.replace(/性格[：:]/, "") || "", relationship: lines[3]?.replace(/关系[：:]/, "") || "" };
            });
          })});
          break;
        }
        case 6: {
          const cheats = result.split(/---+/).filter((l: string) => l.trim()).slice(0, 6);
          updateResult({ cheatOptions: cheats.map((c: string) => {
            const lines = c.split("\n");
            return { name: lines[0]?.replace(/名称[：:]/, "") || "未命名", type: lines[1]?.replace(/类型[：:]/, "") || "", function: lines[2]?.replace(/功能[：:]/, "") || "", limitation: lines[3]?.replace(/限制[：:]/, "") || "" };
          })});
          break;
        }
        case 7: {
          const parsed = parseProjectProposal(result);
          if (parsed) {
            updateResult({ projectProposal: parsed });
            break;
          }
          const sections = result.split(/\d+\./);
          const titles = sections[1]?.split("\n").filter((l: string) => l.trim()).slice(0, 3) || [];
          const intro = sections[2]?.split("\n").filter((l: string) => l.trim()).join("\n") || "";
          const sellingPoints = sections[3]?.split("\n").filter((l: string) => l.trim()).slice(0, 3) || [];
          const rhythmSection = sections[4] || "";
          const chapterLines = rhythmSection.split("\n").filter((l: string) => l.includes("第") && l.includes("章"));
          const rhythmTable: ChapterPlan[] = chapterLines.map((line: string) => ({
            chapterTitle: line.replace(/第[零一二三四五六七八九十百千万 0-9]+章[：:：]?\s*/, "").trim(),
            coreEvent: line.trim(),
            isShuangdian: Boolean(line.includes("爽点")),
            beatType: line.includes("高潮") ? "climax" : line.includes("铺垫") ? "setup" : line.includes("过渡") ? "transition" : line.includes("爽点") ? "minor_beat" : "normal",
          }));
          const fallback: ProjectProposal = { titles, intro, sellingPoints, rhythmTable };
          fallback.storyBible = buildFallbackStoryBible(wizardResult, fallback);
          fallback.continuationCard = buildFallbackContinuationCard(fallback.storyBible);
          fallback.styleProfile = buildFallbackStyleProfile(wizardResult);
          updateResult({ projectProposal: fallback });
          break;
        }
      }
    } catch (e) {
      if (controller.signal.aborted) {
        showToast("已停止生成", "info");
      } else {
        showToast(e instanceof Error ? e.message : "生成失败", "error");
      }
    } finally {
      setGenerating(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleCreate = () => {
    const files: WorkspaceFile[] = [];
    const proposal = wizardResult.projectProposal;
    const storyBible = proposal?.storyBible ?? buildFallbackStoryBible(wizardResult, proposal);
    const continuationCard = proposal?.continuationCard ?? buildFallbackContinuationCard(storyBible);
    const styleProfile = proposal?.styleProfile ?? buildFallbackStyleProfile(wizardResult);

    syncProposalToMemory(bookId, storyBible, continuationCard);

    files.push({
      id: `control-${Date.now()}`,
      category: "项目底本",
      title: "开书控制卡",
      content: formatLaunchControlCard(wizardResult, storyBible),
      summary: "目标字数、目标章数、阶段检查点和开书硬约束",
      updatedAt: Date.now(),
    });

    files.push({
      id: `bible-${Date.now()}`,
      category: "项目底本",
      title: "故事底本·八字段",
      content: formatStoryBible(storyBible),
      summary: "圆心、力量体系、世界势力、金手指、人物、开篇十章、伏笔、主线",
      updatedAt: Date.now(),
    });

    files.push({
      id: `beat-${Date.now()}`,
      category: "剧情大纲",
      title: "章纲节拍表",
      content: formatBeatPlan(storyBible, proposal?.rhythmTable ?? []),
      summary: "章纲、节拍、爽点和章末钩子",
      updatedAt: Date.now(),
    });

    files.push({
      id: `foreshadow-${Date.now()}`,
      category: "反崩盘",
      title: "伏笔账本",
      content: formatForeshadowSeeds(continuationCard.foreshadowLedger.length ? continuationCard.foreshadowLedger : storyBible.foreshadowSeeds),
      summary: "伏笔埋设、预计回收和推进进度",
      updatedAt: Date.now(),
    });

    files.push({
      id: `card-${Date.now()}`,
      category: "反崩盘",
      title: "续写卡·当前状态",
      content: formatContinuationCard(continuationCard),
      summary: "主角状态、活跃冲突、规则边界和知识状态",
      updatedAt: Date.now(),
    });

    files.push({
      id: `style-${Date.now()}`,
      category: "项目底本",
      title: "文风参数卡",
      content: formatStyleProfile(styleProfile),
      summary: "句长、节奏、情绪关键词和章节规则",
      updatedAt: Date.now(),
    });

    // 主角设定文件
    const protagonist = wizardResult.selectedProtagonistIndex >= 0 ? wizardResult.protagonistProfiles[wizardResult.selectedProtagonistIndex] : null;
    if (protagonist) {
      files.push({
        id: `protagonist-${Date.now()}`,
        category: "角色",
        title: protagonist.name || "主角",
        content: `# 主角设定\n\n姓名：${protagonist.name}\n身份：${protagonist.identity}\n\n## 人设描述\n${protagonist.description}`,
        summary: `主角：${protagonist.name} - ${protagonist.identity}`,
        updatedAt: Date.now(),
      });
    }

    // 世界观设定文件
    const world = wizardResult.selectedWorldIndex >= 0 ? wizardResult.worldSettings[wizardResult.selectedWorldIndex] : null;
    if (world) {
      files.push({
        id: `world-${Date.now()}`,
        category: "设定",
        title: world.title || "世界观",
        content: `# 世界观设定\n\n## ${world.title}\n\n**核心卖点**：${world.coreSellingPoint}\n\n## 详细描述\n${world.description}`,
        summary: `世界观：${world.title}`,
        updatedAt: Date.now(),
      });
    }

    // 配角团文件
    const supporting = wizardResult.selectedSupportingIndex >= 0 ? wizardResult.supportingCast[wizardResult.selectedSupportingIndex] : [];
    if (supporting.length > 0) {
      files.push({
        id: `supporting-${Date.now()}`,
        category: "角色",
        title: "配角团",
        content: `# 配角团设定\n\n${supporting.map(c => `## ${c.name}\n- 定位：${c.role}\n- 性格：${c.personality}\n- 与主角关系：${c.relationship}`).join("\n\n")}`,
        summary: `${supporting.length} 个配角`,
        updatedAt: Date.now(),
      });
    }

    // 金手指设定文件
    const cheat = wizardResult.selectedCheatIndex >= 0 ? wizardResult.cheatOptions[wizardResult.selectedCheatIndex] : null;
    if (cheat) {
      files.push({
        id: `cheat-${Date.now()}`,
        category: "设定",
        title: "金手指设定",
        content: `# 金手指设定\n\n名称：${cheat.name}\n类型：${cheat.type}\n\n功能：${cheat.function}\n\n限制：${cheat.limitation}`,
        summary: `金手指：${cheat.name}`,
        updatedAt: Date.now(),
      });
    }

    // 立项书文件
    if (proposal) {
      files.push({
        id: `proposal-${Date.now()}`,
        category: "知识库",
        title: "小说立项书",
        content: `# 小说立项书\n\n## 备选书名\n${proposal.titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n## 简介\n${proposal.intro}\n\n## 核心卖点\n${proposal.sellingPoints.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n## 爽点节奏表\n${proposal.rhythmTable.map((c, i) => `第${i + 1}章：${c.chapterTitle}${c.isShuangdian ? " ⭐爽点" : ""}${c.beatType ? `｜${c.beatType}` : ""}`).join("\n")}`,
        summary: "立项书与节奏规划",
        updatedAt: Date.now(),
      });
    }

    // 灵感摘要文件
    files.push({
      id: `summary-${Date.now()}`,
      category: "知识库",
      title: "灵感摘要",
      content: `# 灵感摘要\n\n类型：${wizardResult.genre}\n频道：${wizardResult.channel}\n规模：${wizardResult.scale}\n目标字数：${resolveTargetWordCount(wizardResult).toLocaleString("zh-CN")} 字\n单章字数：${resolveWordsPerChapter(wizardResult).toLocaleString("zh-CN")} 字\n目标章数：约 ${resolveTargetChapters(wizardResult)} 章\n情节结构：${wizardResult.plotStructure}\n风格偏好：${wizardResult.stylePreferences.join(", ")}\n力量体系：${wizardResult.powerSystem}\n金手指类型：${wizardResult.cheatType}\n\n标签：${wizardResult.tags.join(", ")}\n\n创作方向：${wizardResult.creativeDirection || "无"}\n主要冲突：${wizardResult.mainConflict || "待补充"}`,
      summary: "灵感向导配置摘要",
      updatedAt: Date.now(),
    });

    onAddToProject(files);
    onClose();
  };

  if (!open) return null;

  const canNext = () => {
    switch (step) {
      case 1: return true;
      case 2: return wizardResult.bookTitles.length > 0 || wizardResult.customTitle;
      case 3: return wizardResult.protagonistProfiles.length > 0 || wizardResult.customProtagonist;
      case 4: return wizardResult.worldSettings.length > 0 || wizardResult.customWorld;
      case 5: return wizardResult.supportingCast.length > 0 || wizardResult.customSupporting;
      case 6: return wizardResult.cheatOptions.length > 0 || wizardResult.customCheat;
      case 7: return !!wizardResult.projectProposal;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < 7 && canNext()) {
      setStep(prev => prev + 1);
      if (step >= 1 && step <= 6) handleGenerate(step + 1);
    }
  };

  const handlePrev = () => { if (step > 1) setStep(step - 1); };

  const stepIcons = [null, <Sparkles key="1" className="h-5 w-5" />, <User key="2" className="h-5 w-5" />, <Globe key="3" className="h-5 w-5" />, <Users key="4" className="h-5 w-5" />, <Zap key="5" className="h-5 w-5" />, <BookOpen key="6" className="h-5 w-5" />, <CheckCircle2 key="7" className="h-5 w-5" />];
  const stepNames = ["", "构建配置", "书名方案", "主角人设", "世界观设定", "配角团", "金手指", "确认创建"];
  const resolvedTargetWordCount = resolveTargetWordCount(wizardResult);
  const resolvedWordsPerChapter = resolveWordsPerChapter(wizardResult);
  const resolvedTargetChapters = resolveTargetChapters(wizardResult);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white">✨ 灵感向导</h2>
            <span className="text-sm text-slate-500">Step {step}/7</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setWizardResult({ title: "", protagonistName: "", creativeDirection: "", genre: "", tags: [], channel: "男频·青年向", scale: "超短篇 (5-10 万字)", targetWordCount: 50000, wordsPerChapter: 2000, plotStructure: "五幕式", stylePreferences: [], powerSystem: "修仙体系", cheatType: "系统金手指", mainConflict: "", bookTitles: [], protagonistProfiles: [], worldSettings: [], supportingCast: [], cheatOptions: [], projectProposal: null, selectedTitleIndex: -1, selectedProtagonistIndex: -1, selectedWorldIndex: -1, selectedSupportingIndex: -1, selectedCheatIndex: -1, customTitle: "", customProtagonist: "", customWorld: "", customSupporting: "", customCheat: "" }); setStep(1); }} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">重置</button>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Progress */}
        <div className="border-b border-slate-800 px-6 py-3 shrink-0">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map(s => (
              <div key={s} className={`h-2 flex-1 rounded-full ${s <= step ? "bg-purple-500" : "bg-slate-700"}`} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: 构建配置 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">小说名称 <span className="text-slate-500">(留空则 AI 自动取名)</span></label>
                <input value={wizardResult.title} onChange={e => updateResult({ title: e.target.value })} placeholder="输入小说名称..." className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">主角名称 <span className="text-slate-500">(留空则 AI 自动生成)</span></label>
                <input value={wizardResult.protagonistName} onChange={e => updateResult({ protagonistName: e.target.value })} placeholder="输入主角名称..." className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">创作方向 <span className="text-slate-500">(选填)</span></label>
                <textarea value={wizardResult.creativeDirection} onChange={e => updateResult({ creativeDirection: e.target.value })} placeholder="简要描述你想写的故事方向或核心创意..." className="w-full h-24 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">小说类型</label>
                <div className="flex flex-wrap gap-2">
                  {GENRES.map(g => (
                    <button key={g} onClick={() => updateResult({ genre: g })} className={`rounded-lg px-4 py-2 text-sm ${wizardResult.genre === g ? "bg-purple-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{g}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">核心设定 / 流派</label>
                <div className="space-y-3">
                  {Object.entries(TAG_CATEGORIES).map(([cat, tags]) => (
                    <div key={cat}>
                      <div className="mb-1.5 text-xs font-medium text-slate-400">{cat} <span className="text-slate-600">({wizardResult.tags.filter(t => tags.includes(t)).length}/{tags.length})</span></div>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map(t => (
                          <button key={t} onClick={() => updateResult({ tags: wizardResult.tags.includes(t) ? wizardResult.tags.filter(x => x !== t) : [...wizardResult.tags, t] })} className={`rounded-md px-2.5 py-1 text-xs ${wizardResult.tags.includes(t) ? "bg-purple-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{t}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">受众定位</label>
                <select value={wizardResult.channel} onChange={e => updateResult({ channel: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500">
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">篇幅字数</label>
                <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {TARGET_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => updateResult({ scale: preset.scale, targetWordCount: preset.targetWordCount, wordsPerChapter: preset.wordsPerChapter, projectProposal: null })}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${wizardResult.targetWordCount === preset.targetWordCount ? "border-purple-500 bg-purple-500/10 text-white" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                    >
                      <div className="text-sm font-medium">{preset.label}</div>
                      <div className="text-xs text-slate-500">{Math.ceil(preset.targetWordCount / preset.wordsPerChapter)}章 · {preset.wordsPerChapter}字/章</div>
                    </button>
                  ))}
                </div>
                <select value={wizardResult.scale} onChange={e => updateResult({ scale: e.target.value, targetWordCount: targetWordCountForScale(e.target.value), wordsPerChapter: wordsPerChapterForScale(e.target.value), projectProposal: null })} className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500">
                  {SCALES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="block rounded-xl border border-slate-700 bg-slate-800 p-3">
                    <span className="mb-1 block text-xs text-slate-500">目标字数</span>
                    <input
                      type="number"
                      min={10000}
                      step={10000}
                      value={wizardResult.targetWordCount}
                      onChange={e => updateResult({ targetWordCount: Number(e.target.value) || 10000, projectProposal: null })}
                      className="w-full bg-transparent text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block rounded-xl border border-slate-700 bg-slate-800 p-3">
                    <span className="mb-1 block text-xs text-slate-500">单章字数</span>
                    <input
                      type="number"
                      min={800}
                      step={100}
                      value={wizardResult.wordsPerChapter}
                      onChange={e => updateResult({ wordsPerChapter: Number(e.target.value) || 800, projectProposal: null })}
                      className="w-full bg-transparent text-sm text-white outline-none"
                    />
                  </label>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <div className="text-xs text-emerald-300">目标章数</div>
                    <div className="mt-1 text-lg font-semibold text-white">约 {resolvedTargetChapters} 章</div>
                    <div className="mt-1 text-xs text-slate-400">{resolvedTargetWordCount.toLocaleString("zh-CN")}字 / {resolvedWordsPerChapter.toLocaleString("zh-CN")}字</div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{getScopeAdvice(resolvedTargetWordCount)}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">情节结构模式</label>
                <div className="space-y-2">
                  {PLOT_STRUCTURES.map(ps => (
                    <button key={ps.name} onClick={() => updateResult({ plotStructure: ps.name })} className={`w-full text-left rounded-xl border p-3 ${wizardResult.plotStructure === ps.name ? "border-purple-500 bg-purple-500/10" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}>
                      <div className="text-sm font-medium text-white">{ps.name}</div>
                      <div className="text-xs text-slate-500">{ps.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">风格偏好</label>
                <div className="flex flex-wrap gap-2">
                  {STYLE_PREFERENCES.map(s => (
                    <button key={s} onClick={() => updateResult({ stylePreferences: wizardResult.stylePreferences.includes(s) ? wizardResult.stylePreferences.filter(x => x !== s) : [...wizardResult.stylePreferences, s] })} className={`rounded-lg px-3 py-1.5 text-xs ${wizardResult.stylePreferences.includes(s) ? "bg-purple-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{s}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">力量体系</label>
                <div className="space-y-2">
                  {Object.entries(POWER_SYSTEMS).map(([cat, systems]) => (
                    <div key={cat}>
                      <div className="mb-1 text-xs text-slate-500">{cat}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {systems.map(s => (
                          <button key={s} onClick={() => updateResult({ powerSystem: s })} className={`rounded-md px-2.5 py-1 text-xs ${wizardResult.powerSystem === s ? "bg-purple-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">金手指类型</label>
                <div className="space-y-2">
                  {Object.entries(CHEAT_SYSTEMS).map(([cat, cheats]) => (
                    <div key={cat}>
                      <div className="mb-1 text-xs text-slate-500">{cat}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {cheats.map(c => (
                          <button key={c} onClick={() => updateResult({ cheatType: c })} className={`rounded-md px-2.5 py-1 text-xs ${wizardResult.cheatType === c ? "bg-purple-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{c}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">主要冲突</label>
                <textarea value={wizardResult.mainConflict} onChange={e => updateResult({ mainConflict: e.target.value })} placeholder="描述小说的核心矛盾冲突..." className="w-full h-20 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
              </div>
            </div>
          )}

          {/* Steps 2-7 */}
          {step >= 2 && step <= 7 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-purple-400">{stepIcons[step]}<span className="font-medium">{stepNames[step]}</span></div>

              {step === 2 && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">{wizardResult.bookTitles.length} 个方案</span>
                    <button onClick={() => handleGenerate(2)} disabled={generating === "step2"} className="flex items-center gap-1.5 rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${generating === "step2" ? "animate-spin" : ""}`} />换一批</button>
                  </div>
                  <div className="grid gap-2">
                    {wizardResult.bookTitles.map((t, i) => (
                      <button key={i} onClick={() => updateResult({ selectedTitleIndex: i, customTitle: "" })} className={`rounded-xl border p-3 text-left ${wizardResult.selectedTitleIndex === i ? "border-purple-500 bg-purple-500/10" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}>
                        <div className="flex items-center justify-between"><span className="text-sm text-white">{t}</span>{wizardResult.selectedTitleIndex === i && <span className="text-xs text-purple-400">✓</span>}</div>
                      </button>
                    ))}
                  </div>
                  <input value={wizardResult.customTitle} onChange={e => updateResult({ customTitle: e.target.value, selectedTitleIndex: -1 })} placeholder="或自定义书名..." className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
                </>
              )}

              {step === 3 && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">{wizardResult.protagonistProfiles.length} 个方案</span>
                    <button onClick={() => handleGenerate(3)} disabled={generating === "step3"} className="flex items-center gap-1.5 rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${generating === "step3" ? "animate-spin" : ""}`} />换一批</button>
                  </div>
                  <div className="grid gap-2">
                    {wizardResult.protagonistProfiles.map((p, i) => (
                      <button key={i} onClick={() => updateResult({ selectedProtagonistIndex: i, customProtagonist: "" })} className={`rounded-xl border p-3 text-left ${wizardResult.selectedProtagonistIndex === i ? "border-purple-500 bg-purple-500/10" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}>
                        <div className="flex items-center justify-between"><span className="text-sm text-white"><b>{p.name}</b> · {p.identity}</span>{wizardResult.selectedProtagonistIndex === i && <span className="text-xs text-purple-400">✓</span>}</div>
                        <p className="mt-1 text-xs text-slate-400">{p.description}</p>
                      </button>
                    ))}
                  </div>
                  <textarea value={wizardResult.customProtagonist} onChange={e => updateResult({ customProtagonist: e.target.value, selectedProtagonistIndex: -1 })} placeholder="或自定义主角人设..." className="w-full h-28 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
                </>
              )}

              {step === 4 && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">{wizardResult.worldSettings.length} 个方案</span>
                    <button onClick={() => handleGenerate(4)} disabled={generating === "step4"} className="flex items-center gap-1.5 rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${generating === "step4" ? "animate-spin" : ""}`} />换一批</button>
                  </div>
                  <div className="grid gap-2">
                    {wizardResult.worldSettings.map((w, i) => (
                      <button key={i} onClick={() => updateResult({ selectedWorldIndex: i, customWorld: "" })} className={`rounded-xl border p-3 text-left ${wizardResult.selectedWorldIndex === i ? "border-purple-500 bg-purple-500/10" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}>
                        <div className="flex items-center justify-between"><span className="text-sm text-white"><b>{w.title}</b></span>{wizardResult.selectedWorldIndex === i && <span className="text-xs text-purple-400">✓</span>}</div>
                        <p className="mt-1 text-xs text-purple-300">{w.coreSellingPoint}</p>
                      </button>
                    ))}
                  </div>
                  <textarea value={wizardResult.customWorld} onChange={e => updateResult({ customWorld: e.target.value, selectedWorldIndex: -1 })} placeholder="或自定义世界观..." className="w-full h-28 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
                </>
              )}

              {step === 5 && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">{wizardResult.supportingCast.length} 组方案</span>
                    <button onClick={() => handleGenerate(5)} disabled={generating === "step5"} className="flex items-center gap-1.5 rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${generating === "step5" ? "animate-spin" : ""}`} />换一批</button>
                  </div>
                  <div className="grid gap-2">
                    {wizardResult.supportingCast.map((group, i) => (
                      <button key={i} onClick={() => updateResult({ selectedSupportingIndex: i, customSupporting: "" })} className={`rounded-xl border p-3 text-left ${wizardResult.selectedSupportingIndex === i ? "border-purple-500 bg-purple-500/10" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}>
                        <div className="flex items-center justify-between"><span className="text-sm text-white">{group.length} 个角色</span>{wizardResult.selectedSupportingIndex === i && <span className="text-xs text-purple-400">✓</span>}</div>
                        <p className="mt-1 text-xs text-slate-400">{group.map(c => `${c.name}(${c.role})`).join(", ")}</p>
                      </button>
                    ))}
                  </div>
                  <textarea value={wizardResult.customSupporting} onChange={e => updateResult({ customSupporting: e.target.value, selectedSupportingIndex: -1 })} placeholder="或自定义配角团..." className="w-full h-28 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
                </>
              )}

              {step === 6 && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">{wizardResult.cheatOptions.length} 个方案</span>
                    <button onClick={() => handleGenerate(6)} disabled={generating === "step6"} className="flex items-center gap-1.5 rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${generating === "step6" ? "animate-spin" : ""}`} />换一批</button>
                  </div>
                  <div className="grid gap-2">
                    {wizardResult.cheatOptions.map((c, i) => (
                      <button key={i} onClick={() => updateResult({ selectedCheatIndex: i, customCheat: "" })} className={`rounded-xl border p-3 text-left ${wizardResult.selectedCheatIndex === i ? "border-purple-500 bg-purple-500/10" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}>
                        <div className="flex items-center justify-between"><span className="text-sm text-white"><b>{c.name}</b> · {c.type}</span>{wizardResult.selectedCheatIndex === i && <span className="text-xs text-purple-400">✓</span>}</div>
                        <p className="mt-1 text-xs text-slate-400">功能：{c.function}</p>
                      </button>
                    ))}
                  </div>
                  <textarea value={wizardResult.customCheat} onChange={e => updateResult({ customCheat: e.target.value, selectedCheatIndex: -1 })} placeholder="或自定义金手指..." className="w-full h-28 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-purple-500" />
                </>
              )}

              {step === 7 && wizardResult.projectProposal && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                      <div className="text-xs text-slate-500">目标字数</div>
                      <div className="mt-1 text-sm font-semibold text-white">{resolvedTargetWordCount.toLocaleString("zh-CN")} 字</div>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                      <div className="text-xs text-slate-500">目标章数</div>
                      <div className="mt-1 text-sm font-semibold text-white">约 {resolvedTargetChapters} 章</div>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                      <div className="text-xs text-slate-500">伏笔数量</div>
                      <div className="mt-1 text-sm font-semibold text-white">{(wizardResult.projectProposal.continuationCard?.foreshadowLedger.length || wizardResult.projectProposal.storyBible?.foreshadowSeeds.length || 0)} 条</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 mb-2">备选书名</h4>
                    <div className="space-y-1">{wizardResult.projectProposal.titles.map((t, i) => <p key={i} className="text-xs text-slate-400">{i + 1}. {t}</p>)}</div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 mb-2">简介</h4>
                    <p className="text-xs text-slate-400">{wizardResult.projectProposal.intro}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 mb-2">核心卖点</h4>
                    <div className="space-y-1">{wizardResult.projectProposal.sellingPoints.map((s, i) => <p key={i} className="text-xs text-slate-400">{i + 1}. {s}</p>)}</div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 mb-2">爽点节奏表</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">{wizardResult.projectProposal.rhythmTable.map((c, i) => <p key={i} className="text-xs text-slate-400">{c.chapterTitle}{c.isShuangdian ? " ⭐" : ""}</p>)}</div>
                  </div>
                  <p className="text-xs text-emerald-400">确认后将自动创建：开书控制卡、八字段底本、开篇节拍、伏笔账本、续写卡、文风参数，并同步到反崩盘记忆库。</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
          <button onClick={handlePrev} disabled={step === 1} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"><ChevronLeft className="h-4 w-4" />返回</button>
          <div className="flex gap-3">
            {step < 7 ? (
              <button onClick={handleNext} disabled={!canNext() || Boolean(generating)} className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-6 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed">下一步<ChevronRight className="h-4 w-4" /></button>
            ) : (
              <button onClick={handleCreate} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-600"><CheckCircle2 className="h-4 w-4" />确认创建</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

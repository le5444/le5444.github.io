import { htmlToPlainText, loadJSON, parseSkillMetadata, saveJSON, uid } from "../utils/helpers";

export const DISTILLATIONS_KEY = "novelsmith-distillations";

export type DistillationTargetType = "work" | "genre" | "author" | "character";
export type SourceMaterialType = "novel" | "other";

export const DISTILLATION_TARGET_LABELS: Record<DistillationTargetType, string> = {
  work: "作品蒸馏",
  genre: "类型蒸馏",
  author: "作者蒸馏",
  character: "角色蒸馏",
};

export const SOURCE_MATERIAL_LABELS: Record<SourceMaterialType, string> = {
  novel: "小说原文",
  other: "辅助资料",
};

export interface DistilledProfile {
  id: string;
  title: string;
  sourceNames: string[];
  createdAt: number;
  updatedAt: number;
  wordCount: number;
  analysisMode?: "local" | "sample-ai" | "full-ai";
  analyzedChars?: number;
  sourceCharCount?: number;
  chunkCount?: number;
  targetType?: DistillationTargetType;
  targetLabel?: string;
  targetTypes?: DistillationTargetType[];
  targetLabels?: string[];
  primarySkill?: string;
  skillTags?: string[];
  distillationPrinciple?: string;
  materialBreakdown?: string[];
  researchNotes?: string[];
  qualityChecks?: string[];
  summary: string;
  voiceDna: string[];
  narrativeModels: string[];
  decisionHeuristics: string[];
  narrativeEngines?: string[];
  mechanismLayers?: string[];
  chapterRules?: string[];
  readerEmotionLoop?: string[];
  generationChecks?: string[];
  antiPatterns: string[];
  boundaries: string[];
  lexicon: string[];
  sentencePatterns: string[];
  sceneRhythm: string[];
  dialogueRules: string[];
  prompt: string;
}

const DEFAULT_STOP_WORDS = new Set([
  "一个", "一种", "一样", "这个", "那个", "他们", "她们", "我们", "你们", "自己", "什么", "怎么", "因为", "所以",
  "然后", "已经", "只是", "不是", "没有", "还是", "可以", "不能", "不会", "开始", "起来", "出去", "回来",
]);

function sanitizeLegacyMaterialText(text: string) {
  return text
    .replace(/按材料类型加权：小说原文最高，作者创作谈用于解释意图，读者评论用于校验情绪回报，书评拆解只作辅助。/g, "以小说原文为最高依据；辅助资料只用于补充背景和校对判断，不能替代原文机制。")
    .replace(/区分一手文本、作者创作谈、读者反馈和二手书评，不要把二手总结当成原作机制。/g, "区分小说原文和辅助资料，不要把二手总结当成原作机制。")
    .replace(/保留素材构成和研究轨迹，说明哪些结论来自小说原文，哪些来自作者创作谈或读者反馈。/g, "保留素材构成和研究轨迹，说明哪些结论来自小说原文，哪些只是辅助资料补充。")
    .replace(/作者访谈\/创作谈|作者访谈|作者创作谈|创作谈|读者评论|读者反馈|书评拆解|二手书评|平台\/榜单数据|平台数据|榜单数据/g, "辅助资料")
    .replace(/辅助资料、辅助资料和辅助资料/g, "辅助资料")
    .replace(/辅助资料\/辅助资料/g, "辅助资料");
}

function sanitizeLegacyProfile(profile: DistilledProfile): DistilledProfile {
  const meta = parseSkillMetadata(profile.prompt || "");
  const fallbackPrimarySkill = profile.targetLabel || (profile.targetType ? DISTILLATION_TARGET_LABELS[profile.targetType] : "未分类");
  const sanitizeList = (items?: string[]) => items?.map(sanitizeLegacyMaterialText);
  return {
    ...profile,
    primarySkill: profile.primarySkill || meta.primarySkill || fallbackPrimarySkill,
    skillTags: profile.skillTags?.length ? profile.skillTags : (meta.skillTags.length ? meta.skillTags : [fallbackPrimarySkill]),
    materialBreakdown: sanitizeList(profile.materialBreakdown),
    researchNotes: sanitizeList(profile.researchNotes),
    qualityChecks: sanitizeList(profile.qualityChecks),
    boundaries: sanitizeList(profile.boundaries) || profile.boundaries,
    prompt: sanitizeLegacyMaterialText(profile.prompt || ""),
  };
}

export function loadDistillations(): DistilledProfile[] {
  return loadJSON<DistilledProfile[]>(DISTILLATIONS_KEY, []).map(sanitizeLegacyProfile);
}

export function saveDistillations(items: DistilledProfile[]) {
  saveJSON(DISTILLATIONS_KEY, items);
}

function splitParagraphs(text: string) {
  return text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
}

function topTerms(text: string, limit = 18) {
  const counts = new Map<string, number>();
  const words = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  words.forEach((word) => {
    if (DEFAULT_STOP_WORDS.has(word)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
  });
  return [...counts.entries()]
    .filter(([, count]) => count > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function ratioLabel(value: number, low: string, mid: string, high: string) {
  if (value < 0.18) return low;
  if (value < 0.38) return mid;
  return high;
}

function inferSkillMetadata(
  targetType: DistillationTargetType,
  targetLabel: string,
  dialogueRatio: number,
  shortParagraphRatio: number,
  exclamationRatio: number,
  avgParagraph: number,
) {
  const tags = new Set<string>([targetLabel]);
  if (dialogueRatio > 0.36) tags.add("对话驱动");
  if (shortParagraphRatio > 0.38) tags.add("快节奏");
  if (exclamationRatio > 0.45) tags.add("情绪外放");
  if (avgParagraph > 120) tags.add("铺陈型");
  if (targetType === "genre") tags.add("类型公式");
  if (targetType === "author") tags.add("作者操作系统");
  if (targetType === "character") tags.add("人物驱动");
  if (targetType === "work") tags.add("单部作品");

  let primarySkill = targetLabel;
  if (shortParagraphRatio > 0.38) primarySkill = "快节奏推进";
  else if (dialogueRatio > 0.36) primarySkill = "对话驱动";
  else if (exclamationRatio > 0.45) primarySkill = "情绪爆点";
  else if (avgParagraph > 120) primarySkill = "铺陈叙事";
  else if (targetType === "genre") primarySkill = "类型公式";
  else if (targetType === "author") primarySkill = "作者操作系统";
  else if (targetType === "character") primarySkill = "人物驱动";

  return {
    primarySkill,
    skillTags: [...tags].slice(0, 8),
  };
}

export function createLocalDistillation(
  title: string,
  sources: Array<{ name: string; content: string; materialType?: SourceMaterialType }>,
  options: { targetType?: DistillationTargetType; targetTypes?: DistillationTargetType[]; targetLabel?: string } = {},
): DistilledProfile {
  const targetTypes = options.targetTypes?.length ? [...new Set(options.targetTypes)] : [options.targetType || "work"];
  const targetType = targetTypes[0];
  const targetLabels = targetTypes.map((type) => DISTILLATION_TARGET_LABELS[type]);
  const targetLabel = options.targetLabel?.trim() || targetLabels.join(" + ");
  const plain = htmlToPlainText(sources.map((source) => source.content).join("\n\n"));
  const paragraphs = splitParagraphs(plain);
  const wordCount = (plain.match(/[\u4e00-\u9fa5A-Za-z0-9]/g) || []).length;
  const avgParagraph = paragraphs.length ? Math.round(wordCount / paragraphs.length) : 0;
  const dialogueLines = paragraphs.filter((p) => /[“”「」『』"]/.test(p) || /^[^，。！？]{1,12}[：:]/.test(p));
  const dialogueRatio = paragraphs.length ? dialogueLines.length / paragraphs.length : 0;
  const shortParagraphRatio = paragraphs.length ? paragraphs.filter((p) => p.length < 35).length / paragraphs.length : 0;
  const exclamationRatio = plain.length ? (plain.match(/[！!？?]/g) || []).length / Math.max(1, paragraphs.length) : 0;
  const lexicon = topTerms(plain);
  const materialCounts = sources.reduce((map, source) => {
    const type = source.materialType || "novel";
    map.set(type, (map.get(type) || 0) + 1);
    return map;
  }, new Map<SourceMaterialType, number>());
  const materialBreakdown = [...materialCounts.entries()].map(([type, count]) => `${SOURCE_MATERIAL_LABELS[type]}：${count} 个文件`);
  const rhythm = ratioLabel(shortParagraphRatio, "段落偏长，适合沉浸式铺陈", "长短段混合，节奏有起伏", "短段密集，推进快，适合强钩子和爽点");
  const dialogue = ratioLabel(dialogueRatio, "对白占比低，主要靠叙述推进", "对白与叙述均衡", "对白占比高，靠交锋、试探和关系张力推进");
  const emotion = exclamationRatio > 0.45 ? "情绪标点密集，爆点表达外放" : "情绪表达较克制，依赖动作和心理递进";
  const skillMetadata = inferSkillMetadata(targetType, targetLabel, dialogueRatio, shortParagraphRatio, exclamationRatio, avgParagraph);

  const voiceDna = [
    rhythm,
    dialogue,
    emotion,
    avgParagraph > 120 ? "句群偏长，适合细节、心理和环境层层递进" : "句群偏短，适合快速切镜、动作推进和即时反馈",
  ];
  const narrativeModels = [
    "先给处境压力，再给角色反应，最后用选择或代价推进下一场",
    "每场戏保留一个明确问题：角色要什么、阻碍是什么、读者为什么继续看",
    "通过重复意象、称谓、动作习惯建立人物识别度，而不是只靠介绍",
  ];
  const decisionHeuristics = [
    "续写时优先复刻节奏、视角距离、冲突推进方式，不复刻具体桥段和专有设定",
    "如果需要仿风格，先提炼场景功能，再重写人物、事件、因果链",
    "每 800-1200 字至少给一次情绪回报、信息增量或关系变化",
  ];
  const narrativeEngines = [
    "世界观引擎：提炼规则、稀缺资源、力量/身份约束，避免只复述设定名词",
    "欲望引擎：识别主角长期欲望、卷级目标和章节短目标如何接力",
    "冲突引擎：区分敌人、制度、秘密、身份、代价、自我矛盾等阻力来源",
    "升级引擎：分析成长为何成立，力量/资源/地位变化是否付出代价",
    "悬念引擎：记录信息延迟释放、伏笔排列、谜题推进和反转触发方式",
    "情绪引擎：拆解爽点、虐点、燃点、笑点、恐惧点的触发条件",
    "节奏引擎：统计章节钩子、场景切换、高潮密度和松弛段落的分布",
  ];
  const mechanismLayers = [
    "表层：设定、金手指、职业、门派、时代背景只作为材料，不作为最终结论",
    "中层：重点提炼冲突结构、人物关系、章节节奏、伏笔回收和场景功能",
    "深层：最终沉淀读者承诺、欲望模型、情绪循环和价值观张力",
  ];
  const chapterRules = [
    "章节级规则：每章明确目标、阻力、信息增量、情绪回报和章末钩子",
    "卷级规则：每卷维持一个更大的承诺，让升级、秘密或关系变化逐步兑现",
  ];
  const readerEmotionLoop = [
    "压力出现 -> 目标受阻 -> 信息或代价浮出 -> 角色做选择 -> 读者获得回报或更强期待",
  ];
  const generationChecks = [
    "能生成同类型但不同设定的新故事种子",
    "能生成符合机制的新角色和人物驱动模型",
    "能生成一章可用大纲、章节结尾、中期反转和升级路径",
    "生成内容不复写原文句子、人名、专有设定和标志性桥段",
  ];
  const antiPatterns = [
    "不要照搬原文句子、人物名、专有世界观或标志性桥段",
    "不要只堆高频词或表层设定，要复刻生成机制、叙事决策和信息释放节奏",
    "不要让所有角色用同一种语气说话",
  ];
  const boundaries = [
    "该蒸馏结果只用于学习叙事操作系统，不用于复刻或替代原书文本",
    "上传原文不会长期保存，系统只保留抽象后的蒸馏卡片",
    "样本越少，蒸馏越偏向局部章节机制，不能代表整本书",
    "爆款成因不能过度归因，题材、更新节奏、时代情绪和作者功力都会影响结果",
  ];
  const researchNotes = [
    `蒸馏对象已设为：${targetLabel}`,
    `素材构成：${materialBreakdown.join("；") || "未分类"}`,
    sources.some((source) => (source.materialType || "novel") === "novel") ? "已包含小说原文，可分析过程体验、章节节奏和场景功能" : "未检测到小说原文，生成机制判断只能作为辅助推断",
    sources.some((source) => source.materialType === "other") ? "已包含辅助资料，只用于补充背景和校对判断，不能替代小说原文机制" : "未包含辅助资料，将完全依据上传小说原文提炼机制",
  ];
  const qualityChecks = [
    targetType ? "通过：已确认蒸馏对象类型" : "不足：未确认蒸馏对象类型",
    sources.some((source) => (source.materialType || "novel") === "novel") ? "通过：包含一手小说文本" : "警告：缺少小说原文，不能只靠剧情梗概",
    narrativeEngines.length === 7 ? "通过：七个叙事引擎检查项完整" : "不足：七个叙事引擎不完整",
    mechanismLayers.length >= 3 ? "通过：表层/中层/深层机制已纳入" : "不足：三层机制缺失",
    generationChecks.length >= 4 ? "通过：包含生成验证任务" : "不足：缺少生成验证任务",
    boundaries.length >= 3 ? "通过：版权与归因边界已写入" : "不足：诚实边界过少",
  ];
  const sentencePatterns = [
    avgParagraph > 120 ? "多用连续动作 + 心理补偿 + 结果落点" : "多用短句切换动作、反应和结果",
    shortParagraphRatio > 0.38 ? "关键转折单独成段，制造停顿和下坠感" : "关键转折嵌入段尾，制造自然推进",
  ];
  const sceneRhythm = [
    rhythm,
    "场景开头尽快明确人物位置和当前压力",
    "场景结尾留下未解决的问题、代价或下一步行动",
  ];
  const dialogueRules = [
    dialogue,
    "对白服务于试探、压迫、误解、反转，不做说明书式解释",
    "重要信息尽量通过冲突中说出，而不是旁白一次性倒出",
  ];
  const summary = `基于 ${sources.length} 个文本样本蒸馏，约 ${wordCount} 字。${rhythm}；${dialogue}。`;
  const prompt = buildDistillationPrompt({
    id: "preview",
    title,
    sourceNames: sources.map((s) => s.name),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    wordCount,
    targetType,
    targetLabel,
    targetTypes,
    targetLabels,
    primarySkill: skillMetadata.primarySkill,
    skillTags: skillMetadata.skillTags,
    distillationPrinciple: "蒸馏的不是文本内容，而是生成机制：为什么有效、如何组织冲突、如何制造期待、如何控制读者情绪。",
    materialBreakdown,
    researchNotes,
    qualityChecks,
    summary,
    voiceDna,
    narrativeModels,
    decisionHeuristics,
    narrativeEngines,
    mechanismLayers,
    chapterRules,
    readerEmotionLoop,
    generationChecks,
    antiPatterns,
    boundaries,
    lexicon,
    sentencePatterns,
    sceneRhythm,
    dialogueRules,
    prompt: "",
  });

  return {
    id: "distill-" + uid(),
    title: title.trim() || sources[0]?.name?.replace(/\.(txt|md)$/i, "") || "未命名蒸馏",
    sourceNames: sources.map((s) => s.name),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    wordCount,
    analysisMode: "local",
    analyzedChars: wordCount,
    sourceCharCount: wordCount,
    chunkCount: sources.length,
    targetType,
    targetLabel,
    targetTypes,
    targetLabels,
    primarySkill: skillMetadata.primarySkill,
    skillTags: skillMetadata.skillTags,
    distillationPrinciple: "蒸馏的不是文本内容，而是生成机制：为什么有效、如何组织冲突、如何制造期待、如何控制读者情绪。",
    materialBreakdown,
    researchNotes,
    qualityChecks,
    summary,
    voiceDna,
    narrativeModels,
    decisionHeuristics,
    narrativeEngines,
    mechanismLayers,
    chapterRules,
    readerEmotionLoop,
    generationChecks,
    antiPatterns,
    boundaries,
    lexicon,
    sentencePatterns,
    sceneRhythm,
    dialogueRules,
    prompt,
  };
}

export function buildDistillationPrompt(profile: DistilledProfile) {
  return `【小说叙事操作系统蒸馏：${profile.title}】
蒸馏对象：${profile.targetLabel || profile.targetLabels?.join(" + ") || (profile.targetType ? DISTILLATION_TARGET_LABELS[profile.targetType] : "作品蒸馏")}
主技能：${profile.primarySkill || "未分类"}
技能标签：${profile.skillTags?.join("、") || "未分类"}
核心原则：${profile.distillationPrinciple || "蒸馏生成机制，不复制文本内容。"}
使用方式：学习其抽象后的叙事机制、角色驱动、冲突组织、期待管理和节奏策略，禁止复写原文句子、人物、专有设定和标志性桥段。

【素材构成】
${(profile.materialBreakdown || []).map((item) => "- " + item).join("\n") || "- 未记录素材分类"}

【研究轨迹】
${(profile.researchNotes || []).map((item) => "- " + item).join("\n") || "- 未记录研究轨迹"}

【摘要】
${profile.summary}

【表达 DNA】
${profile.voiceDna.map((item) => "- " + item).join("\n")}

【叙事模型】
${profile.narrativeModels.map((item) => "- " + item).join("\n")}

【决策启发式】
${profile.decisionHeuristics.map((item) => "- " + item).join("\n")}

【七个叙事引擎】
${(profile.narrativeEngines || []).map((item) => "- " + item).join("\n") || "- 未单独提炼"}

【三层机制】
${(profile.mechanismLayers || []).map((item) => "- " + item).join("\n") || "- 未单独提炼"}

【章节级/卷级规则】
${(profile.chapterRules || []).map((item) => "- " + item).join("\n") || "- 未单独提炼"}

【读者情绪循环】
${(profile.readerEmotionLoop || []).map((item) => "- " + item).join("\n") || "- 未单独提炼"}

【句式与段落】
${profile.sentencePatterns.map((item) => "- " + item).join("\n")}

【场景节奏】
${profile.sceneRhythm.map((item) => "- " + item).join("\n")}

【对白规则】
${profile.dialogueRules.map((item) => "- " + item).join("\n")}

【高频语感词】
${profile.lexicon.join("、") || "无明显高频词"}

【反模式】
${profile.antiPatterns.map((item) => "- " + item).join("\n")}

【生成验证】
${(profile.generationChecks || []).map((item) => "- " + item).join("\n") || "- 能生成新故事种子、角色、大纲、章节钩子和升级路径，且不复刻原作。"}

【质量自检】
${(profile.qualityChecks || []).map((item) => "- " + item).join("\n") || "- 未记录质量自检"}

【诚实边界】
${profile.boundaries.map((item) => "- " + item).join("\n")}`;
}

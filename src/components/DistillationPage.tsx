import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, Copy, FileText, Loader2, Sparkles, Square, Trash2, Upload } from "lucide-react";
import { DISTILLATION_TARGET_LABELS, SOURCE_MATERIAL_LABELS, buildDistillationPrompt, createLocalDistillation, type DistillationTargetType, type DistilledProfile, type SourceMaterialType } from "../store/distillation";
import { isConfigured, sendChat, type ApiSettings } from "../store/settings";
import { DEFAULT_VALIDATION_LAYERS, normalizePromptTemplate, parseSkillMetadata, uid } from "../utils/helpers";
import { showToast } from "../utils/toast";
import { type PromptTemplate } from "../store/workspace";

type SourceFile = { name: string; content: string; materialType: SourceMaterialType };
type GeneratingMode = "sample" | "full" | null;

interface TextChunk {
  sourceName: string;
  materialType: SourceMaterialType;
  index: number;
  total: number;
  content: string;
  chars: number;
}

const SAMPLE_SECTION_CHARS = 6000;
const FULL_CHUNK_CHARS = 12000;
const MERGE_BATCH_NOTE_LIMIT = 8;
const MERGE_BATCH_CHARS = 26000;
const MAX_CHUNK_NOTE_CHARS = 4500;
const TARGET_OPTIONS: Array<{ key: DistillationTargetType; label: string; hint: string }> = [
  { key: "work", label: "作品", hint: "单部作品的叙事机制" },
  { key: "genre", label: "类型", hint: "类型公式与读者承诺" },
  { key: "author", label: "作者", hint: "作者的叙事操作系统" },
  { key: "character", label: "角色", hint: "人物驱动模型" },
];
const MATERIAL_OPTIONS: Array<{ key: SourceMaterialType; label: string; hint: string }> = [
  { key: "novel", label: "小说原文", hint: "最高权重，分析过程体验" },
  { key: "other", label: "辅助资料", hint: "只补充，不替代原文" },
];

function normalizeForAi(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contentCharCount(text: string) {
  return text.replace(/\s+/g, "").length;
}

function formatCount(count = 0) {
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 1 : 2)}万`;
  if (count >= 1000) return `${Math.round(count / 1000)}千`;
  return String(count);
}

function modeLabel(profile: DistilledProfile) {
  if (profile.analysisMode === "full-ai") return "AI 全书分段";
  if (profile.analysisMode === "sample-ai") return "AI 抽样";
  return "本地快速";
}

function targetLabel(profile: DistilledProfile) {
  return profile.targetLabel || profile.targetLabels?.join(" + ") || (profile.targetType ? DISTILLATION_TARGET_LABELS[profile.targetType] : "作品蒸馏");
}

function targetLabelsFromTypes(types: DistillationTargetType[]) {
  return types.map((type) => DISTILLATION_TARGET_LABELS[type]).join(" + ");
}

function stableHash(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function distillationSkillClusterKey(profile: DistilledProfile) {
  return `${targetLabel(profile)}::${profile.primarySkill || "未分类"}`;
}

function buildAutoSkillContent(profile: DistilledProfile, linkedCount: number) {
  const primarySkill = profile.primarySkill || "未分类";
  const tags = profile.skillTags?.length ? profile.skillTags : [primarySkill];
  return `主技能：${primarySkill}
技能标签：${tags.join("、")}
适配场景：写作时需要调用「${targetLabel(profile)}」方向的多本蒸馏经验，学习结构、节奏、冲突、期待管理和人物驱动。

【Skill 来源】
- 自动由小说蒸馏库归类生成。
- 当前已关联 ${linkedCount} 个蒸馏结果，系统会在 AI 对话中自动注入这些蒸馏 Skill。
- 该 Skill 负责调度和约束，不保存原书全文。

【执行步骤】
1. 先判断用户任务属于作品机制、类型公式、作者操作系统、角色驱动中的哪一类。
2. 从关联蒸馏中提取稳定重复的生成机制，不照搬单本书的表层设定。
3. 按七个叙事引擎组织输出：世界观、欲望、冲突、升级、悬念、情绪、节奏。
4. 根据当前正文或用户要求，生成可落地的大纲、正文、钩子、反转或修改方案。
5. 输出前执行验证；任一层不通过，先重写再给最终结果。

【验证层】
${DEFAULT_VALIDATION_LAYERS.map((layer, index) => `${index + 1}. ${layer}`).join("\n")}

【失败重写规则】
- 如果只复述原书剧情，重写为抽象机制。
- 如果出现原书专有人名、设定名、标志性桥段或可识别句式，重写为原创表达。
- 如果只像“形”但没有读者承诺、欲望推进和情绪回报，补足深层机制后再输出。`;
}

function upsertAutoDistillationSkill(prompts: PromptTemplate[], profile: DistilledProfile): PromptTemplate[] {
  const clusterKey = distillationSkillClusterKey(profile);
  const existing = prompts.find((prompt) => prompt.autoSkillClusterKey === clusterKey);
  const linkedIds = [...new Set([...(existing?.linkedDistillationIds || []), profile.id])];
  const tags = [...new Set([...(existing?.skillTags || []), ...(profile.skillTags || []), profile.primarySkill || "未分类"])].filter(Boolean);
  const nextSkill = normalizePromptTemplate({
    id: existing?.id || `distill-skill-${stableHash(clusterKey)}-${uid()}`,
    title: existing?.title || `${profile.primarySkill || "未分类"}｜蒸馏积累 Skill`,
    category: existing?.category || `蒸馏积累 · ${targetLabel(profile)}`,
    description: `自动归类 ${linkedIds.length} 个蒸馏结果。写作时选择它，会自动带上关联蒸馏。`,
    content: buildAutoSkillContent(profile, linkedIds.length),
    builtIn: false,
    primarySkill: profile.primarySkill || existing?.primarySkill,
    skillTags: tags,
    validationLayers: DEFAULT_VALIDATION_LAYERS,
    linkedDistillationIds: linkedIds,
    autoSkillClusterKey: clusterKey,
  });

  if (existing) {
    return prompts.map((prompt) => (prompt.id === existing.id ? nextSkill : prompt));
  }
  return [nextSkill, ...prompts];
}

function removeDistillationFromSkills(prompts: PromptTemplate[], distillationId: string): PromptTemplate[] {
  return prompts
    .map((prompt) => {
      if (!prompt.linkedDistillationIds?.includes(distillationId)) return prompt;
      const linkedDistillationIds = prompt.linkedDistillationIds.filter((id) => id !== distillationId);
      return normalizePromptTemplate({ ...prompt, linkedDistillationIds });
    })
    .filter((prompt) => !(prompt.autoSkillClusterKey && (prompt.linkedDistillationIds || []).length === 0));
}

function buildSampleText(files: SourceFile[]) {
  let analyzedChars = 0;
  const sample = files.map((file) => {
    const text = normalizeForAi(file.content);
    const head = text.slice(0, SAMPLE_SECTION_CHARS);
    const middleStart = Math.max(0, Math.floor(text.length / 2) - SAMPLE_SECTION_CHARS / 2);
    const middle = text.slice(middleStart, middleStart + SAMPLE_SECTION_CHARS);
    const tail = text.slice(-SAMPLE_SECTION_CHARS);
    analyzedChars += contentCharCount(head) + contentCharCount(middle) + contentCharCount(tail);
    const label = SOURCE_MATERIAL_LABELS[file.materialType];
    return `【${file.name}｜${label}｜开头样本】\n${head}\n\n【${file.name}｜${label}｜中段样本】\n${middle}\n\n【${file.name}｜${label}｜结尾样本】\n${tail}`;
  }).join("\n\n---\n\n");
  return { sample, analyzedChars };
}

function chunkSources(files: SourceFile[]) {
  const chunks: TextChunk[] = [];
  files.forEach((file) => {
    const text = normalizeForAi(file.content);
    const total = Math.max(1, Math.ceil(text.length / FULL_CHUNK_CHARS));
    for (let start = 0, index = 0; start < text.length; start += FULL_CHUNK_CHARS, index += 1) {
      const content = text.slice(start, start + FULL_CHUNK_CHARS);
      chunks.push({
        sourceName: file.name,
        materialType: file.materialType,
        index: index + 1,
        total,
        content,
        chars: contentCharCount(content),
      });
    }
  });
  return chunks;
}

function compactBaseProfile(base: DistilledProfile) {
  return [
    `标题：${base.title}`,
    `蒸馏对象：${targetLabel(base)}`,
    `主技能：${base.primarySkill || "未分类"}`,
    `技能标签：${base.skillTags?.join("、") || "未分类"}`,
    `核心原则：${base.distillationPrinciple || "蒸馏生成机制，不复制文本内容"}`,
    `来源：${base.sourceNames.join("、")}`,
    `素材构成：${base.materialBreakdown?.join("；") || "未分类"}`,
    `本地统计：约 ${formatCount(base.sourceCharCount || base.wordCount)} 字`,
    `摘要：${base.summary}`,
    `表达 DNA：${base.voiceDna.join("；")}`,
    `叙事模型：${base.narrativeModels.join("；")}`,
    `对白规则：${base.dialogueRules.join("；")}`,
    `高频语感词：${base.lexicon.join("、") || "无明显高频词"}`,
  ].join("\n");
}

function buildChunkPrompt(base: DistilledProfile, chunk: TextChunk, current: number, total: number) {
  return `你是“女娲式小说蒸馏器”。现在做全书分段蒸馏，这是第 ${current}/${total} 个文本块。

核心原则：蒸馏的不是文本内容，而是生成机制。不要复制这段写了什么，要提炼它为什么有效、怎样组织冲突、怎样制造期待、怎样控制读者情绪。

要求：
1. 不写剧情梗概，不照搬原文句子、人物名、专有设定、标志性桥段。
2. 按七个叙事引擎提炼：世界观、欲望、冲突、升级、悬念、情绪、节奏。
3. 区分三层：表层材料、中层结构、深层读者承诺/情绪循环/价值张力。
4. 标出章节级规则、卷级规则、可生成的新内容测试点。
5. 以小说原文为最高依据；辅助资料只用于补充背景和校对判断，不能替代原文机制。
6. 输出要像可执行的写作机制笔记，控制在 800-1200 字。

【全书本地粗分析】
${compactBaseProfile(base)}

【当前分段信息】
来源：${chunk.sourceName}
材料类型：${SOURCE_MATERIAL_LABELS[chunk.materialType]}
段号：${chunk.index}/${chunk.total}
约 ${formatCount(chunk.chars)} 字

【当前分段文本】
${chunk.content}`;
}

function normalizeNote(note: string) {
  const clean = note.trim();
  if (clean.length <= MAX_CHUNK_NOTE_CHARS) return clean;
  return `${clean.slice(0, MAX_CHUNK_NOTE_CHARS)}\n【该分段笔记过长，已截断到核心长度】`;
}

function makeNoteBatches(notes: string[]) {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  notes.forEach((note) => {
    const nextChars = chars + note.length;
    if (current.length && (current.length >= MERGE_BATCH_NOTE_LIMIT || nextChars > MERGE_BATCH_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(note);
    chars += note.length;
  });
  if (current.length) batches.push(current);
  return batches;
}

function estimateApiCalls(chunkCount: number) {
  let calls = chunkCount;
  let notes = chunkCount;
  while (notes > 1) {
    notes = Math.ceil(notes / MERGE_BATCH_NOTE_LIMIT);
    calls += notes;
  }
  return calls + 1;
}

async function mergeNotesToFinalSkill(
  settings: ApiSettings,
  base: DistilledProfile,
  notes: string[],
  setProgressText: (text: string) => void,
  signal?: AbortSignal,
) {
  let current = notes;
  let round = 1;

  while (current.length > 1) {
    const batches = makeNoteBatches(current);
    if (batches.length <= 1) break;
    const next: string[] = [];
    for (let i = 0; i < batches.length; i += 1) {
      setProgressText(`合并分段笔记：第 ${round} 轮 ${i + 1}/${batches.length}`);
      const result = await sendChat(settings, [{
        role: "user",
        content: `你是“女娲式小说蒸馏器”。请合并下面这些分段蒸馏笔记，保留稳定反复出现的生成机制，去掉剧情复述、重复、过窄、偶然的内容。

要求：
1. 不复述原书具体人物、设定、桥段和原文句子。
2. 按七个叙事引擎合并：世界观、欲望、冲突、升级、悬念、情绪、节奏。
3. 明确表层/中层/深层，保留章节级规则、卷级规则和读者情绪循环。
4. 区分小说原文和辅助资料，不要把二手总结当成原作机制。
5. 控制在 1200-1800 字。

【本地粗分析】
${compactBaseProfile(base)}

【待合并笔记】
${batches[i].join("\n\n---\n\n")}`,
      }], undefined, signal);
      next.push(normalizeNote(result));
    }
    current = next;
    round += 1;
  }

  setProgressText("生成最终全书 Skill...");
  return sendChat(settings, [{
    role: "user",
    content: `你是“女娲式小说蒸馏器”。请把以下全书分段蒸馏笔记整理成一份可直接放入 AI 上下文使用的中文小说叙事操作系统 Skill。

要求：
1. 只保留生成机制：为什么有效、如何组织冲突、如何制造期待、如何控制读者情绪。
2. 严禁复写原文句子、人物名、专有设定、标志性桥段。
3. 不要只总结剧情梗概，不要把表层设定误当核心机制。
4. 输出最前面必须先写：主技能、技能标签、适配场景。技能标签要用于后续分类和检索。
5. 按以下结构输出：主技能、技能标签、适配场景、蒸馏对象、核心原则、七个叙事引擎、三层机制、章节级规则、卷级规则、读者情绪循环、表达DNA、反模式、生成验证、诚实边界、使用说明。
6. 保留素材构成和研究轨迹，说明哪些结论来自小说原文，哪些只是辅助资料补充。
7. 输出要能指导 AI 生成同类型但不同设定的新故事、角色、大纲、章节结尾、中期反转和升级路径。

【全书本地粗分析】
${compactBaseProfile(base)}

【全书分段蒸馏笔记】
${current.join("\n\n---\n\n")}`,
  }], undefined, signal);
}

export function DistillationPage({
  profiles,
  customPrompts,
  onBack,
  onChange,
  onSavePrompts,
  settings,
  onOpenSettings,
}: {
  profiles: DistilledProfile[];
  customPrompts: PromptTemplate[];
  onBack: () => void;
  onChange: (profiles: DistilledProfile[]) => void;
  onSavePrompts: (prompts: PromptTemplate[]) => void;
  settings: ApiSettings;
  onOpenSettings: () => void;
}) {
  const [title, setTitle] = useState("");
  const [targetTypes, setTargetTypes] = useState<DistillationTargetType[]>(["work"]);
  const [selectedMaterialType, setSelectedMaterialType] = useState<SourceMaterialType>("novel");
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(profiles[0]?.id ?? null);
  const [generatingMode, setGeneratingMode] = useState<GeneratingMode>(null);
  const [progressText, setProgressText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const selected = useMemo(() => profiles.find((item) => item.id === selectedId) || profiles[0] || null, [profiles, selectedId]);
  const isGenerating = generatingMode !== null;
  const cancelGeneration = () => {
    abortRef.current?.abort();
    setProgressText("已停止");
  };
  const uploadedChars = useMemo(() => sourceFiles.reduce((sum, file) => sum + contentCharCount(file.content), 0), [sourceFiles]);
  const autoSkillCount = useMemo(() => customPrompts.filter((prompt) => prompt.autoSkillClusterKey).length, [customPrompts]);

  const saveProfileWithSkill = (profile: DistilledProfile) => {
    onChange([profile, ...profiles]);
    onSavePrompts(upsertAutoDistillationSkill(customPrompts, profile));
    setSelectedId(profile.id);
    setSourceFiles([]);
    setTitle("");
    setProgressText("");
  };

  const toggleTargetType = (type: DistillationTargetType) => {
    setTargetTypes((prev) => {
      if (prev.includes(type)) return prev.length > 1 ? prev.filter((item) => item !== type) : prev;
      return [...prev, type];
    });
  };

  const updateSourceMaterialType = (index: number, materialType: SourceMaterialType) => {
    setSourceFiles((prev) => prev.map((file, fileIndex) => fileIndex === index ? { ...file, materialType } : file));
  };

  const handleFiles = (files: File[]) => {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setSourceFiles((prev) => [...prev, { name: file.name, content: String(reader.result || ""), materialType: selectedMaterialType }]);
        if (!title.trim()) setTitle(file.name.replace(/\.(txt|md)$/i, ""));
      };
      reader.readAsText(file, "utf-8");
    });
  };

  const createProfile = () => {
    if (!sourceFiles.length) {
      showToast("请先上传 txt 或 md 文本。", "warning");
      return;
    }
    const profile = createLocalDistillation(title, sourceFiles, { targetTypes, targetLabel: targetLabelsFromTypes(targetTypes) });
    saveProfileWithSkill(profile);
  };

  const createAiSampleProfile = async () => {
    if (!isConfigured(settings)) {
      onOpenSettings();
      return;
    }
    if (!sourceFiles.length) {
      showToast("请先上传 txt 或 md 文本。", "warning");
      return;
    }
    const base = createLocalDistillation(title, sourceFiles, { targetTypes, targetLabel: targetLabelsFromTypes(targetTypes) });
    const { sample, analyzedChars } = buildSampleText(sourceFiles);
    const sourceCharCount = sourceFiles.reduce((sum, file) => sum + contentCharCount(file.content), 0);
    setGeneratingMode("sample");
    setProgressText(`AI 抽样蒸馏中：读取开头/中段/结尾，约 ${formatCount(analyzedChars)} 字`);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await sendChat(settings, [{
        role: "user",
        content: `你是“女娲式小说蒸馏器”。请根据样本文本和本地初步分析，生成一份可直接放入 AI 上下文的中文小说叙事操作系统 Skill。

核心原则：蒸馏的不是文本内容，而是生成机制。不要复制这本书写了什么，要提炼它为什么有效、怎样组织冲突、怎样制造期待、怎样控制读者情绪。

要求：
1. 蒸馏对象是：${targetLabelsFromTypes(targetTypes)}。
2. 只提炼抽象机制、节奏策略、叙事决策、人物驱动、对白规则、反模式和边界。
3. 必须覆盖七个叙事引擎：世界观、欲望、冲突、升级、悬念、情绪、节奏。
4. 必须区分三层：表层材料、中层结构、深层读者承诺/情绪循环/价值张力。
5. 必须给出生成验证：新故事种子、新角色、一章大纲、章节结尾、中期反转、升级路径。
6. 严禁复写原文句子、人物名、专有设定、标志性桥段。
7. 以小说原文为最高依据；辅助资料只用于补充背景和校对判断，不能替代原文机制。
8. 输出最前面必须先写：主技能、技能标签、适配场景。技能标签要用于后续分类和检索。
9. 按以下结构输出：主技能、技能标签、适配场景、蒸馏对象、核心原则、素材构成、研究轨迹、七个叙事引擎、三层机制、章节级规则、卷级规则、读者情绪循环、表达DNA、反模式、生成验证、质量自检、诚实边界、使用说明。

【本地初步分析】
${base.prompt}

【样本文本】
${sample}`,
      }], undefined, controller.signal);
      const skillMeta = parseSkillMetadata(result);
      const profile: DistilledProfile = {
        ...base,
        analysisMode: "sample-ai",
        analyzedChars,
        sourceCharCount,
        chunkCount: sourceFiles.length * 3,
        primarySkill: skillMeta.primarySkill || base.primarySkill,
        skillTags: skillMeta.skillTags.length ? skillMeta.skillTags : base.skillTags,
        summary: `${base.summary} 已进行 AI 抽样小说蒸馏，实际送入 AI 约 ${formatCount(analyzedChars)} 字，重点提炼生成机制。`,
        prompt: result.trim() || base.prompt,
        updatedAt: Date.now(),
      };
      saveProfileWithSkill(profile);
    } catch (e) {
      if (controller.signal.aborted) {
        showToast("已停止 AI 抽样蒸馏", "info");
      } else {
        showToast(e instanceof Error ? e.message : "AI 抽样蒸馏失败", "error", 5000);
      }
    } finally {
      setGeneratingMode(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const createAiFullProfile = async () => {
    if (!isConfigured(settings)) {
      onOpenSettings();
      return;
    }
    if (!sourceFiles.length) {
      showToast("请先上传 txt 或 md 文本。", "warning");
      return;
    }
    const base = createLocalDistillation(title, sourceFiles, { targetTypes, targetLabel: targetLabelsFromTypes(targetTypes) });
    const chunks = chunkSources(sourceFiles);
    const analyzedChars = chunks.reduce((sum, chunk) => sum + chunk.chars, 0);
    const sourceCharCount = sourceFiles.reduce((sum, file) => sum + contentCharCount(file.content), 0);
    const estimatedCalls = estimateApiCalls(chunks.length);
    if (chunks.length > 12 && !window.confirm(`全书分段蒸馏会读取全部上传文本，预计 ${chunks.length} 个文本块、约 ${estimatedCalls} 次 AI 请求，耗时和费用都会明显增加。确认继续？`)) {
      return;
    }

    setGeneratingMode("full");
    const notes: string[] = [];
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      for (let i = 0; i < chunks.length; i += 1) {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const chunk = chunks[i];
        setProgressText(`全书分段蒸馏：${i + 1}/${chunks.length} · ${chunk.sourceName} 第 ${chunk.index}/${chunk.total} 段`);
        const result = await sendChat(settings, [{ role: "user", content: buildChunkPrompt(base, chunk, i + 1, chunks.length) }], undefined, controller.signal);
        notes.push(`【${chunk.sourceName} 第 ${chunk.index}/${chunk.total} 段】\n${normalizeNote(result)}`);
      }

      const finalSkill = await mergeNotesToFinalSkill(settings, base, notes, setProgressText, controller.signal);
      const skillMeta = parseSkillMetadata(finalSkill);
      const profile: DistilledProfile = {
        ...base,
        analysisMode: "full-ai",
        analyzedChars,
        sourceCharCount,
        chunkCount: chunks.length,
        primarySkill: skillMeta.primarySkill || base.primarySkill,
        skillTags: skillMeta.skillTags.length ? skillMeta.skillTags : base.skillTags,
        summary: `${base.summary} 已进行 AI 全书分段小说蒸馏，共分析 ${chunks.length} 段，约 ${formatCount(analyzedChars)} 字，重点提炼叙事操作系统。`,
        prompt: finalSkill.trim() || base.prompt,
        updatedAt: Date.now(),
      };
      saveProfileWithSkill(profile);
    } catch (e) {
      if (controller.signal.aborted) {
        showToast("已停止 AI 全书分段蒸馏", "info");
      } else {
        showToast(e instanceof Error ? e.message : "AI 全书分段蒸馏失败", "error", 5000);
      }
    } finally {
      setGeneratingMode(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const deleteProfile = (id: string) => {
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    if (!window.confirm(`删除蒸馏「${profile.title}」？`)) return;
    const next = profiles.filter((item) => item.id !== id);
    onChange(next);
    onSavePrompts(removeDistillationFromSkills(customPrompts, id));
    setSelectedId(next[0]?.id ?? null);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 text-white">
      <header className="mb-5 flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" /> 返回首页
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">小说叙事操作系统蒸馏</h1>
            <p className="mt-1 text-xs text-slate-500">上传小说文本，提炼世界观、欲望、冲突、升级、悬念、情绪、节奏七个生成引擎。</p>
          </div>
        </div>
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/10 px-4 py-2 text-xs text-purple-300">
          已有 {profiles.length} 个蒸馏 · 自动 Skill {autoSkillCount}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="flex min-h-0 flex-col gap-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Upload className="h-4 w-4 text-purple-400" /> 新建蒸馏
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="蒸馏名称，如：某作品叙事机制 / 无限流类型公式"
              className="mb-3 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
              disabled={isGenerating}
            />
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-slate-300">蒸馏对象（可多选）</span>
              <span className="text-[10px] text-slate-500">{targetLabelsFromTypes(targetTypes)}</span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {TARGET_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => toggleTargetType(option.key)}
                  disabled={isGenerating}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${targetTypes.includes(option.key) ? "border-purple-500/50 bg-purple-500/15 text-purple-200" : "border-slate-800 bg-slate-950/35 text-slate-400 hover:border-slate-700"}`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className={`h-3 w-3 rounded border ${targetTypes.includes(option.key) ? "border-purple-400 bg-purple-500" : "border-slate-600"}`} />
                    {option.label}
                  </div>
                  <div className="mt-0.5 text-[10px] opacity-75">{option.hint}</div>
                </button>
              ))}
            </div>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-slate-300">本次上传材料类型</span>
              <span className="text-[10px] text-slate-500">{SOURCE_MATERIAL_LABELS[selectedMaterialType]}</span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {MATERIAL_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSelectedMaterialType(option.key)}
                  disabled={isGenerating}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${selectedMaterialType === option.key ? "border-blue-500/50 bg-blue-500/15 text-blue-200" : "border-slate-800 bg-slate-950/35 text-slate-400 hover:border-slate-700"}`}
                >
                  <div className="text-xs font-semibold">{option.label}</div>
                  <div className="mt-0.5 text-[10px] opacity-75">{option.hint}</div>
                </button>
              ))}
            </div>
            <label className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-8 text-center ${isGenerating ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-purple-400"}`}>
              <FileText className="mb-2 h-8 w-8 text-slate-500" />
              <span className="text-sm font-medium text-slate-300">上传 txt / md</span>
              <span className="mt-1 text-xs text-slate-500">将按「{SOURCE_MATERIAL_LABELS[selectedMaterialType]}」导入，可一次上传多个文件</span>
              <input type="file" multiple accept=".txt,.md" className="hidden" disabled={isGenerating} onChange={(e) => handleFiles(Array.from(e.target.files || []))} />
            </label>
            {sourceFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {sourceFiles.map((file, index) => (
                  <div key={file.name + index} className="rounded-xl bg-slate-800/70 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-300">{file.name}</span>
                      <span className="shrink-0 text-slate-500">{formatCount(contentCharCount(file.content))}字</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="shrink-0 text-[10px] text-slate-500">材料</span>
                      <select
                        value={file.materialType}
                        onChange={(e) => updateSourceMaterialType(index, e.target.value as SourceMaterialType)}
                        disabled={isGenerating}
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 outline-none focus:border-blue-500"
                      >
                        {MATERIAL_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
                <div className="px-1 text-[11px] text-slate-500">已上传约 {formatCount(uploadedChars)} 字</div>
              </div>
            )}
            <button onClick={createProfile} disabled={isGenerating} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-60">
              <Sparkles className="h-4 w-4" /> 本地快速蒸馏
            </button>
            <button onClick={createAiSampleProfile} disabled={isGenerating} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-2.5 text-sm font-medium text-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-60">
              {generatingMode === "sample" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generatingMode === "sample" ? "AI 抽样蒸馏中..." : "AI 抽样蒸馏"}
            </button>
            <button onClick={createAiFullProfile} disabled={isGenerating} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60">
              {generatingMode === "full" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
              {generatingMode === "full" ? "AI 全书分段中..." : "AI 全书分段蒸馏"}
            </button>
            {progressText && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs leading-relaxed text-slate-300">
                <div className="min-w-0 flex-1">{progressText}</div>
                {isGenerating && (
                  <button
                    onClick={cancelGeneration}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20"
                  >
                    <Square className="h-3 w-3" /> 停止
                  </button>
                )}
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              抽样模式只看开头/中段/结尾；全书分段模式会逐段读取全部上传文本。蒸馏目标是生成机制，不保存原书全文。创建后会自动归入 Skill 管理，同类蒸馏会堆进同一个积累 Skill。
            </p>
          </section>

          <section className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-white">
              <BookOpen className="h-4 w-4 text-blue-400" /> 蒸馏库
            </div>
            <div className="space-y-2">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${selected?.id === profile.id ? "border-purple-500/50 bg-purple-500/10" : "border-slate-800 bg-slate-950/35 hover:border-slate-700"}`}
                >
                  <div className="flex items-start gap-2">
                    <button onClick={() => setSelectedId(profile.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-white">{profile.title}</span>
                        <span className="shrink-0 text-[10px] text-slate-500">{formatCount(profile.sourceCharCount || profile.wordCount)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                        <span>{modeLabel(profile)}</span>
                        <span>{targetLabel(profile)}</span>
                        {profile.primarySkill ? <span>{profile.primarySkill}</span> : null}
                        {profile.analyzedChars ? <span>已析 {formatCount(profile.analyzedChars)}</span> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{profile.summary}</p>
                      {profile.skillTags?.length ? <p className="mt-1 line-clamp-1 text-[10px] text-slate-600">标签：{profile.skillTags.join("、")}</p> : null}
                    </button>
                    <button
                      onClick={() => deleteProfile(profile.id)}
                      className="shrink-0 rounded-lg p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-300"
                      title="删除蒸馏"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {profiles.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-800 px-3 py-8 text-center text-xs text-slate-500">
                  还没有蒸馏。上传一本书开始。
                </div>
              )}
            </div>
          </section>
        </aside>

        <section className="min-h-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/70">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">请选择或创建一个蒸馏。</div>
          ) : (
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selected.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    来源：{selected.sourceNames.join("、")} · {targetLabel(selected)} · {modeLabel(selected)} · 已分析约 {formatCount(selected.analyzedChars || selected.wordCount)} 字 · {new Date(selected.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(selected.prompt || buildDistillationPrompt(selected))} className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
                    <Copy className="h-3.5 w-3.5" /> 复制 Skill
                  </button>
                  <button onClick={() => deleteProfile(selected.id)} className="flex items-center gap-1 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20">
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </button>
                </div>
              </div>

              <InfoBlock title="摘要" items={[selected.summary]} />
              <InfoBlock title="核心原则" items={[selected.distillationPrinciple || "蒸馏的不是文本内容，而是生成机制。"]} />
              <InfoBlock title="技能分类" items={[`主技能：${selected.primarySkill || "未分类"}`, `技能标签：${selected.skillTags?.join("、") || "未分类"}`]} />
              <InfoBlock title="素材构成" items={selected.materialBreakdown || ["旧版蒸馏未记录素材分类。"]} />
              <InfoBlock title="研究轨迹" items={selected.researchNotes || ["旧版蒸馏未记录研究轨迹。"]} />
              <InfoBlock title="七个叙事引擎" items={selected.narrativeEngines || ["旧版蒸馏未单独记录七个叙事引擎。"]} />
              <InfoBlock title="三层机制" items={selected.mechanismLayers || ["旧版蒸馏未单独记录表层/中层/深层机制。"]} />
              <InfoBlock title="章节级 / 卷级规则" items={selected.chapterRules || ["旧版蒸馏未单独记录章节级和卷级规则。"]} />
              <InfoBlock title="读者情绪循环" items={selected.readerEmotionLoop || ["旧版蒸馏未单独记录读者情绪循环。"]} />
              <InfoBlock title="表达 DNA" items={selected.voiceDna} />
              <InfoBlock title="叙事模型" items={selected.narrativeModels} />
              <InfoBlock title="决策启发式" items={selected.decisionHeuristics} />
              <InfoBlock title="场景节奏" items={selected.sceneRhythm} />
              <InfoBlock title="对白规则" items={selected.dialogueRules} />
              <InfoBlock title="高频语感词" items={selected.lexicon.length ? [selected.lexicon.join("、")] : ["无明显高频词"]} />
              <InfoBlock title="生成验证" items={selected.generationChecks || ["能生成同类型但不同设定的新故事种子、角色、大纲、章节钩子和升级路径。"]} />
              <InfoBlock title="质量自检" items={selected.qualityChecks || ["旧版蒸馏未记录质量自检。"]} />
              <InfoBlock title="反模式与边界" items={[...selected.antiPatterns, ...selected.boundaries]} tone="amber" />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white">完整 Skill 正文</h3>
                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-900/70 p-4 text-xs leading-relaxed text-slate-400">
                  {selected.prompt || buildDistillationPrompt(selected)}
                </pre>
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                <div className="mb-1 flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" /> 已可在 AI 对话中引用</div>
                <p className="text-xs leading-relaxed text-slate-500">它已经自动归入 Skill 管理；进入写作台右侧 AI 面板，可直接选择对应 Skill，系统会自动带上关联蒸馏。也可以点击「蒸馏」手动选择。</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function InfoBlock({ title, items, tone = "slate" }: { title: string; items: string[]; tone?: "slate" | "amber" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "amber" ? "border-amber-500/20 bg-amber-500/10" : "border-slate-800 bg-slate-950/35"}`}>
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="text-sm leading-relaxed text-slate-400">- {item}</li>
        ))}
      </ul>
    </div>
  );
}

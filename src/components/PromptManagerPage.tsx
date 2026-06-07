import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Wand2, ArrowLeft, Search, Trash2, Link2, Tag, ShieldCheck, Sparkles, CheckCircle2 } from "lucide-react";
import { type PromptTemplate } from "../store/workspace";
import { type DistilledProfile } from "../store/distillation";
import { sendChat, isConfigured, type ApiSettings } from "../store/settings";
import { normalizePromptTemplate, parseSkillMetadata, uid } from "../utils/helpers";
import { showToast } from "../utils/toast";
import { prompts as builtInPrompts } from "../data/prompts";

export function PromptManagerPage({
  customPrompts,
  distillations,
  onBack,
  onSavePrompts,
  settings,
  onOpenSettings,
}: {
  customPrompts: PromptTemplate[];
  distillations: DistilledProfile[];
  onBack: () => void;
  onSavePrompts: (list: PromptTemplate[]) => void;
  settings: ApiSettings;
  onOpenSettings: () => void;
}) {
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [search, setSearch] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const distillationMap = useMemo(() => new Map(distillations.map((item) => [item.id, item])), [distillations]);
  const builtInIds = useMemo(() => new Set(builtInPrompts.map((prompt) => prompt.id)), []);
  const allPrompts = useMemo<PromptTemplate[]>(() => {
    const builtInMap = new Map<string, PromptTemplate>(builtInPrompts.map((prompt) => [prompt.id, normalizePromptTemplate({
      id: prompt.id,
      title: prompt.title,
      category: prompt.category,
      description: prompt.content.slice(0, 60).replace(/\n/g, " "),
      content: prompt.content,
      builtIn: true,
    })]));
    customPrompts.forEach((prompt) => {
      if (builtInMap.has(prompt.id)) builtInMap.set(prompt.id, normalizePromptTemplate({ ...prompt, builtIn: false }));
    });
    const pureCustom = customPrompts.filter((prompt) => !builtInMap.has(prompt.id) || (prompt.builtIn === false && !builtInIds.has(prompt.id)));
    return [...pureCustom.map((prompt) => normalizePromptTemplate(prompt)), ...Array.from(builtInMap.values())];
  }, [builtInIds, customPrompts]);

  const filteredPrompts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPrompts.filter((prompt) => {
      const meta = parseSkillMetadata(prompt.content || "");
      const linkedTitles = (prompt.linkedDistillationIds || []).map((id) => distillationMap.get(id)?.title || "").join(" ");
      const haystack = [
        prompt.title,
        prompt.category,
        prompt.description || "",
        prompt.content,
        prompt.primarySkill || meta.primarySkill,
        (prompt.skillTags || meta.skillTags).join(" "),
        linkedTitles,
      ]
        .join(" ")
        .toLowerCase();
      return !q || haystack.includes(q);
    });
  }, [allPrompts, distillationMap, search]);

  const editingMeta = parseSkillMetadata(editing?.content || "");
  const editingSkillTags = editing?.skillTags?.length ? editing.skillTags : editingMeta.skillTags;
  const editingValidationLayers = editing?.validationLayers?.length ? editing.validationLayers : editingMeta.validationLayers;
  const linkedDistillationIds = editing?.linkedDistillationIds || [];

  const setEditingField = (patch: Partial<PromptTemplate>) => {
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const toggleLinkedDistillation = (id: string) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const current = prev.linkedDistillationIds || [];
      return {
        ...prev,
        linkedDistillationIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      };
    });
  };

  const handleSave = () => {
    if (!editing) return;
    const normalized = normalizePromptTemplate({
      ...editing,
      builtIn: false,
      linkedDistillationIds: [...new Set(editing.linkedDistillationIds || [])],
    });
    onSavePrompts(customPrompts.some((item) => item.id === normalized.id)
      ? customPrompts.map((item) => (item.id === normalized.id ? normalized : item))
      : [normalized, ...customPrompts]);
    setEditing(null);
  };

  const aiGenerateContent = async (targetSkill: PromptTemplate | null = editing) => {
    if (!isConfigured(settings)) {
      onOpenSettings();
      return;
    }
    if (!targetSkill?.title || !targetSkill.category) {
      showToast("请先填写标题和分类", "warning");
      return;
    }

    const buildPrompt = (repair = false) => `请为我生成一个可复用的小说 Skill，而不是泛泛的提示词模板。

标题：${targetSkill.title}
分类：${targetSkill.category}
需求描述：${targetSkill.description || ""}

要求：
1. 只模仿形，不模仿魂：提炼结构、节奏、冲突、人物驱动和验证，不得照搬原句、桥段和专有设定。
2. 必须包含：主技能、技能标签、适用场景、输入要求、执行步骤、输出格式、七层验证（输入完整性 / Skill 命中 / 结构 / 风格 / 人物 / 生成性 / 边界）、失败重写规则。
3. 验证层必须写成清晰的条目，每层都能直接检查。
4. 如果任一层不通过，先重写再输出最终稿。
5. 按如下格式输出：
标题：...
分类：...
描述：...
内容：...
6. ${repair ? "上一版缺少验证层或技能标签，请重新生成完整版本。" : "一次性生成完整版本。"}\n`;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const first = await sendChat(settings, [{ role: "user", content: buildPrompt(false) }], undefined, controller.signal);
      const firstMeta = parseSkillMetadata(first);
      const needRepair = !firstMeta.primarySkill || firstMeta.skillTags.length === 0 || firstMeta.validationLayers.length < 4;
      const finalResult = needRepair
        ? await sendChat(settings, [{ role: "user", content: buildPrompt(true) + "\n上一次输出未通过验证，请重写并补齐所有层级。"}], undefined, controller.signal)
        : first;
      setEditing((prev) => (prev ? { ...prev, content: finalResult.trim() } : { ...targetSkill, content: finalResult.trim() }));
    } catch (e) {
      if (controller.signal.aborted) {
        showToast("已停止 Skill 生成", "info");
      } else {
        showToast(e instanceof Error ? e.message : "生成失败", "error");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-white">
      <button onClick={onBack} className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> 返回首页
      </button>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Skill 管理</h1>
          <p className="mt-1 text-sm text-slate-500">内置提示词已统一转换为 Skill；自定义 Skill 可以挂蒸馏、标签和验证层。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing({ id: uid(), title: "", category: "自定义 Skill", description: "", content: "", builtIn: false, linkedDistillationIds: [] })}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300"
          >
            <Plus className="mr-1 inline h-4 w-4" /> 新建 Skill
          </button>
              <button
            onClick={async () => {
              if (!isConfigured(settings)) {
                onOpenSettings();
                return;
              }
              const desc = window.prompt("请描述你想生成什么 Skill，比如：番茄女频暧昧拉扯开局技能");
              if (!desc?.trim()) return;
              const draft: PromptTemplate = { id: "skill-" + uid(), title: desc.trim().slice(0, 20), category: "AI生成Skill", description: desc.trim(), content: "", builtIn: false, linkedDistillationIds: [] };
              setEditing(draft);
              await aiGenerateContent(draft);
            }}
              className="rounded-xl border border-purple-500/30 bg-purple-600/10 px-4 py-2 text-sm text-purple-300"
            >
            <Sparkles className="mr-1 inline h-4 w-4" /> AI 生成 Skill
          </button>
        </div>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索技能标题、标签、验证层或关联蒸馏..."
          className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 pl-10 text-sm text-white outline-none focus:border-purple-500"
        />
      </div>

      <div className="grid gap-4">
        {filteredPrompts.map((prompt) => {
          const meta = parseSkillMetadata(prompt.content || "");
          const primarySkill = prompt.primarySkill || meta.primarySkill;
          const skillTags = prompt.skillTags?.length ? prompt.skillTags : meta.skillTags;
          const validationLayers = prompt.validationLayers?.length ? prompt.validationLayers : meta.validationLayers;
          const linkedTitles = (prompt.linkedDistillationIds || []).map((id) => distillationMap.get(id)?.title).filter(Boolean) as string[];

          return (
            <div key={prompt.id} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold text-white">{prompt.title || "未命名 Skill"}</h3>
                  {prompt.builtIn ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">内置</span> : <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">自定义</span>}
                  {prompt.autoSkillClusterKey && <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-300">蒸馏积累</span>}
                  {primarySkill && <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300">{primarySkill}</span>}
                  {!!linkedTitles.length && <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">关联 {linkedTitles.length}</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{prompt.category}</p>
                {prompt.description && <p className="mt-2 line-clamp-2 text-xs text-slate-400">{prompt.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(skillTags || []).slice(0, 6).map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                      <Tag className="h-3 w-3" /> {tag}
                    </span>
                  ))}
                  {validationLayers.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                      <ShieldCheck className="h-3 w-3" /> 验证 {validationLayers.length}
                    </span>
                  )}
                </div>
                {linkedTitles.length > 0 && (
                  <p className="mt-2 line-clamp-1 text-xs text-slate-500">
                    关联蒸馏：{linkedTitles.join("、")}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(prompt)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300">编辑</button>
                {!prompt.builtIn && (
                  <button
                    onClick={() => {
                      if (window.confirm(`确定删除「${prompt.title || "未命名 Skill"}」？`)) onSavePrompts(customPrompts.filter((item) => item.id !== prompt.id));
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-900/20 px-3 py-1.5 text-xs text-red-300"
                  >
                    <Trash2 className="h-3 w-3" /> 删除
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filteredPrompts.length === 0 && <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">没有匹配的 Skill</div>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900">
            <div className="shrink-0 border-b border-slate-800 px-6 py-5">
              <h2 className="text-xl font-bold text-white">{editing.id.startsWith("skill-") || editing.id.startsWith("new") ? "新建" : "编辑"} Skill</h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <input value={editing.title} onChange={(e) => setEditingField({ title: e.target.value })} placeholder="标题" className="rounded-lg bg-slate-800 p-3 text-sm text-white" />
                <input value={editing.category} onChange={(e) => setEditingField({ category: e.target.value })} placeholder="分类" className="rounded-lg bg-slate-800 p-3 text-sm text-white" />
              </div>
              <div className="mt-4">
                <input value={editing.description || ""} onChange={(e) => setEditingField({ description: e.target.value })} placeholder="描述 / 使用场景" className="w-full rounded-lg bg-slate-800 p-3 text-sm text-white" />
              </div>
              <div className="mt-4">
                <textarea value={editing.content} onChange={(e) => setEditingField({ content: e.target.value })} rows={12} placeholder="Skill 内容..." className="w-full rounded-2xl bg-slate-800 p-3 text-sm text-white outline-none" />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Tag className="h-4 w-4 text-purple-400" /> 解析出的技能元数据
                  </div>
                  <div className="space-y-2 text-sm text-slate-400">
                    <div>主技能：{editing.primarySkill || editingMeta.primarySkill || "未识别"}</div>
                    <div>技能标签：{editingSkillTags.length ? editingSkillTags.join("、") : "未识别"}</div>
                    <div>验证层：{editingValidationLayers.length ? `${editingValidationLayers.length} 层` : "未识别"}</div>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-500">
                    AI 生成或手写 Skill 时，建议在正文里写出「主技能 / 技能标签 / 验证层」，系统会自动解析并用于上下文拼接。
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Link2 className="h-4 w-4 text-cyan-400" /> 关联蒸馏
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {distillations.length === 0 && <div className="text-xs text-slate-500">还没有蒸馏，先去蒸馏一本书。</div>}
                    {distillations.map((profile) => {
                      const checked = linkedDistillationIds.includes(profile.id);
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => toggleLinkedDistillation(profile.id)}
                          className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${checked ? "border-cyan-500/50 bg-cyan-500/10" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">{profile.title}</div>
                              <div className="mt-1 truncate text-[11px] text-slate-500">
                                {profile.primarySkill || "未分类"}{profile.skillTags?.length ? ` · ${profile.skillTags.slice(0, 3).join("、")}` : ""}
                              </div>
                            </div>
                            {checked && <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 justify-between gap-3 border-t border-slate-800 p-6">
              <button onClick={() => void aiGenerateContent()} className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white">
                <Wand2 className="h-4 w-4" /> AI 生成内容
              </button>
              <div className="flex gap-3">
                <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-400">取消</button>
                <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

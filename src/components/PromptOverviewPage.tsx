import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, Compass, Map, Sparkles, Star, Target, Zap } from "lucide-react";
import { promptCategories, prompts, type Prompt } from "../data/prompts";

// 推荐使用顺序（按写作流程分阶段）
const WORKFLOW_STAGES = [
  {
    stage: "① 开书构思阶段",
    description: "从一句话灵感到可发布的开篇",
    color: "from-blue-500/20 to-cyan-500/20",
    iconColor: "text-blue-400",
    categories: ["开书向导", "AI 网文工作流", "书名简介", "黄金三章"],
    beginnerStart: true,
  },
  {
    stage: "② 设定与结构阶段",
    description: "搭建角色、世界观、伏笔和大纲",
    color: "from-purple-500/20 to-pink-500/20",
    iconColor: "text-purple-400",
    categories: ["角色设定", "世界观设定", "金手指设计", "大纲设计", "伏笔管理"],
    beginnerStart: true,
  },
  {
    stage: "③ 正文写作阶段",
    description: "把大纲变成有节奏、有爽感的正文",
    color: "from-amber-500/20 to-orange-500/20",
    iconColor: "text-amber-400",
    categories: ["场景描写", "对话写作", "战斗/打脸", "章末留扣", "高光场景", "节奏切割", "情绪流与关系"],
  },
  {
    stage: "④ 修改与诊断阶段",
    description: "去 AI 味、查毒点、控质量",
    color: "from-emerald-500/20 to-teal-500/20",
    iconColor: "text-emerald-400",
    categories: ["拆书分析", "毒点防御", "网感消痕", "设定校验", "卡文急救"],
  },
  {
    stage: "⑤ 平台投放阶段",
    description: "针对番茄/起点/晋江/短剧的差异化适配",
    color: "from-rose-500/20 to-red-500/20",
    iconColor: "text-rose-400",
    categories: ["番茄专项", "平台特化", "短剧短篇", "各类型专项"],
  },
  {
    stage: "⑥ 进阶工具",
    description: "AI 工作流、教练、引导",
    color: "from-slate-500/20 to-slate-600/20",
    iconColor: "text-slate-400",
    categories: ["AI工作流"],
  },
];

const BEGINNER_RECOMMENDED = [
  { name: "开书向导", reason: "新手最该用的，从0到可发前3章" },
  { name: "AI 网文工作流", reason: "完整链路：高概念 → 细纲 → 正文 → 润色" },
  { name: "黄金三章", reason: "决定一本书生死的开篇" },
  { name: "番茄专项", reason: "如果你目标是番茄，这一类必看" },
  { name: "卡文急救", reason: "写不下去时的救命包" },
];

export function PromptOverviewPage({ onBack, onUsePrompt }: { onBack: () => void; onUsePrompt?: (prompt: Prompt) => void }) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<"workflow" | "all" | "beginner">("workflow");

  // 按分类聚合（用对象代替 Map，避免 TS 类型推导问题）
  const grouped = useMemo(() => {
    const obj: Record<string, Prompt[]> = {};
    prompts.forEach((p) => {
      if (!obj[p.category]) obj[p.category] = [];
      obj[p.category].push(p);
    });
    return obj;
  }, []);

  // 统计每个分类有多少
  const categoryStats = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(grouped).forEach(([cat, items]) => { result[cat] = items.length; });
    return result;
  }, [grouped]);

  // 总数
  const totalCount = prompts.length;
  const totalCategories = promptCategories.filter((c) => c !== "全部").length;

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const expandAll = () => setExpandedCategories(new Set(promptCategories.filter((c) => c !== "全部")));
  const collapseAll = () => setExpandedCategories(new Set());

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* 顶部 */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
              <ArrowLeft className="h-4 w-4" /> 返回首页
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">📋 Skill 使用地图</h1>
              <p className="mt-0.5 text-xs text-slate-500">{totalCount} 个 Skill，{totalCategories} 个分类，按写作阶段组织</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={expandAll} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">全部展开</button>
            <button onClick={collapseAll} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">全部收起</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* 总览卡片 */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
            <div className="flex items-center gap-2 text-sm text-blue-300"><Sparkles className="h-4 w-4" /> Skill 总数</div>
            <div className="mt-2 text-4xl font-bold text-white">{totalCount}</div>
            <div className="mt-1 text-xs text-slate-500">覆盖中国网文写作全链路</div>
          </div>
          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
            <div className="flex items-center gap-2 text-sm text-purple-300"><Map className="h-4 w-4" /> 分类总数</div>
            <div className="mt-2 text-4xl font-bold text-white">{totalCategories}</div>
            <div className="mt-1 text-xs text-slate-500">按功能精细划分</div>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 text-sm text-amber-300"><Compass className="h-4 w-4" /> 工作流阶段</div>
            <div className="mt-2 text-4xl font-bold text-white">{WORKFLOW_STAGES.length}</div>
            <div className="mt-1 text-xs text-slate-500">从开书到上架的完整流程</div>
          </div>
        </section>

        {/* 模式切换 */}
        <div className="flex gap-2">
          <button onClick={() => setFilterMode("workflow")} className={`rounded-xl px-4 py-2 text-sm ${filterMode === "workflow" ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            🗺️ 按写作流程
          </button>
          <button onClick={() => setFilterMode("beginner")} className={`rounded-xl px-4 py-2 text-sm ${filterMode === "beginner" ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            🌱 新手推荐
          </button>
          <button onClick={() => setFilterMode("all")} className={`rounded-xl px-4 py-2 text-sm ${filterMode === "all" ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            📚 全部分类（A-Z）
          </button>
        </div>

        {/* 模式 1：按工作流 */}
        {filterMode === "workflow" && (
          <div className="space-y-6">
            {WORKFLOW_STAGES.map((stage) => {
              const stageCategories = stage.categories.filter((c) => !!grouped[c]);
              const stageTotal = stageCategories.reduce((sum, c) => sum + (categoryStats[c] || 0), 0);
              return (
                <section key={stage.stage} className={`rounded-3xl border border-slate-800 bg-gradient-to-br ${stage.color} p-6`}>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className={`flex items-center gap-2 text-xl font-bold text-white`}>
                        <Target className={`h-5 w-5 ${stage.iconColor}`} />
                        {stage.stage}
                      </div>
                      <p className="mt-1 text-sm text-slate-300">{stage.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white">{stageTotal}</div>
                      <div className="text-xs text-slate-400">条提示词</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {stageCategories.map((cat) => {
                      const items = grouped[cat] || [];
                      const expanded = expandedCategories.has(cat);
                      return (
                        <div key={cat} className="rounded-2xl bg-slate-900/60 backdrop-blur">
                          <button onClick={() => toggleCategory(cat)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-800/40">
                            <div className="flex items-center gap-2">
                              {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                              <span className="font-medium text-white">{cat}</span>
                              <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300">{items.length}</span>
                            </div>
                          </button>
                          {expanded && (
                            <div className="space-y-1 border-t border-slate-800 px-4 py-3">
                              {items.map((p, i) => (
                                <button key={p.id} onClick={() => onUsePrompt?.(p)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800/60 hover:text-white">
                                  <span className="text-xs text-slate-600 w-6 text-right">{i + 1}.</span>
                                  <span className="flex-1 truncate">{p.title}</span>
                                  <span className="text-[10px] text-slate-600 group-hover:text-purple-400">点击查看</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* 模式 2：新手推荐 */}
        {filterMode === "beginner" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
              <div className="flex items-center gap-2 text-lg font-bold text-amber-300">
                <Star className="h-5 w-5" /> 新手必看：从这 5 个分类开始
              </div>
              <p className="mt-2 text-sm text-slate-300">
                如果你是第一次写网文，不要被几十个分类吓到。按这个顺序用就行：
              </p>
            </div>

            <div className="space-y-3">
              {BEGINNER_RECOMMENDED.map((rec, idx) => {
                const items = grouped[rec.name] || [];
                const expanded = expandedCategories.has(rec.name);
                return (
                  <div key={rec.name} className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                    <button onClick={() => toggleCategory(rec.name)} className="w-full px-5 py-4 text-left hover:bg-slate-800/40">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-sm font-bold text-white">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-semibold text-white">{rec.name}</span>
                              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">{items.length} 条</span>
                            </div>
                            <p className="mt-0.5 text-sm text-slate-400">{rec.reason}</p>
                          </div>
                        </div>
                        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                      </div>
                    </button>
                    {expanded && (
                      <div className="space-y-1 border-t border-slate-800 bg-slate-950/40 px-5 py-3">
                        {items.map((p, i) => (
                          <button key={p.id} onClick={() => onUsePrompt?.(p)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800/60 hover:text-white">
                            <span className="text-xs text-slate-600 w-6 text-right">{i + 1}.</span>
                            <span className="flex-1 truncate">{p.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-300 mb-2">
                <Zap className="h-4 w-4" /> 快速上手 3 步法
              </div>
              <ol className="space-y-1 text-sm text-slate-300">
                <li>1. 用「<b>开书向导</b>」生成书名 + 简介 + 黄金三章细纲（5 分钟）</li>
                <li>2. 用「<b>AI 网文工作流</b>」里的「角色档案生成器」建主角 + 反派（10 分钟）</li>
                <li>3. 用「<b>正文代写引擎</b>」生成第 1 章，再用「<b>第一遍/第二遍润色</b>」改一遍即可发布</li>
              </ol>
            </div>
          </div>
        )}

        {/* 模式 3：全部分类 */}
        {filterMode === "all" && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(grouped)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([cat, items]) => {
                const expanded = expandedCategories.has(cat);
                return (
                  <div key={cat} className="rounded-2xl border border-slate-800 bg-slate-900/60">
                    <button onClick={() => toggleCategory(cat)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-800/40">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-slate-500" />
                        <span className="font-medium text-white">{cat}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">{items.length}</span>
                        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                      </div>
                    </button>
                    {expanded && (
                      <div className="space-y-1 border-t border-slate-800 px-4 py-3">
                        {items.map((p, i) => (
                          <button key={p.id} onClick={() => onUsePrompt?.(p)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800/60 hover:text-white">
                            <span className="text-slate-600 w-5 text-right shrink-0">{i + 1}.</span>
                            <span className="flex-1">{p.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* 底部说明 */}
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-center text-xs text-slate-500">
          <p>所有 Skill 都内置在系统中，可在「<b className="text-slate-400">Skills 管理</b>」中编辑、删除或新建。</p>
          <p className="mt-1">点击任意提示词标题，可在写作台中查看完整内容并发送给 AI。</p>
        </div>
      </main>
    </div>
  );
}

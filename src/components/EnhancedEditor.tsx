import { useEffect, useState, useMemo } from "react";
import { Bot, CheckCircle2, Copy, Eye, EyeOff, Flame, Maximize2, Minimize2, Pencil, Save, Trash2, Volume2 } from "lucide-react";
import { type WorkspaceFile, type WorkspaceState } from "../store/workspace";
import { aiTools, detectAiWords, formatNovelText, htmlToPlainText, summarizeContent, wordCount } from "../utils/helpers";
import { TipTapEditor } from "./TipTapEditor";
import { type EntityDef } from "../utils/editor-plugins";
import { showToast } from "../utils/toast";

export function EnhancedEditor({
  file, workspace, onUpdate, onAiAction, onRunAiTool, onManualSave, onOpenHistory, isZenMode, onToggleZenMode, aiWords, onOpenHighlightConfig, onGenerateCharacterLog,
}: {
  file: WorkspaceFile | null; workspace: WorkspaceState; onUpdate: (patch: Partial<WorkspaceFile>) => void; onAiAction: (instruction: string, selectedText?: string, replaceMode?: boolean) => void; onRunAiTool?: (toolKey: string) => void; onManualSave: () => void; onOpenHistory: () => void; isZenMode: boolean; onToggleZenMode: (val: boolean) => void; aiWords: string[]; onOpenHighlightConfig: () => void; onGenerateCharacterLog?: () => void;
}) {
  const [savedFlash, setSavedFlash] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSaveTime, setLastSaveTime] = useState<string>("");
  const [highlightMode, setHighlightMode] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const entities = useMemo<EntityDef[]>(() => workspace.files.filter(f => f.category !== "主要内容").map(f => ({ id: f.id, name: f.title, summary: f.summary || "暂无简介" })), [workspace.files]);

  useEffect(() => {
    if (!file) return;
    setAutoSaveStatus("saving");
    const timer = setTimeout(() => { setAutoSaveStatus("saved"); setLastSaveTime(new Date().toLocaleTimeString()); }, 800);
    return () => clearTimeout(timer);
  }, [file?.content, file?.title]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); onManualSave(); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000); }
      if (e.key === "Escape" && isZenMode) onToggleZenMode(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onManualSave, isZenMode, onToggleZenMode]);

  if (!file) return <div className="flex h-[700px] items-center justify-center text-slate-500">请选择一个文件开始写作</div>;

  const plainText = htmlToPlainText(file.content);
  const stats = wordCount(plainText);
  const aiWordsDetected = detectAiWords(plainText, aiWords);
  const noScuang = stats.chinese > 1500 && !/打脸|逆袭|碾压|突破|觉醒|震惊|跪下|爆发|翻盘/.test(plainText);
  const readAloud = () => {
    const text = plainText.trim();
    if (!text) {
      showToast("当前章节还没有可朗读的内容", "warning");
      return;
    }
    if (!("speechSynthesis" in window)) {
      showToast("当前浏览器不支持朗读", "warning");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 800));
    utterance.lang = "zh-CN";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };
  const copyPlainText = async () => {
    const text = plainText.trim();
    if (!text) {
      showToast("当前章节为空", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制当前章节纯文本", "success");
    } catch {
      showToast("复制失败，请检查浏览器剪贴板权限", "error");
    }
  };
  const clearEditor = () => {
    if (!plainText.trim()) return;
    if (!window.confirm("确定清空当前章节正文？")) return;
    onUpdate({ content: "" });
    showToast("当前章节正文已清空", "info");
  };

  return (
    <section className={`flex h-full min-h-0 flex-col transition-all duration-500 ${isZenMode ? "bg-slate-950" : "rounded-2xl border border-slate-800 bg-slate-900/60 p-3"}`}>
      <div className={`mb-2 flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 pb-2 ${isZenMode ? "px-8 pt-4" : ""}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2 scrollbar-hide">
          <div className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-1.5 text-sm text-slate-300"><Pencil className="h-3.5 w-3.5" /> {stats.chinese} 字</div>
          <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-all ${autoSaveStatus === "saving" ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-400"}`}>
            {autoSaveStatus === "saving" ? <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />正在输入...</span> : <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> 已存 {lastSaveTime}</span>}
          </div>
          {savedFlash && <div className="flex items-center gap-1 rounded-xl bg-blue-500/20 px-3 py-1.5 text-xs text-blue-300 animate-bounce"><Save className="h-3 w-3" /> 保存成功</div>}
          {noScuang && <div className="flex items-center gap-1 rounded-xl bg-red-500/10 px-3 py-1.5 text-xs text-red-400"><Flame className="h-3 w-3" /> 缺少爽点</div>}
          {!isZenMode && onRunAiTool && (
            <>
              <span className="ml-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">百梦 AI</span>
              {aiTools.map((tool) => (
                <button
                  key={tool.key}
                  onClick={() => onRunAiTool(tool.key)}
                  className="shrink-0 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-800"
                  title={`${tool.label}：使用当前章节作为上下文`}
                >
                  {tool.label}
                </button>
              ))}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => onToggleZenMode(!isZenMode)} className={`rounded-xl px-3 py-1.5 text-xs flex items-center gap-1.5 transition-all ${isZenMode ? "bg-purple-600 text-white shadow-lg" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{isZenMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} {isZenMode ? "退出" : "专注"}</button>
          <button onClick={onOpenHistory} className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">📜 历史</button>
          <button onClick={readAloud} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700" title="朗读当前章节前 800 字"><Volume2 className="h-3.5 w-3.5" /> 朗读</button>
          <button onClick={copyPlainText} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700" title="复制当前章节纯文本"><Copy className="h-3.5 w-3.5" /> 复制</button>
          <button onClick={clearEditor} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10" title="清空当前章节正文"><Trash2 className="h-3.5 w-3.5" /> 清空</button>
          <button onClick={() => setHighlightMode(!highlightMode)} className={`rounded-xl px-3 py-1.5 text-xs flex items-center gap-1.5 transition-all ${highlightMode ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-800 text-slate-400"}`}>{highlightMode ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {highlightMode ? "高亮" : "阅读"}</button>
          <button onClick={onOpenHighlightConfig} className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">⚙️ AI词库</button>
        </div>
      </div>
      <div className={`flex min-h-0 flex-1 flex-col gap-2 overflow-hidden scrollbar-hide ${isZenMode ? "max-w-4xl mx-auto w-full px-8 pb-32" : ""}`}>
        {aiWordsDetected.length > 0 && highlightMode && !isZenMode && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/70">
            <div className="mb-2 font-medium flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" /> AI高频词：</div>
            <div className="flex flex-wrap gap-1.5">{aiWordsDetected.slice(0, 8).map((w) => <span key={w} className="rounded-md bg-amber-500/10 px-2 py-0.5 border border-amber-500/20">{w}</span>)}</div>
          </div>
        )}
        <TipTapEditor
          content={file.content}
          onChange={(html) => onUpdate({ content: html })}
          onSelectionAction={onAiAction}
          searchQuery=""
          aiWords={aiWords}
          entities={entities}
          highlightMode={highlightMode}
          placeholder={file.category === "主要内容" ? "在这里开始创作..." : "记录设定..."}
          beforeContent={
            <div className={isZenMode ? "mb-8 text-center" : "mb-6"}>
              <input value={file.title} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="标题" className={`w-full bg-transparent font-bold text-white outline-none transition-all ${isZenMode ? "text-5xl my-12 text-center" : "text-4xl leading-tight"}`} />
              {!isZenMode && (
                <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <button onClick={() => setSummaryOpen((prev) => !prev)} className="text-sm font-medium text-slate-300 hover:text-white">
                      章节概要 {summaryOpen ? "收起" : "展开"}
                    </button>
                    <div className="flex gap-2">
                      <button onClick={() => onUpdate({ summary: summarizeContent(plainText) })} className="text-xs text-purple-400 hover:text-purple-300">AI生成概要</button>
                      {onGenerateCharacterLog && (
                        <button onClick={onGenerateCharacterLog} className="text-xs text-cyan-400 hover:text-cyan-300">📋 生成角色日志</button>
                      )}
                    </div>
                  </div>
                  {summaryOpen ? (
                    <textarea value={file.summary} onChange={(e) => onUpdate({ summary: e.target.value })} placeholder="章节概要..." className="h-28 w-full resize-none bg-transparent text-sm leading-relaxed text-slate-500 outline-none" />
                  ) : (
                    <div className="truncate text-xs text-slate-500">{file.summary || "暂未填写，点击展开可编辑概要。"}</div>
                  )}
                </div>
              )}
            </div>
          }
        />
      </div>
      {!isZenMode && (
        <div className="mt-3 flex shrink-0 items-center justify-between border-t border-slate-800 pt-3 text-[11px] text-slate-500">
          <div className="flex gap-4"><span>段落：{plainText.split(/\n\n+/).filter(Boolean).length}</span><span>中文字：{stats.chinese}</span></div>
          <button onClick={() => onUpdate({ content: formatNovelText(plainText) })} className="rounded-lg bg-slate-800 px-3 py-1.5">自动排版</button>
        </div>
      )}
    </section>
  );
}

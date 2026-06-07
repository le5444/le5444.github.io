import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, Menu, MessageSquare, Moon, MoreHorizontal, PanelRightClose, PanelRightOpen, Settings, ShieldCheck, Sun, X } from "lucide-react";
import { chatContentToText, type ApiSettings, type ChatMessage, isConfigured, sendChat } from "../store/settings";
import { type BookProject } from "../store/library";
import { type PromptTemplate, type WorkspaceFile, type WorkspaceState, exportWorkspaceTxt } from "../store/workspace";
import { type DistilledProfile } from "../store/distillation";
import { prompts } from "../data/prompts";
import { aiTools, htmlToPlainText, loadJSON, normalizePromptTemplate, saveJSON, uid, type AIResult, type ChatSession, CHAT_HISTORY_KEY } from "../utils/helpers";
import { showToast } from "../utils/toast";
import { resetAllPromptDefaults } from "../store/prompts";
import { loadHistory, saveVersion } from "../store/history";
import { FileTree } from "./FileTree";
import { EnhancedEditor } from "./EnhancedEditor";
import { AIChatPanel } from "./AIChatPanel";
import { PromptPickerModal, FileAssociateModal, PreviewModal, ChatHistoryModal, EditPromptModal, VersionHistoryModal, HighlightConfigModal, DistillationPickerModal } from "./Modals";
import { CommandPalette } from "./CommandPalette";
import { InspirationWizard } from "./InspirationWizard";
import { AntiCollapseModal } from "./AntiCollapseModal";

const LEFT_PANEL_WIDTH = 260;
const RIGHT_PANEL_WIDTH = 320;

type ChatPending =
  | {
      text: string;
      selectedText?: string;
      replaceMode?: boolean;
      forResult?: boolean;
      resultTitle?: string;
    }
  | null;

type EditorBridge = Window & {
  __novelsmithEditorInsert?: (text: string) => void;
  __novelsmithEditorReplace?: (text: string) => boolean;
};

export function WorkspacePage({
  book, settings, customPrompts, distillations, onBack, onOpenSettings, onBookChange, onCustomPromptsChange, onSoftDeleteFile, onOpenRecycleBin, recycleBinCount, pendingPrompt, onPendingPromptConsumed, onEditPrompt, onDeletePrompt, onExportBackup,
}: {
  book: BookProject; settings: ApiSettings; customPrompts: PromptTemplate[]; distillations: DistilledProfile[]; onBack: () => void; onOpenSettings: () => void; onBookChange: (n: BookProject) => void; onCustomPromptsChange: (l: PromptTemplate[]) => void; onSoftDeleteFile: (f: WorkspaceFile) => void; onOpenRecycleBin: () => void; recycleBinCount: number; pendingPrompt: string; onPendingPromptConsumed: () => void; onEditPrompt: (p: PromptTemplate) => void; onDeletePrompt: (id: string) => void; onExportBackup: (bookOverride?: BookProject) => void;
}) {
  const [workspace, setWorkspace] = useState<WorkspaceState>(book.workspace);
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const [showAssociatePicker, setShowAssociatePicker] = useState(false);
  const [showDistillationPicker, setShowDistillationPicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [showEditPromptModal, setShowEditPromptModal] = useState(false);
  const [editingPromptDraft, setEditingPromptDraft] = useState<PromptTemplate | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showHighlightConfig, setShowHighlightConfig] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadJSON<ChatSession[]>(CHAT_HISTORY_KEY, []));
  const [aiResults, setAiResults] = useState<AIResult[]>([]);
  const [chatPending, setChatPending] = useState<ChatPending>(null);
  const [isZenMode, setIsZenMode] = useState(false);
  const [aiWordsConfig, setAiWordsConfig] = useState<string>(() => loadJSON("novelsmith-ai-words-config", "仿佛,缓缓,不禁,顿时,似乎,目光,嘴角"));
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showInspirationWizard, setShowInspirationWizard] = useState(false);
  const [showAntiCollapse, setShowAntiCollapse] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const characterLogAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => characterLogAbortRef.current?.abort(), []);

  const aiWords = aiWordsConfig.split(",").map(w => w.trim()).filter(Boolean);
  const selectedFile = workspace.files.find((f) => f.id === workspace.selectedFileId) || null;
  const isBaimengMode = workspace.theme === "light";
  const latestBookRef = useRef(book);
  const latestWorkspaceRef = useRef(workspace);

  useEffect(() => { latestBookRef.current = book; }, [book]);
  useEffect(() => { latestWorkspaceRef.current = workspace; }, [workspace]);

  const createBookSnapshot = useCallback((nextWorkspace: WorkspaceState = latestWorkspaceRef.current) => {
    const base = latestBookRef.current;
    return {
      ...base,
      title: nextWorkspace.projectTitle || base.title,
      updatedAt: Date.now(),
      workspace: nextWorkspace,
    };
  }, []);

  const persistWorkspace = useCallback((nextWorkspace: WorkspaceState = latestWorkspaceRef.current) => {
    onBookChange(createBookSnapshot(nextWorkspace));
  }, [createBookSnapshot, onBookChange]);

  const handleExportCurrentBackup = useCallback(() => {
    const snapshot = createBookSnapshot(workspace);
    onBookChange(snapshot);
    onExportBackup(snapshot);
  }, [createBookSnapshot, onBookChange, onExportBackup, workspace]);

  const handleResetPromptDefaults = useCallback(() => {
    const builtInIds = new Set(prompts.map((p) => p.id));
    resetAllPromptDefaults();
    onCustomPromptsChange(customPrompts.filter((p) => !builtInIds.has(p.id)));
  }, [customPrompts, onCustomPromptsChange]);

  const openBaimengPrototype = useCallback(() => {
    window.open("/baimeng-editor.html", "_blank", "noopener,noreferrer");
  }, []);

  const toggleBaimengMode = useCallback(() => {
    setWorkspace((prev) => ({ ...prev, theme: prev.theme === "light" ? "dark" : "light" }));
  }, []);

  const runAiTool = useCallback((toolKey: string) => {
    const tool = aiTools.find((item) => item.key === toolKey);
    if (!tool) return;
    const plain = htmlToPlainText(selectedFile?.content || "");
    if (!plain) {
      showToast("当前章节内容为空", "warning");
      return;
    }
    setChatPending({ text: tool.prompt + "\n\n" + plain, forResult: true, resultTitle: tool.label });
  }, [selectedFile?.content]);

  // Ctrl+K 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // 命令列表
  const getPlainText = useCallback(() => htmlToPlainText(selectedFile?.content || ""), [selectedFile?.content]);

  const commandList = useMemo(() => [
    { id: "cmd-continue", label: "✍️ 续写 500 字", category: "AI 写作", action: () => setChatPending({ text: "请按前文风格继续往下写 500 字。\n\n" + getPlainText().slice(-2000) }) },
    { id: "cmd-deai", label: "✨ 去 AI 味", category: "AI 写作", action: () => setChatPending({ text: "请把以下内容去掉 AI 痕迹，只输出修改稿：\n\n" + getPlainText().slice(0, 3000), forResult: true, resultTitle: "去 AI 味" }) },
    { id: "cmd-hook", label: "🪝 加章末钩子", category: "AI 写作", action: () => setChatPending({ text: "请给以下内容加一个强烈的章末悬念钩子：\n\n" + getPlainText().slice(-1500), forResult: true, resultTitle: "章末钩子" }) },
    { id: "cmd-logic", label: "🔍 逻辑检查", category: "AI 写作", action: () => setChatPending({ text: "请检查以下内容的逻辑漏洞和人设矛盾：\n\n" + getPlainText().slice(0, 3000), forResult: true, resultTitle: "逻辑检查" }) },
    { id: "cmd-review", label: "📝 AI 审稿", category: "AI 工具", action: () => { const t = aiTools.find(t => t.key === "review"); if (t) setChatPending({ text: t.prompt + "\n\n" + getPlainText(), forResult: true, resultTitle: "AI 审稿" }); } },
    { id: "cmd-deai-tool", label: "✨ AI 消痕", category: "AI 工具", action: () => { const t = aiTools.find(t => t.key === "de-ai"); if (t) setChatPending({ text: t.prompt + "\n\n" + getPlainText(), forResult: true, resultTitle: "AI 消痕" }); } },
    { id: "cmd-split", label: "📖 AI 拆书", category: "AI 工具", action: () => { const t = aiTools.find(t => t.key === "split-book"); if (t) setChatPending({ text: t.prompt + "\n\n" + getPlainText(), forResult: true, resultTitle: "AI 拆书" }); } },
    { id: "cmd-check", label: "🔍 错 AI 检查", category: "AI 工具", action: () => { const t = aiTools.find(t => t.key === "check"); if (t) setChatPending({ text: t.prompt + "\n\n" + getPlainText(), forResult: true, resultTitle: "错 AI 检查" }); } },
    { id: "cmd-control-card", label: "📌 章节控制卡", category: "长篇生产链", action: () => { const t = aiTools.find(t => t.key === "control-card"); if (t) setChatPending({ text: t.prompt + "\n\n" + getPlainText(), forResult: true, resultTitle: "章节控制卡" }); } },
    { id: "cmd-acceptance-gate", label: "✅ 接收闸门", category: "长篇生产链", action: () => { const t = aiTools.find(t => t.key === "acceptance-gate"); if (t) setChatPending({ text: t.prompt + "\n\n" + getPlainText(), forResult: true, resultTitle: "章节接收闸门" }); } },
    { id: "cmd-writeback", label: "🔁 状态回灌", category: "长篇生产链", action: () => { const t = aiTools.find(t => t.key === "writeback"); if (t) setChatPending({ text: t.prompt + "\n\n" + getPlainText(), forResult: true, resultTitle: "状态回灌" }); } },
    { id: "cmd-anti-collapse", label: "🛡️ 反崩盘工作台", category: "AI 工具", action: () => setShowAntiCollapse(true) },
    { id: "cmd-zen", label: isZenMode ? "🧘 退出专注模式" : "🧘 进入专注模式", category: "界面", action: () => setIsZenMode(!isZenMode) },
    { id: "cmd-save", label: "💾 手动保存", category: "界面", action: () => persistWorkspace(workspace) },
    { id: "cmd-backup", label: "📦 备份导出", category: "界面", action: handleExportCurrentBackup },
    { id: "cmd-export", label: "📥 导出 TXT", category: "界面", action: () => exportWorkspaceTxt(workspace) },
    { id: "cmd-prompt-picker", label: "📋 选择 Skill", category: "界面", action: () => setShowPromptPicker(true) },
    { id: "cmd-associate", label: "🔗 关联内容", category: "界面", action: () => setShowAssociatePicker(true) },
    { id: "cmd-distillation", label: "🧪 选择蒸馏", category: "界面", action: () => setShowDistillationPicker(true) },
    { id: "cmd-history", label: "🕰️ 版本历史", category: "界面", action: () => setShowVersionHistory(true) },
    { id: "cmd-settings", label: "⚙️ API 设置", category: "界面", action: () => onOpenSettings() },
    { id: "cmd-back", label: "← 返回首页", category: "界面", action: () => { persistWorkspace(workspace); onBack(); } },
  ], [getPlainText, handleExportCurrentBackup, isZenMode, onBack, onOpenSettings, persistWorkspace, workspace]);

  useEffect(() => { setWorkspace(book.workspace); }, [book.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => persistWorkspace(workspace), 1500);
    return () => window.clearTimeout(timer);
  }, [workspace, persistWorkspace]);
  useEffect(() => () => persistWorkspace(latestWorkspaceRef.current), [persistWorkspace]);
  useEffect(() => { saveJSON(CHAT_HISTORY_KEY, sessions); }, [sessions]);

  useEffect(() => { if (pendingPrompt) { setChatPending({ text: pendingPrompt }); onPendingPromptConsumed(); } }, [pendingPrompt, onPendingPromptConsumed]);

  const updateSelectedFile = useCallback((patch: Partial<WorkspaceFile>) => {
    if (!selectedFile) return;
    setWorkspace((prev) => ({ ...prev, files: prev.files.map((file) => (file.id === selectedFile.id ? { ...file, ...patch, updatedAt: Date.now() } : file)) }));
  }, [selectedFile]);

  const insertIntoEditor = useCallback((text: string) => {
    const w = window as EditorBridge;
    if (w.__novelsmithEditorInsert) { w.__novelsmithEditorInsert(text); return; }
    if (selectedFile) updateSelectedFile({ content: selectedFile.content + "\n\n" + text });
  }, [selectedFile, updateSelectedFile]);

  const replaceSelectionInEditor = useCallback((text: string): boolean => {
    const w = window as EditorBridge;
    return w.__novelsmithEditorReplace ? w.__novelsmithEditorReplace(text) : false;
  }, []);

  const handleManualSave = () => {
    persistWorkspace(workspace);
    if (selectedFile) saveVersion(selectedFile.id, { title: selectedFile.title, content: selectedFile.content, summary: selectedFile.summary, wordCount: selectedFile.content.length });
  };

  const handleSaveChatSession = useCallback(() => {
    if (!messages.length) {
      showToast("当前没有可保存的对话", "warning");
      return;
    }
    const firstUserContent = messages.find((m) => m.role === "user")?.content;
    const firstUser = firstUserContent ? chatContentToText(firstUserContent) : selectedFile?.title || "写作对话";
    const title = window.prompt("保存当前对话为：", firstUser.replace(/\s+/g, " ").slice(0, 24));
    if (!title?.trim()) return;
    const session: ChatSession = {
      id: "chat-" + uid(),
      title: title.trim(),
      messages,
      updatedAt: Date.now(),
    };
    setSessions((prev) => [session, ...prev].slice(0, 50));
    showToast("对话已保存到历史", "success");
  }, [messages, selectedFile?.title]);

  const handleGenerateCharacterLog = async () => {
    if (!isConfigured(settings)) { onOpenSettings(); return; }
    if (!selectedFile) return;

    const plainText = htmlToPlainText(selectedFile.content || "");
    if (!plainText || plainText.length < 50) { showToast("当前章节内容太短，无法生成角色日志", "warning"); return; }

    const chapterTitle = selectedFile.title || "未命名章节";
    const prompt = `请分析以下小说章节内容，提取每个出场角色的行为记录。

【章节标题】${chapterTitle}

【章节内容】
${plainText.slice(0, 3000)}

【输出要求】
请严格按以下格式输出每个角色的记录，每个角色一段，格式如下：

角色：[角色名]
事件：[角色在这一章做了什么，一句话概括]
类型：[行为类型：战斗/对话/决策/发现/成长/情感/其他]
状态：[角色当前状态：受伤/觉醒/离开/隐藏/正常等]
影响：[这个事件对后续剧情的可能影响]

---

如果有多个角色，每个角色用"---"分隔。只输出角色记录，不要其他解释。`;

    characterLogAbortRef.current?.abort();
    const controller = new AbortController();
    characterLogAbortRef.current = controller;
    try {
      const result = await sendChat(settings, [{ role: "user", content: prompt }], undefined, controller.signal);

      // 确保「角色日志」分类存在
      const LOG_CATEGORY = "角色日志";
      setWorkspace((prev) => {
        let nextCategories = prev.categories;
        if (!nextCategories.includes(LOG_CATEGORY)) {
          nextCategories = [...nextCategories, LOG_CATEGORY];
        }

        // 解析 AI 输出，按角色分组
        const blocks = result.split(/---+/).filter((b: string) => b.trim());
        const newFiles = [...prev.files];

        blocks.forEach((block: string) => {
          const nameMatch = block.match(/角色[：:]\s*(.+)/);
          if (!nameMatch) return;
          const charName = nameMatch[1].trim();
          const logFileName = `${charName}-角色日志`;

          // 构建日志条目
          const entry = `\n\n### ${chapterTitle}\n${block.trim()}`;

          // 找已有的日志文件
          const existingIdx = newFiles.findIndex(
            (f) => f.category === LOG_CATEGORY && f.title === logFileName,
          );

          if (existingIdx >= 0) {
            // 检查是否已有该章节记录（去重）
            if (newFiles[existingIdx].content.includes(chapterTitle)) return;
            // 追加
            newFiles[existingIdx] = {
              ...newFiles[existingIdx],
              content: newFiles[existingIdx].content + entry,
              updatedAt: Date.now(),
            };
          } else {
            // 新建
            newFiles.push({
              id: uid(),
              category: LOG_CATEGORY,
              title: logFileName,
              content: `# ${charName} 角色日志\n${entry}`,
              summary: `${charName}在各章节中的行为轨迹`,
              updatedAt: Date.now(),
            });
          }
        });

        return { ...prev, categories: nextCategories, files: newFiles };
      });

      showToast("角色日志已生成，请查看左侧文件树「角色日志」分类", "success");
    } catch (e) {
      if (controller.signal.aborted) {
        showToast("已停止角色日志生成", "info");
      } else {
        showToast(e instanceof Error ? e.message : "角色日志生成失败", "error", 5000);
      }
    } finally {
      if (characterLogAbortRef.current === controller) characterLogAbortRef.current = null;
    }
  };

  const selectedFileRef = useRef(selectedFile);
  useEffect(() => { selectedFileRef.current = selectedFile; }, [selectedFile]);
  useEffect(() => {
    if (!selectedFile?.id) return;
    const t = setInterval(() => {
      const cur = selectedFileRef.current;
      if (!cur?.content) return;
      const h = loadHistory(cur.id);
      if (!h[0] || Math.abs(h[0].content.length - cur.content.length) > 200) {
        saveVersion(cur.id, { title: cur.title, content: cur.content, summary: cur.summary, wordCount: cur.content.length });
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [selectedFile?.id]);

  return (
    <div data-theme={isBaimengMode ? "light" : undefined} className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-950 text-white">
      {isZenMode && (
        <div className="fixed top-3 right-16 z-50 flex gap-2">
          <button onClick={() => setShowCommandPalette(true)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 shadow-lg hover:bg-slate-800">⌘K</button>
          <button onClick={() => setIsZenMode(false)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 shadow-lg hover:bg-slate-800">退出专注</button>
        </div>
      )}
      {!isZenMode && (
        <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl shrink-0">
          <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <button onClick={() => setLeftDrawerOpen(true)} className="rounded-xl border border-slate-700 px-2.5 py-2 text-slate-300 hover:bg-slate-800 transition-colors lg:hidden" title="文件树">
                <Menu className="h-4 w-4" />
              </button>
              <button onClick={() => { persistWorkspace(workspace); onBack(); }} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors">← 返回</button>
              <input value={workspace.projectTitle} onChange={(e) => setWorkspace(p => ({ ...p, projectTitle: e.target.value }))} className="w-32 lg:w-44 min-w-0 bg-transparent text-xl font-bold text-white outline-none" />
            </div>
            <div className="hidden lg:flex min-w-0 flex-1 justify-center gap-1.5 overflow-x-auto px-1">
              {aiTools.map(t => (
                <button key={t.key} onClick={() => {
                  const plain = htmlToPlainText(selectedFile?.content || "");
                  if (!plain) { showToast("内容为空", "warning"); return; }
                  setChatPending({ text: t.prompt + "\n\n" + plain, forResult: true, resultTitle: t.label });
                }} className="shrink-0 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors">{t.label}</button>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden lg:flex items-center gap-2">
              <button onClick={() => setShowInspirationWizard(true)} className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm text-purple-300 hover:bg-purple-500/20 transition-colors" title="灵感向导">✨ 灵感向导</button>
              <button onClick={() => setShowAntiCollapse(true)} className="flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20 transition-colors" title="反崩盘工作台：AI腔扫描 + 一致性 + 声音指纹 + 事实台账">
                <ShieldCheck className="h-4 w-4" /> 反崩盘
              </button>
              <button onClick={toggleBaimengMode} className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${isBaimengMode ? "border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`} title="把百梦原型融合到当前工作台界面">
                {isBaimengMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} 百梦融合
              </button>
              <button onClick={openBaimengPrototype} className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-300 hover:bg-sky-500/20 transition-colors" title="打开百梦编辑器静态原型">
                <ExternalLink className="h-4 w-4" /> 百梦原型
              </button>
              <button onClick={() => setAiPanelCollapsed((prev) => !prev)} className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800" title={aiPanelCollapsed ? "展开右侧 AI 面板" : "收起右侧 AI 面板，让编辑器更宽"}>
                {aiPanelCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                {aiPanelCollapsed ? "展开AI" : "收起AI"}
              </button>
              <button onClick={() => setIsZenMode(true)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm transition-colors" title="专注模式 (Ctrl+K)">🧘 专注</button>
              <button onClick={() => setShowCommandPalette(true)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm transition-colors" title="快捷命令 (Ctrl+K)">⌘K</button>
              <button onClick={onOpenSettings} className="p-2 text-slate-400 hover:text-white transition-colors"><Settings className="h-5 w-5"/></button>
              <button onClick={() => exportWorkspaceTxt(workspace)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm transition-colors">导出</button>
              <button onClick={handleExportCurrentBackup} className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-sm transition-colors"><Download className="h-4 w-4" /> 备份</button>
              <button
                onClick={() => {
                  const plain = workspace.files
                    .filter(f => f.category === "主要内容")
                    .map(f => {
                      const text = htmlToPlainText(f.content);
                      // 番茄格式：首行缩进两个全角空格
                      return f.title + "\n\n" + text.split(/\n+/).filter(Boolean).map(p => "\u3000\u3000" + p.trim()).join("\n");
                    })
                    .join("\n\n" + "=".repeat(30) + "\n\n");
                  navigator.clipboard.writeText(plain);
                  showToast("已复制到剪贴板（番茄格式：首行缩进）", "success");
                }}
                className="rounded-xl border border-slate-700 px-3 py-2 text-sm transition-colors"
                title="复制为适合番茄/起点粘贴的纯文本格式"
              >
                📋 番茄格式
              </button>
              </div>
              <button onClick={handleManualSave} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-500">保存</button>
              <div className="relative lg:hidden">
                <button
                  onClick={() => setShowMoreMenu(v => !v)}
                  className="rounded-xl border border-slate-700 px-2.5 py-2 text-slate-300 hover:bg-slate-800 transition-colors"
                  title="更多"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {showMoreMenu && (
                  <>
                    <div onClick={() => setShowMoreMenu(false)} className="fixed inset-0 z-40" />
                    <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
                      <button onClick={() => { setShowInspirationWizard(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-purple-300 hover:bg-slate-800">✨ 灵感向导</button>
                      <button onClick={() => { setShowAntiCollapse(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-emerald-300 hover:bg-slate-800"><ShieldCheck className="h-4 w-4" /> 反崩盘</button>
                      <button onClick={() => { toggleBaimengMode(); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-blue-300 hover:bg-slate-800">{isBaimengMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} 百梦融合</button>
                      <button onClick={() => { openBaimengPrototype(); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-sky-300 hover:bg-slate-800"><ExternalLink className="h-4 w-4" /> 百梦原型</button>
                      <button onClick={() => { setIsZenMode(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800">🧘 专注模式</button>
                      <button onClick={() => { setShowCommandPalette(true); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800">⌘ 快捷命令</button>
                      <div className="my-1 border-t border-slate-800" />
                      <button onClick={() => { onOpenSettings(); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"><Settings className="h-4 w-4" /> 设置</button>
                      <button onClick={() => { exportWorkspaceTxt(workspace); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800">📄 导出 TXT</button>
                      <button onClick={() => { handleExportCurrentBackup(); setShowMoreMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"><Download className="h-4 w-4" /> 备份导出</button>
                      <button
                        onClick={() => {
                          const plain = workspace.files
                            .filter(f => f.category === "主要内容")
                            .map(f => {
                              const text = htmlToPlainText(f.content);
                              return f.title + "\n\n" + text.split(/\n+/).filter(Boolean).map(p => "　　" + p.trim()).join("\n");
                            })
                            .join("\n\n" + "=".repeat(30) + "\n\n");
                          navigator.clipboard.writeText(plain);
                          showToast("已复制到剪贴板（番茄格式：首行缩进）", "success");
                          setShowMoreMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
                      >
                        📋 番茄格式
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => setRightDrawerOpen(true)} className="rounded-xl border border-slate-700 px-2.5 py-2 text-slate-300 hover:bg-slate-800 transition-colors lg:hidden" title="AI 对话">
                <MessageSquare className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
      )}
      <main className={`mx-auto min-h-0 transition-all duration-300 flex-1 overflow-hidden ${isZenMode ? "max-w-full" : "w-full max-w-[1920px] px-3 py-3"}`}>
        <div className="flex h-full min-h-0 gap-3">
          {!isZenMode && (leftDrawerOpen || rightDrawerOpen) && (
            <div
              onClick={() => { setLeftDrawerOpen(false); setRightDrawerOpen(false); }}
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            />
          )}
          {!isZenMode && (
            <div
              style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }}
              className={`flex min-h-0 flex-col fixed inset-y-0 left-0 z-50 transform transition-transform lg:static lg:translate-x-0 lg:shrink-0 ${leftDrawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-3 py-2 lg:hidden">
                <span className="text-sm font-medium text-slate-200">📂 文件树</span>
                <button onClick={() => setLeftDrawerOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <FileTree workspace={workspace} onChange={setWorkspace} onSoftDelete={onSoftDeleteFile} onOpenRecycleBin={onOpenRecycleBin} recycleBinCount={recycleBinCount} />
            </div>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <EnhancedEditor file={selectedFile} workspace={workspace} onUpdate={updateSelectedFile} onAiAction={(ins, s, r) => setChatPending({ text: ins, selectedText: s, replaceMode: r })} onRunAiTool={runAiTool} onManualSave={handleManualSave} onOpenHistory={() => setShowVersionHistory(true)} isZenMode={isZenMode} onToggleZenMode={setIsZenMode} aiWords={aiWords} onOpenHighlightConfig={() => setShowHighlightConfig(true)} onGenerateCharacterLog={handleGenerateCharacterLog} />
          </div>
          {!isZenMode && (!aiPanelCollapsed || rightDrawerOpen) && (
            <div
              style={{ width: RIGHT_PANEL_WIDTH, minWidth: RIGHT_PANEL_WIDTH }}
              className={`flex min-h-0 flex-col fixed inset-y-0 right-0 z-50 transform transition-transform lg:static lg:translate-x-0 lg:shrink-0 ${rightDrawerOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-3 py-2 lg:hidden">
                <span className="text-sm font-medium text-slate-200">🤖 AI 对话</span>
                <button onClick={() => setRightDrawerOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <AIChatPanel workspace={workspace} onWorkspaceChange={setWorkspace} selectedFile={selectedFile} customPrompts={customPrompts} distillations={distillations} settings={settings} messages={messages} onMessagesChange={setMessages} aiResults={aiResults} onAiResultsChange={setAiResults} pendingPrompt={chatPending} onPendingPromptConsumed={() => setChatPending(null)} onOpenSettings={onOpenSettings} onOpenPromptPicker={() => setShowPromptPicker(true)} onOpenFileAssociate={() => setShowAssociatePicker(true)} onOpenDistillationPicker={() => setShowDistillationPicker(true)} onSaveHistory={handleSaveChatSession} onOpenHistory={() => setShowChatHistory(true)} onOpenPreview={p => { setPreviewText(p); setShowPreview(true); }} onInsertToEditor={insertIntoEditor} onReplaceSelectionInEditor={replaceSelectionInEditor} />
            </div>
          )}
        </div>
      </main>
      <PromptPickerModal open={showPromptPicker} selectedIds={workspace.selectedPromptIds} customPrompts={customPrompts} distillations={distillations} onClose={() => setShowPromptPicker(false)} onConfirm={ids => setWorkspace(prev => ({ ...prev, selectedPromptIds: ids }))} onCreateCustomPrompt={() => {
        setEditingPromptDraft({ id: "prompt-" + uid(), title: "", category: "自定义 Skill", description: "", content: "", builtIn: false, linkedDistillationIds: [] });
        setShowEditPromptModal(true);
      }} onCreateAiPrompt={() => {
        if (!isConfigured(settings)) { onOpenSettings(); return; }
        const desc = window.prompt("描述你想生成的 Skill，例如：男频第一章强钩子技能");
        if (!desc?.trim()) return;
        setChatPending({ text: `请生成一个小说写作 Skill。需求：${desc.trim()}\n必须包含：主技能、技能标签、适用场景、输入要求、执行步骤、输出格式、四层验证、失败重写规则。原则：只模仿形，不模仿魂，不照搬原句、桥段和专有设定。`, forResult: true, resultTitle: "Skill 生成" });
        setShowPromptPicker(false);
      }} onEditPrompt={onEditPrompt} onDeletePrompt={onDeletePrompt} onResetDefaults={handleResetPromptDefaults} hasOverrides={customPrompts.some(cp => prompts.some(bp => bp.id === cp.id))} />
      <FileAssociateModal open={showAssociatePicker} files={workspace.files} categories={workspace.categories} selectedFileIds={workspace.associatedFileIds} onClose={() => setShowAssociatePicker(false)} onConfirm={ids => setWorkspace(p => ({ ...p, associatedFileIds: ids }))} onImportFiles={(files) => {
        files.forEach((file) => {
          const id = uid();
          const reader = new FileReader();
          reader.onload = () => {
            const content = String(reader.result || "");
            setWorkspace((prev) => ({
              ...prev,
              files: [...prev.files, { id, category: "知识库", title: file.name.replace(/\.(txt|md)$/i, ""), content, summary: "导入文件", updatedAt: Date.now() }],
              associatedFileIds: prev.associatedFileIds.includes(id) ? prev.associatedFileIds : [...prev.associatedFileIds, id],
            }));
          };
          reader.readAsText(file, "utf-8");
        });
      }} />
      <DistillationPickerModal open={showDistillationPicker} profiles={distillations} selectedIds={workspace.selectedDistillationIds} onClose={() => setShowDistillationPicker(false)} onConfirm={(ids) => setWorkspace((prev) => ({ ...prev, selectedDistillationIds: ids }))} />
      <PreviewModal open={showPreview} text={previewText} onClose={() => setShowPreview(false)} />
      <ChatHistoryModal open={showChatHistory} sessions={sessions} onClose={() => setShowChatHistory(false)} onRestore={s => { setMessages(s.messages); setShowChatHistory(false); }} onDelete={id => setSessions(prev => prev.filter(x => x.id !== id))} />
      <EditPromptModal open={showEditPromptModal} prompt={editingPromptDraft} onClose={() => { setShowEditPromptModal(false); setEditingPromptDraft(null); }} onSave={u => {
        const normalized = normalizePromptTemplate(u);
        onCustomPromptsChange(customPrompts.some(p => p.id === normalized.id) ? customPrompts.map(p => (p.id === normalized.id ? normalized : p)) : [normalized, ...customPrompts]);
        setWorkspace(prev => ({ ...prev, selectedPromptIds: prev.selectedPromptIds.includes(normalized.id) ? prev.selectedPromptIds : [...prev.selectedPromptIds, normalized.id] }));
        setShowEditPromptModal(false);
        setEditingPromptDraft(null);
      }} />
      <VersionHistoryModal open={showVersionHistory} file={selectedFile} onClose={() => setShowVersionHistory(false)} onRestore={v => { if (window.confirm("恢复？")) { updateSelectedFile({ content: v.content, summary: v.summary }); setShowVersionHistory(false); } }} />
      <HighlightConfigModal open={showHighlightConfig} aiWords={aiWordsConfig} onClose={() => setShowHighlightConfig(false)} onSave={w => { setAiWordsConfig(w); saveJSON("novelsmith-ai-words-config", w); }} />
      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} commands={commandList} />
      <InspirationWizard open={showInspirationWizard} bookId={book.id} onClose={() => setShowInspirationWizard(false)} settings={settings} onOpenSettings={onOpenSettings} onAddToProject={(files) => {
        setWorkspace(prev => {
          const nextCategories = Array.from(new Set([...prev.categories, ...files.map((file) => file.category)]));
          return { ...prev, categories: nextCategories, files: [...prev.files, ...files] };
        });
        setShowInspirationWizard(false);
      }} />
      <AntiCollapseModal
        open={showAntiCollapse}
        bookId={book.id}
        currentChapterNumber={
          // 取主要内容里 selectedFile 的索引（从 1 起），便于扫描器和 memory 对齐
          Math.max(1, workspace.files.filter((f) => f.category === "主要内容").findIndex((f) => f.id === selectedFile?.id) + 1)
        }
        currentChapterText={htmlToPlainText(selectedFile?.content || "")}
        onClose={() => setShowAntiCollapse(false)}
      />
    </div>
  );
}

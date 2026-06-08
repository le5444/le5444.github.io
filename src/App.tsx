import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ApiSettings, isConfigured, loadSettings, saveSettings, sendChat } from "./store/settings";
import { createBook, loadLibrary, saveLibrary, invalidateLibraryCache, type BookProject, type LibraryState } from "./store/library";
import { type PromptTemplate, type WorkspaceFile } from "./store/workspace";
import { loadCustomPrompts, saveCustomPrompts, loadJSON, saveJSON, uid, RECYCLE_BIN_KEY, STORAGE_ERROR_EVENT, type RecycledFile, normalizePromptTemplate, wordCount } from "./utils/helpers";
import { loadDistillations, saveDistillations, DISTILLATIONS_KEY, type DistilledProfile } from "./store/distillation";
import { clearHistoryForFiles } from "./store/history";
import { resetAllPromptDefaults } from "./store/prompts";
import { prompts as builtInPrompts } from "./data/prompts";
import { HomePage } from "./components/HomePage";
import { WorkspacePage } from "./components/WorkspacePage";
import { PromptManagerPage } from "./components/PromptManagerPage";
import { PromptOverviewPage } from "./components/PromptOverviewPage";
import { DistillationPage } from "./components/DistillationPage";
import { SettingsModal, BookModal, EditPromptModal, RecycleBinModal } from "./components/Modals";
import { ToastHost } from "./components/ToastHost";
import { showToast } from "./utils/toast";
import { loadStats, recordWordTotal, type WritingStats } from "./store/stats";

type ViewMode = "home" | "workspace" | "prompts" | "overview" | "distill";

export default function App() {
  const [view, setView] = useState<ViewMode>("home");
  const [settings, setSettings] = useState<ApiSettings>(loadSettings);
  const [library, setLibrary] = useState<LibraryState>(loadLibrary);
  const [customPrompts, setCustomPrompts] = useState<PromptTemplate[]>(loadCustomPrompts);
  const [distillations, setDistillations] = useState<DistilledProfile[]>(loadDistillations);
  const [recycleBin, setRecycleBin] = useState<RecycledFile[]>(() => loadJSON<RecycledFile[]>(RECYCLE_BIN_KEY, []));
  const [stats, setStats] = useState<WritingStats>(loadStats);
  const [showSettings, setShowSettings] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingBook, setEditingBook] = useState<BookProject | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(library.lastOpenedBookId);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [showEditPromptModal, setShowEditPromptModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const aiSkillAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => aiSkillAbortRef.current?.abort(), []);

  const persistSettings = useCallback((next: ApiSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => saveLibrary(library), 350);
    return () => window.clearTimeout(timer);
  }, [library]);

  // 写作统计：library 变化 1s 后计算总字数，记录增量到当日。debounce 避免敲字时频繁写 localStorage
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let total = 0;
      for (const book of library.books) {
        for (const file of book.workspace.files) {
          total += wordCount(file.content).total;
        }
      }
      const next = recordWordTotal(total);
      setStats(next);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [library]);
  useEffect(() => {
    const timer = window.setTimeout(() => saveCustomPrompts(customPrompts), 350);
    return () => window.clearTimeout(timer);
  }, [customPrompts]);
  useEffect(() => {
    const timer = window.setTimeout(() => saveDistillations(distillations), 350);
    return () => window.clearTimeout(timer);
  }, [distillations]);
  useEffect(() => {
    const timer = window.setTimeout(() => saveJSON(RECYCLE_BIN_KEY, recycleBin), 350);
    return () => window.clearTimeout(timer);
  }, [recycleBin]);
  // beforeunload 兜底 flush：用 ref 持有最新 state，监听只注册一次
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushRef.current = () => {
      saveLibrary(library);
      saveCustomPrompts(customPrompts);
      saveDistillations(distillations);
      saveJSON(RECYCLE_BIN_KEY, recycleBin);
    };
  }, [library, customPrompts, distillations, recycleBin]);
  useEffect(() => {
    const flush = () => flushRef.current?.();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  // 30 天回收站清理：挂载时跑一次 + 之后每小时自动跑；清理同时回收过期文件的版本历史 key
  useEffect(() => {
    const purgeOld = () => {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      setRecycleBin((prev) => {
        const expired = prev.filter((item) => item.deletedAt <= cutoff);
        if (!expired.length) return prev;
        const ids: string[] = [];
        for (const item of expired) {
          if (item.type === "file") {
            const f = (item.data as { file?: WorkspaceFile } | null)?.file;
            if (f?.id) ids.push(f.id);
          } else {
            const book = item.data as BookProject | null;
            book?.workspace?.files?.forEach((f) => ids.push(f.id));
          }
        }
        if (ids.length) clearHistoryForFiles(ids);
        return prev.filter((item) => item.deletedAt > cutoff);
      });
    };
    purgeOld();
    const t = window.setInterval(purgeOld, 60 * 60 * 1000);
    return () => window.clearInterval(t);
  }, []);

  // 多 tab 同步：监听 storage 事件，其他标签页改动时把对应内存状态拉回来
  useEffect(() => {
    let warned = false;
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith("novelsmith-library")) {
        invalidateLibraryCache();
        setLibrary(loadLibrary());
      } else if (e.key === "novelsmith-global-custom-prompts") {
        setCustomPrompts(loadCustomPrompts());
      } else if (e.key === DISTILLATIONS_KEY) {
        setDistillations(loadDistillations());
      } else if (e.key === RECYCLE_BIN_KEY) {
        setRecycleBin(loadJSON<RecycledFile[]>(RECYCLE_BIN_KEY, []));
      } else if (e.key === "novelsmith-api-settings") {
        setSettings(loadSettings());
      } else {
        return;
      }
      if (!warned) {
        warned = true;
        window.setTimeout(() => { warned = false; }, 8000);
        console.info("[novelsmith] 检测到其他标签页修改了数据，已同步最新内容");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    let shown = false;
    const handleStorageError = () => {
      if (shown) return;
      shown = true;
      showToast("浏览器本地存储写入失败：数据过大或空间不足。请先点击「备份导出」保存数据，再清理无用历史 / 内容。", "error", 8000);
      window.setTimeout(() => { shown = false; }, 5000);
    };
    window.addEventListener(STORAGE_ERROR_EVENT, handleStorageError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, handleStorageError);
  }, []);

  const selectedBook = useMemo(() => library.books.find((b) => b.id === selectedBookId) || library.books[0] || null, [library.books, selectedBookId]);

  const openBook = useCallback((id: string) => {
    setSelectedBookId(id);
    setLibrary((prev) => ({ ...prev, lastOpenedBookId: id }));
    setView("workspace");
  }, []);

  const openBookFile = useCallback((bookId: string, fileId: string) => {
    setSelectedBookId(bookId);
    setLibrary((prev) => ({
      ...prev,
      lastOpenedBookId: bookId,
      books: prev.books.map((book) => book.id === bookId
        ? { ...book, updatedAt: Date.now(), workspace: { ...book.workspace, selectedFileId: fileId } }
        : book),
    }));
    setView("workspace");
  }, []);

  const upsertBook = useCallback((book: BookProject) => {
    setLibrary((prev) => ({
      ...prev,
      books: prev.books.some((b) => b.id === book.id) ? prev.books.map((b) => (b.id === book.id ? book : b)) : [book, ...prev.books],
      lastOpenedBookId: book.id,
    }));
  }, []);

  const handleCreateOrEditBook = (payload: { title: string; description: string; type: string; cover: string }) => {
    if (editingBook) {
      upsertBook({ ...editingBook, ...payload, updatedAt: Date.now(), workspace: { ...editingBook.workspace, projectTitle: payload.title } });
      setEditingBook(null);
      setShowBookModal(false);
      return;
    }
    const book = createBook(payload);
    upsertBook(book);
    setShowBookModal(false);
    openBook(book.id);
  };

  const handleDeleteBook = (id: string) => {
    const book = library.books.find((b) => b.id === id);
    if (!book) return;
    if (!window.confirm("删除 Workspace「" + book.title + "」？删除后可在回收站恢复。")) return;
    setRecycleBin((prev) => [{ id: "book-" + uid(), type: "book", title: book.title, data: book, deletedAt: Date.now() }, ...prev]);
    setLibrary((prev) => {
      const remaining = prev.books.filter((b) => b.id !== id);
      return { books: remaining, lastOpenedBookId: prev.lastOpenedBookId === id ? remaining[0]?.id ?? null : prev.lastOpenedBookId };
    });
    if (selectedBookId === id) { setSelectedBookId(null); setView("home"); }
  };

  const handleSoftDeleteFile = useCallback((file: WorkspaceFile) => {
    setRecycleBin((prev) => [{ id: "file-" + uid(), type: "file", title: file.title, data: { file, bookId: selectedBookId }, deletedAt: Date.now() }, ...prev]);
  }, [selectedBookId]);

  const handleRestoreFromBin = (id: string) => {
    const item = recycleBin.find((r) => r.id === id);
    if (!item) return;
    if (item.type === "book") {
      const book = item.data as BookProject;
      upsertBook(book);
    } else {
      const { file, bookId } = item.data as { file: WorkspaceFile; bookId: string | null };
      setLibrary((prev) => ({
        ...prev,
        books: prev.books.map((b) => (b.id === bookId ? { ...b, workspace: { ...b.workspace, files: [...b.workspace.files, file] } } : b)),
      }));
    }
    setRecycleBin((prev) => prev.filter((r) => r.id !== id));
  };

  const collectFileIds = useCallback((item: RecycledFile): string[] => {
    if (item.type === "file") {
      const f = (item.data as { file?: WorkspaceFile } | null)?.file;
      return f?.id ? [f.id] : [];
    }
    const book = item.data as BookProject | null;
    return book?.workspace?.files?.map((f) => f.id) ?? [];
  }, []);

  const handlePurgeFromBin = (id: string) => {
    const target = recycleBin.find((r) => r.id === id);
    if (target) clearHistoryForFiles(collectFileIds(target));
    setRecycleBin((prev) => prev.filter((r) => r.id !== id));
  };

  const handleClearBin = () => {
    if (!window.confirm("确定清空回收站？此操作不可恢复。")) return;
    const allFileIds = recycleBin.flatMap(collectFileIds);
    clearHistoryForFiles(allFileIds);
    setRecycleBin([]);
  };

  const handleUsePromptWithAi = (text: string) => {
    let targetId = selectedBookId || library.lastOpenedBookId || library.books[0]?.id || null;
    if (!targetId) {
      const book = createBook({ title: "Agent Scratch Workspace", type: "Writing Agent", cover: "◇" });
      upsertBook(book);
      targetId = book.id;
    }
    setPendingPrompt(text);
    openBook(targetId);
  };

  const handleAiGeneratePrompt = async () => {
    if (!isConfigured(settings)) {
      setShowSettings(true);
      return;
    }
    const desc = window.prompt("请描述你想生成什么 Skill，比如：番茄女频暧昧拉扯开局技能");
    if (!desc) return;
    aiSkillAbortRef.current?.abort();
    const controller = new AbortController();
    aiSkillAbortRef.current = controller;
    try {
      const result = await sendChat(settings, [{
        role: "user",
        content: `请为我生成一个可复用的小说 Skill，而不是泛泛的提示词模板。

需求：${desc}

要求：
1. 只模仿形，不模仿魂：提炼结构、节奏、冲突、人物驱动、验证，不得照搬原句、桥段和专有设定。
2. 必须包含：主技能、技能标签、适用场景、输入要求、执行步骤、输出格式、七层验证（输入完整性 / Skill 命中 / 结构 / 风格 / 人物 / 生成性 / 边界）、失败重写规则。
3. 如果任一验证层不通过，先重写再输出最终稿。
4. 按如下格式输出：
标题：...
分类：...
描述：...
内容：...`,
      }], undefined, controller.signal);
      const needsRepair = !/主技能|技能标签|验证层|结构验证|风格验证|生成验证|边界验证/.test(result);
      const finalResult = needsRepair
        ? await sendChat(settings, [{
            role: "user",
            content: `你上一次输出的 Skill 不完整。请重写，必须补齐主技能、技能标签、验证层，并保持“只模仿形，不模仿魂”的原则。

原始需求：${desc}

请按以下格式输出：
标题：...
分类：...
描述：...
内容：...`,
          }], undefined, controller.signal)
        : result;
      const title = finalResult.match(/标题[:：]\s*(.+)/)?.[1]?.trim() || desc;
      const category = finalResult.match(/分类[:：]\s*(.+)/)?.[1]?.trim() || "AI生成Skill";
      const description = finalResult.match(/描述[:：]\s*(.+)/)?.[1]?.trim() || desc;
      const content = finalResult.split(/内容[:：]/).slice(1).join("内容：").trim() || finalResult;
      const skill = normalizePromptTemplate({ id: "home-ai-" + uid(), title, category, description, content, builtIn: false });
      setCustomPrompts((prev) => [skill, ...prev]);
      showToast("AI Skill 已生成并加入技能库。", "success");
    } catch (e) {
      if (controller.signal.aborted) {
        showToast("已停止 AI Skill 生成", "info");
      } else {
        showToast(e instanceof Error ? e.message : "AI Skill 生成失败", "error");
      }
    } finally {
      if (aiSkillAbortRef.current === controller) aiSkillAbortRef.current = null;
    }
  };

  const handleCreatePrompt = () => {
    setEditingPrompt({ id: "new-" + uid(), title: "", category: "自定义 Skill", description: "", content: "", builtIn: false, linkedDistillationIds: [] });
    setShowEditPromptModal(true);
  };

  const handleEditPrompt = (prompt: PromptTemplate) => {
    setEditingPrompt(prompt);
    setShowEditPromptModal(true);
  };

  const handleSaveEditPrompt = (updated: PromptTemplate) => {
    const normalized = normalizePromptTemplate(updated);
    setCustomPrompts((prev) => {
      if (prev.some((p) => p.id === updated.id)) {
        return prev.map((p) => (p.id === updated.id ? normalized : p));
      }
      return [normalized, ...prev];
    });
    setEditingPrompt(null);
    setShowEditPromptModal(false);
  };

  const handleDeletePrompt = (id: string) => {
    setCustomPrompts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleResetPromptDefaults = useCallback(() => {
    const builtInIds = new Set(builtInPrompts.map((p) => p.id));
    resetAllPromptDefaults();
    setCustomPrompts((prev) => prev.filter((p) => !builtInIds.has(p.id)));
  }, []);

  const handleExportBackup = (bookOverride?: BookProject) => {
    const backupLibrary = bookOverride
      ? {
          ...library,
          books: library.books.some((b) => b.id === bookOverride.id)
            ? library.books.map((b) => (b.id === bookOverride.id ? bookOverride : b))
            : [bookOverride, ...library.books],
          lastOpenedBookId: bookOverride.id,
        }
      : library;

    // 抽出所有反崩盘相关 localStorage 数据
    const antiCollapseStores: Record<string, unknown> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("novelsmith-memory:") || k.startsWith("novelsmith-character-fingerprints:")) {
          const v = localStorage.getItem(k);
          if (v) {
            try { antiCollapseStores[k] = JSON.parse(v); } catch { antiCollapseStores[k] = v; }
          }
        }
      }
    } catch { /* ignore */ }

    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      library: backupLibrary,
      customPrompts,
      distillations,
      recycleBin,
      settings: { ...settings, apiKey: "" },
      chatSessions: loadJSON("novelsmith-chat-sessions", []),
      versionHistory: loadJSON("novelsmith-version-history", {}),
      aiWordsConfig: loadJSON("novelsmith-ai-words-config", "仿佛,缓缓,不禁,顿时,似乎,目光,嘴角"),
      antiCollapse: antiCollapseStores,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `novelsmith-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (file: File) => {
    try {
      const raw = await file.text();
      const backup = JSON.parse(raw) as Partial<{
        library: LibraryState;
        customPrompts: PromptTemplate[];
        distillations: DistilledProfile[];
        recycleBin: RecycledFile[];
        settings: ApiSettings;
        chatSessions: unknown;
        versionHistory: unknown;
        aiWordsConfig: unknown;
        antiCollapse: Record<string, unknown>;
      }>;

      // === Schema 校验：拒绝结构异常的备份，避免直接覆盖 Workspace 库 ===
      const isValidBook = (b: unknown): boolean => {
        if (!b || typeof b !== "object") return false;
        const o = b as Record<string, unknown>;
        if (typeof o.id !== "string" || !o.id) return false;
        if (typeof o.title !== "string") return false;
        if (!o.workspace || typeof o.workspace !== "object") return false;
        const ws = o.workspace as Record<string, unknown>;
        if (!Array.isArray(ws.files)) return false;
        return ws.files.every((f) => f && typeof f === "object" && typeof (f as { id?: unknown }).id === "string");
      };
      if (!backup || typeof backup !== "object") throw new Error("备份文件不是合法 JSON 对象");
      if (!backup.library || typeof backup.library !== "object") throw new Error("备份文件缺少 library 字段");
      if (!Array.isArray(backup.library.books) || !backup.library.books.length) throw new Error("备份文件缺少 Workspace 数据");
      const badIdx = backup.library.books.findIndex((b) => !isValidBook(b));
      if (badIdx >= 0) throw new Error(`备份文件第 ${badIdx + 1} 个 Workspace 结构异常（缺少 id / title / workspace.files）`);
      if (backup.customPrompts !== undefined && !Array.isArray(backup.customPrompts)) throw new Error("备份文件 customPrompts 字段格式异常");
      if (backup.distillations !== undefined && !Array.isArray(backup.distillations)) throw new Error("备份文件 distillations 字段格式异常");
      if (backup.recycleBin !== undefined && !Array.isArray(backup.recycleBin)) throw new Error("备份文件 recycleBin 字段格式异常");

      if (!window.confirm(`导入 ${backup.library.books.length} 个 Workspace 会覆盖当前 Workspace 库、提示词和回收站，确定继续？`)) return;

      setLibrary(backup.library);
      setSelectedBookId(backup.library.lastOpenedBookId ?? backup.library.books[0]?.id ?? null);
      setCustomPrompts(Array.isArray(backup.customPrompts) ? backup.customPrompts.map((item) => normalizePromptTemplate(item)) : []);
      setDistillations(Array.isArray(backup.distillations) ? backup.distillations : []);
      setRecycleBin(Array.isArray(backup.recycleBin) ? backup.recycleBin : []);
      if (backup.settings) {
        const nextSettings = { ...settings, ...backup.settings, apiKey: settings.apiKey };
        setSettings(nextSettings);
        saveSettings(nextSettings);
      }
      if (backup.chatSessions) saveJSON("novelsmith-chat-sessions", backup.chatSessions);
      if (backup.versionHistory) saveJSON("novelsmith-version-history", backup.versionHistory);
      if (backup.aiWordsConfig) saveJSON("novelsmith-ai-words-config", backup.aiWordsConfig);
      if (backup.distillations) saveJSON(DISTILLATIONS_KEY, backup.distillations);
      if (backup.antiCollapse && typeof backup.antiCollapse === "object") {
        Object.entries(backup.antiCollapse).forEach(([k, v]) => {
          if (k.startsWith("novelsmith-memory:") || k.startsWith("novelsmith-character-fingerprints:")) {
            try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
          }
        });
      }
      setView("home");
      showToast("备份已导入。API 密钥不会从备份中覆盖，需要时请在设置里重新确认。", "success", 6000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "备份导入失败", "error", 6000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <input
        ref={backupInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportBackup(file);
          e.currentTarget.value = "";
        }}
      />
      {view === "home" ? (
        <HomePage
          library={library}
          customPrompts={customPrompts}
          settings={settings}
          recycleBinCount={recycleBin.length}
          stats={stats}
          onStatsChange={() => setStats(loadStats())}
          onOpenBook={openBook}
          onOpenBookFile={openBookFile}
          onCreateBook={() => { setEditingBook(null); setShowBookModal(true); }}
          onEditBook={(book) => { setEditingBook(book); setShowBookModal(true); }}
          onDeleteBook={handleDeleteBook}
          onUsePromptWithAi={handleUsePromptWithAi}
          onOpenSettings={() => setShowSettings(true)}
          onSettingsChange={persistSettings}
          onAiGeneratePrompt={handleAiGeneratePrompt}
          onCreatePrompt={handleCreatePrompt}
          onEditPrompt={handleEditPrompt}
          onDeletePrompt={handleDeletePrompt}
          onOpenRecycleBin={() => setShowRecycleBin(true)}
          onResetDefaults={handleResetPromptDefaults}
          onOpenOverview={() => setView("overview")}
          onOpenDistillation={() => setView("distill")}
          onExportBackup={handleExportBackup}
          onImportBackup={() => backupInputRef.current?.click()}
          onBack={() => setView("prompts")}
        />
      ) : view === "overview" ? (
        <PromptOverviewPage
          onBack={() => setView("home")}
          onUsePrompt={(p) => handleUsePromptWithAi(p.content)}
        />
      ) : view === "distill" ? (
        <DistillationPage
          profiles={distillations}
          customPrompts={customPrompts}
          onBack={() => setView("home")}
          onChange={setDistillations}
          onSavePrompts={setCustomPrompts}
          settings={settings}
          onOpenSettings={() => setShowSettings(true)}
        />
      ) : view === "prompts" ? (
        <PromptManagerPage
          customPrompts={customPrompts}
          distillations={distillations}
          onBack={() => setView("home")}
          onSavePrompts={setCustomPrompts}
          settings={settings}
          onOpenSettings={() => setShowSettings(true)}
        />
      ) : selectedBook ? (
        <WorkspacePage
          key={selectedBook.id}
          book={selectedBook}
          settings={settings}
          customPrompts={customPrompts}
          distillations={distillations}
          onBack={() => setView("home")}
          onOpenSettings={() => setShowSettings(true)}
          onBookChange={upsertBook}
          onCustomPromptsChange={setCustomPrompts}
          onSoftDeleteFile={handleSoftDeleteFile}
          onOpenRecycleBin={() => setShowRecycleBin(true)}
          recycleBinCount={recycleBin.length}
          pendingPrompt={pendingPrompt}
          onPendingPromptConsumed={() => setPendingPrompt("")}
          onEditPrompt={handleEditPrompt}
          onDeletePrompt={handleDeletePrompt}
          onExportBackup={handleExportBackup}
        />
      ) : (
        <div className="py-20 text-center text-slate-500">正在进入工作台...</div>
      )}

      <SettingsModal
        open={showSettings}
        settings={settings}
        onClose={() => setShowSettings(false)}
        onSave={persistSettings}
      />
      <BookModal
        open={showBookModal}
        initial={editingBook}
        onClose={() => { setShowBookModal(false); setEditingBook(null); }}
        onSubmit={handleCreateOrEditBook}
      />
      <EditPromptModal
        open={showEditPromptModal}
        prompt={editingPrompt}
        onClose={() => { setShowEditPromptModal(false); setEditingPrompt(null); }}
        onSave={handleSaveEditPrompt}
      />
      <RecycleBinModal
        open={showRecycleBin}
        items={recycleBin.map((r) => ({ id: r.id, type: r.type as "file" | "book", title: r.title, deletedAt: r.deletedAt }))}
        onClose={() => setShowRecycleBin(false)}
        onRestore={handleRestoreFromBin}
        onPurge={handlePurgeFromBin}
        onClear={handleClearBin}
      />
      <ToastHost />
    </div>
  );
}

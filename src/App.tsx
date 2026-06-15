import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiSettings, loadSettings, saveSettings } from "./store/settings";
import { createBook, loadLibrary, saveLibrary, invalidateLibraryCache, type BookProject, type LibraryState } from "./store/library";
import { type PromptTemplate, type WorkspaceFile } from "./store/workspace";
import { loadCustomPrompts, saveCustomPrompts, loadJSON, saveJSON, RECYCLE_BIN_KEY, STORAGE_ERROR_EVENT, type RecycledFile, wordCount } from "./utils/helpers";
import { loadDistillations, saveDistillations, DISTILLATIONS_KEY, type DistilledProfile } from "./store/distillation";
import { clearHistoryForFiles } from "./store/history";
import { HomePage } from "./components/HomePage";
import { SettingsModal, BookModal } from "./components/Modals";
import { ToastHost } from "./components/ToastHost";
import { showToast } from "./utils/toast";
import { recordWordTotal } from "./store/stats";

export default function App() {
  const [settings, setSettings] = useState<ApiSettings>(loadSettings);
  const [library, setLibrary] = useState<LibraryState>(loadLibrary);
  const [customPrompts, setCustomPrompts] = useState<PromptTemplate[]>(loadCustomPrompts);
  const [distillations, setDistillations] = useState<DistilledProfile[]>(loadDistillations);
  const [recycleBin, setRecycleBin] = useState<RecycledFile[]>(() => loadJSON<RecycledFile[]>(RECYCLE_BIN_KEY, []));
  const [showSettings, setShowSettings] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingBook, setEditingBook] = useState<BookProject | null>(null);

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
      recordWordTotal(total);
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

  const focusBookInWorkbench = useCallback((id: string) => {
    setLibrary((prev) => ({ ...prev, lastOpenedBookId: id }));
  }, []);

  const renameBookFromWorkbench = useCallback((id: string, nextTitleInput: string) => {
    const book = library.books.find((item) => item.id === id);
    if (!book) {
      showToast("没有找到这个项目。", "warning");
      return;
    }
    const nextTitle = nextTitleInput.trim();
    if (!nextTitle) {
      showToast("项目名称不能为空。", "warning");
      return;
    }
    if (nextTitle === book.title) return;
    setLibrary((prev) => ({
      ...prev,
      books: prev.books.map((item) => item.id === id
        ? {
          ...item,
          title: nextTitle,
          updatedAt: Date.now(),
          workspace: { ...item.workspace, projectTitle: nextTitle },
        }
        : item),
    }));
    showToast(`已重命名为“${nextTitle}”。`, "success");
  }, [library.books]);

  const deleteBookFromWorkbench = useCallback((id: string, options?: { confirmed?: boolean }) => {
    const book = library.books.find((item) => item.id === id);
    if (!book) {
      showToast("没有找到这个项目。", "warning");
      return;
    }
    if (library.books.length <= 1) {
      showToast("至少保留一个项目，不能删除最后一个项目。", "warning");
      return;
    }
    if (!options?.confirmed) {
      showToast("请先在工作台弹窗里确认删除项目。", "warning");
      return;
    }
    const deletedAt = Date.now();
    setRecycleBin((prev) => [{
      id: `book-${book.id}-${deletedAt}`,
      type: "book",
      title: book.title,
      data: book,
      deletedAt,
    }, ...prev]);
    setLibrary((prev) => {
      const nextBooks = prev.books.filter((item) => item.id !== id);
      return {
        ...prev,
        books: nextBooks,
        lastOpenedBookId: prev.lastOpenedBookId === id ? nextBooks[0]?.id || null : prev.lastOpenedBookId,
      };
    });
    showToast(`已将“${book.title}”移入回收站。`, "success");
  }, [library.books]);

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
    focusBookInWorkbench(book.id);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <HomePage
        library={library}
        customPrompts={customPrompts}
        settings={settings}
        onSelectBook={focusBookInWorkbench}
        onRenameBook={renameBookFromWorkbench}
        onDeleteBook={deleteBookFromWorkbench}
        onCreateBook={() => { setEditingBook(null); setShowBookModal(true); }}
        onOpenSettings={() => setShowSettings(true)}
        onSettingsChange={persistSettings}
      />

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
      <ToastHost />
    </div>
  );
}

import { defaultWorkspace, type WorkspaceState } from "./workspace";
import { STORAGE_ERROR_EVENT } from "../utils/helpers";

export interface BookProject {
  id: string;
  title: string;
  description: string;
  type: string;
  cover: string;
  updatedAt: number;
  createdAt: number;
  workspace: WorkspaceState;
}

export interface LibraryState {
  books: BookProject[];
  lastOpenedBookId: string | null;
}

const LEGACY_KEY = "novelsmith-library";
const META_KEY = "novelsmith-library:meta";
const BOOK_KEY_PREFIX = "novelsmith-library:book:";

export const LIBRARY_KEY_PREFIX = "novelsmith-library";

interface LibraryMeta {
  bookIds: string[];
  lastOpenedBookId: string | null;
}

// 引用比较缓存：只写发生变化的书，避免 350ms 节流时把整库 stringify
const lastSavedBooks = new Map<string, BookProject>();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function createBook(seed?: Partial<BookProject>): BookProject {
  const now = Date.now();
  const title = seed?.title?.trim() || "Untitled Workspace";
  const workspace = seed?.workspace ?? defaultWorkspace();
  workspace.projectTitle = title;

  return {
    id: seed?.id || uid(),
    title,
    description: seed?.description || "",
    type: seed?.type || "Writing Agent",
    cover: seed?.cover || "📘",
    updatedAt: seed?.updatedAt || now,
    createdAt: seed?.createdAt || now,
    workspace,
  };
}

export function defaultLibrary(): LibraryState {
  const starter = createBook({
    title: "Personal Workspace",
    description: "织梦写作台默认工作区；LumenOS 负责底层 Agent 运行层。",
    type: "Writing Agent",
    cover: "◇",
  });
  return {
    books: [starter],
    lastOpenedBookId: starter.id,
  };
}

function loadFromSplitKeys(): LibraryState | null {
  const metaRaw = localStorage.getItem(META_KEY);
  if (!metaRaw) return null;
  try {
    const meta = JSON.parse(metaRaw) as LibraryMeta;
    if (!Array.isArray(meta.bookIds)) return null;
    const books: BookProject[] = [];
    for (const id of meta.bookIds) {
      const raw = localStorage.getItem(BOOK_KEY_PREFIX + id);
      if (!raw) continue;
      try {
        const book = JSON.parse(raw) as BookProject;
        if (book && typeof book.id === "string" && book.workspace) {
          books.push(book);
          lastSavedBooks.set(book.id, book);
        }
      } catch {
        /* skip corrupt book */
      }
    }
    if (!books.length) return null;
    return {
      books,
      lastOpenedBookId: meta.lastOpenedBookId ?? books[0]?.id ?? null,
    };
  } catch {
    return null;
  }
}

function migrateFromLegacy(): LibraryState | null {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LibraryState>;
    if (!parsed.books?.length) return null;
    const state: LibraryState = {
      books: parsed.books,
      lastOpenedBookId: parsed.lastOpenedBookId ?? parsed.books[0]?.id ?? null,
    };
    saveLibrary(state);
    localStorage.removeItem(LEGACY_KEY);
    return state;
  } catch {
    return null;
  }
}

export function loadLibrary(): LibraryState {
  try {
    const split = loadFromSplitKeys();
    if (split) return split;
    const migrated = migrateFromLegacy();
    if (migrated) return migrated;
    return defaultLibrary();
  } catch {
    return defaultLibrary();
  }
}

export function saveLibrary(state: LibraryState) {
  try {
    const meta: LibraryMeta = {
      bookIds: state.books.map((b) => b.id),
      lastOpenedBookId: state.lastOpenedBookId,
    };
    localStorage.setItem(META_KEY, JSON.stringify(meta));

    const seen = new Set<string>();
    for (const book of state.books) {
      seen.add(book.id);
      // 只在引用变化时写——React 不可变更新保证未改动的 book 引用不变
      if (lastSavedBooks.get(book.id) !== book) {
        localStorage.setItem(BOOK_KEY_PREFIX + book.id, JSON.stringify(book));
        lastSavedBooks.set(book.id, book);
      }
    }
    // 清掉本地仍存在但已从 state 移除的书
    for (const id of Array.from(lastSavedBooks.keys())) {
      if (!seen.has(id)) {
        localStorage.removeItem(BOOK_KEY_PREFIX + id);
        lastSavedBooks.delete(id);
      }
    }
    return true;
  } catch (error) {
    console.error("Novelsmith library write failed:", error);
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key: META_KEY } }));
    return false;
  }
}

// 用于多 tab 同步：清掉引用缓存以便下次 loadLibrary 完整读
export function invalidateLibraryCache() {
  lastSavedBooks.clear();
}

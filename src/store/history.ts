import { STORAGE_ERROR_EVENT } from "../utils/helpers";

const LEGACY_KEY = "novelsmith-version-history";
const FILE_KEY_PREFIX = "novelsmith-version-history:";
const MAX_VERSIONS_PER_FILE = 50;

export type VersionEntry = {
  id: string;
  title: string;
  content: string;
  summary: string;
  createdAt: number;
  wordCount: number;
};

function fileKey(fileId: string) {
  return FILE_KEY_PREFIX + fileId;
}

// 旧格式：单 key 巨型 JSON。首次访问时按 fileId 拆分到独立 key，迁移完删掉旧 key。
let legacyMigrated = false;
function migrateLegacy(): Record<string, VersionEntry[]> | null {
  if (legacyMigrated) return null;
  legacyMigrated = true;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, VersionEntry[]>;
    if (!all || typeof all !== "object") return null;
    for (const [id, list] of Object.entries(all)) {
      if (Array.isArray(list) && list.length) {
        try {
          localStorage.setItem(fileKey(id), JSON.stringify(list.slice(0, MAX_VERSIONS_PER_FILE)));
        } catch {
          /* skip oversized */
        }
      }
    }
    localStorage.removeItem(LEGACY_KEY);
    return all;
  } catch {
    return null;
  }
}

export function loadHistory(fileId: string): VersionEntry[] {
  try {
    const raw = localStorage.getItem(fileKey(fileId));
    if (raw) {
      const list = JSON.parse(raw) as VersionEntry[];
      return Array.isArray(list) ? list : [];
    }
    // 命中旧格式：迁移整张表后再读
    const legacy = migrateLegacy();
    if (legacy && Array.isArray(legacy[fileId])) return legacy[fileId];
    return [];
  } catch {
    return [];
  }
}

export function saveVersion(fileId: string, entry: Omit<VersionEntry, "id" | "createdAt">) {
  try {
    const list = loadHistory(fileId);
    const newList = [{ id: "v-" + Date.now(), createdAt: Date.now(), ...entry }, ...list].slice(0, MAX_VERSIONS_PER_FILE);
    localStorage.setItem(fileKey(fileId), JSON.stringify(newList));
  } catch (error) {
    console.error("Novelsmith version history write failed:", error);
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key: fileKey(fileId) } }));
  }
}

export function rollbackVersion(fileId: string, versionId: string): VersionEntry | null {
  const list = loadHistory(fileId);
  return list.find((v) => v.id === versionId) || null;
}

export function clearHistory(fileId: string) {
  try {
    localStorage.removeItem(fileKey(fileId));
  } catch (error) {
    console.error("Novelsmith version history clear failed:", error);
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key: fileKey(fileId) } }));
  }
}

// 批量清理：用于书籍删除或回收站清空时回收 history 占用
export function clearHistoryForFiles(fileIds: string[]) {
  for (const id of fileIds) {
    try {
      localStorage.removeItem(fileKey(id));
    } catch {
      /* ignore */
    }
  }
}

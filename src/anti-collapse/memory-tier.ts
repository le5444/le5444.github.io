// 三级记忆 + 信任分级 + 长程压缩
// 白泽 24 岗：L1 当前卷 + 前 1 卷全文 / L2 前 2-10 卷事件摘要 + 关系变化时间线 / L3 冷压缩
// 金/银/灰/红 trust tier 决定可信度
import { loadJSON, saveJSON, uid } from "../utils/helpers";
import type { ChapterSummary, ObligationEntry, TimelineEntry, TrustTier, WorldAxiom } from "./types";

const KEY = (bookId: string) => `novelsmith-memory:${bookId}`;

export interface MemoryStore {
  bookId: string;
  worldAxioms: WorldAxiom[];
  obligations: ObligationEntry[];
  timeline: TimelineEntry[];
  chapterSummaries: ChapterSummary[];
  updatedAt: number;
}

export function loadMemory(bookId: string): MemoryStore {
  return loadJSON<MemoryStore>(KEY(bookId), {
    bookId,
    worldAxioms: [],
    obligations: [],
    timeline: [],
    chapterSummaries: [],
    updatedAt: Date.now(),
  });
}

export function saveMemory(store: MemoryStore) {
  store.updatedAt = Date.now();
  saveJSON(KEY(store.bookId), store);
}

export function upsertWorldAxiom(store: MemoryStore, axiom: Omit<WorldAxiom, "id"> & { id?: string }): MemoryStore {
  const id = axiom.id || "axiom-" + uid();
  const existing = store.worldAxioms.findIndex((a) => a.id === id);
  const next = { ...axiom, id } as WorldAxiom;
  const list = existing >= 0
    ? store.worldAxioms.map((a, i) => (i === existing ? next : a))
    : [...store.worldAxioms, next];
  return { ...store, worldAxioms: list };
}

export function upsertObligation(store: MemoryStore, ob: Omit<ObligationEntry, "id"> & { id?: string }): MemoryStore {
  const id = ob.id || "ob-" + uid();
  const next = { ...ob, id } as ObligationEntry;
  const list = store.obligations.some((x) => x.id === id)
    ? store.obligations.map((x) => (x.id === id ? next : x))
    : [...store.obligations, next];
  return { ...store, obligations: list };
}

export function checkOverdueObligations(store: MemoryStore, currentChapter: number): ObligationEntry[] {
  return store.obligations
    .filter((o) => o.status === "active")
    .map((o) => {
      if (o.expectedPayoffChapter && currentChapter > o.expectedPayoffChapter) {
        return { ...o, status: "overdue" as const };
      }
      return o;
    })
    .filter((o) => o.status === "overdue");
}

export function upsertChapterSummary(store: MemoryStore, summary: ChapterSummary): MemoryStore {
  const list = store.chapterSummaries.some((s) => s.chapter === summary.chapter)
    ? store.chapterSummaries.map((s) => (s.chapter === summary.chapter ? summary : s))
    : [...store.chapterSummaries, summary].sort((a, b) => a.chapter - b.chapter);
  return { ...store, chapterSummaries: list };
}

// 长程压缩：取出与当前章节相关的"必须记住的"
export function buildContextSlice(store: MemoryStore, currentChapter: number): {
  goldAxioms: string;
  recentChapters: string;
  remoteSummary: string;
  activeObligations: string;
  timelineLocks: string;
} {
  const gold = store.worldAxioms.filter((a) => a.trust === "gold" || a.trust === "silver");
  const goldAxioms = gold.length
    ? gold.map((a) => `- [${a.category}] ${a.rule}`).join("\n")
    : "（暂无世界圣典规则）";

  // L1：当前卷 + 前 1 卷（近 30 章）全文摘要
  const recentBoundary = Math.max(1, currentChapter - 30);
  const recent = store.chapterSummaries.filter((s) => s.chapter >= recentBoundary && s.chapter < currentChapter);
  const recentChapters = recent.length
    ? recent.slice(-15).map((s) =>
        `[第${s.chapter}章] ${s.title} · ${s.oneLineHook}\n  节拍：${s.beats.slice(0, 3).join(" → ")}\n  新事实：${s.newFactsLearned.slice(0, 3).join("；") || "无"}\n  留扣：${s.unresolvedThreads.slice(0, 2).join("；") || "无"}`,
      ).join("\n")
    : "（无近章摘要）";

  // L2：前 2-10 卷的极简摘要
  const remote = store.chapterSummaries.filter((s) => s.chapter < recentBoundary);
  const remoteSummary = remote.length
    ? `共 ${remote.length} 章远程摘要可用。关键节点：${remote.filter((_, i) => i % Math.max(1, Math.floor(remote.length / 8)) === 0).map((s) => `[${s.chapter}章]${s.oneLineHook}`).join(" / ")}`
    : "（无远程章节）";

  // 活跃伏笔
  const active = store.obligations.filter((o) => o.status === "active");
  const overdue = checkOverdueObligations(store, currentChapter);
  const activeObligations = active.length
    ? active.map((o) => `- [${o.type}] 第${o.setupChapter}章设：${o.setupText}${o.expectedPayoffChapter ? ` (预计第${o.expectedPayoffChapter}章兑现)` : ""}${overdue.some((x) => x.id === o.id) ? " ⚠️ 超期" : ""}`).join("\n")
    : "（暂无活跃伏笔）";

  // 时间线锁定：已死/已销毁/不可逆事件
  const locks = store.timeline.filter((t) => t.trust === "gold" || t.trust === "silver");
  const timelineLocks = locks.length
    ? locks.slice(-20).map((t) => `- [${t.inStoryTime}|第${t.chapter}章] ${t.event}（影响：${t.consequences.slice(0, 2).join("；")}）`).join("\n")
    : "（暂无时间线锁定）";

  return { goldAxioms, recentChapters, remoteSummary, activeObligations, timelineLocks };
}

export function getTrustTierLabel(tier: TrustTier): string {
  return { gold: "🟡 金·宪法层", silver: "⚪ 银·已审核", gray: "🩶 灰·待审", red: "🔴 红·冲突待裁决" }[tier];
}

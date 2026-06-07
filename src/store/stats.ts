// 写作统计：每日字数 + 连胜 + 热力图。完全 LocalStorage 驱动，无后端依赖。
const STORAGE_KEY = "novelsmith-stats";
const LAST_TOTAL_KEY = "novelsmith-stats:lastTotal";

export interface WritingStats {
  daily: Record<string, number>; // YYYY-MM-DD -> 当日累计新增字数
  dailyGoal: number;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function loadStats(): WritingStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { daily: {}, dailyGoal: 1000 };
    const parsed = JSON.parse(raw) as Partial<WritingStats>;
    return {
      daily: parsed.daily && typeof parsed.daily === "object" ? parsed.daily : {},
      dailyGoal: typeof parsed.dailyGoal === "number" && parsed.dailyGoal > 0 ? parsed.dailyGoal : 1000,
    };
  } catch {
    return { daily: {}, dailyGoal: 1000 };
  }
}

export function saveStats(stats: WritingStats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {}
}

/**
 * 接收当前所有书籍的总字数。第一次调用只建立 baseline，不计入今日新增。
 * 后续每次调用：delta = newTotal - lastTotal，仅当 delta > 0 时累加到今日。
 * 这样删除字 / 切换设备 / 重启都不会造成虚假"今日字数"。
 */
export function recordWordTotal(newTotal: number): WritingStats {
  const stats = loadStats();
  const lastRaw = localStorage.getItem(LAST_TOTAL_KEY);
  const last = lastRaw == null ? NaN : parseInt(lastRaw, 10);
  if (isNaN(last)) {
    localStorage.setItem(LAST_TOTAL_KEY, String(newTotal));
    return stats;
  }
  const delta = newTotal - last;
  if (delta > 0) {
    const key = todayKey();
    stats.daily[key] = (stats.daily[key] || 0) + delta;
    saveStats(stats);
  }
  // 即使 delta <= 0 也要刷 lastTotal（删字后再写就不会算成"双倍"）
  localStorage.setItem(LAST_TOTAL_KEY, String(newTotal));
  return stats;
}

export function getStreak(stats: WritingStats): number {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // 今天还没写允许从昨天起算
  if (!stats.daily[todayKey()]) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (true) {
    const k = dateKeyOf(cursor);
    if ((stats.daily[k] || 0) > 0) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export interface HeatmapCell {
  date: string;
  count: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export function getHeatmap(stats: WritingStats, weeks = 17): HeatmapCell[] {
  const days = weeks * 7;
  const out: HeatmapCell[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = dateKeyOf(d);
    const count = stats.daily[k] || 0;
    let intensity: 0 | 1 | 2 | 3 | 4 = 0;
    if (count >= 3000) intensity = 4;
    else if (count >= 1500) intensity = 3;
    else if (count >= 500) intensity = 2;
    else if (count > 0) intensity = 1;
    out.push({ date: k, count, intensity });
  }
  return out;
}

export function getToday(stats: WritingStats): number {
  return stats.daily[todayKey()] || 0;
}

export function setDailyGoal(goal: number): WritingStats {
  const stats = loadStats();
  stats.dailyGoal = Math.max(50, Math.min(50000, Math.round(goal)));
  saveStats(stats);
  return stats;
}

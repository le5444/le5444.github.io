import { useState } from "react";
import { Flame, Target, Pencil } from "lucide-react";
import {
  type WritingStats,
  getStreak,
  getHeatmap,
  getToday,
  setDailyGoal,
} from "../store/stats";

const INTENSITY_BG = [
  "bg-slate-800/70",     // 0 - 无
  "bg-emerald-900/70",   // 1 - 1-499
  "bg-emerald-700",      // 2 - 500-1499
  "bg-emerald-500",      // 3 - 1500-2999
  "bg-emerald-400",      // 4 - 3000+
];

export function WritingTracker({
  stats,
  onChange,
}: {
  stats: WritingStats;
  onChange: () => void;
}) {
  const streak = getStreak(stats);
  const todayWords = getToday(stats);
  const goal = stats.dailyGoal;
  const goalPct = Math.min(100, Math.round((todayWords / goal) * 100));
  const heatmap = getHeatmap(stats, 17);

  // 7 行 × 17 列
  const rows: typeof heatmap[] = [[], [], [], [], [], [], []];
  for (let i = 0; i < heatmap.length; i++) {
    rows[i % 7].push(heatmap[i]);
  }

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(goal));

  const commitGoal = () => {
    const v = parseInt(goalInput, 10);
    if (!isNaN(v) && v > 0) {
      setDailyGoal(v);
      onChange();
    }
    setEditingGoal(false);
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* 左：连胜 + 今日 */}
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Flame className="h-3.5 w-3.5 text-orange-400" /> 连胜
            </div>
            <div className="mt-1">
              <span className="text-2xl font-semibold text-white">{streak}</span>
              <span className="ml-1 text-xs text-slate-500">天</span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Target className="h-3.5 w-3.5 text-emerald-400" /> 今日字数
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white">{todayWords}</span>
              <span className="text-xs text-slate-500">
                /{" "}
                {editingGoal ? (
                  <input
                    autoFocus
                    type="number"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onBlur={commitGoal}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      else if (e.key === "Escape") {
                        setGoalInput(String(goal));
                        setEditingGoal(false);
                      }
                    }}
                    className="w-16 rounded bg-slate-800 px-1 py-0 text-xs text-white outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setGoalInput(String(goal));
                      setEditingGoal(true);
                    }}
                    className="inline-flex items-center gap-1 hover:text-slate-300"
                    title="点击修改目标"
                  >
                    {goal} <Pencil className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* 右：热力图 */}
        <div className="flex flex-col items-end gap-1">
          <div className="text-xs text-slate-500">最近 17 周</div>
          <div className="flex gap-[3px]">
            {Array.from({ length: 17 }).map((_, weekIdx) => (
              <div key={weekIdx} className="flex flex-col gap-[3px]">
                {rows.map((row, rowIdx) => {
                  const cell = row[weekIdx];
                  if (!cell)
                    return <div key={rowIdx} className="h-2.5 w-2.5" />;
                  return (
                    <div
                      key={rowIdx}
                      className={`h-2.5 w-2.5 rounded-[2px] ${INTENSITY_BG[cell.intensity]} transition-colors`}
                      title={`${cell.date}：${cell.count} 字`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-600">
            少
            {INTENSITY_BG.map((c, i) => (
              <span key={i} className={`inline-block h-2 w-2 rounded-sm ${c}`} />
            ))}
            多
          </div>
        </div>
      </div>
    </section>
  );
}

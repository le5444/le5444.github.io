export type WorkbenchThreadFilterKey = "all" | "pinned" | "project" | "free";

const THREAD_FILTER_ITEMS: Array<{ key: WorkbenchThreadFilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "pinned", label: "置顶" },
  { key: "project", label: "项目" },
  { key: "free", label: "对话" },
];

interface WorkbenchThreadFilterBarProps {
  value: WorkbenchThreadFilterKey;
  onChange: (value: WorkbenchThreadFilterKey) => void;
}

export function WorkbenchThreadFilterBar({ value, onChange }: WorkbenchThreadFilterBarProps) {
  return (
    <div className="codex-left-filterbar mt-2 grid grid-cols-4 gap-1 rounded-md border border-[#242934] bg-[#0d1017] p-1">
      {THREAD_FILTER_ITEMS.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            data-testid={`agent-home-thread-filter-${item.key}`}
            className={`codex-left-filter-button rounded px-1.5 py-1 text-[10px] transition-colors ${active ? "is-active bg-[#172033] text-cyan-100" : "text-slate-500 hover:bg-[#151922] hover:text-slate-200"}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

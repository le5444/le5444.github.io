import { useEffect, useRef, useState } from "react";
import { Search, Zap } from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  category: string;
  action: () => void;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (open && e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q),
      )
    : commands;

  const grouped: Record<string, CommandItem[]> = {};
  filtered.forEach((c) => {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  });

  const handleSelect = (cmd: CommandItem) => {
    cmd.action();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入命令... 如：续写、去AI味、审稿、新建章节"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder-slate-500"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((prev) => Math.max(prev - 1, 0));
                return;
              }
              if (e.key === "Enter" && filtered.length > 0) {
                handleSelect(filtered[activeIndex] ?? filtered[0]);
              }
            }}
          />
          <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">没有匹配的命令</div>
          )}
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="px-4 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">{category}</div>
              {items.map((cmd) => {
                const globalIndex = filtered.findIndex((item) => item.id === cmd.id);
                const active = globalIndex === activeIndex;
                return (
                <button
                  key={cmd.id}
                  onClick={() => handleSelect(cmd)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${active ? "bg-purple-500/15 text-purple-300" : "text-slate-300 hover:bg-purple-500/10 hover:text-white"}`}
                >
                  <Zap className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  <span className="flex-1">{cmd.label}</span>
                  <span className="text-[10px] text-slate-600">{category}</span>
                </button>
              );})}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-600">
          <kbd className="rounded bg-slate-800 px-1 py-0.5">↑↓</kbd> 选择 <kbd className="ml-2 rounded bg-slate-800 px-1 py-0.5">Enter</kbd> 执行 <kbd className="ml-2 rounded bg-slate-800 px-1 py-0.5">Ctrl+K</kbd> 呼出
        </div>
      </div>
    </div>
  );
}

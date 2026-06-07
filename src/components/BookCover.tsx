import { type BookProject } from "../store/library";

// 一组"文学感"配色：宣纸米、墨青、绛红、藏蓝、苔绿、檀褐、紫檀、青瓷
const COVER_PALETTE: { from: string; to: string; spine: string; ink: string }[] = [
  { from: "#3a4a6b", to: "#1f2a44", spine: "#141c30", ink: "#f5efe0" }, // 藏蓝
  { from: "#6b3a3a", to: "#3a1f1f", spine: "#2a1414", ink: "#f5efe0" }, // 绛红
  { from: "#3a5a4a", to: "#1f3a2a", spine: "#142a1f", ink: "#f5efe0" }, // 苔绿
  { from: "#5a4a3a", to: "#3a2a1f", spine: "#2a1f14", ink: "#f5efe0" }, // 檀褐
  { from: "#4a3a5a", to: "#2a1f3a", spine: "#1f142a", ink: "#f5efe0" }, // 紫檀
  { from: "#3a5a6b", to: "#1f3a44", spine: "#142a30", ink: "#f5efe0" }, // 墨青
  { from: "#6b5a3a", to: "#3a2f1f", spine: "#2a1f14", ink: "#f5efe0" }, // 赭石
  { from: "#3a4a4a", to: "#1f2a2a", spine: "#141c1c", ink: "#e8e0c8" }, // 青瓷
];

// 简单字符串 hash，保证同一 book.id 永远拿到同一配色
function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function paletteFor(book: BookProject) {
  return COVER_PALETTE[hashString(book.id) % COVER_PALETTE.length];
}

// 标题切分：中文字符 1 个 1 行，英文按词。这里简化处理——按 4-5 字一行，给"竖着排"那种古书感
function chunkTitle(title: string): string[] {
  if (!title) return [""];
  const t = title.trim();
  // 短标题不换行
  if (t.length <= 6) return [t];
  // 中等标题按 4 字一行
  const out: string[] = [];
  for (let i = 0; i < t.length; i += 5) out.push(t.slice(i, i + 5));
  return out.slice(0, 3); // 最多 3 行
}

export function BookCover({
  book,
  chapterCount,
  wordCount,
  showSpine = true,
  className = "",
}: {
  book: BookProject;
  chapterCount?: number;
  wordCount?: string;
  showSpine?: boolean;
  className?: string;
}) {
  const p = paletteFor(book);
  const lines = chunkTitle(book.title || "无题");

  return (
    <div
      className={`relative aspect-[3/4] w-full overflow-hidden rounded-r-md rounded-l-sm shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_8px_20px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.1)] ${className}`}
      style={{
        background: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)`,
      }}
    >
      {/* 书脊：左侧深色窄条，制造"立体"感 */}
      {showSpine && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-2.5"
          style={{
            background: `linear-gradient(to right, ${p.spine} 0%, ${p.spine} 50%, rgba(255,255,255,0.08) 95%, transparent 100%)`,
          }}
        />
      )}

      {/* 右上 emoji 点缀 */}
      <div
        className="absolute right-2 top-2 text-lg opacity-70"
        style={{ color: p.ink }}
        aria-hidden
      >
        {book.cover || "📖"}
      </div>

      {/* 标题区：竖向排版（古书感） */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 pl-6">
        <div
          className="flex flex-col items-center gap-1 text-center font-serif"
          style={{ color: p.ink }}
        >
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="text-lg font-semibold leading-tight tracking-wider md:text-xl"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* 底部类型标签 */}
      {book.type && (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-sm px-2 py-0.5 text-[10px] tracking-widest"
          style={{
            color: p.ink,
            background: "rgba(0,0,0,0.25)",
            border: `1px solid ${p.ink}33`,
          }}
        >
          {book.type}
        </div>
      )}

      {/* 角标：章节 / 字数（左下，半透明，hover 可见） */}
      {(chapterCount !== undefined || wordCount) && (
        <div
          className="absolute bottom-2 left-3 flex flex-col gap-0.5 text-[9px] opacity-0 transition-opacity group-hover:opacity-70"
          style={{ color: p.ink }}
        >
          {chapterCount !== undefined && <span>{chapterCount} 章</span>}
          {wordCount && <span>{wordCount} 字</span>}
        </div>
      )}

      {/* 内层纸纹 / 光泽：用一层非常淡的对角渐变模拟书面光泽 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, rgba(255,255,255,0.08) 0%, transparent 35%, transparent 100%)",
        }}
      />
    </div>
  );
}

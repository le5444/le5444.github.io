import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Highlight } from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { Search, Send, X, AlignCenter } from "lucide-react";
import { editorTools } from "../utils/helpers";
import { NovelToolsExtension, type EntityDef } from "../utils/editor-plugins";

const TYPEWRITER_KEY = "novelsmith:typewriter-mode";

function textToHtml(text: string) {
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function TipTapEditor({
  content,
  onChange,
  onSelectionAction,
  searchQuery,
  aiWords,
  entities,
  highlightMode,
  beforeContent,
  placeholder = "开始写作... 选中文字可 AI 改写",
}: {
  content: string;
  onChange: (content: string) => void;
  onSelectionAction?: (instruction: string, selectedText?: string, replaceMode?: boolean) => void;
  searchQuery: string;
  aiWords: string[];
  entities: EntityDef[];
  highlightMode: boolean;
  beforeContent?: ReactNode;
  placeholder?: string;
}) {
  const [selectionText, setSelectionText] = useState("");
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number; placement: "above" | "below" } | null>(null);
  const [customInstruction, setCustomInstruction] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [minimapMarks, setMinimapMarks] = useState<{ top: number; type: string }[]>([]);
  const [typewriterMode, setTypewriterMode] = useState<boolean>(() => {
    try { return localStorage.getItem(TYPEWRITER_KEY) === "1"; } catch { return false; }
  });

  // 打字机模式：找到光标所在的顶层块元素，标记为 focus，并把它在滚动容器内居中
  const applyTypewriter = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const proseMirror = container.querySelector(".ProseMirror") as HTMLElement | null;
    if (!proseMirror) return;

    // 清掉旧的 focus 标记
    proseMirror.querySelectorAll(":scope > .typewriter-focus").forEach((el) => el.classList.remove("typewriter-focus"));
    if (!typewriterMode) return;

    // 找当前 selection 所在的 DOM 节点
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node: Node | null = sel.getRangeAt(0).startContainer;
    let blockEl: HTMLElement | null = null;
    while (node) {
      if (node.nodeType === 1) {
        const el = node as HTMLElement;
        if (el.parentElement === proseMirror) { blockEl = el; break; }
      }
      node = node.parentNode;
    }
    if (!blockEl) return;
    blockEl.classList.add("typewriter-focus");

    // 居中滚动
    const containerRect = container.getBoundingClientRect();
    const blockRect = blockEl.getBoundingClientRect();
    const desiredCenter = containerRect.top + containerRect.height / 2;
    const blockCenter = blockRect.top + blockRect.height / 2;
    const delta = blockCenter - desiredCenter;
    if (Math.abs(delta) > 4) {
      container.scrollTop += delta;
    }
  }, [typewriterMode]);

  const toggleTypewriter = useCallback(() => {
    setTypewriterMode((prev) => {
      const next = !prev;
      try { localStorage.setItem(TYPEWRITER_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder,
      }),
      NovelToolsExtension.configure({
        searchQuery: showSearch ? localSearch : searchQuery,
        aiWords,
        entities,
        highlightMode,
      }),
    ],
    content: textToHtml(content || ""),
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from === to) {
        setSelectionText("");
        setFloatingPos(null);
        setCustomInstruction("");
        return;
      }
      const text = editor.state.doc.textBetween(from, to, "\n").trim();
      if (!text) return;
      try {
        const start = editor.view.coordsAtPos(from);
        const end = editor.view.coordsAtPos(to);
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const menuW = 420;
        const menuH = 130;
        const wantAbove = start.top - menuH - 12 > 60;
        const placement: "above" | "below" = wantAbove ? "above" : "below";
        const y = placement === "above" ? start.top - menuH - 8 : end.bottom + 8;
        const rawX = start.left;
        const x = Math.min(Math.max(8, rawX), viewportW - menuW - 8);
        const clampedY = Math.min(Math.max(8, y), viewportH - menuH - 8);
        setSelectionText(text);
        setFloatingPos({ x, y: clampedY, placement });
      } catch {
        // coordsAtPos might throw if node is hidden
      }
    },
  });

  // Dynamic options update for ProseMirror plugin
  useEffect(() => {
    if (editor) {
      editor.extensionManager.extensions.forEach((e) => {
        if (e.name === "novelTools") {
          e.options.searchQuery = showSearch ? localSearch : searchQuery;
          e.options.aiWords = aiWords;
          e.options.entities = entities;
          e.options.highlightMode = highlightMode;
        }
      });
      // force a re-render of decorations by faking a transaction
      editor.view.dispatch(editor.state.tr.setMeta("novelTools", true));
      setTimeout(updateMinimap, 100);
    }
  }, [editor, searchQuery, localSearch, showSearch, aiWords, entities, highlightMode, content]);

  useEffect(() => {
    if (!floatingPos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFloatingPos(null);
        setCustomInstruction("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floatingPos]);

  useEffect(() => {
    if (editor && content !== editor.getHTML() && document.activeElement !== editor.view.dom) {
      // Only update content if we are not actively typing (to prevent cursor jump)
      const { from, to } = editor.state.selection;
      editor.commands.setContent(textToHtml(content || ""));
      try {
        editor.commands.setTextSelection({ from, to });
      } catch {}
    }
  }, [content, editor]);

  // 打字机模式：监听 selection / content 变化，应用居中和淡出
  useEffect(() => {
    if (!editor) return;
    const handler = () => applyTypewriter();
    editor.on("selectionUpdate", handler);
    editor.on("update", handler);
    // 模式切换时立即应用一次（或在关闭时清掉标记）
    requestAnimationFrame(() => applyTypewriter());
    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("update", handler);
    };
  }, [editor, typewriterMode, applyTypewriter]);

  // 快捷键 Ctrl/Cmd + Alt + T 切换打字机模式
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        toggleTypewriter();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTypewriter]);

  // Expose methods to window for global insertion (from AI panel)
  useEffect(() => {
    if (!editor) return;
    const w = window as unknown as {
      __novelsmithEditorInsert?: (text: string) => void;
      __novelsmithEditorReplace?: (text: string) => boolean;
    };
    w.__novelsmithEditorInsert = (text: string) => {
      editor.chain().focus().insertContent(textToHtml(text)).run();
    };
    w.__novelsmithEditorReplace = (text: string) => {
      const { from, to } = editor.state.selection;
      if (from === to) return false;
      editor.chain().focus().insertContentAt({ from, to }, textToHtml(text)).run();
      return true;
    };
    return () => {
      delete w.__novelsmithEditorInsert;
      delete w.__novelsmithEditorReplace;
    };
  }, [editor]);

  const executeReplace = () => {
    if (!localSearch || !editor) return;
    // Replace text in HTML directly (simple approach for plain text matches)
    const escaped = localSearch.replace(/[.*+?^$\{}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "g");
    const newHtml = editor.getHTML().replace(re, replaceText);
    editor.commands.setContent(newHtml);
    onChange(newHtml);
  };

  const updateMinimap = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const marks: { top: number; type: string }[] = [];
    const elements = container.querySelectorAll("mark, .ai-word-highlight, .entity-highlight");
    elements.forEach((el) => {
      const top = (el as HTMLElement).offsetTop;
      const ratio = top / container.scrollHeight;
      const type = el.classList.contains("ai-word-highlight") ? "ai" : el.classList.contains("entity-highlight") ? "entity" : "manual";
      marks.push({ top: ratio * 100, type });
    });
    setMinimapMarks(marks);
  };

  return (
    <div className="novel-editor-frame relative flex min-h-0 flex-1 flex-row overflow-hidden rounded-2xl border border-slate-800 bg-white/5">
      
      {/* Editor Content Area */}
      <div className="flex min-w-0 min-h-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-1 border-b border-slate-800 bg-slate-950/80 p-1.5 backdrop-blur">
          <div className="flex flex-wrap gap-1">
            <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`rounded-lg px-2 py-1 text-xs ${editor?.isActive("bold") ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>B</button>
            <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`rounded-lg px-2 py-1 text-xs ${editor?.isActive("italic") ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>I</button>
            <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`rounded-lg px-2 py-1 text-xs ${editor?.isActive("heading", { level: 2 }) ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>H2</button>
            <div className="w-px h-4 bg-slate-700 mx-1 self-center" />
            <button onClick={() => editor?.chain().focus().toggleHighlight({ color: "#facc15" }).run()} className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-yellow-400 hover:bg-slate-700" title="黄色：需要补充细节">■</button>
            <button onClick={() => editor?.chain().focus().toggleHighlight({ color: "#60a5fa" }).run()} className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-blue-400 hover:bg-slate-700" title="蓝色：需要修改人设">■</button>
            <button onClick={() => editor?.chain().focus().toggleHighlight({ color: "#f87171" }).run()} className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-red-400 hover:bg-slate-700" title="红色：毒点/需重写">■</button>
            <button onClick={() => editor?.chain().focus().unsetHighlight().run()} className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-400 hover:bg-slate-700" title="清除高亮">✗</button>
          </div>
          <div className="flex flex-wrap gap-1">
            <button onClick={toggleTypewriter} title="打字机模式（Ctrl+Alt+T）" className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${typewriterMode ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              <AlignCenter className="h-3 w-3" /> 聚焦
            </button>
            <button onClick={() => setShowSearch(!showSearch)} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${showSearch ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              <Search className="h-3 w-3" /> 查找替换
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/50 p-2">
            <input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} placeholder="查找内容..." className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-500" />
            <input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="替换为..." className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-500" />
            <button onClick={executeReplace} disabled={!localSearch} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50">全部替换</button>
          </div>
        )}

        <div
          className="relative min-h-0 flex-1 overflow-y-auto px-5 py-6 scroll-smooth editor-container"
          id="editor-scroll-container"
          ref={containerRef}
          onScroll={updateMinimap}
          data-typewriter={typewriterMode ? "on" : "off"}
        >
          {beforeContent}
          <EditorContent
            editor={editor}
            className={`novel-editor-content prose prose-invert max-w-none text-base leading-8 outline-none [&_.ProseMirror]:outline-none ${!highlightMode ? '[&_mark]:bg-transparent [&_mark]:text-inherit [&_.ai-word-highlight]:border-none [&_.ai-word-highlight]:bg-transparent [&_.ai-word-highlight]:text-inherit [&_.entity-highlight]:border-none [&_.entity-highlight]:bg-transparent [&_.entity-highlight]:text-inherit' : ''}`}
          />
        </div>

        {/* Mobile bottom quick-action bar (StackEdit-style, only visible on small screens) */}
        <div className="md:hidden sticky bottom-0 z-10 flex items-center gap-1 overflow-x-auto border-t border-slate-800 bg-slate-900/95 px-2 py-1.5 backdrop-blur">
          <button onClick={() => editor?.chain().focus().undo().run()} className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 active:bg-slate-700" title="撤销">↶</button>
          <button onClick={() => editor?.chain().focus().redo().run()} className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 active:bg-slate-700" title="重做">↷</button>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-700" />
          <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold ${editor?.isActive("bold") ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-200"}`}>B</button>
          <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs italic ${editor?.isActive("italic") ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-200"}`}>I</button>
          <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs ${editor?.isActive("heading", { level: 2 }) ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-200"}`}>H2</button>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-700" />
          <button onClick={() => editor?.chain().focus().toggleHighlight({ color: "#fde68a" }).run()} className="shrink-0 rounded-lg bg-amber-300/30 px-2.5 py-1.5 text-xs text-amber-200 active:bg-amber-300/40" title="高亮">★</button>
          <button onClick={() => editor?.chain().focus().unsetHighlight().run()} className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 active:bg-slate-700" title="清除高亮">✕</button>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-700" />
          <button onClick={toggleTypewriter} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs ${typewriterMode ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-200"}`} title="打字机聚焦">
            <AlignCenter className="inline h-3 w-3" />
          </button>
        </div>

        {/* Floating AI Toolbar for Selection */}
        {selectionText && floatingPos && onSelectionAction && (
          <div
            className="fixed z-50 w-[420px] rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl backdrop-blur"
            style={{ left: floatingPos.x, top: floatingPos.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] text-slate-500">已选中 {selectionText.length} 字</span>
              <button
                onClick={() => { setFloatingPos(null); setCustomInstruction(""); }}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                title="关闭 (Esc)"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="mb-1.5 flex flex-wrap gap-1">
              {editorTools.map((tool) => (
                <button
                  key={tool.key}
                  onClick={() => {
                    onSelectionAction(tool.prompt + selectionText, selectionText, true);
                    setFloatingPos(null);
                    setCustomInstruction("");
                    editor?.commands.focus();
                  }}
                  className="rounded-lg bg-purple-600/20 px-2.5 py-1 text-xs text-purple-300 hover:bg-purple-600/40"
                >
                  {tool.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1">
              <input
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customInstruction.trim()) {
                    e.preventDefault();
                    const instruction = customInstruction.trim();
                    onSelectionAction(
                      `请按以下要求改写下面这段，只输出改写后的正文，不要解释：\n要求：${instruction}\n\n原文：\n${selectionText}`,
                      selectionText,
                      true,
                    );
                    setFloatingPos(null);
                    setCustomInstruction("");
                    editor?.commands.focus();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setFloatingPos(null);
                    setCustomInstruction("");
                  }
                }}
                placeholder="自定义改写指令，回车执行（如：改成男频热血风）"
                className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600"
                autoFocus
              />
              <button
                onClick={() => {
                  if (!customInstruction.trim()) return;
                  const instruction = customInstruction.trim();
                  onSelectionAction(
                    `请按以下要求改写下面这段，只输出改写后的正文，不要解释：\n要求：${instruction}\n\n原文：\n${selectionText}`,
                    selectionText,
                    true,
                  );
                  setFloatingPos(null);
                  setCustomInstruction("");
                  editor?.commands.focus();
                }}
                disabled={!customInstruction.trim()}
                className="rounded-md bg-indigo-500 p-1 text-white hover:bg-indigo-600 disabled:opacity-40"
                title="执行"
              >
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Minimap Navigation Bar */}
      {highlightMode && minimapMarks.length > 0 && (
        <div className="w-3 border-l border-slate-800 bg-slate-950/40 relative cursor-pointer" onClick={(e) => {
          if (!containerRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          containerRef.current.scrollTop = ratio * containerRef.current.scrollHeight;
        }}>
          {minimapMarks.map((m, i) => (
            <div 
              key={i} 
              className={`absolute left-0 right-0 h-0.5 opacity-50 ${m.type === 'ai' ? 'bg-red-500' : m.type === 'entity' ? 'bg-blue-400' : 'bg-yellow-400'}`} 
              style={{ top: `${m.top}%` }} 
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { FilePlus2, Pencil, Plus, Search, Trash2, Trash } from "lucide-react";
import { type FileCategory, type WorkspaceFile, type WorkspaceState, createFile, defaultCategories, groupFiles } from "../store/workspace";
import { htmlToPlainText, iconForCategory, wordCount, type ContextMenuState } from "../utils/helpers";
import { showToast } from "../utils/toast";

export function FileTree({
  workspace,
  onChange,
  onSoftDelete,
  onOpenRecycleBin,
  recycleBinCount,
}: {
  workspace: WorkspaceState;
  onChange: (next: WorkspaceState | ((prev: WorkspaceState) => WorkspaceState)) => void;
  onSoftDelete: (file: WorkspaceFile) => void;
  onOpenRecycleBin: () => void;
  recycleBinCount: number;
}) {
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  const fileMeta = useMemo(() => {
    const meta = new Map<string, { searchable: string; words: number }>();
    workspace.files.forEach((file) => {
      const plainText = htmlToPlainText(file.content);
      meta.set(file.id, {
        searchable: `${file.title}\n${plainText}`.toLowerCase(),
        words: wordCount(plainText).total,
      });
    });
    return meta;
  }, [workspace.files]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspace.files;
    return workspace.files.filter((f) => fileMeta.get(f.id)?.searchable.includes(q));
  }, [fileMeta, search, workspace.files]);

  const grouped = groupFiles(filteredFiles, workspace.categories);

  const addCategory = () => {
    const next = window.prompt("添加分类名称");
    if (!next?.trim() || workspace.categories.includes(next.trim())) return;
    onChange((prev) => ({ ...prev, categories: [...prev.categories, next.trim()] }));
  };

  const addFile = (category: FileCategory) => {
    const file = createFile(category);
    onChange((prev) => ({ ...prev, files: [...prev.files, file], selectedFileId: file.id }));
  };

  const duplicateFile = (file: WorkspaceFile) => {
    const copy: WorkspaceFile = {
      ...file,
      id: Math.random().toString(36).slice(2, 10),
      title: `${file.title} - 副本`,
      updatedAt: Date.now(),
    };
    onChange((prev) => ({ ...prev, files: [...prev.files, copy], selectedFileId: copy.id }));
  };

  const moveToCategory = (fileId: string, target: FileCategory) => {
    onChange((prev) => ({
      ...prev,
      files: prev.files.map((f) => (f.id === fileId ? { ...f, category: target, updatedAt: Date.now() } : f)),
    }));
  };

  const onDragStart = (e: React.DragEvent, fileId: string) => {
    setDraggedFileId(fileId);
    e.dataTransfer.setData("text/file-id", fileId);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropOnCategory = (e: React.DragEvent, category: FileCategory) => {
    e.preventDefault();
    setDragOverCategory(null);
    const id = e.dataTransfer.getData("text/file-id");
    if (id) moveToCategory(id, category);
    setDraggedFileId(null);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-base font-semibold text-white">📂 文件树</div>
        <div className="flex gap-1">
          <button onClick={onOpenRecycleBin} className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white" title="回收站">
            <Trash className="h-4 w-4" />
            {recycleBinCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{recycleBinCount}</span>}
          </button>
          <button onClick={addCategory} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white" title="新增分类"><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索文件..." className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-8 pr-3 text-xs text-white outline-none focus:border-purple-500" />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {grouped.map((group) => (
          <div
            key={group.category}
            onDragOver={(e) => { e.preventDefault(); setDragOverCategory(group.category); }}
            onDragLeave={() => setDragOverCategory(null)}
            onDrop={(e) => onDropOnCategory(e, group.category)}
            className={`rounded-2xl ${dragOverCategory === group.category ? "bg-purple-500/10 ring-1 ring-purple-500/30" : "bg-slate-950/30"}`}
          >
            <div onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: "category", category: group.category }); }} className="flex items-center justify-between rounded-2xl px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <span>{iconForCategory(group.category)}</span>{group.category}
                <span className="text-xs text-slate-500">{group.files.length}</span>
              </div>
              <button onClick={() => addFile(group.category)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-300"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="space-y-1 px-2 pb-2">
              {group.files.map((file) => {
                const selected = file.id === workspace.selectedFileId;
                const isDragging = draggedFileId === file.id;
                return (
                  <div
                    key={file.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, file.id)}
                    onDragEnd={() => setDraggedFileId(null)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: "file", fileId: file.id }); }}
                    onClick={() => {
                      if (!selected) onChange((prev) => ({ ...prev, selectedFileId: file.id }));
                    }}
                    className={`group cursor-pointer rounded-xl px-3 py-2 text-left transition-colors ${selected ? "bg-blue-500/15 text-blue-300" : "text-slate-400 hover:bg-slate-800/50"} ${isDragging ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="truncate text-sm">{file.title}</div>
                      <span className="text-[9px] text-slate-600">{fileMeta.get(file.id)?.words ?? 0}</span>
                    </div>
                  </div>
                );
              })}
              {group.files.length === 0 && <div className="px-3 py-1 text-[10px] text-slate-600">空</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-dashed border-slate-800 pt-3 text-center">
        <button onClick={addCategory} className="text-xs text-slate-500 hover:text-slate-300">+ 添加分类</button>
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[95]" onClick={() => setContextMenu(null)} />
          <div className="fixed z-[96] min-w-[180px] rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl" style={{ left: contextMenu.x, top: contextMenu.y }}>
            {contextMenu.type === "file" ? (
              <>
                <button onClick={() => {
                  const file = workspace.files.find((f) => f.id === contextMenu.fileId);
                  if (!file) return;
                  const next = window.prompt("重命名文件", file.title);
                  if (!next?.trim()) return;
                  onChange((prev) => ({ ...prev, files: prev.files.map((f) => (f.id === file.id ? { ...f, title: next.trim(), updatedAt: Date.now() } : f)) }));
                  setContextMenu(null);
                }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><Pencil className="h-4 w-4" /> 重命名文件</button>

                <button onClick={() => {
                  const file = workspace.files.find((f) => f.id === contextMenu.fileId);
                  if (file) duplicateFile(file);
                  setContextMenu(null);
                }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><FilePlus2 className="h-4 w-4" /> 复制文件</button>

                <div className="my-1 border-t border-slate-800" />
                <div className="px-3 py-1 text-[10px] text-slate-500">移动到分类：</div>
                {workspace.categories.map((cat) => (
                  <button key={cat} onClick={() => { moveToCategory(contextMenu.fileId, cat); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
                    <span>{iconForCategory(cat)}</span> {cat}
                  </button>
                ))}
                <div className="my-1 border-t border-slate-800" />

                <button onClick={() => {
                  const file = workspace.files.find((f) => f.id === contextMenu.fileId);
                  if (!file) return;
                  if (!window.confirm(`删除文件「${file.title}」？删除后可在回收站恢复。`)) return;
                  onSoftDelete(file);
                  onChange((prev) => {
                    const remaining = prev.files.filter((f) => f.id !== file.id);
                    return {
                      ...prev,
                      files: remaining,
                      selectedFileId: prev.selectedFileId === file.id ? remaining[0]?.id ?? null : prev.selectedFileId,
                      associatedFileIds: prev.associatedFileIds.filter((id) => id !== file.id),
                    };
                  });
                  setContextMenu(null);
                }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /> 删除文件</button>
              </>
            ) : (
              <>
                <button onClick={() => { addFile(contextMenu.category); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><FilePlus2 className="h-4 w-4" /> 新建文件</button>
                <button onClick={() => {
                  const next = window.prompt("重命名分类", contextMenu.category);
                  if (!next?.trim() || next.trim() === contextMenu.category) return;
                  onChange((prev) => ({
                    ...prev,
                    categories: prev.categories.map((c) => (c === contextMenu.category ? next.trim() : c)),
                    files: prev.files.map((f) => (f.category === contextMenu.category ? { ...f, category: next.trim() } : f)),
                  }));
                  setContextMenu(null);
                }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><Pencil className="h-4 w-4" /> 重命名分类</button>
                <button onClick={() => {
                  if (defaultCategories.includes(contextMenu.category)) {
                    showToast("基础分类不建议删除，可以重命名或新增自定义分类。", "warning");
                    setContextMenu(null);
                    return;
                  }
                  if (!window.confirm(`删除分类「${contextMenu.category}」及其下所有文件？`)) return;
                  onChange((prev) => ({
                    ...prev,
                    categories: prev.categories.filter((c) => c !== contextMenu.category),
                    files: prev.files.filter((f) => f.category !== contextMenu.category),
                  }));
                  setContextMenu(null);
                }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /> 删除分类</button>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

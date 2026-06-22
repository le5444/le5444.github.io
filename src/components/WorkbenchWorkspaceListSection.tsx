import {
  ArrowUpRight,
  FileText,
  Folder,
  MoreHorizontal,
  Pencil,
  Pin,
  Trash2,
} from "lucide-react";

export type WorkbenchWorkspaceActionKind = "rename" | "delete";

export interface WorkbenchWorkspaceListRow {
  id: string;
  title: string;
  description: string;
  active: boolean;
  pinned: boolean;
  chips: string[];
}

interface WorkbenchWorkspaceListSectionProps {
  rows: WorkbenchWorkspaceListRow[];
  totalCount: number;
  emptyText: string;
  openMenuWorkspaceId: string;
  onOpenWorkspace: (workspaceId: string) => void;
  onOpenFiles: (workspaceId: string) => void;
  onTogglePin: (workspaceId: string) => void;
  onRequestAction: (workspaceId: string, kind: WorkbenchWorkspaceActionKind) => void;
  onToggleMenu: (workspaceId: string) => void;
  onCloseMenu: () => void;
}

export function WorkbenchWorkspaceListSection({
  rows,
  totalCount,
  emptyText,
  openMenuWorkspaceId,
  onOpenWorkspace,
  onOpenFiles,
  onTogglePin,
  onRequestAction,
  onToggleMenu,
  onCloseMenu,
}: WorkbenchWorkspaceListSectionProps) {
  return (
    <div className="codex-left-section">
      <div className="codex-left-section-title">
        <span>项目</span>
        <span>{rows.length}/{totalCount}</span>
      </div>
      <div className="grid gap-0.5">
        {rows.map((item) => (
          <div
            key={`home-workspace-${item.id}`}
            data-testid={`agent-home-workspace-row-${item.id}`}
            className={[
              "codex-left-row codex-workspace-row group",
              item.active ? "is-active" : "",
              item.pinned ? "is-pinned" : "",
              openMenuWorkspaceId === item.id ? "is-menu-open" : "",
            ].filter(Boolean).join(" ")}
          >
            <button
              type="button"
              onClick={() => onOpenWorkspace(item.id)}
              className="codex-left-row-main"
              data-testid={`agent-home-workspace-open-${item.id}`}
              title={item.description || item.title}
            >
              <div className="codex-left-row-title">
                {item.pinned ? <Pin className="h-3 w-3 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{item.title}</span>
              </div>
              <div className="codex-left-row-meta codex-left-row-meta-compact">
                <span className="codex-left-row-chipline">
                  {item.chips.map((chip) => (
                    <span key={`${item.id}-${chip}`} className="codex-left-row-chip">{chip}</span>
                  ))}
                </span>
              </div>
            </button>
            <div className="codex-left-row-actions">
              <div className="relative">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleMenu(item.id);
                  }}
                  title="项目操作"
                  aria-label="项目操作"
                  className="codex-left-action-button"
                  data-testid={`agent-home-workspace-menu-${item.id}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {openMenuWorkspaceId === item.id && (
                  <div className="codex-left-menu" data-testid={`agent-home-workspace-menu-panel-${item.id}`}>
                    <button type="button" onClick={() => { onOpenWorkspace(item.id); onCloseMenu(); }} className="codex-left-menu-item" data-testid={`agent-home-workspace-menu-open-${item.id}`}>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      打开项目对话
                    </button>
                    <button type="button" onClick={() => { onOpenFiles(item.id); onCloseMenu(); }} className="codex-left-menu-item" data-testid={`agent-home-workspace-menu-files-${item.id}`}>
                      <FileText className="h-3.5 w-3.5" />
                      打开项目文件
                    </button>
                    <div className="codex-left-menu-separator" />
                    <button type="button" onClick={() => { onTogglePin(item.id); onCloseMenu(); }} className="codex-left-menu-item" data-testid={`agent-home-workspace-menu-pin-${item.id}`}>
                      <Pin className="h-3.5 w-3.5" />
                      {item.pinned ? "取消置顶" : "置顶"}
                    </button>
                    <button type="button" onClick={() => onRequestAction(item.id, "rename")} className="codex-left-menu-item" data-testid={`agent-home-workspace-menu-rename-${item.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                      重命名
                    </button>
                    <div className="codex-left-menu-separator" />
                    <button type="button" onClick={() => onRequestAction(item.id, "delete")} className="codex-left-menu-item is-danger" data-testid={`agent-home-workspace-menu-delete-${item.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {!rows.length && <div className="codex-left-empty">{emptyText}</div>}
      </div>
    </div>
  );
}

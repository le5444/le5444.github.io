import {
  Archive,
  ArrowUpRight,
  Download,
  Folder,
  GitBranch,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { AgentThreadRecord } from "../utils/agent-thread-store";
import type { WorkbenchThreadFilterKey } from "./WorkbenchThreadFilterBar";

export type WorkbenchThreadActionKind = "rename" | "archive" | "delete";

function uiPreviewText(value: string, fallback = "") {
  return (value || fallback)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeThreadPreview(title: string, preview: string) {
  const cleanedTitle = uiPreviewText(title).replace(/\s+/g, " ").trim();
  let cleanedPreview = uiPreviewText(preview).replace(/\s+/g, " ").trim();
  if (!cleanedTitle || !cleanedPreview) return cleanedPreview;
  if (cleanedPreview === cleanedTitle) return "";
  const prefixPatterns = [
    `${cleanedTitle} · `,
    `${cleanedTitle}: `,
    `${cleanedTitle}：`,
    `${cleanedTitle} - `,
  ];
  for (const prefix of prefixPatterns) {
    if (cleanedPreview.startsWith(prefix)) {
      cleanedPreview = cleanedPreview.slice(prefix.length).trim();
    }
  }
  return cleanedPreview;
}

function agentThreadSidebarPreviewText(value: string, fallback = "") {
  const text = uiPreviewText(value, fallback)
    .replace(/^(用户|助手|系统|工具|目标任务|线程创建|线程恢复)\s*[·:：-]\s*/i, "")
    .trim();
  return text || fallback;
}

function compactThreadTitle(task: string, fallback = "新对话") {
  const firstLine = uiPreviewText(task).replace(/\s+/g, " ").trim();
  if (!firstLine) return fallback;
  return firstLine.length > 24 ? `${firstLine.slice(0, 24)}...` : firstLine;
}

function threadDisplayTitle(thread?: Pick<AgentThreadRecord, "title" | "workspaceId" | "workspaceTitle"> | null, fallback = "新对话线程") {
  if (!thread) return fallback;
  const title = uiPreviewText(thread.title, fallback).replace(/\s+/g, " ").trim();
  if (thread.workspaceId) {
    const workspaceTitle = uiPreviewText(thread.workspaceTitle || "").replace(/\s+/g, " ").trim();
    if (workspaceTitle && (title === `继续处理项目：${workspaceTitle}` || title === `项目对话 · ${workspaceTitle}`)) {
      return workspaceTitle;
    }
  }
  return agentThreadSidebarPreviewText(title) || fallback;
}

function threadListPreview(thread: AgentThreadRecord) {
  const latestUser = [...thread.messages].reverse().find((message) => message.role === "user");
  const latestAssistant = [...thread.messages].reverse().find((message) => message.role === "assistant");
  const task = latestUser?.content || thread.task || thread.summary || latestAssistant?.content || thread.title;
  const normalized = uiPreviewText(task).replace(/\s+/g, " ").trim();
  if (!normalized
    || normalized === "继续对话"
    || normalized === "自由对话"
    || normalized.startsWith("自由对话 ·")) {
    return "空白对话，等待输入";
  }
  const deduped = dedupeThreadPreview(thread.title, normalized);
  const publicPreview = agentThreadSidebarPreviewText(deduped);
  return publicPreview.length > 60 ? `${publicPreview.slice(0, 60)}...` : publicPreview;
}

function shouldShowPreview(preview: string) {
  const normalized = uiPreviewText(preview).replace(/\s+/g, " ").trim();
  return Boolean(normalized && normalized !== "继续对话" && normalized !== "空白对话，等待输入");
}

function threadScopeLabel(thread: Pick<AgentThreadRecord, "workspaceId">) {
  return thread.workspaceId ? "项目" : "对话";
}

function threadListChips(thread: AgentThreadRecord) {
  return [
    threadScopeLabel(thread),
    thread.approvalCount ? `审批 ${thread.approvalCount}` : "",
    thread.diffCount ? `变更 ${thread.diffCount}` : "",
    thread.contextAttachments.length ? `上下文 ${thread.contextAttachments.length}` : "",
  ].filter(Boolean).slice(0, 4);
}

function threadRowTooltip(thread: Pick<AgentThreadRecord, "summary" | "task" | "title" | "workspaceId" | "workspaceTitle">) {
  const title = uiPreviewText(thread.summary || thread.task || thread.title);
  if (!thread.workspaceId) return title;
  const workspaceTitle = uiPreviewText(thread.workspaceTitle || "未命名工作区");
  return `${workspaceTitle} · ${title}`;
}

function emptyTextForSection(label: string, hasActiveWorkspace: boolean) {
  if (label === "置顶") return "暂无置顶对话；可在对话行菜单里置顶。";
  if (label === "项目对话") return hasActiveWorkspace ? "这个项目还没有对话；用左上角菜单新建项目对话。" : "先选择项目，再从左上角菜单新建项目对话。";
  return "暂无对话模式线程；点左上角“新对话”开始。";
}

interface WorkbenchThreadListSectionProps {
  label: string;
  threads: AgentThreadRecord[];
  activeThreadId?: string;
  activeFilter: WorkbenchThreadFilterKey;
  hasActiveWorkspace: boolean;
  openMenuThreadId: string;
  onOpenThread: (thread: AgentThreadRecord) => void;
  onToggleMenu: (threadId: string) => void;
  onCloseMenu: () => void;
  onTogglePin: (threadId: string) => void;
  onRequestAction: (threadId: string, kind: WorkbenchThreadActionKind) => void;
  onBranch: (threadId: string) => void;
  onExport: (threadId: string) => void;
  onRestore: (threadId: string) => void;
}

export function WorkbenchThreadListSection({
  label,
  threads,
  activeThreadId,
  activeFilter,
  hasActiveWorkspace,
  openMenuThreadId,
  onOpenThread,
  onToggleMenu,
  onCloseMenu,
  onTogglePin,
  onRequestAction,
  onBranch,
  onExport,
  onRestore,
}: WorkbenchThreadListSectionProps) {
  const showEmptyState = !threads.length && (
    (label === "置顶" && activeFilter === "pinned")
    || (label === "项目对话" && activeFilter === "project")
    || (label === "对话模式" && activeFilter === "free")
  );
  return (
    <div className="codex-left-section">
      <div className="codex-left-section-title">
        <span>{label}</span>
        <span>{threads.length}</span>
      </div>
      {showEmptyState && <div className="codex-left-empty">{emptyTextForSection(label, hasActiveWorkspace)}</div>}
      <div className="grid gap-0.5">
        {threads.map((thread) => {
          const active = thread.id === activeThreadId;
          const preview = threadListPreview(thread);
          const showPreview = shouldShowPreview(preview);
          const threadChips = threadListChips(thread);
          return (
            <div
              key={`${label}-${thread.id}`}
              data-testid={`agent-thread-row-${thread.id}`}
              className={[
                "codex-left-row codex-thread-row group",
                active ? "is-active" : "",
                thread.pinnedAt ? "is-pinned" : "",
                thread.archivedAt ? "is-archived" : "",
                openMenuThreadId === thread.id ? "is-menu-open" : "",
              ].filter(Boolean).join(" ")}
            >
              <button
                type="button"
                onClick={() => onOpenThread(thread)}
                className="codex-left-row-main"
                data-testid={`agent-thread-row-open-${thread.id}`}
                title={threadRowTooltip(thread)}
              >
                <div className="codex-left-row-title">
                  {thread.workspaceId ? <Folder className="h-3.5 w-3.5 shrink-0" /> : <MessageSquare className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{threadDisplayTitle(thread, compactThreadTitle(thread.task || thread.title))}</span>
                  {thread.pinnedAt && <Pin className="h-3 w-3 shrink-0" />}
                  {thread.archivedAt && <span className="codex-left-badge">归档</span>}
                </div>
                {showPreview && <div className="codex-left-row-detail">{uiPreviewText(preview)}</div>}
                <div className="codex-left-row-meta codex-left-row-meta-compact">
                  <span className="codex-left-row-chipline">
                    {threadChips.map((chip) => (
                      <span key={`${thread.id}-${chip}`} className="codex-left-row-chip">{chip}</span>
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
                      onToggleMenu(thread.id);
                    }}
                    title="对话操作"
                    aria-label="对话操作"
                    data-testid={`agent-thread-row-menu-${thread.id}`}
                    className="codex-left-action-button"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                  {openMenuThreadId === thread.id && (
                    <div className="codex-left-menu" data-testid={`agent-thread-row-menu-panel-${thread.id}`}>
                      <button type="button" onClick={() => { onOpenThread(thread); onCloseMenu(); }} className="codex-left-menu-item" data-testid={`agent-thread-menu-open-${thread.id}`}>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        打开对话
                      </button>
                      <button
                        type="button"
                        onClick={() => { onTogglePin(thread.id); onCloseMenu(); }}
                        className="codex-left-menu-item"
                        data-testid={`agent-thread-menu-pin-${thread.id}`}
                      >
                        <Pin className="h-3.5 w-3.5" />
                        {thread.pinnedAt ? "取消置顶" : "置顶"}
                      </button>
                      <button type="button" onClick={() => onRequestAction(thread.id, "rename")} className="codex-left-menu-item" data-testid={`agent-thread-menu-rename-${thread.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                        重命名
                      </button>
                      <div className="codex-left-menu-separator" />
                      <button type="button" onClick={() => { onBranch(thread.id); onCloseMenu(); }} className="codex-left-menu-item" data-testid={`agent-thread-menu-branch-${thread.id}`}>
                        <GitBranch className="h-3.5 w-3.5" />
                        创建分支
                      </button>
                      <button type="button" onClick={() => { onExport(thread.id); onCloseMenu(); }} className="codex-left-menu-item" data-testid={`agent-thread-menu-export-${thread.id}`}>
                        <Download className="h-3.5 w-3.5" />
                        导出
                      </button>
                      {thread.archivedAt ? (
                        <button type="button" onClick={() => { onRestore(thread.id); onCloseMenu(); }} className="codex-left-menu-item" data-testid={`agent-thread-menu-restore-${thread.id}`}>
                          <RefreshCw className="h-3.5 w-3.5" />
                          恢复
                        </button>
                      ) : (
                        <button type="button" onClick={() => onRequestAction(thread.id, "archive")} className="codex-left-menu-item" data-testid={`agent-thread-menu-archive-${thread.id}`}>
                          <Archive className="h-3.5 w-3.5" />
                          归档
                        </button>
                      )}
                      <div className="codex-left-menu-separator" />
                      <button type="button" onClick={() => onRequestAction(thread.id, "delete")} className="codex-left-menu-item is-danger" data-testid={`agent-thread-menu-delete-${thread.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

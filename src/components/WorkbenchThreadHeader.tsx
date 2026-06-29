import {
  Archive,
  Cpu,
  Database,
  Download,
  FolderKanban,
  GitBranch,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import type { AgentPhase } from "../os/kernel/agent-loop";
import type { AgentThreadRecord } from "../utils/agent-thread-store";

interface WorkbenchThreadHeaderProps {
  title: string;
  activeThread: AgentThreadRecord | null;
  projectModeActive: boolean;
  currentModeLabel: string;
  modeStatus: string;
  modeTitle: string;
  modeDisabled: boolean;
  pendingApprovalCount: number;
  subtitle: string;
  subtitleTitle: string;
  modelRuntimeReady: boolean;
  providerRuntimeProbeFailure: boolean;
  apiReady: boolean;
  modelTitle: string;
  modelLabel: string;
  modelDetail: string;
  headerMenuOpen: boolean;
  agentChatBusy: boolean;
  chatPrimaryStatus: string;
  chatPrimaryLabel: string;
  chatPrimaryDetail: string;
  agentLoopStatus: {
    status: string;
    phase: AgentPhase | "";
    detail: string;
    at: number;
  };
  onToggleMode: () => void;
  onOpenModelSettings: () => void;
  onTogglePin: (threadId: string) => void;
  onOpenContext: () => void;
  onToggleHeaderMenu: () => void;
  onRename: (threadId: string) => void;
  onBranch: (threadId: string) => void;
  onExport: (threadId: string) => void;
  onRestore: (threadId: string) => void;
  onArchive: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onOpenStatus: () => void;
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (["ok", "pass", "completed", "executed", "running", "ready", "accepted", "proposal", "watching", "syncing", "streaming", "chat", "project"].includes(normalized)) return "text-emerald-300";
  if (["partial", "pending", "queued", "draft", "diff_draft", "approval_required", "waiting_approval", "waiting_review", "modified", "paused", "checking", "setup-needed"].includes(normalized)) return "text-amber-300";
  if (["missing", "blocked", "failed", "error", "rejected", "validation-failed", "http_error", "network_error"].includes(normalized)) return "text-red-300";
  return "text-slate-300";
}

function statusLabel(status: string) {
  const normalized = status || "unknown";
  const labels: Record<string, string> = {
    approval_required: "需审批",
    checking: "检测中",
    completed: "完成",
    error: "错误",
    failed: "失败",
    idle: "空闲",
    pending: "等待",
    project: "项目",
    ready: "就绪",
    running: "运行中",
    setup: "待配置",
    "setup-needed": "需配置",
    waiting_approval: "等待审批",
    waiting_review: "等待审查",
  };
  return labels[normalized.toLowerCase()] || normalized;
}

function StatusBadge({ status, subtle = false }: { status: string; subtle?: boolean }) {
  const normalized = status || "unknown";
  return (
    <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] ${subtle ? "bg-slate-800 text-slate-400" : "bg-slate-950/70"} ${statusTone(normalized)}`}>
      {statusLabel(normalized)}
    </span>
  );
}

export function WorkbenchThreadHeader({
  title,
  activeThread,
  projectModeActive,
  currentModeLabel,
  modeStatus,
  modeTitle,
  modeDisabled,
  pendingApprovalCount,
  subtitle,
  subtitleTitle,
  modelRuntimeReady,
  providerRuntimeProbeFailure,
  apiReady,
  modelTitle,
  modelLabel,
  modelDetail,
  headerMenuOpen,
  agentChatBusy,
  chatPrimaryStatus,
  chatPrimaryLabel,
  chatPrimaryDetail,
  agentLoopStatus,
  onToggleMode,
  onOpenModelSettings,
  onTogglePin,
  onOpenContext,
  onToggleHeaderMenu,
  onRename,
  onBranch,
  onExport,
  onRestore,
  onArchive,
  onDelete,
  onOpenStatus,
}: WorkbenchThreadHeaderProps) {
  return (
    <section className="codex-thread-header border-b border-[#242934] bg-[#11151c] px-4 py-2.5">
      <div className="codex-thread-header-row flex min-w-0 items-center justify-between gap-3">
        <div className="codex-thread-title-block min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="codex-thread-title max-w-full truncate text-[15px] font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={onToggleMode}
              disabled={modeDisabled}
              className={`codex-thread-mode-button ${projectModeActive ? "is-project" : "is-chat"}`}
              title={modeTitle}
              aria-label={projectModeActive ? "切到对话模式" : "切到项目模式"}
              data-testid="agent-home-header-mode-switch"
            >
              {projectModeActive ? <FolderKanban className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
              <span>{currentModeLabel}</span>
              <span className="codex-thread-mode-detail">{modeStatus}</span>
            </button>
            {pendingApprovalCount > 0 && <StatusBadge status="approval_required" subtle />}
          </div>
          <div className="codex-thread-subtitle mt-1 truncate text-[10px] text-slate-600" title={subtitleTitle}>
            {subtitle}
          </div>
        </div>
        <div className="codex-thread-actions flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenModelSettings}
            className={`codex-thread-model-button ${
              modelRuntimeReady
                ? "is-ready"
                : providerRuntimeProbeFailure
                  ? "is-error"
                  : apiReady
                    ? "is-check"
                    : "is-needed"
            }`}
            title={modelTitle}
            aria-label="打开模型中心"
            data-testid="agent-home-header-model-settings"
          >
            <Server className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{modelLabel}</span>
            <span className="codex-thread-model-detail">{modelDetail}</span>
          </button>
          {activeThread && (
            <button
              type="button"
              onClick={() => onTogglePin(activeThread.id)}
              className={`codex-thread-chip is-icon ${activeThread.pinnedAt ? "is-active" : ""}`}
              title={activeThread.pinnedAt ? "取消置顶当前对话" : "置顶当前对话"}
              aria-label={activeThread.pinnedAt ? "取消置顶当前对话" : "置顶当前对话"}
              data-testid="agent-home-thread-pin"
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenContext}
            className="codex-thread-chip is-icon"
            title={subtitleTitle}
            aria-label="打开上下文"
            data-testid="agent-home-thread-open-context"
          >
            <Database className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleMode}
            disabled={modeDisabled}
            title={projectModeActive ? "切到对话模式" : modeDisabled ? "先选择或创建项目后启用" : "切到项目模式"}
            aria-label={projectModeActive ? "切到对话模式" : "切到项目模式"}
            data-testid="agent-home-thread-toggle-mode"
            className={`codex-thread-chip is-icon ${projectModeActive ? "is-project" : ""}`}
          >
            {projectModeActive ? <FolderKanban className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
          </button>
          {activeThread && (
            <div className="relative">
              <button
                type="button"
                onClick={onToggleHeaderMenu}
                className="codex-thread-chip is-icon"
                title="当前对话操作"
                aria-label="当前对话操作"
                aria-expanded={headerMenuOpen}
                data-testid="agent-home-thread-menu"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {headerMenuOpen && (
                <div className="codex-left-menu codex-thread-header-menu" data-testid="agent-home-thread-menu-panel">
                  <button type="button" onClick={() => onRename(activeThread.id)} className="codex-left-menu-item" data-testid="agent-home-thread-menu-rename">
                    <Pencil className="h-3.5 w-3.5" />
                    重命名
                  </button>
                  <button type="button" onClick={() => onTogglePin(activeThread.id)} className="codex-left-menu-item" data-testid="agent-home-thread-menu-pin">
                    <Pin className="h-3.5 w-3.5" />
                    {activeThread.pinnedAt ? "取消置顶" : "置顶"}
                  </button>
                  <div className="codex-left-menu-separator" />
                  <button type="button" onClick={() => onBranch(activeThread.id)} className="codex-left-menu-item" data-testid="agent-home-thread-menu-branch">
                    <GitBranch className="h-3.5 w-3.5" />
                    创建分支
                  </button>
                  <button type="button" onClick={() => onExport(activeThread.id)} className="codex-left-menu-item" data-testid="agent-home-thread-menu-export">
                    <Download className="h-3.5 w-3.5" />
                    导出
                  </button>
                  {activeThread.archivedAt ? (
                    <button type="button" onClick={() => onRestore(activeThread.id)} className="codex-left-menu-item" data-testid="agent-home-thread-menu-restore">
                      <RefreshCw className="h-3.5 w-3.5" />
                      恢复
                    </button>
                  ) : (
                    <button type="button" onClick={() => onArchive(activeThread.id)} className="codex-left-menu-item" data-testid="agent-home-thread-menu-archive">
                      <Archive className="h-3.5 w-3.5" />
                      归档
                    </button>
                  )}
                  <div className="codex-left-menu-separator" />
                  <button type="button" onClick={() => onDelete(activeThread.id)} className="codex-left-menu-item is-danger" data-testid="agent-home-thread-menu-delete">
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {agentChatBusy && (
        <div className="codex-thread-status mt-2 flex min-w-0 items-center justify-between gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1.5 text-[10px]">
          <div className="flex min-w-0 items-center gap-2">
            <StatusBadge status={chatPrimaryStatus} subtle />
            <span className="shrink-0 font-semibold text-cyan-100">{chatPrimaryLabel}</span>
            <span className="truncate text-slate-500">{chatPrimaryDetail}</span>
          </div>
        </div>
      )}
      {agentLoopStatus.status === "running" && (
        <button
          type="button"
          onClick={onOpenStatus}
          className="codex-thread-status is-loop mt-2 flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-fuchsia-500/20 bg-fuchsia-500/5 px-2.5 py-1.5 text-left text-[10px] hover:border-fuchsia-400/40"
          data-testid="agent-loop-running-banner"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Cpu className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
            <span className="shrink-0 font-semibold text-fuchsia-100">自动执行</span>
            <span className="truncate text-slate-500">{agentLoopStatus.phase || "intake"} · {agentLoopStatus.detail}</span>
          </span>
          <span className="shrink-0 text-fuchsia-200">查看轨迹</span>
        </button>
      )}
    </section>
  );
}

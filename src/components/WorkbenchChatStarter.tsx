import type { ReactNode } from "react";
import { FolderKanban, MessageSquare } from "lucide-react";

export interface WorkbenchChatStarterAction {
  id: string;
  label: string;
  detail: string;
  icon: ReactNode;
  tone: string;
  disabled?: boolean;
  onClick: () => void;
}

interface WorkbenchChatStarterProps {
  projectModeActive: boolean;
  currentModeLabel: string;
  projectLabel: string;
  actions: WorkbenchChatStarterAction[];
  modelReady: boolean;
  modelLabel: string;
  modelTitle: string;
  contextLabel: string;
  onOpenModelSettings: () => void;
}

export function WorkbenchChatStarter({
  projectModeActive,
  currentModeLabel,
  projectLabel,
  actions,
  modelReady,
  modelLabel,
  modelTitle,
  contextLabel,
  onOpenModelSettings,
}: WorkbenchChatStarterProps) {
  return (
    <div className="codex-chat-empty flex min-h-[172px] flex-col justify-center rounded-md px-3 text-left">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="flex items-start gap-3">
          <div className={`codex-chat-empty-icon flex h-10 w-10 shrink-0 items-center justify-center rounded border ${projectModeActive ? "is-project" : ""}`}>
            {projectModeActive ? <FolderKanban className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="codex-chat-empty-title text-[15px] font-semibold text-slate-100">需要我做什么？</div>
              <span className={`codex-chat-mode-pill ${projectModeActive ? "is-project" : ""}`}>{currentModeLabel}</span>
            </div>
            <div className="codex-chat-empty-copy mt-1 max-w-xl text-[12px] leading-relaxed text-slate-500">
              {projectModeActive
                ? `当前绑定「${projectLabel}」。从这里发任务、看文件、审变更。`
                : "这里是主对话。可以直接聊天、传文件或图片，也可以切到项目模式。"}
            </div>
          </div>
        </div>
        <div className="codex-chat-starter-grid mt-3 flex min-w-0 flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={`home-starter-${action.id}`}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className={`codex-chat-starter-action is-compact ${action.tone}`}
              title={action.detail}
              aria-label={`${action.label}：${action.detail}`}
              data-testid={`agent-home-starter-${action.id}`}
            >
              <span className="codex-chat-starter-icon">{action.icon}</span>
              <span className="min-w-0 truncate">
                <span className="block truncate text-[12px] font-medium">{action.label}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="codex-chat-starter-status mt-3 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
          <span>{modelReady ? "可直接回复" : "模型未连接"}</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenModelSettings}
            className="truncate text-slate-500 hover:text-sky-300"
            title={modelTitle}
            data-testid="agent-home-empty-model-link"
          >
            {modelLabel}
          </button>
          <span aria-hidden="true">·</span>
          <span className="truncate">{contextLabel}</span>
        </div>
      </div>
    </div>
  );
}

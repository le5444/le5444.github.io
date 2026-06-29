import type { ClipboardEvent, DragEvent, KeyboardEvent, RefObject } from "react";
import {
  Cpu,
  Database,
  FileText,
  FolderKanban,
  HardDrive,
  ImageOff,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  PanelBottomOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { THREAD_ATTACHMENT_ACCEPT } from "../utils/agent-attachment-intake";
import type { AgentThreadMessage, AgentThreadMessageAttachment } from "../utils/agent-thread-store";

export interface WorkbenchComposerContextChip {
  label: string;
  value: string;
  tone: string;
  title?: string;
}

interface WorkbenchComposerProps {
  pendingApprovalCount: number;
  pendingApprovalAction: string;
  pendingApprovalTarget: string;
  projectModeActive: boolean;
  projectLabel: string;
  rootPath: string;
  rootStatus: string;
  rootStatusTone: string;
  rootScanDetail: string;
  workspaceScanRunning: boolean;
  workspaceScanCanExecute: boolean;
  threadComposer: string;
  setThreadComposer: (value: string) => void;
  attachments: AgentThreadMessageAttachment[];
  attachmentStatus: string;
  setAttachments: (attachments: AgentThreadMessageAttachment[]) => void;
  setAttachmentStatus: (value: string) => void;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  composerMetaVisible: boolean;
  sendContextHint: string;
  attachmentTransportCompact: string;
  threadContextLabel: string;
  sendContextChips: WorkbenchComposerContextChip[];
  composerMoreOpen: boolean;
  setComposerMoreOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  commandDraftRunning: boolean;
  modelRuntimeReady: boolean;
  agentLoopRunning: boolean;
  commandTask: string;
  activeThreadTask: string;
  agentChatBusy: boolean;
  canSendToModelNow: boolean;
  providerRuntimeProbeFailure: boolean;
  composerModelTitle: string;
  composerModelLabel: string;
  sendModeDetail: string;
  sendModeLabel: string;
  attachmentReceiptStatus: string;
  attachmentReceiptDetail: string;
  attachmentRejectedFromModel: boolean;
  attachmentTransport: {
    hasModelPayload: boolean;
    imageAttachmentCount: number;
    parsedFileCount: number;
    metadataFileCount: number;
    failedFileCount: number;
  };
  agentChatDetail: string;
  showSendModeStatus: boolean;
  composerBlockedLabel: string;
  modelBlockedPublicTitle: string;
  agentChatStatus: string;
  apiReady: boolean;
  directModelTestStatus: string;
  lastUserThreadMessage: AgentThreadMessage | null;
  onOpenApprovals: () => void;
  onOpenApprovalsPanel: () => void;
  onOpenContext: () => void;
  onOpenFiles: () => void;
  onScanWorkspace: () => void;
  onBindWorkspaceRoot: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onAttachFiles: (files: FileList | null) => void;
  onSendMessage: (generateDraft: boolean) => void;
  onRunAgentLoop: () => void;
  onStopGenerating: () => void;
  onOpenModelSettings: () => void;
  onRetryLastUserMessage: () => void;
  onRunDirectModelTest: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
}

function formatNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 1 : 2)}万`;
  return String(value);
}

function attachmentParseLabel(attachment: AgentThreadMessageAttachment) {
  if (attachment.kind === "image") return "图片输入";
  if (attachment.parseStatus === "parsed") return attachment.parser || "已解析文本";
  if (attachment.parseStatus === "failed") return attachment.parser ? `${attachment.parser} 失败` : "解析失败";
  return attachment.warning || "仅元数据";
}

function attachmentParseTone(attachment: AgentThreadMessageAttachment) {
  if (attachment.parseStatus === "parsed" || attachment.kind === "image") return "text-emerald-300";
  if (attachment.parseStatus === "failed") return "text-red-300";
  return "text-amber-300";
}

function attachmentDeliveryLabel(attachment: AgentThreadMessageAttachment) {
  if (attachment.kind === "image" && attachment.dataUrl) return "多模态图片";
  if (attachment.kind === "image") return "图片摘要";
  if (attachment.parseStatus === "parsed") return "文本片段";
  if (attachment.parseStatus === "metadata") return "仅元数据";
  if (attachment.parseStatus === "failed") return "仅保留文件信息";
  return "附件上下文";
}

function attachmentDeliveryDetail(attachment: AgentThreadMessageAttachment) {
  if (attachment.kind === "image" && attachment.dataUrl) return "将作为图片输入随本次请求发送给支持多模态的模型。";
  if (attachment.kind === "image") return "图片文件已挂载，但缺少可发送的图片数据，只会进入上下文摘要。";
  if (attachment.parseStatus === "parsed") return "将把已抽取的可读文本片段放进本次请求。";
  if (attachment.parseStatus === "metadata") return "只把文件名、类型和大小放进本次请求；正文暂未读取。";
  if (attachment.parseStatus === "failed") return "解析失败，只保留文件名、类型、大小和错误提示。";
  return "将作为附件上下文参与本次请求。";
}

export function WorkbenchComposer({
  pendingApprovalCount,
  pendingApprovalAction,
  pendingApprovalTarget,
  projectModeActive,
  projectLabel,
  rootPath,
  rootStatus,
  rootStatusTone,
  rootScanDetail,
  workspaceScanRunning,
  workspaceScanCanExecute,
  threadComposer,
  setThreadComposer,
  attachments,
  attachmentStatus,
  setAttachments,
  setAttachmentStatus,
  attachmentInputRef,
  composerRef,
  composerMetaVisible,
  sendContextHint,
  attachmentTransportCompact,
  threadContextLabel,
  sendContextChips,
  composerMoreOpen,
  setComposerMoreOpen,
  commandDraftRunning,
  modelRuntimeReady,
  agentLoopRunning,
  commandTask,
  activeThreadTask,
  agentChatBusy,
  canSendToModelNow,
  providerRuntimeProbeFailure,
  composerModelTitle,
  composerModelLabel,
  sendModeDetail,
  sendModeLabel,
  attachmentReceiptStatus,
  attachmentReceiptDetail,
  attachmentRejectedFromModel,
  attachmentTransport,
  agentChatDetail,
  showSendModeStatus,
  composerBlockedLabel,
  modelBlockedPublicTitle,
  agentChatStatus,
  apiReady,
  directModelTestStatus,
  lastUserThreadMessage,
  onOpenApprovals,
  onOpenApprovalsPanel,
  onOpenContext,
  onOpenFiles,
  onScanWorkspace,
  onBindWorkspaceRoot,
  onDragOver,
  onDrop,
  onPaste,
  onAttachFiles,
  onSendMessage,
  onRunAgentLoop,
  onStopGenerating,
  onOpenModelSettings,
  onRetryLastUserMessage,
  onRunDirectModelTest,
  onRemoveAttachment,
}: WorkbenchComposerProps) {
  const hasInput = Boolean(threadComposer.trim() || attachments.length);
  const runLoopDisabled = !modelRuntimeReady || agentLoopRunning || (!threadComposer.trim() && !commandTask.trim() && !activeThreadTask);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (hasInput) onSendMessage(false);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onSendMessage(true);
    }
  };

  return (
    <>
      {pendingApprovalCount > 0 && (
        <div className="codex-composer-approval-strip mx-auto mb-2 flex w-full max-w-[900px] items-center justify-between gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[10px]" data-testid="composer-approval-strip">
          <button type="button" onClick={onOpenApprovals} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={`有 ${pendingApprovalCount} 条待确认动作`}>
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-200" />
            <span className="min-w-0 truncate text-amber-100">{pendingApprovalCount} 条待确认动作</span>
            <span className="hidden min-w-0 truncate text-slate-500 sm:inline">{pendingApprovalAction} · {pendingApprovalTarget}</span>
          </button>
          <button type="button" onClick={onOpenApprovalsPanel} title="打开审批" aria-label="打开审批" data-testid="composer-open-approvals" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-500/20 bg-slate-950/40 text-amber-100 transition-colors hover:border-amber-400/45 hover:bg-amber-500/10">
            <PanelBottomOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {projectModeActive && (
        <div className="codex-composer-project-strip mx-auto mb-2 flex w-full max-w-[900px] items-center justify-between gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-[10px]" data-testid="composer-project-strip">
          <button type="button" onClick={onOpenFiles} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={rootPath || projectLabel}>
            <FolderKanban className="h-3.5 w-3.5 shrink-0 text-emerald-200" />
            <span className="min-w-0 truncate text-emerald-100">{projectLabel}</span>
            <span className={`hidden min-w-0 truncate sm:inline ${rootStatusTone}`}>{rootStatus}</span>
            <span className="hidden min-w-0 truncate text-slate-500 lg:inline">{rootScanDetail}</span>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={onOpenFiles} title="打开项目文件" aria-label="打开项目文件" data-testid="composer-open-files" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/20 bg-slate-950/40 text-emerald-100 transition-colors hover:border-emerald-400/45 hover:bg-emerald-500/10">
              <FileText className="h-3.5 w-3.5" />
            </button>
            {rootPath ? (
              <button type="button" onClick={onScanWorkspace} disabled={!workspaceScanCanExecute || workspaceScanRunning} title={workspaceScanRunning ? "正在扫描目录" : "扫描目录索引"} aria-label={workspaceScanRunning ? "正在扫描目录" : "扫描目录索引"} data-testid="composer-scan-workspace" className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-500/20 bg-slate-950/40 px-2 text-[10px] text-emerald-100 transition-colors hover:border-cyan-400/45 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-45">
                <Search className={`h-3.5 w-3.5 ${workspaceScanRunning ? "animate-pulse" : ""}`} />
                扫描
              </button>
            ) : (
              <button type="button" onClick={onBindWorkspaceRoot} title="绑定本机项目目录" aria-label="绑定本机项目目录" data-testid="composer-bind-workspace-root" className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-500/20 bg-slate-950/40 px-2 text-[10px] text-amber-100 transition-colors hover:border-amber-400/45 hover:bg-amber-500/10">
                <HardDrive className="h-3.5 w-3.5" />
                绑定目录
              </button>
            )}
          </div>
        </div>
      )}

      <div className="codex-composer-card mt-3 shrink-0 rounded-md border border-[#2a303b] bg-[#11151c] px-3 py-2.5 shadow-lg shadow-black/20 transition-colors focus-within:border-sky-500/45" onDragOver={onDragOver} onDrop={onDrop}>
        <textarea
          id="agent-thread-composer"
          data-testid="agent-thread-composer"
          ref={composerRef}
          value={threadComposer}
          onChange={(event) => setThreadComposer(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          rows={1}
          className="codex-composer-input min-h-[58px] w-full resize-none rounded-md border border-[#2a303b] bg-[#0d1017] px-3 py-2 text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500/50"
          placeholder="发消息、传文件或描述任务..."
        />

        {composerMetaVisible && (
          <details className="codex-composer-context mt-2 rounded-md border border-[#242934] bg-[#0d1017]/70" data-testid="composer-context-receipt">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 truncate" title={sendContextHint}>上下文 · {attachmentTransportCompact || threadContextLabel}</span>
              <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            </summary>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-[#242934] px-2 py-1.5">
              {sendContextChips.map((chip) => (
                <span key={`home-send-context-${chip.label}`} className={`inline-flex max-w-[180px] items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${chip.tone}`} title={chip.title || `${chip.label}：${chip.value}`} data-testid={`composer-context-chip-${chip.label}`}>
                  <span className="text-slate-500">{chip.label}</span>
                  <span className="truncate font-medium">{chip.value}</span>
                </span>
              ))}
            </div>
          </details>
        )}

        <div className="codex-composer-toolbar mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex min-w-0 items-center gap-2">
            <input ref={attachmentInputRef} type="file" multiple accept={THREAD_ATTACHMENT_ACCEPT} onChange={(event) => onAttachFiles(event.target.files)} className="hidden" data-testid="agent-home-composer-attachment-input" />
            <button type="button" onClick={() => attachmentInputRef.current?.click()} title="添加附件" className="codex-composer-icon" data-testid="agent-home-composer-attach">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setComposerMoreOpen((prev) => !prev)} title="更多操作" aria-label="更多操作" aria-expanded={composerMoreOpen} data-testid="agent-home-composer-more" className="codex-composer-icon">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {composerMoreOpen && (
              <div className="codex-composer-menu absolute left-10 top-9 z-30 grid w-44 gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1.5 shadow-2xl shadow-black/40" data-testid="agent-home-composer-more-menu">
                <button type="button" onClick={() => { setComposerMoreOpen(false); onOpenContext(); }} className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-[12px] text-slate-400 hover:bg-slate-900 hover:text-slate-100">
                  <Database className="h-3.5 w-3.5" />
                  {projectModeActive ? "项目上下文" : "上下文"}
                </button>
                <button type="button" onClick={() => { setComposerMoreOpen(false); onSendMessage(true); }} disabled={!hasInput || commandDraftRunning} className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-[12px] text-slate-400 hover:bg-slate-900 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-45">
                  <ListChecks className="h-3.5 w-3.5" />
                  生成计划
                </button>
                <button type="button" onClick={() => { setComposerMoreOpen(false); onRunAgentLoop(); }} disabled={runLoopDisabled} className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-[12px] text-slate-400 hover:bg-slate-900 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-45">
                  <Cpu className="h-3.5 w-3.5" />
                  启动自动执行
                </button>
              </div>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={onOpenModelSettings} data-testid="composer-model-pill" className={`codex-model-pill ${agentChatBusy ? "is-running" : canSendToModelNow ? "is-ready" : providerRuntimeProbeFailure ? "is-error" : "is-muted"}`} title={composerModelTitle} aria-label="打开模型中心">
              <span className="codex-model-dot" />
              {composerModelLabel}
            </button>
            <button type="button" onClick={agentChatBusy ? onStopGenerating : () => onSendMessage(false)} disabled={!agentChatBusy && !hasInput} title={sendModeDetail} aria-label={sendModeLabel} data-testid="agent-send-button" className={`codex-send-button ${!agentChatBusy && !canSendToModelNow ? "is-save-only" : ""}`}>
              {agentChatBusy ? <XCircle className="h-5 w-5" /> : canSendToModelNow ? <Send className="h-5 w-5" /> : <Save className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {(attachmentStatus || attachments.length > 0) && (
          <div className="codex-composer-attachment-receipt mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-[#2a303b] bg-[#0d1017]/70 px-2.5 py-2 text-[10px] leading-relaxed text-slate-400" data-testid="agent-home-composer-attachment-receipt" data-has-model-payload={attachmentTransport.hasModelPayload ? "true" : "false"} data-image-count={attachmentTransport.imageAttachmentCount} data-parsed-file-count={attachmentTransport.parsedFileCount} data-metadata-file-count={attachmentTransport.metadataFileCount} data-failed-file-count={attachmentTransport.failedFileCount} data-status={attachmentReceiptStatus} data-rejected-from-model={attachmentRejectedFromModel ? "true" : "false"}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-sky-200">附件回执</span>
              <span className="shrink-0 font-medium text-slate-200" data-attachment-receipt-status>{attachmentReceiptStatus}</span>
              <span className="min-w-0 truncate text-slate-500" title={attachmentReceiptDetail || "当前没有附件。"}>{attachmentReceiptDetail || "当前按纯文本发送。"}</span>
            </div>
            {(attachmentStatus || attachments.length > 0) && (
              <button type="button" onClick={() => { setAttachments([]); setAttachmentStatus(""); if (attachmentInputRef.current) attachmentInputRef.current.value = ""; }} className="codex-composer-mini-icon is-danger" data-testid="composer-clear-attachments" title="清空待发送附件和状态" aria-label="清空待发送附件和状态">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {agentChatBusy && (
          <div className="mt-2 rounded-md border border-sky-500/20 bg-sky-500/5 px-2 py-2 text-[10px] leading-relaxed text-sky-100">
            {agentChatDetail || "正在生成 AI 回复。"}
          </div>
        )}

        {showSendModeStatus && (
          <div className={`codex-composer-blocker mt-2 rounded-md border px-2.5 py-2 ${providerRuntimeProbeFailure ? "border-rose-500/25 bg-rose-500/10" : "border-amber-500/25 bg-amber-500/10"}`} data-testid="composer-send-mode-status">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className={`text-[11px] font-medium ${providerRuntimeProbeFailure ? "text-rose-100" : "text-amber-100"}`}>{composerBlockedLabel}</div>
                <div className="min-w-0 truncate text-[10px] leading-relaxed text-slate-400" title={modelBlockedPublicTitle}>消息会先留在线程里；连接模型后可继续生成。</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={onOpenModelSettings} className="codex-composer-action is-primary" data-testid="composer-open-model" title="打开模型中心" aria-label="打开模型中心">
                  <Settings className="h-3.5 w-3.5" />
                  <span>模型中心</span>
                </button>
                <button type="button" onClick={onRetryLastUserMessage} disabled={agentChatBusy || !lastUserThreadMessage} className="codex-composer-action is-primary" data-testid="composer-blocker-retry-last" title={canSendToModelNow ? "重新发送上一条用户消息" : "模型可用后再重试上一条消息"} aria-label="重试上一条消息">
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>重试</span>
                </button>
                <button type="button" onClick={onRunDirectModelTest} disabled={!apiReady || directModelTestStatus === "running"} className="codex-composer-action is-primary" data-testid="composer-blocker-test-model" title={directModelTestStatus === "running" ? "正在测试对话" : "测试对话"} aria-label={directModelTestStatus === "running" ? "正在测试对话" : "测试对话"}>
                  {directModelTestStatus === "running" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                  <span>{directModelTestStatus === "running" ? "测试中" : "测试"}</span>
                </button>
              </div>
            </div>
            {(agentChatStatus === "error" || agentChatStatus === "setup-needed") && agentChatDetail && (
              <div className={`mt-2 rounded border px-2 py-1.5 text-[10px] leading-relaxed ${agentChatStatus === "error" ? "border-rose-500/20 bg-rose-500/5 text-rose-100" : "border-slate-800 bg-slate-950/60 text-slate-400"}`}>
                {agentChatDetail}
              </div>
            )}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="codex-composer-attachments mt-3 grid gap-2 sm:grid-cols-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[#2a303b] bg-[#0d1017] px-2 py-2" data-testid="agent-home-composer-attachment-card" data-attachment-kind={attachment.kind} data-parse-status={attachment.parseStatus || ""}>
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded bg-slate-900 text-slate-500">
                  {attachment.kind === "image" && attachment.dataUrl ? (
                    <div className="codex-attachment-thumb-frame">
                      <img
                        src={attachment.dataUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                          const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.hidden = false;
                        }}
                      />
                      <span className="codex-attachment-thumb-fallback" hidden title="图片预览不可用">
                        <ImageOff className="h-4 w-4" />
                      </span>
                    </div>
                  ) : <FileText className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-medium text-slate-200">{attachment.name}</div>
                  <div className="truncate text-[10px] text-slate-600">{formatNumber(attachment.size)} bytes</div>
                  <div className={`mt-1 truncate text-[10px] ${attachmentParseTone(attachment)}`}>{attachmentParseLabel(attachment)}</div>
                  <div className="mt-1 truncate text-[10px] text-sky-300" title={attachmentDeliveryDetail(attachment)}>{attachmentDeliveryLabel(attachment)}</div>
                  {attachment.warning && <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-amber-200/80">{attachment.warning}</div>}
                </div>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} className="codex-composer-mini-icon is-danger" data-testid={`composer-remove-attachment-${attachment.id}`} title={`移除 ${attachment.name}`} aria-label={`移除附件 ${attachment.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

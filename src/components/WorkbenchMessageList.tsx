import { CheckCircle2, Copy, RefreshCw, Settings } from "lucide-react";
import type { AgentThreadMessage, AgentThreadMessageAttachment } from "../utils/agent-thread-store";

function formatNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 1 : 2)}万`;
  return String(value);
}

function formatTime(value: number) {
  if (!value) return "未刷新";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function publicFacingText(value: string, fallback = "") {
  const text = value || fallback;
  return text
    .replace(/灵枢\s*LumenOS/gi, "织梦写作台")
    .replace(/LumenOS\s*Agent\s*OS\s*底层/gi, "AI 工作台")
    .replace(/Personal\s*Agent\s*OS/gi, "个人 AI 工作台")
    .replace(/Personal\s*OS/gi, "个人 AI 工作台")
    .replace(/Agent\s*OS/gi, "AI 工作台")
    .replace(/LumenOS/gi, "织梦写作台")
    .replace(/灵枢/g, "织梦");
}

function uiPreviewText(value: string, fallback = "") {
  return publicFacingText(value, fallback)
    .replace(/当前端点未连接：[^。\n]*(?:。)?/g, "本地模型服务没有连接。")
    .replace(/当前端点超时：[^。\n]*(?:。)?/g, "本地模型服务连接超时。")
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1)[^\s，。；）)]*/gi, "本地模型服务")
    .replace(/本地模型服务没有连接[，。]\s*当前发送会先保存到线程。?/g, "暂存模式已启用，消息会先保存到线程。")
    .replace(/本地模型服务没有连接。?/g, "暂存模式")
    .replace(/本地模型服务连接超时。?/g, "模型连接超时")
    .replace(/context_pack/gi, "上下文包")
    .replace(/thread_context/gi, "会话上下文")
    .replace(/model[_\s-]*worker/gi, "模型任务")
    .replace(/\bWorker\b/g, "后台任务")
    .replace(/\bWorkers\b/g, "后台任务")
    .replace(/模型[\s_-]*后台任务/g, "模型任务")
    .replace(/模型[\s_-]*任务/g, "模型任务")
    .replace(/\bProvider\b/g, "模型服务")
    .replace(/\bGateway\b/g, "网关")
    .replace(/\bSkills\b/g, "能力")
    .replace(/\bSkill\b/g, "能力")
    .replace(/\bPanel\b/g, "面板")
    .replace(/\bAPI key\b/gi, "密钥")
    .replace(/\bendpoint\b/gi, "模型地址");
}

function uiMessageText(value: string, fallback = "") {
  return uiPreviewText(value, fallback)
    .replace(/阻塞原因：本地模型服务没有连接。/g, "当前模型未连接。")
    .replace(/阻塞原因：本地模型服务连接超时。/g, "当前模型连接超时。")
    .replace(/Failed to fetch/gi, "连接失败");
}

function toolMessageDisplay(message: AgentThreadMessage) {
  const title = uiPreviewText(message.title || "工具消息");
  const lines = message.content
    .split(/\r?\n/)
    .map((line) => uiPreviewText(line).trim())
    .filter(Boolean);
  const contentText = lines.join("\n");
  const lowered = `${message.status}\n${title}\n${contentText}`.toLowerCase();
  const isToolRequest = /工具请求|bridge-request|requested|submitted/.test(`${title}\n${contentText}`) || lowered.includes("submitted");
  const isToolResult = /工具结果|result|completed|partial|ok/.test(`${title}\n${contentText}`) || ["completed", "partial", "ok"].includes(message.status);
  const isApproval = /审批|approval/.test(`${title}\n${contentText}`);
  const isError = /error|failed|失败|错误|blocked|阻塞|denied|拒绝/.test(lowered);
  const actionLine = lines.find((line) => /^\d+\.\s*\S+/.test(line));
  const action = actionLine
    ? actionLine.replace(/^\d+\.\s*/, "").replace(/\s*[·:：].*$/, "").trim()
    : title.replace(/^(工具请求|工具结果|Agent Loop 工具|模型任务状态|模型任务预检)\s*[·:：]?\s*/i, "").trim();
  const purposeLine = lines.find((line) => line.startsWith("目的："));
  const resultLine = lines.find((line) => line.startsWith("结果："));
  const statusLine = lines.find((line) => line.startsWith("状态："));
  const approvalLine = lines.find((line) => line.startsWith("审批："));
  const summary = purposeLine?.replace(/^目的：/, "")
    || resultLine?.replace(/^结果：/, "")
    || contentText.replace(/\n+/g, " ").slice(0, 180)
    || title;
  const label = isError
    ? "工具异常"
    : isApproval
      ? "等待审批"
      : isToolRequest
        ? "请求工具"
        : isToolResult
          ? "工具完成"
          : "工具轨迹";
  const tone = isError ? "error" : isApproval ? "approval" : isToolRequest ? "request" : "result";
  const chips = [
    statusLine?.replace(/^状态：/, ""),
    approvalLine?.replace(/^审批：/, ""),
  ].filter(Boolean).slice(0, 3);
  return {
    label,
    action: action || "工具",
    summary,
    detail: contentText || title,
    tone,
    chips,
    collapsed: !isError,
  };
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

interface WorkbenchMessageListProps {
  messages: AgentThreadMessage[];
  copiedMessageId: string;
  agentChatBusy: boolean;
  canSendToModelNow: boolean;
  hasRetryTarget: boolean;
  onCopyMessage: (message: AgentThreadMessage) => void | Promise<void>;
  onOpenModelSettings: () => void;
  onRetryLastUserMessage: () => void | Promise<void>;
}

export function WorkbenchMessageList({
  messages,
  copiedMessageId,
  agentChatBusy,
  canSendToModelNow,
  hasRetryTarget,
  onCopyMessage,
  onOpenModelSettings,
  onRetryLastUserMessage,
}: WorkbenchMessageListProps) {
  return (
    <>
      {messages.map((message) => {
        const roleLabel = message.role === "user" ? "你" : message.role === "assistant" ? "助手" : message.role === "tool" ? "工具" : "系统";
        const displayContent = uiMessageText(message.content);
        const errorStatusText = `${message.status}\n${message.title}`;
        const messageLooksError = /error|failed|失败|错误|expired/i.test(errorStatusText)
          || (message.role !== "user" && /请求失败|API 错误|key 已过期|expired|failed/i.test(message.content));
        const canRetryFromMessage = (message.status === "setup-needed" || messageLooksError) && /模型未连接|AI 请求失败|请求失败|未生成回复|API 错误|key 已过期|expired|failed/i.test(`${message.title}\n${message.content}`);
        const messageClass = [
          "codex-message-card",
          `codex-role-${message.role}`,
          message.role === "tool" || message.role === "system" ? "codex-event-card" : "",
          messageLooksError ? "codex-message-error" : "",
          message.role === "user" ? "ml-auto" : "mr-auto",
        ].filter(Boolean).join(" ");
        return (
          <div key={message.id} className={messageClass}>
            <div className="codex-message-meta">
              <span className="codex-message-role">{roleLabel}</span>
              {message.role !== "assistant" && <span className="codex-message-title">{message.title}</span>}
              <span className="codex-message-time">{formatTime(message.at)}</span>
              <button
                type="button"
                onClick={() => void onCopyMessage(message)}
                className={`${canRetryFromMessage ? "" : "ml-auto"} inline-flex h-6 w-6 items-center justify-center rounded border border-slate-800 text-slate-500 hover:border-cyan-500/40 hover:text-cyan-200`}
                data-testid={`message-copy-${message.id}`}
                title={copiedMessageId === message.id ? "已复制" : "复制这条消息"}
                aria-label={copiedMessageId === message.id ? "已复制" : "复制这条消息"}
              >
                {copiedMessageId === message.id ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              {canRetryFromMessage && (
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onOpenModelSettings}
                    className="codex-message-action"
                    data-testid="message-open-model-settings"
                    title="打开模型设置"
                    aria-label="打开模型设置"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>模型设置</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onRetryLastUserMessage()}
                    disabled={agentChatBusy || !hasRetryTarget}
                    className="codex-message-action is-primary"
                    data-testid="message-retry-last"
                    title={canSendToModelNow ? "重新发送上一条用户消息" : "配置好模型后可重试上一条消息"}
                    aria-label="重试上一条消息"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>重试</span>
                  </button>
                </div>
              )}
            </div>
            {message.role === "tool" ? (() => {
              const toolView = toolMessageDisplay(message);
              return (
                <details className={`codex-tool-message codex-tool-${toolView.tone} mt-2`} open={!toolView.collapsed}>
                  <summary className="codex-tool-summary">
                    <span className="codex-tool-dot" />
                    <span className="codex-tool-label">{toolView.label}</span>
                    <span className="codex-tool-action">{toolView.action}</span>
                    <span className="codex-tool-brief">{toolView.summary}</span>
                    {toolView.chips.map((chip) => (
                      <span key={`${message.id}-${chip}`} className="codex-tool-chip">{chip}</span>
                    ))}
                  </summary>
                  <pre className="codex-tool-detail">{toolView.detail}</pre>
                </details>
              );
            })() : (
              <div className="codex-message-content mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-300">{displayContent}</div>
            )}
            {message.attachments.length > 0 && (
              <div className="codex-message-attachments mt-2 grid gap-2 sm:grid-cols-2">
                {message.attachments.map((attachment) => (
                  <div key={attachment.id} className="codex-message-attachment overflow-hidden rounded border border-slate-800 bg-[#0b0f15]">
                    {attachment.kind === "image" && attachment.dataUrl ? (
                      <img src={attachment.dataUrl} alt={attachment.name} className="max-h-40 w-full bg-slate-950 object-contain" />
                    ) : null}
                    <div className="px-2 py-2">
                      <div className="truncate text-[10px] font-medium text-slate-200">{attachment.name}</div>
                      <div className="mt-1 truncate text-[10px] text-slate-600">{attachment.mimeType || "unknown"} · {formatNumber(attachment.size)} bytes</div>
                      <div className={`mt-1 truncate text-[10px] ${attachmentParseTone(attachment)}`}>{attachmentParseLabel(attachment)}</div>
                      <div className="mt-1 truncate text-[10px] text-sky-300" title={attachmentDeliveryDetail(attachment)}>{attachmentDeliveryLabel(attachment)}</div>
                      {attachment.warning && <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-amber-200/80">{attachment.warning}</div>}
                      {attachment.textPreview && (
                        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-[#10151d] px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-400">{attachment.textPreview}</pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

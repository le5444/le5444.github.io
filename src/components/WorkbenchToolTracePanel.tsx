import type { AgentThreadTraceRow } from "../utils/agent-thread-store";

const ISSUE_LOG_STATUSES = new Set(["error", "blocked", "offline", "missing", "failed", "approval_required"]);
const ACTIVE_LOG_STATUSES = new Set(["running", "pending", "draft", "approval_required", "queued"]);

function truncateMiddle(value: string, keep = 18) {
  if (!value || value.length <= keep * 2 + 3) return value;
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

function statusTone(status: string) {
  if (["ok", "ready", "current", "restored", "recorded", "completed", "success", "passed", "accepted"].includes(status)) return "text-emerald-300";
  if (["running", "pending", "draft", "approval_required", "queued"].includes(status)) return "text-amber-300";
  if (["blocked", "error", "failed", "offline", "denied", "rejected"].includes(status)) return "text-rose-300";
  return "text-slate-400";
}

function statusLabel(status: string) {
  const normalized = status || "unknown";
  const labels: Record<string, string> = {
    accepted: "已接受",
    approval_required: "待审批",
    blocked: "阻塞",
    completed: "完成",
    current: "当前",
    denied: "已拒绝",
    draft: "草案",
    error: "错误",
    failed: "失败",
    offline: "离线",
    ok: "正常",
    pending: "等待",
    queued: "排队",
    ready: "就绪",
    recorded: "已记录",
    rejected: "已拒绝",
    restored: "已恢复",
    running: "运行中",
    success: "成功",
    unknown: "未知",
  };
  return labels[normalized] || normalized;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status || "unknown";
  return (
    <span className={`shrink-0 rounded-md bg-slate-800 px-2 py-1 text-[10px] text-slate-400 ${statusTone(normalized)}`}>
      {statusLabel(normalized)}
    </span>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-3 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function compactApprovalId(value: string) {
  return value ? truncateMiddle(value, 10) : "未关联";
}

function formatTraceMetaChip(value: string) {
  const [kind, ...rest] = value.split(":");
  const body = rest.join(":").trim();
  if (!body) return value;
  if (kind === "request") return `req ${truncateMiddle(body, 10)}`;
  if (kind === "approval") return `审批 ${compactApprovalId(body)}`;
  if (kind === "run") return `run ${truncateMiddle(body, 10)}`;
  if (kind === "thread") return `线程 ${truncateMiddle(body, 10)}`;
  if (kind === "path") return `文件 ${truncateMiddle(body, 12)}`;
  if (kind === "root") return `目录 ${truncateMiddle(body, 12)}`;
  if (kind === "root_input") return `输入 ${truncateMiddle(body, 12)}`;
  if (kind === "files") return `${body} 文件`;
  if (kind === "review") return `审查 ${body}`;
  return value;
}

function traceMetaPriority(value: string) {
  const kind = value.split(":", 1)[0];
  const priorities: Record<string, number> = {
    approval: 1,
    path: 2,
    root: 3,
    files: 4,
    request: 5,
    run: 6,
    root_input: 7,
    review: 8,
    thread: 9,
    purpose: 10,
  };
  return priorities[kind] || 20;
}

function prioritizedTraceMeta(meta: string[]) {
  return [...meta]
    .filter(Boolean)
    .sort((a, b) => traceMetaPriority(a) - traceMetaPriority(b));
}

function stripTraceNextStepPrefix(value: string) {
  return value.replace(/^下一步\s*[：:]\s*/, "").trim();
}

function traceNextStepFromDetail(detail: string) {
  return detail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^下一步\s*[：:]/.test(line));
}

function traceDetailWithoutNextStep(detail: string) {
  const cleaned = detail
    .split(/\r?\n/)
    .filter((line) => !/^下一步\s*[：:]/.test(line.trim()))
    .join("\n")
    .trim();
  return cleaned || detail;
}

function traceNextStepForRow(row: AgentThreadTraceRow) {
  const explicit = stripTraceNextStepPrefix(row.nextStep || "");
  if (explicit) return explicit;
  const fromDetail = traceNextStepFromDetail(row.detail);
  if (fromDetail) return stripTraceNextStepPrefix(fromDetail);
  const status = row.status.toLowerCase();
  const meta = row.meta || [];
  const text = `${row.kind}\n${row.label}\n${row.title}\n${row.detail}\n${row.source}\n${meta.join("\n")}`.toLowerCase();
  if (row.kind === "approvals" || status.includes("approval") || text.includes("审批")) return "到审批面板确认、拒绝或等待人工处理。";
  if (row.kind === "diffs" || status.includes("diff") || text.includes("hunk") || text.includes("changes / diff")) return "到变更 / Diff 面板逐项审查 hunk。";
  if (ISSUE_LOG_STATUSES.has(row.status) || /error|failed|失败|错误|blocked|阻塞|denied|拒绝|validation/.test(text)) return "检查错误原因，调整请求或配置后重试。";
  if (ACTIVE_LOG_STATUSES.has(row.status) || status.includes("pending") || status.includes("queued") || status.includes("running")) return "等待执行返回，必要时查看实时日志或取消任务。";
  if (row.kind === "workers") return "Worker 结果已回灌，可继续复核证据或让模型续写。";
  if (row.kind === "messages") return row.label.includes("用户") ? "交给模型规划；如需要本地能力，会进入 Gateway / Diff / 审批链路。" : "查看模型回复；如包含工具请求，继续交给 Gateway 执行并回灌结果。";
  return "结果已回灌，模型可以基于证据继续推理。";
}

function traceNextStepTone(row: AgentThreadTraceRow) {
  const meta = row.meta || [];
  const text = `${row.kind}\n${row.status}\n${row.detail}\n${meta.join("\n")}`.toLowerCase();
  if (row.kind === "approvals" || text.includes("approval") || text.includes("审批")) return "approval";
  if (row.kind === "diffs" || text.includes("diff") || text.includes("hunk")) return "diff";
  if (ISSUE_LOG_STATUSES.has(row.status) || /error|failed|失败|错误|blocked|阻塞|denied|拒绝/.test(text)) return "issue";
  if (ACTIVE_LOG_STATUSES.has(row.status) || /pending|queued|running/.test(text)) return "active";
  return "ready";
}

function formatTime(value: number) {
  if (!value) return "未刷新";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export interface WorkbenchToolTracePanelProps {
  rows: AgentThreadTraceRow[];
  toolCount: number;
  gatewayCount: number;
  approvalCount: number;
  reportCount: number;
}

export function WorkbenchToolTracePanel({
  rows,
  toolCount,
  gatewayCount,
  approvalCount,
  reportCount,
}: WorkbenchToolTracePanelProps) {
  return (
    <div className="codex-side-card codex-runtime-tools rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-slate-200">工具轨迹</span>
        <span className="text-[9px] text-slate-600">{rows.length ? `${rows.length} 条` : "等待工具请求"}</span>
      </div>
      <div className="codex-toolchain-strip mt-2" data-testid="home-toolchain-strip">
        {[
          { label: "请求", count: toolCount },
          { label: "网关", count: gatewayCount },
          { label: "审批", count: approvalCount },
          { label: "报告", count: reportCount },
        ].map((step, index) => (
          <div key={`home-toolchain-${step.label}`} className="codex-toolchain-step">
            <span className="codex-toolchain-dot">{index + 1}</span>
            <span className="codex-toolchain-label">{step.label}</span>
            <span className="codex-toolchain-count">{step.count}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid gap-1.5">
        {rows.slice(0, 4).map((entry) => {
          const nextStep = traceNextStepForRow(entry);
          const nextStepTone = traceNextStepTone(entry);
          const visibleDetail = traceDetailWithoutNextStep(entry.detail);
          const meta = prioritizedTraceMeta(entry.meta || []);
          return (
            <div key={`home-tool-trace-${entry.id}`} className="codex-side-row codex-tool-row rounded border border-slate-800 bg-slate-950/70 px-2 py-2" data-testid="home-tool-trace-row">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-medium text-slate-100">{entry.title}</span>
                <StatusBadge status={entry.status} />
              </div>
              <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{visibleDetail}</div>
              <div
                className="codex-trace-next-step mt-1.5"
                data-testid="home-tool-trace-next-step"
                data-next-step-tone={nextStepTone}
              >
                <span className="codex-trace-next-label">下一步</span>
                <span className="codex-trace-next-copy">{nextStep}</span>
              </div>
              {meta.length > 0 && (
                <div className="mt-1 flex min-w-0 flex-wrap gap-1" data-testid="home-tool-trace-meta">
                  {meta.slice(0, 3).map((item) => (
                    <span key={`${entry.id}-${item}`} className="max-w-full truncate rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[9px] text-slate-500" title={item}>
                      {formatTraceMetaChip(item)}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-slate-600">
                <span className="truncate">{entry.source || "Tool Trace"}</span>
                <span>{formatTime(entry.at)}</span>
              </div>
            </div>
          );
        })}
        {!rows.length && <EmptyBlock text="模型发起工具请求后，会在这里显示执行链路" />}
      </div>
    </div>
  );
}

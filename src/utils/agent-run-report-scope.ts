export interface RunReportScopeArtifactLike {
  id: string;
  threadId: string;
  threadTitle?: string;
  createdAt?: number;
}

export interface RunReportScopeThreadLike {
  id: string;
  title?: string;
  workspaceId?: string | null;
  workspaceTitle?: string;
  workspaceDomain?: string;
}

export interface RunReportScopeWorkspaceLike {
  id: string;
  title?: string;
  domain?: string;
}

export type RunReportAttachStatus = "attachable" | "missing_thread" | "thread_mismatch";

export interface RunReportAttachPlan {
  ok: boolean;
  status: RunReportAttachStatus;
  detail: string;
  reportId: string;
  reportThreadId: string;
  activeThreadId: string;
}

export interface RunReportWorkspaceScope {
  workspaceTitle: string;
  workspaceDomain: string;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function filterRunReportsForThread<T extends RunReportScopeArtifactLike>(reports: T[] = [], threadId = "") {
  const activeThreadId = asString(threadId);
  if (!activeThreadId) return [];
  return reports.filter((report) => report.threadId === activeThreadId);
}

export function latestRunReportForThread<T extends RunReportScopeArtifactLike>(reports: T[] = [], threadId = "") {
  return filterRunReportsForThread(reports, threadId)[0] || null;
}

export function planRunReportAttachToThread(
  report: RunReportScopeArtifactLike,
  activeThread: RunReportScopeThreadLike | null | undefined,
): RunReportAttachPlan {
  const reportThreadId = asString(report.threadId);
  const activeThreadId = asString(activeThread?.id);
  if (!activeThreadId) {
    return {
      ok: false,
      status: "missing_thread",
      detail: "当前没有可挂入的对话线程。",
      reportId: report.id,
      reportThreadId,
      activeThreadId,
    };
  }
  if (reportThreadId && reportThreadId !== activeThreadId) {
    return {
      ok: false,
      status: "thread_mismatch",
      detail: `报告属于线程「${report.threadTitle || reportThreadId}」，当前线程是「${activeThread?.title || activeThreadId}」。请切回对应线程后再挂入，避免上下文串线。`,
      reportId: report.id,
      reportThreadId,
      activeThreadId,
    };
  }
  return {
    ok: true,
    status: "attachable",
    detail: "运行报告可挂入当前线程上下文。",
    reportId: report.id,
    reportThreadId,
    activeThreadId,
  };
}

export function resolveRunReportWorkspaceScope(
  thread: RunReportScopeThreadLike,
  workspaces: RunReportScopeWorkspaceLike[] = [],
): RunReportWorkspaceScope {
  const workspaceId = asString(thread.workspaceId);
  const boundWorkspace = workspaceId
    ? workspaces.find((workspace) => workspace.id === workspaceId) || null
    : null;
  return {
    workspaceTitle: asString(thread.workspaceTitle) || asString(boundWorkspace?.title) || "未绑定工作区",
    workspaceDomain: asString(thread.workspaceDomain) || asString(boundWorkspace?.domain) || "未指定",
  };
}

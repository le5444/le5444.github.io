export type AgentLoopResumeStatus = "waiting_approval" | "waiting_review" | "approval_decided" | "resumed";

export interface AgentLoopResumeSnapshotLike {
  task: string;
  approvalIds: string[];
  reviewIds?: string[];
  decidedApprovalIds?: string[];
  status: AgentLoopResumeStatus;
  detail: string;
  at: number;
}

export interface AgentLoopPendingApprovalLike {
  approvalId: string;
}

export interface AgentLoopPendingReviewLike {
  reviewId: string;
}

export function agentLoopResumeAfterRunResult(input: {
  task: string;
  previous?: AgentLoopResumeSnapshotLike | null;
  success: boolean;
  stopReason: string;
  pendingApprovals: AgentLoopPendingApprovalLike[];
  pendingReviews?: AgentLoopPendingReviewLike[];
  detail: string;
  at: number;
}): AgentLoopResumeSnapshotLike | null {
  const approvalIds = input.pendingApprovals.map((approval) => approval.approvalId).filter(Boolean);
  const reviewIds = (input.pendingReviews || []).map((review) => review.reviewId).filter(Boolean);
  if (input.stopReason === "approval_required" && (approvalIds.length || reviewIds.length)) {
    return {
      task: input.task,
      approvalIds,
      reviewIds,
      decidedApprovalIds: [],
      status: reviewIds.length ? "waiting_review" : "waiting_approval",
      detail: input.detail,
      at: input.at,
    };
  }
  if (input.success) {
    return {
      task: input.task,
      approvalIds: [],
      reviewIds: [],
      status: "resumed",
      detail: "Agent Loop 已完成。",
      at: input.at,
    };
  }
  if (input.previous?.status === "approval_decided") {
    return {
      ...input.previous,
      status: "approval_decided",
      detail: input.detail || input.previous.detail,
      at: input.at,
    };
  }
  return null;
}

export function agentLoopResumeAfterApprovalDecision(input: {
  resume: AgentLoopResumeSnapshotLike;
  approvalId: string;
  detail: string;
  at: number;
}): AgentLoopResumeSnapshotLike {
  const approvalIds = Array.from(new Set(input.resume.approvalIds.filter(Boolean)));
  const reviewIds = Array.from(new Set((input.resume.reviewIds || []).filter(Boolean)));
  const decidedApprovalIds = Array.from(new Set([
    ...(input.resume.decidedApprovalIds || []),
    input.approvalId,
  ].filter((id) => id && approvalIds.includes(id))));
  const allDecided = approvalIds.length > 0 && approvalIds.every((id) => decidedApprovalIds.includes(id));
  return {
    ...input.resume,
    approvalIds,
    reviewIds,
    decidedApprovalIds,
    status: allDecided && !reviewIds.length ? "approval_decided" : reviewIds.length ? "waiting_review" : "waiting_approval",
    detail: allDecided
      ? reviewIds.length
        ? `${input.detail}；仍有 ${reviewIds.length} 个 Diff 等待审查。`
        : input.detail
      : `${input.detail}；仍有 ${approvalIds.length - decidedApprovalIds.length} 个审批等待处理。`,
    at: input.at,
  };
}

export function agentLoopResumeAfterReviewSubmitted(input: {
  resume: AgentLoopResumeSnapshotLike;
  approvalIds: string[];
  detail: string;
  at: number;
}): AgentLoopResumeSnapshotLike {
  const approvalIds = Array.from(new Set([
    ...input.resume.approvalIds,
    ...input.approvalIds,
  ].filter(Boolean)));
  const decidedApprovalIds = Array.from(new Set((input.resume.decidedApprovalIds || []).filter((id) => approvalIds.includes(id))));
  const waitingCount = approvalIds.length - decidedApprovalIds.length;
  return {
    ...input.resume,
    approvalIds,
    reviewIds: [],
    decidedApprovalIds,
    status: waitingCount > 0 ? "waiting_approval" : "approval_decided",
    detail: waitingCount > 0
      ? `${input.detail}；等待 ${waitingCount} 个写入审批返回。`
      : input.detail,
    at: input.at,
  };
}

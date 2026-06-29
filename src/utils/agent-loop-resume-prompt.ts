import {
  type AgentLoopApprovalResumeItem,
  buildAgentLoopApprovalResumeEvidenceSummary,
  buildAgentLoopApprovalResumePrompt,
} from "../os/kernel/agent-loop-bridge";

export interface AgentLoopResumeSnapshotForPrompt {
  task: string;
  approvalIds: string[];
  detail: string;
}

export interface AgentLoopApprovalSnapshotForPrompt {
  id: string;
  action?: string;
  status?: string;
  target?: string;
  message?: string;
}

export interface AgentLoopApprovalResumeRecordForPrompt {
  id?: string;
  action?: string;
  status?: string;
  target?: string;
  message?: string;
  request?: Record<string, unknown>;
  result?: Record<string, unknown>;
  decision?: Record<string, unknown>;
}

export interface AgentLoopResumePromptBundle {
  task: string;
  evidenceSummary: string;
  items: AgentLoopApprovalResumeItem[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function recordId(record: AgentLoopApprovalResumeRecordForPrompt) {
  return asString(record.id || asRecord(record.request).approval_id || asRecord(record.result).approval_id || asRecord(record.decision).approval_id);
}

function approvalRecordMap(records: AgentLoopApprovalResumeRecordForPrompt[] = []) {
  const map = new Map<string, AgentLoopApprovalResumeRecordForPrompt>();
  records.forEach((record) => {
    const id = recordId(record);
    if (id) map.set(id, record);
  });
  return map;
}

function mergeApprovalRecordPart(primary: unknown, fallback: unknown) {
  const primaryRecord = asRecord(primary);
  const fallbackRecord = asRecord(fallback);
  const merged: Record<string, unknown> = { ...fallbackRecord, ...primaryRecord };
  const fallbackApprovalDecide = asRecord(fallbackRecord.approval_decide);
  const primaryApprovalDecide = asRecord(primaryRecord.approval_decide);
  if (Object.keys(fallbackApprovalDecide).length || Object.keys(primaryApprovalDecide).length) {
    merged.approval_decide = {
      ...fallbackApprovalDecide,
      ...primaryApprovalDecide,
      decision: {
        ...asRecord(fallbackApprovalDecide.decision),
        ...asRecord(primaryApprovalDecide.decision),
      },
    };
  }
  return merged;
}

function approvalSnapshotMap(snapshots: AgentLoopApprovalSnapshotForPrompt[] = []) {
  const map = new Map<string, AgentLoopApprovalSnapshotForPrompt>();
  snapshots.forEach((snapshot) => {
    if (snapshot.id) map.set(snapshot.id, snapshot);
  });
  return map;
}

export function buildAgentLoopApprovalResumeItems(params: {
  resume: AgentLoopResumeSnapshotForPrompt;
  liveApprovals?: AgentLoopApprovalResumeRecordForPrompt[];
  snapshots?: AgentLoopApprovalSnapshotForPrompt[];
  records?: AgentLoopApprovalResumeRecordForPrompt[];
}) {
  const liveById = approvalRecordMap(params.liveApprovals);
  const snapshotById = approvalSnapshotMap(params.snapshots);
  const recordById = approvalRecordMap(params.records);
  return params.resume.approvalIds
    .filter(Boolean)
    .map((id): AgentLoopApprovalResumeItem => {
      const live = liveById.get(id);
      const snapshot = snapshotById.get(id);
      const record = recordById.get(id);
      const decision = mergeApprovalRecordPart(record?.decision, live?.decision);
      const result = mergeApprovalRecordPart(record?.result, live?.result);
      const request = mergeApprovalRecordPart(record?.request, live?.request);
      return {
        id,
        action: asString(live?.action, snapshot?.action || asString(request.action, "approval")),
        status: asString(decision.status, asString(live?.status, snapshot?.status || "decided")),
        target: asString(decision.target, asString(live?.target, snapshot?.target || "")),
        message: asString(decision.message, asString(live?.message, snapshot?.message || "")),
        request,
        result,
        decision,
      };
    });
}

export function buildAgentLoopResumePromptBundle(params: {
  resume: AgentLoopResumeSnapshotForPrompt;
  liveApprovals?: AgentLoopApprovalResumeRecordForPrompt[];
  snapshots?: AgentLoopApprovalSnapshotForPrompt[];
  records?: AgentLoopApprovalResumeRecordForPrompt[];
}): AgentLoopResumePromptBundle {
  const items = buildAgentLoopApprovalResumeItems(params);
  const task = buildAgentLoopApprovalResumePrompt({
    task: params.resume.task,
    approvals: items,
    fallbackDetail: params.resume.detail,
  });
  const evidenceSummary = buildAgentLoopApprovalResumeEvidenceSummary({
    approvals: items,
    fallbackDetail: params.resume.detail,
  });
  return { task, evidenceSummary, items };
}

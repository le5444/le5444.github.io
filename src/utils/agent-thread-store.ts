type JsonRecord = Record<string, unknown>;

export type AgentThreadContextKind = "workspace" | "file" | "image" | "memory" | "skill" | "context_pack" | "approval" | "review" | "worker" | "provider" | "instruction" | "report" | "branch";
export type AgentThreadEventKind = "system" | "draft" | "worker" | "approval" | "diff" | "write" | "note";
export type AgentThreadMessageRole = "user" | "assistant" | "system" | "tool";
export type AgentThreadTraceKind = "messages" | "tools" | "approvals" | "diffs" | "workers";
export type AgentThreadRunPhase = "intake" | "context" | "plan" | "execute" | "review" | "blocked";

export interface AgentThreadMessageAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  textPreview?: string;
  parseStatus?: "parsed" | "metadata" | "failed";
  parser?: string;
  warning?: string;
}

export interface AgentThreadEvent {
  id: string;
  kind: AgentThreadEventKind;
  title: string;
  detail: string;
  status: string;
  at: number;
}

export interface AgentThreadMessage {
  id: string;
  role: AgentThreadMessageRole;
  title: string;
  content: string;
  task?: string;
  status: string;
  at: number;
  sourceRef?: string;
  attachments: AgentThreadMessageAttachment[];
}

export interface AgentThreadTraceRow {
  id: string;
  kind: AgentThreadTraceKind;
  label: string;
  title: string;
  detail: string;
  status: string;
  at: number;
  source: string;
  ref?: string;
  meta?: string[];
  nextStep?: string;
}

export interface AgentThreadRunbookStep {
  id: string;
  phase: AgentThreadRunPhase;
  label: string;
  detail: string;
  status: string;
}

export interface AgentThreadRunbook {
  phase: AgentThreadRunPhase;
  phaseLabel: string;
  summary: string;
  nextAction: string;
  blockedBy: string[];
  evidence: string[];
  steps: AgentThreadRunbookStep[];
}

export interface AgentThreadContextAttachment {
  id: string;
  kind: AgentThreadContextKind;
  title: string;
  detail: string;
  ref: string;
  source: string;
  status: string;
  at: number;
}

export interface AgentThreadApprovalSnapshot {
  id: string;
  action: string;
  status: string;
  target: string;
  message: string;
  createdAt: number;
  syncedAt: number;
}

export interface AgentLoopResumeSnapshot {
  task: string;
  approvalIds: string[];
  reviewIds?: string[];
  decidedApprovalIds?: string[];
  status: "waiting_approval" | "waiting_review" | "approval_decided" | "resumed";
  detail: string;
  at: number;
}

export interface AgentThreadRecord {
  id: string;
  title: string;
  task: string;
  status: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
  pinnedAt?: number;
  archivedAt?: number;
  workspaceId?: string | null;
  workspaceTitle?: string;
  workspaceDomain?: string;
  workerJobId?: string;
  approvalCount: number;
  approvalIds: string[];
  approvalSnapshots: AgentThreadApprovalSnapshot[];
  agentLoopResume?: AgentLoopResumeSnapshot;
  diffCount: number;
  events: AgentThreadEvent[];
  messages: AgentThreadMessage[];
  contextAttachments: AgentThreadContextAttachment[];
}

export interface AgentThreadSpacesIndex {
  version: 1;
  migratedFrom?: string;
  updatedAt: number;
  spaces: Record<string, AgentThreadRecord[]>;
}

export interface AgentThreadStorageAdapter {
  loadJSON<T>(key: string, fallback: T): T;
  saveJSON<T>(key: string, value: T): boolean | void;
}

export interface AgentThreadFallbackInput {
  workspaceId?: string | null;
  workspaceTitle?: string;
  workspaceDomain?: string;
}

export interface AgentThreadActionResult {
  threads: AgentThreadRecord[];
  changed: boolean;
  target?: AgentThreadRecord | null;
  nextActiveThreadId?: string | null;
}

export const LEGACY_AGENT_THREADS_KEY = "lumenos-agent-threads";
export const LEGACY_AGENT_THREAD_SPACES_KEY = "lumenos-agent-thread-spaces";
export const AGENT_THREADS_KEY = "zhimeng-agent-threads";
export const AGENT_THREAD_SPACES_KEY = "zhimeng-agent-thread-spaces";
export const AGENT_THREAD_LEGACY_STORAGE_KEYS: Partial<Record<string, string[]>> = {
  [AGENT_THREAD_SPACES_KEY]: [LEGACY_AGENT_THREAD_SPACES_KEY],
};

const VALID_CONTEXT_KINDS: AgentThreadContextKind[] = ["workspace", "file", "image", "memory", "skill", "context_pack", "approval", "review", "worker", "provider", "instruction", "report", "branch"];
const VALID_EVENT_KINDS: AgentThreadEventKind[] = ["system", "draft", "worker", "approval", "diff", "write", "note"];
const VALID_MESSAGE_ROLES: AgentThreadMessageRole[] = ["user", "assistant", "system", "tool"];
const VALID_RESUME_STATUSES: AgentLoopResumeSnapshot["status"][] = ["waiting_approval", "waiting_review", "approval_decided", "resumed"];
const VALID_ATTACHMENT_PARSE_STATUSES: Array<NonNullable<AgentThreadMessageAttachment["parseStatus"]>> = ["parsed", "metadata", "failed"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecordList(value: unknown): JsonRecord[] {
  return asArray(value).map(asRecord).filter((item) => Object.keys(item).length > 0);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function compactThreadTitle(task: string, fallback = "未命名对话线程") {
  const firstLine = publicFacingText(task).replace(/\s+/g, " ").trim();
  if (!firstLine) return fallback;
  return firstLine.length > 36 ? `${firstLine.slice(0, 36)}...` : firstLine;
}

function browserStorageAdapter(): AgentThreadStorageAdapter {
  return {
    loadJSON<T>(key: string, fallback: T): T {
      try {
        if (typeof localStorage === "undefined") return fallback;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
      } catch {
        return fallback;
      }
    },
    saveJSON<T>(key: string, value: T) {
      try {
        if (typeof localStorage === "undefined") return false;
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function loadJSONWithLegacyKeys<T>(
  key: string,
  fallback: T,
  storage: AgentThreadStorageAdapter = browserStorageAdapter(),
  legacyKeys: Partial<Record<string, string[]>> = AGENT_THREAD_LEGACY_STORAGE_KEYS,
): T {
  const current = storage.loadJSON<T | null>(key, null);
  if (current !== null) return current as T;
  for (const legacyKey of legacyKeys[key] || []) {
    const legacy = storage.loadJSON<T | null>(legacyKey, null);
    if (legacy !== null) {
      storage.saveJSON(key, legacy);
      return legacy as T;
    }
  }
  return fallback;
}

export function createAgentThreadMessage(input: {
  role: AgentThreadMessageRole;
  title: string;
  content: string;
  task?: string;
  status?: string;
  at?: number;
  sourceRef?: string;
  attachments?: AgentThreadMessageAttachment[];
}): AgentThreadMessage {
  return {
    id: `message-${uid()}`,
    role: input.role,
    title: input.title,
    content: input.content,
    task: input.task,
    status: input.status || "recorded",
    at: input.at || Date.now(),
    sourceRef: input.sourceRef,
    attachments: input.attachments || [],
  };
}

export function normalizeAgentThreadMessageAttachment(value: unknown): AgentThreadMessageAttachment | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const kind = asString(record.kind, "file");
  const name = asString(record.name);
  const parseStatus = asString(record.parseStatus);
  if (!id || !name) return null;
  return {
    id,
    kind: kind === "image" ? "image" : "file",
    name,
    mimeType: asString(record.mimeType, "application/octet-stream"),
    size: asNumber(record.size),
    dataUrl: asString(record.dataUrl) || undefined,
    textPreview: asString(record.textPreview) || undefined,
    parseStatus: VALID_ATTACHMENT_PARSE_STATUSES.includes(parseStatus as NonNullable<AgentThreadMessageAttachment["parseStatus"]>)
      ? parseStatus as AgentThreadMessageAttachment["parseStatus"]
      : undefined,
    parser: asString(record.parser) || undefined,
    warning: asString(record.warning) || undefined,
  };
}

export function createAgentThreadContextAttachment(input: {
  kind: AgentThreadContextKind;
  title: string;
  detail: string;
  ref: string;
  source?: string;
  status?: string;
  at?: number;
}): AgentThreadContextAttachment {
  return {
    id: `context-${uid()}`,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    ref: input.ref,
    source: input.source || "thread",
    status: input.status || "attached",
    at: input.at || Date.now(),
  };
}

export function normalizeAgentThreadContextAttachment(value: unknown): AgentThreadContextAttachment | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const kind = asString(record.kind, "context_pack");
  if (!id) return null;
  const normalizedKind: AgentThreadContextKind = VALID_CONTEXT_KINDS.includes(kind as AgentThreadContextKind) ? kind as AgentThreadContextKind : "context_pack";
  return {
    id,
    kind: normalizedKind,
    title: publicFacingText(asString(record.title, "上下文附件")),
    detail: publicFacingText(asString(record.detail)),
    ref: asString(record.ref, id),
    source: publicFacingText(asString(record.source, "thread")),
    status: asString(record.status, "attached"),
    at: asNumber(record.at, Date.now()),
  };
}

export function approvalSnapshotFromRecord(value: unknown, syncedAt = Date.now()): AgentThreadApprovalSnapshot | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    action: asString(record.action, "approval"),
    status: asString(record.status, "pending"),
    target: publicFacingText(asString(record.target, "未声明目标")),
    message: publicFacingText(asString(record.message, "等待人工复核。")),
    createdAt: asNumber(record.created_at, asNumber(record.createdAt, syncedAt)),
    syncedAt,
  };
}

export function mergeAgentThreadApprovalSnapshots(
  existing: AgentThreadApprovalSnapshot[],
  incoming: AgentThreadApprovalSnapshot[],
) {
  const byId = new Map<string, AgentThreadApprovalSnapshot>();
  existing.forEach((item) => byId.set(item.id, item));
  incoming.forEach((item) => {
    const previous = byId.get(item.id);
    byId.set(item.id, previous ? { ...previous, ...item } : item);
  });
  return Array.from(byId.values()).sort((a, b) => b.syncedAt - a.syncedAt).slice(0, 32);
}

export function mergeAgentThreadContextAttachments(
  existing: AgentThreadContextAttachment[],
  incoming: AgentThreadContextAttachment[],
) {
  const merged = [...incoming, ...existing];
  const seen = new Set<string>();
  return merged.filter((item) => {
    const key = `${item.kind}:${item.ref || item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.at - a.at).slice(0, 24);
}

export function threadMessageRoleFromEvent(kind: AgentThreadEventKind): AgentThreadMessageRole {
  if (kind === "draft") return "assistant";
  if (kind === "worker" || kind === "approval" || kind === "diff" || kind === "write") return "tool";
  return "system";
}

function prependThreadEvent(
  thread: AgentThreadRecord,
  event: Omit<AgentThreadEvent, "id" | "at"> & { at?: number },
) {
  const at = event.at || Date.now();
  return [{
    id: `event-${uid()}`,
    kind: event.kind,
    title: event.title,
    detail: event.detail,
    status: event.status,
    at,
  }, ...thread.events].slice(0, 24);
}

export function normalizeAgentThreadMessage(value: unknown): AgentThreadMessage | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const role = asString(record.role, "system");
  if (!id) return null;
  const attachments = asRecordList(record.attachments)
    .map(normalizeAgentThreadMessageAttachment)
    .filter((item): item is AgentThreadMessageAttachment => Boolean(item))
    .slice(0, 8);
  return {
    id,
    role: VALID_MESSAGE_ROLES.includes(role as AgentThreadMessageRole) ? role as AgentThreadMessageRole : "system",
    title: publicFacingText(asString(record.title, "线程消息")),
    content: publicFacingText(asString(record.content, asString(record.detail, ""))),
    task: publicFacingText(asString(record.task)) || undefined,
    status: asString(record.status, "recorded"),
    at: asNumber(record.at, Date.now()),
    sourceRef: asString(record.sourceRef),
    attachments,
  };
}

export function createAgentThreadRecord(input: {
  title?: string;
  task?: string;
  status?: string;
  summary?: string;
  workspaceId?: string | null;
  workspaceTitle?: string;
  workspaceDomain?: string;
} = {}): AgentThreadRecord {
  const now = Date.now();
  const task = input.task !== undefined ? input.task.trim() : input.title || "继续完善织梦写作台";
  const summary = input.summary || "线程已创建，等待上下文包、后台任务复核和审批记录。";
  const messages = [
    createAgentThreadMessage({
      role: "system",
      title: "线程创建",
      content: summary,
      status: input.status || "current",
      at: now,
    }),
    ...(task ? [createAgentThreadMessage({
      role: "user",
      title: "目标任务",
      content: task,
      status: "current",
      at: now + 1,
    })] : []),
  ];
  return {
    id: `thread-${uid()}`,
    title: input.title || compactThreadTitle(task, "当前目标：织梦写作台"),
    task,
    status: input.status || "current",
    summary,
    createdAt: now,
    updatedAt: now,
    workspaceId: input.workspaceId ?? null,
    workspaceTitle: input.workspaceTitle,
    workspaceDomain: input.workspaceDomain,
    approvalCount: 0,
    approvalIds: [],
    approvalSnapshots: [],
    agentLoopResume: undefined,
    diffCount: 0,
    events: [{
      id: `event-${uid()}`,
      kind: "system",
      title: "线程创建",
      detail: summary || "已进入对话线程，可恢复任务、绑定工作区并沉淀审批轨迹。",
      status: input.status || "current",
      at: now,
    }],
    messages,
    contextAttachments: [
      ...(input.workspaceId ? [createAgentThreadContextAttachment({
        kind: "workspace",
        title: input.workspaceTitle || "当前工作区",
        detail: input.workspaceDomain || "已绑定工作区上下文。",
        ref: input.workspaceId,
        source: "workspace",
        status: "bound",
        at: now,
      })] : []),
    ],
  };
}

export function normalizeAgentThreadRecord(value: unknown): AgentThreadRecord | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  const now = Date.now();
  const events = asRecordList(record.events).map((event) => {
    const kind = asString(event.kind, "note");
    return {
      id: asString(event.id, `event-${uid()}`),
      kind: VALID_EVENT_KINDS.includes(kind as AgentThreadEventKind) ? kind as AgentThreadEventKind : "note",
      title: publicFacingText(asString(event.title, "线程事件")),
      detail: publicFacingText(asString(event.detail, asString(event.summary, ""))),
      status: asString(event.status, "recorded"),
      at: asNumber(event.at, now),
    };
  }).slice(0, 24);
  const messages = asRecordList(record.messages)
    .map(normalizeAgentThreadMessage)
    .filter((message): message is AgentThreadMessage => Boolean(message))
    .sort((a, b) => a.at - b.at)
    .slice(-36);
  const fallbackMessages = [
    createAgentThreadMessage({
      role: "system",
      title: "线程恢复",
      content: asString(record.summary, "从本地记录恢复对话线程。"),
      status: "restored",
      at: now,
    }),
    ...(asString(record.task) ? [createAgentThreadMessage({
      role: "user",
      title: "目标任务",
      content: asString(record.task),
      status: asString(record.status, "current"),
      at: now + 1,
    })] : []),
    ...events.slice().reverse().slice(-10).map((event) => createAgentThreadMessage({
      role: threadMessageRoleFromEvent(event.kind),
      title: event.title,
      content: event.detail,
      status: event.status,
      at: event.at,
    })),
  ].sort((a, b) => a.at - b.at).slice(-36);
  const contextAttachments = asRecordList(record.contextAttachments)
    .map(normalizeAgentThreadContextAttachment)
    .filter((item): item is AgentThreadContextAttachment => Boolean(item))
    .sort((a, b) => b.at - a.at)
    .slice(0, 24);
  const approvalIds = Array.from(new Set([
    ...asArray(record.approvalIds).map((item) => String(item)).filter(Boolean),
    ...events.flatMap((event) => {
      const match = event.detail.match(/approval\s+([A-Za-z0-9_.:-]+)/i);
      return match?.[1] ? [match[1]] : [];
    }),
  ]));
  const approvalSnapshots = asRecordList(record.approvalSnapshots)
    .map((item) => approvalSnapshotFromRecord(item))
    .filter((item): item is AgentThreadApprovalSnapshot => Boolean(item));
  const resumeRecord = asRecord(record.agentLoopResume);
  const resumeTask = publicFacingText(asString(resumeRecord.task));
  const resumeApprovalIds = asArray(resumeRecord.approvalIds).map((item) => String(item)).filter(Boolean).slice(0, 12);
  const resumeReviewIds = asArray(resumeRecord.reviewIds).map((item) => String(item)).filter(Boolean).slice(0, 12);
  const resumeDecidedApprovalIds = asArray(resumeRecord.decidedApprovalIds).map((item) => String(item)).filter(Boolean).slice(0, 12);
  const resumeStatus = asString(resumeRecord.status);
  const agentLoopResume = resumeTask && VALID_RESUME_STATUSES.includes(resumeStatus as AgentLoopResumeSnapshot["status"])
    ? {
        task: resumeTask,
        approvalIds: resumeApprovalIds,
        reviewIds: resumeReviewIds,
        decidedApprovalIds: resumeDecidedApprovalIds,
        status: resumeStatus as AgentLoopResumeSnapshot["status"],
        detail: publicFacingText(asString(resumeRecord.detail, "Agent Loop 可继续。")),
        at: asNumber(resumeRecord.at, now),
      }
    : undefined;
  return {
    id,
    title: publicFacingText(asString(record.title, "未命名对话线程")),
    task: publicFacingText(asString(record.task, asString(record.title, ""))),
    status: asString(record.status, "current"),
    summary: publicFacingText(asString(record.summary, "")),
    createdAt: asNumber(record.createdAt, now),
    updatedAt: asNumber(record.updatedAt, now),
    pinnedAt: asNumber(record.pinnedAt, 0) || undefined,
    archivedAt: asNumber(record.archivedAt, 0) || undefined,
    workspaceId: asString(record.workspaceId) || null,
    workspaceTitle: publicFacingText(asString(record.workspaceTitle)),
    workspaceDomain: publicFacingText(asString(record.workspaceDomain)),
    workerJobId: asString(record.workerJobId),
    approvalCount: Math.max(asNumber(record.approvalCount), approvalIds.length),
    approvalIds,
    approvalSnapshots,
    agentLoopResume,
    diffCount: asNumber(record.diffCount),
    events: events.length ? events : [{
      id: `event-${uid()}`,
      kind: "system",
      title: "线程恢复",
      detail: "从本地记录恢复对话线程。",
      status: "restored",
      at: now,
    }],
    messages: messages.length ? messages : fallbackMessages,
    contextAttachments,
  };
}

export function agentThreadSpaceKey(workspaceId?: string | null) {
  return workspaceId ? `workspace:${workspaceId}` : "unbound";
}

export function agentThreadSpaceLabel(spaceKey: string, workspaces: Array<{ book?: { id: string }; id?: string; title: string }>) {
  if (spaceKey === "unbound") return "自由对话";
  const workspaceId = spaceKey.replace(/^workspace:/, "");
  return workspaces.find((item) => (item.book?.id || item.id) === workspaceId)?.title || workspaceId || "未知项目";
}

export function buildAgentThreadSpacesIndex(threads: AgentThreadRecord[], migratedFrom?: string): AgentThreadSpacesIndex {
  const spaces: Record<string, AgentThreadRecord[]> = {};
  threads.forEach((thread) => {
    const key = agentThreadSpaceKey(thread.workspaceId);
    spaces[key] = [...(spaces[key] || []), thread];
  });
  Object.keys(spaces).forEach((key) => {
    spaces[key] = spaces[key].sort((a, b) => b.updatedAt - a.updatedAt);
  });
  return {
    version: 1,
    migratedFrom,
    updatedAt: Date.now(),
    spaces,
  };
}

export function normalizeAgentThreadSpacesIndex(value: unknown): AgentThreadSpacesIndex | null {
  const record = asRecord(value);
  const spacesRecord = asRecord(record.spaces);
  const spaces: Record<string, AgentThreadRecord[]> = {};
  Object.entries(spacesRecord).forEach(([key, rawThreads]) => {
    const threads = asArray(rawThreads)
      .map(normalizeAgentThreadRecord)
      .filter((thread): thread is AgentThreadRecord => Boolean(thread));
    if (threads.length) spaces[key || "unbound"] = threads.sort((a, b) => b.updatedAt - a.updatedAt);
  });
  if (!Object.keys(spaces).length) return null;
  return {
    version: 1,
    migratedFrom: asString(record.migratedFrom),
    updatedAt: asNumber(record.updatedAt, Date.now()),
    spaces,
  };
}

export function flattenAgentThreadSpaces(index: AgentThreadSpacesIndex) {
  return Object.values(index.spaces).flat().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function archiveAgentThreadRecord(
  threads: AgentThreadRecord[],
  threadId: string,
  now = Date.now(),
): AgentThreadActionResult {
  const target = threads.find((thread) => thread.id === threadId) || null;
  if (!target) return { threads, changed: false, target: null };
  return {
    target,
    changed: true,
    threads: threads.map((thread) => thread.id === threadId
      ? {
          ...thread,
          status: "archived",
          archivedAt: now,
          updatedAt: now,
          events: prependThreadEvent(thread, {
            kind: "system",
            title: "线程归档",
            detail: "线程已归档，保留历史事件和审批摘要。",
            status: "archived",
            at: now,
          }),
        }
      : thread),
  };
}

export function restoreAgentThreadRecord(
  threads: AgentThreadRecord[],
  threadId: string,
  now = Date.now(),
): AgentThreadActionResult {
  const target = threads.find((thread) => thread.id === threadId) || null;
  if (!target) return { threads, changed: false, target: null };
  return {
    target,
    changed: true,
    nextActiveThreadId: threadId,
    threads: threads.map((thread) => thread.id === threadId
      ? {
          ...thread,
          status: "current",
          archivedAt: undefined,
          updatedAt: now,
          events: prependThreadEvent(thread, {
            kind: "system",
            title: "线程恢复",
            detail: "线程已恢复为可继续执行状态。",
            status: "current",
            at: now,
          }),
        }
      : thread),
  };
}

export function togglePinAgentThreadRecord(
  threads: AgentThreadRecord[],
  threadId: string,
  now = Date.now(),
): AgentThreadActionResult {
  const target = threads.find((thread) => thread.id === threadId) || null;
  if (!target) return { threads, changed: false, target: null };
  const nextPinnedAt = target.pinnedAt ? undefined : now;
  return {
    target,
    changed: true,
    threads: threads.map((thread) => thread.id === threadId
      ? {
          ...thread,
          pinnedAt: nextPinnedAt,
          updatedAt: now,
          events: prependThreadEvent(thread, {
            kind: "system",
            title: nextPinnedAt ? "线程置顶" : "取消置顶",
            detail: nextPinnedAt ? "线程已固定在左侧对话列表顶部。" : "线程已取消置顶。",
            status: nextPinnedAt ? "pinned" : "unpinned",
            at: now,
          }),
        }
      : thread),
  };
}

export function renameAgentThreadRecord(
  threads: AgentThreadRecord[],
  threadId: string,
  nextTitleInput: string,
  now = Date.now(),
): AgentThreadActionResult {
  const target = threads.find((thread) => thread.id === threadId) || null;
  if (!target) return { threads, changed: false, target: null };
  const nextTitle = publicFacingText(nextTitleInput.trim());
  if (!nextTitle || nextTitle === target.title) return { threads, changed: false, target };
  return {
    target,
    changed: true,
    threads: threads.map((thread) => thread.id === threadId
      ? {
          ...thread,
          title: nextTitle,
          updatedAt: now,
          events: prependThreadEvent(thread, {
            kind: "system",
            title: "线程重命名",
            detail: `已重命名为「${nextTitle}」。`,
            status: "renamed",
            at: now,
          }),
        }
      : thread),
  };
}

function preferredThreadAfterDelete(
  remaining: AgentThreadRecord[],
  deleted: AgentThreadRecord,
  activeThreadId?: string | null,
) {
  if (activeThreadId && activeThreadId !== deleted.id && remaining.some((thread) => thread.id === activeThreadId)) {
    return activeThreadId;
  }
  const visible = remaining.filter((thread) => !thread.archivedAt);
  const sameWorkspace = visible.find((thread) => (thread.workspaceId || null) === (deleted.workspaceId || null));
  return sameWorkspace?.id || visible[0]?.id || remaining[0]?.id || null;
}

export function deleteAgentThreadRecord(
  threads: AgentThreadRecord[],
  threadId: string,
  fallback: AgentThreadFallbackInput = {},
  activeThreadId?: string | null,
): AgentThreadActionResult {
  const target = threads.find((thread) => thread.id === threadId) || null;
  if (!target) return { threads, changed: false, target: null };
  let nextThreads = threads.filter((thread) => thread.id !== threadId);
  if (!nextThreads.length) {
    nextThreads = [createAgentThreadRecord(fallback)];
  }
  return {
    target,
    changed: true,
    nextActiveThreadId: preferredThreadAfterDelete(nextThreads, target, activeThreadId),
    threads: nextThreads,
  };
}

export function loadAgentThreads(storage: AgentThreadStorageAdapter = browserStorageAdapter()) {
  const spacesIndex = normalizeAgentThreadSpacesIndex(
    loadJSONWithLegacyKeys<unknown>(AGENT_THREAD_SPACES_KEY, null, storage),
  );
  if (spacesIndex) {
    const threads = flattenAgentThreadSpaces(spacesIndex);
    if (threads.length) return threads;
  }

  const currentFlat = storage.loadJSON<unknown[] | null>(AGENT_THREADS_KEY, null);
  const legacyFlat = currentFlat ? null : storage.loadJSON<unknown[] | null>(LEGACY_AGENT_THREADS_KEY, null);
  const legacyThreads = (currentFlat || legacyFlat || [])
    .map(normalizeAgentThreadRecord)
    .filter((thread): thread is AgentThreadRecord => Boolean(thread))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (legacyThreads.length) {
    storage.saveJSON(
      AGENT_THREAD_SPACES_KEY,
      buildAgentThreadSpacesIndex(legacyThreads, currentFlat ? AGENT_THREADS_KEY : LEGACY_AGENT_THREADS_KEY),
    );
    return legacyThreads;
  }

  const threads = [createAgentThreadRecord()];
  storage.saveJSON(AGENT_THREAD_SPACES_KEY, buildAgentThreadSpacesIndex(threads, "initial"));
  return threads.length ? threads : [createAgentThreadRecord()];
}

export function persistAgentThreads(
  threads: AgentThreadRecord[],
  storage: AgentThreadStorageAdapter = browserStorageAdapter(),
) {
  storage.saveJSON(AGENT_THREAD_SPACES_KEY, {
    ...buildAgentThreadSpacesIndex(threads),
    updatedAt: Date.now(),
  });
  storage.saveJSON(AGENT_THREADS_KEY, threads);
}

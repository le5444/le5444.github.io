import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Download,
  FileText,
  FolderKanban,
  GitBranch,
  HardDrive,
  Layers,
  Library,
  Link as LinkIcon,
  ListChecks,
  MessageSquare,
  Network,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelsTopLeft,
  Plus,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Search,
  Send,
  Timer,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { prompts } from "../data/prompts";
import {
  PROVIDER_LABELS,
  PROVIDER_PRESETS,
  allowsEmptyApiKey,
  inferProvider,
  type ApiSettings,
  isConfigured,
} from "../store/settings";
import { type BookProject, type LibraryState } from "../store/library";
import { type PromptTemplate } from "../store/workspace";
import { htmlToPlainText, loadJSON, saveJSON, uid, wordCount } from "../utils/helpers";

type JsonRecord = Record<string, unknown>;

interface ControlCenterState {
  loading: boolean;
  online: boolean;
  error: string;
  refreshedAt: number;
  health: JsonRecord | null;
  provider: JsonRecord | null;
  memory: JsonRecord | null;
  skill: JsonRecord | null;
  worker: JsonRecord | null;
  approval: JsonRecord | null;
  phase: JsonRecord | null;
  completion: JsonRecord | null;
}

interface ToolMatrixItem {
  action: string;
  label: string;
  enabled: boolean;
  mode: string;
  gatewayFlag: string;
  requestGate: string;
  scope: string;
}

interface ProviderActionSnapshot {
  label: string;
  action: string;
  status: string;
  detail: string;
  data: JsonRecord | null;
  at: number;
}

interface ApprovalDecisionSnapshot {
  approvalId: string;
  decision: "reject" | "execute" | "";
  status: string;
  detail: string;
  at: number;
  request: JsonRecord | null;
  result: JsonRecord | null;
}

interface TerminalCommandSnapshot {
  command: string;
  status: string;
  detail: string;
  at: number;
  request: JsonRecord | null;
  result: JsonRecord | null;
}

interface CommandDraftSnapshot {
  task: string;
  status: string;
  detail: string;
  at: number;
  contextItems: JsonRecord[];
  threadContextItems: JsonRecord[];
  activeSkillKeys: string[];
  excludedToolScopes: string[];
  toolPlan: Array<{ label: string; status: string; detail: string }>;
  data: JsonRecord | null;
}

interface CommandWorkerSnapshot {
  status: string;
  detail: string;
  at: number;
  jobId: string;
  request: JsonRecord | null;
  result: JsonRecord | null;
}

interface AgentModelWorkerSnapshot extends CommandWorkerSnapshot {
  mode: "preview" | "run" | "";
}

interface CommandApprovalSnapshot {
  status: string;
  decision: string;
  detail: string;
  at: number;
  planItems: Array<{ label: string; status: string; detail: string }>;
  request: JsonRecord | null;
  proposal: JsonRecord | null;
  writeRequest: JsonRecord | null;
  writeResult: JsonRecord | null;
}

interface CommandDiffHunk {
  id: string;
  title: string;
  status: "pending" | "accepted" | "rejected";
  content: string;
}

interface ChangeFileRow {
  id: string;
  title: string;
  path: string;
  status: string;
  detail: string;
  hunks: CommandDiffHunk[];
  accepted: number;
  rejected: number;
  pending: number;
  workspaceFileId?: string;
}

type MemoryKind = "L1" | "L2";
type MemoryKindFilter = "all" | MemoryKind;
type MemoryDraftKind = "update" | "freeze" | "delete";

interface MemoryManagerRow {
  id: string;
  kind: MemoryKind;
  record: JsonRecord;
  dimension: string;
  source: string;
  summary: string;
  tags: string[];
  at: unknown;
  searchable: string;
}

interface MemoryDraftActionSnapshot {
  kind: MemoryDraftKind;
  title: string;
  status: string;
  detail: string;
  at: number;
  memoryId: string;
  memoryKind: MemoryKind;
  request: JsonRecord | null;
  result: JsonRecord | null;
}

interface SpecProtocolDraftFile {
  path: string;
  title: string;
  kind: "spec" | "steering" | "hook";
  content: string;
}

interface SpecProtocolDraftSnapshot {
  status: string;
  detail: string;
  at: number;
  files: SpecProtocolDraftFile[];
  request: JsonRecord | null;
  result: JsonRecord | null;
}

type DetailTab = "overview" | "memory" | "skills" | "providers" | "workers";
type WorkbenchView = "agent" | "workspaces" | "memory" | "skills" | "tools" | "providers" | "workers" | "automation" | "writing";
type BottomPanelTab = "terminal" | "output" | "problems" | "workers" | "gateway" | "approvals";
type RuntimeLogChannel = "terminal" | "output" | "problems" | "workers" | "gateway" | "approvals";
type RuntimeLogStatusFilter = "all" | "issues" | "active";
type RuntimeLogExportFormat = "jsonl" | "markdown";
type ApprovalDetailTab = "proposal" | "request" | "result" | "decision";
type AgentThreadScope = "current_workspace" | "all_workspaces" | "unbound";
type AgentThreadContextKind = "workspace" | "file" | "memory" | "skill" | "context_pack" | "approval" | "worker";
type AgentThreadEventKind = "system" | "draft" | "worker" | "approval" | "diff" | "write" | "note";
type AgentThreadMessageRole = "user" | "assistant" | "system" | "tool";
type WorkbenchPartKey = "activityBarVisible" | "primarySidebarVisible" | "secondarySidebarVisible" | "bottomPanelVisible" | "statusbarVisible";

interface WorkbenchLayoutState {
  version: 1;
  activeView: WorkbenchView;
  detailTab: DetailTab;
  bottomPanelTab: BottomPanelTab;
  activityBarVisible: boolean;
  primarySidebarVisible: boolean;
  secondarySidebarVisible: boolean;
  bottomPanelVisible: boolean;
  statusbarVisible: boolean;
  runtimeLogFilter: string;
  runtimeLogStatusFilter: RuntimeLogStatusFilter;
  runtimeLogExportFormat: RuntimeLogExportFormat;
  agentThreadSearch: string;
  agentThreadScope: AgentThreadScope;
  updatedAt: number;
}

interface AgentThreadEvent {
  id: string;
  kind: AgentThreadEventKind;
  title: string;
  detail: string;
  status: string;
  at: number;
}

interface AgentThreadMessage {
  id: string;
  role: AgentThreadMessageRole;
  title: string;
  content: string;
  status: string;
  at: number;
  sourceRef?: string;
}

interface AgentThreadContextAttachment {
  id: string;
  kind: AgentThreadContextKind;
  title: string;
  detail: string;
  ref: string;
  source: string;
  status: string;
  at: number;
}

interface AgentThreadApprovalSnapshot {
  id: string;
  action: string;
  status: string;
  target: string;
  message: string;
  createdAt: number;
  syncedAt: number;
}

interface AgentThreadRecord {
  id: string;
  title: string;
  task: string;
  status: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  workspaceId?: string | null;
  workspaceTitle?: string;
  workspaceDomain?: string;
  workerJobId?: string;
  approvalCount: number;
  approvalIds: string[];
  approvalSnapshots: AgentThreadApprovalSnapshot[];
  diffCount: number;
  events: AgentThreadEvent[];
  messages: AgentThreadMessage[];
  contextAttachments: AgentThreadContextAttachment[];
}

interface AgentThreadSpacesIndex {
  version: 1;
  migratedFrom?: string;
  updatedAt: number;
  spaces: Record<string, AgentThreadRecord[]>;
}

interface RuntimeLogEntry {
  id: string;
  channel: RuntimeLogChannel;
  title: string;
  detail: string;
  status: string;
  at: number;
}

const GATEWAY_ORIGIN = "http://127.0.0.1:8765";
const AGENT_THREADS_KEY = "lumenos-agent-threads";
const AGENT_THREAD_SPACES_KEY = "lumenos-agent-thread-spaces";
const RUNTIME_LOGS_KEY = "lumenos-runtime-logs";
const WORKBENCH_LAYOUT_KEY = "lumenos-workbench-layout";
const INITIAL_STATE: ControlCenterState = {
  loading: false,
  online: false,
  error: "",
  refreshedAt: 0,
  health: null,
  provider: null,
  memory: null,
  skill: null,
  worker: null,
  approval: null,
  phase: null,
  completion: null,
};
const WORKBENCH_VIEWS: WorkbenchView[] = ["agent", "workspaces", "memory", "skills", "tools", "providers", "workers", "automation", "writing"];
const DETAIL_TABS: DetailTab[] = ["overview", "memory", "skills", "providers", "workers"];
const BOTTOM_PANEL_TABS: BottomPanelTab[] = ["terminal", "output", "problems", "workers", "gateway", "approvals"];
const RUNTIME_LOG_STATUS_FILTERS: RuntimeLogStatusFilter[] = ["all", "issues", "active"];
const RUNTIME_LOG_EXPORT_FORMATS: RuntimeLogExportFormat[] = ["jsonl", "markdown"];
const AGENT_THREAD_SCOPES: AgentThreadScope[] = ["current_workspace", "all_workspaces", "unbound"];
const DEFAULT_WORKBENCH_LAYOUT_STATE: WorkbenchLayoutState = {
  version: 1,
  activeView: "agent",
  detailTab: "overview",
  bottomPanelTab: "terminal",
  activityBarVisible: true,
  primarySidebarVisible: true,
  secondarySidebarVisible: true,
  bottomPanelVisible: true,
  statusbarVisible: true,
  runtimeLogFilter: "",
  runtimeLogStatusFilter: "all",
  runtimeLogExportFormat: "markdown",
  agentThreadSearch: "",
  agentThreadScope: "current_workspace",
  updatedAt: 0,
};

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

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function displayValue(value: unknown, fallback = "n/a") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 1 : 2)}万`;
  return String(value);
}

function formatTime(value: number) {
  if (!value) return "未刷新";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value: unknown) {
  if (!value) return "未知时间";
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateTimeValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function workspaceDisplayTitle(book: BookProject) {
  const title = book.title.trim();
  if (!title || title === "未命名作品" || title === "我的第一本书") return "未命名工作区";
  return title;
}

function workspaceDisplayDomain(book: BookProject) {
  const type = book.type.trim();
  if (!type || type === "番茄小说" || type === "网文小说") return "写作 Agent";
  return type;
}

function workspaceDisplayIcon(book: BookProject) {
  if (!book.cover || ["📘", "🔥"].includes(book.cover)) return "◇";
  return book.cover;
}

function workspaceDisplayDescription(book: BookProject) {
  const description = book.description.trim();
  if (!description || description === "点击进入工作台继续写作。") {
    return "历史项目已挂载为 LumenOS 工作区。";
  }
  return description;
}

function compactThreadTitle(task: string, fallback = "未命名 Agent 线程") {
  const firstLine = task.replace(/\s+/g, " ").trim();
  if (!firstLine) return fallback;
  return firstLine.length > 36 ? `${firstLine.slice(0, 36)}...` : firstLine;
}

function createAgentThreadMessage(input: {
  role: AgentThreadMessageRole;
  title: string;
  content: string;
  status?: string;
  at?: number;
  sourceRef?: string;
}): AgentThreadMessage {
  return {
    id: `message-${uid()}`,
    role: input.role,
    title: input.title,
    content: input.content,
    status: input.status || "recorded",
    at: input.at || Date.now(),
    sourceRef: input.sourceRef,
  };
}

function createAgentThreadContextAttachment(input: {
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

function normalizeAgentThreadContextAttachment(value: unknown): AgentThreadContextAttachment | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const kind = asString(record.kind, "context_pack") as AgentThreadContextKind;
  if (!id) return null;
  return {
    id,
    kind: ["workspace", "file", "memory", "skill", "context_pack", "approval", "worker"].includes(kind) ? kind : "context_pack",
    title: asString(record.title, "上下文附件"),
    detail: asString(record.detail),
    ref: asString(record.ref, id),
    source: asString(record.source, "thread"),
    status: asString(record.status, "attached"),
    at: asNumber(record.at, Date.now()),
  };
}

function approvalSnapshotFromRecord(value: unknown, syncedAt = Date.now()): AgentThreadApprovalSnapshot | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    action: asString(record.action, "approval"),
    status: asString(record.status, "pending"),
    target: asString(record.target, "未声明目标"),
    message: asString(record.message, "等待人工复核。"),
    createdAt: asNumber(record.created_at, asNumber(record.createdAt, syncedAt)),
    syncedAt,
  };
}

function mergeAgentThreadApprovalSnapshots(
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

function mergeAgentThreadContextAttachments(
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

function compactApprovalId(value: string) {
  return value ? truncateMiddle(value, 10) : "未关联";
}

function threadMessageRoleFromEvent(kind: AgentThreadEventKind): AgentThreadMessageRole {
  if (kind === "draft") return "assistant";
  if (kind === "worker" || kind === "approval" || kind === "diff" || kind === "write") return "tool";
  return "system";
}

function normalizeAgentThreadMessage(value: unknown): AgentThreadMessage | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const role = asString(record.role, "system") as AgentThreadMessageRole;
  if (!id) return null;
  return {
    id,
    role: ["user", "assistant", "system", "tool"].includes(role) ? role : "system",
    title: asString(record.title, "线程消息"),
    content: asString(record.content, asString(record.detail, "")),
    status: asString(record.status, "recorded"),
    at: asNumber(record.at, Date.now()),
    sourceRef: asString(record.sourceRef),
  };
}

function createAgentThreadRecord(input: {
  title?: string;
  task?: string;
  status?: string;
  summary?: string;
  workspaceId?: string | null;
  workspaceTitle?: string;
  workspaceDomain?: string;
} = {}): AgentThreadRecord {
  const now = Date.now();
  const task = input.task || input.title || "继续推进灵枢 LumenOS Personal Agent OS";
  const summary = input.summary || "线程已创建，等待上下文包、Worker 复核和审批记录。";
  return {
    id: `thread-${uid()}`,
    title: input.title || compactThreadTitle(task, "当前目标：Personal Agent OS"),
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
    diffCount: 0,
    events: [{
      id: `event-${uid()}`,
      kind: "system",
      title: "线程创建",
      detail: summary || "已进入 Agent 线程，可恢复任务、绑定工作区并沉淀审批轨迹。",
      status: input.status || "current",
      at: now,
    }],
    messages: [
      createAgentThreadMessage({
        role: "system",
        title: "线程创建",
        content: summary,
        status: input.status || "current",
        at: now,
      }),
      createAgentThreadMessage({
        role: "user",
        title: "目标任务",
        content: task,
        status: "current",
        at: now + 1,
      }),
    ],
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

function normalizeAgentThreadRecord(value: unknown): AgentThreadRecord | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  const now = Date.now();
  const events = asRecordList(record.events).map((event) => ({
    id: asString(event.id, `event-${uid()}`),
    kind: asString(event.kind, "note") as AgentThreadEventKind,
    title: asString(event.title, "线程事件"),
    detail: asString(event.detail, asString(event.summary, "")),
    status: asString(event.status, "recorded"),
    at: asNumber(event.at, now),
  })).slice(0, 24);
  const messages = asRecordList(record.messages)
    .map(normalizeAgentThreadMessage)
    .filter((message): message is AgentThreadMessage => Boolean(message))
    .sort((a, b) => a.at - b.at)
    .slice(-36);
  const fallbackMessages = [
    createAgentThreadMessage({
      role: "system",
      title: "线程恢复",
      content: asString(record.summary, "从本地记录恢复 Agent 线程。"),
      status: "restored",
      at: now,
    }),
    ...(asString(record.task) ? [createAgentThreadMessage({
      role: "user" as const,
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
  return {
    id,
    title: asString(record.title, "未命名 Agent 线程"),
    task: asString(record.task, asString(record.title, "")),
    status: asString(record.status, "current"),
    summary: asString(record.summary, ""),
    createdAt: asNumber(record.createdAt, now),
    updatedAt: asNumber(record.updatedAt, now),
    archivedAt: asNumber(record.archivedAt, 0) || undefined,
    workspaceId: asString(record.workspaceId) || null,
    workspaceTitle: asString(record.workspaceTitle),
    workspaceDomain: asString(record.workspaceDomain),
    workerJobId: asString(record.workerJobId),
    approvalCount: Math.max(asNumber(record.approvalCount), approvalIds.length),
    approvalIds,
    approvalSnapshots,
    diffCount: asNumber(record.diffCount),
    events: events.length ? events : [{
      id: `event-${uid()}`,
      kind: "system",
      title: "线程恢复",
      detail: "从本地记录恢复 Agent 线程。",
      status: "restored",
      at: now,
    }],
    messages: messages.length ? messages : fallbackMessages,
    contextAttachments,
  };
}

function agentThreadSpaceKey(workspaceId?: string | null) {
  return workspaceId ? `workspace:${workspaceId}` : "unbound";
}

function agentThreadSpaceLabel(spaceKey: string, workspaces: Array<{ book: BookProject; title: string }>) {
  if (spaceKey === "unbound") return "未绑定空间";
  const workspaceId = spaceKey.replace(/^workspace:/, "");
  return workspaces.find((item) => item.book.id === workspaceId)?.title || workspaceId || "未知空间";
}

function buildAgentThreadSpacesIndex(threads: AgentThreadRecord[], migratedFrom?: string): AgentThreadSpacesIndex {
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

function normalizeAgentThreadSpacesIndex(value: unknown): AgentThreadSpacesIndex | null {
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

function flattenAgentThreadSpaces(index: AgentThreadSpacesIndex) {
  return Object.values(index.spaces).flat().sort((a, b) => b.updatedAt - a.updatedAt);
}

function loadAgentThreads() {
  const spacesIndex = normalizeAgentThreadSpacesIndex(loadJSON<unknown>(AGENT_THREAD_SPACES_KEY, null));
  if (spacesIndex) {
    const threads = flattenAgentThreadSpaces(spacesIndex);
    if (threads.length) return threads;
  }
  const legacyThreads = loadJSON<unknown[]>(AGENT_THREADS_KEY, [])
    .map(normalizeAgentThreadRecord)
    .filter((thread): thread is AgentThreadRecord => Boolean(thread))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (legacyThreads.length) {
    saveJSON(AGENT_THREAD_SPACES_KEY, buildAgentThreadSpacesIndex(legacyThreads, AGENT_THREADS_KEY));
    return legacyThreads;
  }
  const threads = [createAgentThreadRecord()];
  saveJSON(AGENT_THREAD_SPACES_KEY, buildAgentThreadSpacesIndex(threads, "initial"));
  return threads.length ? threads : [createAgentThreadRecord()];
}

function normalizeRuntimeLogEntry(value: unknown): RuntimeLogEntry | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  const channel = asString(record.channel, "output") as RuntimeLogChannel;
  return {
    id,
    channel,
    title: asString(record.title, "运行事件"),
    detail: asString(record.detail),
    status: asString(record.status, "recorded"),
    at: asNumber(record.at, Date.now()),
  };
}

function loadRuntimeLogs() {
  return loadJSON<unknown[]>(RUNTIME_LOGS_KEY, [])
    .map(normalizeRuntimeLogEntry)
    .filter((entry): entry is RuntimeLogEntry => Boolean(entry))
    .sort((a, b) => b.at - a.at)
    .slice(0, 120);
}

function normalizeWorkbenchLayoutState(value: unknown): WorkbenchLayoutState {
  const record = asRecord(value);
  const activeView = asString(record.activeView, DEFAULT_WORKBENCH_LAYOUT_STATE.activeView) as WorkbenchView;
  const detailTab = asString(record.detailTab, DEFAULT_WORKBENCH_LAYOUT_STATE.detailTab) as DetailTab;
  const bottomPanelTab = asString(record.bottomPanelTab, DEFAULT_WORKBENCH_LAYOUT_STATE.bottomPanelTab) as BottomPanelTab;
  return {
    version: 1,
    activeView: WORKBENCH_VIEWS.includes(activeView) ? activeView : DEFAULT_WORKBENCH_LAYOUT_STATE.activeView,
    detailTab: DETAIL_TABS.includes(detailTab) ? detailTab : DEFAULT_WORKBENCH_LAYOUT_STATE.detailTab,
    bottomPanelTab: BOTTOM_PANEL_TABS.includes(bottomPanelTab) ? bottomPanelTab : DEFAULT_WORKBENCH_LAYOUT_STATE.bottomPanelTab,
    activityBarVisible: asBoolean(record.activityBarVisible, DEFAULT_WORKBENCH_LAYOUT_STATE.activityBarVisible),
    primarySidebarVisible: asBoolean(record.primarySidebarVisible, DEFAULT_WORKBENCH_LAYOUT_STATE.primarySidebarVisible),
    secondarySidebarVisible: asBoolean(record.secondarySidebarVisible, DEFAULT_WORKBENCH_LAYOUT_STATE.secondarySidebarVisible),
    bottomPanelVisible: asBoolean(record.bottomPanelVisible, DEFAULT_WORKBENCH_LAYOUT_STATE.bottomPanelVisible),
    statusbarVisible: asBoolean(record.statusbarVisible, DEFAULT_WORKBENCH_LAYOUT_STATE.statusbarVisible),
    runtimeLogFilter: asString(record.runtimeLogFilter),
    runtimeLogStatusFilter: RUNTIME_LOG_STATUS_FILTERS.includes(asString(record.runtimeLogStatusFilter, "all") as RuntimeLogStatusFilter)
      ? asString(record.runtimeLogStatusFilter, "all") as RuntimeLogStatusFilter
      : DEFAULT_WORKBENCH_LAYOUT_STATE.runtimeLogStatusFilter,
    runtimeLogExportFormat: RUNTIME_LOG_EXPORT_FORMATS.includes(asString(record.runtimeLogExportFormat, "markdown") as RuntimeLogExportFormat)
      ? asString(record.runtimeLogExportFormat, "markdown") as RuntimeLogExportFormat
      : DEFAULT_WORKBENCH_LAYOUT_STATE.runtimeLogExportFormat,
    agentThreadSearch: asString(record.agentThreadSearch),
    agentThreadScope: AGENT_THREAD_SCOPES.includes(asString(record.agentThreadScope, "current_workspace") as AgentThreadScope)
      ? asString(record.agentThreadScope, "current_workspace") as AgentThreadScope
      : DEFAULT_WORKBENCH_LAYOUT_STATE.agentThreadScope,
    updatedAt: asNumber(record.updatedAt, 0),
  };
}

function loadWorkbenchLayoutState() {
  return normalizeWorkbenchLayoutState(loadJSON<unknown>(WORKBENCH_LAYOUT_KEY, DEFAULT_WORKBENCH_LAYOUT_STATE));
}

const ISSUE_LOG_STATUSES = new Set(["error", "blocked", "offline", "missing", "failed", "approval_required"]);
const ACTIVE_LOG_STATUSES = new Set(["running", "pending", "draft", "approval_required", "queued"]);

function runtimeLogMatchesStatus(entry: RuntimeLogEntry, filter: RuntimeLogStatusFilter) {
  if (filter === "issues") return ISSUE_LOG_STATUSES.has(entry.status);
  if (filter === "active") return ACTIVE_LOG_STATUSES.has(entry.status);
  return true;
}

function runtimeLogMatchesText(entry: RuntimeLogEntry, filter: string) {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) return true;
  return [entry.channel, entry.status, entry.title, entry.detail, formatDateTime(entry.at)]
    .join("\n")
    .toLowerCase()
    .includes(normalized);
}

function runtimeLogExportContent(entries: RuntimeLogEntry[], format: RuntimeLogExportFormat) {
  if (format === "jsonl") {
    return entries.map((entry) => JSON.stringify({
      id: entry.id,
      time: new Date(entry.at).toISOString(),
      channel: entry.channel,
      status: entry.status,
      title: entry.title,
      detail: entry.detail,
    })).join("\n");
  }

  const lines = [
    "# 灵枢 LumenOS Runtime Logs",
    "",
    `导出时间: ${new Date().toLocaleString("zh-CN")}`,
    `日志数量: ${entries.length}`,
    "",
  ];
  entries.forEach((entry, index) => {
    lines.push(`## ${index + 1}. ${entry.title || "运行事件"}`);
    lines.push("");
    lines.push(`- 时间: ${formatDateTime(entry.at)}`);
    lines.push(`- Channel: ${entry.channel}`);
    lines.push(`- 状态: ${entry.status}`);
    lines.push("");
    lines.push(entry.detail || "无详情");
    lines.push("");
  });
  return lines.join("\n");
}

function downloadTextArtifact(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function artifactSafeName(value: string, fallback = "thread") {
  const normalized = value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (normalized || fallback).slice(0, 64);
}

function agentThreadExportMarkdown(thread: AgentThreadRecord) {
  const lines = [
    `# ${thread.title || "未命名 Agent 线程"}`,
    "",
    `- 导出时间: ${new Date().toLocaleString("zh-CN")}`,
    `- Thread ID: ${thread.id}`,
    `- 状态: ${thread.status || "current"}`,
    `- 工作区: ${thread.workspaceTitle || "未绑定工作区"}`,
    `- 领域: ${thread.workspaceDomain || "未指定"}`,
    `- 创建: ${formatDateTime(thread.createdAt)}`,
    `- 更新: ${formatDateTime(thread.updatedAt)}`,
    "",
    "## 目标任务",
    "",
    thread.task || "无任务",
    "",
    "## 摘要",
    "",
    thread.summary || "无摘要",
    "",
    "## 消息流",
    "",
  ];
  thread.messages.forEach((message, index) => {
    lines.push(`### ${index + 1}. ${message.title || "线程消息"}`);
    lines.push("");
    lines.push(`- 角色: ${message.role}`);
    lines.push(`- 状态: ${message.status}`);
    lines.push(`- 时间: ${formatDateTime(message.at)}`);
    if (message.sourceRef) lines.push(`- 来源引用: ${message.sourceRef}`);
    lines.push("");
    lines.push(message.content || "无内容");
    lines.push("");
  });
  lines.push("## 上下文附件");
  lines.push("");
  if (thread.contextAttachments.length) {
    thread.contextAttachments.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.title || "上下文附件"}`);
      lines.push("");
      lines.push(`- 类型: ${item.kind}`);
      lines.push(`- 来源: ${item.source}`);
      lines.push(`- 引用: ${item.ref}`);
      lines.push(`- 状态: ${item.status}`);
      lines.push(`- 时间: ${formatDateTime(item.at)}`);
      lines.push("");
      lines.push(item.detail || "无详情");
      lines.push("");
    });
  } else {
    lines.push("暂无上下文附件。");
    lines.push("");
  }
  lines.push("## 关联审批");
  lines.push("");
  if (thread.approvalIds.length) {
    const snapshotsById = new Map(thread.approvalSnapshots.map((item) => [item.id, item]));
    thread.approvalIds.forEach((id) => {
      const snapshot = snapshotsById.get(id);
      if (!snapshot) {
        lines.push(`- ${id}`);
        return;
      }
      lines.push(`- ${id} · ${snapshot.action} · ${snapshot.status} · ${snapshot.target}`);
      lines.push(`  - 消息: ${snapshot.message}`);
      lines.push(`  - 同步: ${formatDateTime(snapshot.syncedAt)}`);
    });
  } else {
    lines.push("暂无关联审批。");
  }
  lines.push("");
  lines.push("## 事件轨迹");
  lines.push("");
  thread.events.forEach((event, index) => {
    lines.push(`### ${index + 1}. ${event.title || "线程事件"}`);
    lines.push("");
    lines.push(`- 类型: ${event.kind}`);
    lines.push(`- 状态: ${event.status}`);
    lines.push(`- 时间: ${formatDateTime(event.at)}`);
    lines.push("");
    lines.push(event.detail || "无详情");
    lines.push("");
  });
  return lines.join("\n");
}

function truncateMiddle(value: string, keep = 18) {
  if (value.length <= keep * 2 + 3) return value;
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

function pathBaseName(value: string) {
  return value.split(/[\\/]/).filter(Boolean).pop() || value || "未命名文件";
}

function comparableFileName(value: string) {
  return pathBaseName(value).replace(/\.(md|txt|json|html|tsx?|jsx?)$/i, "").trim().toLowerCase();
}

function displayEndpoint(apiUrl: string) {
  if (!apiUrl.trim()) return "尚未配置端点";
  try {
    const url = new URL(apiUrl);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return apiUrl;
  }
}

function isLocalEndpoint(apiUrl: string) {
  if (!apiUrl.trim()) return false;
  try {
    const host = new URL(apiUrl).hostname.toLowerCase();
    return host === "localhost"
      || host === "127.0.0.1"
      || host === "0.0.0.0"
      || host === "::1"
      || host.startsWith("192.168.")
      || host.startsWith("10.")
      || host.endsWith(".local");
  } catch {
    return false;
  }
}

function modelKeyEnv(provider: string) {
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "gemini") return "GEMINI_API_KEY";
  if (provider === "ollama") return "";
  return "ZHIMENG_MODEL_API_KEY";
}

function providerGroupName(group: string) {
  const labels: Record<string, string> = {
    official: "官方 API",
    china: "国内模型服务",
    router: "路由 / Gateway 网关",
    global: "全球 API",
    local: "本地运行时",
  };
  return labels[group] || group || "其他";
}

function providerPresetRecord(preset: (typeof PROVIDER_PRESETS)[number]): JsonRecord {
  return {
    id: preset.id,
    label: preset.label,
    provider: preset.provider,
    provider_label: PROVIDER_LABELS[preset.provider],
    api_url: preset.apiUrl,
    model_id: preset.modelId,
    model_name: preset.modelName,
    group: preset.group || "global",
    notes: preset.notes || "",
    local: isLocalEndpoint(preset.apiUrl),
    key_optional: allowsEmptyApiKey(preset.apiUrl, preset.provider),
  };
}

function stableJobSuffix(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36).slice(0, 8) || "draft";
}

function commandWorkerJobId(task: string, domain: string, mode: "preview" | "run") {
  const base = `command-context-${stableJobSuffix(`${task}-${domain}`)}`;
  if (mode === "preview") return `${base}-preview`;
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function modelWorkerJobId(task: string, domain: string, mode: "preview" | "run") {
  const base = `agent-model-${stableJobSuffix(`${task}-${domain}`)}`;
  if (mode === "preview") return `${base}-preview`;
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function modelWorkerStreamMessageRef(jobId: string) {
  return jobId ? `model-worker-stream:${jobId}` : "";
}

function workerEventKey(event: JsonRecord) {
  return [
    asString(event.job_id),
    asString(event.type),
    asString(event.at),
    asString(event.stage),
    asString(event.status),
    asString(event.chunk_index),
    asString(event.text).slice(0, 40),
  ].join("|");
}

function modelWorkerEventLabel(event: JsonRecord) {
  const type = asString(event.type, "worker_event");
  const stage = asString(event.stage);
  if (type === "model_stream_chunk") return `stream chunk #${asNumber(event.chunk_index) || "?"}`;
  if (type === "model_stream_start") return "stream start";
  if (type === "model_stream_end") return `stream end · ${asNumber(event.chunk_count)} chunks`;
  if (type === "model_child_started") return `child pid ${asString(event.pid) || "unknown"}`;
  if (type === "model_child_end") return `child end · ${asString(event.status, "unknown")}`;
  if (type === "worker_stage") return stage || "worker stage";
  if (type === "worker_update") return `status ${asString(event.status, "unknown")}`;
  return type;
}

function parseCommandDiffHunks(diffPreview: string): CommandDiffHunk[] {
  const normalized = diffPreview.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized) return [];
  const lines = normalized.split("\n");
  const hunks: CommandDiffHunk[] = [];
  let current: string[] = [];
  let currentTitle = "";
  const flush = () => {
    if (!current.length) return;
    const index = hunks.length + 1;
    hunks.push({
      id: `hunk-${index}`,
      title: currentTitle || `Hunk ${index}`,
      status: "pending",
      content: current.join("\n"),
    });
    current = [];
    currentTitle = "";
  };

  for (const line of lines) {
    if (line.startsWith("@@")) {
      flush();
      currentTitle = line.trim() || `Hunk ${hunks.length + 1}`;
      current = [line];
      continue;
    }
    if (current.length) {
      current.push(line);
    }
  }
  flush();

  if (hunks.length) return hunks;
  return [{
    id: "hunk-1",
    title: "完整草案",
    status: "pending",
    content: normalized,
  }];
}

function commandHunkWriteContent(hunk: CommandDiffHunk) {
  const lines = hunk.content.replace(/\r\n/g, "\n").split("\n");
  const additions = lines
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
  if (additions.length) return additions.join("\n").trimEnd();
  return lines
    .filter((line) => !line.startsWith("@@") && !line.startsWith("--- ") && !line.startsWith("+++ "))
    .join("\n")
    .trimEnd();
}

function buildMemoryManagerRow(record: JsonRecord, kind: MemoryKind, index: number): MemoryManagerRow {
  const tags = asArray(record.tags).map((tag) => String(tag)).filter(Boolean);
  const evidence = asArray(record.evidence).map((item) => String(item)).filter(Boolean);
  const summary = asString(record.summary, "暂无摘要");
  const dimension = asString(record.dimension, "episode");
  const source = asString(record.source, "memory");
  const rawId = asString(record.id);
  const id = rawId || `${kind.toLowerCase()}-${stableJobSuffix(`${dimension}-${source}-${summary}-${index}`)}`;
  return {
    id: `${kind}:${id}`,
    kind,
    record,
    dimension,
    source,
    summary,
    tags,
    at: record.at,
    searchable: [
      kind,
      id,
      dimension,
      source,
      summary,
      tags.join(" "),
      evidence.join(" "),
    ].join("\n").toLowerCase(),
  };
}

function memoryDraftActionTitle(kind: MemoryDraftKind) {
  if (kind === "update") return "编辑草案";
  if (kind === "freeze") return "冻结草案";
  return "删除草案";
}

function buildAcceptedHunkContent(hunks: CommandDiffHunk[]) {
  const content = hunks
    .filter((hunk) => hunk.status === "accepted")
    .map(commandHunkWriteContent)
    .filter((item) => item.trim().length > 0)
    .join("\n");
  if (!content) return "";
  return content.endsWith("\n") ? content : `${content}\n`;
}

const TERMINAL_COMMAND_PRESETS = [
  "python --version",
  "node --version",
  "npm --version",
  "npx tsc --noEmit",
  "python bridge/healthcheck_bridge.py",
  "python -m py_compile bridge/zhimeng_bridge.py bridge/healthcheck_bridge.py",
];

function terminalCommandResultText(result: JsonRecord | null) {
  if (!result) return "等待 Gateway 响应";
  const execution = asRecord(result.command_execution);
  const validation = asRecordList(result.validation);
  const commandPolicy = asRecord(result.command_policy);
  const allowlist = asRecord(execution.allowlist);
  const lines = [
    `状态: ${asString(result.status, "unknown")}`,
    asString(result.message) ? `消息: ${asString(result.message)}` : "",
    asString(allowlist.pattern) ? `Allowlist: ${asString(allowlist.pattern)}` : "",
    Object.keys(commandPolicy).length ? `策略: ${JSON.stringify(commandPolicy)}` : "",
    validation.length ? `校验: ${validation.map((item) => `${asString(item.severity, "info")}:${asString(item.message, asString(item.rule, "validator"))}`).join(" | ")}` : "",
    Object.keys(execution).length ? `Exit: ${asString(execution.returncode, "-")}` : "",
    asString(execution.stdout) ? `stdout:\n${asString(execution.stdout).trimEnd()}` : "",
    asString(execution.stderr) ? `stderr:\n${asString(execution.stderr).trimEnd()}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function deepNumber(value: unknown, keys: string[], depth = 0): number | null {
  if (depth > 5 || !value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepNumber(item, keys, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as JsonRecord;
  for (const key of keys) {
    const item = record[key];
    if (typeof item === "number" && Number.isFinite(item)) return item;
  }
  for (const item of Object.values(record)) {
    const found = deepNumber(item, keys, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function runtimeCapabilities(state: ControlCenterState) {
  return asRecord(
    state.health?.runtime_capabilities
      ?? state.provider?.runtime_capabilities
      ?? state.memory?.runtime_capabilities
      ?? state.skill?.runtime_capabilities
      ?? state.worker?.runtime_capabilities
      ?? state.approval?.runtime_capabilities
      ?? state.phase?.runtime_capabilities,
  );
}

function toolMatrix(state: ControlCenterState): ToolMatrixItem[] {
  const capabilities = runtimeCapabilities(state);
  return asArray(capabilities.tool_matrix).map((item) => {
    const record = asRecord(item);
    return {
      action: asString(record.action),
      label: asString(record.label, asString(record.action, "Tool")),
      enabled: asBoolean(record.enabled),
      mode: asString(record.mode),
      gatewayFlag: asString(record.gateway_flag),
      requestGate: asString(record.request_gate),
      scope: asString(record.scope),
    };
  }).filter((item) => item.action || item.label);
}

async function fetchJson(url: string, init?: RequestInit): Promise<JsonRecord> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.json() as JsonRecord;
}

async function captureJson(label: string, request: Promise<JsonRecord>): Promise<{ label: string; data: JsonRecord | null; error: string }> {
  try {
    return { label, data: await request, error: "" };
  } catch (error) {
    return { label, data: null, error: error instanceof Error ? error.message : "请求失败" };
  }
}

function bridgeAction(action: string, payload: JsonRecord = {}, options: { execute?: boolean } = {}) {
  return fetchJson(`${GATEWAY_ORIGIN}/bridge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      purpose: `Agent Control Center ${action}`,
      payload,
      ...(options.execute ? { execute: true } : {}),
    }),
  });
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (["ok", "pass", "completed", "executed", "running", "ready", "accepted", "proposal"].includes(normalized)) return "text-emerald-300";
  if (["partial", "pending", "queued", "draft", "approval_required", "modified"].includes(normalized)) return "text-amber-300";
  if (["missing", "blocked", "failed", "error", "rejected"].includes(normalized)) return "text-red-300";
  return "text-slate-300";
}

function statusLabel(status: string) {
  const normalized = status || "unknown";
  const labels: Record<string, string> = {
    active: "已启用",
    accepted: "已接受",
    approval_required: "需审批",
    blocked: "阻塞",
    completed: "完成",
    current: "当前",
    draft: "草案",
    enabled: "已启用",
    error: "错误",
    executed: "已执行",
    failed: "失败",
    gated: "受控",
    disabled: "禁用",
    "not-set": "未设置",
    local: "本地",
    missing: "缺失",
    none: "无",
    offline: "离线",
    ok: "正常",
    online: "在线",
    partial: "部分完成",
    pass: "通过",
    pending: "等待",
    planned: "规划中",
    proposal: "合并草案",
    queued: "排队中",
    "read-only": "只读",
    ready: "就绪",
    rejected: "已拒绝",
    modified: "需修改",
    remote: "远程",
    required: "必填",
    optional: "可选",
    present: "已填写",
    direct: "直接设置",
    running: "运行中",
    saved: "已保存",
    setup: "待配置",
    "setup-needed": "需配置",
    "runtime-ready": "运行时就绪",
    unknown: "未知",
    unconfigured: "未配置",
  };
  return labels[normalized.toLowerCase()] || normalized;
}

function MetricTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="mt-1 truncate text-xl font-semibold text-white">{value}</div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400">{icon}</div>
      </div>
      <div className="mt-2 line-clamp-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

function SectionTitle({ icon, title, meta }: { icon: React.ReactNode; title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
        {icon}
        <span className="truncate">{title}</span>
      </h3>
      {meta && <span className="shrink-0 text-xs text-slate-500">{meta}</span>}
    </div>
  );
}

function StatusBadge({ status, subtle = false }: { status: string; subtle?: boolean }) {
  const normalized = status || "unknown";
  return (
    <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] ${subtle ? "bg-slate-800 text-slate-400" : "bg-slate-950/70"} ${statusTone(normalized)}`}>
      {statusLabel(normalized)}
    </span>
  );
}

function MiniStat({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-3 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function PathLine({ value }: { value: string }) {
  if (!value) return null;
  return <div className="mt-1 truncate font-mono text-[10px] text-slate-500" title={value}>{truncateMiddle(value, 32)}</div>;
}

function DetailTabButton({
  tab,
  active,
  icon,
  label,
  onClick,
}: {
  tab: DetailTab;
  active: DetailTab;
  icon: React.ReactNode;
  label: string;
  onClick: (tab: DetailTab) => void;
}) {
  return (
    <button
      onClick={() => onClick(tab)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors ${
        active === tab
          ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30"
          : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MemoryListRow({
  row,
  selected,
  onSelect,
}: {
  row: MemoryManagerRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const importance = asNumber(row.record.importance);
  const confidence = asNumber(row.record.confidence);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-cyan-500/40 bg-cyan-500/10"
          : "border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className={row.kind === "L2" ? "text-pink-300" : "text-cyan-300"}>{row.kind}</span>
          <span className="truncate text-slate-300">{row.dimension}</span>
          <span className="truncate text-slate-600">{row.source}</span>
        </div>
        <span className="shrink-0 text-[10px] text-slate-500">{formatDateTime(row.at)}</span>
      </div>
      <p className="line-clamp-2 text-xs leading-relaxed text-slate-300">{row.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {importance > 0 && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-amber-300">重要 {importance}</span>}
        {confidence > 0 && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-emerald-300">置信 {confidence}</span>}
        {row.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">{tag}</span>)}
      </div>
    </button>
  );
}

function SkillRow({ item }: { item: JsonRecord }) {
  const status = asString(item.status, "candidate");
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-100">{asString(item.title, asString(item.label, "Skill"))}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
            <span>{asString(item.dimension, asString(item.scope, "general"))}</span>
            {asString(item.invocation_mode) && <span>{asString(item.invocation_mode)}</span>}
            {asNumber(item.run_count) > 0 && <span>run {asNumber(item.run_count)}</span>}
          </div>
          <PathLine value={asString(item.activated_path, asString(item.path, asString(item.draft_path)))} />
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function ProviderRow({ item }: { item: JsonRecord }) {
  const local = asBoolean(item.local);
  const keyOptional = asBoolean(item.key_optional);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-100">{asString(item.label, asString(item.id, "Provider"))}</div>
          <div className="mt-1 truncate text-[10px] text-slate-500">{asString(item.model_id)} · {asString(item.provider_label, asString(item.provider))}</div>
          <PathLine value={asString(item.api_url)} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={local ? "rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300" : "rounded-md bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300"}>
            {local ? "本地" : "远程"}
          </span>
          <span className={keyOptional ? "text-[10px] text-slate-500" : "text-[10px] text-amber-300"}>{keyOptional ? "密钥可选" : "密钥必填"}</span>
        </div>
      </div>
    </div>
  );
}

function WorkerRow({ item }: { item: JsonRecord }) {
  const payload = asRecord(item.payload);
  const result = asRecord(item.result);
  const proposal = asRecord(item.merge_proposal);
  const status = asString(item.status, "unknown");
  const command = asString(payload.command, asString(payload.action, asString(payload.kind, asString(payload.model_id))));
  const detail = asString(item.purpose, asString(result.message, asString(result.reason, command)));
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-100">{asString(item.id, "worker")}</span>
            <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">{asString(item.kind, "job")}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-slate-400">{detail}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
            <span>{formatDateTime(item.updated_at || item.created_at)}</span>
            {asBoolean(item.hard_cancel_supported) && <span>硬取消: {statusLabel(asString(item.hard_cancel_status, "ready"))}</span>}
            {asNumber(item.process_pid) > 0 && <span>PID {asNumber(item.process_pid)}</span>}
          </div>
          <PathLine value={asString(proposal.proposal_path)} />
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

export function AgentControlCenter({
  library,
  customPrompts,
  settings,
  onCreateBook,
  onOpenBook,
  onOpenBookFile,
  onOpenSettings,
  onOpenOverview,
  onOpenDistillation,
}: {
  library: LibraryState;
  customPrompts: PromptTemplate[];
  settings: ApiSettings;
  onCreateBook: () => void;
  onOpenBook: (id: string) => void;
  onOpenBookFile?: (bookId: string, fileId: string) => void;
  onOpenSettings: () => void;
  onOpenOverview?: () => void;
  onOpenDistillation: () => void;
}) {
  const [state, setState] = useState<ControlCenterState>(INITIAL_STATE);
  const [quickAction, setQuickAction] = useState<{ label: string; status: string; detail: string }>({ label: "", status: "", detail: "" });
  const [providerAction, setProviderAction] = useState<ProviderActionSnapshot>({ label: "", action: "", status: "", detail: "", data: null, at: 0 });
  const [terminalCommand, setTerminalCommand] = useState<TerminalCommandSnapshot>({
    command: "python --version",
    status: "",
    detail: "",
    at: 0,
    request: null,
    result: null,
  });
  const [commandTask, setCommandTask] = useState("继续把灵枢 LumenOS 对标 Codex / Claude Code / VS Code，先生成上下文包、工具计划和审批草案。");
  const [commandDraft, setCommandDraft] = useState<CommandDraftSnapshot>({
    task: "",
    status: "",
    detail: "",
    at: 0,
    contextItems: [],
    threadContextItems: [],
    activeSkillKeys: [],
    excludedToolScopes: [],
    toolPlan: [],
    data: null,
  });
  const [commandWorker, setCommandWorker] = useState<CommandWorkerSnapshot>({
    status: "",
    detail: "",
    at: 0,
    jobId: "",
    request: null,
    result: null,
  });
  const [agentModelWorker, setAgentModelWorker] = useState<AgentModelWorkerSnapshot>({
    status: "",
    detail: "",
    at: 0,
    jobId: "",
    request: null,
    result: null,
    mode: "",
  });
  const emittedAgentModelWorkerEventsRef = useRef<Set<string>>(new Set());
  const agentModelWorkerStartedAtRef = useRef<Record<string, number>>({});
  const [commandPlanFeedback, setCommandPlanFeedback] = useState("");
  const [commandApproval, setCommandApproval] = useState<CommandApprovalSnapshot>({
    status: "",
    decision: "",
    detail: "",
    at: 0,
    planItems: [],
    request: null,
    proposal: null,
    writeRequest: null,
    writeResult: null,
  });
  const [commandDiffHunks, setCommandDiffHunks] = useState<CommandDiffHunk[]>([]);
  const [workbenchLayout, setWorkbenchLayout] = useState<WorkbenchLayoutState>(loadWorkbenchLayoutState);
  const detailTab = workbenchLayout.detailTab;
  const activeView = workbenchLayout.activeView;
  const bottomPanelTab = workbenchLayout.bottomPanelTab;
  const updateWorkbenchLayout = useCallback((patch: Partial<WorkbenchLayoutState>) => {
    setWorkbenchLayout((prev) => ({
      ...prev,
      ...patch,
      version: 1,
      updatedAt: Date.now(),
    }));
  }, []);
  const setDetailTab = useCallback((tab: DetailTab) => updateWorkbenchLayout({ detailTab: tab }), [updateWorkbenchLayout]);
  const setActiveView = useCallback((view: WorkbenchView) => updateWorkbenchLayout({ activeView: view }), [updateWorkbenchLayout]);
  const setBottomPanelTab = useCallback((tab: BottomPanelTab) => updateWorkbenchLayout({ bottomPanelTab: tab, bottomPanelVisible: true }), [updateWorkbenchLayout]);
  const setAgentThreadSearch = useCallback((agentThreadSearch: string) => updateWorkbenchLayout({ agentThreadSearch }), [updateWorkbenchLayout]);
  const setAgentThreadScope = useCallback((agentThreadScope: AgentThreadScope) => updateWorkbenchLayout({ agentThreadScope }), [updateWorkbenchLayout]);
  const [agentThreads, setAgentThreads] = useState<AgentThreadRecord[]>(loadAgentThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showArchivedThreads, setShowArchivedThreads] = useState(false);
  const [threadComposer, setThreadComposer] = useState("");
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogEntry[]>(loadRuntimeLogs);
  const [selectedExplorerFileId, setSelectedExplorerFileId] = useState<string | null>(null);
  const [selectedChangeFileId, setSelectedChangeFileId] = useState<string | null>(null);
  const [workspaceExplorerSearch, setWorkspaceExplorerSearch] = useState("");
  const [collapsedExplorerCategories, setCollapsedExplorerCategories] = useState<Set<string>>(new Set());
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryKindFilter, setMemoryKindFilter] = useState<MemoryKindFilter>("all");
  const [memoryDimensionFilter, setMemoryDimensionFilter] = useState("all");
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [memoryDraftAction, setMemoryDraftAction] = useState<MemoryDraftActionSnapshot | null>(null);
  const [specProtocolDraft, setSpecProtocolDraft] = useState<SpecProtocolDraftSnapshot>({
    status: "",
    detail: "",
    at: 0,
    files: [],
    request: null,
    result: null,
  });
  const [approvalActionFilter, setApprovalActionFilter] = useState("all");
  const [approvalStatusFilter, setApprovalStatusFilter] = useState("all");
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [approvalDetailTab, setApprovalDetailTab] = useState<ApprovalDetailTab>("proposal");
  const [approvalDecision, setApprovalDecision] = useState<ApprovalDecisionSnapshot>({
    approvalId: "",
    decision: "",
    status: "",
    detail: "",
    at: 0,
    request: null,
    result: null,
  });
  const acceptedCommandHunkContent = useMemo(() => buildAcceptedHunkContent(commandDiffHunks), [commandDiffHunks]);
  const acceptedCommandHunkCount = useMemo(() => commandDiffHunks.filter((hunk) => hunk.status === "accepted").length, [commandDiffHunks]);
  const rejectedCommandHunkCount = useMemo(() => commandDiffHunks.filter((hunk) => hunk.status === "rejected").length, [commandDiffHunks]);

  const totalWords = useMemo(() => library.books.reduce((sum, book) => {
    return sum + book.workspace.files.reduce((bookSum, file) => bookSum + wordCount(file.content).total, 0);
  }, 0), [library.books]);
  const lastBook = useMemo<BookProject | null>(() => {
    return library.books.find((book) => book.id === library.lastOpenedBookId) || library.books[0] || null;
  }, [library.books, library.lastOpenedBookId]);
  const allWorkspaceSummaries = useMemo(() => [...library.books]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((book) => {
      const files = book.workspace.files;
      const words = files.reduce((sum, file) => sum + wordCount(file.content).total, 0);
      const categoryCount = book.workspace.categories?.length || new Set(files.map((file) => file.category)).size;
      return {
        book,
        title: workspaceDisplayTitle(book),
        domain: workspaceDisplayDomain(book),
        icon: workspaceDisplayIcon(book),
        description: workspaceDisplayDescription(book),
        files: files.length,
        words,
        categoryCount,
      };
    }), [library.books]);
  const workspaceSummaries = useMemo(() => allWorkspaceSummaries.slice(0, 5), [allWorkspaceSummaries]);
  const activeWorkspace = useMemo(() => {
    return allWorkspaceSummaries.find((item) => item.book.id === lastBook?.id) || allWorkspaceSummaries[0] || null;
  }, [allWorkspaceSummaries, lastBook?.id]);
  const customSkillCount = customPrompts.filter((prompt) => !prompt.builtIn).length;
  const autoSkillCount = customPrompts.filter((prompt) => prompt.autoSkillClusterKey).length;
  const activeThread = useMemo(() => {
    return agentThreads.find((thread) => thread.id === activeThreadId)
      || (workbenchLayout.agentThreadScope === "current_workspace" && activeWorkspace?.book.id
        ? agentThreads.find((thread) => !thread.archivedAt && thread.workspaceId === activeWorkspace.book.id)
        : null)
      || (workbenchLayout.agentThreadScope === "unbound"
        ? agentThreads.find((thread) => !thread.archivedAt && !thread.workspaceId)
        : null)
      || agentThreads.find((thread) => !thread.archivedAt)
      || agentThreads[0]
      || null;
  }, [activeWorkspace?.book.id, agentThreads, activeThreadId, workbenchLayout.agentThreadScope]);
  const filteredAgentThreads = useMemo(() => {
    const normalizedSearch = workbenchLayout.agentThreadSearch.trim().toLowerCase();
    return agentThreads
      .filter((thread) => showArchivedThreads || !thread.archivedAt)
      .filter((thread) => {
        if (workbenchLayout.agentThreadScope === "all_workspaces") return true;
        if (workbenchLayout.agentThreadScope === "unbound") return !thread.workspaceId;
        if (!activeWorkspace?.book.id) return true;
        return thread.workspaceId === activeWorkspace.book.id;
      })
      .filter((thread) => {
        if (!normalizedSearch) return true;
        return [
          thread.title,
          thread.task,
          thread.summary,
          thread.status,
          thread.workspaceTitle,
          thread.workspaceDomain,
          thread.workerJobId,
          ...thread.events.flatMap((event) => [event.title, event.detail, event.status, event.kind]),
          ...thread.messages.flatMap((message) => [message.title, message.content, message.status, message.role]),
          ...thread.approvalSnapshots.flatMap((item) => [item.id, item.action, item.status, item.target, item.message]),
        ].join("\n").toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeWorkspace?.book.id, agentThreads, showArchivedThreads, workbenchLayout.agentThreadScope, workbenchLayout.agentThreadSearch]);
  const visibleAgentThreads = useMemo(() => filteredAgentThreads.slice(0, 12), [filteredAgentThreads]);
  const archivedAgentThreadCount = agentThreads.filter((thread) => thread.archivedAt).length;
  const currentWorkspaceThreadCount = activeWorkspace
    ? agentThreads.filter((thread) => thread.workspaceId === activeWorkspace.book.id && !thread.archivedAt).length
    : agentThreads.filter((thread) => !thread.archivedAt).length;
  const unboundThreadCount = agentThreads.filter((thread) => !thread.workspaceId && !thread.archivedAt).length;
  const agentThreadSpacesIndex = useMemo(() => buildAgentThreadSpacesIndex(agentThreads), [agentThreads]);
  const activeThreadSpaceKey = agentThreadSpaceKey(activeThread?.workspaceId || activeWorkspace?.book.id || null);
  const activeThreadSpaceLabel = agentThreadSpaceLabel(activeThreadSpaceKey, allWorkspaceSummaries);
  const agentThreadSpaceRows = Object.entries(agentThreadSpacesIndex.spaces)
    .map(([key, threads]) => ({
      key,
      label: agentThreadSpaceLabel(key, allWorkspaceSummaries),
      count: threads.filter((thread) => !thread.archivedAt).length,
      archived: threads.filter((thread) => Boolean(thread.archivedAt)).length,
      active: key === activeThreadSpaceKey,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count || a.label.localeCompare(b.label, "zh-CN"))
    .slice(0, 5);

  useEffect(() => {
    saveJSON(AGENT_THREAD_SPACES_KEY, {
      ...agentThreadSpacesIndex,
      updatedAt: Date.now(),
    });
    saveJSON(AGENT_THREADS_KEY, agentThreads);
  }, [agentThreads, agentThreadSpacesIndex]);

  useEffect(() => {
    saveJSON(RUNTIME_LOGS_KEY, runtimeLogs);
  }, [runtimeLogs]);

  useEffect(() => {
    saveJSON(WORKBENCH_LAYOUT_KEY, workbenchLayout);
  }, [workbenchLayout]);

  useEffect(() => {
    const existing = agentThreads.find((thread) => thread.id === activeThreadId);
    const visibleExisting = existing && (showArchivedThreads || !existing.archivedAt) && (
      workbenchLayout.agentThreadScope === "all_workspaces"
        || (workbenchLayout.agentThreadScope === "unbound" ? !existing.workspaceId : !activeWorkspace?.book.id || existing.workspaceId === activeWorkspace.book.id)
    );
    if (visibleExisting) return;
    const scoped = agentThreads.find((thread) => {
      if (!showArchivedThreads && thread.archivedAt) return false;
      if (workbenchLayout.agentThreadScope === "all_workspaces") return true;
      if (workbenchLayout.agentThreadScope === "unbound") return !thread.workspaceId;
      if (!activeWorkspace?.book.id) return true;
      return thread.workspaceId === activeWorkspace.book.id;
    });
    setActiveThreadId(scoped?.id || agentThreads.find((thread) => !thread.archivedAt)?.id || agentThreads[0]?.id || null);
  }, [activeWorkspace?.book.id, agentThreads, activeThreadId, showArchivedThreads, workbenchLayout.agentThreadScope]);

  const toggleWorkbenchPart = useCallback((key: WorkbenchPartKey) => {
    setWorkbenchLayout((prev) => ({
      ...prev,
      [key]: !prev[key],
      version: 1,
      updatedAt: Date.now(),
    }));
  }, []);

  const resetWorkbenchLayout = useCallback(() => {
    setWorkbenchLayout({
      ...DEFAULT_WORKBENCH_LAYOUT_STATE,
      updatedAt: Date.now(),
    });
  }, []);

  const appendRuntimeLog = (entry: Omit<RuntimeLogEntry, "id" | "at"> & { at?: number }) => {
    setRuntimeLogs((prev) => [{
      id: `log-${uid()}`,
      channel: entry.channel,
      title: entry.title,
      detail: entry.detail,
      status: entry.status,
      at: entry.at || Date.now(),
    }, ...prev].slice(0, 120));
  };

  const clearRuntimeLogs = () => {
    const now = Date.now();
    const retained: RuntimeLogEntry = {
      id: `log-${uid()}`,
      channel: "terminal",
      title: "运行日志已清空",
      detail: "仅清空前端本地 runtime log；审批队列、Worker 状态、Gateway 文件和项目文件未被修改。",
      status: "cleared",
      at: now,
    };
    setRuntimeLogs([retained]);
  };

  const exportRuntimeLogs = (entries: RuntimeLogEntry[]) => {
    const format = workbenchLayout.runtimeLogExportFormat;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const extension = format === "jsonl" ? "jsonl" : "md";
    const content = runtimeLogExportContent(entries, format);
    downloadTextArtifact(`lumenos-runtime-logs-${timestamp}.${extension}`, content, format === "jsonl" ? "application/jsonl;charset=utf-8" : "text/markdown;charset=utf-8");
    appendRuntimeLog({
      channel: "output",
      title: "运行日志已导出",
      detail: `已导出当前筛选视图 ${entries.length} 条日志，格式 ${format}。`,
      status: "saved",
    });
  };

  const appendAgentThreadEvent = (event: Omit<AgentThreadEvent, "id" | "at"> & {
    at?: number;
    task?: string;
    workerJobId?: string;
    diffCount?: number;
    approvalDelta?: number;
    approvalId?: string;
    contextAttachments?: AgentThreadContextAttachment[];
  }) => {
    const targetId = activeThread?.id || agentThreads.find((thread) => !thread.archivedAt)?.id || agentThreads[0]?.id;
    if (!targetId) return;
    const now = event.at || Date.now();
    setAgentThreads((prev) => prev.map((thread) => {
      if (thread.id !== targetId) return thread;
      const nextEvent: AgentThreadEvent = {
        id: `event-${uid()}`,
        kind: event.kind,
        title: event.title,
        detail: event.detail,
        status: event.status,
        at: now,
      };
      const nextMessage = createAgentThreadMessage({
        role: threadMessageRoleFromEvent(nextEvent.kind),
        title: nextEvent.title,
        content: nextEvent.detail,
        status: nextEvent.status,
        at: now,
      });
      const nextApprovalIds = Array.from(new Set([
        ...thread.approvalIds,
        ...(event.approvalId ? [event.approvalId] : []),
      ]));
      const nextAttachments = event.contextAttachments?.length
        ? mergeAgentThreadContextAttachments(thread.contextAttachments, event.contextAttachments)
        : thread.contextAttachments;
      return {
        ...thread,
        title: event.task ? compactThreadTitle(event.task, thread.title) : thread.title,
        task: event.task || thread.task,
        status: event.status || thread.status,
        summary: event.detail || thread.summary,
        updatedAt: now,
        workerJobId: event.workerJobId || thread.workerJobId,
        approvalCount: Math.max(thread.approvalCount + (event.approvalDelta || 0), nextApprovalIds.length),
        approvalIds: nextApprovalIds,
        diffCount: event.diffCount ?? thread.diffCount,
        events: [nextEvent, ...thread.events].slice(0, 24),
        messages: [...thread.messages, nextMessage].slice(-36),
        contextAttachments: nextAttachments,
      };
    }));
  };

  const appendAgentThreadMessage = (message: Omit<AgentThreadMessage, "id" | "at"> & { at?: number; task?: string }) => {
    const targetId = activeThread?.id || agentThreads.find((thread) => !thread.archivedAt)?.id || agentThreads[0]?.id;
    if (!targetId) return;
    const now = message.at || Date.now();
    const nextMessage = createAgentThreadMessage({
      role: message.role,
      title: message.title,
      content: message.content,
      status: message.status,
      at: now,
      sourceRef: message.sourceRef,
    });
    setAgentThreads((prev) => prev.map((thread) => {
      if (thread.id !== targetId) return thread;
      return {
        ...thread,
        title: message.task ? compactThreadTitle(message.task, thread.title) : thread.title,
        task: message.task || thread.task,
        summary: message.content || thread.summary,
        status: message.status || thread.status,
        updatedAt: now,
        messages: [...thread.messages, nextMessage].slice(-36),
      };
    }));
  };

  const upsertAgentThreadMessage = (
    message: Omit<AgentThreadMessage, "id" | "at"> & {
      at?: number;
      task?: string;
      sourceRef: string;
      appendContent?: boolean;
    },
  ) => {
    const targetId = activeThread?.id || agentThreads.find((thread) => !thread.archivedAt)?.id || agentThreads[0]?.id;
    if (!targetId || !message.sourceRef) return;
    const now = message.at || Date.now();
    setAgentThreads((prev) => prev.map((thread) => {
      if (thread.id !== targetId) return thread;
      const messageIndex = thread.messages.findIndex((item) => item.sourceRef === message.sourceRef);
      if (messageIndex >= 0) {
        const messages = [...thread.messages];
        const previous = messages[messageIndex];
        messages[messageIndex] = {
          ...previous,
          role: message.role,
          title: message.title || previous.title,
          content: message.appendContent ? `${previous.content || ""}${message.content}` : message.content,
          status: message.status || previous.status,
          at: now,
          sourceRef: message.sourceRef,
        };
        return {
          ...thread,
          title: message.task ? compactThreadTitle(message.task, thread.title) : thread.title,
          task: message.task || thread.task,
          summary: messages[messageIndex].content || thread.summary,
          status: message.status || thread.status,
          updatedAt: now,
          messages,
        };
      }
      const nextMessage = createAgentThreadMessage({
        role: message.role,
        title: message.title,
        content: message.content,
        status: message.status,
        at: now,
        sourceRef: message.sourceRef,
      });
      return {
        ...thread,
        title: message.task ? compactThreadTitle(message.task, thread.title) : thread.title,
        task: message.task || thread.task,
        summary: message.content || thread.summary,
        status: message.status || thread.status,
        updatedAt: now,
        messages: [...thread.messages, nextMessage].slice(-36),
      };
    }));
  };

  const runTerminalCommand = async (execute = false) => {
    const command = terminalCommand.command.trim();
    if (!command) return;
    const startedAt = Date.now();
    const request = asRecord({
      command,
      cwd: ".",
      timeout_seconds: command.includes("healthcheck_bridge.py") ? 90 : 45,
      execute,
    });
    setTerminalCommand({
      command,
      status: "running",
      detail: execute ? "正在请求 Gateway 执行 allowlist 验证命令。" : "正在请求 Gateway 校验命令草案。",
      at: startedAt,
      request,
      result: null,
    });
    appendRuntimeLog({
      channel: "terminal",
      title: execute ? "终端执行请求" : "终端校验请求",
      detail: command,
      status: "running",
      at: startedAt,
    });
    if (!state.online) {
      const detail = "Gateway 离线，无法校验或执行命令。";
      setTerminalCommand({ command, status: "offline", detail, at: Date.now(), request, result: null });
      appendRuntimeLog({ channel: "terminal", title: "终端命令未发送", detail, status: "offline" });
      return;
    }
    try {
      const result = await bridgeAction("run_command", request);
      const status = asString(result.status, "ok");
      const detail = terminalCommandResultText(result);
      setTerminalCommand({ command, status, detail, at: Date.now(), request, result });
      appendRuntimeLog({
        channel: "terminal",
        title: execute ? "终端 allowlist 执行" : "终端命令校验",
        detail,
        status,
      });
      appendAgentThreadMessage({
        role: "tool",
        title: execute ? "终端 allowlist 执行" : "终端命令校验",
        content: `$ ${command}\n${detail}`,
        status,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "终端命令请求失败";
      setTerminalCommand({ command, status: "error", detail, at: Date.now(), request, result: null });
      appendRuntimeLog({
        channel: "terminal",
        title: "终端命令失败",
        detail,
        status: "error",
      });
      appendAgentThreadMessage({
        role: "tool",
        title: "终端命令失败",
        content: `$ ${command}\n${detail}`,
        status: "error",
      });
    }
  };

  const createAgentThreadFromCommand = () => {
    const task = commandTask.trim() || "继续推进灵枢 LumenOS Personal Agent OS";
    const thread = createAgentThreadRecord({
      task,
      title: compactThreadTitle(task, "新 Agent 线程"),
      status: "current",
      summary: activeWorkspace ? `已绑定工作区：${activeWorkspace.title}` : "未绑定工作区，可先生成任务草案。",
      workspaceId: activeWorkspace?.book.id ?? null,
      workspaceTitle: activeWorkspace?.title,
      workspaceDomain: activeWorkspace?.domain,
    });
    setAgentThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    setCommandTask(task);
    setActiveView("agent");
    setDetailTab("overview");
  };

  const selectAgentThread = (thread: AgentThreadRecord) => {
    setActiveThreadId(thread.id);
    if (thread.task) setCommandTask(thread.task);
    setActiveView("agent");
    setDetailTab("overview");
  };

  const archiveAgentThread = (threadId: string) => {
    const now = Date.now();
    setAgentThreads((prev) => prev.map((thread) => thread.id === threadId
      ? {
        ...thread,
        status: "archived",
        archivedAt: now,
        updatedAt: now,
        events: [{
          id: `event-${uid()}`,
          kind: "system" as const,
          title: "线程归档",
          detail: "线程已归档，保留历史事件和审批摘要。",
          status: "archived",
          at: now,
        }, ...thread.events].slice(0, 24),
      }
      : thread));
  };

  const restoreAgentThread = (threadId: string) => {
    const now = Date.now();
    setAgentThreads((prev) => prev.map((thread) => thread.id === threadId
      ? {
        ...thread,
        status: "current",
        archivedAt: undefined,
        updatedAt: now,
        events: [{
          id: `event-${uid()}`,
          kind: "system" as const,
          title: "线程恢复",
          detail: "线程已恢复为可继续执行状态。",
          status: "current",
          at: now,
        }, ...thread.events].slice(0, 24),
      }
      : thread));
    setActiveThreadId(threadId);
    setActiveView("agent");
  };

  const bindAgentThreadToActiveWorkspace = (threadId: string) => {
    if (!activeWorkspace) return;
    const now = Date.now();
    setAgentThreads((prev) => prev.map((thread) => thread.id === threadId
      ? {
        ...thread,
        workspaceId: activeWorkspace.book.id,
        workspaceTitle: activeWorkspace.title,
        workspaceDomain: activeWorkspace.domain,
        summary: `已绑定到工作区：${activeWorkspace.title}`,
        updatedAt: now,
        contextAttachments: mergeAgentThreadContextAttachments(thread.contextAttachments, [createAgentThreadContextAttachment({
          kind: "workspace",
          title: activeWorkspace.title,
          detail: `${activeWorkspace.domain} · ${activeWorkspace.files} 个文件 · ${formatNumber(activeWorkspace.words)} 字`,
          ref: activeWorkspace.book.id,
          source: "workspace",
          status: "bound",
          at: now,
        })]),
        events: [{
          id: `event-${uid()}`,
          kind: "system" as const,
          title: "绑定工作区",
          detail: `线程已绑定到 ${activeWorkspace.title} · ${activeWorkspace.domain}。`,
          status: "bound",
          at: now,
        }, ...thread.events].slice(0, 24),
        messages: [...thread.messages, createAgentThreadMessage({
          role: "system",
          title: "绑定工作区",
          content: `线程已绑定到 ${activeWorkspace.title} · ${activeWorkspace.domain}。`,
          status: "bound",
          at: now,
        })].slice(-36),
      }
      : thread));
    appendRuntimeLog({
      channel: "output",
      title: "线程已绑定工作区",
      detail: `当前线程已绑定到 ${activeWorkspace.title}。`,
      status: "bound",
    });
  };

  const exportAgentThread = (threadId: string) => {
    const thread = agentThreads.find((item) => item.id === threadId);
    if (!thread) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `lumenos-agent-thread-${artifactSafeName(thread.title)}-${timestamp}.md`;
    downloadTextArtifact(filename, agentThreadExportMarkdown(thread), "text/markdown;charset=utf-8");
    appendRuntimeLog({
      channel: "output",
      title: "线程已导出",
      detail: `已导出「${thread.title}」的消息流与事件轨迹。`,
      status: "saved",
    });
  };

  const branchAgentThread = (threadId: string, messageId?: string) => {
    const original = agentThreads.find((thread) => thread.id === threadId);
    if (!original) return;
    const now = Date.now();
    const messageIndex = messageId ? original.messages.findIndex((message) => message.id === messageId) : -1;
    const branchMessages = (messageIndex >= 0 ? original.messages.slice(0, messageIndex + 1) : original.messages).slice(-32);
    const checkpointTitle = messageIndex >= 0 ? original.messages[messageIndex]?.title || "选中消息" : "最新状态";
    const branchSummary = `从「${original.title}」的「${checkpointTitle}」创建非破坏性分支。`;
    const branch = {
      ...original,
      id: `thread-${uid()}`,
      title: compactThreadTitle(`分支 · ${original.title}`, "Agent 分支线程"),
      status: "branch",
      summary: branchSummary,
      createdAt: now,
      updatedAt: now,
      archivedAt: undefined,
      events: [{
        id: `event-${uid()}`,
        kind: "system" as const,
        title: messageId ? "回滚分支" : "创建分支",
        detail: branchSummary,
        status: "branch",
        at: now,
      }, ...original.events].slice(0, 24),
      messages: [...branchMessages, createAgentThreadMessage({
        role: "system",
        title: messageId ? "回滚分支" : "创建分支",
        content: branchSummary,
        status: "branch",
        at: now,
      })].slice(-36),
    };
    setAgentThreads((prev) => [branch, ...prev]);
    setActiveThreadId(branch.id);
    setCommandTask(branch.task);
    setActiveView("agent");
    appendRuntimeLog({
      channel: "output",
      title: messageId ? "线程回滚分支已创建" : "线程分支已创建",
      detail: branchSummary,
      status: "branch",
    });
  };

  const deleteAgentThread = (threadId: string) => {
    const thread = agentThreads.find((item) => item.id === threadId);
    if (!thread) return;
    const ok = window.confirm(`删除本地线程「${thread.title}」？这只会移除浏览器本地线程记录，不会删除项目文件、审批队列或 Gateway 记录。`);
    if (!ok) return;
    setAgentThreads((prev) => {
      const next = prev.filter((item) => item.id !== threadId);
      return next.length ? next : [createAgentThreadRecord({
        workspaceId: activeWorkspace?.book.id ?? null,
        workspaceTitle: activeWorkspace?.title,
        workspaceDomain: activeWorkspace?.domain,
      })];
    });
    if (activeThreadId === threadId) setActiveThreadId(null);
    appendRuntimeLog({
      channel: "output",
      title: "本地线程已删除",
      detail: `已移除「${thread.title}」的本地线程记录；项目文件和审批记录未被修改。`,
      status: "deleted",
    });
  };

  const refresh = useCallback(async () => {
    appendRuntimeLog({
      channel: "gateway",
      title: "刷新 Gateway",
      detail: "拉取 health / Provider / Memory / Skills / Worker / Approval / Phase / Completion 状态。",
      status: "running",
    });
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    const results = await Promise.all([
      captureJson("health", fetchJson(`${GATEWAY_ORIGIN}/health`)),
      captureJson("provider", bridgeAction("provider_catalog", { limit: 12 })),
      captureJson("memory", bridgeAction("memory_status", {})),
      captureJson("skill", bridgeAction("skill_status", {})),
      captureJson("worker", bridgeAction("worker_status", {})),
      captureJson("approval", bridgeAction("approval_status", { limit: 20 })),
      captureJson("phase", bridgeAction("phase_audit", {})),
      captureJson("completion", bridgeAction("completion_audit", {})),
    ]);
    const byLabel = new Map(results.map((result) => [result.label, result]));
    const successCount = results.filter((result) => result.data).length;
    const errors = results.filter((result) => result.error).map((result) => `${result.label}: ${result.error}`);
    appendRuntimeLog({
      channel: "gateway",
      title: "Gateway 刷新完成",
      detail: successCount > 0 ? `${successCount}/${results.length} 项返回；${errors.length ? errors.join(" / ") : "无错误"}` : errors.join(" / ") || "Gateway 连接失败",
      status: successCount > 0 ? "ok" : "offline",
    });
    setState({
      loading: false,
      online: successCount > 0,
      error: successCount > 0 ? errors.join(" / ") : errors.join(" / ") || "Gateway 连接失败",
      refreshedAt: Date.now(),
      health: byLabel.get("health")?.data ?? null,
      provider: byLabel.get("provider")?.data ?? null,
      memory: byLabel.get("memory")?.data ?? null,
      skill: byLabel.get("skill")?.data ?? null,
      worker: byLabel.get("worker")?.data ?? null,
      approval: byLabel.get("approval")?.data ?? null,
      phase: byLabel.get("phase")?.data ?? null,
      completion: byLabel.get("completion")?.data ?? null,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runQuickAction = useCallback(async (label: string, action: string, payload: JsonRecord = {}) => {
    setQuickAction({ label, status: "running", detail: "执行中" });
    appendRuntimeLog({
      channel: "output",
      title: label,
      detail: `开始执行 ${action}`,
      status: "running",
    });
    try {
      const result = await bridgeAction(action, payload);
      const message = asString(result.message, asString(result.status, "ok"));
      setQuickAction({ label, status: "ok", detail: message });
      appendRuntimeLog({
        channel: "output",
        title: label,
        detail: message,
        status: "ok",
      });
      void refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "执行失败";
      setQuickAction({ label, status: "error", detail });
      appendRuntimeLog({
        channel: "output",
        title: label,
        detail,
        status: "error",
      });
    }
  }, [refresh]);

  const runProviderAction = useCallback(async (label: string, action: "provider_status" | "provider_probe" | "provider_catalog", payload: JsonRecord = {}) => {
    const startedAt = Date.now();
    setQuickAction({ label, status: "running", detail: "执行中" });
    setProviderAction({ label, action, status: "running", detail: "等待 Gateway 响应", data: null, at: startedAt });
    appendRuntimeLog({
      channel: "output",
      title: label,
      detail: `Provider action: ${action}`,
      status: "running",
    });
    try {
      const result = await bridgeAction(action, payload);
      const nested = asRecord(result[action]);
      const nestedStatus = asString(nested.status);
      const status = nestedStatus || asString(result.status, "ok");
      const detail = asString(nested.reason, asString(result.message, status));
      setProviderAction({ label, action, status, detail, data: result, at: Date.now() });
      setQuickAction({ label, status, detail });
      appendRuntimeLog({
        channel: "output",
        title: label,
        detail,
        status,
      });
      if (status === "approval_required") {
        const approvalId = asString(result.approval_id);
        appendRuntimeLog({
          channel: "approvals",
          title: label,
          detail: approvalId ? `${detail} · approval ${approvalId}` : detail,
          status,
        });
        appendAgentThreadEvent({
          kind: "approval",
          title: label,
          detail: approvalId ? `${detail} · approval ${approvalId}` : detail,
          status,
          approvalId,
          approvalDelta: approvalId ? 1 : 0,
          contextAttachments: approvalId ? [createAgentThreadContextAttachment({
            kind: "approval",
            title: `审批 ${compactApprovalId(approvalId)}`,
            detail: `${action} · ${detail}`,
            ref: approvalId,
            source: "Provider",
            status,
          })] : [],
        });
      }
      if (action === "provider_catalog") void refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "执行失败";
      setProviderAction({ label, action, status: "error", detail, data: null, at: Date.now() });
      setQuickAction({ label, status: "error", detail });
      appendRuntimeLog({
        channel: "output",
        title: label,
        detail,
        status: "error",
      });
    }
  }, [refresh]);

  const capabilities = runtimeCapabilities(state);
  const matrix = toolMatrix(state);
  const enabledTools = matrix.filter((item) => item.enabled);
  const gatedTools = matrix.filter((item) => !item.enabled);
  const memory = asRecord(state.memory?.memory);
  const memoryDimensions = asRecord(memory.dimensions);
  const providerCatalog = asRecord(state.provider?.provider_catalog);
  const providerGroups = asRecordList(providerCatalog.groups);
  const providerPresets = asRecordList(providerCatalog.presets);
  const skillPayload = asRecord(state.skill?.skills ?? state.skill?.skill_status ?? state.skill?.skill);
  const skillLibrary = asRecord(skillPayload.local_library);
  const workerPayload = asRecord(state.worker?.workers);
  const approvalPayload = asRecord(state.approval?.approval_status);
  const approvalSummaries = asRecordList(approvalPayload.summaries);
  const approvalRecords = asRecordList(approvalPayload.records);
  const approvalByAction = asRecord(approvalPayload.by_action);
  const approvalByStatus = asRecord(approvalPayload.by_status);
  const approvalActionOptions = Object.keys(approvalByAction).sort();
  const approvalStatusOptions = Object.keys(approvalByStatus).sort();
  const filteredApprovalSummaries = approvalSummaries.filter((item) => {
    if (approvalActionFilter !== "all" && asString(item.action) !== approvalActionFilter) return false;
    if (approvalStatusFilter !== "all" && asString(item.status) !== approvalStatusFilter) return false;
    return true;
  });
  const selectedApprovalSummary = filteredApprovalSummaries.find((item) => asString(item.id) === selectedApprovalId)
    || filteredApprovalSummaries[0]
    || approvalSummaries[0]
    || null;
  const selectedApprovalRecord = selectedApprovalSummary
    ? approvalRecords.find((item) => asString(item.id) === asString(selectedApprovalSummary.id)) || null
    : null;
  const selectedApprovalRequest = asRecord(selectedApprovalRecord?.request);
  const selectedApprovalResult = asRecord(selectedApprovalRecord?.result);
  const selectedApprovalProposal = asRecord(selectedApprovalSummary?.proposal);
  const selectedApprovalStatus = asString(selectedApprovalSummary?.status, "pending");
  const selectedApprovalAction = asString(selectedApprovalSummary?.action, "unknown");
  const selectedApprovalIdValue = asString(selectedApprovalSummary?.id);
  const localApprovalDecisionResult = approvalDecision.approvalId === selectedApprovalIdValue
    ? asRecord(asRecord(approvalDecision.result?.approval_decide).decision ?? approvalDecision.result?.approval_decide)
    : {};
  const selectedApprovalDecision = Object.keys(asRecord(selectedApprovalRecord?.decision ?? selectedApprovalSummary?.decision)).length
    ? asRecord(selectedApprovalRecord?.decision ?? selectedApprovalSummary?.decision)
    : localApprovalDecisionResult;
  const selectedApprovalDetail = approvalDetailTab === "request"
    ? selectedApprovalRequest
    : approvalDetailTab === "result"
      ? selectedApprovalResult
      : approvalDetailTab === "decision"
        ? selectedApprovalDecision
        : selectedApprovalProposal;
  const selectedApprovalIsTerminal = ["executed", "rejected", "already_decided"].includes(selectedApprovalStatus);
  const selectedApprovalCanReject = Boolean(state.online && selectedApprovalIdValue && !selectedApprovalIsTerminal && approvalDecision.status !== "running");
  const selectedApprovalCanExecuteWrite = Boolean(
    state.online
      && selectedApprovalIdValue
      && selectedApprovalAction === "write_file"
      && !selectedApprovalIsTerminal
      && approvalDecision.status !== "running",
  );
  const activeThreadApprovalIdSet = new Set(activeThread?.approvalIds || []);
  const activeThreadApprovalSnapshotMap = new Map((activeThread?.approvalSnapshots || []).map((item) => [item.id, item]));
  const approvalSummaryById = new Map(approvalSummaries.map((item) => [asString(item.id), item]));
  const activeThreadLinkedApprovalRows = (activeThread?.approvalIds || [])
    .map((id) => {
      const live = approvalSummaryById.get(id);
      if (live) return live;
      const snapshot = activeThreadApprovalSnapshotMap.get(id);
      return snapshot ? asRecord({
        id,
        action: snapshot.action,
        status: snapshot.status,
        target: snapshot.target,
        message: snapshot.message,
        created_at: snapshot.createdAt,
        synced_at: snapshot.syncedAt,
        source: "thread_snapshot",
      }) : asRecord({
        id,
        action: "approval",
        status: "unknown",
        target: "Gateway 最近队列未命中",
        message: "等待下一次 approval_status 同步。",
        synced_at: 0,
        source: "thread_id",
      });
    })
    .slice(0, 6);
  const selectedApprovalLinkedToActiveThread = Boolean(
    activeThread && selectedApprovalSummary && activeThreadApprovalIdSet.has(asString(selectedApprovalSummary.id)),
  );
  const linkApprovalToActiveThread = (approval = selectedApprovalSummary) => {
    const approvalId = asString(approval?.id);
    if (!activeThread || !approvalId) return;
    const now = Date.now();
    const action = asString(approval?.action, "approval");
    const target = asString(approval?.target, "未声明目标");
    const detail = `${action} · ${target} · ${asString(approval?.message, "等待人工复核。")}`;
    const attachment = createAgentThreadContextAttachment({
      kind: "approval",
      title: `审批 ${compactApprovalId(approvalId)}`,
      detail,
      ref: approvalId,
      source: "Gateway approvals",
      status: asString(approval?.status, "pending"),
      at: now,
    });
    const approvalSnapshot = approvalSnapshotFromRecord(approval, now);
    setAgentThreads((prev) => prev.map((thread) => {
      if (thread.id !== activeThread.id) return thread;
      const approvalIds = Array.from(new Set([...thread.approvalIds, approvalId]));
      return {
        ...thread,
        approvalIds,
        approvalSnapshots: approvalSnapshot
          ? mergeAgentThreadApprovalSnapshots(thread.approvalSnapshots, [approvalSnapshot])
          : thread.approvalSnapshots,
        approvalCount: Math.max(thread.approvalCount, approvalIds.length),
        contextAttachments: mergeAgentThreadContextAttachments(thread.contextAttachments, [attachment]),
        updatedAt: now,
        events: [{
          id: `event-${uid()}`,
          kind: "approval" as const,
          title: "关联审批",
          detail: `已把审批 ${approvalId} 关联到当前 Agent 线程。`,
          status: "linked",
          at: now,
        }, ...thread.events].slice(0, 24),
        messages: [...thread.messages, createAgentThreadMessage({
          role: "tool",
          title: "关联审批",
          content: `已把审批 ${approvalId} 关联到当前 Agent 线程。\n${detail}`,
          status: "linked",
          at: now,
        })].slice(-36),
      };
    }));
    appendRuntimeLog({
      channel: "approvals",
      title: "审批已关联当前线程",
      detail: `${approvalId} · ${activeThread.title}`,
      status: "linked",
    });
  };

  const decideSelectedApproval = async (decision: "reject" | "execute") => {
    const approval = selectedApprovalSummary;
    const approvalId = asString(approval?.id);
    const action = asString(approval?.action, "unknown");
    if (!state.online || !approvalId) return;
    if (decision === "execute" && action !== "write_file") return;
    const request = {
      approval_id: approvalId,
      decision,
      reason: decision === "reject"
        ? `用户在审批复核台拒绝 ${action} 审批。`
        : `用户在审批复核台执行已排队的 write_file 审批。`,
    };
    const startedAt = Date.now();
    setApprovalDecision({
      approvalId,
      decision,
      status: "running",
      detail: decision === "reject" ? "正在记录拒绝决策..." : "正在请求 Gateway 执行 write_file 审批...",
      at: startedAt,
      request,
      result: null,
    });
    try {
      const result = await bridgeAction("approval_decide", request, { execute: decision === "execute" });
      const decisionResult = asRecord(result.approval_decide);
      const rawStatus = asString(decisionResult.status, asString(result.status, "unknown"));
      const detail = asString(decisionResult.message, asString(result.message, "审批决策已记录。"));
      setApprovalDecision({
        approvalId,
        decision,
        status: rawStatus,
        detail,
        at: Date.now(),
        request,
        result,
      });
      const attachment = createAgentThreadContextAttachment({
        kind: "approval",
        title: `审批 ${compactApprovalId(approvalId)}`,
        detail: `${decision === "reject" ? "拒绝" : "执行 write_file"} · ${action} · ${detail}`,
        ref: approvalId,
        source: "approval_decide",
        status: rawStatus,
        at: Date.now(),
      });
      appendRuntimeLog({
        channel: "approvals",
        title: decision === "reject" ? "审批已拒绝" : "write_file 审批执行结果",
        detail: `${approvalId} · ${detail}`,
        status: rawStatus,
      });
      appendAgentThreadEvent({
        kind: "approval",
        title: decision === "reject" ? "拒绝审批" : "执行 write_file 审批",
        detail: `${approvalId} · ${detail}`,
        status: rawStatus,
        approvalId,
        contextAttachments: [attachment],
      });
      setApprovalDetailTab("decision");
      setBottomPanelTab("approvals");
      void refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "审批决策提交失败";
      setApprovalDecision({
        approvalId,
        decision,
        status: "error",
        detail,
        at: Date.now(),
        request,
        result: null,
      });
      appendRuntimeLog({
        channel: "approvals",
        title: "审批决策失败",
        detail: `${approvalId} · ${detail}`,
        status: "error",
      });
      appendAgentThreadEvent({
        kind: "approval",
        title: "审批决策失败",
        detail: `${approvalId} · ${detail}`,
        status: "error",
        approvalId,
      });
    }
  };
  const phasePayload = asRecord(state.phase?.phase_audit ?? state.phase?.audit ?? state.phase);
  const completionPayload = asRecord(state.completion?.completion_audit ?? state.completion?.audit ?? state.completion);
  const workerCount = deepNumber(state.worker, ["job_count", "jobCount", "worker_count", "workers"]) ?? 0;
  const approvalQueueCount = asNumber(approvalPayload.count, approvalSummaries.length);
  const phaseStatus = asString(phasePayload.overall, asString(phasePayload.status, state.phase ? "ok" : "offline"));
  const completionPartial = deepNumber(completionPayload, ["partial"]) ?? 0;
  const completionMissing = deepNumber(completionPayload, ["missing"]) ?? 0;

  const toolHighlights = [
    "read_file",
    "write_file",
    "worker_run:model_task",
    "worker_cancel",
    "provider_catalog",
    "mcp_call",
    "skill_run",
    "scheduler_install",
  ];
  const visibleMatrix = matrix
    .filter((item) => toolHighlights.includes(item.action))
    .concat(matrix.filter((item) => !toolHighlights.includes(item.action)).slice(0, 4))
    .slice(0, 10);
  const capabilitySummary = asRecord(capabilities.capability_summary);
  const safetyLayers = asRecordList(
    state.health?.safety_layers
      ?? state.memory?.safety_layers
      ?? state.skill?.safety_layers
      ?? state.worker?.safety_layers,
  );
  const phaseRows = asRecordList(phasePayload.phases);
  const memoryRecentL1 = asRecordList(memory.recent_l1);
  const memoryRecentL2 = asRecordList(memory.recent_l2);
  const dimensionRows = Object.entries(memoryDimensions).map(([key, value]) => ({ key, record: asRecord(value) }));
  const memoryRows = [
    ...memoryRecentL2.map((item, index) => buildMemoryManagerRow(item, "L2", index)),
    ...memoryRecentL1.map((item, index) => buildMemoryManagerRow(item, "L1", index)),
  ].sort((a, b) => dateTimeValue(b.at) - dateTimeValue(a.at));
  const memoryDimensionOptions = Array.from(new Set([
    ...dimensionRows.map(({ key }) => key).filter(Boolean),
    ...memoryRows.map((row) => row.dimension).filter(Boolean),
  ]));
  const normalizedMemorySearch = memorySearch.trim().toLowerCase();
  const filteredMemoryRows = memoryRows.filter((row) => {
    if (memoryKindFilter !== "all" && row.kind !== memoryKindFilter) return false;
    if (memoryDimensionFilter !== "all" && row.dimension !== memoryDimensionFilter) return false;
    if (normalizedMemorySearch && !row.searchable.includes(normalizedMemorySearch)) return false;
    return true;
  });
  const selectedMemoryRow = filteredMemoryRows.find((row) => row.id === selectedMemoryId)
    || memoryRows.find((row) => row.id === selectedMemoryId)
    || filteredMemoryRows[0]
    || memoryRows[0]
    || null;

  useEffect(() => {
    if (!memoryRows.length) {
      if (selectedMemoryId) setSelectedMemoryId(null);
      return;
    }
    if (selectedMemoryId && memoryRows.some((row) => row.id === selectedMemoryId)) return;
    setSelectedMemoryId(filteredMemoryRows[0]?.id || memoryRows[0].id);
  }, [memoryRows, filteredMemoryRows, selectedMemoryId]);

  useEffect(() => {
    if (!approvalSummaries.length || !filteredApprovalSummaries.length) {
      if (selectedApprovalId) setSelectedApprovalId(null);
      return;
    }
    if (selectedApprovalId && filteredApprovalSummaries.some((item) => asString(item.id) === selectedApprovalId)) return;
    setSelectedApprovalId(asString(filteredApprovalSummaries[0].id));
  }, [approvalSummaries, filteredApprovalSummaries, selectedApprovalId]);

  useEffect(() => {
    if (!approvalSummaries.length || !agentThreads.some((thread) => thread.approvalIds.length)) return;
    const syncedAt = Date.now();
    const snapshotsById = new Map<string, AgentThreadApprovalSnapshot>();
    approvalSummaries.forEach((item) => {
      const snapshot = approvalSnapshotFromRecord(item, syncedAt);
      if (snapshot) snapshotsById.set(snapshot.id, snapshot);
    });
    if (!snapshotsById.size) return;
    let changedCount = 0;
    setAgentThreads((prev) => {
      let changed = false;
      const next = prev.map((thread) => {
        const incoming = thread.approvalIds
          .map((id) => snapshotsById.get(id))
          .filter((item): item is AgentThreadApprovalSnapshot => Boolean(item));
        if (!incoming.length) return thread;
        const previousById = new Map(thread.approvalSnapshots.map((item) => [item.id, item]));
        const hasSnapshotChange = incoming.some((item) => {
          const previous = previousById.get(item.id);
          return !previous
            || previous.action !== item.action
            || previous.status !== item.status
            || previous.target !== item.target
            || previous.message !== item.message;
        });
        if (!hasSnapshotChange) return thread;
        changed = true;
        changedCount += 1;
        const attachments = incoming.map((item) => createAgentThreadContextAttachment({
          kind: "approval",
          title: `审批 ${compactApprovalId(item.id)}`,
          detail: `${item.action} · ${item.target} · ${item.message}`,
          ref: item.id,
          source: "approval_status sync",
          status: item.status,
          at: syncedAt,
        }));
        return {
          ...thread,
          approvalSnapshots: mergeAgentThreadApprovalSnapshots(thread.approvalSnapshots, incoming),
          contextAttachments: mergeAgentThreadContextAttachments(thread.contextAttachments, attachments),
          approvalCount: Math.max(thread.approvalCount, thread.approvalIds.length),
          updatedAt: syncedAt,
        };
      });
      return changed ? next : prev;
    });
    if (changedCount > 0) {
      appendRuntimeLog({
        channel: "approvals",
        title: "线程审批状态已同步",
        detail: `从 Gateway approval_status 同步 ${changedCount} 个线程的关联审批快照；未执行审批。`,
        status: "synced",
        at: syncedAt,
      });
    }
  }, [approvalSummaries, agentThreads]);

  const createMemoryDraftAction = (kind: MemoryDraftKind, row = selectedMemoryRow) => {
    if (!row) {
      const draft: MemoryDraftActionSnapshot = {
        kind,
        title: memoryDraftActionTitle(kind),
        status: "error",
        detail: "请先选择一条 L1/L2 记忆记录。",
        at: Date.now(),
        memoryId: "",
        memoryKind: "L1",
        request: null,
        result: null,
      };
      setMemoryDraftAction(draft);
      return;
    }
    const title = memoryDraftActionTitle(kind);
    const targetId = asString(row.record.id, row.id);
    const action = kind === "update" ? "memory_update" : kind === "freeze" ? "memory_freeze" : "memory_delete";
    const request: JsonRecord = {
      action,
      purpose: `Memory Manager ${memoryDraftActionTitle(kind)}：排队审批，不直接修改 AutoDream L1/L2。`,
      payload: {
        target_id: asString(row.record.id, row.id),
        target_kind: row.kind,
        dimension: row.dimension,
        reason: kind === "update"
          ? "审阅后更新记忆摘要/标签/置信度；提交后仅进入审批队列。"
          : kind === "freeze"
            ? "冻结该记忆，避免后续自动合并或召回污染；提交后仅进入审批队列。"
            : "删除该记忆需要人工复核；提交后仅进入审批队列。",
        ...(kind === "update" ? {
          patch: {
            summary: row.summary,
            tags: Array.from(new Set(["memory-review", ...row.tags])).slice(0, 8),
            importance: Math.max(1, Math.min(5, asNumber(row.record.importance, row.kind === "L2" ? 4 : 3))),
          },
        } : {}),
      },
    };
    const detail = kind === "update"
      ? `已生成 memory_update 编辑草案：${targetId}，提交后只进入审批队列。`
      : kind === "freeze"
        ? `已生成 memory_freeze 冻结草案：${targetId}，提交后只进入审批队列。`
        : `已生成 memory_delete 删除草案：${targetId}，提交后只进入审批队列。`;
    const draft: MemoryDraftActionSnapshot = {
      kind,
      title,
      status: "draft",
      detail,
      at: Date.now(),
      memoryId: row.id,
      memoryKind: row.kind,
      request,
      result: null,
    };
    setSelectedMemoryId(row.id);
    setMemoryDraftAction(draft);
    appendRuntimeLog({
      channel: "approvals",
      title,
      detail: `${row.kind} · ${row.dimension} · ${detail}`,
      status: "draft",
    });
    appendAgentThreadEvent({
      kind: "note",
      title,
      detail,
      status: "draft",
    });
  };

  const submitMemoryManagementDraft = async () => {
    const request = memoryDraftAction?.request;
    const action = asString(request?.action);
    const payload = asRecord(request?.payload);
    if (!memoryDraftAction || !action || !Object.keys(payload).length) {
      setMemoryDraftAction({
        kind: "update",
        title: "编辑草案",
        status: "error",
        detail: "请先生成一条记忆管理草案。",
        at: Date.now(),
        memoryId: selectedMemoryRow?.id || "",
        memoryKind: selectedMemoryRow?.kind || "L1",
        request: null,
        result: null,
      });
      return;
    }
    if (!state.online) {
      setMemoryDraftAction((prev) => prev ? {
        ...prev,
        status: "error",
        detail: "Gateway 离线，无法提交记忆管理审批。",
        at: Date.now(),
      } : prev);
      return;
    }
    setMemoryDraftAction((prev) => prev ? {
      ...prev,
      status: "running",
      detail: `正在提交 ${action} 审批草案；不会直接修改 L1/L2。`,
      at: Date.now(),
    } : prev);
    appendRuntimeLog({
      channel: "approvals",
      title: "提交记忆管理审批",
      detail: `${action} · ${asString(payload.target_id, "memory")}`,
      status: "running",
    });
    try {
      const result = await bridgeAction(action, payload);
      const detail = asString(result.message, `${action} 已进入审批队列。`);
      setMemoryDraftAction((prev) => prev ? {
        ...prev,
        status: asString(result.status, "ok"),
        detail,
        result,
        at: Date.now(),
      } : prev);
      appendRuntimeLog({
        channel: "approvals",
        title: "记忆管理审批已排队",
        detail: `${detail} · approval ${asString(result.approval_id, "pending")}`,
        status: asString(result.status, "ok"),
      });
      appendAgentThreadEvent({
        kind: "note",
        title: "记忆管理审批已排队",
        detail: `${detail} · approval ${asString(result.approval_id, "pending")}`,
        status: asString(result.status, "ok"),
        approvalId: asString(result.approval_id),
        approvalDelta: asString(result.approval_id) ? 1 : 0,
        contextAttachments: asString(result.approval_id) ? [createAgentThreadContextAttachment({
          kind: "approval",
          title: `审批 ${compactApprovalId(asString(result.approval_id))}`,
          detail: `${action} · ${asString(payload.target_id, "memory")} · ${detail}`,
          ref: asString(result.approval_id),
          source: "Memory Manager",
          status: asString(result.status, "ok"),
        })] : [],
      });
      void refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "记忆管理审批提交失败";
      setMemoryDraftAction((prev) => prev ? {
        ...prev,
        status: "error",
        detail,
        result: null,
        at: Date.now(),
      } : prev);
      appendRuntimeLog({
        channel: "approvals",
        title: "记忆管理审批失败",
        detail,
        status: "error",
      });
    }
  };

  const skillRecentCandidates = asRecordList(skillPayload.recent_candidates);
  const skillRecentActivated = asRecordList(skillPayload.recent_activated);
  const skillLocalRoots = asRecordList(skillLibrary.roots);
  const skillLocalSkills = asRecordList(skillLibrary.skills);
  const skillRecentEvents = asRecordList(skillPayload.recent_events);
  const workerRecentJobs = asRecordList(workerPayload.recent_jobs);
  const workerRecentEvents = asRecordList(workerPayload.recent_events);
  const workerMergeProposals = asRecordList(workerPayload.merge_proposals);
  const providerRows = asRecordList(providerCatalog.providers);
  const providerStatus = asString(state.provider?.status, state.provider ? "ok" : "offline");
  const providerMessage = asString(state.provider?.message);
  const providerReady = providerStatus === "ok" && Object.keys(providerCatalog).length > 0;
  const effectiveProvider = settings.provider || inferProvider(settings.apiUrl);
  const effectiveProviderLabel = PROVIDER_LABELS[effectiveProvider];
  const endpointLabel = displayEndpoint(settings.apiUrl);
  const endpointLocal = isLocalEndpoint(settings.apiUrl);
  const keyOptional = allowsEmptyApiKey(settings.apiUrl, effectiveProvider);
  const apiReady = isConfigured(settings);
  const settingsProfiles = settings.profiles || [];
  const activeProfile = settingsProfiles.find((profile) => profile.id === settings.activeProfileId) || null;
  const providerPayload: JsonRecord = {
    provider: effectiveProvider,
    api_url: settings.apiUrl,
    model_id: settings.modelId,
    model_name: settings.modelName,
    api_key: settings.apiKey,
    api_key_env: modelKeyEnv(effectiveProvider),
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
  };
  const frontendProviderRecords = PROVIDER_PRESETS.map(providerPresetRecord);
  const frontendProviderGroups = Object.entries(frontendProviderRecords.reduce<Record<string, number>>((acc, preset) => {
    const group = asString(preset.group, "global");
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {})).map(([id, count]) => ({ id, label: providerGroupName(id), count }));
  const frontendLocalCount = frontendProviderRecords.filter((preset) => asBoolean(preset.local)).length;
  const frontendRemoteCount = frontendProviderRecords.length - frontendLocalCount;
  const displayProviderPresets = providerPresets.length ? providerPresets : frontendProviderRecords.slice(0, 20);
  const displayProviderGroups = providerGroups.length
    ? providerGroups.map((group) => ({ id: asString(group.id, asString(group.label)), label: asString(group.label, asString(group.id, "group")), count: asNumber(group.count) }))
    : frontendProviderGroups;
  const totalProviderPresetCount = asNumber(providerCatalog.preset_count, providerPresets.length || PROVIDER_PRESETS.length);
  const providerActionData = providerAction.data || {};
  const providerActionResult = asRecord(
    providerAction.action === "provider_status"
      ? providerActionData.provider_status
      : providerAction.action === "provider_probe"
        ? providerActionData.provider_probe
        : providerAction.action === "provider_catalog"
          ? providerActionData.provider_catalog
          : {},
  );
  const providerActionConfig = asRecord(providerActionResult.config);
  const providerActionReadiness = asRecord(providerActionResult.readiness);
  const providerActionPolicy = asRecord(providerActionResult.policy);
  const providerActionWorkerPayload = asRecord(providerActionResult.model_worker_payload);
  const providerActionEnv = asRecord(providerActionResult.env);
  const hardCancelableJobs = workerRecentJobs.filter((job) => asBoolean(job.hard_cancel_supported)).length;
  const activeDomain = activeWorkspace ? activeWorkspace.domain : "Agent OS";
  const phaseBlueprint = [
    { id: "P1", title: "OS 工作台", status: "current", detail: "VS Code 式三栏布局、目标模式、Agent 运行台首屏" },
    { id: "P2", title: "记忆系统", status: "planned", detail: "L1/L2 管理器、上下文包、证据化写回" },
    { id: "P3", title: "Skills 与 Agent", status: "planned", detail: "Codex Skills、写作 Skills、领域 Agent 统一路由" },
    { id: "P4", title: "工具运行时", status: "planned", detail: "模型 Provider、Worker、MCP、审批、Diff 与权限矩阵" },
    { id: "P5", title: "自主与桌面", status: "planned", detail: "多工作区、KAIROS、Scheduler 草案、桌面长期运行" },
  ];
  const commandCenterRows: Array<{ id: string; label: string; command: string; detail: string; target: WorkbenchView; status: string }> = [
    {
      id: "context",
      label: "构建上下文包",
      command: "/context.build",
      detail: `L2 ${asNumber(memory.l2_count)} · 工作区 ${library.books.length} · Skills ${prompts.length + customPrompts.length}`,
      target: "memory",
      status: "ready",
    },
    {
      id: "skills",
      label: "匹配任务 Skills",
      command: "/skills.route",
      detail: `候选 ${asNumber(skillPayload.candidate_count)} · 已激活 ${asNumber(skillPayload.activated_count)} · 本地 ${skillLocalSkills.length}`,
      target: "skills",
      status: asNumber(skillPayload.local_skill_count, skillLocalSkills.length) ? "ready" : "pending",
    },
    {
      id: "tools",
      label: "审查工具权限",
      command: "/tools.audit",
      detail: `已开 ${enabledTools.length} · 受控 ${gatedTools.length} · 任意 shell ${statusLabel(asString(capabilities.arbitrary_shell, "disabled"))}`,
      target: "tools",
      status: gatedTools.length ? "approval_required" : "ready",
    },
    {
      id: "provider",
      label: "检查模型运行时",
      command: "/provider.status",
      detail: `${effectiveProviderLabel} · ${apiReady ? "API 就绪" : "API 待配置"} · ${totalProviderPresetCount} 个预设`,
      target: "providers",
      status: apiReady ? "ready" : "setup-needed",
    },
    {
      id: "worker",
      label: "查看后台任务",
      command: "/workers.review",
      detail: `任务 ${workerCount} · 草案 ${workerMergeProposals.length} · 硬取消 ${hardCancelableJobs}`,
      target: "workers",
      status: workerCount ? "running" : "pending",
    },
  ];
  const commandDomain = () => (
    activeView === "writing" || activeWorkspace?.domain.toLowerCase().includes("writing") || activeWorkspace?.domain.includes("写作")
      ? "writing"
      : "research"
  );
  const activeThreadContextItems = () => (activeThread?.contextAttachments || []).slice(0, 12).map((item) => asRecord({
    id: item.id,
    kind: item.kind,
    dimension: item.kind === "skill" ? "skill" : item.kind === "memory" ? "memory" : item.kind === "file" ? "file" : "thread",
    title: item.title,
    summary: item.detail,
    ref: item.ref,
    source: item.source,
    status: item.status,
    at: item.at,
    injected_by: "agent_thread",
  }));
  const mergeDraftContextItems = (threadItems: JsonRecord[], contextItems: JsonRecord[]) => {
    const seen = new Set<string>();
    return [...threadItems, ...contextItems].filter((item) => {
      const key = `${asString(item.injected_by)}:${asString(item.kind, asString(item.dimension))}:${asString(item.ref, asString(item.id, asString(item.title)))}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 18);
  };
  const buildContextPackPayload = (task: string, limit = 6): JsonRecord => {
    const domain = commandDomain();
    const threadItems = activeThreadContextItems();
    return {
      task,
      domain,
      dimension: "project",
      limit,
      thread_id: activeThread?.id || "",
      thread_title: activeThread?.title || "",
      workspace_id: activeThread?.workspaceId || activeWorkspace?.book.id || "",
      approval_ids: activeThread?.approvalIds || [],
      thread_context: threadItems,
      thread_context_policy: {
        mode: "compact-attachments",
        execution: "read-only-no-file-write",
        max_items: 12,
      },
    };
  };
  const buildCommandWorkerPayload = (task: string, mode: "preview" | "run" = "preview"): JsonRecord => {
    const domain = commandDomain();
    return {
      job_id: commandWorkerJobId(task, domain, mode),
      agent_id: "command-center",
      mode: "readonly-review",
      kind: "bridge_action",
      action: "context_pack",
      action_purpose: "命令中心只读后台复核上下文包、Skills 路由和工具边界。",
      payload: buildContextPackPayload(task),
    };
  };
  const buildAgentModelWorkerPayload = (task: string, mode: "preview" | "run" = "preview"): JsonRecord => {
    const domain = commandDomain();
    const contextPayload = buildContextPackPayload(task, 8);
    return {
      job_id: modelWorkerJobId(task, domain, mode),
      agent_id: activeThread?.id || "agent-thread",
      mode: mode === "run" ? "model-execution" : "model-preview",
      kind: "model_task",
      provider: effectiveProvider,
      api_url: settings.apiUrl,
      api_key: settings.apiKey,
      api_key_env: modelKeyEnv(effectiveProvider),
      model_id: settings.modelId,
      prompt: task,
      query: task,
      domain,
      context_limit: 8,
      current_text: selectedExplorerText.slice(0, 8000),
      system_prompt: [
        "你是灵枢 LumenOS 的受控 Agent Worker。",
        "只使用传入的 context_pack、thread_context、当前工作区片段和审批轨迹。",
        "输出中文，按：结论、证据、风险、下一步动作组织；不要声称已经写文件或运行命令。",
      ].join("\n"),
      temperature: settings.temperature,
      max_tokens: Math.min(settings.maxTokens || 1200, 1600),
      timeout_seconds: 45,
      execute_model: mode === "run",
      stream_model: mode === "run" && effectiveProvider === "openai-compatible",
      allow_remote_model: mode === "run" && endpointLocal,
      merge_target_path: "",
      merge_mode: "append",
      thread_id: contextPayload.thread_id,
      thread_title: contextPayload.thread_title,
      workspace_id: contextPayload.workspace_id,
      approval_ids: contextPayload.approval_ids,
      thread_context: contextPayload.thread_context,
      thread_context_policy: contextPayload.thread_context_policy,
    };
  };
  const buildLocalCommandDraft = (task: string, detail: string): CommandDraftSnapshot => {
    const domain = commandDomain();
    const threadContextItems = activeThreadContextItems();
    const localContextItems = [
      ...threadContextItems,
      activeWorkspace
        ? {
          dimension: "project",
          title: activeWorkspace.title,
          summary: `${activeWorkspace.domain} · ${activeWorkspace.files} 个文件 · ${formatNumber(activeWorkspace.words)} 字 · ${activeWorkspace.description}`,
        }
        : {
          dimension: "project",
          title: "未选择工作区",
          summary: "可先在工作区管理器挂载项目，再生成更精确的上下文包。",
        },
      ...memoryRecentL2.slice(0, 3),
      ...memoryRecentL1.slice(0, 2),
    ].map(asRecord).filter((item) => Object.keys(item).length > 0);
    const localSkillKeys = Array.from(new Set([
      "personal-os-coordinator",
      ...(domain === "writing" ? ["novel-creation-suite", "novel-kb-manager", "novel-distillation", "tomato-novel-auto-distill"] : ["source-integrity"]),
      ...skillRecentActivated.map((item) => asString(item.key, asString(item.id, asString(item.title)))),
      ...skillRecentCandidates.map((item) => asString(item.key, asString(item.id, asString(item.title)))),
    ].filter(Boolean))).slice(0, 10);
    const localExcluded = Array.from(new Set([
      ...gatedTools.map((tool) => tool.action),
      ...(domain === "writing" ? ["run_command", "code.compile", "package.install"] : []),
    ].filter(Boolean))).slice(0, 10);
    return {
      task,
      status: "draft",
      detail,
      at: Date.now(),
      contextItems: mergeDraftContextItems(threadContextItems, localContextItems),
      threadContextItems,
      activeSkillKeys: localSkillKeys,
      excludedToolScopes: localExcluded,
      toolPlan: [
        { label: "注入线程上下文", status: threadContextItems.length ? "ready" : "pending", detail: threadContextItems.length ? `${threadContextItems.length} 条线程附件已进入任务上下文。` : "当前线程暂无附件；可挂文件、记忆、Skills 或审批。" },
        { label: "构建上下文包", status: "draft", detail: "本地只读草案：使用当前工作区、L1/L2 记忆和可见 Skills 快照。" },
        { label: "匹配任务 Skills", status: localSkillKeys.length ? "ready" : "pending", detail: `${localSkillKeys.length} 个候选 Skills；执行前仍需 Gateway 复核。` },
        { label: "审查工具权限", status: localExcluded.length ? "approval_required" : "ready", detail: `${enabledTools.length} 已开 / ${gatedTools.length} 受控；危险动作不会自动执行。` },
        { label: "检查模型运行时", status: apiReady ? "ready" : "setup-needed", detail: `${effectiveProviderLabel} · ${apiReady ? "API 就绪" : "API 待配置"}` },
        { label: "进入审批队列", status: "draft", detail: "写入、远程模型、Skill runtime、Scheduler 仍只生成审批预览。" },
      ],
      data: {
        source: "local_readonly_fallback",
        domain,
        active_workspace: activeWorkspace?.title || "",
        thread_id: activeThread?.id || "",
        thread_context_items: threadContextItems.length,
        gateway_online: state.online,
      },
    };
  };
  const emptyCommandApproval = (): CommandApprovalSnapshot => ({
    status: "",
    decision: "",
    detail: "",
    at: 0,
    planItems: [],
    request: null,
    proposal: null,
    writeRequest: null,
    writeResult: null,
  });
  const commandApprovalTargetPath = "bridge/agent-files/command-center-plan.md";
  const buildCommandApprovalPlan = () => {
    const workerJob = asRecord(asRecord(commandWorker.result?.workers).job ?? commandWorker.result?.worker);
    const rows = [
      {
        label: "确认任务边界",
        status: commandDraft.task ? "ready" : "pending",
        detail: commandDraft.task || commandTask.trim() || "等待任务输入。",
      },
      {
        label: "上下文包复核",
        status: commandDraft.contextItems.length ? "ready" : commandDraft.status || "pending",
        detail: `${commandDraft.contextItems.length} 条上下文切片；来源 ${state.online ? "Gateway context_pack" : "本地只读兜底"}。`,
      },
      {
        label: "线程附件注入",
        status: commandDraft.threadContextItems.length ? "ready" : "pending",
        detail: commandDraft.threadContextItems.length
          ? `${commandDraft.threadContextItems.length} 条线程附件已参与任务上下文。`
          : "当前任务未注入线程附件。",
      },
      {
        label: "Skills 与工具边界",
        status: commandDraft.excludedToolScopes.length ? "approval_required" : commandDraft.activeSkillKeys.length ? "ready" : "pending",
        detail: `${commandDraft.activeSkillKeys.length} 个 Skills；排除 ${commandDraft.excludedToolScopes.length} 个工具范围。`,
      },
      {
        label: "只读 Worker 复核",
        status: commandWorker.status || "draft",
        detail: commandWorker.jobId
          ? `${commandWorker.jobId} · ${commandWorker.detail || asString(workerJob.status, "等待状态")}`
          : "批准后才会派发只读 Worker。",
      },
      {
        label: "后续执行门",
        status: "approval_required",
        detail: "写文件、远程模型、Skill runtime、Scheduler 仍需单独审批；此处只审批计划。",
      },
    ];
    if (commandPlanFeedback.trim()) {
      rows.push({
        label: "修改意见",
        status: "modified",
        detail: commandPlanFeedback.trim(),
      });
    }
    return rows;
  };
  const buildCommandApprovalContent = (decision: string) => {
    const planRows = buildCommandApprovalPlan();
    const contextRows = commandDraft.contextItems.slice(0, 6).map((item, index) => (
      `${index + 1}. ${asString(item.dimension, asString(item.type, "context"))}: ${asString(item.summary, asString(item.content, asString(item.title, "上下文切片")))}`
    ));
    const threadContextRows = commandDraft.threadContextItems.slice(0, 8).map((item, index) => (
      `${index + 1}. ${asString(item.kind, asString(item.dimension, "thread"))}: ${asString(item.title, "线程附件")} · ${asString(item.summary, asString(item.detail, ""))}`
    ));
    const skillRows = commandDraft.activeSkillKeys.slice(0, 12).map((key) => `- ${key}`);
    const excludedRows = commandDraft.excludedToolScopes.slice(0, 12).map((scope) => `- ${scope}`);
    return [
      "## 命令中心计划审批记录",
      "",
      `- 任务：${commandDraft.task || commandTask.trim() || "未命名任务"}`,
      `- 决策：${decision || commandApproval.decision || "等待审批"}`,
      `- Worker：${commandWorker.jobId || "未派发"}`,
      `- 目标：Personal Agent OS / 命令中心审批流`,
      `- 生成时间：${new Date().toLocaleString("zh-CN")}`,
      "",
      "### 计划步骤",
      ...planRows.map((row, index) => `${index + 1}. ${row.label} [${statusLabel(row.status)}]：${row.detail}`),
      "",
      "### 上下文切片",
      ...(contextRows.length ? contextRows : ["- 暂无上下文切片。"]),
      "",
      "### 线程附件",
      ...(threadContextRows.length ? threadContextRows : ["- 当前计划未注入线程附件。"]),
      "",
      "### Skills",
      ...(skillRows.length ? skillRows : ["- 等待 Skills 路由。"]),
      "",
      "### 排除工具",
      ...(excludedRows.length ? excludedRows : ["- 暂无额外排除项。"]),
      "",
      "### 审批边界",
      "- 本记录不会直接写入业务文件。",
      "- 任何文件写入、远程模型、Skill runtime、Scheduler 仍需单独审批。",
    ].join("\n");
  };
  const markCommandApprovalPending = (detail: string) => {
    setCommandApproval((prev) => prev.status ? prev : {
      status: "pending",
      decision: "等待审批",
      detail,
      at: Date.now(),
      planItems: buildCommandApprovalPlan(),
      request: null,
      proposal: null,
      writeRequest: null,
      writeResult: null,
    });
  };
  const runCommandDraft = async (taskOverride?: string) => {
    const task = (taskOverride ?? commandTask).trim();
    if (!task) {
      setCommandDraft({
        task: "",
        status: "error",
        detail: "请先输入一个任务。",
        at: Date.now(),
        contextItems: [],
        threadContextItems: [],
        activeSkillKeys: [],
        excludedToolScopes: [],
        toolPlan: [],
        data: null,
      });
      return;
    }
    if (taskOverride !== undefined) setCommandTask(task);
    setCommandPlanFeedback("");
    setCommandApproval(emptyCommandApproval());
    setCommandDiffHunks([]);
    const threadContextItems = activeThreadContextItems();
    setCommandWorker({
      status: "draft",
      detail: "等待草案生成后进入 Worker 派发审批。",
      at: Date.now(),
      jobId: "",
      request: buildCommandWorkerPayload(task),
      result: null,
    });
    setCommandDraft({
      task,
      status: "running",
      detail: "正在构建上下文包草案",
      at: Date.now(),
      contextItems: [],
      threadContextItems,
      activeSkillKeys: [],
      excludedToolScopes: [],
      toolPlan: [
        { label: "注入线程上下文", status: threadContextItems.length ? "ready" : "pending", detail: threadContextItems.length ? `${threadContextItems.length} 条线程附件将随 context_pack 请求发送。` : "当前线程暂无附件。" },
        { label: "构建上下文包", status: "running", detail: "调用 Gateway context_pack，只读组合 memory_retrieve 与 skill_route。" },
        { label: "匹配任务 Skills", status: "pending", detail: "等待上下文包返回 active_skill_keys。" },
        { label: "审查工具权限", status: "pending", detail: "等待 tool_policy.excluded_tool_scopes。" },
        { label: "进入审批队列", status: "pending", detail: "只生成审批预览，不执行写入或远程模型。" },
      ],
      data: null,
    });
    appendAgentThreadEvent({
      kind: "draft",
      title: "生成任务草案",
      detail: "正在构建上下文包、匹配 Skills 并审查工具边界。",
      status: "running",
      task,
    });
    appendRuntimeLog({
      channel: "terminal",
      title: "生成任务草案",
      detail: task,
      status: "running",
    });
    if (!state.online) {
      const localDraft = buildLocalCommandDraft(task, "Gateway 当前离线，已生成本地只读任务草案。");
      setCommandDraft(localDraft);
      appendAgentThreadEvent({
        kind: "draft",
        title: "本地任务草案",
        detail: localDraft.detail,
        status: "draft",
        task,
      });
      appendRuntimeLog({
        channel: "terminal",
        title: "本地任务草案",
        detail: localDraft.detail,
        status: "draft",
      });
      return;
    }
    try {
      const contextPayload = buildContextPackPayload(task);
      const result = await bridgeAction("context_pack", contextPayload);
      const pack = asRecord(result.context_pack);
      const returnedThreadContext = asRecordList(pack.thread_context);
      const effectiveThreadContextItems = returnedThreadContext.length ? returnedThreadContext : threadContextItems;
      const gatewayContextItems = asRecordList(pack.context_pack);
      const contextItems = mergeDraftContextItems(effectiveThreadContextItems, gatewayContextItems);
      const activeSkillKeys = asArray(pack.active_skill_keys).map((item) => String(item)).filter(Boolean);
      const policy = asRecord(pack.tool_policy);
      const excludedToolScopes = asArray(policy.excluded_tool_scopes).map((item) => String(item)).filter(Boolean);
      const nextActions = asRecordList(pack.next_bridge_actions);
      const toolPlan = [
        { label: "注入线程上下文", status: effectiveThreadContextItems.length ? "ready" : "pending", detail: effectiveThreadContextItems.length ? `${effectiveThreadContextItems.length} 条线程附件已进入 context_pack。` : "当前线程没有附件参与注入。" },
        { label: "构建上下文包", status: "ready", detail: `${gatewayContextItems.length} 条 Gateway 上下文 + ${effectiveThreadContextItems.length} 条线程附件。` },
        { label: "匹配任务 Skills", status: activeSkillKeys.length ? "ready" : "pending", detail: `${activeSkillKeys.length} 个 active_skill_keys 已挂载。` },
        { label: "审查工具权限", status: excludedToolScopes.length ? "approval_required" : "ready", detail: excludedToolScopes.length ? `排除 ${excludedToolScopes.join(" / ")}` : "当前未返回额外排除项。" },
        { label: "规划后续动作", status: nextActions.length ? "draft" : "pending", detail: nextActions.length ? nextActions.map((item) => asString(item.action, "bridge_action")).slice(0, 4).join(" / ") : "等待用户确认后再派发 Worker。" },
        { label: "进入审批队列", status: "draft", detail: "写文件、远程模型、Skill runtime、Scheduler 仍保持审批预览。" },
      ];
      setCommandDraft({
        task,
        status: "ready",
        detail: `${contextItems.length} 条上下文 · ${activeSkillKeys.length} 个 Skills · ${excludedToolScopes.length} 个工具排除项`,
        at: Date.now(),
        contextItems,
        threadContextItems: effectiveThreadContextItems,
        activeSkillKeys,
        excludedToolScopes,
        toolPlan,
        data: result,
      });
      setQuickAction({ label: "任务草案", status: "ready", detail: `已生成：${contextItems.length} 条上下文 / ${activeSkillKeys.length} 个 Skills / 线程附件 ${effectiveThreadContextItems.length}` });
      appendAgentThreadEvent({
        kind: "draft",
        title: "任务草案就绪",
        detail: `${contextItems.length} 条上下文 / ${activeSkillKeys.length} 个 Skills / ${excludedToolScopes.length} 个工具排除项 / 线程附件 ${effectiveThreadContextItems.length}`,
        status: "ready",
        task,
      });
      appendRuntimeLog({
        channel: "terminal",
        title: "任务草案就绪",
        detail: `${contextItems.length} 条上下文 / ${activeSkillKeys.length} 个 Skills / ${excludedToolScopes.length} 个工具排除项`,
        status: "ready",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "context_pack 请求失败";
      const localDraft = buildLocalCommandDraft(task, `Gateway context_pack 失败，已降级为本地只读草案：${detail}`);
      setCommandDraft(localDraft);
      setQuickAction({ label: "任务草案", status: "draft", detail: "已使用本地只读兜底草案" });
      appendAgentThreadEvent({
        kind: "draft",
        title: "任务草案降级",
        detail: localDraft.detail,
        status: "draft",
        task,
      });
      appendRuntimeLog({
        channel: "terminal",
        title: "任务草案降级",
        detail: localDraft.detail,
        status: "draft",
      });
    }
  };
  const sendAgentThreadMessage = async (generateDraft = false) => {
    const task = threadComposer.trim();
    if (!task) return;
    setThreadComposer("");
    setCommandTask(task);
    appendAgentThreadMessage({
      role: "user",
      title: "用户消息",
      content: task,
      status: "sent",
      task,
    });
    appendRuntimeLog({
      channel: "terminal",
      title: generateDraft ? "线程消息 / 生成草案" : "线程消息",
      detail: task,
      status: generateDraft ? "running" : "sent",
    });
    if (generateDraft) {
      await runCommandDraft(task);
      return;
    }
    appendAgentThreadMessage({
      role: "assistant",
      title: "Agent 收到任务",
      content: "已写入当前 Agent 线程。下一步可生成任务草案，先构建上下文包、匹配 Skills，再进入审批/Worker 流程。",
      status: "ready",
    });
  };
  const redactedAgentModelRequest = (request: JsonRecord): JsonRecord => ({
    ...request,
    api_key: asString(request.api_key) ? "********" : "",
  });
  const appendAgentModelWorkerMessage = (job: JsonRecord, status: string, detail: string) => {
    const result = asRecord(job.result);
    const prepared = asRecord(job.prepared_task);
    const output = asString(result.output);
    const workerId = asString(job.id);
    if (status === "completed" && output) {
      const completedMessage = {
        role: "assistant",
        title: "模型 Worker 回复",
        content: output,
        status: "completed",
      } as const;
      if (!workerId) {
        appendAgentThreadMessage(completedMessage);
        return;
      }
      upsertAgentThreadMessage({
        ...completedMessage,
        sourceRef: modelWorkerStreamMessageRef(workerId),
      });
      return;
    }
    const contextItems = asNumber(prepared.context_items);
    const threadContextItems = asNumber(prepared.thread_context_items);
    const approvalIds = asNumber(prepared.approval_ids);
    appendAgentThreadMessage({
      role: "tool",
      title: status === "approval_required" ? "模型 Worker 预检" : "模型 Worker 状态",
      content: [
        detail,
        workerId ? `Worker: ${workerId}` : "",
        contextItems ? `context_pack: ${contextItems} 条上下文` : "",
        threadContextItems ? `thread_context: ${threadContextItems} 条线程附件` : "",
        approvalIds ? `approval_ids: ${approvalIds} 个关联审批` : "",
        status === "approval_required" ? "仍需模型配置、execute_model 或远程模型授权；没有写文件、没有执行命令。" : "",
      ].filter(Boolean).join("\n"),
      status,
    });
  };
  const recordAgentModelWorkerEvents = (jobId: string, events: JsonRecord[]) => {
    if (!jobId || !events.length) return;
    const startedAt = agentModelWorkerStartedAtRef.current[jobId] || 0;
    const freshEvents = events.filter((event) => {
      const eventJobId = asString(event.job_id);
      if (eventJobId && eventJobId !== jobId) return false;
      const eventAt = Date.parse(asString(event.at));
      if (startedAt && Number.isFinite(eventAt) && eventAt + 500 < startedAt) return false;
      const key = workerEventKey(event);
      if (emittedAgentModelWorkerEventsRef.current.has(key)) return false;
      emittedAgentModelWorkerEventsRef.current.add(key);
      return true;
    });
    if (!freshEvents.length) return;
    const chunkText = freshEvents
      .filter((event) => asString(event.type) === "model_stream_chunk")
      .map((event) => asString(event.text))
      .filter(Boolean)
      .join("");
    const stageLines = freshEvents
      .filter((event) => !["model_stream_chunk", "worker_update"].includes(asString(event.type)))
      .map((event) => {
        const status = asString(event.status, "recorded");
        return `${formatTime(Date.parse(asString(event.at)) || Date.now())} · ${asString(event.type, "worker_event")} · ${modelWorkerEventLabel(event)} · ${status}`;
      });
    freshEvents.forEach((event) => {
      appendRuntimeLog({
        channel: "workers",
        title: asString(event.type, "Worker 事件"),
        detail: asString(event.text, modelWorkerEventLabel(event)),
        status: asString(event.status, "recorded"),
      });
    });
    if (stageLines.length) {
      appendAgentThreadMessage({
        role: "tool",
        title: "模型 Worker 事件流",
        content: stageLines.slice(-6).join("\n"),
        status: asString(freshEvents[freshEvents.length - 1]?.status, "recorded"),
      });
    }
    if (chunkText) {
      upsertAgentThreadMessage({
        role: "assistant",
        title: "模型 Worker 回复",
        content: chunkText,
        status: "running",
        sourceRef: modelWorkerStreamMessageRef(jobId),
        appendContent: true,
      });
    }
  };
  const refreshAgentModelWorkerStatus = (jobId: string, request: JsonRecord, mode: "preview" | "run", attempt = 0) => {
    const terminalStatuses = new Set(["completed", "failed", "blocked", "canceled", "approval_required"]);
    void bridgeAction("worker_status", { job_id: jobId })
      .then((statusResult) => {
        const workerPayload = asRecord(statusResult.workers);
        const statusJob = asRecord(workerPayload.job);
        if (!Object.keys(statusJob).length) {
          if (attempt < 6) {
            window.setTimeout(() => refreshAgentModelWorkerStatus(jobId, request, mode, attempt + 1), 1400);
          }
          return;
        }
        const statusEvents = [
          ...asRecordList(workerPayload.events),
          ...asRecordList(statusJob.events),
        ];
        recordAgentModelWorkerEvents(jobId, statusEvents);
        const nextStatus = asString(statusJob.status, "running");
        const nextDetail = asString(
          statusJob.message,
          nextStatus === "completed" ? "模型 Worker 已完成，输出已回填到当前消息流。" : "模型 Worker 状态已更新。",
        );
        setAgentModelWorker({
          status: nextStatus,
          detail: nextDetail,
          at: Date.now(),
          jobId: asString(statusJob.id, jobId),
          request: redactedAgentModelRequest(request),
          result: statusResult,
          mode,
        });
        if (terminalStatuses.has(nextStatus)) {
          appendAgentThreadEvent({
            kind: "worker",
            title: "模型 Worker 回填",
            detail: nextDetail,
            status: nextStatus,
            workerJobId: asString(statusJob.id, jobId),
          });
          appendRuntimeLog({
            channel: "workers",
            title: "模型 Worker 回填",
            detail: nextDetail,
            status: nextStatus,
          });
          appendAgentModelWorkerMessage(statusJob, nextStatus, nextDetail);
          void refresh();
          return;
        }
        if (attempt < 8) {
          window.setTimeout(() => refreshAgentModelWorkerStatus(jobId, request, mode, attempt + 1), 1400);
        }
      })
      .catch(() => {
        if (attempt < 3) {
          window.setTimeout(() => refreshAgentModelWorkerStatus(jobId, request, mode, attempt + 1), 1800);
        }
      });
  };
  const runAgentModelWorker = async (mode: "preview" | "run" = "preview") => {
    const composerTask = threadComposer.trim();
    const task = composerTask || commandTask.trim() || activeThread?.task || "";
    if (!task) return;
    if (composerTask) {
      setThreadComposer("");
      appendAgentThreadMessage({
        role: "user",
        title: "用户消息",
        content: composerTask,
        status: "sent",
        task: composerTask,
      });
    }
    setCommandTask(task);
    const request = buildAgentModelWorkerPayload(task, mode);
    const safeRequest = redactedAgentModelRequest(request);
    const jobId = asString(request.job_id);
    agentModelWorkerStartedAtRef.current[jobId] = Date.now();
    emittedAgentModelWorkerEventsRef.current = new Set(
      Array.from(emittedAgentModelWorkerEventsRef.current).filter((key) => !key.startsWith(`${jobId}|`)),
    );
    if (!state.online) {
      const detail = "Gateway 离线，无法登记模型 Worker。";
      setAgentModelWorker({ status: "error", detail, at: Date.now(), jobId, request: safeRequest, result: null, mode });
      appendRuntimeLog({ channel: "workers", title: "模型 Worker 未派发", detail, status: "error" });
      appendAgentThreadMessage({ role: "tool", title: "模型 Worker 未派发", content: detail, status: "error" });
      return;
    }
    setAgentModelWorker({
      status: "running",
      detail: mode === "run" ? "正在登记模型 Worker；执行仍受 Provider / Gateway 闸门限制。" : "正在登记模型 Worker 预检；不会访问模型端点。",
      at: Date.now(),
      jobId,
      request: safeRequest,
      result: null,
      mode,
    });
    appendAgentThreadEvent({
      kind: "worker",
      title: mode === "run" ? "派发模型 Worker" : "模型 Worker 预检",
      detail: mode === "run" ? "登记 `worker_run` / `model_task`，按模型 Provider 闸门执行。" : "登记 `worker_run` / `model_task` 预检，只准备上下文与模型 payload。",
      status: "running",
      workerJobId: jobId,
      contextAttachments: [createAgentThreadContextAttachment({
        kind: "worker",
        title: `模型 Worker ${truncateMiddle(jobId, 8)}`,
        detail: `${effectiveProviderLabel} · ${settings.modelId || "model 未设置"} · ${mode === "run" ? "run" : "preview"}`,
        ref: jobId,
        source: "Agent 消息流",
        status: "running",
      })],
    });
    appendRuntimeLog({
      channel: "workers",
      title: mode === "run" ? "派发模型 Worker" : "模型 Worker 预检",
      detail: `${jobId} · ${effectiveProviderLabel} · ${settings.modelId || "model 未设置"}`,
      status: "running",
    });
    try {
      const result = await bridgeAction("worker_run", request);
      const worker = asRecord(result.worker);
      const registeredJobId = asString(worker.id, jobId);
      const status = asString(worker.status, asString(result.status, "ok"));
      const initialWorkerEvent = {
        at: new Date().toISOString(),
        type: "worker_run",
        job_id: registeredJobId,
        status,
        kind: "model_task",
      };
      const workerWithInitialEvents = {
        ...worker,
        events: [...asRecordList(worker.events), initialWorkerEvent],
      };
      const resultWithInitialEvents = {
        ...result,
        worker: workerWithInitialEvents,
      };
      recordAgentModelWorkerEvents(registeredJobId, asRecordList(workerWithInitialEvents.events));
      const detail = asString(worker.message, status === "approval_required" ? "模型 Worker 已准备，需要执行授权或模型配置。" : "模型 Worker 已登记。");
      setAgentModelWorker({
        status,
        detail,
        at: Date.now(),
        jobId: registeredJobId,
        request: safeRequest,
        result: resultWithInitialEvents,
        mode,
      });
      setQuickAction({ label: mode === "run" ? "模型 Worker" : "模型预检", status, detail });
      appendAgentThreadEvent({
        kind: "worker",
        title: mode === "run" ? "模型 Worker 已登记" : "模型 Worker 预检完成",
        detail,
        status,
        workerJobId: registeredJobId,
      });
      appendRuntimeLog({
        channel: "workers",
        title: mode === "run" ? "模型 Worker 已登记" : "模型 Worker 预检完成",
        detail,
        status,
      });
      const terminalStatuses = new Set(["completed", "failed", "blocked", "canceled", "approval_required"]);
      if (terminalStatuses.has(status)) {
        window.setTimeout(() => refreshAgentModelWorkerStatus(registeredJobId, request, mode), 300);
      } else {
        window.setTimeout(() => refreshAgentModelWorkerStatus(registeredJobId, request, mode), 1000);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "模型 Worker 派发失败";
      setAgentModelWorker({ status: "error", detail, at: Date.now(), jobId, request: safeRequest, result: null, mode });
      setQuickAction({ label: "模型 Worker", status: "error", detail });
      appendAgentThreadEvent({
        kind: "worker",
        title: "模型 Worker 派发失败",
        detail,
        status: "error",
        workerJobId: jobId,
      });
      appendRuntimeLog({
        channel: "workers",
        title: "模型 Worker 派发失败",
        detail,
        status: "error",
      });
    }
  };
  const refreshCommandWorkerStatus = (jobId: string, request: JsonRecord, fallbackStatus: string, fallbackDetail: string, attempt = 0) => {
    const terminalStatuses = new Set(["completed", "failed", "blocked", "canceled", "approval_required"]);
    void bridgeAction("worker_status", { job_id: jobId })
      .then((statusResult) => {
        const statusJob = asRecord(asRecord(statusResult.workers).job);
        if (!Object.keys(statusJob).length) {
          if (attempt < 5) {
            window.setTimeout(() => refreshCommandWorkerStatus(jobId, request, fallbackStatus, fallbackDetail, attempt + 1), 1400);
          }
          return;
        }
        const nextStatus = asString(statusJob.status, fallbackStatus);
        const nextDetail = asString(
          statusJob.message,
          nextStatus === "completed" ? "只读 Worker 已完成 context_pack 复核。" : fallbackDetail,
        );
        setCommandWorker((prev) => ({
          ...prev,
          status: nextStatus,
          detail: nextDetail,
          at: Date.now(),
          jobId: asString(statusJob.id, jobId),
          request: prev.request || request,
          result: statusResult,
        }));
        if (terminalStatuses.has(nextStatus)) {
          appendAgentThreadEvent({
            kind: "worker",
            title: "Worker 状态回填",
            detail: nextDetail,
            status: nextStatus,
            workerJobId: asString(statusJob.id, jobId),
          });
          appendRuntimeLog({
            channel: "workers",
            title: "Worker 状态回填",
            detail: nextDetail,
            status: nextStatus,
          });
        }
        if (nextStatus === "completed") {
          markCommandApprovalPending("只读 Worker 已完成 context_pack 复核，可接受、拒绝或要求修改计划。");
        }
        if (!terminalStatuses.has(nextStatus) && attempt < 5) {
          window.setTimeout(() => refreshCommandWorkerStatus(jobId, request, nextStatus, nextDetail, attempt + 1), 1400);
        }
      })
      .catch(() => {
        if (attempt < 3) {
          window.setTimeout(() => refreshCommandWorkerStatus(jobId, request, fallbackStatus, fallbackDetail, attempt + 1), 1800);
        }
      });
  };
  const runCommandWorker = async () => {
    const task = (commandDraft.task || commandTask).trim();
    if (!task || !commandDraft.status) {
      setCommandWorker({
        status: "error",
        detail: "请先生成任务草案，再派发 Worker。",
        at: Date.now(),
        jobId: "",
        request: null,
        result: null,
      });
      return;
    }
    if (!state.online) {
      setCommandWorker({
        status: "error",
        detail: "Gateway 离线，无法派发只读 Worker。",
        at: Date.now(),
        jobId: "",
        request: buildCommandWorkerPayload(task),
        result: null,
      });
      return;
    }
    const request = buildCommandWorkerPayload(task, "run");
    const jobId = asString(request.job_id);
    setCommandWorker({
      status: "running",
      detail: "正在派发只读 context_pack Worker。",
      at: Date.now(),
      jobId,
      request,
      result: null,
    });
    appendAgentThreadEvent({
      kind: "worker",
      title: "派发只读 Worker",
      detail: "正在派发 `worker_run` / `bridge_action` / `context_pack`，权限为只读 allowlist。",
      status: "running",
      workerJobId: jobId,
    });
    appendRuntimeLog({
      channel: "workers",
      title: "派发只读 Worker",
      detail: jobId,
      status: "running",
    });
    try {
      const result = await bridgeAction("worker_run", request);
      const worker = asRecord(result.worker);
      const status = asString(worker.status, asString(result.status, "ok"));
      const detail = asString(worker.message, asString(result.message, "Worker 已登记。"));
      setCommandWorker({
        status,
        detail,
        at: Date.now(),
        jobId: asString(worker.id, jobId),
        request,
        result,
      });
      setQuickAction({ label: "只读 Worker", status, detail });
      appendAgentThreadEvent({
        kind: "worker",
        title: "Worker 已登记",
        detail,
        status,
        workerJobId: asString(worker.id, jobId),
      });
      appendRuntimeLog({
        channel: "workers",
        title: "Worker 已登记",
        detail,
        status,
      });
      window.setTimeout(() => refreshCommandWorkerStatus(asString(worker.id, jobId), request, status, detail), 1000);
      void refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Worker 派发失败";
      setCommandWorker({
        status: "error",
        detail,
        at: Date.now(),
        jobId,
        request,
        result: null,
      });
      setQuickAction({ label: "只读 Worker", status: "error", detail });
      appendAgentThreadEvent({
        kind: "worker",
        title: "Worker 派发失败",
        detail,
        status: "error",
        workerJobId: jobId,
      });
      appendRuntimeLog({
        channel: "workers",
        title: "Worker 派发失败",
        detail,
        status: "error",
      });
    }
  };
  const recordCommandApprovalDecision = (status: "accepted" | "rejected" | "modified") => {
    const labels = {
      accepted: "接受计划",
      rejected: "拒绝计划",
      modified: "修改计划",
    };
    if (!commandDraft.task) {
      setCommandApproval({
        status: "error",
        decision: labels[status],
        detail: "请先生成任务草案。",
        at: Date.now(),
        planItems: [],
        request: null,
        proposal: null,
        writeRequest: null,
        writeResult: null,
      });
      return;
    }
    const feedback = commandPlanFeedback.trim();
    const detail = status === "accepted"
      ? "计划已接受。下一步可以生成合并草案，或继续进入具体执行审批。"
      : status === "rejected"
        ? "计划已拒绝。不会派生后续执行动作。"
        : feedback
          ? `已记录修改意见：${feedback}`
          : "已退回计划。请在修改意见中写明调整点，或编辑任务后重新生成草案。";
    if (status === "modified") {
      setCommandDraft((prev) => ({
        ...prev,
        status: prev.status || "draft",
        detail,
        toolPlan: [
          ...prev.toolPlan.filter((step) => step.label !== "修改意见"),
          { label: "修改意见", status: "modified", detail: feedback || "等待补充修改意见。" },
        ],
      }));
    }
    setCommandApproval((prev) => ({
      ...prev,
      status,
      decision: labels[status],
      detail,
      at: Date.now(),
      planItems: buildCommandApprovalPlan(),
    }));
    setQuickAction({ label: labels[status], status, detail });
    appendAgentThreadEvent({
      kind: "approval",
      title: labels[status],
      detail,
      status,
      approvalDelta: 1,
    });
    appendRuntimeLog({
      channel: "approvals",
      title: labels[status],
      detail,
      status,
    });
  };
  const runCommandMergeProposal = async () => {
    if (!commandWorker.jobId) {
      setCommandApproval({
        status: "error",
        decision: "生成合并草案",
        detail: "请先批准并完成只读 Worker。",
        at: Date.now(),
        planItems: buildCommandApprovalPlan(),
        request: null,
        proposal: null,
        writeRequest: null,
        writeResult: null,
      });
      return;
    }
    const content = buildCommandApprovalContent(commandApproval.decision || "等待审批");
    const request = {
      job_id: commandWorker.jobId,
      target_path: commandApprovalTargetPath,
      mode: "append",
      access_profile: "workspace",
      content,
    };
    setCommandApproval((prev) => ({
      ...prev,
      status: "running",
      decision: "生成合并草案",
      detail: "正在通过 Gateway 创建可审查 merge proposal，不写目标文件。",
      at: Date.now(),
      planItems: buildCommandApprovalPlan(),
      request,
      proposal: prev.proposal,
      writeRequest: prev.writeRequest,
      writeResult: prev.writeResult,
    }));
    try {
      const result = await bridgeAction("worker_merge_proposal", request);
      const merge = asRecord(result.worker_merge_proposal);
      const proposal = asRecord(merge.proposal);
      const rawStatus = asString(merge.status, asString(result.status, "draft"));
      const status = proposal.proposal_path ? rawStatus : "draft";
      const fallbackProposal = {
        target_relative: commandApprovalTargetPath,
        mode: "append",
        access_profile: "workspace",
        proposal_path: commandApprovalTargetPath,
        diff_preview: content.slice(0, 1800),
        review_gate: `Gateway ${statusLabel(rawStatus)} 未返回 proposal；重启 Gateway 后可重试 worker_merge_proposal。`,
      };
      const resolvedProposal = proposal.proposal_path ? proposal : fallbackProposal;
      const detail = proposal.proposal_path
        ? `合并草案已生成：${asString(proposal.proposal_path)}`
        : `本地合并草案请求已保留：${commandApprovalTargetPath}`;
      const nextHunks = parseCommandDiffHunks(asString(resolvedProposal.diff_preview, content));
      setCommandApproval({
        status,
        decision: "生成合并草案",
        detail,
        at: Date.now(),
        planItems: buildCommandApprovalPlan(),
        request,
        proposal: resolvedProposal,
        writeRequest: null,
        writeResult: null,
      });
      setCommandDiffHunks(nextHunks);
      setQuickAction({ label: "合并草案", status, detail });
      appendAgentThreadEvent({
        kind: "diff",
        title: "合并草案 / Diff",
        detail,
        status,
        diffCount: nextHunks.length,
      });
      appendRuntimeLog({
        channel: "output",
        title: "合并草案 / Diff",
        detail: `${detail} · ${nextHunks.length} 个 hunk`,
        status,
      });
      void refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "合并草案生成失败";
      setCommandApproval((prev) => ({
        ...prev,
        status: "error",
        decision: "生成合并草案",
        detail,
        at: Date.now(),
        planItems: buildCommandApprovalPlan(),
        request,
        writeRequest: prev.writeRequest,
        writeResult: prev.writeResult,
      }));
      setQuickAction({ label: "合并草案", status: "error", detail });
      appendAgentThreadEvent({
        kind: "diff",
        title: "合并草案失败",
        detail,
        status: "error",
      });
      appendRuntimeLog({
        channel: "output",
        title: "合并草案失败",
        detail,
        status: "error",
      });
    }
  };
  const setCommandDiffHunkStatus = (id: string, status: CommandDiffHunk["status"]) => {
    setCommandDiffHunks((prev) => prev.map((hunk) => hunk.id === id ? { ...hunk, status } : hunk));
    setCommandApproval((prev) => ({
      ...prev,
      writeRequest: null,
      writeResult: null,
    }));
  };
  const setAllCommandDiffHunks = (status: CommandDiffHunk["status"]) => {
    setCommandDiffHunks((prev) => prev.map((hunk) => ({ ...hunk, status })));
    setCommandApproval((prev) => ({
      ...prev,
      writeRequest: null,
      writeResult: null,
    }));
  };
  const runCommandWriteApproval = async () => {
    if (!commandApproval.proposal) {
      const detail = "请先生成合并草案，再进入 write_file 审批。";
      setCommandApproval((prev) => ({
        ...prev,
        status: "error",
        decision: "生成 write_file 审批",
        detail,
        at: Date.now(),
      }));
      setQuickAction({ label: "write_file 审批", status: "error", detail });
      return;
    }
    if (!state.online) {
      const detail = "Gateway 离线，无法生成 write_file 审批。";
      setCommandApproval((prev) => ({
        ...prev,
        status: "error",
        decision: "生成 write_file 审批",
        detail,
        at: Date.now(),
      }));
      setQuickAction({ label: "write_file 审批", status: "error", detail });
      return;
    }
    if (!acceptedCommandHunkContent.trim()) {
      const detail = "请至少接受一个 hunk；被拒绝或待定的 hunk 不会进入写入审批。";
      setCommandApproval((prev) => ({
        ...prev,
        status: "blocked",
        decision: "生成 write_file 审批",
        detail,
        at: Date.now(),
      }));
      setQuickAction({ label: "write_file 审批", status: "blocked", detail });
      return;
    }
    const proposal = asRecord(commandApproval.proposal);
    const targetPath = asString(
      proposal.target_relative,
      asString(proposal.target_path, commandApprovalTargetPath),
    ) || commandApprovalTargetPath;
    const oldSha = asString(proposal.old_sha256);
    const request: JsonRecord = {
      path: targetPath,
      mode: asString(proposal.mode, "append") || "append",
      access_profile: "workspace",
      content: acceptedCommandHunkContent,
    };
    if (oldSha) request.expected_sha256 = oldSha;
    setCommandApproval((prev) => ({
      ...prev,
      status: "running",
      decision: "生成 write_file 审批",
      detail: "正在向 Gateway 提交 write_file 审批草案；请求不包含 execute=true。",
      at: Date.now(),
      writeRequest: request,
      writeResult: prev.writeResult,
    }));
    try {
      const result = await bridgeAction("write_file", request);
      const status = asString(result.status, "approval_required");
      const approvalId = asString(result.approval_id);
      const detail = approvalId
        ? `write_file 审批已进入队列：${approvalId}`
        : asString(result.message, "write_file 审批草案已生成。");
      setCommandApproval((prev) => ({
        ...prev,
        status,
        decision: "生成 write_file 审批",
        detail,
        at: Date.now(),
        writeRequest: request,
        writeResult: result,
      }));
      setQuickAction({ label: "write_file 审批", status, detail });
      appendAgentThreadEvent({
        kind: "write",
        title: "write_file 审批",
        detail,
        status,
        approvalDelta: 1,
        approvalId,
        contextAttachments: approvalId ? [createAgentThreadContextAttachment({
          kind: "approval",
          title: `审批 ${compactApprovalId(approvalId)}`,
          detail: `write_file · ${targetPath} · ${detail}`,
          ref: approvalId,
          source: "Changes / Diff",
          status,
        })] : [],
      });
      appendRuntimeLog({
        channel: "approvals",
        title: "write_file 审批",
        detail,
        status,
      });
      void refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "write_file 审批生成失败";
      setCommandApproval((prev) => ({
        ...prev,
        status: "error",
        decision: "生成 write_file 审批",
        detail,
        at: Date.now(),
        writeRequest: request,
      }));
      setQuickAction({ label: "write_file 审批", status: "error", detail });
      appendAgentThreadEvent({
        kind: "write",
        title: "write_file 审批失败",
        detail,
        status: "error",
      });
      appendRuntimeLog({
        channel: "approvals",
        title: "write_file 审批失败",
        detail,
        status: "error",
      });
    }
  };
  const createSpecProtocolDraft = () => {
    const files = buildSpecProtocolFiles();
    const request: JsonRecord = {
      action: "write_file",
      purpose: "Specs / Steering / Hooks 项目协议草案；只进入 Gateway write_file 审批，不直接落盘。",
      files: files.map((file) => ({
        path: file.path,
        mode: "replace",
        access_profile: "workspace",
        content_length: file.content.length,
        kind: file.kind,
      })),
    };
    setSpecProtocolDraft({
      status: "draft",
      detail: `已生成 ${files.length} 个协议文件草案，提交后会逐个进入 write_file 审批。`,
      at: Date.now(),
      files,
      request,
      result: null,
    });
    setQuickAction({ label: "Specs 协议草案", status: "draft", detail: `${files.length} 个文件等待提交审批。` });
    appendRuntimeLog({
      channel: "approvals",
      title: "Specs 协议草案",
      detail: files.map((file) => file.path).join(" / "),
      status: "draft",
    });
    appendAgentThreadEvent({
      kind: "note",
      title: "Specs 协议草案",
      detail: `已生成 ${files.length} 个 .lumen 协议文件草案；尚未提交 write_file 审批。`,
      status: "draft",
    });
  };

  const submitSpecProtocolApprovals = async () => {
    const files = specProtocolDraft.files.length ? specProtocolDraft.files : buildSpecProtocolFiles();
    if (!state.online) {
      const detail = "Gateway 离线，无法提交 Specs / Steering / Hooks 写入审批。";
      setSpecProtocolDraft((prev) => ({ ...prev, status: "error", detail, at: Date.now(), files }));
      setQuickAction({ label: "Specs 协议审批", status: "error", detail });
      return;
    }
    if (!files.length) {
      const detail = "没有可提交的协议文件草案。";
      setSpecProtocolDraft((prev) => ({ ...prev, status: "error", detail, at: Date.now(), files: [] }));
      setQuickAction({ label: "Specs 协议审批", status: "error", detail });
      return;
    }
    const batchRequest: JsonRecord = {
      files: files.map((file) => ({
        path: file.path,
        mode: "replace",
        access_profile: "workspace",
        kind: file.kind,
        content_length: file.content.length,
      })),
    };
    setSpecProtocolDraft({
      status: "running",
      detail: `正在提交 ${files.length} 个 write_file 审批草案；请求均不包含 execute=true。`,
      at: Date.now(),
      files,
      request: batchRequest,
      result: null,
    });
    setQuickAction({ label: "Specs 协议审批", status: "running", detail: "正在排队 write_file 审批。" });
    appendRuntimeLog({
      channel: "approvals",
      title: "提交 Specs 协议审批",
      detail: `${files.length} 个 .lumen 文件进入 write_file 审批。`,
      status: "running",
    });
    try {
      const results: JsonRecord[] = [];
      for (const file of files) {
        const request: JsonRecord = {
          path: file.path,
          mode: "replace",
          access_profile: "workspace",
          content: file.content,
        };
        const result = await bridgeAction("write_file", request);
        results.push({
          path: file.path,
          kind: file.kind,
          request: {
            path: file.path,
            mode: "replace",
            access_profile: "workspace",
            content_length: file.content.length,
          },
          status: asString(result.status, "approval_required"),
          approval_id: asString(result.approval_id),
          message: asString(result.message),
          result,
        });
      }
      const approvalIds = results.map((item) => asString(item.approval_id)).filter(Boolean);
      const status = results.every((item) => asString(item.status, "approval_required") === "approval_required")
        ? "approval_required"
        : results.some((item) => ["error", "blocked", "failed"].includes(asString(item.status)))
          ? "partial"
          : asString(results[0]?.status, "approval_required");
      const detail = approvalIds.length
        ? `已提交 ${approvalIds.length}/${files.length} 个 write_file 审批：${approvalIds.map((id) => compactApprovalId(id)).join(" / ")}`
        : `已提交 ${files.length} 个 write_file 审批草案，等待 Gateway 返回审批 ID。`;
      const approvalAttachments = results
        .map((item) => {
          const approvalId = asString(item.approval_id);
          if (!approvalId) return null;
          return createAgentThreadContextAttachment({
            kind: "approval",
            title: `审批 ${compactApprovalId(approvalId)}`,
            detail: `write_file · ${asString(item.path, ".lumen")} · Specs 协议文件`,
            ref: approvalId,
            source: "规格 / 钩子",
            status,
          });
        })
        .filter((item): item is AgentThreadContextAttachment => Boolean(item));
      setSpecProtocolDraft({
        status,
        detail,
        at: Date.now(),
        files,
        request: batchRequest,
        result: { files: results, approval_ids: approvalIds },
      });
      setQuickAction({ label: "Specs 协议审批", status, detail });
      appendRuntimeLog({
        channel: "approvals",
        title: "Specs 协议审批已排队",
        detail,
        status,
      });
      appendAgentThreadEvent({
        kind: "approval",
        title: "Specs / Steering / Hooks 审批",
        detail,
        status,
        approvalDelta: approvalIds.length,
        approvalId: approvalIds[0],
        contextAttachments: approvalAttachments,
      });
      setBottomPanelTab("approvals");
      void refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Specs / Steering / Hooks 审批提交失败";
      setSpecProtocolDraft((prev) => ({
        ...prev,
        status: "error",
        detail,
        at: Date.now(),
        files,
        request: batchRequest,
      }));
      setQuickAction({ label: "Specs 协议审批", status: "error", detail });
      appendRuntimeLog({
        channel: "approvals",
        title: "Specs 协议审批失败",
        detail,
        status: "error",
      });
      appendAgentThreadEvent({
        kind: "approval",
        title: "Specs 协议审批失败",
        detail,
        status: "error",
      });
    }
  };
  const agentTraceRows = [
    {
      label: "目标锁定",
      status: "completed",
      detail: "灵枢 LumenOS 是 Personal Agent OS；织梦只是写作领域 Agent。",
    },
    {
      label: "上下文装载",
      status: memoryRecentL2.length || memoryRecentL1.length ? "ready" : "pending",
      detail: `L1 ${asNumber(memory.l1_count)} · L2 ${asNumber(memory.l2_count)} · 待处理 ${asNumber(memory.pending_count)}`,
    },
    {
      label: "能力挂载",
      status: "running",
      detail: "Skills、工具矩阵、模型 Provider、Worker、MCP facade 已进入统一工作台。",
    },
    {
      label: "安全审计",
      status: completionMissing ? "partial" : "pass",
      detail: `completion partial ${completionPartial} · missing ${completionMissing} · 安全闸门 ${safetyLayers.length}`,
    },
  ];
  const approvalGateRows = [
    {
      label: "文件写入",
      status: asBoolean(capabilities.execute_write) ? "enabled" : "approval_required",
      detail: asBoolean(capabilities.execute_write) ? "当前 profile 允许工作区写入" : "写入动作进入审批或合并草案",
    },
    {
      label: "远程模型",
      status: endpointLocal || !settings.apiUrl ? "gated" : "approval_required",
      detail: endpointLocal ? "本地端点优先" : "远程模型需要 allow_remote_model 明确授权",
    },
    {
      label: "Skill runtime",
      status: asString(capabilities.skill_script_execution, "disabled") === "enabled" ? "enabled" : "gated",
      detail: "已激活 Skill 默认仍需 execute gate",
    },
    {
      label: "计划任务",
      status: asBoolean(capabilities.scheduler_install) ? "approval_required" : "gated",
      detail: "KAIROS 只生成草案，安装系统计划任务需显式授权",
    },
  ];
  const evidenceRows = [
    { label: "Gateway", value: state.online ? "在线" : "离线", tone: state.online ? "text-emerald-300" : "text-amber-300" },
    { label: "Provider", value: providerReady ? "目录可用" : "预设兜底", tone: providerReady ? "text-emerald-300" : "text-amber-300" },
    { label: "Worker 草案", value: `${workerMergeProposals.length}`, tone: workerMergeProposals.length ? "text-amber-300" : "text-slate-300" },
    { label: "阶段审计", value: statusLabel(phaseStatus), tone: statusTone(phaseStatus) },
  ];
  const terminalPreview = [
    "$ lumen audit --phase current",
    `- 网关: ${state.online ? "在线" : "离线"}`,
    `- 工作区: ${activeWorkspace?.title || "未选择"}`,
    `- 模型: ${effectiveProvider}`,
    `- 工具: ${enabledTools.length} 已开 / ${gatedTools.length} 受控`,
    "- 下一步: 执行前先审查审批队列",
  ].join("\n");
  const specWorkflowRows = [
    {
      phase: "Requirements",
      label: "需求",
      status: activeThread?.task || commandTask.trim() ? "draft" : "pending",
      detail: activeThread?.task || commandTask.trim() || "先在线程或命令中心写下目标，形成可审查需求。",
      output: "requirements.md",
    },
    {
      phase: "Design",
      label: "设计",
      status: commandDraft.contextItems.length || activeThread?.contextAttachments.length ? "ready" : "pending",
      detail: "把工作区文件、thread_context、记忆和 Skills 收进 context_pack，生成实现边界。",
      output: "design.md",
    },
    {
      phase: "Tasks",
      label: "任务",
      status: commandApproval.planItems.length ? commandApproval.status || "draft" : "pending",
      detail: commandApproval.planItems.length
        ? `${commandApproval.planItems.length} 个计划步骤等待接受 / 拒绝 / 修改。`
        : "等待只读 Worker 或计划审批生成可执行步骤。",
      output: "tasks.md",
    },
    {
      phase: "Review",
      label: "复核",
      status: approvalQueueCount || commandDiffHunks.length || workerMergeProposals.length ? "review" : "idle",
      detail: `审批 ${approvalQueueCount} · Diff ${commandDiffHunks.length || workerMergeProposals.length} · 问题 ${completionPartial + completionMissing}`,
      output: "approval queue",
    },
  ];
  const steeringRows = [
    {
      label: "产品边界",
      status: "locked",
      detail: "灵枢 LumenOS 是 Personal Agent OS；织梦只是可挂载的写作领域 Agent。",
      path: ".lumen/steering/product.md",
    },
    {
      label: "Workbench 布局",
      status: "active",
      detail: "Header / Activity Bar / 主侧边栏 / 主工作区 / 辅助侧边栏 / 底部 Panel / 状态栏。",
      path: ".lumen/steering/workbench.md",
    },
    {
      label: "上下文策略",
      status: "active",
      detail: "优先 context_pack、thread_context、L1/L2 摘要和必要全文，避免全量塞 prompt。",
      path: ".lumen/steering/context.md",
    },
    {
      label: "安全规则",
      status: completionMissing ? "partial" : "active",
      detail: "写入、联网、MCP、Skill runtime、Scheduler、远程模型全部先进入审批或显式 gate。",
      path: ".lumen/steering/safety.md",
    },
  ];
  const hookPolicyRows = [
    {
      event: "UserPromptSubmit",
      status: "draft",
      detail: "提交任务前注入当前线程、工作区、记忆和 Skills 边界，生成 context_pack 草案。",
    },
    {
      event: "PreToolUse",
      status: "guarded",
      detail: "写文件、MCP、远程模型、Skill runtime、Scheduler、命令执行先经过 Gateway validators 与 approval queue。",
    },
    {
      event: "PostToolUse",
      status: runtimeLogs.length ? "recording" : "ready",
      detail: "工具结果写入线程消息、runtime log、Changes/Diff 或审批复核台，形成可回放轨迹。",
    },
    {
      event: "PermissionRequest",
      status: approvalQueueCount ? "review" : "idle",
      detail: "审批只读可见；批准/执行器仍是下一阶段独立显式 gate。",
    },
    {
      event: "SubagentStop",
      status: workerRecentEvents.length ? "observed" : "planned",
      detail: "Worker / Subagent 完成后回填事件流、stream preview 和合并草案，不直接改文件。",
    },
  ];
  const subagentRows = [
    {
      label: "Coordinator",
      status: activeThread ? "active" : "idle",
      detail: "维护主线程、context_pack、审批关系和阶段目标。",
      tools: "read / plan / approval",
    },
    {
      label: "Coding Agent",
      status: "planned",
      detail: "面向代码项目的文件分析、diff proposal、验证命令和回归检查。",
      tools: "files / diff / terminal",
    },
    {
      label: "Research Agent",
      status: "planned",
      detail: "面向资料检索、网页/MCP 摘要、证据链和 source digest。",
      tools: "web / MCP / memory",
    },
    {
      label: "Writing Agent",
      status: activeWorkspace ? "mounted" : "available",
      detail: "复用织梦写作台、小说 Skills、蒸馏和章节上下文，但不定义 OS 外壳。",
      tools: "Skills / workspace",
    },
    {
      label: "Reviewer",
      status: approvalQueueCount || commandDiffHunks.length || workerMergeProposals.length ? "needed" : "ready",
      detail: "审查 Requirements、Design、Tasks、Diff、Approval 和运行日志。",
      tools: "approval / problems",
    },
  ];
  const mcpGovernanceRows = [
    {
      label: "MCP facade",
      status: asBoolean(capabilities.execute_mcp) ? "enabled" : "approval_required",
      detail: "当前仍是 Gateway JSON-RPC facade；生产级 streaming/subscription transport 进入后续阶段。",
    },
    {
      label: "Server allow-list",
      status: "planned",
      detail: "按工作区 / profile 维护允许的 MCP servers 和 disabled tools，默认 fail-closed。",
    },
    {
      label: "Tool visibility",
      status: enabledTools.length ? "active" : "gated",
      detail: `已开 ${enabledTools.length} · 受控 ${gatedTools.length}；危险工具不进入默认选择面。`,
    },
  ];
  const buildSpecProtocolFiles = (): SpecProtocolDraftFile[] => {
    const now = new Date().toLocaleString("zh-CN");
    const objective = activeThread?.task || commandTask.trim() || "继续把灵枢 LumenOS 建成 Personal Agent OS / Agent IDE。";
    const threadTitle = activeThread?.title || "未选择线程";
    const workspaceTitle = activeWorkspace?.title || "未绑定工作区";
    const contextLines = (activeThread?.contextAttachments || []).slice(0, 12)
      .map((item) => `- ${item.kind}: ${item.title} | ${item.detail} | ref=${item.ref}`)
      .join("\n") || "- 暂无线程附件；先用工作区、记忆摘要和命令中心任务作为上下文。";
    const approvalLines = activeThreadLinkedApprovalRows.slice(0, 12)
      .map((item) => `- ${asString(item.action, "approval")} | ${asString(item.status, "pending")} | ${asString(item.target, "未声明目标")} | ${asString(item.id)}`)
      .join("\n") || "- 暂无已关联审批；写入、联网、MCP、Scheduler、远程模型仍必须进入 Gateway 审批。";
    const specLines = specWorkflowRows
      .map((row) => `- [${statusLabel(row.status)}] ${row.phase} / ${row.label}: ${row.detail}`)
      .join("\n");
    const steeringLines = steeringRows
      .map((row) => `- ${row.label} (${row.path}): ${row.detail}`)
      .join("\n");
    const hookLines = hookPolicyRows
      .map((row) => `- ${row.event} [${statusLabel(row.status)}]: ${row.detail}`)
      .join("\n");
    const subagentLines = subagentRows
      .map((row) => `- ${row.label} [${statusLabel(row.status)}] tools=${row.tools}: ${row.detail}`)
      .join("\n");
    const mcpLines = mcpGovernanceRows
      .map((row) => `- ${row.label} [${statusLabel(row.status)}]: ${row.detail}`)
      .join("\n");
    const safetyLines = approvalGateRows
      .map((row) => `- ${row.label} [${statusLabel(row.status)}]: ${row.detail}`)
      .join("\n");
    const requirements = [
      "# Requirements",
      "",
      `生成时间：${now}`,
      `线程：${threadTitle}`,
      `工作区：${workspaceTitle}`,
      "",
      "## 目标",
      objective,
      "",
      "## 验收要求",
      "- 首屏继续保持 VS Code / Codex / Claude Code 式 Agent Workbench，而不是写作前端。",
      "- 默认任务流是 Agent 线程、context_pack、工具计划、审批、Diff、终端和运行日志。",
      "- 写作 Agent 只作为领域 Agent 挂载，不定义整个产品边界。",
      "- Specs / Steering / Hooks 只生成协议草案；落盘必须走 Gateway write_file 审批。",
      "- 远程模型、MCP、Scheduler、Skill runtime、命令执行和文件写入全部保留显式 gate。",
      "",
      "## 当前上下文",
      contextLines,
      "",
      "## 关联审批",
      approvalLines,
      "",
      "## Specs 状态",
      specLines,
      "",
    ].join("\n");
    const design = [
      "# Design",
      "",
      `生成时间：${now}`,
      "",
      "## Workbench 架构",
      "- Header：品牌、工作区、模型设置、布局 Part 控制。",
      "- Activity Bar：Agent OS、工作区、记忆、Skills、工具、后台任务等顶层 View Container。",
      "- 主侧边栏：资源管理器、Agent 线程、工作区文件树、线程空间。",
      "- 主工作区：Agent 运行线程、命令中心、Specs 控制面、Memory / Provider / Worker 管理器。",
      "- 辅助侧边栏：Changes / Diff、只读文件预览、审批与运行上下文。",
      "- 底部 Panel：终端、输出、问题、Worker、Gateway、审批复核台。",
      "",
      "## Steering",
      steeringLines,
      "",
      "## Hooks",
      hookLines,
      "",
      "## Subagents",
      subagentLines,
      "",
      "## MCP / Tool Governance",
      mcpLines,
      "",
      "## 安全边界",
      safetyLines,
      "",
    ].join("\n");
    const tasks = [
      "# Tasks",
      "",
      `生成时间：${now}`,
      "",
      "## 当前可执行步骤",
      "- [ ] 复核 Requirements / Design / Tasks 草案是否符合当前线程目标。",
      "- [ ] 接受后通过 `write_file` 审批写入 `.lumen/specs/current/*`。",
      "- [ ] 复核 Steering 草案，确认哪些规则应进入 `.lumen/steering/*`。",
      "- [ ] 后续把 Hooks 从策略视图升级为可审查 hook 草案，不直接执行。",
      "- [ ] 把多项目 thread spaces 与 Specs 目录绑定，形成真实项目协议。",
      "",
      "## 阻断条件",
      "- 不允许绕过 Gateway approval queue。",
      "- 不允许从泄露源码复制实现。",
      "- 不允许把 Writing Agent 重新抬成产品外壳。",
      "",
    ].join("\n");
    const steering = [
      "# LumenOS Steering",
      "",
      `生成时间：${now}`,
      "",
      steeringLines,
      "",
      "## 术语保留",
      "- Skills、tokens、Provider、Gateway、Worker、MCP、context_pack、thread_context 保留英文技术词。",
      "- 其他 UI 文案中文优先。",
      "",
    ].join("\n");
    const hooks = [
      "# LumenOS Hooks Draft",
      "",
      `生成时间：${now}`,
      "",
      hookLines,
      "",
      "## 执行规则",
      "- 当前文件只是 hooks 协议草案，不注册系统 hook。",
      "- 真正启用 hook 前必须进入审批队列，并声明事件、作用域、允许工具和回滚策略。",
      "",
    ].join("\n");
    return [
      { path: ".lumen/specs/current/requirements.md", title: "Requirements", kind: "spec", content: requirements },
      { path: ".lumen/specs/current/design.md", title: "Design", kind: "spec", content: design },
      { path: ".lumen/specs/current/tasks.md", title: "Tasks", kind: "spec", content: tasks },
      { path: ".lumen/steering/lumenos.md", title: "Steering", kind: "steering", content: steering },
      { path: ".lumen/hooks/lumenos-hooks.md", title: "Hooks", kind: "hook", content: hooks },
    ];
  };
  const agentModelTaskReady = Boolean((threadComposer.trim() || commandTask.trim() || activeThread?.task || "").trim());
  const agentModelWorkerRunning = ["queued", "starting", "running"].includes(agentModelWorker.status);
  const agentModelGateDetail = apiReady
    ? endpointLocal
      ? "本地模型端点可直接走 execute_model；输出会回填到当前线程。"
      : "远程模型仍需 allow_remote_model 明确授权；未授权时只会形成审批/阻塞轨迹。"
    : "需要先在模型设置里配置 endpoint、model 和密钥。";
  const agentModelWorkerResultPayload = asRecord(agentModelWorker.result);
  const agentModelWorkerResultWorkers = asRecord(agentModelWorkerResultPayload.workers);
  const agentModelWorkerResultJob = asRecord(agentModelWorkerResultWorkers.job || agentModelWorkerResultPayload.worker);
  const agentModelWorkerEvents = (
    asRecordList(agentModelWorkerResultJob.events).length
      ? asRecordList(agentModelWorkerResultJob.events)
      : [
        ...asRecordList(agentModelWorkerResultWorkers.events),
        ...asRecordList(asRecord(agentModelWorkerResultPayload.worker).events),
      ]
  ).slice(-8);
  const agentModelWorkerStreamPreview = agentModelWorkerEvents
    .filter((event) => asString(event.type) === "model_stream_chunk")
    .map((event) => asString(event.text))
    .filter(Boolean)
    .join("");
  const activeWorkspaceFiles = activeWorkspace?.book.workspace.files || [];
  const normalizedExplorerSearch = workspaceExplorerSearch.trim().toLowerCase();
  const workspaceFileCategories = activeWorkspace?.book.workspace.categories?.length
    ? activeWorkspace.book.workspace.categories
    : Array.from(new Set(activeWorkspaceFiles.map((file) => file.category || "未分组")));
  const workspaceFileGroups = workspaceFileCategories
    .map((category) => ({
      category,
      files: activeWorkspaceFiles
        .filter((file) => {
          if ((file.category || "未分组") !== category) return false;
          if (!normalizedExplorerSearch) return true;
          const searchable = [
            file.title,
            file.category,
            file.summary,
            file.kind,
            file.kind === "image" ? file.altText : htmlToPlainText(file.content),
          ].filter(Boolean).join("\n").toLowerCase();
          return searchable.includes(normalizedExplorerSearch);
        })
        .map((file) => ({
          file,
          words: wordCount(file.content).total,
          selected: file.id === (selectedExplorerFileId || activeWorkspace?.book.workspace.selectedFileId),
        })),
    }))
    .filter((group) => group.files.length > 0);
  const selectedExplorerFile = activeWorkspaceFiles.find((file) => file.id === selectedExplorerFileId)
    || activeWorkspaceFiles.find((file) => file.id === activeWorkspace?.book.workspace.selectedFileId)
    || activeWorkspaceFiles[0]
    || null;
  const selectedExplorerText = selectedExplorerFile
    ? selectedExplorerFile.kind === "image"
      ? selectedExplorerFile.altText || selectedExplorerFile.summary || "图片素材，当前预览只显示元数据。"
      : htmlToPlainText(selectedExplorerFile.content).trim() || selectedExplorerFile.summary || "空文件"
    : "";
  const filteredExplorerFileCount = workspaceFileGroups.reduce((sum, group) => sum + group.files.length, 0);
  const recentWorkspaceFiles = [...activeWorkspaceFiles]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map((file) => ({
      file,
      words: wordCount(file.content).total,
    }));
  const openExplorerFileInEditor = (fileId = selectedExplorerFile?.id) => {
    if (!activeWorkspace) return;
    if (fileId && onOpenBookFile) {
      onOpenBookFile(activeWorkspace.book.id, fileId);
      return;
    }
    onOpenBook(activeWorkspace.book.id);
  };

  const appendAgentThreadContextAttachments = (attachments: AgentThreadContextAttachment[], messageTitle = "挂载上下文") => {
    if (!activeThread || !attachments.length) return;
    const now = Date.now();
    setAgentThreads((prev) => prev.map((thread) => thread.id === activeThread.id
      ? {
        ...thread,
        contextAttachments: mergeAgentThreadContextAttachments(thread.contextAttachments, attachments),
        summary: `${messageTitle}：${attachments.map((item) => item.title).slice(0, 3).join(" / ")}`,
        updatedAt: now,
        events: [{
          id: `event-${uid()}`,
          kind: "system" as const,
          title: messageTitle,
          detail: `已挂载 ${attachments.length} 条线程上下文附件。`,
          status: "attached",
          at: now,
        }, ...thread.events].slice(0, 24),
        messages: [...thread.messages, createAgentThreadMessage({
          role: "system",
          title: messageTitle,
          content: attachments.map((item) => `- ${item.kind}: ${item.title} · ${item.detail}`).join("\n"),
          status: "attached",
          at: now,
        })].slice(-36),
      }
      : thread));
    appendRuntimeLog({
      channel: "output",
      title: messageTitle,
      detail: `${activeThread.title} · ${attachments.length} 条上下文附件`,
      status: "attached",
    });
  };

  const removeAgentThreadContextAttachment = (attachmentId: string) => {
    if (!activeThread) return;
    setAgentThreads((prev) => prev.map((thread) => thread.id === activeThread.id
      ? {
        ...thread,
        contextAttachments: thread.contextAttachments.filter((item) => item.id !== attachmentId),
        updatedAt: Date.now(),
      }
      : thread));
  };

  const clearAgentThreadContextAttachments = () => {
    if (!activeThread) return;
    const ok = window.confirm(`清空线程「${activeThread.title}」的本地上下文附件？这不会删除文件、记忆或审批队列。`);
    if (!ok) return;
    setAgentThreads((prev) => prev.map((thread) => thread.id === activeThread.id
      ? { ...thread, contextAttachments: [], updatedAt: Date.now() }
      : thread));
  };

  const attachSelectedFileToThread = () => {
    if (!selectedExplorerFile || !activeWorkspace) return;
    appendAgentThreadContextAttachments([createAgentThreadContextAttachment({
      kind: "file",
      title: selectedExplorerFile.title || "未命名文件",
      detail: `${selectedExplorerFile.category || "未分组"} · ${formatNumber(wordCount(selectedExplorerFile.content).total)} 字 · ${formatDateTime(selectedExplorerFile.updatedAt)}`,
      ref: selectedExplorerFile.id,
      source: activeWorkspace.title,
      status: "attached",
    })], "挂载当前文件");
  };

  const attachSelectedMemoryToThread = () => {
    if (!selectedMemoryRow) return;
    appendAgentThreadContextAttachments([createAgentThreadContextAttachment({
      kind: "memory",
      title: `${selectedMemoryRow.kind} · ${selectedMemoryRow.dimension || "memory"}`,
      detail: selectedMemoryRow.summary,
      ref: selectedMemoryRow.id,
      source: selectedMemoryRow.source || "AutoDream",
      status: "attached",
    })], "挂载选中记忆");
  };

  const attachCommandDraftContextToThread = () => {
    const attachments = commandDraft.contextItems.slice(0, 8).map((item, index) => createAgentThreadContextAttachment({
      kind: "context_pack",
      title: asString(item.dimension, asString(item.type, `上下文切片 ${index + 1}`)),
      detail: asString(item.summary, asString(item.content, asString(item.title, "上下文切片"))),
      ref: asString(item.id, `${commandDraft.task || "task"}-${index}`),
      source: state.online ? "Gateway context_pack" : "Local context draft",
      status: commandDraft.status || "draft",
    }));
    appendAgentThreadContextAttachments(attachments, "挂载草案上下文");
  };

  const attachActiveSkillsToThread = () => {
    const skillKeys = commandDraft.activeSkillKeys.length
      ? commandDraft.activeSkillKeys
      : [
        ...skillRecentActivated.map((item) => asString(item.key, asString(item.id, asString(item.title)))),
        ...skillRecentCandidates.map((item) => asString(item.key, asString(item.id, asString(item.title)))),
      ].filter(Boolean).slice(0, 8);
    const attachments = Array.from(new Set(skillKeys)).slice(0, 8).map((key) => createAgentThreadContextAttachment({
      kind: "skill",
      title: key,
      detail: commandDraft.activeSkillKeys.includes(key) ? "来自当前任务草案的 active_skill_keys。" : "来自最近 Skills 候选/激活记录。",
      ref: key,
      source: "Skills",
      status: commandDraft.activeSkillKeys.includes(key) ? "active" : "candidate",
    }));
    appendAgentThreadContextAttachments(attachments, "挂载 Skills");
  };

  const agentThreadRows = visibleAgentThreads.map((thread) => ({
    id: thread.id,
    title: thread.title || "未命名 Agent 线程",
    status: thread.status || "current",
    detail: thread.summary || thread.events[0]?.detail || "等待任务草案、Worker 复核和审批轨迹。",
    thread,
  }));
  const proposalForDiff = asRecord(commandApproval.proposal);
  const commandChangePath = asString(
    proposalForDiff.target_relative,
    asString(proposalForDiff.target_path, commandApprovalTargetPath),
  ) || commandApprovalTargetPath;
  const matchedWorkspaceFile = activeWorkspaceFiles.find((file) => {
    const title = comparableFileName(file.title);
    const pathName = comparableFileName(commandChangePath);
    return title === pathName || file.title.toLowerCase() === pathBaseName(commandChangePath).toLowerCase();
  });
  const changeFileRows: ChangeFileRow[] = commandDiffHunks.length
    ? [{
      id: `command-${commandChangePath}`,
      title: pathBaseName(commandChangePath),
      path: commandChangePath,
      status: commandDiffHunks.some((hunk) => hunk.status === "pending")
        ? "pending"
        : acceptedCommandHunkCount && !rejectedCommandHunkCount
          ? "accepted"
          : rejectedCommandHunkCount && !acceptedCommandHunkCount
            ? "rejected"
            : "partial",
      detail: `${commandDiffHunks.length} 个 hunk · ${acceptedCommandHunkCount} 接受 / ${rejectedCommandHunkCount} 拒绝`,
      hunks: commandDiffHunks,
      accepted: acceptedCommandHunkCount,
      rejected: rejectedCommandHunkCount,
      pending: commandDiffHunks.length - acceptedCommandHunkCount - rejectedCommandHunkCount,
      workspaceFileId: matchedWorkspaceFile?.id,
    }]
    : workerMergeProposals.slice(0, 5).map((proposal) => {
      const path = asString(
        proposal.target_relative,
        asString(proposal.target_path, asString(proposal.proposal_path, asString(proposal.id, "merge-proposal"))),
      );
      const workspaceFile = activeWorkspaceFiles.find((file) => comparableFileName(file.title) === comparableFileName(path));
      return {
        id: asString(proposal.id, asString(proposal.proposal_path, asString(proposal.job_id, path))),
        title: pathBaseName(path),
        path,
        status: asString(proposal.status, "draft"),
        detail: asString(proposal.proposal_path, "等待合并草案"),
        hunks: [],
        accepted: 0,
        rejected: 0,
        pending: 0,
        workspaceFileId: workspaceFile?.id,
      };
    });
  const selectedChangeFile = changeFileRows.find((row) => row.id === selectedChangeFileId) || changeFileRows[0] || null;
  const problemRows = [
    {
      id: "completion",
      title: "Completion Audit",
      status: completionMissing ? "missing" : completionPartial ? "partial" : "pass",
      detail: `partial ${completionPartial} · missing ${completionMissing}`,
    },
    {
      id: "gateway",
      title: "Gateway",
      status: state.online ? "pass" : "offline",
      detail: state.online ? `最近刷新 ${formatTime(state.refreshedAt)}` : state.error || "Gateway 未连接",
    },
    {
      id: "provider",
      title: "Provider",
      status: apiReady ? "pass" : "setup-needed",
      detail: apiReady ? `${effectiveProviderLabel} · ${settings.modelId || "model 未设置"}` : "需要配置 API endpoint / key / model",
    },
    {
      id: "remote-model",
      title: "远程模型闸门",
      status: endpointLocal || !settings.apiUrl ? "gated" : "approval_required",
      detail: endpointLocal ? "本地端点优先" : "远程模型需要 allow_remote_model 明确授权",
    },
  ];
  const runtimeLogRows = runtimeLogs
    .filter((entry) => runtimeLogMatchesText(entry, workbenchLayout.runtimeLogFilter))
    .filter((entry) => runtimeLogMatchesStatus(entry, workbenchLayout.runtimeLogStatusFilter))
    .slice(0, 80);
  const outputLogRows = runtimeLogRows.filter((entry) => entry.channel === "output").slice(0, 12);
  const workerLogRows = runtimeLogRows.filter((entry) => entry.channel === "workers").slice(0, 12);
  const gatewayLogRows = runtimeLogRows.filter((entry) => entry.channel === "gateway").slice(0, 12);
  const approvalLogRows = runtimeLogRows.filter((entry) => entry.channel === "approvals").slice(0, 12);
  const terminalLogRows = runtimeLogRows
    .filter((entry) => entry.channel === "terminal" || entry.channel === "gateway" || entry.channel === "workers")
    .slice(0, 14);
  const problemLogRows = runtimeLogRows
    .filter((entry) => ISSUE_LOG_STATUSES.has(entry.status))
    .slice(0, 8);
  const terminalRuntimeText = terminalLogRows.length
    ? terminalLogRows.map((entry) => `[${formatTime(entry.at)}] ${entry.channel} ${statusLabel(entry.status)} · ${entry.title}\n  ${entry.detail}`).join("\n")
    : "[runtime] 暂无运行日志";
  const runtimeLogFilterActive = Boolean(workbenchLayout.runtimeLogFilter.trim()) || workbenchLayout.runtimeLogStatusFilter !== "all";
  const currentPanelLogRows = bottomPanelTab === "output"
    ? outputLogRows
    : bottomPanelTab === "workers"
      ? workerLogRows
      : bottomPanelTab === "gateway"
        ? gatewayLogRows
        : bottomPanelTab === "approvals"
          ? approvalLogRows
          : bottomPanelTab === "problems"
            ? problemLogRows
            : terminalLogRows;
  const bottomPanelTabs = [
    { id: "terminal" as const, label: "终端", meta: `${terminalLogRows.length}` },
    { id: "output" as const, label: "输出", meta: `${outputLogRows.length}` },
    { id: "problems" as const, label: "问题", meta: `${completionPartial + completionMissing + problemLogRows.length}` },
    { id: "workers" as const, label: "Worker", meta: `${workerCount}/${workerLogRows.length}` },
    { id: "gateway" as const, label: "Gateway", meta: state.online ? `ok/${gatewayLogRows.length}` : `off/${gatewayLogRows.length}` },
    { id: "approvals" as const, label: "审批", meta: `${approvalQueueCount}/${approvalLogRows.length}` },
  ];
  const toggleExplorerCategory = (category: string) => {
    setCollapsedExplorerCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };
  const selectWorkbenchView = (view: WorkbenchView) => {
    setActiveView(view);
    if (view === "memory") setDetailTab("memory");
    if (view === "skills" || view === "writing") setDetailTab("skills");
    if (view === "providers") setDetailTab("providers");
    if (view === "workers") setDetailTab("workers");
    if (view === "agent" || view === "tools" || view === "automation" || view === "workspaces") setDetailTab("overview");
  };
  const primaryNav = [
    { label: "Agent OS", meta: "运行台", icon: <Activity className="h-4 w-4" />, view: "agent" as const },
    { label: "工作区", meta: `${library.books.length} 个`, icon: <Library className="h-4 w-4" />, view: "workspaces" as const },
    { label: "记忆", meta: `L2 ${asNumber(memory.l2_count)}`, icon: <Brain className="h-4 w-4" />, view: "memory" as const },
    { label: "Skills", meta: `${prompts.length + customPrompts.length}`, icon: <Sparkles className="h-4 w-4" />, view: "skills" as const },
    { label: "工具", meta: `${enabledTools.length} 已开`, icon: <Wrench className="h-4 w-4" />, view: "tools" as const },
    { label: "模型", meta: `${totalProviderPresetCount} 预设`, icon: <Server className="h-4 w-4" />, view: "providers" as const },
    { label: "后台任务", meta: `${workerCount} 个`, icon: <Cpu className="h-4 w-4" />, view: "workers" as const },
    { label: "规格 / 钩子", meta: "Specs", icon: <Timer className="h-4 w-4" />, view: "automation" as const },
    { label: "写作 Agent", meta: activeWorkspace?.title || "无工作区", icon: <BookOpen className="h-4 w-4" />, view: "writing" as const },
  ];
  const activityRail = [
    { label: "工作区", icon: <Library className="h-5 w-5" />, view: "workspaces" as const },
    { label: "Agent OS", icon: <Activity className="h-5 w-5" />, view: "agent" as const },
    { label: "记忆", icon: <Brain className="h-5 w-5" />, view: "memory" as const },
    { label: "Skills", icon: <Sparkles className="h-5 w-5" />, view: "skills" as const },
    { label: "工具", icon: <Wrench className="h-5 w-5" />, view: "tools" as const },
    { label: "后台任务", icon: <Cpu className="h-5 w-5" />, view: "workers" as const },
  ];
  const workbenchTabs = [
    { label: "Agent OS 控制台", view: "agent" as const },
    { label: "工作区", view: "workspaces" as const },
    { label: "规格 / 钩子", view: "automation" as const },
    { label: "上下文包", view: "memory" as const },
    { label: "工具", view: "tools" as const },
  ];
  const currentViewItem = primaryNav.find((item) => item.view === activeView) || primaryNav[0];
  const visibleWorkbenchPartCount = [
    workbenchLayout.activityBarVisible,
    workbenchLayout.primarySidebarVisible,
    true,
    workbenchLayout.secondarySidebarVisible,
    workbenchLayout.bottomPanelVisible,
    workbenchLayout.statusbarVisible,
  ].filter(Boolean).length;
  const workbenchGridTemplateColumns = [
    workbenchLayout.activityBarVisible ? "52px" : "",
    workbenchLayout.primarySidebarVisible ? "280px" : "",
    "minmax(0, 1fr)",
    workbenchLayout.secondarySidebarVisible ? "360px" : "",
  ].filter(Boolean).join(" ");
  const writingWorkspaces = allWorkspaceSummaries.filter((item) => {
    const domain = item.domain.toLowerCase();
    return domain.includes("writing") || domain.includes("写作");
  });

  const renderPartToggle = ({
    label,
    title,
    visible,
    onClick,
    icon,
  }: {
    label: string;
    title: string;
    visible: boolean;
    onClick: () => void;
    icon: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-pressed={visible}
      onClick={onClick}
      className={`inline-flex h-7 items-center justify-center gap-1.5 rounded border px-2 text-[10px] transition-colors ${
        visible
          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
          : "border-slate-800 bg-slate-950 text-slate-500 hover:border-cyan-500/40 hover:text-slate-200"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const renderWorkbenchHeader = ({
    icon,
    eyebrow,
    title,
    description,
    status,
    actions,
  }: {
    icon: React.ReactNode;
    eyebrow: string;
    title: string;
    description: string;
    status?: string;
    actions?: React.ReactNode;
  }) => (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-cyan-300">
            {icon}
            {eyebrow}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {status && <StatusBadge status={status} />}
          {actions}
        </div>
      </div>
    </div>
  );

  const renderSystemMetrics = () => (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <MetricTile
        label="当前视图"
        value={currentViewItem.label}
        hint="活动栏、主侧边栏、顶部标签已联动"
        icon={currentViewItem.icon}
      />
      <MetricTile
        label="Gateway"
        value={state.online ? "在线" : "离线"}
        hint={state.online ? `最近刷新 ${formatTime(state.refreshedAt)}` : state.error || "静态模式可继续处理任务"}
        icon={state.online ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-amber-300" />}
      />
      <MetricTile
        label="权限档案"
        value={statusLabel(asString(capabilities.arbitrary_shell, "disabled"))}
        hint={`读 ${asBoolean(capabilities.execute_read) ? "开" : "关"} / 写 ${asBoolean(capabilities.execute_write) ? "开" : "审批"} / Full ${asBoolean(capabilities.full_access_files) ? "开" : "关"}`}
        icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />}
      />
      <MetricTile
        label="上下文包"
        value={`${asNumber(memory.l2_count)} L2`}
        hint={`Skills ${prompts.length + customPrompts.length} / 工具 ${enabledTools.length} 已开`}
        icon={<Brain className="h-4 w-4 text-pink-300" />}
      />
    </div>
  );

  const renderBottomPanel = () => (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex h-9 items-center gap-1 border-b border-slate-800 bg-slate-950/70 px-2">
        <div className="mr-2 flex items-center gap-2 px-2 text-xs font-semibold text-slate-300">
          <Activity className="h-3.5 w-3.5 text-cyan-300" />
          底部 Panel
        </div>
        {bottomPanelTabs.map((tab) => (
          <button
            key={tab.id}
            data-testid={`bottom-panel-tab-${tab.id}`}
            onClick={() => setBottomPanelTab(tab.id)}
            className={`flex h-7 items-center gap-2 rounded px-2 text-[11px] transition-colors ${
              bottomPanelTab === tab.id
                ? "bg-slate-800 text-white"
                : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
            }`}
          >
            <span>{tab.label}</span>
            <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-500">{tab.meta}</span>
          </button>
        ))}
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <div className="hidden min-w-[180px] items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 lg:flex">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            <input
              value={workbenchLayout.runtimeLogFilter}
              onChange={(event) => updateWorkbenchLayout({ runtimeLogFilter: event.target.value })}
              className="h-5 min-w-0 flex-1 bg-transparent text-[10px] text-slate-300 outline-none placeholder:text-slate-600"
              placeholder="筛选日志"
            />
          </div>
          <select
            value={workbenchLayout.runtimeLogStatusFilter}
            onChange={(event) => updateWorkbenchLayout({ runtimeLogStatusFilter: event.target.value as RuntimeLogStatusFilter })}
            className="h-7 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-400 outline-none hover:border-cyan-500/40"
            title="日志状态筛选"
          >
            <option value="all">全部</option>
            <option value="issues">问题</option>
            <option value="active">活跃</option>
          </select>
          <select
            value={workbenchLayout.runtimeLogExportFormat}
            onChange={(event) => updateWorkbenchLayout({ runtimeLogExportFormat: event.target.value as RuntimeLogExportFormat })}
            className="h-7 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-400 outline-none hover:border-cyan-500/40"
            title="导出格式"
          >
            <option value="markdown">Markdown</option>
            <option value="jsonl">JSONL</option>
          </select>
          {runtimeLogFilterActive && (
            <button
              type="button"
              onClick={() => updateWorkbenchLayout({ runtimeLogFilter: "", runtimeLogStatusFilter: "all" })}
              className="h-7 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-500 hover:border-cyan-500/40 hover:text-slate-200"
            >
              清筛选
            </button>
          )}
          <span className="hidden text-[10px] text-slate-600 2xl:inline">
            当前 {currentPanelLogRows.length} / 筛选 {runtimeLogRows.length}
          </span>
          <button
            type="button"
            onClick={() => exportRuntimeLogs(currentPanelLogRows)}
            disabled={!currentPanelLogRows.length}
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            title="导出当前 Panel 的筛选日志"
          >
            <Download className="h-3.5 w-3.5" />
            导出
          </button>
          <button
            type="button"
            onClick={clearRuntimeLogs}
            disabled={!runtimeLogs.length}
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-400 hover:border-red-500/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
            title="清空前端本地运行日志"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/40 px-3 py-2 text-[10px] text-slate-500 lg:hidden">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded border border-slate-800 bg-slate-950 px-2 py-1">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-600" />
          <input
            value={workbenchLayout.runtimeLogFilter}
            onChange={(event) => updateWorkbenchLayout({ runtimeLogFilter: event.target.value })}
            className="h-5 min-w-0 flex-1 bg-transparent text-[10px] text-slate-300 outline-none placeholder:text-slate-600"
            placeholder="筛选日志"
          />
        </label>
        <span>{runtimeLogRows.length}/{runtimeLogs.length} 条</span>
      </div>
      <div className="min-h-[170px] p-3">
        {bottomPanelTab === "terminal" && (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-slate-200">终端命令</div>
                  <div className="mt-1 text-[10px] text-slate-600">只允许 Gateway verification allowlist；任意 shell 仍关闭。</div>
                </div>
                <StatusBadge status={terminalCommand.status || (state.online ? "ready" : "offline")} subtle />
              </div>
              <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                <select
                  value={TERMINAL_COMMAND_PRESETS.includes(terminalCommand.command) ? terminalCommand.command : "custom"}
                  onChange={(event) => {
                    if (event.target.value !== "custom") {
                      setTerminalCommand((prev) => ({ ...prev, command: event.target.value, status: "", detail: "", result: null }));
                    }
                  }}
                  className="h-9 rounded border border-slate-800 bg-slate-950 px-2 text-xs text-slate-300 outline-none hover:border-cyan-500/40"
                >
                  {TERMINAL_COMMAND_PRESETS.map((command) => <option key={command} value={command}>{command}</option>)}
                  <option value="custom">自定义 allowlist 命令</option>
                </select>
                <input
                  value={terminalCommand.command}
                  onChange={(event) => setTerminalCommand((prev) => ({ ...prev, command: event.target.value, status: "", detail: "", result: null }))}
                  className="h-9 min-w-0 rounded border border-slate-800 bg-slate-950 px-3 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-500/50"
                  placeholder="例如：npx tsc --noEmit"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] leading-relaxed text-slate-600">
                  执行需要 Gateway `--execute-command` + payload `execute=true` + allowlist 命中。
                </span>
                <div className="flex flex-wrap gap-2">
                  <ActionButton label="只校验" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => void runTerminalCommand(false)} disabled={!state.online || !terminalCommand.command.trim() || terminalCommand.status === "running"} />
                  <ActionButton label="执行 allowlist" icon={<Activity className="h-3.5 w-3.5" />} onClick={() => void runTerminalCommand(true)} disabled={!state.online || !terminalCommand.command.trim() || terminalCommand.status === "running"} />
                </div>
              </div>
              {(terminalCommand.detail || terminalCommand.request || terminalCommand.result) && (
                <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-3 py-3 font-mono text-[10px] leading-relaxed text-slate-300">{terminalCommand.detail || JSON.stringify(terminalCommand.result || terminalCommand.request, null, 2)}</pre>
              )}
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-3 py-3 font-mono text-[10px] leading-relaxed text-slate-300">{`${terminalPreview}\n\n# 运行日志\n${terminalRuntimeText}`}</pre>
          </div>
        )}
        {bottomPanelTab === "output" && (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-200">输出日志</span>
                <span className="text-[10px] text-slate-600">{outputLogRows.length}</span>
              </div>
              <div className="grid max-h-44 gap-2 overflow-auto pr-1">
                {outputLogRows.length ? outputLogRows.map((entry) => (
                  <div key={entry.id} className="rounded border border-slate-800 bg-slate-950 px-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium text-slate-200">{entry.title}</span>
                      <StatusBadge status={entry.status} subtle />
                    </div>
                    <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{entry.detail || "无输出详情"}</div>
                    <div className="mt-1 text-[10px] text-slate-600">{formatDateTime(entry.at)}</div>
                  </div>
                )) : <EmptyBlock text="暂无输出日志" />}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
              <div className="mb-2 text-xs font-medium text-slate-200">Provider 输出</div>
              {providerAction.label ? (
                <div className="grid gap-2">
                  <MiniStat label="动作" value={providerAction.label} />
                  <MiniStat label="状态" value={statusLabel(providerAction.status)} tone={statusTone(providerAction.status)} />
                  <div className="rounded border border-slate-800 bg-slate-950 px-2 py-2 text-[10px] leading-relaxed text-slate-500">{providerAction.detail || "等待输出"}</div>
                </div>
              ) : <EmptyBlock text="暂无 Provider 输出" />}
            </div>
          </div>
        )}
        {bottomPanelTab === "problems" && (
          <div className="grid gap-2 md:grid-cols-2">
            {[...problemRows, ...problemLogRows.map((entry) => ({
              id: entry.id,
              title: entry.title,
              status: entry.status,
              detail: entry.detail,
            }))].map((problem) => (
              <div key={problem.id} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs font-medium text-slate-200">{problem.title}</span>
                  <StatusBadge status={problem.status} subtle />
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{problem.detail}</div>
              </div>
            ))}
          </div>
        )}
        {bottomPanelTab === "workers" && (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid max-h-44 gap-2 overflow-auto pr-1">
              {workerLogRows.length ? workerLogRows.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-200">{entry.title}</span>
                    <StatusBadge status={entry.status} subtle />
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{entry.detail}</div>
                  <div className="mt-1 text-[10px] text-slate-600">{formatDateTime(entry.at)}</div>
                </div>
              )) : workerRecentJobs.length ? workerRecentJobs.slice(0, 6).map((job) => <WorkerRow key={`bottom-${asString(job.id, asString(job.created_at))}`} item={job} />) : <EmptyBlock text="暂无 Worker 任务" />}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
              <div className="mb-2 text-xs font-medium text-slate-200">合并草案</div>
              <div className="grid gap-2">
                {workerMergeProposals.length ? workerMergeProposals.slice(0, 4).map((proposal) => (
                  <div key={`bottom-${asString(proposal.id, asString(proposal.proposal_path))}`} className="rounded border border-slate-800 bg-slate-950 px-2 py-2">
                    <div className="truncate text-[10px] text-slate-300">{asString(proposal.job_id, asString(proposal.id, "proposal"))}</div>
                    <PathLine value={asString(proposal.proposal_path)} />
                  </div>
                )) : <EmptyBlock text="暂无合并草案" />}
              </div>
            </div>
          </div>
        )}
        {bottomPanelTab === "gateway" && (
          <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1">
              <MiniStat label="Gateway" value={state.online ? "在线" : "离线"} tone={state.online ? "text-emerald-300" : "text-amber-300"} />
              <MiniStat label="刷新时间" value={formatTime(state.refreshedAt)} />
              <MiniStat label="Provider Catalog" value={providerReady ? "可用" : "预设兜底"} tone={providerReady ? "text-emerald-300" : "text-amber-300"} />
              <MiniStat label="错误" value={state.error || "无"} tone={state.error ? "text-amber-300" : "text-emerald-300"} />
            </div>
            <div className="grid max-h-44 gap-2 overflow-auto pr-1">
              {gatewayLogRows.length ? gatewayLogRows.map((entry) => (
                <div key={entry.id} className="rounded border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-200">{entry.title}</span>
                    <StatusBadge status={entry.status} subtle />
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{entry.detail}</div>
                  <div className="mt-1 text-[10px] text-slate-600">{formatDateTime(entry.at)}</div>
                </div>
              )) : <EmptyBlock text="暂无 Gateway 日志" />}
            </div>
          </div>
        )}
        {bottomPanelTab === "approvals" && (
          <div className="grid gap-3 xl:grid-cols-[260px_minmax(260px,0.85fr)_minmax(360px,1fr)]">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1">
              <MiniStat label="队列记录" value={`${approvalQueueCount}`} tone={approvalQueueCount ? "text-amber-300" : "text-slate-300"} />
              <MiniStat label="当前筛选" value={`${filteredApprovalSummaries.length}`} />
              <MiniStat label="原始记录" value={`${approvalRecords.length}`} />
              <MiniStat label="刷新状态" value={state.approval ? "可读" : "未连接"} tone={state.approval ? "text-emerald-300" : "text-amber-300"} />
              <div className="rounded border border-slate-800 bg-slate-950/50 px-3 py-3">
                <div className="mb-2 text-xs font-medium text-slate-200">筛选</div>
                <div className="grid gap-2">
                  <select
                    data-testid="approval-action-filter"
                    value={approvalActionFilter}
                    onChange={(event) => setApprovalActionFilter(event.target.value)}
                    className="h-7 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-400 outline-none hover:border-cyan-500/40"
                  >
                    <option value="all">全部动作</option>
                    {approvalActionOptions.map((action) => <option key={action} value={action}>{action}</option>)}
                  </select>
                  <select
                    data-testid="approval-status-filter"
                    value={approvalStatusFilter}
                    onChange={(event) => setApprovalStatusFilter(event.target.value)}
                    className="h-7 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-400 outline-none hover:border-cyan-500/40"
                  >
                    <option value="all">全部状态</option>
                    {approvalStatusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                  </select>
                  {(approvalActionFilter !== "all" || approvalStatusFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setApprovalActionFilter("all");
                        setApprovalStatusFilter("all");
                      }}
                      className="h-7 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-500 hover:border-cyan-500/40 hover:text-slate-200"
                    >
                      清筛选
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/50 px-3 py-3">
                <div className="mb-2 text-xs font-medium text-slate-200">动作分布</div>
                <div className="grid gap-1.5">
                  {Object.entries(approvalByAction).length ? Object.entries(approvalByAction).slice(0, 6).map(([action, count]) => (
                    <div key={action} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="truncate text-slate-500">{action}</span>
                      <span className="font-mono text-slate-300">{displayValue(count, "0")}</span>
                    </div>
                  )) : <span className="text-[10px] text-slate-600">暂无动作记录</span>}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/50 px-3 py-3">
                <div className="mb-2 text-xs font-medium text-slate-200">状态分布</div>
                <div className="grid gap-1.5">
                  {Object.entries(approvalByStatus).length ? Object.entries(approvalByStatus).slice(0, 6).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className={statusTone(status)}>{statusLabel(status)}</span>
                      <span className="font-mono text-slate-300">{displayValue(count, "0")}</span>
                    </div>
                  )) : <span className="text-[10px] text-slate-600">暂无状态记录</span>}
                </div>
              </div>
              <div className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-[10px] leading-relaxed text-slate-500">
                这里只读展示 Gateway approvals 队列；执行、写入、记忆变更、远程模型和 Scheduler 仍需要单独审批门。
              </div>
            </div>
            <div className="grid max-h-80 content-start gap-2 overflow-auto pr-1">
              {filteredApprovalSummaries.length ? filteredApprovalSummaries.map((item, index) => {
                const id = asString(item.id, `approval-${index}`);
                const action = asString(item.action, "unknown");
                const status = asString(item.status, "pending");
                const target = asString(item.target);
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`approval-row-${id}`}
                    onClick={() => {
                      setSelectedApprovalId(id);
                      setApprovalDetailTab(asRecord(item.proposal) && Object.keys(asRecord(item.proposal)).length ? "proposal" : "request");
                    }}
                    className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                      asString(selectedApprovalSummary?.id) === id
                        ? "border-cyan-500/50 bg-cyan-500/10"
                        : "border-slate-800 bg-slate-950/50 hover:border-cyan-500/30 hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[10px] text-cyan-300">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span className="truncate">{action}</span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-slate-500">{id}</div>
                      </div>
                      <StatusBadge status={status} subtle />
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div className="rounded border border-slate-800 bg-slate-950 px-2 py-2">
                        <div className="text-[10px] text-slate-600">目标</div>
                        <div className="mt-1 break-words text-[10px] leading-relaxed text-slate-300">{target || "未声明"}</div>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-950 px-2 py-2">
                        <div className="text-[10px] text-slate-600">时间 / 用途</div>
                        <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-300">
                          {formatDateTime(item.created_at)} · {asString(item.purpose, "无 purpose")}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{asString(item.message, "等待人工复核。")}</div>
                  </button>
                );
              }) : <EmptyBlock text={state.approval ? "当前筛选下没有审批记录" : "Gateway 暂未返回 approval_status"} />}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-cyan-300">
                    <ShieldCheck className="h-4 w-4" />
                    审批复核台
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-slate-500">{asString(selectedApprovalSummary?.id, "未选择")}</div>
                </div>
                {selectedApprovalSummary && <StatusBadge status={asString(selectedApprovalSummary.status, "pending")} subtle />}
              </div>
              {selectedApprovalSummary ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <MiniStat label="动作" value={asString(selectedApprovalSummary.action, "unknown")} />
                    <MiniStat label="状态" value={statusLabel(asString(selectedApprovalSummary.status, "pending"))} tone={statusTone(asString(selectedApprovalSummary.status, "pending"))} />
                    <MiniStat label="目标" value={asString(selectedApprovalSummary.target, "未声明")} />
                    <MiniStat label="时间" value={formatDateTime(selectedApprovalSummary.created_at)} />
                  </div>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="rounded border border-slate-800 bg-slate-950 px-2 py-2 text-[10px] leading-relaxed text-slate-500">
                      当前线程：{activeThread?.title || "未选择"} · {selectedApprovalLinkedToActiveThread ? "已关联" : "未关联"}
                    </div>
                    <ActionButton
                      label={selectedApprovalLinkedToActiveThread ? "已关联当前线程" : "关联当前线程"}
                      icon={<LinkIcon className="h-3.5 w-3.5" />}
                      onClick={() => linkApprovalToActiveThread()}
                      disabled={!activeThread || !selectedApprovalSummary || selectedApprovalLinkedToActiveThread}
                    />
                  </div>
                  <div className="grid gap-2 rounded border border-slate-800 bg-slate-950 px-2 py-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="min-w-0 text-[10px] leading-relaxed text-slate-500">
                      执行门：{selectedApprovalAction === "write_file" ? "write_file 可请求执行" : "非 write_file 只允许拒绝或继续复核"} · {selectedApprovalIsTerminal ? "已终态" : state.online ? "Gateway 在线" : "Gateway 离线"}
                    </div>
                    <ActionButton
                      label={approvalDecision.status === "running" && approvalDecision.decision === "reject" ? "拒绝中" : "拒绝审批"}
                      icon={<XCircle className="h-3.5 w-3.5" />}
                      onClick={() => void decideSelectedApproval("reject")}
                      disabled={!selectedApprovalCanReject}
                    />
                    <ActionButton
                      label={approvalDecision.status === "running" && approvalDecision.decision === "execute" ? "执行中" : "执行 write_file"}
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      onClick={() => void decideSelectedApproval("execute")}
                      disabled={!selectedApprovalCanExecuteWrite}
                    />
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 px-2 py-2 text-[10px] leading-relaxed text-slate-500">
                    {asString(selectedApprovalSummary.message, "等待人工复核。")}
                  </div>
                  {approvalDecision.approvalId === selectedApprovalIdValue && approvalDecision.status && (
                    <div
                      data-testid="approval-decision-result"
                      className="rounded border border-cyan-500/20 bg-cyan-500/5 px-2 py-2 text-[10px] leading-relaxed text-slate-400"
                    >
                      <span className={statusTone(approvalDecision.status)}>{statusLabel(approvalDecision.status)}</span>
                      <span className="mx-1 text-slate-600">·</span>
                      {approvalDecision.detail}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {(["proposal", "request", "result", "decision"] as ApprovalDetailTab[]).map((tabId) => (
                      <button
                        key={tabId}
                        type="button"
                        onClick={() => setApprovalDetailTab(tabId)}
                        className={`h-7 rounded border px-2 text-[10px] transition-colors ${
                          approvalDetailTab === tabId
                            ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                            : "border-slate-800 bg-slate-950 text-slate-500 hover:border-cyan-500/40 hover:text-slate-200"
                        }`}
                      >
                        {tabId === "proposal" ? "Proposal 草案" : tabId === "request" ? "Request 请求" : tabId === "result" ? "Result 结果" : "Decision 决策"}
                      </button>
                    ))}
                  </div>
                  {Object.keys(selectedApprovalDetail).length ? (
                    <pre
                      data-testid="approval-detail-json"
                      className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-400"
                    >
                      {JSON.stringify(selectedApprovalDetail, null, 2)}
                    </pre>
                  ) : (
                    <EmptyBlock text={`${approvalDetailTab} 暂无结构化数据；可切到 Request 或 Result 查看原始记录。`} />
                  )}
                  <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-2 text-[10px] leading-relaxed text-slate-500">
                    复核台只执行两类决策：拒绝审批，或在 Gateway 执行门开启时执行已排队的 write_file。
                  </div>
                </div>
              ) : <EmptyBlock text="选择一条审批记录后查看详情" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderAgentWorkbench = () => (
    <div className="grid min-h-[calc(100vh-220px)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 bg-slate-950/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-cyan-300">
                <Layers className="h-4 w-4" />
                主工作区 / Agent 运行台
              </div>
              <h3 className="mt-1 text-base font-semibold text-white">Agent 运行线程</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={activeDomain} />
              <StatusBadge status={state.online ? "online" : "offline"} />
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="mb-4 rounded-lg border border-cyan-500/20 bg-slate-950/70 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <SectionTitle icon={<Activity className="h-4 w-4 text-cyan-300" />} title="线程管理器" meta={activeThread ? statusLabel(activeThread.status) : "未选择"} />
                <h4 className="mt-2 truncate text-sm font-semibold text-white">{activeThread?.title || "未命名 Agent 线程"}</h4>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{activeThread?.summary || "新建线程后，任务草案、Worker、审批和 Diff 会沉淀到这里。"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton label="新建线程" icon={<Plus className="h-3.5 w-3.5" />} onClick={createAgentThreadFromCommand} />
                <ActionButton label="绑定当前工作区" icon={<FolderKanban className="h-3.5 w-3.5" />} onClick={() => activeThread && bindAgentThreadToActiveWorkspace(activeThread.id)} disabled={!activeThread || !activeWorkspace || activeThread.workspaceId === activeWorkspace?.book.id} />
                <ActionButton label="创建分支" icon={<GitBranch className="h-3.5 w-3.5" />} onClick={() => activeThread && branchAgentThread(activeThread.id)} disabled={!activeThread} />
                <ActionButton label="导出" icon={<Download className="h-3.5 w-3.5" />} onClick={() => activeThread && exportAgentThread(activeThread.id)} disabled={!activeThread} />
                {activeThread?.archivedAt ? (
                  <ActionButton label="恢复线程" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => restoreAgentThread(activeThread.id)} />
                ) : (
                  <ActionButton label="归档线程" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => activeThread && archiveAgentThread(activeThread.id)} disabled={!activeThread} />
                )}
                <ActionButton label="删除本地记录" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => activeThread && deleteAgentThread(activeThread.id)} disabled={!activeThread} />
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <MiniStat label="绑定工作区" value={activeThread?.workspaceTitle || activeWorkspace?.title || "未绑定"} />
                <MiniStat label="线程空间" value={activeThreadSpaceLabel} />
                <MiniStat label="空间索引" value={`${Object.keys(agentThreadSpacesIndex.spaces).length} spaces`} />
                <MiniStat label="最近 Worker" value={activeThread?.workerJobId ? truncateMiddle(activeThread.workerJobId, 8) : "无"} />
                <MiniStat label="审批记录" value={`${activeThread?.approvalCount || 0}`} />
                <MiniStat label="上下文附件" value={`${activeThread?.contextAttachments.length || 0}`} />
                <MiniStat label="Diff 改动块" value={`${activeThread?.diffCount || 0}`} />
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-200">线程事件</span>
                  <span className="text-[10px] text-slate-600">{activeThread?.events.length || 0}</span>
                </div>
                <div className="grid max-h-44 gap-2 overflow-auto pr-1">
                  {activeThread?.events.length ? activeThread.events.slice(0, 8).map((event) => (
                    <div key={event.id} className="rounded border border-slate-800 bg-slate-950/60 px-2 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] font-medium text-slate-200">{event.title}</span>
                        <StatusBadge status={event.status} subtle />
                      </div>
                      <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{event.detail}</div>
                      <div className="mt-1 text-[10px] text-slate-600">{formatDateTime(event.at)} · {event.kind}</div>
                    </div>
                  )) : <EmptyBlock text="暂无线程事件" />}
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <SectionTitle icon={<Layers className="h-4 w-4 text-blue-300" />} title="线程上下文附件" meta={`${activeThread?.contextAttachments.length || 0}`} />
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={attachSelectedFileToThread} disabled={!selectedExplorerFile} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40">挂当前文件</button>
                    <button type="button" onClick={attachSelectedMemoryToThread} disabled={!selectedMemoryRow} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40">挂选中记忆</button>
                    <button type="button" onClick={attachCommandDraftContextToThread} disabled={!commandDraft.contextItems.length} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40">挂草案上下文</button>
                    <button type="button" onClick={attachActiveSkillsToThread} disabled={!commandDraft.activeSkillKeys.length && !skillRecentActivated.length && !skillRecentCandidates.length} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40">挂 Skills</button>
                    <button type="button" onClick={clearAgentThreadContextAttachments} disabled={!activeThread?.contextAttachments.length} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-500 hover:border-rose-500/40 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40">清空</button>
                  </div>
                </div>
                <div className="grid max-h-44 gap-2 overflow-auto pr-1">
                  {activeThread?.contextAttachments.length ? activeThread.contextAttachments.map((item) => (
                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-cyan-200">{item.kind}</span>
                          <span className="truncate text-[10px] font-medium text-slate-200">{item.title}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{item.detail}</div>
                        <div className="mt-1 truncate text-[10px] text-slate-600">{item.source} · {formatDateTime(item.at)} · {item.ref}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAgentThreadContextAttachment(item.id)}
                        className="rounded border border-slate-800 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-600 hover:border-rose-500/40 hover:text-rose-200"
                      >
                        移除
                      </button>
                    </div>
                  )) : <EmptyBlock text="暂无线程上下文附件；可挂文件、记忆、Skills 或 context_pack 草案。" />}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-amber-300" />} title="关联审批" meta={`${activeThreadLinkedApprovalRows.length}/${activeThread?.approvalIds.length || 0}`} />
                  <button
                    type="button"
                    onClick={() => setBottomPanelTab("approvals")}
                    className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200"
                  >
                    打开复核台
                  </button>
                </div>
                <div className="grid max-h-44 gap-2 overflow-auto pr-1">
                  {activeThreadLinkedApprovalRows.length ? activeThreadLinkedApprovalRows.map((item) => {
                    const id = asString(item.id);
                    const source = asString(item.source, approvalSummaryById.has(id) ? "Gateway" : "thread_snapshot");
                    const syncedAt = asNumber(item.synced_at);
                    return (
                      <button
                        key={`linked-approval-${id}`}
                        type="button"
                        onClick={() => {
                          setSelectedApprovalId(id);
                          setBottomPanelTab("approvals");
                        }}
                        className="rounded border border-slate-800 bg-slate-950/60 px-2 py-2 text-left hover:border-cyan-500/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-[10px] text-cyan-200">{compactApprovalId(id)}</span>
                          <StatusBadge status={asString(item.status, "pending")} subtle />
                        </div>
                        <div className="mt-1 truncate text-[10px] text-slate-500">{asString(item.action, "approval")} · {asString(item.target, "未声明目标")}</div>
                        <div className="mt-1 truncate text-[10px] text-slate-600">
                          {source === "thread_snapshot" ? "线程快照" : source === "thread_id" ? "仅有关联 ID" : "Gateway 实时"}{syncedAt ? ` · 同步 ${formatTime(syncedAt)}` : ""}
                        </div>
                      </button>
                    );
                  }) : activeThread?.approvalIds.length ? (
                    <div className="rounded border border-slate-800 bg-slate-950/60 px-2 py-2 text-[10px] leading-relaxed text-slate-500">
                      当前线程已有 {activeThread.approvalIds.length} 个审批 ID，但 Gateway 当前返回的最近队列里暂未匹配；刷新审批复核台后可继续查看。
                    </div>
                  ) : <EmptyBlock text="暂无关联审批；在审批复核台选择记录后可关联当前线程。" />}
                </div>
              </div>
            </div>
          </div>
          <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3" data-testid="agent-thread-message-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <SectionTitle icon={<MessageSquare className="h-4 w-4 text-cyan-300" />} title="Agent 消息流" meta={`${activeThread?.messages.length || 0} 条`} />
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  线程消息、工具轨迹、草案、Worker 和审批会沉淀在这里；执行仍走下方命令中心与审批门。
                </p>
              </div>
              <StatusBadge status={activeThread?.status || "pending"} subtle />
            </div>
            <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
              {activeThread?.messages.length ? activeThread.messages.slice(-18).map((message) => {
                const roleLabel = message.role === "user"
                  ? "你"
                  : message.role === "assistant"
                    ? "Agent"
                    : message.role === "tool"
                      ? "工具"
                      : "系统";
                const alignClass = message.role === "user" ? "ml-auto max-w-[86%]" : "mr-auto max-w-[92%]";
                const toneClass = message.role === "user"
                  ? "border-cyan-500/30 bg-cyan-500/10"
                  : message.role === "tool"
                    ? "border-amber-500/20 bg-amber-500/5"
                    : message.role === "assistant"
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-slate-800 bg-slate-900/70";
                return (
                  <div key={message.id} className={`rounded-lg border px-3 py-2 ${alignClass} ${toneClass}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[10px] text-cyan-200">{roleLabel}</span>
                        <span className="truncate text-[10px] font-medium text-slate-200">{message.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600">{formatTime(message.at)}</span>
                        <StatusBadge status={message.status} subtle />
                      </div>
                    </div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">{message.content}</div>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => activeThread && branchAgentThread(activeThread.id, message.id)}
                          className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-500 hover:border-cyan-500/40 hover:text-cyan-200"
                        >
                          从此回滚分支
                        </button>
                      </div>
                    </div>
                  );
                }) : <EmptyBlock text="暂无线程消息" />}
            </div>
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3">
              <label className="sr-only" htmlFor="agent-thread-composer">Agent 线程输入</label>
              <textarea
                id="agent-thread-composer"
                data-testid="agent-thread-composer"
                value={threadComposer}
                onChange={(event) => setThreadComposer(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    void sendAgentThreadMessage(true);
                  }
                }}
                rows={2}
                className="min-h-[56px] w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500/50"
                placeholder="输入给当前 Agent 线程的消息；Ctrl+Enter 发送并生成任务草案"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] text-slate-600">普通发送只记录消息；生成草案进入 context_pack；模型 Worker 会注入 thread_context 并受 Provider 闸门控制。</span>
                <div className="flex flex-wrap gap-2">
                  <ActionButton label="发送" icon={<Send className="h-3.5 w-3.5" />} onClick={() => void sendAgentThreadMessage(false)} disabled={!threadComposer.trim()} />
                  <ActionButton label="发送并生成草案" icon={<ListChecks className="h-3.5 w-3.5" />} onClick={() => void sendAgentThreadMessage(true)} disabled={!threadComposer.trim() || commandDraft.status === "running"} />
                  <ActionButton label="模型 Worker 预检" icon={<Cpu className="h-3.5 w-3.5" />} onClick={() => void runAgentModelWorker("preview")} disabled={!state.online || !agentModelTaskReady || agentModelWorkerRunning} />
                  <ActionButton label="运行模型 Worker" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void runAgentModelWorker("run")} disabled={!state.online || !agentModelTaskReady || agentModelWorkerRunning || !apiReady} />
                </div>
              </div>
              <div className="mt-3 rounded border border-slate-800 bg-slate-900/60 px-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-slate-300">模型 Worker 状态</div>
                    <div className="mt-1 truncate text-[10px] text-slate-500">{agentModelWorker.detail || agentModelGateDetail}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {agentModelWorker.jobId && <span className="font-mono text-[10px] text-slate-600">{truncateMiddle(agentModelWorker.jobId, 10)}</span>}
                    <StatusBadge status={agentModelWorker.status || (apiReady ? "ready" : "gated")} subtle />
                  </div>
                </div>
                {agentModelWorker.request && (
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-500">{JSON.stringify(agentModelWorker.request, null, 2)}</pre>
                )}
                {agentModelWorkerEvents.length > 0 && (
                  <div className="mt-2 rounded border border-slate-800 bg-slate-950/70 px-2 py-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium text-slate-300">Worker 事件流</span>
                      <span className="text-[10px] text-slate-600">{agentModelWorkerEvents.length}</span>
                    </div>
                    <div className="grid max-h-24 gap-1 overflow-auto pr-1">
                      {agentModelWorkerEvents.map((event) => (
                        <div key={workerEventKey(event)} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-2 text-[10px]">
                          <span className="truncate text-slate-600">{formatTime(Date.parse(asString(event.at)) || Date.now())}</span>
                          <span className="truncate text-slate-400">{asString(event.type, "worker_event")} · {modelWorkerEventLabel(event)}</span>
                          <StatusBadge status={asString(event.status, "recorded")} subtle />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {agentModelWorkerStreamPreview && (
                  <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-2 text-[10px] leading-relaxed text-emerald-100">{agentModelWorkerStreamPreview}</pre>
                )}
              </div>
            </div>
          </div>
          <SectionTitle icon={<Activity className="h-4 w-4 text-cyan-300" />} title="命令中心" meta="任务 / 工具轨迹 / 审批" />
          <div className="rounded-lg border border-cyan-500/20 bg-slate-950/70 px-3 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono text-cyan-300">/</span>
              <span>输入任务后，先构建上下文、匹配 Skills、审查工具和模型闸门</span>
            </div>
            <label className="sr-only" htmlFor="lumen-command-task">Agent 任务</label>
            <textarea
              id="lumen-command-task"
              value={commandTask}
              onChange={(event) => setCommandTask(event.target.value)}
              rows={3}
              className="mt-3 min-h-[84px] w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500/50"
              placeholder={activeWorkspace ? `继续 ${activeWorkspace.title} · ${activeWorkspace.domain}` : "输入一个 Agent 任务，例如：审查当前项目并生成下一步实现计划"}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] text-slate-500">
                {activeWorkspace ? `工作区: ${activeWorkspace.title} · ${activeWorkspace.domain}` : "未选择工作区 · 可先生成通用草案"}
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton label="生成任务草案" icon={<ListChecks className="h-3.5 w-3.5" />} onClick={() => void runCommandDraft()} disabled={commandDraft.status === "running"} />
                <ActionButton label="批准派发只读 Worker" icon={<Cpu className="h-3.5 w-3.5" />} onClick={() => void runCommandWorker()} disabled={!state.online || !commandDraft.task || commandDraft.status === "running" || commandWorker.status === "running"} />
                <ActionButton label="打开审批" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => selectWorkbenchView("tools")} />
              </div>
            </div>
          </div>
          {commandDraft.status && (
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">任务草案</span>
                    {commandDraft.at > 0 && <span className="text-[10px] text-slate-500">{formatTime(commandDraft.at)}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{commandDraft.task || commandDraft.detail}</p>
                </div>
                <StatusBadge status={commandDraft.status} />
              </div>
              {commandDraft.detail && <div className="mt-2 text-[10px] text-cyan-200">{commandDraft.detail}</div>}
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200">上下文包草案</span>
                    <span className="rounded bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200">线程附件 {commandDraft.threadContextItems.length}</span>
                  </div>
                  {commandDraft.threadContextItems.length > 0 && (
                    <div className="mb-2 rounded border border-cyan-500/20 bg-cyan-500/5 px-2 py-2">
                      <div className="mb-1 text-[10px] font-medium text-cyan-200">线程附件注入</div>
                      <div className="flex flex-wrap gap-1.5">
                        {commandDraft.threadContextItems.slice(0, 6).map((item, index) => (
                          <span key={`${asString(item.ref, asString(item.id, "thread"))}-${index}`} className="rounded bg-slate-950 px-2 py-1 text-[10px] text-slate-300">
                            {asString(item.kind, asString(item.dimension, "thread"))} · {asString(item.title, "附件")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid max-h-44 gap-2 overflow-auto pr-1">
                    {commandDraft.contextItems.length ? commandDraft.contextItems.slice(0, 6).map((item, index) => (
                      <div key={`${asString(item.id, asString(item.title, "context"))}-${index}`} className="rounded border border-slate-800 bg-slate-950/60 px-2 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[10px] text-cyan-200">{asString(item.dimension, asString(item.type, "context"))}</span>
                          <span className="shrink-0 text-[10px] text-slate-600">{formatDateTime(item.at || item.updated_at)}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-400">{asString(item.summary, asString(item.content, asString(item.title, "上下文切片")))}</div>
                      </div>
                    )) : <EmptyBlock text={commandDraft.status === "running" ? "正在等待上下文包" : "暂无上下文切片"} />}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                  <div className="mb-2 text-xs font-medium text-slate-200">Skills / 工具边界</div>
                  <div className="flex flex-wrap gap-1.5">
                    {commandDraft.activeSkillKeys.length ? commandDraft.activeSkillKeys.slice(0, 10).map((key) => (
                      <span key={key} className="rounded bg-fuchsia-500/10 px-2 py-1 text-[10px] text-fuchsia-200">{key}</span>
                    )) : <span className="text-[10px] text-slate-500">等待 Skills 路由</span>}
                  </div>
                  <div className="mt-3 text-[10px] text-slate-500">排除工具</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {commandDraft.excludedToolScopes.length ? commandDraft.excludedToolScopes.slice(0, 10).map((scope) => (
                      <span key={scope} className="rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">{scope}</span>
                    )) : <span className="text-[10px] text-slate-500">暂无额外排除项</span>}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                  <div className="mb-2 text-xs font-medium text-slate-200">工具计划 / 审批预览</div>
                  <div className="grid gap-2">
                    {commandDraft.toolPlan.length ? commandDraft.toolPlan.map((step) => (
                      <div key={step.label} className="rounded border border-slate-800 bg-slate-950/60 px-2 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[10px] font-medium text-slate-200">{step.label}</span>
                          <StatusBadge status={step.status} subtle />
                        </div>
                        <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{step.detail}</div>
                      </div>
                    )) : <EmptyBlock text="等待工具计划" />}
                  </div>
                </div>
              </div>
            </div>
          )}
          {(commandWorker.status || commandDraft.task) && (
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">Worker 派发预览</span>
                    {commandWorker.at > 0 && <span className="text-[10px] text-slate-500">{formatTime(commandWorker.at)}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
                    仅允许 `worker_run` 的 `bridge_action / context_pack`，用于后台复核上下文包、Skills 路由和工具边界；批准时生成一次性 Worker id。
                  </p>
                </div>
                <StatusBadge status={commandWorker.status || "draft"} />
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                  <div className="mb-2 text-xs font-medium text-slate-200">派发请求草案</div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-400">
                    {JSON.stringify(commandWorker.request || (commandDraft.task ? buildCommandWorkerPayload(commandDraft.task) : null), null, 2)}
                  </pre>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                  <div className="text-xs font-medium text-slate-200">审批状态</div>
                  <div className="mt-2 grid gap-2">
                    <div className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-2">
                      <span className="text-[10px] text-slate-400">动作</span>
                      <span className="font-mono text-[10px] text-cyan-200">worker_run</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-2">
                      <span className="text-[10px] text-slate-400">Worker</span>
                      <span className="truncate font-mono text-[10px] text-cyan-200">{commandWorker.jobId || asString((commandWorker.request || buildCommandWorkerPayload(commandDraft.task)).job_id, "待生成")}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-2">
                      <span className="text-[10px] text-slate-400">权限</span>
                      <span className="text-[10px] text-emerald-300">只读 / allowlist</span>
                    </div>
                  </div>
                  {commandWorker.detail && <div className="mt-2 line-clamp-3 text-[10px] leading-relaxed text-slate-500">{commandWorker.detail}</div>}
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-emerald-500/15 bg-slate-900/70 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">计划审批</div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">
                      接受 / 拒绝 / 修改只作用于当前计划；合并草案只写入 Gateway proposal，不直接改目标文件。
                    </p>
                  </div>
                  <StatusBadge status={commandApproval.status || "pending"} />
                </div>
                <textarea
                  value={commandPlanFeedback}
                  onChange={(event) => setCommandPlanFeedback(event.target.value)}
                  rows={2}
                  className="mt-3 min-h-[56px] w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs leading-relaxed text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-emerald-500/50"
                  placeholder="修改意见，例如：先补 Provider 设置中心，再生成执行草案"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton label="接受计划" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => recordCommandApprovalDecision("accepted")} disabled={!commandDraft.task || commandApproval.status === "running"} />
                  <ActionButton label="拒绝计划" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => recordCommandApprovalDecision("rejected")} disabled={!commandDraft.task || commandApproval.status === "running"} />
                  <ActionButton label="修改计划" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => recordCommandApprovalDecision("modified")} disabled={!commandDraft.task || commandApproval.status === "running"} />
                  <ActionButton label="生成合并草案" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => void runCommandMergeProposal()} disabled={!state.online || !commandWorker.jobId || !["completed", "ok"].includes(commandWorker.status) || commandApproval.status === "running"} />
                </div>
                {(commandApproval.detail || commandApproval.planItems.length > 0 || commandApproval.proposal) && (
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3">
                      <div className="mb-2 text-xs font-medium text-slate-200">审批步骤</div>
                      <div className="grid gap-2">
                        {(commandApproval.planItems.length ? commandApproval.planItems : buildCommandApprovalPlan()).map((step) => (
                          <div key={step.label} className="rounded border border-slate-800 bg-slate-900/70 px-2 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[10px] font-medium text-slate-200">{step.label}</span>
                              <StatusBadge status={step.status} subtle />
                            </div>
                            <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{step.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3">
                      <div className="text-xs font-medium text-slate-200">审批结果</div>
                      {commandApproval.detail && <div className="mt-2 text-[10px] leading-relaxed text-cyan-200">{commandApproval.detail}</div>}
                      <PathLine value={asString(commandApproval.proposal?.proposal_path)} />
                      {!!asString(commandApproval.proposal?.diff_preview) && (
                        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-500">
                          {asString(commandApproval.proposal?.diff_preview)}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
                {commandDiffHunks.length > 0 && (
                  <div className="mt-3 rounded-lg border border-cyan-500/15 bg-slate-950/60 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white">Diff 改动块审查</div>
                        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">
                          只把已接受的改动块送进 `write_file` 审批草案；待定和拒绝的部分不会进入写入请求。
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200">接受 {acceptedCommandHunkCount}</span>
                        <span className="rounded bg-red-500/10 px-2 py-1 text-[10px] text-red-200">拒绝 {rejectedCommandHunkCount}</span>
                        <span className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">总计 {commandDiffHunks.length}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton label="接受全部改动块" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setAllCommandDiffHunks("accepted")} disabled={commandApproval.status === "running"} />
                      <ActionButton label="拒绝全部改动块" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setAllCommandDiffHunks("rejected")} disabled={commandApproval.status === "running"} />
                      <ActionButton label="生成 write_file 审批" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => void runCommandWriteApproval()} disabled={!state.online || !acceptedCommandHunkCount || commandApproval.status === "running"} />
                    </div>
                    <div className="mt-3 grid gap-2">
                      {commandDiffHunks.map((hunk, index) => (
                        <div key={hunk.id} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[10px] font-semibold text-slate-200">改动块 {index + 1} · {hunk.title}</div>
                              <div className="mt-1 text-[10px] text-slate-500">{commandHunkWriteContent(hunk).length} 字符将进入审批内容</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge status={hunk.status} subtle />
                              <button
                                type="button"
                                onClick={() => setCommandDiffHunkStatus(hunk.id, "accepted")}
                                disabled={hunk.status === "accepted" || commandApproval.status === "running"}
                                className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 transition-colors hover:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                接受改动块
                              </button>
                              <button
                                type="button"
                                onClick={() => setCommandDiffHunkStatus(hunk.id, "rejected")}
                                disabled={hunk.status === "rejected" || commandApproval.status === "running"}
                                className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-200 transition-colors hover:border-red-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                拒绝改动块
                              </button>
                            </div>
                          </div>
                          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-500">
                            {hunk.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                    {(commandApproval.writeRequest || commandApproval.writeResult) && (
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {commandApproval.writeRequest && (
                          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                            <div className="mb-2 text-xs font-medium text-slate-200">write_file 请求草案</div>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-500">
                              {JSON.stringify(commandApproval.writeRequest, null, 2)}
                            </pre>
                          </div>
                        )}
                        {commandApproval.writeResult && (
                          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                            <div className="mb-2 text-xs font-medium text-slate-200">write_file 审批结果</div>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-500">
                              {JSON.stringify(commandApproval.writeResult, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mt-3 grid gap-2">
            {commandCenterRows.map((command) => (
              <button
                key={command.id}
                onClick={() => selectWorkbenchView(command.target)}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-left transition-colors hover:border-cyan-500/30 hover:bg-slate-800"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-white">{command.label}</span>
                    <span className="font-mono text-[10px] text-cyan-300">{command.command}</span>
                  </div>
                  <div className="mt-1 truncate text-[10px] text-slate-500">{command.detail}</div>
                </div>
                <StatusBadge status={command.status} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <aside className="space-y-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <SectionTitle icon={<Database className="h-4 w-4 text-cyan-300" />} title="上下文检查器" meta={currentViewItem.label} />
          <div className="mt-3 grid gap-2">
            <MiniStat label="工作区" value={activeWorkspace?.title || "未选择"} />
            <MiniStat label="Gateway" value={state.online ? "在线" : "离线"} tone={state.online ? "text-emerald-300" : "text-amber-300"} />
            <MiniStat label="记忆" value={`L1 ${asNumber(memory.l1_count)} / L2 ${asNumber(memory.l2_count)}`} />
            <MiniStat label="Provider" value={apiReady ? effectiveProvider : "待配置"} tone={apiReady ? "text-emerald-300" : "text-amber-300"} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <SectionTitle icon={<ListChecks className="h-4 w-4 text-lime-300" />} title="运行轨迹" meta="4 步" />
          <div className="mt-3 grid gap-2">
            {agentTraceRows.map((row, index) => (
              <div key={row.label} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 font-mono text-[10px] text-cyan-200">{index + 1}</span>
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-medium text-slate-200">{row.label}</div>
                  <div className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{row.detail}</div>
                </div>
                <StatusBadge status={row.status} subtle />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />} title="审批闸门" meta="执行前" />
          <div className="mt-3 grid gap-2">
            {approvalGateRows.map((row) => (
              <div key={row.label} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-slate-300">{row.label}</span>
                  <StatusBadge status={row.status} subtle />
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{row.detail}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <SectionTitle icon={<FileText className="h-4 w-4 text-amber-300" />} title="证据" meta="只读" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {evidenceRows.map((row) => (
              <div key={row.label} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                <div className="truncate text-[10px] text-slate-500">{row.label}</div>
                <div className={`mt-0.5 truncate text-xs font-semibold ${row.tone}`}>{row.value}</div>
              </div>
            ))}
          </div>
          <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-400">{terminalPreview}</pre>
        </div>
      </aside>
    </div>
  );

  const renderWorkspacesView = () => (
    <>
      {renderSystemMetrics()}
      {renderWorkbenchHeader({
        icon: <Library className="h-4 w-4" />,
        eyebrow: "工作区管理器",
        title: "多工作区控制",
        description: "每个工作区都应拥有独立上下文、领域 Agent、记忆切片、工具权限和产物边界。这里先把历史项目挂载成 LumenOS 工作区。",
        status: `${allWorkspaceSummaries.length} 个工作区`,
        actions: <ActionButton label="新建工作区" icon={<Plus className="h-3.5 w-3.5" />} onClick={onCreateBook} />,
      })}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<FolderKanban className="h-4 w-4 text-blue-300" />} title="工作区资源管理器" meta={`${allWorkspaceSummaries.length} 已挂载`} />
          <div className="grid gap-2 md:grid-cols-2">
            {allWorkspaceSummaries.map((item) => (
              <button
                key={item.book.id}
                onClick={() => onOpenBook(item.book.id)}
                className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                  item.book.id === activeWorkspace?.book.id
                    ? "border-cyan-500/30 bg-cyan-500/10"
                    : "border-slate-800 bg-slate-950/40 hover:bg-slate-800/70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-cyan-200">{item.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{item.title}</div>
                    <div className="mt-1 truncate text-[10px] text-cyan-200">{item.domain}</div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.description}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label="文件" value={`${item.files}`} />
                  <MiniStat label="字数" value={formatNumber(item.words)} />
                  <MiniStat label="分组" value={`${item.categoryCount}`} />
                </div>
              </button>
            ))}
            {!allWorkspaceSummaries.length && <EmptyBlock text="还没有工作区" />}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<Database className="h-4 w-4 text-pink-300" />} title="工作区上下文" meta={activeWorkspace?.domain} />
          {activeWorkspace ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
                <div className="truncate text-sm font-semibold text-white">{activeWorkspace.title}</div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-400">{activeWorkspace.description}</p>
              </div>
              <ActionButton label="打开工作区" icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => onOpenBook(activeWorkspace.book.id)} />
            </div>
          ) : <EmptyBlock text="选择或创建工作区" />}
        </div>
      </div>
    </>
  );

  const renderMemoryManagerPanels = () => {
    const selectedRecord = selectedMemoryRow?.record || {};
    const selectedEvidence = asArray(selectedRecord.evidence).map((item) => String(item)).filter(Boolean);
    const selectedTags = selectedMemoryRow?.tags || [];
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="L1 事件" value={formatNumber(asNumber(memory.l1_count))} />
          <MiniStat label="L2 摘要" value={formatNumber(asNumber(memory.l2_count))} tone="text-pink-300" />
          <MiniStat label="待处理" value={formatNumber(asNumber(memory.pending_count))} tone={asNumber(memory.pending_count) ? "text-amber-300" : "text-emerald-300"} />
          <MiniStat label="当前筛选" value={`${filteredMemoryRows.length}`} />
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative block min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
              <input
                value={memorySearch}
                onChange={(event) => setMemorySearch(event.target.value)}
                className="h-9 w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 text-xs text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500/50"
                placeholder="搜索摘要、证据、标签、来源"
              />
            </label>
            <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-1">
              {(["all", "L1", "L2"] as MemoryKindFilter[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setMemoryKindFilter(kind)}
                  className={`h-7 rounded-md px-3 text-xs transition-colors ${
                    memoryKindFilter === kind ? "bg-cyan-500/15 text-cyan-200" : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                  }`}
                >
                  {kind === "all" ? "全部" : kind}
                </button>
              ))}
            </div>
            <select
              value={memoryDimensionFilter}
              onChange={(event) => setMemoryDimensionFilter(event.target.value)}
              className="h-9 rounded-lg border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
            >
              <option value="all">全部维度</option>
              {memoryDimensionOptions.map((dimension) => (
                <option key={dimension} value={dimension}>{dimension}</option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-[10px] leading-relaxed text-slate-500">
            记忆管理动作默认进入审批队列；`memory_update` / `memory_freeze` / `memory_delete` 不会直接修改 L1/L2。
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<Database className="h-4 w-4 text-pink-300" />} title="六维索引" meta={`${dimensionRows.length}`} />
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setMemoryDimensionFilter("all")}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  memoryDimensionFilter === "all" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-300 hover:bg-slate-800"
                }`}
              >
                全部维度
              </button>
              {dimensionRows.map(({ key, record }) => {
                const active = memoryDimensionFilter === key;
                const l1 = asNumber(record.l1);
                const l2 = asNumber(record.l2);
                const pending = asNumber(record.pending);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMemoryDimensionFilter(key)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      active ? "border-pink-500/30 bg-pink-500/10" : "border-slate-800 bg-slate-950/40 hover:bg-slate-800"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-slate-200">{asString(record.label, key)}</span>
                      <span className="shrink-0 text-slate-500">L2 {l2}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-pink-400" style={{ width: `${Math.min(100, l2 || l1 || 4)}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                      <span>L1 {l1}</span>
                      <span>待处理 {pending}</span>
                    </div>
                  </button>
                );
              })}
              {!dimensionRows.length && <EmptyBlock text="等待 AutoDream 维度索引" />}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<Clock className="h-4 w-4 text-cyan-300" />} title="记忆列表" meta={`${filteredMemoryRows.length} / ${memoryRows.length}`} />
            <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
              {filteredMemoryRows.length ? filteredMemoryRows.map((row) => (
                <MemoryListRow
                  key={row.id}
                  row={row}
                  selected={selectedMemoryRow?.id === row.id}
                  onSelect={() => setSelectedMemoryId(row.id)}
                />
              )) : <EmptyBlock text="没有匹配的记忆记录" />}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />} title="记忆检查器" meta={selectedMemoryRow?.kind || "未选择"} />
            {selectedMemoryRow ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white">{asString(selectedRecord.id, selectedMemoryRow.id)}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                        <span>{selectedMemoryRow.kind}</span>
                        <span>{selectedMemoryRow.dimension}</span>
                        <span>{selectedMemoryRow.source}</span>
                        <span>{formatDateTime(selectedMemoryRow.at)}</span>
                      </div>
                    </div>
                    <StatusBadge status={selectedMemoryRow.kind === "L2" ? "completed" : "pending"} subtle />
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">{selectedMemoryRow.summary}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <MiniStat label="重要度" value={displayValue(selectedRecord.importance, "n/a")} tone="text-amber-300" />
                    <MiniStat label="置信度" value={displayValue(selectedRecord.confidence, "n/a")} tone="text-emerald-300" />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
                  <div className="mb-2 text-xs font-medium text-slate-200">标签与证据</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTags.length ? selectedTags.map((tag) => <span key={tag} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{tag}</span>) : <span className="text-[10px] text-slate-600">暂无标签</span>}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {selectedEvidence.length ? selectedEvidence.slice(0, 5).map((item, index) => (
                      <div key={`${item}-${index}`} className="rounded border border-slate-800 bg-slate-900/70 px-2 py-2 text-[10px] leading-relaxed text-slate-500">{item}</div>
                    )) : <div className="rounded border border-dashed border-slate-800 bg-slate-900/50 px-2 py-3 text-center text-[10px] text-slate-600">暂无证据链</div>}
                  </div>
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3">
                  <div className="text-xs font-semibold text-amber-200">安全操作草案</div>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    编辑 / 冻结 / 删除都会先生成 Gateway 审批草案；提交后进入 approvals，不直接修改 L1/L2 记忆。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton label="冻结草案" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => createMemoryDraftAction("freeze", selectedMemoryRow)} />
                    <ActionButton label="删除草案" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => createMemoryDraftAction("delete", selectedMemoryRow)} />
                    <ActionButton label="编辑草案" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => createMemoryDraftAction("update", selectedMemoryRow)} />
                    <ActionButton
                      label="提交审批"
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      onClick={() => void submitMemoryManagementDraft()}
                      disabled={!state.online || !memoryDraftAction || memoryDraftAction.status === "running"}
                    />
                  </div>
                </div>

                {memoryDraftAction && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-white">{memoryDraftAction.title}</div>
                        <div className="mt-1 text-[10px] text-slate-500">{formatTime(memoryDraftAction.at)} · {memoryDraftAction.memoryKind}</div>
                      </div>
                      <StatusBadge status={memoryDraftAction.status} />
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{memoryDraftAction.detail}</p>
                    {memoryDraftAction.request && (
                      <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-slate-400">
                        {JSON.stringify(memoryDraftAction.request, null, 2)}
                      </pre>
                    )}
                    {memoryDraftAction.result && (
                      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-[10px] leading-relaxed text-emerald-300">
                        {JSON.stringify(memoryDraftAction.result, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ) : <EmptyBlock text="选择一条记忆后查看详情" />}
          </div>
        </div>
      </div>
    );
  };

  const renderMemoryView = () => (
    <>
      {renderSystemMetrics()}
      {renderWorkbenchHeader({
        icon: <Brain className="h-4 w-4" />,
        eyebrow: "记忆 / 上下文系统",
        title: "记忆管理器",
        description: "把 L1/L2 摘要、证据链、维度索引和管理审批草案放进同一个审查台；上下文包由这里召回，而不是每次全量塞给模型。",
        status: `${dimensionRows.length} 个维度`,
        actions: (
          <>
            <ActionButton label="压缩记忆" icon={<Brain className="h-3.5 w-3.5" />} onClick={() => void runQuickAction("压缩记忆", "memory_consolidate", {})} disabled={!state.online || quickAction.status === "running"} />
            <ActionButton label="召回记忆" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => void runQuickAction("记忆召回", "memory_retrieve", { task: "继续灵枢 LumenOS / Writing Agent 开发", limit: 8 })} disabled={!state.online || quickAction.status === "running"} />
          </>
        ),
      })}
      {renderMemoryManagerPanels()}
    </>
  );

  const renderSkillsView = () => (
    <>
      {renderSystemMetrics()}
      {renderWorkbenchHeader({
        icon: <Sparkles className="h-4 w-4" />,
        eyebrow: "Skills / 领域 Agent",
        title: "Skills 路由器",
        description: "Skills 是灵枢的能力层：按任务域挂载、隔离工具、预览输入输出，并在显式 gate 下运行已激活能力。",
        status: `${prompts.length + customPrompts.length} 个 Skills`,
        actions: (
          <>
            <ActionButton label="Skills 地图" icon={<FolderKanban className="h-3.5 w-3.5" />} onClick={() => onOpenOverview?.()} disabled={!onOpenOverview} />
            <ActionButton label="匹配写作 Agent" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void runQuickAction("匹配写作 Agent", "skill_route", { task: "继续灵枢 LumenOS 与 Writing Agent 开发", domain: "writing", local_limit: 10 })} disabled={!state.online || quickAction.status === "running"} />
          </>
        ),
      })}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="候选" value={formatNumber(asNumber(skillPayload.candidate_count))} />
        <MiniStat label="已激活" value={formatNumber(asNumber(skillPayload.activated_count))} tone="text-emerald-300" />
        <MiniStat label="本地检索" value={formatNumber(asNumber(skillPayload.local_skill_count, skillLocalSkills.length))} />
        <MiniStat label="根目录" value={`${skillLocalRoots.length}`} />
        <MiniStat label="脚本闸门" value={statusLabel(asString(capabilities.skill_script_execution, "disabled"))} tone="text-amber-300" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<Sparkles className="h-4 w-4 text-fuchsia-300" />} title="最近候选" meta={`${skillRecentCandidates.length}`} />
          <div className="grid max-h-[420px] gap-2 overflow-auto pr-1">
            {skillRecentCandidates.length ? skillRecentCandidates.slice(0, 8).map((item) => <SkillRow key={asString(item.id, asString(item.title))} item={item} />) : <EmptyBlock text="暂无 Skill 候选" />}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} title="已激活 Skills" meta={`${skillRecentActivated.length}`} />
          <div className="grid max-h-[420px] gap-2 overflow-auto pr-1">
            {skillRecentActivated.length ? skillRecentActivated.slice(0, 8).map((item) => <SkillRow key={asString(item.id, asString(item.title))} item={item} />) : <EmptyBlock text="暂无已激活 Skill" />}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<HardDrive className="h-4 w-4 text-blue-300" />} title="本地 Skill 根目录" meta={`${skillLocalRoots.length}`} />
          <div className="grid gap-2">
            {skillLocalRoots.map((root) => (
              <div key={asString(root.key, asString(root.path))} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-slate-300">{asString(root.label, asString(root.key, "根目录"))}</span>
                  <span className={asBoolean(root.exists) ? "text-[10px] text-emerald-300" : "text-[10px] text-red-300"}>{asNumber(root.skill_count)} 个 Skills</span>
                </div>
                <PathLine value={asString(root.path)} />
              </div>
            ))}
            {!skillLocalRoots.length && <EmptyBlock text="等待本地 Skill 根目录" />}
          </div>
        </div>
      </div>
    </>
  );

  const renderToolsView = () => (
    <>
      {renderSystemMetrics()}
      {renderWorkbenchHeader({
        icon: <Wrench className="h-4 w-4" />,
        eyebrow: "工具调用 / 安全矩阵",
        title: "受控工具运行时",
        description: "工具层不让模型自由调用系统，而是通过 Gateway 权限档案、请求闸门、审批草案和可审查 Worker 输出运行。",
        status: `${enabledTools.length} 已启用`,
      })}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<Wrench className="h-4 w-4 text-cyan-300" />} title="工具矩阵" meta={`${matrix.length} 个动作`} />
          <div className="grid gap-2 md:grid-cols-2">
            {matrix.map((tool) => (
              <div key={`${tool.action}-${tool.label}`} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-slate-200">{tool.label}</div>
                    <div className="mt-1 truncate text-[10px] text-slate-500">{tool.action}</div>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-[10px] ${tool.enabled ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                    {tool.enabled ? "已开" : statusLabel(tool.mode || "gated")}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                  <span className="truncate">闸门: {tool.requestGate || "n/a"}</span>
                  <span className="truncate">范围: {tool.scope || "n/a"}</span>
                </div>
              </div>
            ))}
            {!matrix.length && <EmptyBlock text="等待工具矩阵" />}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />} title="安全闸门" meta={`${safetyLayers.length}`} />
          <div className="grid gap-2">
            {safetyLayers.map((layer) => (
              <div key={asString(layer.key, asString(layer.message))} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-slate-300">{asString(layer.key, "gate")}</span>
                  <StatusBadge status={asString(layer.severity, "unknown")} subtle />
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] text-slate-500">{asString(layer.message)}</div>
              </div>
            ))}
            {!safetyLayers.length && <EmptyBlock text="等待安全闸门" />}
          </div>
        </div>
      </div>
    </>
  );

  const renderProvidersView = () => (
    <>
      {renderSystemMetrics()}
      {renderWorkbenchHeader({
        icon: <Server className="h-4 w-4" />,
        eyebrow: "模型 Provider 中枢",
        title: "模型运行时 / API Gateway",
        description: "这里是灵枢的模型运行时中枢：当前 API 配置、配置档案、本地/远程闸门、Provider 目录、探针草案和模型 Worker 载荷都在同一处审查。",
        status: apiReady ? "runtime-ready" : "setup-needed",
        actions: (
          <>
            <ActionButton label="API 设置" icon={<Settings className="h-3.5 w-3.5" />} onClick={onOpenSettings} />
            <ActionButton label="状态检查" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => void runProviderAction("模型 Provider 状态", "provider_status", providerPayload)} disabled={!state.online || quickAction.status === "running" || !settings.apiUrl.trim()} />
            <ActionButton label="探针草案" icon={<Network className="h-3.5 w-3.5" />} onClick={() => void runProviderAction("模型探针草案", "provider_probe", providerPayload)} disabled={!state.online || quickAction.status === "running" || !settings.apiUrl.trim()} />
            <ActionButton label="刷新目录" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void runProviderAction("刷新模型目录", "provider_catalog", { limit: 20 })} disabled={!state.online || quickAction.status === "running"} />
          </>
        ),
      })}
      {!providerReady && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-xs text-amber-200">
          Gateway Provider 目录暂未返回，当前页面使用前端预设库兜底{providerMessage ? `：${providerMessage}` : ""}。
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="运行时" value={apiReady ? "就绪" : "待配置"} tone={apiReady ? "text-emerald-300" : "text-amber-300"} />
        <MiniStat label="模型 Provider" value={PROVIDER_LABELS[effectiveProvider].split(" ")[0] || effectiveProvider} />
        <MiniStat label="端点" value={endpointLocal ? "本地" : settings.apiUrl ? "远程" : "未配置"} tone={endpointLocal ? "text-emerald-300" : settings.apiUrl ? "text-blue-300" : "text-amber-300"} />
        <MiniStat label="预设" value={formatNumber(totalProviderPresetCount)} />
        <MiniStat label="配置档案" value={`${settingsProfiles.length}`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<Server className="h-4 w-4 text-blue-300" />} title="当前运行时配置" meta={apiReady ? "就绪" : "需配置"} />
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">当前 Provider</div>
                    <div className="mt-1 truncate text-base font-semibold text-white">{effectiveProviderLabel}</div>
                    <div className="mt-1 truncate font-mono text-[10px] text-slate-500" title={settings.apiUrl}>{endpointLabel}</div>
                  </div>
                  <StatusBadge status={endpointLocal ? "local" : settings.apiUrl ? "remote" : "unconfigured"} />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MiniStat label="模型 ID" value={settings.modelId || "未设置"} tone={settings.modelId ? "text-white" : "text-amber-300"} />
                  <MiniStat label="显示名" value={settings.modelName || "未设置"} />
                  <MiniStat label="Temperature" value={`${settings.temperature ?? 0.85}`} />
                  <MiniStat label="Max tokens" value={settings.maxTokens ? `${settings.maxTokens}` : "Provider 默认"} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />} title="凭据状态" />
                <div className="grid gap-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">API key</span>
                    <span className={settings.apiKey ? "text-emerald-300" : keyOptional ? "text-slate-400" : "text-amber-300"}>{settings.apiKey ? "已填写" : keyOptional ? "可选" : "必填"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">环境变量兜底</span>
                    <span className="font-mono text-[10px] text-slate-300">{modelKeyEnv(effectiveProvider) || "无"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">当前档案</span>
                    <span className="max-w-[180px] truncate text-slate-300">{activeProfile?.name || "直接设置"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">协议格式</span>
                    <span className="text-slate-300">{effectiveProvider}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />} title="Provider 闸门" meta="探针 / Worker" />
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-200">状态检查</span>
                  <StatusBadge status="read-only" subtle />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">调用 `provider_status`，只检查配置、密钥需求和 model worker payload，不访问模型端点。</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-200">探针草案</span>
                  <StatusBadge status="approval_required" subtle />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">`provider_probe` 默认无 execute，只返回审批草案；远程端点还需要 `allow_remote_model=true`。</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-200">模型 Worker</span>
                  <StatusBadge status="gated" subtle />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">模型 worker 需要 `execute_model=true`；远程模型继续要求 `allow_remote_model=true`。</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<ListChecks className="h-4 w-4 text-lime-300" />} title="Provider 结果检查器" meta={providerAction.at ? formatTime(providerAction.at) : "未运行"} />
            {providerAction.label ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{providerAction.label}</div>
                      <div className="mt-1 truncate text-[10px] text-slate-500">{providerAction.action} · {providerAction.detail}</div>
                    </div>
                    <StatusBadge status={providerAction.status} />
                  </div>
                </div>
                {Object.keys(providerActionReadiness).length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {["local_endpoint", "remote_endpoint", "key_required", "key_available", "one_shot_key_present", "env_key_present", "remote_requires_allow_remote_model"].map((key) => (
                      <MiniStat
                        key={key}
                        label={key}
                        value={displayValue(providerActionReadiness[key])}
                        tone={providerActionReadiness[key] === false && key.includes("available") ? "text-amber-300" : "text-white"}
                      />
                    ))}
                  </div>
                )}
                {Object.keys(providerActionEnv).length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {Object.entries(providerActionEnv).map(([key, value]) => (
                      <MiniStat key={key} label={key} value={displayValue(value)} tone={value ? "text-emerald-300" : "text-slate-300"} />
                    ))}
                  </div>
                )}
                {Object.keys(providerActionConfig).length > 0 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                    <SectionTitle icon={<Server className="h-4 w-4 text-blue-300" />} title="解析后的配置" meta={asString(providerActionConfig.provider, "provider")} />
                    <div className="grid gap-2 text-[10px] md:grid-cols-2">
                      {[
                        ["label", providerActionConfig.label],
                        ["provider", providerActionConfig.provider],
                        ["api_url", providerActionConfig.api_url],
                        ["model_id", providerActionConfig.model_id],
                        ["key_optional", providerActionConfig.key_optional],
                        ["local", providerActionConfig.local],
                      ].map(([key, value]) => (
                        <div key={String(key)} className="grid grid-cols-[90px_minmax(0,1fr)] gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                          <span className="text-slate-500">{String(key)}</span>
                          <span className="truncate font-mono text-slate-300" title={displayValue(value)}>{displayValue(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Object.keys(providerActionWorkerPayload).length > 0 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                    <SectionTitle icon={<Cpu className="h-4 w-4 text-fuchsia-300" />} title="Gateway 模型 Worker 载荷" meta="受控" />
                    <div className="grid gap-2 text-[10px] md:grid-cols-2">
                      {Object.entries(providerActionWorkerPayload).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                          <span className="text-slate-500">{key}</span>
                          <span className="truncate font-mono text-slate-300" title={displayValue(value)}>{displayValue(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Object.keys(providerActionPolicy).length > 0 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                    <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />} title="注册表策略" meta="只读" />
                    <div className="grid gap-2 text-[10px]">
                      {["probe_requires", "timeout_seconds_max", "preset_count"].map((key) => (
                        <div key={key} className="grid grid-cols-[140px_minmax(0,1fr)] gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                          <span className="text-slate-500">{key}</span>
                          <span className="truncate font-mono text-slate-300" title={displayValue(providerActionPolicy[key])}>{displayValue(providerActionPolicy[key])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {providerAction.data && (
                  <details className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-300">Gateway 原始结果</summary>
                    <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-400">
                      {JSON.stringify(providerAction.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <EmptyBlock text="运行状态检查或探针草案后，这里会展示 Gateway 结果。" />
            )}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<Server className="h-4 w-4 text-blue-300" />} title="前端预设库" meta={`${frontendRemoteCount} 远程 / ${frontendLocalCount} 本地`} />
            <div className="grid max-h-[500px] gap-2 overflow-auto pr-1 md:grid-cols-2">
              {displayProviderPresets.length ? displayProviderPresets.map((preset) => <ProviderRow key={asString(preset.id, asString(preset.label))} item={preset} />) : <EmptyBlock text="等待 Provider 预设" />}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<Network className="h-4 w-4 text-cyan-300" />} title="Gateway 目录分组" meta={`${providerRows.length || Object.keys(PROVIDER_LABELS).length} 个 Provider`} />
            <div className="grid gap-2">
              {displayProviderGroups.map((group) => (
                <div key={group.id || group.label} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs text-slate-300">{group.label}</span>
                    <span className="text-[10px] text-slate-500">{group.count}</span>
                  </div>
                </div>
              ))}
            </div>
            {providerRows.length > 0 && (
              <div className="mt-3 grid gap-2">
                {providerRows.slice(0, 6).map((provider) => (
                  <div key={asString(provider.id, asString(provider.label))} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <span className="truncate text-xs text-slate-300">{asString(provider.label, asString(provider.id))}</span>
                    <span className="text-[10px] text-slate-500">{asNumber(provider.count)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<ListChecks className="h-4 w-4 text-lime-300" />} title="已保存配置档案" meta={`${settingsProfiles.length}`} />
            <div className="grid max-h-[300px] gap-2 overflow-auto pr-1">
              {settingsProfiles.length ? settingsProfiles.map((profile) => {
                const profileProvider = profile.provider || inferProvider(profile.apiUrl);
                return (
                  <div key={profile.id} className={`rounded-lg border px-3 py-3 ${profile.id === settings.activeProfileId ? "border-cyan-500/30 bg-cyan-500/10" : "border-slate-800 bg-slate-950/40"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-slate-100">{profile.name}</div>
                        <div className="mt-1 truncate text-[10px] text-slate-500">{profile.modelId || "模型未设置"} · {PROVIDER_LABELS[profileProvider]}</div>
                        <PathLine value={profile.apiUrl} />
                      </div>
                      <StatusBadge status={profile.id === settings.activeProfileId ? "active" : "saved"} subtle />
                    </div>
                  </div>
                );
              }) : <EmptyBlock text="还没有保存的模型配置档案" />}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<Cpu className="h-4 w-4 text-fuchsia-300" />} title="模型 Worker 载荷" meta="草案" />
            <div className="grid gap-2 text-[10px]">
              {[
                ["kind", "model_task"],
                ["provider", effectiveProvider],
                ["api_url", endpointLabel],
                ["model_id", settings.modelId || "未设置"],
                ["execute_model", "false"],
                ["allow_remote_model", "false"],
              ].map(([key, value]) => (
                <div key={key} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="text-slate-500">{key}</span>
                  <span className="truncate font-mono text-slate-300" title={value}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const renderWorkersView = () => (
    <>
      {renderSystemMetrics()}
      {renderWorkbenchHeader({
        icon: <Cpu className="h-4 w-4" />,
        eyebrow: "Worker 后台任务中心",
        title: "异步任务 / 合并草案",
        description: "Worker 负责受控模型任务、验证命令、bridge action 和可取消后台任务；产物默认进入合并草案，不直接改写用户文件。",
        status: `${workerCount} 个任务`,
      })}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="任务数" value={formatNumber(asNumber(workerPayload.job_count, workerCount))} />
        <MiniStat label="最近任务" value={`${workerRecentJobs.length}`} />
        <MiniStat label="硬取消" value={`${hardCancelableJobs}`} tone={hardCancelableJobs ? "text-emerald-300" : "text-slate-300"} />
        <MiniStat label="合并草案" value={`${workerMergeProposals.length}`} />
        <MiniStat label="事件流" value={`${workerRecentEvents.length}`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<Cpu className="h-4 w-4 text-cyan-300" />} title="最近 Worker" meta={`${workerRecentJobs.length}`} />
          <div className="grid max-h-[520px] gap-2 overflow-auto pr-1">
            {workerRecentJobs.length ? workerRecentJobs.slice(0, 10).map((job) => <WorkerRow key={asString(job.id, asString(job.created_at))} item={job} />) : <EmptyBlock text="暂无 Worker 任务" />}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<FileText className="h-4 w-4 text-amber-300" />} title="合并草案" meta={`${workerMergeProposals.length}`} />
          <div className="grid gap-2">
            {workerMergeProposals.length ? workerMergeProposals.slice(0, 6).map((proposal) => (
              <div key={asString(proposal.id, asString(proposal.proposal_path))} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-slate-300">{asString(proposal.job_id, asString(proposal.id, "proposal"))}</span>
                  <StatusBadge status={asString(proposal.status, "draft")} subtle />
                </div>
                <PathLine value={asString(proposal.proposal_path)} />
              </div>
            )) : <EmptyBlock text="暂无 Worker 合并草案" />}
          </div>
        </div>
      </div>
    </>
  );

  const renderAutomationView = () => (
    <>
      {renderSystemMetrics()}
      {renderWorkbenchHeader({
        icon: <Timer className="h-4 w-4" />,
        eyebrow: "规格 / Steering / Hooks",
        title: "Spec-driven Agent 控制面",
        description: "把 Kiro 的 Specs / Steering / Hooks 与 Claude Code 的 Skills、Subagents、MCP 权限合到同一个审查面：先需求、再设计、再任务，所有外部动作仍走 Gateway 审批。",
        status: phaseStatus,
        actions: (
          <>
            <ActionButton label="生成协议草案" icon={<FileText className="h-3.5 w-3.5" />} onClick={createSpecProtocolDraft} />
            <ActionButton label="提交写入审批" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => void submitSpecProtocolApprovals()} disabled={!state.online || specProtocolDraft.status === "running"} />
            <ActionButton label="KAIROS Tick" icon={<Timer className="h-3.5 w-3.5" />} onClick={() => void runQuickAction("KAIROS Tick", "kairos_tick", { include_suggestions: true, limit: 5 })} disabled={!state.online || quickAction.status === "running"} />
            <ActionButton label="计划任务草案" icon={<ListChecks className="h-3.5 w-3.5" />} onClick={() => void runQuickAction("计划任务草案", "scheduler_plan", { mode: "draft" })} disabled={!state.online || quickAction.status === "running"} />
          </>
        ),
      })}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<ListChecks className="h-4 w-4 text-lime-300" />} title="Specs 工作流" meta="需求 / 设计 / 任务 / 复核" />
          <div className="mt-3 grid gap-3">
            {specWorkflowRows.map((row, index) => (
              <div key={row.phase} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-800 font-mono text-[10px] text-cyan-200">{index + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-xs font-semibold text-white">{row.label}</span>
                    <span className="font-mono text-[10px] text-slate-500">{row.phase}</span>
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{row.output}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{row.detail}</p>
                </div>
                <StatusBadge status={row.status} subtle />
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
              <SectionTitle icon={<Brain className="h-4 w-4 text-pink-300" />} title="Steering 规则" meta={`${steeringRows.length}`} />
              <div className="mt-3 grid gap-2">
                {steeringRows.map((row) => (
                  <div key={row.path} className="rounded border border-slate-800 bg-slate-900/70 px-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium text-slate-200">{row.label}</span>
                      <StatusBadge status={row.status} subtle />
                    </div>
                    <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{row.detail}</div>
                    <PathLine value={row.path} />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
              <SectionTitle icon={<Network className="h-4 w-4 text-blue-300" />} title="MCP 治理" meta="facade / allowlist" />
              <div className="mt-3 grid gap-2">
                {mcpGovernanceRows.map((row) => (
                  <div key={row.label} className="rounded border border-slate-800 bg-slate-900/70 px-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium text-slate-200">{row.label}</span>
                      <StatusBadge status={row.status} subtle />
                    </div>
                    <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{row.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-cyan-500/15 bg-slate-950/50 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <SectionTitle icon={<FileText className="h-4 w-4 text-cyan-300" />} title="项目协议草案" meta=".lumen/specs / steering / hooks" />
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  生成 Requirements、Design、Tasks、Steering 与 Hooks 草案；提交时逐个调用 `write_file`，默认只进入审批队列。
                </p>
              </div>
              <StatusBadge status={specProtocolDraft.status || "not_generated"} subtle />
            </div>
            <div className="mt-3 grid gap-2">
              {(specProtocolDraft.files.length ? specProtocolDraft.files : buildSpecProtocolFiles()).map((file) => (
                <div key={file.path} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded border border-slate-800 bg-slate-900/70 px-2 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[10px] font-medium text-slate-200">{file.title}</span>
                      <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[10px] text-cyan-200">{file.kind}</span>
                    </div>
                    <PathLine value={file.path} />
                  </div>
                  <span className="shrink-0 rounded bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-500">{formatNumber(file.content.length)} chars</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton label="生成协议草案" icon={<FileText className="h-3.5 w-3.5" />} onClick={createSpecProtocolDraft} />
              <ActionButton label="提交 write_file 审批" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => void submitSpecProtocolApprovals()} disabled={!state.online || specProtocolDraft.status === "running"} />
              <button
                type="button"
                onClick={() => setBottomPanelTab("approvals")}
                className="inline-flex h-8 items-center gap-2 rounded border border-slate-800 bg-slate-950 px-3 text-xs text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-slate-200"
              >
                打开审批复核台
              </button>
            </div>
            {specProtocolDraft.detail && (
              <div className="mt-3 rounded border border-slate-800 bg-slate-950 px-2 py-2 text-[10px] leading-relaxed text-cyan-100">
                {specProtocolDraft.detail}
              </div>
            )}
            {(specProtocolDraft.request || specProtocolDraft.result) && (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {specProtocolDraft.request && (
                  <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-2">
                    <div className="mb-2 text-[10px] font-medium text-slate-300">写入审批请求</div>
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-slate-500">
                      {JSON.stringify(specProtocolDraft.request, null, 2)}
                    </pre>
                  </div>
                )}
                {specProtocolDraft.result && (
                  <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-2">
                    <div className="mb-2 text-[10px] font-medium text-slate-300">审批返回</div>
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-slate-500">
                      {JSON.stringify(specProtocolDraft.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<Activity className="h-4 w-4 text-cyan-300" />} title="Agent Hooks" meta={`${hookPolicyRows.length} 个事件`} />
            <div className="mt-3 grid gap-2">
              {hookPolicyRows.map((row) => (
                <div key={row.event} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[10px] text-cyan-200">{row.event}</span>
                    <StatusBadge status={row.status} subtle />
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{row.detail}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
              Hooks 当前是策略视图和审计模型，不会在后台自动执行外部动作；真正执行仍需要对应 Gateway flag 与 payload gate。
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<GitBranch className="h-4 w-4 text-fuchsia-300" />} title="Subagents" meta="角色 / 工具边界" />
            <div className="mt-3 grid gap-2">
              {subagentRows.map((row) => (
                <div key={row.label} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-200">{row.label}</span>
                    <StatusBadge status={row.status} subtle />
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{row.detail}</div>
                  <div className="mt-1 truncate font-mono text-[10px] text-slate-600">{row.tools}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />} title="执行闸门" meta={`P${completionPartial} / M${completionMissing}`} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <MiniStat label="审批队列" value={`${approvalQueueCount}`} tone={approvalQueueCount ? "text-amber-300" : "text-emerald-300"} />
              <MiniStat label="Changes" value={`${commandDiffHunks.length || workerMergeProposals.length}`} tone={commandDiffHunks.length || workerMergeProposals.length ? "text-amber-300" : "text-slate-300"} />
              <MiniStat label="Gateway" value={state.online ? "在线" : "离线"} tone={state.online ? "text-emerald-300" : "text-amber-300"} />
              <MiniStat label="API" value={isConfigured(settings) ? "就绪" : "待配置"} tone={isConfigured(settings) ? "text-emerald-300" : "text-amber-300"} />
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const renderWritingView = () => (
    <>
      {renderSystemMetrics()}
      {renderWorkbenchHeader({
        icon: <BookOpen className="h-4 w-4" />,
        eyebrow: "领域 Agent / 写作",
        title: "写作 Agent 工作区",
        description: "写作 Agent 是灵枢 LumenOS 内的一个专业域，复用既有写作素材、蒸馏、Prompt 和 Skills，但不再定义整个产品外壳。",
        status: `${writingWorkspaces.length || allWorkspaceSummaries.length} 个写作空间`,
        actions: (
          <>
            <ActionButton label="写作蒸馏" icon={<Database className="h-3.5 w-3.5" />} onClick={onOpenDistillation} />
            <ActionButton label="匹配写作 Agent" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void runQuickAction("匹配写作 Agent", "skill_route", { task: "继续灵枢 LumenOS 与 Writing Agent 开发", domain: "writing", local_limit: 10 })} disabled={!state.online || quickAction.status === "running"} />
          </>
        ),
      })}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<Library className="h-4 w-4 text-blue-300" />} title="写作工作区" meta={`${writingWorkspaces.length || allWorkspaceSummaries.length}`} />
          <div className="grid gap-2 md:grid-cols-2">
            {(writingWorkspaces.length ? writingWorkspaces : allWorkspaceSummaries).map((item) => (
              <button key={item.book.id} onClick={() => onOpenBook(item.book.id)} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-left transition-colors hover:bg-slate-800/70">
                <div className="truncate text-sm font-semibold text-white">{item.title}</div>
                <div className="mt-1 truncate text-[10px] text-cyan-200">{item.domain}</div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.description}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label="文件" value={`${item.files}`} />
                  <MiniStat label="字数" value={formatNumber(item.words)} />
                  <MiniStat label="分组" value={`${item.categoryCount}`} />
                </div>
              </button>
            ))}
            {!allWorkspaceSummaries.length && <EmptyBlock text="还没有工作区" />}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <SectionTitle icon={<Sparkles className="h-4 w-4 text-fuchsia-300" />} title="已挂载写作 Skills" meta={`${customSkillCount} 自定义`} />
          <div className="grid gap-2">
            <MiniStat label="Prompt 库" value={`${prompts.length}`} />
            <MiniStat label="自定义 Skills" value={`${customSkillCount}`} />
            <MiniStat label="自动 Skills" value={`${autoSkillCount}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton label="打开 Skills 地图" icon={<FolderKanban className="h-3.5 w-3.5" />} onClick={() => onOpenOverview?.()} disabled={!onOpenOverview} />
            {activeWorkspace && <ActionButton label="打开工作区" icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => onOpenBook(activeWorkspace.book.id)} />}
          </div>
        </div>
      </div>
    </>
  );

  const renderWorkbenchView = () => {
    if (activeView === "workspaces") return renderWorkspacesView();
    if (activeView === "memory") return renderMemoryView();
    if (activeView === "skills") return renderSkillsView();
    if (activeView === "tools") return renderToolsView();
    if (activeView === "providers") return renderProvidersView();
    if (activeView === "workers") return renderWorkersView();
    if (activeView === "automation") return renderAutomationView();
    if (activeView === "writing") return renderWritingView();
    return renderAgentWorkbench();
  };

  return (
    <section className="flex h-screen min-h-[720px] min-w-[1180px] flex-col overflow-hidden bg-slate-950 text-white">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30">
            <Activity className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">灵枢 LumenOS</div>
            <div className="truncate text-[10px] text-slate-500">个人 Agent OS · Codex / Claude Code 风格工作台</div>
          </div>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 lg:flex">
          {["文件", "工作区", "运行", "记忆", "Skills", "工具"].map((item) => (
            <button key={item} className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-900 hover:text-slate-200">
              {item}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-1 py-1">
            {renderPartToggle({
              label: "Activity",
              title: workbenchLayout.activityBarVisible ? "隐藏 Activity Bar" : "显示 Activity Bar",
              visible: workbenchLayout.activityBarVisible,
              onClick: () => toggleWorkbenchPart("activityBarVisible"),
              icon: <PanelsTopLeft className="h-3.5 w-3.5" />,
            })}
            {renderPartToggle({
              label: "侧栏",
              title: workbenchLayout.primarySidebarVisible ? "隐藏主侧边栏" : "显示主侧边栏",
              visible: workbenchLayout.primarySidebarVisible,
              onClick: () => toggleWorkbenchPart("primarySidebarVisible"),
              icon: workbenchLayout.primarySidebarVisible ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />,
            })}
            {renderPartToggle({
              label: "辅助",
              title: workbenchLayout.secondarySidebarVisible ? "隐藏辅助侧边栏" : "显示辅助侧边栏",
              visible: workbenchLayout.secondarySidebarVisible,
              onClick: () => toggleWorkbenchPart("secondarySidebarVisible"),
              icon: workbenchLayout.secondarySidebarVisible ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />,
            })}
            {renderPartToggle({
              label: "Panel",
              title: workbenchLayout.bottomPanelVisible ? "隐藏底部 Panel" : "显示底部 Panel",
              visible: workbenchLayout.bottomPanelVisible,
              onClick: () => toggleWorkbenchPart("bottomPanelVisible"),
              icon: workbenchLayout.bottomPanelVisible ? <PanelBottomClose className="h-3.5 w-3.5" /> : <PanelBottomOpen className="h-3.5 w-3.5" />,
            })}
            {renderPartToggle({
              label: "状态栏",
              title: workbenchLayout.statusbarVisible ? "隐藏 Statusbar" : "显示 Statusbar",
              visible: workbenchLayout.statusbarVisible,
              onClick: () => toggleWorkbenchPart("statusbarVisible"),
              icon: <Activity className="h-3.5 w-3.5" />,
            })}
            <button
              type="button"
              onClick={resetWorkbenchLayout}
              className="inline-flex h-7 items-center justify-center rounded border border-slate-800 bg-slate-950 px-2 text-[10px] text-slate-500 transition-colors hover:border-cyan-500/40 hover:text-slate-200"
            >
              重置
            </button>
          </div>
          <ActionButton label="刷新" icon={<RefreshCw className={`h-3.5 w-3.5 ${state.loading ? "animate-spin" : ""}`} />} onClick={() => void refresh()} disabled={state.loading} />
          <ActionButton label="打开工作区" icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => { if (lastBook) onOpenBook(lastBook.id); else onCreateBook(); }} />
          <ActionButton label="模型设置" icon={<Settings className="h-3.5 w-3.5" />} onClick={onOpenSettings} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: workbenchGridTemplateColumns }}>
        {workbenchLayout.activityBarVisible && (
        <aside className="flex min-h-0 flex-col items-center border-r border-slate-800 bg-slate-950 py-2">
          <div className="sr-only">Activity Bar</div>
          <div className="grid gap-1">
            {activityRail.map((item) => (
              <button
                key={item.label}
                title={item.label}
                aria-label={item.label}
                onClick={() => selectWorkbenchView(item.view)}
                className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                  activeView === item.view ? "bg-slate-800 text-cyan-300" : "text-slate-500 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                {item.icon}
              </button>
            ))}
          </div>
          <div className="mt-auto">
            <button
              title="设置"
              aria-label="设置"
              onClick={onOpenSettings}
              className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-900 hover:text-slate-200"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </aside>
        )}

        {workbenchLayout.primarySidebarVisible && (
        <aside className="min-h-0 overflow-y-auto border-r border-slate-800 bg-slate-950 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] tracking-[0.12em] text-slate-500">主侧边栏</div>
              <div className="mt-1 text-xs font-semibold text-slate-200">资源管理器 / Agent 树</div>
            </div>
            <StatusBadge status={state.online ? "online" : "offline"} subtle />
          </div>
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">目标模式</div>
            <div className="mt-2 text-sm font-semibold text-white">个人超级 Agent OS</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">写作 Agent 是可挂载的领域 Agent，不是产品边界。</p>
          </div>
          <nav className="mt-3 grid gap-1.5">
            {primaryNav.map((item) => (
              <button
                key={item.label}
                onClick={() => selectWorkbenchView(item.view)}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  activeView === item.view ? "bg-slate-800 text-white ring-1 ring-cyan-500/30" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={activeView === item.view ? "text-cyan-300" : "text-slate-500"}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="max-w-[90px] truncate text-[10px] text-slate-500">{item.meta}</span>
              </button>
            ))}
          </nav>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
            <SectionTitle icon={<Activity className="h-4 w-4 text-cyan-300" />} title="Agent 线程" meta={`${filteredAgentThreads.length}/${agentThreads.length}`} />
            <div className="mt-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-slate-300">线程空间</span>
                <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200">{Object.keys(agentThreadSpacesIndex.spaces).length} spaces</span>
              </div>
              <div className="mt-1 truncate text-[10px] text-slate-500">当前：{activeThreadSpaceLabel}</div>
              <div className="mt-2 grid gap-1">
                {agentThreadSpaceRows.map((space) => (
                  <div key={space.key} className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-[10px] ${space.active ? "bg-cyan-500/10 text-cyan-100" : "bg-slate-900/70 text-slate-500"}`}>
                    <span className="min-w-0 truncate">{space.label}</span>
                    <span className="shrink-0 text-slate-500">{space.count}{space.archived ? ` +${space.archived} 归档` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex gap-1.5">
              <button
                type="button"
                onClick={createAgentThreadFromCommand}
                className="rounded border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200 hover:border-cyan-400/50"
              >
                新建线程
              </button>
              <button
                type="button"
                onClick={() => setShowArchivedThreads((prev) => !prev)}
                className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200"
              >
                {showArchivedThreads ? "隐藏归档" : `显示归档 ${archivedAgentThreadCount}`}
              </button>
            </div>
            <label className="sr-only" htmlFor="agent-thread-search">搜索 Agent 线程</label>
            <div className="mt-3 flex items-center gap-2 rounded border border-slate-800 bg-slate-950 px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-600" />
              <input
                id="agent-thread-search"
                value={workbenchLayout.agentThreadSearch}
                onChange={(event) => setAgentThreadSearch(event.target.value)}
                className="h-8 min-w-0 flex-1 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600"
                placeholder="搜索标题 / 消息 / Worker / 审批"
              />
              {workbenchLayout.agentThreadSearch && (
                <button type="button" onClick={() => setAgentThreadSearch("")} className="text-[10px] text-slate-600 hover:text-slate-300">清空</button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {[
                { scope: "current_workspace" as const, label: "当前空间", count: currentWorkspaceThreadCount },
                { scope: "all_workspaces" as const, label: "全部", count: agentThreads.filter((thread) => !thread.archivedAt).length },
                { scope: "unbound" as const, label: "未绑定", count: unboundThreadCount },
              ].map((item) => (
                <button
                  key={item.scope}
                  type="button"
                  onClick={() => setAgentThreadScope(item.scope)}
                  className={`rounded border px-1.5 py-1 text-[10px] transition-colors ${
                    workbenchLayout.agentThreadScope === item.scope
                      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                      : "border-slate-800 bg-slate-950 text-slate-500 hover:border-cyan-500/30 hover:text-slate-300"
                  }`}
                >
                  <span className="block truncate">{item.label}</span>
                  <span className="text-slate-600">{item.count}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              {agentThreadRows.map((thread) => (
                <div
                  key={thread.id}
                  className={`rounded-lg border px-2.5 py-2 transition-colors ${
                    thread.id === activeThread?.id
                      ? "border-cyan-500/40 bg-cyan-500/10"
                      : "border-slate-800 bg-slate-950/50 hover:border-cyan-500/30 hover:bg-slate-800"
                  }`}
                >
                  <button type="button" onClick={() => selectAgentThread(thread.thread)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-slate-200">{thread.title}</span>
                      <StatusBadge status={thread.status} subtle />
                    </div>
                    <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{thread.detail}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-600">
                      <span>{thread.thread.workspaceTitle || "未绑定工作区"}</span>
                      <span>事件 {thread.thread.events.length}</span>
                      <span>审批 {thread.thread.approvalCount}</span>
                      <span>Diff {thread.thread.diffCount}</span>
                    </div>
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                    <span className="truncate text-[10px] text-slate-600">{formatDateTime(thread.thread.updatedAt)}</span>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => exportAgentThread(thread.id)}
                        className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200"
                      >
                        导出
                      </button>
                      <button
                        type="button"
                        onClick={() => branchAgentThread(thread.id)}
                        className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200"
                      >
                        分支
                      </button>
                      <button
                        type="button"
                        onClick={() => thread.thread.archivedAt ? restoreAgentThread(thread.id) : archiveAgentThread(thread.id)}
                        className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200"
                      >
                        {thread.thread.archivedAt ? "恢复" : "归档"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAgentThread(thread.id)}
                        className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-500 hover:border-rose-500/40 hover:text-rose-200"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!agentThreadRows.length && <EmptyBlock text="暂无可显示线程；可切到全部空间或清空搜索。" />}
              {filteredAgentThreads.length > agentThreadRows.length && (
                <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2 text-[10px] text-slate-600">
                  还有 {filteredAgentThreads.length - agentThreadRows.length} 条线程未显示；可继续搜索或切换线程范围。
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
            <SectionTitle icon={<FolderKanban className="h-4 w-4 text-blue-300" />} title="工作区文件树" meta={normalizedExplorerSearch ? `${filteredExplorerFileCount}/${activeWorkspaceFiles.length}` : `${activeWorkspaceFiles.length}`} />
            <label className="sr-only" htmlFor="workspace-explorer-search">搜索工作区文件</label>
            <input
              id="workspace-explorer-search"
              value={workspaceExplorerSearch}
              onChange={(event) => setWorkspaceExplorerSearch(event.target.value)}
              className="mt-3 h-8 w-full rounded border border-slate-800 bg-slate-950 px-2 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/50"
              placeholder="搜索文件 / 摘要 / 内容"
            />
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => setCollapsedExplorerCategories(new Set())}
                className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200"
              >
                全部展开
              </button>
              <button
                type="button"
                onClick={() => setCollapsedExplorerCategories(new Set(workspaceFileGroups.map((group) => group.category)))}
                className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200"
              >
                全部收起
              </button>
              {workspaceExplorerSearch && (
                <button
                  type="button"
                  onClick={() => setWorkspaceExplorerSearch("")}
                  className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/40 hover:text-slate-200"
                >
                  清空
                </button>
              )}
            </div>
            {recentWorkspaceFiles.length > 0 && (
              <div className="mt-3 rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                <div className="mb-1 flex items-center justify-between gap-2 px-1">
                  <span className="truncate text-[10px] font-semibold text-slate-300">最近文件</span>
                  <span className="shrink-0 text-[10px] text-slate-600">{recentWorkspaceFiles.length}</span>
                </div>
                <div className="grid gap-1">
                  {recentWorkspaceFiles.map(({ file, words }) => {
                    const selected = selectedExplorerFile?.id === file.id;
                    return (
                      <button
                        key={`recent-${file.id}`}
                        type="button"
                        onClick={() => setSelectedExplorerFileId(file.id)}
                        onDoubleClick={() => openExplorerFileInEditor(file.id)}
                        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                          selected ? "bg-cyan-500/10 text-white ring-1 ring-cyan-500/30" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[11px]">{file.title || "未命名文件"}</span>
                          <span className="block truncate text-[10px] text-slate-600">{file.category || "未分组"} · {formatDateTime(file.updatedAt)}</span>
                        </span>
                        <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{formatNumber(words)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
              {workspaceFileGroups.length ? workspaceFileGroups.map((group) => (
                <div key={group.category} className="rounded border border-slate-800 bg-slate-950/50 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => toggleExplorerCategory(group.category)}
                    className="mb-1 flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left hover:bg-slate-800/70"
                  >
                    <span className="truncate text-[10px] font-semibold text-blue-200">{collapsedExplorerCategories.has(group.category) ? "▸" : "▾"} {group.category}</span>
                    <span className="shrink-0 text-[10px] text-slate-600">{group.files.length}</span>
                  </button>
                  {!collapsedExplorerCategories.has(group.category) && (
                    <div className="grid gap-1">
                      {group.files.slice(0, 8).map(({ file, words }) => {
                        const selected = selectedExplorerFile?.id === file.id;
                        return (
                          <button
                            key={file.id}
                            onClick={() => setSelectedExplorerFileId(file.id)}
                            onDoubleClick={() => openExplorerFileInEditor(file.id)}
                            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                              selected ? "bg-cyan-500/10 text-white ring-1 ring-cyan-500/30" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[11px]">{file.kind === "image" ? "图片 · " : ""}{file.title || "未命名文件"}</span>
                              <span className="block truncate text-[10px] text-slate-600">{formatDateTime(file.updatedAt)}</span>
                            </span>
                            <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{formatNumber(words)}</span>
                          </button>
                        );
                      })}
                      {group.files.length > 8 && <div className="px-2 py-1 text-[10px] text-slate-600">还有 {group.files.length - 8} 个文件，进入工作区查看完整列表</div>}
                    </div>
                  )}
                </div>
              )) : <EmptyBlock text="暂无文件" />}
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="mb-2 text-xs font-semibold text-white">Phase 1-5</div>
            <div className="grid gap-2">
              {phaseBlueprint.map((phase) => (
                <div key={phase.id} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200">{phase.id} {phase.title}</span>
                    <StatusBadge status={phase.status} subtle />
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{phase.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
        )}

        <main className="min-h-0 min-w-0 overflow-y-auto bg-slate-950">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-950 px-2">
            {workbenchTabs.map((tab) => (
              <button
                key={tab.label}
                onClick={() => selectWorkbenchView(tab.view)}
                className={`h-8 rounded-t-md border-x border-t px-3 text-xs ${
                  activeView === tab.view
                    ? "border-slate-700 bg-slate-900 text-white"
                    : "border-transparent text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <div className="ml-auto text-[10px] uppercase tracking-[0.18em] text-slate-600">主工作区 / Agent 运行台</div>
          </div>
          <div className="space-y-4 p-4">
            {renderWorkbenchView()}
            {workbenchLayout.bottomPanelVisible ? renderBottomPanel() : (
              <button
                type="button"
                onClick={() => updateWorkbenchLayout({ bottomPanelVisible: true })}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-slate-800 bg-slate-900/70 px-4 py-3 text-left transition-colors hover:border-cyan-500/40 hover:bg-slate-900"
              >
                <span className="flex min-w-0 items-center gap-2 text-xs text-slate-300">
                  <PanelBottomOpen className="h-4 w-4 text-cyan-300" />
                  底部 Panel 已收起
                </span>
                <span className="text-[10px] text-slate-500">终端 / 输出 / 问题 / Worker / Gateway</span>
              </button>
            )}

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Layers className="h-4 w-4 text-cyan-300" />
              运行时检查器
            </h3>
            <p className="mt-1 text-xs text-slate-500">在当前工作台内交叉检查记忆、Skills、Provider、Worker、权限闸门和阶段审计。</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <DetailTabButton tab="overview" active={detailTab} icon={<ListChecks className="h-3.5 w-3.5" />} label="总览" onClick={setDetailTab} />
            <DetailTabButton tab="memory" active={detailTab} icon={<Brain className="h-3.5 w-3.5" />} label="记忆" onClick={setDetailTab} />
            <DetailTabButton tab="skills" active={detailTab} icon={<Sparkles className="h-3.5 w-3.5" />} label="Skills" onClick={setDetailTab} />
            <DetailTabButton tab="providers" active={detailTab} icon={<Server className="h-3.5 w-3.5" />} label="模型" onClick={setDetailTab} />
            <DetailTabButton tab="workers" active={detailTab} icon={<Cpu className="h-3.5 w-3.5" />} label="后台任务" onClick={setDetailTab} />
          </div>
        </div>

        {detailTab === "overview" && (
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div>
                <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />} title="能力摘要" meta={statusLabel(asString(capabilities.arbitrary_shell, "disabled"))} />
                <div className="grid gap-2 md:grid-cols-2">
                  {Object.entries(capabilitySummary).length ? Object.entries(capabilitySummary).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div className="truncate text-[10px] text-slate-500">{key}</div>
                      <div className="mt-1 truncate text-xs text-slate-300">{String(value)}</div>
                    </div>
                  )) : <EmptyBlock text="等待 Gateway 能力摘要" />}
                </div>
              </div>
              <div>
                <SectionTitle icon={<ListChecks className="h-4 w-4 text-lime-300" />} title="阶段审计" meta={statusLabel(phaseStatus)} />
                <div className="grid gap-2 md:grid-cols-2">
                  {phaseRows.length ? phaseRows.slice(0, 6).map((phase) => (
                    <div key={asString(phase.id, asString(phase.label))} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-slate-200">{asString(phase.label, asString(phase.id, "Phase"))}</div>
                          <div className="mt-1 text-[10px] text-slate-500">{asNumber(phase.passed)} / {asNumber(phase.total)} 项检查</div>
                        </div>
                        <StatusBadge status={asString(phase.status, "unknown")} />
                      </div>
                    </div>
                  )) : <EmptyBlock text="等待 phase_audit 返回阶段列表" />}
                </div>
              </div>
            </div>
            <div>
              <SectionTitle icon={<Activity className="h-4 w-4 text-cyan-300" />} title="安全闸门" meta={`${safetyLayers.length} 层`} />
              <div className="grid gap-2">
                {safetyLayers.length ? safetyLayers.map((layer) => (
                  <div key={asString(layer.key, asString(layer.message))} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs text-slate-300">{asString(layer.key, "gate")}</span>
                      <StatusBadge status={asString(layer.severity, "unknown")} subtle />
                    </div>
                    <div className="mt-1 line-clamp-2 text-[10px] text-slate-500">{asString(layer.message)}</div>
                  </div>
                )) : <EmptyBlock text="等待安全闸门" />}
              </div>
            </div>
          </div>
        )}

        {detailTab === "memory" && (
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniStat label="L1 事件" value={formatNumber(asNumber(memory.l1_count))} />
                <MiniStat label="L2 摘要" value={formatNumber(asNumber(memory.l2_count))} tone="text-pink-300" />
                <MiniStat label="待处理" value={formatNumber(asNumber(memory.pending_count))} tone={asNumber(memory.pending_count) ? "text-amber-300" : "text-emerald-300"} />
                <MiniStat label="当前筛选" value={`${filteredMemoryRows.length}`} />
              </div>
              <div>
                <SectionTitle icon={<Database className="h-4 w-4 text-pink-300" />} title="六维索引快照" meta={`${dimensionRows.length}`} />
                <div className="grid gap-2 md:grid-cols-2">
                  {dimensionRows.length ? dimensionRows.map(({ key, record }) => (
                    <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="truncate text-slate-200">{asString(record.label, key)}</span>
                        <span className="shrink-0 text-slate-500">L2 {asNumber(record.l2)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-pink-400" style={{ width: `${Math.min(100, asNumber(record.l2) || asNumber(record.l1) || 4)}%` }} />
                      </div>
                      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                        <span>L1 {asNumber(record.l1)}</span>
                        <span>待处理 {asNumber(record.pending)}</span>
                      </div>
                    </div>
                  )) : <EmptyBlock text="等待 AutoDream 维度" />}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
              <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />} title="记忆审计边界" meta={activeView === "memory" ? "主视图已打开" : "可跳转"} />
              <p className="text-xs leading-relaxed text-slate-500">
                完整 L1/L2 搜索、筛选、证据检查和管理审批草案放在主工作区的 `记忆管理器` 中。这里保留轻量快照，避免 Runtime Inspector 复制一整套管理器。
              </p>
              <div className="mt-3 grid gap-2">
                {selectedMemoryRow ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-semibold text-white">{selectedMemoryRow.kind} · {selectedMemoryRow.dimension}</span>
                      <span className="text-[10px] text-slate-500">{formatDateTime(selectedMemoryRow.at)}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[10px] leading-relaxed text-slate-500">{selectedMemoryRow.summary}</p>
                  </div>
                ) : <EmptyBlock text="暂无可审计记忆" />}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-[10px] leading-relaxed text-slate-500">
                  编辑 / 冻结 / 删除都通过 `memory_update` / `memory_freeze` / `memory_delete` 进入审批队列；默认不覆盖或删除原记录。
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton label="打开记忆管理器" icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => setActiveView("memory")} />
                <ActionButton label="压缩记忆" icon={<Brain className="h-3.5 w-3.5" />} onClick={() => void runQuickAction("压缩记忆", "memory_consolidate", {})} disabled={!state.online || quickAction.status === "running"} />
                <ActionButton label="召回记忆" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => void runQuickAction("记忆召回", "memory_retrieve", { task: "继续灵枢 LumenOS / Writing Agent 开发", limit: 8 })} disabled={!state.online || quickAction.status === "running"} />
              </div>
            </div>
          </div>
        )}

        {detailTab === "skills" && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MiniStat label="候选" value={formatNumber(asNumber(skillPayload.candidate_count))} />
              <MiniStat label="已激活" value={formatNumber(asNumber(skillPayload.activated_count))} tone="text-emerald-300" />
              <MiniStat label="本地检索" value={formatNumber(asNumber(skillPayload.local_skill_count, skillLocalSkills.length))} />
              <MiniStat label="根目录" value={`${skillLocalRoots.length}`} />
              <MiniStat label="脚本闸门" value={statusLabel(asString(capabilities.skill_script_execution, "disabled"))} tone="text-amber-300" />
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]">
              <div>
                <SectionTitle icon={<Sparkles className="h-4 w-4 text-fuchsia-300" />} title="最近候选" meta={`${skillRecentCandidates.length}`} />
                <div className="grid max-h-[520px] gap-2 overflow-auto pr-1">
                  {skillRecentCandidates.length ? skillRecentCandidates.slice(0, 8).map((item) => <SkillRow key={asString(item.id, asString(item.title))} item={item} />) : <EmptyBlock text="暂无 AutoDream Skill 候选" />}
                </div>
              </div>
              <div>
                <SectionTitle icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} title="最近激活" meta={`${skillRecentActivated.length}`} />
                <div className="grid max-h-[520px] gap-2 overflow-auto pr-1">
                  {skillRecentActivated.length ? skillRecentActivated.slice(0, 8).map((item) => <SkillRow key={asString(item.id, asString(item.title))} item={item} />) : <EmptyBlock text="暂无已激活 Skill" />}
                </div>
              </div>
              <div>
                <SectionTitle icon={<HardDrive className="h-4 w-4 text-blue-300" />} title="本地 Skill 根目录" meta={`${skillLocalSkills.length} / ${skillLocalRoots.length}`} />
                <div className="grid gap-2">
                  {skillLocalRoots.length ? skillLocalRoots.map((root) => (
                    <div key={asString(root.key, asString(root.path))} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs text-slate-300">{asString(root.label, asString(root.key, "根目录"))}</span>
                        <span className={asBoolean(root.exists) ? "text-[10px] text-emerald-300" : "text-[10px] text-red-300"}>{asNumber(root.skill_count)} 个 Skills</span>
                      </div>
                      <PathLine value={asString(root.path)} />
                    </div>
                  )) : <EmptyBlock text="等待本地 Skill 根目录" />}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton label="匹配写作 Agent" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void runQuickAction("匹配写作 Agent", "skill_route", { task: "继续灵枢 LumenOS 与 Writing Agent 开发", domain: "writing", local_limit: 10 })} disabled={!state.online || quickAction.status === "running"} />
                  <ActionButton label="Skills 地图" icon={<FolderKanban className="h-3.5 w-3.5" />} onClick={() => onOpenOverview?.()} disabled={!onOpenOverview} />
                </div>
                {skillRecentEvents.length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <div className="mb-1 text-xs text-slate-300">最近事件</div>
                    {skillRecentEvents.slice(0, 3).map((event) => (
                      <div key={`${asString(event.at)}-${asString(event.type)}`} className="truncate text-[10px] text-slate-500">{formatDateTime(event.at)} · {asString(event.type)} · {asString(event.status, asString(event.message))}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {detailTab === "providers" && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MiniStat label="运行时" value={apiReady ? "就绪" : "待配置"} tone={apiReady ? "text-emerald-300" : "text-amber-300"} />
              <MiniStat label="模型 Provider" value={effectiveProvider} />
              <MiniStat label="端点" value={endpointLocal ? "本地" : settings.apiUrl ? "远程" : "未配置"} tone={endpointLocal ? "text-emerald-300" : settings.apiUrl ? "text-blue-300" : "text-amber-300"} />
              <MiniStat label="预设" value={formatNumber(totalProviderPresetCount)} />
              <MiniStat label="配置档案" value={`${settingsProfiles.length}`} />
            </div>
            {!providerReady && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-xs text-amber-200">
                Gateway 目录暂未返回，运行时检查器使用前端预设库兜底{providerMessage ? `：${providerMessage}` : ""}。
              </div>
            )}
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div>
                <SectionTitle icon={<Server className="h-4 w-4 text-blue-300" />} title="运行时配置" meta={apiReady ? "就绪" : "待配置"} />
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                  <div className="truncate text-sm font-semibold text-white">{effectiveProviderLabel}</div>
                  <div className="mt-1 truncate font-mono text-[10px] text-slate-500" title={settings.apiUrl}>{endpointLabel}</div>
                  <div className="mt-3 grid gap-2">
                    <MiniStat label="模型" value={settings.modelId || "未设置"} tone={settings.modelId ? "text-white" : "text-amber-300"} />
                    <MiniStat label="API key" value={settings.apiKey ? "已填写" : keyOptional ? "可选" : "必填"} tone={settings.apiKey || keyOptional ? "text-emerald-300" : "text-amber-300"} />
                    <MiniStat label="配置档案" value={activeProfile?.name || "直接设置"} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton label="API 设置" icon={<Settings className="h-3.5 w-3.5" />} onClick={onOpenSettings} />
                  <ActionButton label="状态检查" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => void runProviderAction("模型 Provider 状态", "provider_status", providerPayload)} disabled={!state.online || quickAction.status === "running" || !settings.apiUrl.trim()} />
                  <ActionButton label="探针草案" icon={<Network className="h-3.5 w-3.5" />} onClick={() => void runProviderAction("模型探针草案", "provider_probe", providerPayload)} disabled={!state.online || quickAction.status === "running" || !settings.apiUrl.trim()} />
                </div>
              </div>
              <div>
                <SectionTitle icon={<Network className="h-4 w-4 text-blue-300" />} title="Gateway / 预设库" meta={`${displayProviderPresets.length} 个`} />
                <div className="grid gap-2">
                  {displayProviderGroups.map((group) => (
                    <div key={group.id || group.label} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs text-slate-300">{group.label}</span>
                        <span className="text-[10px] text-slate-500">{group.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid max-h-[420px] gap-2 overflow-auto pr-1 md:grid-cols-2">
                  {displayProviderPresets.length ? displayProviderPresets.map((preset) => <ProviderRow key={asString(preset.id, asString(preset.label))} item={preset} />) : <EmptyBlock text="等待 Provider 预设" />}
                </div>
              </div>
            </div>
          </div>
        )}

        {detailTab === "workers" && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MiniStat label="Worker 任务" value={formatNumber(asNumber(workerPayload.job_count, workerCount))} />
              <MiniStat label="最近任务" value={`${workerRecentJobs.length}`} />
              <MiniStat label="硬取消支持" value={`${hardCancelableJobs}`} tone={hardCancelableJobs ? "text-emerald-300" : "text-slate-300"} />
              <MiniStat label="合并草案" value={`${workerMergeProposals.length}`} />
              <MiniStat label="事件流" value={`${workerRecentEvents.length}`} />
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <SectionTitle icon={<Cpu className="h-4 w-4 text-cyan-300" />} title="最近 Worker" meta={`${workerRecentJobs.length} 条`} />
                <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
                  {workerRecentJobs.length ? workerRecentJobs.slice(0, 10).map((job) => <WorkerRow key={asString(job.id, asString(job.created_at))} item={job} />) : <EmptyBlock text="暂无 Worker 任务" />}
                </div>
              </div>
              <div>
                <SectionTitle icon={<FileText className="h-4 w-4 text-amber-300" />} title="草案与事件" meta={`${workerMergeProposals.length} 个草案`} />
                <div className="grid gap-2">
                  {workerMergeProposals.length ? workerMergeProposals.slice(0, 5).map((proposal) => (
                    <div key={asString(proposal.id, asString(proposal.proposal_path))} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs text-slate-300">{asString(proposal.job_id, asString(proposal.id, "proposal"))}</span>
                        <StatusBadge status={asString(proposal.status, "draft")} subtle />
                      </div>
                      <PathLine value={asString(proposal.proposal_path)} />
                    </div>
                  )) : <EmptyBlock text="暂无 Worker 合并草案" />}
                </div>
                {workerRecentEvents.length > 0 && (
                  <div className="mt-3 grid max-h-[260px] gap-1 overflow-auto rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                    {workerRecentEvents.slice(0, 12).map((event) => (
                      <div key={`${asString(event.at)}-${asString(event.job_id)}-${asString(event.type)}`} className="truncate text-[10px] text-slate-500">
                        {formatDateTime(event.at)} · {asString(event.type)} · {asString(event.status)} · {asString(event.job_id)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
          </div>
        </main>

        {workbenchLayout.secondarySidebarVisible && (
        <aside className="min-h-0 overflow-y-auto border-l border-slate-800 bg-slate-950 p-3">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <SectionTitle icon={<Library className="h-4 w-4 text-blue-300" />} title="辅助侧边栏 / 工作区上下文" meta={`${library.books.length} 个工作区`} />
              {activeWorkspace ? (
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950/60 text-xl text-cyan-200">
                      {activeWorkspace.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{activeWorkspace.title}</div>
                      <div className="mt-1 truncate text-[10px] text-cyan-200">{activeWorkspace.domain}</div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{activeWorkspace.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <MiniStat label="文件" value={`${activeWorkspace.files}`} />
                    <MiniStat label="字数" value={formatNumber(activeWorkspace.words)} />
                    <MiniStat label="分组" value={`${activeWorkspace.categoryCount}`} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ActionButton label="新建" icon={<Plus className="h-3.5 w-3.5" />} onClick={onCreateBook} />
                    <ActionButton label="打开" icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => onOpenBook(activeWorkspace.book.id)} />
                  </div>
                </div>
              ) : (
                <EmptyBlock text="还没有工作区" />
              )}
              <div className="mt-4">
                <SectionTitle icon={<Clock className="h-4 w-4 text-slate-400" />} title="最近工作区" />
                <div className="grid gap-2">
                  {workspaceSummaries.map((item) => (
                    <button
                      key={item.book.id}
                      onClick={() => onOpenBook(item.book.id)}
                      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                        item.book.id === activeWorkspace?.book.id
                          ? "border-cyan-500/30 bg-cyan-500/10"
                          : "border-slate-800 bg-slate-950/40 hover:bg-slate-800/70"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-white">{item.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="truncate">{item.domain}</span>
                          <span>{item.files} 个文件</span>
                          <span>{new Date(item.book.updatedAt).toLocaleDateString("zh-CN")}</span>
                        </div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-slate-500" />
                    </button>
                  ))}
                  {!workspaceSummaries.length && <EmptyBlock text="暂无工作区" />}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <SectionTitle icon={<FileText className="h-4 w-4 text-blue-300" />} title="只读文件预览" meta={selectedExplorerFile?.category || "未选择"} />
              {selectedExplorerFile ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{selectedExplorerFile.title || "未命名文件"}</div>
                        <div className="mt-1 truncate text-[10px] text-slate-500">{selectedExplorerFile.category} · {formatDateTime(selectedExplorerFile.updatedAt)}</div>
                      </div>
                      <StatusBadge status={selectedExplorerFile.kind || "text"} subtle />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <MiniStat label="字数" value={formatNumber(wordCount(selectedExplorerFile.content).total)} />
                      <MiniStat label="版本" value={`${selectedExplorerFile.history?.length || 0}`} />
                      <MiniStat label="模式" value="只读" tone="text-emerald-300" />
                    </div>
                  </div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 px-3 py-3 text-[10px] leading-relaxed text-slate-400">
                    {selectedExplorerText.slice(0, 2200)}
                    {selectedExplorerText.length > 2200 ? "\n\n...已截断，进入工作区查看全文。" : ""}
                  </pre>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton label="跳转编辑器" icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => openExplorerFileInEditor()} disabled={!activeWorkspace} />
                    <ActionButton label="写入走审批" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => selectWorkbenchView("tools")} />
                  </div>
                </div>
              ) : <EmptyBlock text="从工作区文件树选择文件" />}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <SectionTitle icon={<FileText className="h-4 w-4 text-amber-300" />} title="Changes / Diff" meta={changeFileRows.length ? `${changeFileRows.length} 文件` : `${workerMergeProposals.length} 草案`} />
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-2">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <span className="text-[10px] font-semibold text-slate-300">文件级 Diff</span>
                  <span className="text-[10px] text-slate-600">{changeFileRows.length}</span>
                </div>
                <div className="grid max-h-40 gap-1 overflow-auto pr-1">
                  {changeFileRows.length ? changeFileRows.map((change) => (
                    <button
                      key={`change-file-${change.id}`}
                      type="button"
                      onClick={() => setSelectedChangeFileId(change.id)}
                      className={`rounded px-2 py-2 text-left transition-colors ${
                        selectedChangeFile?.id === change.id ? "bg-amber-500/10 ring-1 ring-amber-500/30" : "hover:bg-slate-800/70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-medium text-slate-200">{change.title}</span>
                        <StatusBadge status={change.status} subtle />
                      </div>
                      <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{change.detail}</div>
                    </button>
                  )) : <EmptyBlock text="暂无 Changes；生成合并草案后会显示 diff。" />}
                </div>
              </div>
              {selectedChangeFile && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white">{selectedChangeFile.title}</div>
                      <PathLine value={selectedChangeFile.path} />
                    </div>
                    <StatusBadge status={selectedChangeFile.status} subtle />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <MiniStat label="接受" value={`${selectedChangeFile.accepted}`} tone={selectedChangeFile.accepted ? "text-emerald-300" : "text-slate-300"} />
                    <MiniStat label="拒绝" value={`${selectedChangeFile.rejected}`} tone={selectedChangeFile.rejected ? "text-red-300" : "text-slate-300"} />
                    <MiniStat label="待审" value={`${selectedChangeFile.pending}`} tone={selectedChangeFile.pending ? "text-amber-300" : "text-slate-300"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {selectedChangeFile.hunks.length > 0 ? (
                      <>
                        <ActionButton label="接受全部" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setAllCommandDiffHunks("accepted")} disabled={commandApproval.status === "running"} />
                        <ActionButton label="拒绝全部" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setAllCommandDiffHunks("rejected")} disabled={commandApproval.status === "running"} />
                        <ActionButton label="回滚草案" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setAllCommandDiffHunks("pending")} disabled={commandApproval.status === "running"} />
                        <ActionButton label="write_file 审批" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => void runCommandWriteApproval()} disabled={!state.online || !acceptedCommandHunkCount || commandApproval.status === "running"} />
                      </>
                    ) : (
                      <>
                        <ActionButton label="打开审批" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => selectWorkbenchView("agent")} />
                        <ActionButton label="刷新 Gateway" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void refresh()} disabled={state.loading} />
                      </>
                    )}
                    {selectedChangeFile.workspaceFileId && (
                      <ActionButton label="跳转编辑器" icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => openExplorerFileInEditor(selectedChangeFile.workspaceFileId)} />
                    )}
                  </div>
                  {selectedChangeFile.hunks.length > 0 && (
                    <div className="mt-3 grid max-h-56 gap-2 overflow-auto pr-1">
                      {selectedChangeFile.hunks.map((hunk, index) => (
                        <div key={`side-hunk-${hunk.id}`} className="rounded border border-slate-800 bg-slate-900/70 px-2 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[10px] font-medium text-slate-200">Hunk {index + 1} · {hunk.title}</span>
                            <StatusBadge status={hunk.status} subtle />
                          </div>
                          <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{commandHunkWriteContent(hunk).slice(0, 220) || "空 hunk"}</div>
                          <div className="mt-2 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setCommandDiffHunkStatus(hunk.id, "accepted")}
                              disabled={hunk.status === "accepted" || commandApproval.status === "running"}
                              className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 hover:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              接受
                            </button>
                            <button
                              type="button"
                              onClick={() => setCommandDiffHunkStatus(hunk.id, "rejected")}
                              disabled={hunk.status === "rejected" || commandApproval.status === "running"}
                              className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-200 hover:border-red-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              拒绝
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MiniStat label="接受" value={`${acceptedCommandHunkCount}`} tone={acceptedCommandHunkCount ? "text-emerald-300" : "text-slate-300"} />
                <MiniStat label="拒绝" value={`${rejectedCommandHunkCount}`} tone={rejectedCommandHunkCount ? "text-red-300" : "text-slate-300"} />
                <MiniStat label="草案" value={`${workerMergeProposals.length}`} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <SectionTitle icon={<Activity className="h-4 w-4 text-lime-300" />} title="运行审计" meta={phaseStatus} />
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-950/40 px-3 py-3">
                  <div className="text-xs text-slate-500">阶段</div>
                  <div className={`mt-1 text-lg font-semibold ${statusTone(phaseStatus)}`}>{statusLabel(phaseStatus)}</div>
                </div>
                <div className="rounded-lg bg-slate-950/40 px-3 py-3">
                  <div className="text-xs text-slate-500">完成审计</div>
                  <div className="mt-1 text-lg font-semibold text-amber-300">P{completionPartial} / M{completionMissing}</div>
                </div>
                <div className="rounded-lg bg-slate-950/40 px-3 py-3">
                  <div className="text-xs text-slate-500">Gateway</div>
                  <div className={`mt-1 text-lg font-semibold ${state.online ? "text-emerald-300" : "text-amber-300"}`}>{state.online ? "在线" : "离线"}</div>
                </div>
                <div className="rounded-lg bg-slate-950/40 px-3 py-3">
                  <div className="text-xs text-slate-500">API</div>
                  <div className={`mt-1 text-lg font-semibold ${isConfigured(settings) ? "text-emerald-300" : "text-amber-300"}`}>{isConfigured(settings) ? "就绪" : "待配置"}</div>
                </div>
                <div className="rounded-lg bg-slate-950/40 px-3 py-3">
                  <div className="text-xs text-slate-500">工作区</div>
                  <div className="mt-1 text-lg font-semibold text-white">{formatNumber(totalWords)}</div>
                </div>
              </div>
              {quickAction.label && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-300">{quickAction.label}</span>
                    <span className={statusTone(quickAction.status)}>{statusLabel(quickAction.status)}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-slate-500">{quickAction.detail}</div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <SectionTitle icon={<Wrench className="h-4 w-4 text-cyan-300" />} title="工具与上下文" meta={`${enabledTools.length} 已开`} />
              <div className="grid gap-2">
                {visibleMatrix.slice(0, 6).map((tool) => (
                  <div key={`side-${tool.action}-${tool.label}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <span className="truncate text-xs text-slate-300">{tool.label}</span>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] ${tool.enabled ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                      {tool.enabled ? "已开" : "受控"}
                    </span>
                  </div>
                ))}
                {!visibleMatrix.length && <EmptyBlock text="等待工具矩阵" />}
              </div>
            </div>
          </div>
        </aside>
        )}
      </div>
      {workbenchLayout.statusbarVisible && (
      <footer className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-3 text-[10px] text-slate-400">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-semibold text-cyan-200">灵枢</span>
          <span className="truncate">工作区: {activeWorkspace?.title || "未选择"}</span>
          <span className="truncate">领域: {activeDomain}</span>
          <span>Gateway: {state.online ? "在线" : "离线"}</span>
          <span>布局: {visibleWorkbenchPartCount}/6 Parts</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span>权限: {statusLabel(asString(capabilities.arbitrary_shell, "disabled"))}</span>
          <span>工具 {enabledTools.length}/{matrix.length}</span>
          <span>记忆 L2 {asNumber(memory.l2_count)}</span>
          <span>Worker {workerCount}</span>
          <button type="button" onClick={resetWorkbenchLayout} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200">重置布局</button>
        </div>
      </footer>
      )}
    </section>
  );
}

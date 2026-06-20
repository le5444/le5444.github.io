import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Brain, Loader2, MessageSquare, Send, X, Eye, Filter, Square, Wrench } from "lucide-react";
import { type ApiSettings, type ChatMessage, isConfigured, sendChat } from "../store/settings";
import { type PromptTemplate, type WorkspaceFile, type WorkspaceState } from "../store/workspace";
import { buildDistillationPrompt, type DistilledProfile } from "../store/distillation";
import { prompts } from "../data/prompts";
import { DEFAULT_VALIDATION_LAYERS, htmlToPlainText, parseSkillMetadata, substituteParams, normalizePromptTemplate, type AIResult, uid } from "../utils/helpers";
import { planAgentIntent, selectAgentMemoryShards, selectAgentSkills } from "../utils/agent-memory";
import { planPersonalOS, renderPersonalOSContext } from "../utils/personal-os";
import { type AgentRunRecord, agentRunToAutoDreamEvents, completeAgentRun, createAgentRun, failAgentRun } from "../utils/agent-run";
import { appendAutoDreamMarkdown } from "../utils/autodream";
import { buildToolRouteBundle, renderToolRegistryContext } from "../utils/tool-registry";
import { appendKairosMarkdown, createKairosLog, createKairosTask } from "../utils/kairos";
import { assembleSkills, renderSkillAssemblyContext } from "../utils/skill-registry";
import { type ApprovalDraft, extractApprovalDraftsFromText, renderApprovalDraftMarkdown, renderApprovalProtocol } from "../utils/approval-diff";
import { COMMAND_VALIDATORS, renderCommandValidatorContext } from "../utils/command-validators";
import { buildSwarmPlan, renderSwarmPlanContext } from "../utils/subagent-swarm";
import { buildExecutorBridgeManifest, createExecutorBridgeRequest, extractExecutorBridgeRequestsFromText, renderExecutorBridgeContext, renderExecutorBridgeRequestMarkdown, type ExecutorActionKind, type ExecutorBridgeRequest, type ExecutorBridgeRequestStatus } from "../utils/executor-bridge";
import { buildWorkflowDag, renderWorkflowDagContext, workflowDagToAdvancePayload, workflowDagToRunPayload } from "../utils/workflow-dag";
import { buildAgentArchitecturePlan, renderAgentArchitectureContext } from "../utils/agent-architecture";
import { buildCoordinatorModePlan, renderCoordinatorModeContext } from "../utils/coordinator-mode";
import { buildAgentContextPack, renderAgentContextPack } from "../utils/agent-context-pack";
import { buildOneShotToolFollowupPrompt, canAutoSubmitBridgeRequest, renderBridgeResultForChat, stripAgentProtocolForChatDisplay } from "../os/kernel/agent-loop-bridge";
import { showToast } from "../utils/toast";
import { CopyButton } from "./shared";

interface Tab { key: "chat" | "results"; label: string; icon: React.ReactNode; }
interface PendingPrompt {
  text: string;
  forResult?: boolean;
  resultTitle?: string;
  replaceMode?: boolean;
}
interface GatewayWorkflowSnapshot {
  id: string;
  name: string;
  status: string;
  currentNodeId: string;
  action: string;
  eventCount: number;
  at: number;
}
interface GatewayKairosSnapshot {
  id: string;
  objective: string;
  status: string;
  nextAction: string;
  source: string;
  action: string;
  eventCount: number;
  lastTickAt: string;
  at: number;
}
interface GatewaySchedulerSnapshot {
  id: string;
  action: string;
  taskName: string;
  status: string;
  planCount: number;
  intervalMinutes: number;
  installDraftPath: string;
  uninstallDraftPath: string;
  execution: string;
  returnCode: number;
  output: string;
  at: number;
}
interface GatewayWorkerSnapshot {
  id: string;
  action: string;
  agentId: string;
  status: string;
  jobCount: number;
  command: string;
  output: string;
  proposalPath: string;
  processPid: number;
  hardCancelSupported: boolean;
  hardCancelStatus: string;
  at: number;
}
interface GatewayProviderSnapshot {
  id: string;
  action: string;
  status: string;
  presetCount: number;
  returned: number;
  provider: string;
  providerLabel: string;
  apiUrl: string;
  modelId: string;
  keyRequired: boolean;
  keyAvailable: boolean;
  localEndpoint: boolean;
  remoteRequiresAllow: boolean;
  groupCount: number;
  providers: string[];
  modelCount: number;
  statusCode: number;
  wireKind: string;
  at: number;
}
interface GatewayMemorySnapshot {
  id: string;
  action: string;
  dimension: string;
  l1Count: number;
  l2Count: number;
  pendingCount: number;
  createdCount: number;
  summary: string;
  at: number;
}
interface GatewaySubagentSnapshot {
  id: string;
  action: string;
  label: string;
  status: string;
  activeLocks: number;
  conflicts: number;
  scope: string;
  mode: string;
  at: number;
}
interface GatewaySkillSnapshot {
  id: string;
  action: string;
  candidateId: string;
  title: string;
  status: string;
  candidateCount: number;
  activatedCount: number;
  createdCount: number;
  draftPath: string;
  activatedPath: string;
  domain: string;
  mountedCount: number;
  expectedCount: number;
  agentCount: number;
  contextItems: number;
  commandExcluded: boolean;
  workflowId: string;
  localSkillCount: number;
  localRootCount: number;
  localSkillLabels: string[];
  at: number;
}
interface GatewaySandboxSnapshot {
  id: string;
  action: string;
  mode: string;
  probes: number;
  okCount: number;
  arbitraryCommands: string;
  executeRead: boolean;
  executeWrite: boolean;
  executeCommand: boolean;
  executeScheduler: boolean;
  executeWeb: boolean;
  executeMcp: boolean;
  fullAccessFiles: boolean;
  workspaceSandbox: boolean;
  matrix: Array<{
    action: string;
    label: string;
    enabled: boolean;
    mode: string;
    gate: string;
    scope: string;
  }>;
  summary: string[];
  at: number;
}
interface GatewayUserModelSnapshot {
  id: string;
  action: string;
  dimension: string;
  eventCount: number;
  beliefCount: number;
  pendingCount: number;
  confidence: number;
  summary: string;
  at: number;
}
interface GatewayPhaseAuditSnapshot {
  id: string;
  action: string;
  title: string;
  overall: string;
  pass: number;
  partial: number;
  missing: number;
  phaseCount: number;
  gapCount: number;
  evidencePassed: number;
  evidenceTotal: number;
  phases: Array<{
    id: string;
    label: string;
    status: string;
    passed: number;
    total: number;
    gapCount: number;
  }>;
  at: number;
}
interface GatewaySourceAuditSnapshot {
  id: string;
  action: string;
  status: string;
  total: number;
  nonReusable: number;
  sourceKinds: string;
  riskyLabels: string[];
  patternCount: number;
  layerCount: number;
  statePath: string;
  at: number;
}
interface GatewayGoalBootstrapSnapshot {
  id: string;
  action: string;
  objective: string;
  phaseCount: number;
  phase1TaskCount: number;
  workflowNodeCount: number;
  subagentCount: number;
  workerCount: number;
  safeSourceCount: number;
  blockedSourceCount: number;
  workflowId: string;
  kairosTaskId: string;
  statePath: string;
  at: number;
}
const TABS: Tab[] = [
  { key: "chat", label: "对话", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: "results", label: "AI结果", icon: <Bot className="h-3.5 w-3.5" /> },
];
const RESULT_TYPES: Array<{ key: "all" | "tool" | "manual"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "tool", label: "AI工具" },
  { key: "manual", label: "对话" },
];
const MAX_ASSOCIATED_FILE_CHARS = 6000;
const MAX_EDITOR_CONTEXT_CHARS = 12000;

function trimForContext(text: string, maxChars: number) {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  const headLength = Math.floor(maxChars * 0.35);
  const tailLength = maxChars - headLength;
  return `${clean.slice(0, headLength)}\n\n【中间内容过长，已自动裁剪】\n\n${clean.slice(-tailLength)}`;
}

function mergePromptTemplates(items: PromptTemplate[]) {
  const map = new Map<string, PromptTemplate>();
  items.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

export function AIChatPanel({
  workspace, onWorkspaceChange, selectedFile, customPrompts, distillations, settings, messages, onMessagesChange, aiResults, onAiResultsChange, pendingPrompt, onPendingPromptConsumed, onOpenSettings, onOpenPromptPicker, onOpenFileAssociate, onOpenDistillationPicker, onSaveHistory, onOpenHistory, onOpenPreview, onInsertToEditor, onReplaceSelectionInEditor,
}: {
  workspace: WorkspaceState; onWorkspaceChange: (u: (prev: WorkspaceState) => WorkspaceState) => void; selectedFile: WorkspaceFile | null; customPrompts: PromptTemplate[]; distillations: DistilledProfile[]; settings: ApiSettings; messages: ChatMessage[]; onMessagesChange: (n: ChatMessage[] | ((p: ChatMessage[]) => ChatMessage[])) => void; aiResults: AIResult[]; onAiResultsChange: (n: AIResult[] | ((p: AIResult[]) => AIResult[])) => void; pendingPrompt: PendingPrompt | null; onPendingPromptConsumed: () => void; onOpenSettings: () => void; onOpenPromptPicker: () => void; onOpenFileAssociate: () => void; onOpenDistillationPicker: () => void; onSaveHistory: () => void; onOpenHistory: () => void; onOpenPreview: (t: string) => void; onInsertToEditor: (t: string) => void; onReplaceSelectionInEditor: (t: string) => boolean;
}) {
  const [tab, setTab] = useState<Tab["key"]>("chat");
  const [resultType, setResultType] = useState<"all" | "tool" | "manual">("all");
  const [input, setInput] = useState("");
  const [streamText, setStreamText] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [showAgentSummary, setShowAgentSummary] = useState(false);
  const [showRuntimeDetails, setShowRuntimeDetails] = useState(false);
  const [approvalDrafts, setApprovalDrafts] = useState<ApprovalDraft[]>([]);
  const [bridgeRequests, setBridgeRequests] = useState<ExecutorBridgeRequest[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunRecord[]>([]);
  const [workflowSnapshots, setWorkflowSnapshots] = useState<GatewayWorkflowSnapshot[]>([]);
  const [kairosSnapshots, setKairosSnapshots] = useState<GatewayKairosSnapshot[]>([]);
  const [schedulerSnapshots, setSchedulerSnapshots] = useState<GatewaySchedulerSnapshot[]>([]);
  const [workerSnapshots, setWorkerSnapshots] = useState<GatewayWorkerSnapshot[]>([]);
  const [providerSnapshots, setProviderSnapshots] = useState<GatewayProviderSnapshot[]>([]);
  const [memorySnapshots, setMemorySnapshots] = useState<GatewayMemorySnapshot[]>([]);
  const [subagentSnapshots, setSubagentSnapshots] = useState<GatewaySubagentSnapshot[]>([]);
  const [skillSnapshots, setSkillSnapshots] = useState<GatewaySkillSnapshot[]>([]);
  const [sandboxSnapshots, setSandboxSnapshots] = useState<GatewaySandboxSnapshot[]>([]);
  const [userModelSnapshots, setUserModelSnapshots] = useState<GatewayUserModelSnapshot[]>([]);
  const [phaseAuditSnapshots, setPhaseAuditSnapshots] = useState<GatewayPhaseAuditSnapshot[]>([]);
  const [sourceAuditSnapshots, setSourceAuditSnapshots] = useState<GatewaySourceAuditSnapshot[]>([]);
  const [goalBootstrapSnapshots, setGoalBootstrapSnapshots] = useState<GatewayGoalBootstrapSnapshot[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const selectedPrompts = useMemo(() => {
    const merged = new Map<string, PromptTemplate>();
    prompts.forEach((p) => {
      merged.set(p.id, normalizePromptTemplate({ id: p.id, title: p.title, category: p.category, content: p.content, builtIn: true }));
    });
    customPrompts.forEach((p) => {
      merged.set(p.id, normalizePromptTemplate({ ...p, builtIn: false }));
    });
    return workspace.selectedPromptIds
      .map((id) => merged.get(id))
      .filter((p): p is PromptTemplate => Boolean(p));
  }, [customPrompts, workspace.selectedPromptIds]);

  const associatedFiles = workspace.files.filter(f => workspace.associatedFileIds.includes(f.id));
  const selectedDistillationMap = useMemo(() => new Map(distillations.map((item) => [item.id, item])), [distillations]);
  const linkedDistillationIds = useMemo(() => {
    const ids = new Set<string>();
    selectedPrompts.forEach((prompt) => {
      (prompt.linkedDistillationIds || []).forEach((id) => ids.add(id));
    });
    return ids;
  }, [selectedPrompts]);
  const selectedDistillations = useMemo(() => {
    const ids = new Set<string>(workspace.selectedDistillationIds || []);
    linkedDistillationIds.forEach((id) => ids.add(id));
    return distillations.filter((item) => ids.has(item.id));
  }, [distillations, linkedDistillationIds, workspace.selectedDistillationIds]);
  const filteredResults = useMemo(() => (resultType === "all" ? aiResults : aiResults.filter(r => r.type === resultType)), [aiResults, resultType]);
  const rawContextChars = useMemo(() => {
    const associatedLength = associatedFiles.reduce((sum, file) => sum + htmlToPlainText(file.content).length, 0);
    const editorLength = workspace.includeEditorContext ? htmlToPlainText(selectedFile?.content || "").length : 0;
    return associatedLength + editorLength;
  }, [associatedFiles, selectedFile?.content, workspace.includeEditorContext]);
  const runtimeSnapshotCount =
    agentRuns.length +
    workflowSnapshots.length +
    kairosSnapshots.length +
    schedulerSnapshots.length +
    workerSnapshots.length +
    providerSnapshots.length +
    memorySnapshots.length +
    skillSnapshots.length +
    sandboxSnapshots.length +
    phaseAuditSnapshots.length +
    sourceAuditSnapshots.length +
    goalBootstrapSnapshots.length +
    userModelSnapshots.length +
    subagentSnapshots.length;
  const pendingApprovalCount = approvalDrafts.filter((draft) => draft.status === "draft").length;
  const pendingBridgeCount = bridgeRequests.filter((request) => request.status !== "rejected" && request.status !== "completed").length;
  const hasRuntimeDetails = runtimeSnapshotCount > 0 || pendingApprovalCount > 0 || pendingBridgeCount > 0;
  const currentPlainText = useMemo(() => htmlToPlainText(selectedFile?.content || ""), [selectedFile?.content]);
  const agentPreview = useMemo(() => {
    const raw = input || "请根据当前项目状态辅助我继续创作。";
    return workspace.includeSmartContext
      ? selectAgentMemoryShards({
          files: workspace.files,
          selectedFileId: selectedFile?.id ?? null,
          associatedFileIds: workspace.associatedFileIds,
          raw,
          currentText: currentPlainText,
        })
      : { plan: planAgentIntent(raw, currentPlainText), memories: [] };
  }, [currentPlainText, input, selectedFile?.id, workspace.associatedFileIds, workspace.files, workspace.includeSmartContext]);
  const routedSkillPreview = useMemo(() => {
    const raw = input || "请根据当前项目状态辅助我继续创作。";
    return workspace.includeSmartContext
      ? selectAgentSkills({
          raw,
          currentText: currentPlainText,
          customPrompts,
          selectedPromptIds: workspace.selectedPromptIds,
        })
      : [];
  }, [currentPlainText, customPrompts, input, workspace.includeSmartContext, workspace.selectedPromptIds]);
  const personalOSPreview = useMemo(() => {
    const raw = input || "请根据当前项目状态辅助我继续创作。";
    return planPersonalOS({
      raw,
      currentText: currentPlainText,
      agentPlan: agentPreview.plan,
      memories: agentPreview.memories,
      routedSkills: routedSkillPreview,
      selectedPrompts,
      files: workspace.files,
    });
  }, [agentPreview.memories, agentPreview.plan, currentPlainText, input, routedSkillPreview, selectedPrompts, workspace.files]);
  const toolRoutePreview = useMemo(() => buildToolRouteBundle(personalOSPreview), [personalOSPreview]);
  const executorBridgePreview = useMemo(() => buildExecutorBridgeManifest({
    plan: personalOSPreview,
    tools: toolRoutePreview,
  }), [personalOSPreview, toolRoutePreview]);
  const skillAssemblyPreview = useMemo(() => {
    const raw = input || "请根据当前项目状态辅助我继续创作。";
    return assembleSkills({
      plan: personalOSPreview,
      raw,
      workspaceSkills: mergePromptTemplates([...selectedPrompts, ...routedSkillPreview.map((item) => item.prompt)]),
    });
  }, [input, personalOSPreview, routedSkillPreview, selectedPrompts]);
  const workflowDagPreview = useMemo(() => buildWorkflowDag({
    plan: personalOSPreview,
    skills: skillAssemblyPreview,
    files: workspace.files,
  }), [personalOSPreview, skillAssemblyPreview, workspace.files]);
  const agentContextPackPreview = useMemo(() => {
    const raw = input || "请根据当前项目状态辅助我继续创作。";
    return buildAgentContextPack({
      raw,
      currentText: currentPlainText,
      plan: personalOSPreview,
      agentPlan: agentPreview.plan,
      memories: agentPreview.memories,
      skills: skillAssemblyPreview,
      tools: toolRoutePreview,
      executorBridge: executorBridgePreview,
      workflow: workflowDagPreview,
    });
  }, [agentPreview.memories, agentPreview.plan, currentPlainText, executorBridgePreview, input, personalOSPreview, skillAssemblyPreview, toolRoutePreview, workflowDagPreview]);
  const swarmPlanPreview = useMemo(() => buildSwarmPlan({
    plan: personalOSPreview,
    tools: toolRoutePreview,
    skills: skillAssemblyPreview,
  }), [personalOSPreview, skillAssemblyPreview, toolRoutePreview]);
  const agentArchitecturePreview = useMemo(() => buildAgentArchitecturePlan({
    plan: personalOSPreview,
    tools: toolRoutePreview,
    skills: skillAssemblyPreview,
    swarm: swarmPlanPreview,
    workflow: workflowDagPreview,
  }), [personalOSPreview, skillAssemblyPreview, swarmPlanPreview, toolRoutePreview, workflowDagPreview]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamText]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const upsertAgentRun = (run: AgentRunRecord) => {
    setAgentRuns((prev) => [run, ...prev.filter((item) => item.id !== run.id)].slice(0, 8));
  };

  const upsertWorkflowSnapshot = (snapshot: GatewayWorkflowSnapshot) => {
    setWorkflowSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertKairosSnapshot = (snapshot: GatewayKairosSnapshot) => {
    setKairosSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertSchedulerSnapshot = (snapshot: GatewaySchedulerSnapshot) => {
    setSchedulerSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertWorkerSnapshot = (snapshot: GatewayWorkerSnapshot) => {
    setWorkerSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };
  const upsertProviderSnapshot = (snapshot: GatewayProviderSnapshot) => {
    setProviderSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertMemorySnapshot = (snapshot: GatewayMemorySnapshot) => {
    setMemorySnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertSubagentSnapshot = (snapshot: GatewaySubagentSnapshot) => {
    setSubagentSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertSkillSnapshot = (snapshot: GatewaySkillSnapshot) => {
    setSkillSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertSandboxSnapshot = (snapshot: GatewaySandboxSnapshot) => {
    setSandboxSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertUserModelSnapshot = (snapshot: GatewayUserModelSnapshot) => {
    setUserModelSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertPhaseAuditSnapshot = (snapshot: GatewayPhaseAuditSnapshot) => {
    setPhaseAuditSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertSourceAuditSnapshot = (snapshot: GatewaySourceAuditSnapshot) => {
    setSourceAuditSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const upsertGoalBootstrapSnapshot = (snapshot: GatewayGoalBootstrapSnapshot) => {
    setGoalBootstrapSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)].slice(0, 8));
  };

  const refreshGatewayRuntime = async () => {
    try {
      const healthUrl = executorBridgePreview.endpointHint.replace(/\/bridge$/, "/health");
      const res = await fetch(healthUrl);
      if (!res.ok) return;
      const data = await res.json() as Record<string, unknown>;
      const snapshot = extractGatewaySandboxSnapshot(data, "health");
      if (snapshot) upsertSandboxSnapshot(snapshot);
    } catch {
      // The Gateway is optional; absence should not interrupt normal writing.
    }
  };

  useEffect(() => {
    void refreshGatewayRuntime();
  }, [executorBridgePreview.endpointHint]);

  const normalizeGatewayWorkflow = (value: unknown, action: string, eventCount = 0): GatewayWorkflowSnapshot | null => {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const id = String(raw.id || raw.workflow_id || "").trim();
    if (!id) return null;
    return {
      id,
      name: String(raw.name || id),
      status: String(raw.status || "unknown"),
      currentNodeId: String(raw.current_node_id || raw.currentNodeId || ""),
      action,
      eventCount,
      at: Date.now(),
    };
  };

  const extractGatewaySubagentSnapshot = (data: Record<string, unknown>, action: string): GatewaySubagentSnapshot | null => {
    const swarm = data.swarm_bootstrap && typeof data.swarm_bootstrap === "object" ? data.swarm_bootstrap as Record<string, unknown> : null;
    if (swarm) {
      const evidence = swarm.evidence && typeof swarm.evidence === "object" ? swarm.evidence as Record<string, unknown> : {};
      return {
        id: `subagent-${String(swarm.swarm_id || evidence.swarm_id || action)}`,
        action,
        label: `Swarm ${String(swarm.swarm_id || evidence.swarm_id || "")}`,
        status: String(evidence.status || swarm.status || data.status || "ok"),
        activeLocks: Boolean(evidence.lock_released) ? 0 : Number(evidence.write_lock_acquired ? 1 : 0),
        conflicts: Number(evidence.write_lock_conflict_blocked ? 1 : 0),
        scope: String(evidence.write_scope || ""),
        mode: `AG ${Number(evidence.spawned_agents || 0)}/${Number(evidence.agent_count || 0)} W ${Number(evidence.workers_completed || 0)}/${Number(evidence.worker_count || 0)} V ${Number(evidence.validator_count || 0)}`,
        at: Date.now(),
      };
    }
    const agent = data.agent && typeof data.agent === "object" ? data.agent as Record<string, unknown> : null;
    const lockResult = data.lock_result && typeof data.lock_result === "object" ? data.lock_result as Record<string, unknown> : null;
    const subagents = data.subagents && typeof data.subagents === "object" ? data.subagents as Record<string, unknown> : null;
    const activeLocks = Array.isArray(lockResult?.active_locks) ? lockResult.active_locks : Array.isArray(subagents?.active_locks) ? subagents.active_locks : [];
    const conflicts = Array.isArray(lockResult?.conflicts) ? lockResult.conflicts : [];
    const lock = lockResult?.lock && typeof lockResult.lock === "object" ? lockResult.lock as Record<string, unknown> : activeLocks[0] as Record<string, unknown> | undefined;
    const firstAgent = agent || (Array.isArray(subagents?.agents) ? subagents.agents[0] as Record<string, unknown> | undefined : undefined);
    if (!agent && !lockResult && !subagents) return null;
    const id = String(firstAgent?.id || lock?.agent_id || action);
    return {
      id: `subagent-${id}`,
      action,
      label: String(firstAgent?.label || firstAgent?.name || lock?.agent_id || id),
      status: String(firstAgent?.status || lockResult?.status || data.status || "unknown"),
      activeLocks: activeLocks.length + (lockResult?.lock ? 1 : 0),
      conflicts: conflicts.length,
      scope: String(lock?.scope || ""),
      mode: String(lock?.mode || ""),
      at: Date.now(),
    };
  };

  const extractGatewayWorkflowSnapshot = (data: Record<string, unknown>, action: string): GatewayWorkflowSnapshot | null => {
    const direct = normalizeGatewayWorkflow(data.workflow, action);
    if (direct) return direct;
    const workflows = data.workflows && typeof data.workflows === "object" ? data.workflows as Record<string, unknown> : null;
    if (!workflows) return null;
    const events = Array.isArray(workflows.events) ? workflows.events.length : Array.isArray(workflows.recent_events) ? workflows.recent_events.length : 0;
    const nested = normalizeGatewayWorkflow(workflows.workflow, action, events);
    if (nested) return nested;
    const recent = Array.isArray(workflows.recent_workflows) ? workflows.recent_workflows : [];
    return normalizeGatewayWorkflow(recent[0], action, events);
  };

  const normalizeGatewayKairos = (value: unknown, action: string, eventCount = 0): GatewayKairosSnapshot | null => {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const id = String(raw.id || raw.task_id || "").trim();
    if (!id) return null;
    return {
      id,
      objective: String(raw.objective || id),
      status: String(raw.status || "unknown"),
      nextAction: String(raw.next_action || raw.nextAction || ""),
      source: String(raw.source || raw.source_workflow_id || ""),
      action,
      eventCount,
      lastTickAt: String(raw.last_tick_at || raw.lastTickAt || ""),
      at: Date.now(),
    };
  };

  const extractGatewayKairosSnapshot = (data: Record<string, unknown>, action: string): GatewayKairosSnapshot | null => {
    const evolution = data.evolution_bootstrap && typeof data.evolution_bootstrap === "object" ? data.evolution_bootstrap as Record<string, unknown> : null;
    if (evolution) {
      const evidence = evolution.evidence && typeof evolution.evidence === "object" ? evolution.evidence as Record<string, unknown> : {};
      const workflow = evolution.workflow_hook && typeof evolution.workflow_hook === "object" ? evolution.workflow_hook as Record<string, unknown> : {};
      return {
        id: String(evolution.evolution_id || evidence.evolution_id || action),
        objective: String(evolution.objective || "Phase 5 Evolution Bootstrap"),
        status: String(evidence.status || evolution.status || data.status || "ok"),
        nextAction: `Skill ${Number(evidence.skill_drafts_created || 0)} / Activated ${evidence.skill_activated ? "yes" : "no"} / Scheduler ${evidence.scheduler_draft_created ? "draft" : "missing"}`,
        source: String(workflow.workflow_id || ""),
        action,
        eventCount: Number(evidence.memory_events_created || 0),
        lastTickAt: Array.isArray(evidence.kairos_log_paths) ? String(evidence.kairos_log_paths[0] || "") : "",
        at: Date.now(),
      };
    }
    const direct = normalizeGatewayKairos(data.task, action);
    if (direct) return direct;
    const kairos = data.kairos && typeof data.kairos === "object" ? data.kairos as Record<string, unknown> : null;
    if (!kairos) return null;
    const events = Array.isArray(kairos.events) ? kairos.events.length : Array.isArray(kairos.recent_events) ? kairos.recent_events.length : 0;
    const nested = normalizeGatewayKairos(kairos.task, action, events);
    if (nested) return nested;
    const recent = Array.isArray(kairos.recent_tasks) ? kairos.recent_tasks : [];
    return normalizeGatewayKairos(recent[0], action, events);
  };

  const extractGatewaySchedulerSnapshot = (data: Record<string, unknown>, action: string): GatewaySchedulerSnapshot | null => {
    const scheduler = data.scheduler && typeof data.scheduler === "object" ? data.scheduler as Record<string, unknown> : null;
    if (!scheduler) return null;
    const status = scheduler.status && typeof scheduler.status === "object" ? scheduler.status as Record<string, unknown> : scheduler;
    const operation = scheduler.operation && typeof scheduler.operation === "object" ? scheduler.operation as Record<string, unknown> : null;
    const operationPlan = operation?.plan && typeof operation.plan === "object" ? operation.plan as Record<string, unknown> : null;
    const plan = scheduler.plan && typeof scheduler.plan === "object"
      ? scheduler.plan as Record<string, unknown>
      : operationPlan
        ? operationPlan
      : status.plan && typeof status.plan === "object"
        ? status.plan as Record<string, unknown>
        : Array.isArray(status.recent_plans)
          ? status.recent_plans[0] as Record<string, unknown> | undefined
          : undefined;
    if (!plan && !status.plan_count) return null;
    const id = String(plan?.id || action);
    return {
      id: `scheduler-${id}`,
      action,
      taskName: String(plan?.task_name || "ZhimengPersonalOSKairos"),
      status: String(plan?.status || "draft"),
      planCount: Number(status.plan_count || (plan ? 1 : 0)),
      intervalMinutes: Number(plan?.interval_minutes || 0),
      installDraftPath: String(plan?.install_draft_path || ""),
      uninstallDraftPath: String(plan?.uninstall_draft_path || ""),
      execution: String(plan?.execution || operation?.status || ""),
      returnCode: Number(operation?.returncode ?? plan?.last_returncode ?? -1),
      output: String(operation?.stdout || operation?.stderr || plan?.last_stdout || plan?.last_stderr || ""),
      at: Date.now(),
    };
  };

  const extractGatewayWorkerSnapshot = (data: Record<string, unknown>, action: string): GatewayWorkerSnapshot | null => {
    const direct = data.worker && typeof data.worker === "object" ? data.worker as Record<string, unknown> : null;
    const cancel = data.worker_cancel && typeof data.worker_cancel === "object" ? data.worker_cancel as Record<string, unknown> : null;
    const merge = data.worker_merge_proposal && typeof data.worker_merge_proposal === "object" ? data.worker_merge_proposal as Record<string, unknown> : null;
    const workers = data.workers && typeof data.workers === "object" ? data.workers as Record<string, unknown> : null;
    const job = direct || (cancel?.job && typeof cancel.job === "object" ? cancel.job as Record<string, unknown> : null) || (workers?.job && typeof workers.job === "object" ? workers.job as Record<string, unknown> : null) || (Array.isArray(workers?.recent_jobs) ? workers.recent_jobs[0] as Record<string, unknown> | undefined : undefined);
    const proposal = merge?.proposal && typeof merge.proposal === "object" ? merge.proposal as Record<string, unknown> : job?.merge_proposal && typeof job.merge_proposal === "object" ? job.merge_proposal as Record<string, unknown> : null;
    if (!job && !workers && !proposal) return null;
    const payload = job?.payload && typeof job.payload === "object" ? job.payload as Record<string, unknown> : {};
    const result = job?.result && typeof job.result === "object" ? job.result as Record<string, unknown> : {};
    const nestedResult = result.result && typeof result.result === "object" ? result.result as Record<string, unknown> : {};
    const resultProposal = result.merge_proposal && typeof result.merge_proposal === "object" ? result.merge_proposal as Record<string, unknown> : null;
    return {
      id: `worker-${String(job?.id || proposal?.job_id || action)}`,
      action,
      agentId: String(job?.agent_id || "worker"),
      status: String(job?.status || proposal?.status || data.status || "unknown"),
      jobCount: Number(workers?.job_count || (job ? 1 : 0)),
      command: String(payload.command || payload.action || payload.kind || payload.model_id || ""),
      output: String(result.output || result.stdout || result.stderr || result.message || result.reason || nestedResult.message || job?.message || proposal?.review_gate || ""),
      proposalPath: String(proposal?.proposal_path || resultProposal?.proposal_path || ""),
      processPid: Number(job?.process_pid || 0),
      hardCancelSupported: Boolean(job?.hard_cancel_supported),
      hardCancelStatus: String(job?.hard_cancel_status || ""),
      at: Date.now(),
    };
  };

  const extractGatewayProviderSnapshot = (data: Record<string, unknown>, action: string): GatewayProviderSnapshot | null => {
    const catalog = data.provider_catalog && typeof data.provider_catalog === "object" ? data.provider_catalog as Record<string, unknown> : null;
    const status = data.provider_status && typeof data.provider_status === "object" ? data.provider_status as Record<string, unknown> : null;
    const probe = data.provider_probe && typeof data.provider_probe === "object" ? data.provider_probe as Record<string, unknown> : null;
    if (!catalog && !status && !probe) return null;
    const source = probe || status || catalog || {};
    const config = source.config && typeof source.config === "object" ? source.config as Record<string, unknown> : {};
    const readiness = source.readiness && typeof source.readiness === "object" ? source.readiness as Record<string, unknown> : {};
    const wire = config.wire && typeof config.wire === "object" ? config.wire as Record<string, unknown> : {};
    const catalogInfo = status?.catalog && typeof status.catalog === "object" ? status.catalog as Record<string, unknown> : {};
    const providerRows = Array.isArray(catalog?.providers)
      ? catalog.providers
      : Array.isArray(catalogInfo.providers)
        ? catalogInfo.providers
        : [];
    const groupRows = Array.isArray(catalog?.groups)
      ? catalog.groups
      : Array.isArray(catalogInfo.groups)
        ? catalogInfo.groups
        : [];
    const providers = providerRows
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => `${String(item.label || item.id || "")}${Number(item.count || 0) ? ` ${Number(item.count || 0)}` : ""}`)
      .slice(0, 4);
    return {
      id: `provider-${String(config.id || action)}`,
      action,
      status: String(source.status || data.status || "ok"),
      presetCount: Number(catalog?.preset_count || catalogInfo.preset_count || 0),
      returned: Number(catalog?.returned || 0),
      provider: String(config.provider || ""),
      providerLabel: String(config.provider_label || config.provider || "模型服务目录"),
      apiUrl: String(config.api_url || ""),
      modelId: String(config.model_id || ""),
      keyRequired: Boolean(readiness.key_required),
      keyAvailable: Boolean(readiness.key_available),
      localEndpoint: Boolean(readiness.local_endpoint || config.local),
      remoteRequiresAllow: Boolean(readiness.remote_requires_allow_remote_model || (!config.local && config.api_url)),
      groupCount: groupRows.length,
      providers,
      modelCount: Number(probe?.model_count || 0),
      statusCode: Number(probe?.status_code || 0),
      wireKind: String(wire.kind || ""),
      at: Date.now(),
    };
  };

  const extractGatewayMemorySnapshot = (data: Record<string, unknown>, action: string): GatewayMemorySnapshot | null => {
    const event = data.memory_event && typeof data.memory_event === "object" ? data.memory_event as Record<string, unknown> : null;
    const memory = data.memory && typeof data.memory === "object" ? data.memory as Record<string, unknown> : null;
    const retrieved = data.memory_retrieve && typeof data.memory_retrieve === "object" ? data.memory_retrieve as Record<string, unknown> : null;
    const status = memory?.status && typeof memory.status === "object" ? memory.status as Record<string, unknown> : memory;
    const recentL1 = Array.isArray(status?.recent_l1) ? status.recent_l1 : [];
    const recentL2 = Array.isArray(status?.recent_l2) ? status.recent_l2 : [];
    const created = Array.isArray(memory?.created) ? memory.created : [];
    const l1Matches = Array.isArray(retrieved?.l1_matches) ? retrieved.l1_matches : [];
    const l2Matches = Array.isArray(retrieved?.l2_matches) ? retrieved.l2_matches : [];
    const contextPack = Array.isArray(retrieved?.context_pack) ? retrieved.context_pack : [];
    if (!event && !status && !created.length && !retrieved) return null;
    const latestL2 = recentL2[recentL2.length - 1] as Record<string, unknown> | undefined;
    const latestL1 = recentL1[recentL1.length - 1] as Record<string, unknown> | undefined;
    const latestMatch = (l2Matches[0] || l1Matches[0]) as Record<string, unknown> | undefined;
    const latest = event || latestL2 || latestL1 || latestMatch;
    const dimension = String(event?.dimension || latest?.dimension || "all");
    return {
      id: `memory-${action}-${dimension}`,
      action,
      dimension,
      l1Count: Number(status?.l1_count || l1Matches.length || 0),
      l2Count: Number(status?.l2_count || l2Matches.length || 0),
      pendingCount: Number(status?.pending_count || 0),
      createdCount: created.length,
      summary: String(event?.summary || latest?.summary || contextPack[0] || data.message || ""),
      at: Date.now(),
    };
  };

  const extractGatewaySkillSnapshot = (data: Record<string, unknown>, action: string): GatewaySkillSnapshot | null => {
    const bootstrap = data.skill_bootstrap && typeof data.skill_bootstrap === "object" ? data.skill_bootstrap as Record<string, unknown> : null;
    if (bootstrap) {
      const evidence = bootstrap.evidence && typeof bootstrap.evidence === "object" ? bootstrap.evidence as Record<string, unknown> : {};
      const workflowHook = bootstrap.workflow_hook && typeof bootstrap.workflow_hook === "object" ? bootstrap.workflow_hook as Record<string, unknown> : {};
      const route = bootstrap.route && typeof bootstrap.route === "object" ? bootstrap.route as Record<string, unknown> : {};
      const routeLocalLibrary = route.local_library && typeof route.local_library === "object" ? route.local_library as Record<string, unknown> : {};
      const activeLocalSkills = Array.isArray(route.active_local_skills) ? route.active_local_skills : [];
      const localRoots = Array.isArray(routeLocalLibrary.roots) ? routeLocalLibrary.roots : [];
      return {
        id: `skill-bootstrap-${String(bootstrap.domain || evidence.domain || action)}`,
        action,
        candidateId: "",
        title: `${String(bootstrap.domain || evidence.domain || "writing")} Skill Matrix`,
        status: String(evidence.status || bootstrap.status || data.status || "ok"),
        candidateCount: Number(evidence.expected_novel_skills || 0),
        activatedCount: Number(evidence.mounted_novel_skills || 0),
        createdCount: 0,
        draftPath: String(bootstrap.schema && typeof bootstrap.schema === "object" ? (bootstrap.schema as Record<string, unknown>).execution || "" : ""),
        activatedPath: "",
        domain: String(bootstrap.domain || evidence.domain || ""),
        mountedCount: Number(evidence.mounted_novel_skills || 0),
        expectedCount: Number(evidence.expected_novel_skills || 0),
        agentCount: Number(evidence.domain_agent_count || 0),
        contextItems: Number(evidence.retrieved_context_items || 0),
        commandExcluded: Boolean(evidence.excluded_command_scope),
        workflowId: String(workflowHook.workflow_id || ""),
        localSkillCount: Number(routeLocalLibrary.skill_count || activeLocalSkills.length || 0),
        localRootCount: localRoots.length,
        localSkillLabels: activeLocalSkills
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .slice(0, 3)
          .map((item) => String(item.label || item.key || "")),
        at: Date.now(),
      };
    }
    const route = data.skill_route && typeof data.skill_route === "object" ? data.skill_route as Record<string, unknown> : null;
    if (route) {
      const activeCoreSkills = Array.isArray(route.active_core_skills) ? route.active_core_skills : [];
      const activeLocalSkills = Array.isArray(route.active_local_skills) ? route.active_local_skills : [];
      const localLibrary = route.local_library && typeof route.local_library === "object" ? route.local_library as Record<string, unknown> : {};
      const localRoots = Array.isArray(localLibrary.roots) ? localLibrary.roots : [];
      return {
        id: `skill-route-${String(route.domain || action)}`,
        action,
        candidateId: "",
        title: `${String(route.domain || "global")} Skill Route`,
        status: String(data.status || "ok"),
        candidateCount: activeCoreSkills.length,
        activatedCount: Number(route.activated_skill_count || 0),
        createdCount: 0,
        draftPath: String(Array.isArray(route.excluded_tool_scopes) ? route.excluded_tool_scopes.join(" / ") : ""),
        activatedPath: "",
        domain: String(route.domain || ""),
        mountedCount: activeCoreSkills.length,
        expectedCount: 0,
        agentCount: 0,
        contextItems: Array.isArray(route.memory_banks) ? route.memory_banks.length : 0,
        commandExcluded: Array.isArray(route.excluded_tool_scopes) && route.excluded_tool_scopes.includes("run_command"),
        workflowId: "",
        localSkillCount: Number(localLibrary.skill_count || activeLocalSkills.length || 0),
        localRootCount: localRoots.length,
        localSkillLabels: activeLocalSkills
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .slice(0, 3)
          .map((item) => String(item.label || item.key || "")),
        at: Date.now(),
      };
    }
    const invocation = data.skill_invoke && typeof data.skill_invoke === "object" ? data.skill_invoke as Record<string, unknown> : null;
    if (invocation) {
      const skill = invocation.skill && typeof invocation.skill === "object" ? invocation.skill as Record<string, unknown> : {};
      const localSkill = invocation.local_skill_ref && typeof invocation.local_skill_ref === "object" ? invocation.local_skill_ref as Record<string, unknown> : null;
      const schema = invocation.schema && typeof invocation.schema === "object" ? invocation.schema as Record<string, unknown> : {};
      return {
        id: `skill-invoke-${String(schema.skill_key || skill.key || action)}`,
        action,
        candidateId: "",
        title: String(localSkill?.label || skill.label || "Skill Invoke"),
        status: String(data.status || "ok"),
        candidateCount: 1,
        activatedCount: invocation.activated_skill_ref ? 1 : 0,
        createdCount: 0,
        draftPath: String(localSkill?.relative_path || ""),
        activatedPath: "",
        domain: String(invocation.domain || ""),
        mountedCount: 1,
        expectedCount: 0,
        agentCount: 0,
        contextItems: Array.isArray(invocation.context_pack) ? invocation.context_pack.length : 0,
        commandExcluded: false,
        workflowId: "",
        localSkillCount: localSkill ? 1 : 0,
        localRootCount: localSkill ? 1 : 0,
        localSkillLabels: localSkill ? [String(localSkill.label || localSkill.key || "")] : [],
        at: Date.now(),
      };
    }
    const run = data.skill_run && typeof data.skill_run === "object" ? data.skill_run as Record<string, unknown> : null;
    if (run) {
      const candidate = run.candidate && typeof run.candidate === "object" ? run.candidate as Record<string, unknown> : {};
      const output = run.output && typeof run.output === "object" ? run.output as Record<string, unknown> : {};
      const validation = Array.isArray(run.validation) ? run.validation : [];
      return {
        id: `skill-run-${String(candidate.id || run.activated_path || action)}`,
        action,
        candidateId: String(candidate.id || ""),
        title: String(candidate.title || output.skill_title || "Activated Skill Runtime"),
        status: String(run.status || data.status || "ok"),
        candidateCount: 1,
        activatedCount: 1,
        createdCount: 0,
        draftPath: `${validation.length} runtime checks`,
        activatedPath: String(run.activated_path || ""),
        domain: "",
        mountedCount: 1,
        expectedCount: 0,
        agentCount: 0,
        contextItems: Array.isArray(output.observations) ? output.observations.length : 0,
        commandExcluded: true,
        workflowId: String(output.goal || ""),
        localSkillCount: 0,
        localRootCount: 0,
        localSkillLabels: Array.isArray(output.next_actions) ? output.next_actions.slice(0, 2).map((item) => String(item)) : [],
        at: Date.now(),
      };
    }
    const skills = data.skills && typeof data.skills === "object" ? data.skills as Record<string, unknown> : null;
    if (!skills) return null;
    const status = skills.status_snapshot && typeof skills.status_snapshot === "object"
      ? skills.status_snapshot as Record<string, unknown>
      : skills.status && typeof skills.status === "object"
        ? skills.status as Record<string, unknown>
        : skills;
    const created = Array.isArray(skills.created) ? skills.created : [];
    const activated = skills.activated && typeof skills.activated === "object" ? skills.activated as Record<string, unknown> : null;
    const review = skills.review && typeof skills.review === "object" ? skills.review as Record<string, unknown> : null;
    const reviewedCandidate = review?.candidate && typeof review.candidate === "object" ? review.candidate as Record<string, unknown> : null;
    const recent = Array.isArray(status.recent_candidates) ? status.recent_candidates : [];
    const localLibrary = status.local_library && typeof status.local_library === "object" ? status.local_library as Record<string, unknown> : {};
    const localSkills = Array.isArray(localLibrary.skills) ? localLibrary.skills : [];
    const localRoots = Array.isArray(localLibrary.roots) ? localLibrary.roots : [];
    const first = (activated || reviewedCandidate || created[0] || recent[0]) as Record<string, unknown> | undefined;
    return {
      id: `skill-${String(first?.id || action)}`,
      action,
      candidateId: String(first?.id || ""),
      title: String(first?.title || "AutoDream Skill"),
      status: String(activated?.status || review?.status || first?.status || data.status || "ok"),
      candidateCount: Number(status.candidate_count || recent.length || created.length || 0),
      activatedCount: Number(status.activated_count || (activated ? 1 : 0)),
      createdCount: created.length,
      draftPath: String(first?.draft_path || status.draft_dir || ""),
      activatedPath: String(first?.activated_path || ""),
      domain: "",
      mountedCount: 0,
      expectedCount: 0,
      agentCount: 0,
      contextItems: 0,
      commandExcluded: false,
      workflowId: "",
      localSkillCount: Number(status.local_skill_count || localLibrary.skill_count || localSkills.length || 0),
      localRootCount: localRoots.length,
      localSkillLabels: localSkills
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .slice(0, 3)
        .map((item) => String(item.label || item.key || "")),
      at: Date.now(),
    };
  };

  const extractGatewaySandboxSnapshot = (data: Record<string, unknown>, action: string): GatewaySandboxSnapshot | null => {
    const sandbox = data.sandbox && typeof data.sandbox === "object" ? data.sandbox as Record<string, unknown> : null;
    const runtime = data.runtime_capabilities && typeof data.runtime_capabilities === "object"
      ? data.runtime_capabilities as Record<string, unknown>
      : data.manifest && typeof data.manifest === "object" && (data.manifest as Record<string, unknown>).runtime_capabilities && typeof (data.manifest as Record<string, unknown>).runtime_capabilities === "object"
        ? (data.manifest as Record<string, unknown>).runtime_capabilities as Record<string, unknown>
        : {};
    if (!sandbox && !Object.keys(runtime).length) return null;
    const policy = sandbox?.policy && typeof sandbox.policy === "object" ? sandbox.policy as Record<string, unknown> : sandbox || {};
    const results = Array.isArray(sandbox?.results) ? sandbox.results : [];
    const matrix = Array.isArray(runtime.tool_matrix)
      ? runtime.tool_matrix
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .slice(0, 8)
          .map((item) => ({
            action: String(item.action || ""),
            label: String(item.label || item.action || "Tool"),
            enabled: Boolean(item.enabled),
            mode: String(item.mode || ""),
            gate: String(item.request_gate || ""),
            scope: String(item.scope || ""),
          }))
      : [];
    const capabilitySummary = runtime.capability_summary && typeof runtime.capability_summary === "object"
      ? runtime.capability_summary as Record<string, unknown>
      : {};
    return {
      id: `sandbox-${action}`,
      action,
      mode: String(policy.mode || "unknown"),
      probes: results.length,
      okCount: results.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).status === "ok").length,
      arbitraryCommands: String(policy.arbitrary_commands || "unknown"),
      executeRead: Boolean(runtime.execute_read),
      executeWrite: Boolean(runtime.execute_write),
      executeCommand: Boolean(runtime.execute_command),
      executeScheduler: Boolean(runtime.execute_scheduler),
      executeWeb: Boolean(runtime.execute_web),
      executeMcp: Boolean(runtime.execute_mcp),
      fullAccessFiles: Boolean(runtime.full_access_files),
      workspaceSandbox: Boolean(runtime.workspace_sandbox ?? true),
      matrix,
      summary: Object.entries(capabilitySummary).map(([key, value]) => `${key}: ${String(value)}`).slice(0, 8),
      at: Date.now(),
    };
  };

  const extractGatewayPhaseAuditSnapshot = (data: Record<string, unknown>, action: string): GatewayPhaseAuditSnapshot | null => {
    const audit = data.phase_audit && typeof data.phase_audit === "object" ? data.phase_audit as Record<string, unknown> : null;
    const completion = data.completion_audit && typeof data.completion_audit === "object" ? data.completion_audit as Record<string, unknown> : null;
    if (completion && !audit) {
      const summary = completion.summary && typeof completion.summary === "object" ? completion.summary as Record<string, unknown> : {};
      const rawRequirements = Array.isArray(completion.requirements) ? completion.requirements : [];
      const phases = rawRequirements
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((requirement) => ({
          id: String(requirement.id || requirement.label || ""),
          label: String(requirement.label || requirement.id || "Requirement"),
          status: String(requirement.status || "unknown"),
          passed: Number(requirement.passed || 0),
          total: Number(requirement.total || 0),
          gapCount: Array.isArray(requirement.gaps) ? requirement.gaps.length : 0,
        }));
      return {
        id: `completion-audit-${action}`,
        action,
        title: "织梦工作台总验收",
        overall: String(completion.status || "unknown"),
        pass: Number(summary.proven || 0),
        partial: Number(summary.partial || 0),
        missing: Number(summary.missing || 0),
        phaseCount: phases.length,
        gapCount: phases.reduce((sum, phase) => sum + phase.gapCount, 0),
        evidencePassed: phases.reduce((sum, phase) => sum + phase.passed, 0),
        evidenceTotal: phases.reduce((sum, phase) => sum + phase.total, 0),
        phases,
        at: Date.now(),
      };
    }
    if (!audit) return null;
    const summary = audit.summary && typeof audit.summary === "object" ? audit.summary as Record<string, unknown> : {};
    const rawPhases = Array.isArray(audit.phases) ? audit.phases : [];
    const phases = rawPhases
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((phase) => ({
        id: String(phase.id || phase.label || ""),
        label: String(phase.label || phase.id || "Phase"),
        status: String(phase.status || "unknown"),
        passed: Number(phase.passed || 0),
        total: Number(phase.total || 0),
        gapCount: Array.isArray(phase.gaps) ? phase.gaps.length : 0,
      }));
    return {
      id: `phase-audit-${action}`,
      action,
      title: "织梦 Phase 1-5",
      overall: String(audit.status || "unknown"),
      pass: Number(summary.pass || 0),
      partial: Number(summary.partial || 0),
      missing: Number(summary.missing || 0),
      phaseCount: phases.length,
      gapCount: phases.reduce((sum, phase) => sum + phase.gapCount, 0),
      evidencePassed: phases.reduce((sum, phase) => sum + phase.passed, 0),
      evidenceTotal: phases.reduce((sum, phase) => sum + phase.total, 0),
      phases,
      at: Date.now(),
    };
  };

  const extractGatewaySourceAuditSnapshot = (data: Record<string, unknown>, action: string): GatewaySourceAuditSnapshot | null => {
    const digestEnvelope = data.source_digest && typeof data.source_digest === "object" ? data.source_digest as Record<string, unknown> : null;
    const digest = digestEnvelope?.digest && typeof digestEnvelope.digest === "object" ? digestEnvelope.digest as Record<string, unknown> : null;
    const audit = data.source_audit && typeof data.source_audit === "object"
      ? data.source_audit as Record<string, unknown>
      : digestEnvelope?.audit && typeof digestEnvelope.audit === "object"
        ? digestEnvelope.audit as Record<string, unknown>
        : null;
    if (!audit) return null;
    const summary = audit.summary && typeof audit.summary === "object" ? audit.summary as Record<string, unknown> : {};
    const sources = Array.isArray(audit.sources) ? audit.sources : [];
    const counts = summary.counts && typeof summary.counts === "object" ? summary.counts as Record<string, unknown> : {};
    const sourceKinds = Object.entries(counts).map(([key, value]) => `${key}:${value}`).join(" / ");
    const patterns = Array.isArray(digest?.patterns) ? digest.patterns : [];
    const layers = Array.isArray(digest?.layers) ? digest.layers : [];
    const riskyLabels = sources
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && item.reuse_policy === "non-reusable")
      .map((item) => String(item.label || item.url || "source"))
      .slice(0, 4);
    return {
      id: `source-audit-${action}`,
      action,
      status: String(audit.status || "reviewed"),
      total: Number(summary.total || sources.length || 0),
      nonReusable: Number(summary.non_reusable || riskyLabels.length || 0),
      sourceKinds,
      riskyLabels,
      patternCount: patterns.length,
      layerCount: layers.length,
      statePath: String(digest?.state_path || ""),
      at: Date.now(),
    };
  };

  const extractGatewayGoalBootstrapSnapshot = (data: Record<string, unknown>, action: string): GatewayGoalBootstrapSnapshot | null => {
    const envelope = data.goal_bootstrap && typeof data.goal_bootstrap === "object" ? data.goal_bootstrap as Record<string, unknown> : null;
    const planner = envelope?.planner && typeof envelope.planner === "object" ? envelope.planner as Record<string, unknown> : null;
    if (!planner) return null;
    const sourceBoundary = planner.source_boundary && typeof planner.source_boundary === "object" ? planner.source_boundary as Record<string, unknown> : {};
    const registrations = planner.registrations && typeof planner.registrations === "object" ? planner.registrations as Record<string, unknown> : {};
    const workflow = registrations.workflow && typeof registrations.workflow === "object" ? registrations.workflow as Record<string, unknown> : null;
    const kairosTask = registrations.kairos_task && typeof registrations.kairos_task === "object" ? registrations.kairos_task as Record<string, unknown> : null;
    const phases = Array.isArray(planner.phases) ? planner.phases : [];
    const phase1Tree = planner.phase1_subtask_tree && typeof planner.phase1_subtask_tree === "object" ? planner.phase1_subtask_tree as Record<string, unknown> : {};
    const phase1Nodes = Array.isArray(phase1Tree.nodes) ? phase1Tree.nodes : [];
    const workflowNodes = Array.isArray(planner.workflow_nodes) ? planner.workflow_nodes : [];
    const subagents = Array.isArray(planner.subagent_specs) ? planner.subagent_specs : [];
    const workers = Array.isArray(registrations.workers) ? registrations.workers : [];
    return {
      id: `goal-bootstrap-${String(planner.id || action)}`,
      action,
      objective: String(planner.objective || ""),
      phaseCount: phases.length,
      phase1TaskCount: phase1Nodes.length,
      workflowNodeCount: workflowNodes.length,
      subagentCount: subagents.length,
      workerCount: workers.length,
      safeSourceCount: Number(sourceBoundary.safe_source_count || 0),
      blockedSourceCount: Number(sourceBoundary.blocked_source_count || 0),
      workflowId: String(workflow?.id || ""),
      kairosTaskId: String(kairosTask?.id || ""),
      statePath: String(planner.state_path || ""),
      at: Date.now(),
    };
  };

  const extractGatewayUserModelSnapshot = (data: Record<string, unknown>, action: string): GatewayUserModelSnapshot | null => {
    const event = data.user_model_event && typeof data.user_model_event === "object" ? data.user_model_event as Record<string, unknown> : null;
    const model = data.user_model && typeof data.user_model === "object" ? data.user_model as Record<string, unknown> : null;
    if (!event && !model) return null;
    const status = model?.status && typeof model.status === "object" ? model.status as Record<string, unknown> : model;
    const created = Array.isArray(model?.created) ? model.created : [];
    const recentBeliefs = Array.isArray(status?.recent_beliefs) ? status.recent_beliefs : [];
    const firstBelief = (created[0] || recentBeliefs[recentBeliefs.length - 1]) as Record<string, unknown> | undefined;
    const dimension = String(event?.dimension || firstBelief?.dimension || "preference");
    return {
      id: `user-model-${action}-${dimension}`,
      action,
      dimension,
      eventCount: Number(status?.event_count || (event ? 1 : 0)),
      beliefCount: Number(status?.belief_count || recentBeliefs.length || created.length || 0),
      pendingCount: Number(status?.pending_count || 0),
      confidence: Number(firstBelief?.confidence || event?.confidence || 0),
      summary: String(event?.summary || firstBelief?.summary || data.message || ""),
      at: Date.now(),
    };
  };

  const composePreview = (raw: string) => {
    const parts: string[] = [];
    const currentPlainText = htmlToPlainText(selectedFile?.content || "");
    const agentContext = workspace.includeSmartContext
      ? selectAgentMemoryShards({
          files: workspace.files,
          selectedFileId: selectedFile?.id ?? null,
          associatedFileIds: workspace.associatedFileIds,
          raw,
          currentText: currentPlainText,
        })
      : { plan: planAgentIntent(raw, currentPlainText), memories: [] };
    const routedSkills = workspace.includeSmartContext
      ? selectAgentSkills({
          raw,
          currentText: currentPlainText,
          customPrompts,
          selectedPromptIds: workspace.selectedPromptIds,
        })
      : [];
    const personalOSPlan = planPersonalOS({
      raw,
      currentText: currentPlainText,
      agentPlan: agentContext.plan,
      memories: agentContext.memories,
      routedSkills,
      selectedPrompts,
      files: workspace.files,
    });
    const toolBundle = buildToolRouteBundle(personalOSPlan);
    const executorBridge = buildExecutorBridgeManifest({
      plan: personalOSPlan,
      tools: toolBundle,
    });
    const skillAssembly = assembleSkills({
      plan: personalOSPlan,
      raw,
      workspaceSkills: mergePromptTemplates([...selectedPrompts, ...routedSkills.map((item) => item.prompt)]),
    });
    const swarmPlan = buildSwarmPlan({
      plan: personalOSPlan,
      tools: toolBundle,
      skills: skillAssembly,
    });
    const workflowDag = buildWorkflowDag({
      plan: personalOSPlan,
      skills: skillAssembly,
      files: workspace.files,
    });
    const agentContextPack = buildAgentContextPack({
      raw,
      currentText: currentPlainText,
      plan: personalOSPlan,
      agentPlan: agentContext.plan,
      memories: agentContext.memories,
      skills: skillAssembly,
      tools: toolBundle,
      executorBridge,
      workflow: workflowDag,
    });
    const agentArchitecture = buildAgentArchitecturePlan({
      plan: personalOSPlan,
      tools: toolBundle,
      skills: skillAssembly,
      swarm: swarmPlan,
      workflow: workflowDag,
    });
    const coordinatorMode = buildCoordinatorModePlan({
      plan: personalOSPlan,
      workflow: workflowDag,
      swarm: swarmPlan,
      skills: skillAssembly,
      executorBridge,
    });
    parts.push(renderCoordinatorModeContext(coordinatorMode));
    parts.push(renderAgentContextPack(agentContextPack));
    parts.push(renderPersonalOSContext(personalOSPlan));
    parts.push(renderAgentArchitectureContext(agentArchitecture));
    parts.push(renderToolRegistryContext(toolBundle));
    parts.push(renderExecutorBridgeContext(executorBridge));
    parts.push(renderSkillAssemblyContext(skillAssembly));
    parts.push(renderWorkflowDagContext(workflowDag));
    parts.push(renderSwarmPlanContext(swarmPlan));
    parts.push(renderCommandValidatorContext());
    parts.push(renderApprovalProtocol());
    parts.push(`【Agent计划｜先检索再执行】
意图：${agentContext.plan.intent}
上下文模式：${agentContext.plan.contextMode}
计划工具：${agentContext.plan.tools.join(" / ") || "问答"}
检索关键词：${agentContext.plan.queryTerms.slice(0, 18).join("、") || "无"}

执行规则：
1. 先使用 Agent 记忆检索结果，不要假装看过未提供的全文。
2. 需要写作时，优先遵守项目真值、动态状态、角色边界和伏笔账本。
3. 若记忆不足以完成任务，先指出缺口，再给出最小可执行方案。
4. 不要把上下文复述给用户，直接完成任务。`);
    if (selectedPrompts.length) {
      parts.push("【技能层】\n" + selectedPrompts.map((p) => {
        const meta = parseSkillMetadata(p.content || "");
        const tags = p.skillTags?.length ? p.skillTags : meta.skillTags;
        const validationLayers = p.validationLayers?.length ? p.validationLayers : meta.validationLayers;
        const linkedTitles = (p.linkedDistillationIds || []).map((id) => selectedDistillationMap.get(id)?.title).filter(Boolean) as string[];
        return `【技能：${p.title}】\n分类：${p.category}\n主技能：${p.primarySkill || meta.primarySkill || "未识别"}\n技能标签：${tags.join("、") || "未识别"}\n关联蒸馏：${linkedTitles.join("、") || "无"}\n验证层：${validationLayers.length ? validationLayers.map((layer, index) => `${index + 1}. ${layer}`).join("\n") : "未识别"}\n\n${substituteParams(p.content, {})}`;
      }).join("\n\n---\n\n"));
    }
    if (routedSkills.length) {
      parts.push("【Agent自动路由 Skill｜轻量注入】\n" + routedSkills.map(({ prompt, score, reason }) => {
        const meta = parseSkillMetadata(prompt.content || "");
        const tags = prompt.skillTags?.length ? prompt.skillTags : meta.skillTags;
        return `【路由 Skill：${prompt.title}｜score=${score}】\n分类：${prompt.category}\n主技能：${prompt.primarySkill || meta.primarySkill || "未识别"}\n技能标签：${tags.join("、") || "未识别"}\n选中原因：${reason.join("、") || "任务相关"}\n\n${trimForContext(substituteParams(prompt.content, {}), 1800)}`;
      }).join("\n\n---\n\n"));
    }
    if (selectedDistillations.length) parts.push("【小说叙事操作系统 Skill】\n" + selectedDistillations.map((profile) => {
      const tags = profile.skillTags?.length ? profile.skillTags.join("、") : "未分类";
      return `【蒸馏：${profile.title}】\n主技能：${profile.primarySkill || "未分类"}\n技能标签：${tags}\n${profile.prompt || buildDistillationPrompt(profile)}`;
    }).join("\n\n---\n\n"));
    if (agentContext.memories.length) {
      parts.push("【Agent记忆检索｜摘要切片，非全文塞入】\n" + agentContext.memories.map((memory) => {
        return `【记忆：${memory.category}｜${memory.title}｜${memory.kind}｜score=${memory.score}】\n命中原因：${memory.reason.join("、") || "相关"}\n关键词：${memory.keywords.slice(0, 16).join("、") || "无"}\n锚点：${memory.anchors.slice(0, 6).join(" / ") || "无"}\n摘要：${trimForContext(memory.summary, 900)}`;
      }).join("\n\n---\n\n"));
    }
    if (associatedFiles.length) parts.push("【用户显式关联文件｜优先级高于自动记忆】\n" + associatedFiles.map(f => `【关联｜${f.category}｜${f.title}】\n${trimForContext(htmlToPlainText(f.content), MAX_ASSOCIATED_FILE_CHARS)}`).join("\n\n"));
    if (workspace.includeEditorContext && selectedFile?.content.trim()) parts.push(`【正文】\n${trimForContext(htmlToPlainText(selectedFile.content), MAX_EDITOR_CONTEXT_CHARS)}`);
    parts.push(`【执行验证｜失败即重写】\n${DEFAULT_VALIDATION_LAYERS.map((layer, index) => `${index + 1}. ${layer}`).join("\n")}\n\n硬性规则：任一验证层不通过，不要输出失败稿；先在内部重写，再输出最终可用版本。`);
    parts.push(`【指令】\n${raw.trim()}`);
    return parts.join("\n\n");
  };

  const appendRunToMemory = (run: AgentRunRecord) => {
    const events = agentRunToAutoDreamEvents(run);
    if (!events.length) return;
    const at = Date.now();
    onWorkspaceChange((prev) => {
      const categories = Array.from(new Set(["织梦工作台", ...prev.categories.filter((category) => category !== "个人OS")]));
      const memoryIndex = prev.files.findIndex((file) => ["织梦工作台", "个人OS"].includes(file.category) && /MEMORY/i.test(file.title));
      if (memoryIndex >= 0) {
        const files = prev.files.map((file, index) => index === memoryIndex
          ? {
              ...file,
              content: appendAutoDreamMarkdown(file.content, { events, at }),
              summary: "织梦 L1/L2 记忆索引，含 AutoDream 工具观察。",
              updatedAt: at,
            }
          : file);
        return { ...prev, categories, files };
      }
      return {
        ...prev,
        categories,
        files: [
          ...prev.files,
          {
            id: uid(),
            category: "织梦工作台",
            title: "MEMORY.md",
            content: appendAutoDreamMarkdown("", { events, at }),
            summary: "织梦 L1/L2 记忆索引，含 AutoDream 工具观察。",
            updatedAt: at,
          },
        ],
      };
    });
  };

  const appendRunToKairos = (run: AgentRunRecord) => {
    if (!(run.plan.goalMode || run.plan.domain === "automation")) return;
    const at = Date.now();
    const task = createKairosTask({
      objective: run.userText,
      plan: run.plan,
      nextAction: run.plan.plannerTree[1]?.title || "检索最小必要记忆",
      at,
    });
    const logs = [
      createKairosLog(task, "created", "织梦工作台将本轮目标登记为 KAIROS 草案。", at),
      createKairosLog(task, run.status === "completed" ? "observed" : "paused", run.responsePreview || run.error || "等待下一步观察。", at),
    ];
    onWorkspaceChange((prev) => {
      const categories = Array.from(new Set(["织梦工作台", ...prev.categories.filter((category) => category !== "个人OS")]));
      const kairosIndex = prev.files.findIndex((file) => ["织梦工作台", "个人OS"].includes(file.category) && /KAIROS/i.test(file.title));
      if (kairosIndex >= 0) {
        const files = prev.files.map((file, index) => index === kairosIndex
          ? {
              ...file,
              content: appendKairosMarkdown(file.content, { task, logs, at }),
              summary: "织梦长期任务队列与 append-only 日志。",
              updatedAt: at,
            }
          : file);
        return { ...prev, categories, files };
      }
      return {
        ...prev,
        categories,
        files: [
          ...prev.files,
          {
            id: uid(),
            category: "织梦工作台",
            title: "KAIROS.md",
            content: appendKairosMarkdown("", { task, logs, at }),
            summary: "织梦长期任务队列与 append-only 日志。",
            updatedAt: at,
          },
        ],
      };
    });
  };

  const findApprovalTarget = (files: WorkspaceFile[], target: string) => {
    const normalized = target.trim().toLowerCase();
    return files.find((file) => {
      const title = file.title.toLowerCase();
      const full = `${file.category}/${file.title}`.toLowerCase();
      return file.id === target || title === normalized || full === normalized;
    });
  };

  const applyApprovalDraft = (draft: ApprovalDraft) => {
    const targetFile = findApprovalTarget(workspace.files, draft.target);
    if (!targetFile) {
      showToast(`找不到审批目标：${draft.target}`, "warning");
      return;
    }
    onWorkspaceChange((prev) => {
      const target = findApprovalTarget(prev.files, draft.target);
      if (!target) return prev;
      const nextContent = draft.before && target.content.includes(draft.before)
        ? target.content.replace(draft.before, draft.after)
        : `${target.content.trim()}\n\n${renderApprovalDraftMarkdown({ ...draft, status: "approved" })}`.trim();
      return {
        ...prev,
        files: prev.files.map((file) => file.id === target.id
          ? {
              ...file,
              content: nextContent,
              summary: file.summary || `已应用审批草案：${draft.reason.slice(0, 40)}`,
              updatedAt: Date.now(),
            }
          : file),
      };
    });
    setApprovalDrafts((prev) => prev.map((item) => item.id === draft.id ? { ...item, status: "applied" } : item));
    showToast("审批草案已应用", "success");
  };

  const rejectApprovalDraft = (id: string) => {
    setApprovalDrafts((prev) => prev.map((item) => item.id === id ? { ...item, status: "rejected" } : item));
  };

  const appendBridgeRequestToWorkspace = (request: ExecutorBridgeRequest) => {
    const at = Date.now();
    const entry = `\n\n---\n\n${renderExecutorBridgeRequestMarkdown(request)}`;
    onWorkspaceChange((prev) => {
      const categories = Array.from(new Set(["织梦工作台", ...prev.categories.filter((category) => category !== "个人OS")]));
      const bridgeIndex = prev.files.findIndex((file) => ["织梦工作台", "个人OS"].includes(file.category) && /BRIDGE/i.test(file.title));
      if (bridgeIndex >= 0) {
        const files = prev.files.map((file, index) => index === bridgeIndex
          ? {
              ...file,
              content: `${file.content.trim()}${entry}`.trim(),
              summary: "织梦本地执行器/MCP 桥配置与请求日志。",
              updatedAt: at,
            }
          : file);
        return { ...prev, categories, files };
      }
      return {
        ...prev,
        categories,
        files: [
          ...prev.files,
          {
            id: uid(),
            category: "织梦工作台",
            title: "BRIDGE.md",
            content: renderExecutorBridgeRequestMarkdown(request),
            summary: "织梦本地执行器/MCP 桥配置与请求日志。",
            updatedAt: at,
          },
        ],
      };
    });
  };

  const queueBridgeRequest = (request: ExecutorBridgeRequest) => {
    const queued = { ...request, status: "submitted" as const };
    appendBridgeRequestToWorkspace(queued);
    setBridgeRequests((prev) => prev.map((item) => item.id === request.id ? queued : item));
    showToast("执行桥请求已登记到 BRIDGE.md", "success");
  };

  const rejectBridgeRequest = (id: string) => {
    setBridgeRequests((prev) => prev.map((item) => item.id === id ? { ...item, status: "rejected" } : item));
  };

  const createWorkflowBridgeRequest = (action: Extract<ExecutorActionKind, "run" | "advance" | "status">) => {
    const payload = action === "run"
      ? workflowDagToRunPayload(workflowDagPreview)
      : action === "advance"
        ? workflowDagToAdvancePayload(workflowDagPreview)
        : { workflow_id: workflowDagPreview.id };
    const purpose = action === "run"
      ? `登记当前工作流：${workflowDagPreview.name}`
      : action === "advance"
        ? `推进当前工作流节点：${workflowDagPreview.currentNodeId}`
        : `查询工作流状态：${workflowDagPreview.id}`;
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose,
      payload,
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 DAG 执行桥请求", "info");
  };

  const createKairosBridgeRequest = () => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "kairos_task",
      purpose: `登记 KAIROS 长期观察：${workflowDagPreview.name}`,
      payload: {
        task_id: `kairos-${workflowDagPreview.id}`,
        objective: `持续跟进 ${workflowDagPreview.name}`,
        next_action: `查询 ${workflowDagPreview.id} 状态，并推进已通过验证的节点。`,
        source_workflow_id: workflowDagPreview.id,
        interval_seconds: 3600,
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 KAIROS 执行桥请求", "info");
  };

  const createKairosTickBridgeRequest = () => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "kairos_tick",
      purpose: "运行 KAIROS 观察 tick 并准备上下文建议",
      payload: {
        message: "frontend KAIROS tick",
        limit: 5,
        include_suggestions: true,
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 KAIROS Tick 执行桥请求", "info");
  };

  const createEvolutionBootstrapBridgeRequest = () => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "evolution_bootstrap",
      purpose: "验收 Phase 5 Evolution：KAIROS、scheduler 草案、AutoDream、Skill 结晶和用户模型",
      payload: {
        objective: input || currentPlainText.slice(-600) || "继续建设织梦写作台的 Agent Workbench：打通底层记忆、Skills、工具、审批和长期运行能力。",
        workflow_id: `workflow-evolution-${workflowDagPreview.id}`,
        interval_minutes: 5,
        activate_skill: true,
        persist: true,
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 Evolution 执行桥请求", "info");
  };

  const createSchedulerBridgeRequest = (action: Extract<ExecutorActionKind, "scheduler_plan" | "scheduler_install" | "scheduler_uninstall" | "scheduler_status">) => {
    const latestPlanId = schedulerSnapshots[0]?.id?.replace(/^scheduler-/, "") || `scheduler-${workflowDagPreview.id}`;
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose: action === "scheduler_plan"
        ? "生成 KAIROS Windows 计划任务安装草案"
        : action === "scheduler_install"
          ? "安装已审查的 KAIROS Windows 计划任务"
          : action === "scheduler_uninstall"
            ? "移除已登记的 KAIROS Windows 计划任务"
            : "查询 KAIROS scheduler 草案状态",
      payload: action === "scheduler_plan"
        ? {
            plan_id: `scheduler-${workflowDagPreview.id}`,
            task_name: "ZhimengPersonalOSKairos",
            interval_minutes: 5,
            launcher: "启动织梦PersonalOS网关.cmd",
          }
        : action === "scheduler_install" || action === "scheduler_uninstall"
          ? { plan_id: latestPlanId, execute: true, timeout_seconds: 20 }
          : latestPlanId ? { plan_id: latestPlanId } : {},
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 Scheduler 执行桥请求", "info");
  };

  const createWorkerBridgeRequest = (action: Extract<ExecutorActionKind, "worker_run" | "worker_status" | "worker_cancel" | "worker_merge_proposal">) => {
    const latest = workerSnapshots[0];
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose: action === "worker_run"
        ? "启动后台 Worker 工具任务"
        : action === "worker_cancel"
          ? "取消最近一个后台 Worker 任务"
          : action === "worker_merge_proposal"
            ? "把最近 Worker 输出转成可审查合并草案"
            : "查询后台任务状态",
      payload: action === "worker_run"
        ? {
            job_id: `worker-${Date.now()}`,
            agent_id: swarmPlanPreview.agents[0]?.key || "worker",
            kind: "bridge_action",
            action: "context_pack",
            payload: {
              task: input || currentPlainText.slice(-600) || "织梦 AI 工作台",
              query: input || currentPlainText.slice(-600) || "织梦 AI 工作台",
              domain: personalOSPreview.domain,
              dimension: personalOSPreview.domain === "writing" ? "skill" : personalOSPreview.domain === "coding" ? "tool" : "project",
              limit: agentContextPackPreview.budget.memoryShardLimit,
              current_text: currentPlainText.slice(-1400),
            },
          }
        : action === "worker_cancel"
          ? latest?.id ? { job_id: latest.id.replace(/^worker-/, ""), reason: "frontend cancel request" } : {}
        : action === "worker_merge_proposal"
          ? {
              job_id: latest?.id ? latest.id.replace(/^worker-/, "") : "",
              target_path: selectedFile?.title
                ? `bridge/agent-files/${selectedFile.title.replace(/[\\/:*?"<>|]/g, "_")}.worker.md`
                : "bridge/agent-files/worker-merge-proposal.md",
              mode: "replace",
            }
        : latest?.id ? { job_id: latest.id.replace(/^worker-/, "") } : {},
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 Worker 执行桥请求", "info");
  };

  const createModelWorkerBridgeRequest = () => {
    const task = input || currentPlainText.slice(-800) || "织梦模型 Worker 演练";
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "worker_run",
      purpose: "准备受控模型 Worker 任务包；默认不执行模型调用",
      payload: {
        job_id: `model-worker-${Date.now()}`,
        agent_id: swarmPlanPreview.agents[0]?.key || "model-worker",
        kind: "model_task",
        provider: settings.provider || "openai-compatible",
        api_url: settings.apiUrl,
        model_id: settings.modelId,
        api_key_env: "ZHIMENG_MODEL_API_KEY",
        prompt: task,
        domain: personalOSPreview.domain,
        query: task,
        current_text: currentPlainText.slice(-1600),
        context_limit: agentContextPackPreview.budget.memoryShardLimit,
        max_tokens: Math.min(settings.maxTokens || 1200, 1600),
        temperature: settings.temperature ?? 0.2,
        allow_remote_model: false,
        execute_model: false,
        stream_model: (settings.provider || "openai-compatible") === "openai-compatible",
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成模型 Worker 准备请求", "info");
  };

  const createProviderBridgeRequest = (action: Extract<ExecutorActionKind, "provider_catalog" | "provider_status" | "provider_probe">) => {
    const provider = settings.provider || "openai-compatible";
    const apiUrl = settings.apiUrl.trim();
    const modelId = settings.modelId.trim();
    const payload = action === "provider_catalog"
      ? {
          query: input.trim() || "",
          limit: 40,
        }
      : action === "provider_status"
        ? {
            provider,
            api_url: apiUrl,
            model_id: modelId,
            api_key_env: provider === "anthropic" ? "ANTHROPIC_API_KEY" : provider === "gemini" ? "GEMINI_API_KEY" : "ZHIMENG_MODEL_API_KEY",
          }
        : {
            provider,
            api_url: apiUrl,
            model_id: modelId,
            api_key_env: provider === "anthropic" ? "ANTHROPIC_API_KEY" : provider === "gemini" ? "GEMINI_API_KEY" : "ZHIMENG_MODEL_API_KEY",
            execute: true,
            allow_remote_model: false,
            timeout_seconds: 5,
          };
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose: action === "provider_catalog"
        ? "读取 Gateway 多模型接口预设库"
        : action === "provider_status"
          ? "检查当前模型接口配置、密钥需求和任务运行状态"
          : "受控探测当前模型接口列表端点",
      payload,
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成模型接口请求", "info");
  };

  const createMemoryBridgeRequest = (action: Extract<ExecutorActionKind, "memory_status" | "memory_retrieve" | "memory_bootstrap" | "memory_consolidate">) => {
    const memoryPayload = action === "memory_status"
      ? {}
      : action === "memory_retrieve"
        ? {
            query: input || currentPlainText.slice(-600) || "织梦 AI 工作台",
            dimension: personalOSPreview.domain === "writing" ? "project" : "tool",
            limit: 6,
          }
        : action === "memory_bootstrap"
          ? {
              goal: input || "继续建设织梦写作台的 Agent Workbench：长期记忆、Skills、工具调动、项目管理、子代理、安全闸门和 KAIROS 自治协同推进。",
              query: input || "织梦长期记忆",
              limit: 6,
            }
        : { dimension: "tool" };
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose: action === "memory_status"
        ? "查询 Gateway AutoDream 记忆状态"
        : action === "memory_retrieve"
          ? "按当前任务检索 Gateway AutoDream 记忆包"
          : action === "memory_bootstrap"
            ? "验收 Gateway AutoDream L1/L2 记忆引擎"
            : "压缩 Gateway AutoDream L1 记忆",
      payload: memoryPayload,
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 Memory 执行桥请求", "info");
  };

  const createContextPackBridgeRequest = () => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "context_pack",
      purpose: "生成 Gateway Agent Context Pack",
      payload: {
        task: input || currentPlainText.slice(-600) || "请根据当前项目状态辅助我继续创作。",
        query: agentContextPackPreview.task.raw || input || "织梦 AI 工作台",
        domain: personalOSPreview.domain,
        dimension: personalOSPreview.domain === "writing" ? "skill" : personalOSPreview.domain === "coding" ? "tool" : "project",
        limit: agentContextPackPreview.budget.memoryShardLimit,
        current_text: currentPlainText.slice(-1400),
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 Context Pack 执行桥请求", "info");
  };

  const createSkillBridgeRequest = (action: Extract<ExecutorActionKind, "skill_bootstrap" | "skill_route" | "skill_invoke" | "skill_crystallize" | "skill_review" | "skill_activate" | "skill_run" | "skill_status">) => {
    const latestSkill = skillSnapshots.find((snapshot) => snapshot.candidateId || snapshot.activatedPath || snapshot.draftPath);
    const skillPayload = action === "skill_bootstrap"
      ? {
          task: input || currentPlainText.slice(-600) || "开始构思小说世界观",
          domain: "writing",
          current_text: currentPlainText.slice(-1200),
          limit: agentContextPackPreview.budget.memoryShardLimit,
          persist: true,
          spawn_subagents: true,
        }
      : action === "skill_route"
      ? {
          task: input || currentPlainText.slice(-600) || "开始构思小说世界观",
          domain: personalOSPreview.domain,
          current_text: currentPlainText.slice(-1200),
          local_limit: 12,
        }
      : action === "skill_invoke"
      ? {
          skill_key: personalOSPreview.domain === "writing" ? "novel-creation-suite" : "personal-os-coordinator",
          task: input || currentPlainText.slice(-600) || "开始构思小说世界观",
          domain: personalOSPreview.domain,
          current_text: currentPlainText.slice(-1200),
          limit: agentContextPackPreview.budget.memoryShardLimit,
          max_skill_chars: 7000,
        }
      : action === "skill_crystallize"
      ? { dimension: "tool", limit: 3 }
      : action === "skill_run"
        ? {
            candidate_id: latestSkill?.candidateId || "",
            activated_path: latestSkill?.activatedPath || "",
            task: input || currentPlainText.slice(-600) || "运行已激活 Skill，返回结构化下一步建议。",
            context: {
              domain: personalOSPreview.domain,
              current_text: currentPlainText.slice(-1200),
            },
            execute: true,
            timeout_seconds: 5,
          }
      : action === "skill_status"
        ? { limit: 10, query: input || currentPlainText.slice(-300), domain: personalOSPreview.domain, local_limit: 16 }
        : {
            candidate_id: latestSkill?.candidateId || "",
            draft_path: latestSkill?.candidateId ? "" : latestSkill?.draftPath || "",
            reviewed_by: "frontend",
          };
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose: action === "skill_bootstrap"
        ? "验收写作领域 Skill Matrix 挂载、上下文包、工具隔离和子代理钩子"
        : action === "skill_route"
        ? "按当前任务路由 AI 工作台 / 小说 Skills"
        : action === "skill_invoke"
        ? "生成安全 Skill 调用包"
        : action === "skill_crystallize"
        ? "从 AutoDream L2 记忆结晶 Skill 草案"
        : action === "skill_review"
          ? "审查 Gateway 技能草案"
          : action === "skill_activate"
            ? "激活已审查的 Gateway 技能草案"
            : action === "skill_run"
              ? "运行已激活 Gateway 技能（需要 execute-skill 权限）"
            : "查询 Gateway 技能结晶状态",
      payload: skillPayload,
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 Skill 执行桥请求", "info");
  };

  const createLocalSkillInvokeBridgeRequest = () => {
    const skillKey = window.prompt("输入本地 Skill 名称、key 或相对路径", input.includes("skill") || input.includes("Skill") ? input.slice(0, 120) : "novel-creation-suite");
    if (!skillKey?.trim()) return;
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "skill_invoke",
      purpose: `读取并调用本地 Skill 指令：${skillKey.trim()}`,
      payload: {
        skill_key: skillKey.trim(),
        task: input || currentPlainText.slice(-600) || "按本地 Skill 协助当前项目",
        domain: personalOSPreview.domain,
        current_text: currentPlainText.slice(-1200),
        limit: agentContextPackPreview.budget.memoryShardLimit,
        max_skill_chars: 9000,
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成本地 Skill 调用请求", "info");
  };

  const createSandboxBridgeRequest = (action: Extract<ExecutorActionKind, "sandbox_probe" | "sandbox_status">) => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose: action === "sandbox_probe" ? "运行保守沙盒 allowlist 探针" : "查询沙盒执行策略",
      payload: action === "sandbox_probe" ? { probes: ["python", "node"], timeout_seconds: 5 } : {},
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 Sandbox 执行桥请求", "info");
  };

  const createFileToolBridgeRequest = (action: Extract<ExecutorActionKind, "read_file" | "write_file">, executeWrite = false, accessProfile: "workspace" | "full_access" = "workspace") => {
    const fullAccessPath = accessProfile === "full_access"
      ? window.prompt("输入完整文件路径", "C:\\Users\\30865\\Desktop\\相关\\agent-note.txt")
      : "";
    if (accessProfile === "full_access" && !fullAccessPath?.trim()) return;
    const currentPath = accessProfile === "full_access"
      ? fullAccessPath!.trim()
      : selectedFile?.title
      ? `bridge/agent-files/${selectedFile.title.replace(/[\\/:*?"<>|]/g, "_")}.txt`
      : "bridge/agent-files/agent-note.txt";
    const payload = action === "read_file"
      ? {
          path: currentPath,
          execute: true,
          access_profile: accessProfile,
        }
      : {
          path: currentPath,
          content: currentPlainText.trim()
            ? `${currentPlainText.trim()}\n`
            : `Agent workspace note\n\n${input.trim() || "织梦文件工具演练"}\n`,
          mode: "replace",
          execute: executeWrite,
          access_profile: accessProfile,
          create_dirs: true,
          backup: true,
        };
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose: action === "read_file"
        ? `读取工作区文件：${currentPath}`
        : executeWrite
          ? `写入工作区文件：${currentPath}`
          : `生成写文件审批草案：${currentPath}`,
      payload,
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast(action === "read_file" ? "已生成读文件工具请求" : "已生成写文件工具请求", "info");
  };

  const createCommandBridgeRequest = () => {
    const command = window.prompt("输入验证命令", "npx tsc --noEmit");
    if (!command?.trim()) return;
    const payload = {
      command: command.trim(),
      cwd: ".",
      execute: true,
      timeout_seconds: 30,
    };
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "run_command",
      purpose: `验证命令：${command.trim()}`,
      payload,
      commandDraft: { command: command.trim(), cwd: ".", purpose: `验证命令：${command.trim()}` },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成命令验证请求", request.validation.some((item) => item.severity === "block") ? "warning" : "info");
  };

  const createWebFetchBridgeRequest = () => {
    const url = window.prompt("输入接口或网页地址", "http://127.0.0.1:8765/health");
    if (!url?.trim()) return;
    const allowPrivate = /^https?:\/\/(127\.|localhost|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/i.test(url.trim());
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "web_fetch",
      purpose: `受控读取网页：${url.trim()}`,
      payload: {
        url: url.trim(),
        method: "GET",
        execute: true,
        allow_private_network: allowPrivate,
        timeout_seconds: 10,
        max_chars: 12000,
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成网页读取请求", "info");
  };

  const createMcpCallBridgeRequest = () => {
    const endpoint = window.prompt("输入 MCP HTTP JSON-RPC endpoint", "http://127.0.0.1:8765/mcp");
    if (!endpoint?.trim()) return;
    const method = window.prompt("输入 MCP 方法", "tools/list") || "tools/list";
    const allowPrivate = /^https?:\/\/(127\.|localhost|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/i.test(endpoint.trim());
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "mcp_call",
      purpose: `受控 MCP Call：${method.trim()} @ ${endpoint.trim()}`,
      payload: {
        endpoint: endpoint.trim(),
        method: method.trim(),
        params: {},
        execute: true,
        allow_private_network: allowPrivate,
        timeout_seconds: 10,
        max_chars: 12000,
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 MCP Call 请求", "info");
  };

  const createMcpStdioCatalogBridgeRequest = () => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "mcp_stdio_catalog",
      purpose: "读取内置 stdio MCP 注册表",
      payload: {},
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 MCP Stdio 注册表请求", "info");
  };

  const createMcpStdioCallBridgeRequest = () => {
    const serverId = window.prompt("输入内置 MCP stdio server_id", "zhimeng-local");
    if (!serverId?.trim()) return;
    const method = window.prompt("输入 MCP 方法", "tools/list") || "tools/list";
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "mcp_call",
      purpose: `受控 MCP Stdio：${method.trim()} @ ${serverId.trim()}`,
      payload: {
        transport: "stdio",
        server_id: serverId.trim(),
        method: method.trim(),
        params: {},
        execute: true,
        timeout_seconds: 10,
        max_chars: 12000,
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 MCP Stdio Call 请求", "info");
  };

  const createPhaseAuditBridgeRequest = () => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "phase_audit",
      purpose: "审计织梦 Agent Workbench Phase 1-5 完成度、证据和缺口",
      payload: {},
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成阶段审计执行桥请求", "info");
  };

  const createCompletionAuditBridgeRequest = () => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "completion_audit",
      purpose: "按 Codex / Claude Code / WorkBuddy / OpenClaw / Hermes 式 Agent 架构审计织梦工作台总完成度",
      payload: {},
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成总验收执行桥请求", "info");
  };

  const createSourceAuditBridgeRequest = () => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "source_audit",
      purpose: "审计 Codex / Claude Code / WorkBuddy / OpenClaw / Hermes 研究来源可复用边界",
      payload: {
        sources: [
          { label: "OpenAI Codex 官方文档", url: "https://developers.openai.com/codex/", source_kind: "official" },
          { label: "Anthropic Claude Code 官方文档", url: "https://code.claude.com/docs/", source_kind: "official" },
          { label: "WorkBuddy public repo", url: "https://github.com/KadenMc/work-buddy", source_kind: "open-source" },
          { label: "OpenClaw public repo", url: "https://github.com/openclaw/openclaw", source_kind: "open-source" },
          { label: "Hermes Agent public repo", url: "https://github.com/NousResearch/hermes-agent", source_kind: "open-source" },
          { label: "dnakov/claude-code leaked archive", url: "https://github.com/dnakov/claude-code", source_kind: "leaked-risk" },
          { label: "iamdin/Claude-Code-Leak leaked archive", url: "https://github.com/iamdin/Claude-Code-Leak", source_kind: "leaked-risk" },
          { label: "Kuberwastaken/claurst leaked archive", url: "https://github.com/Kuberwastaken/claurst", source_kind: "leaked-risk" },
        ],
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成来源审计执行桥请求", "info");
  };

  const createSourceDigestBridgeRequest = () => {
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "source_digest",
      purpose: "把安全来源提炼成织梦 Agent Workbench 架构吸收蓝图",
      payload: {
        persist: true,
        goal: "把 Codex / Claude Code / WorkBuddy / OpenClaw / Hermes 的公开架构模式融合进织梦 Agent Workbench。",
        sources: [
          { label: "OpenAI Codex 官方文档", url: "https://developers.openai.com/codex/", source_kind: "official" },
          { label: "Anthropic Claude Code 官方文档", url: "https://code.claude.com/docs/", source_kind: "official" },
          { label: "WorkBuddy public repo", url: "https://github.com/KadenMc/work-buddy", source_kind: "open-source" },
          { label: "OpenClaw public repo", url: "https://github.com/openclaw/openclaw", source_kind: "open-source" },
          { label: "Hermes Agent public repo", url: "https://github.com/NousResearch/hermes-agent", source_kind: "open-source" },
          { label: "dnakov/claude-code leaked archive", url: "https://github.com/dnakov/claude-code", source_kind: "leaked-risk" },
          { label: "iamdin/Claude-Code-Leak leaked archive", url: "https://github.com/iamdin/Claude-Code-Leak", source_kind: "leaked-risk" },
          { label: "Kuberwastaken/claurst leaked archive", url: "https://github.com/Kuberwastaken/claurst", source_kind: "leaked-risk" },
        ],
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 Source Digest 执行桥请求", "info");
  };

  const createGoalBootstrapBridgeRequest = () => {
    const goal = input.trim() || "继续建设织梦写作台 / Zhimeng Writing Agent：以清晰的 AI 工作台为公开入口，承载多工作区、上下文记忆、Skills、工具调动、项目管理、子代理、安全闸门和 KAIROS 长期自治。";
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action: "goal_bootstrap",
      purpose: "启动织梦目标模式，生成阶段规划树并登记 workflow/subagents/KAIROS 草案",
      payload: {
        goal,
        persist: true,
        spawn_subagents: true,
        start_workers: true,
        kairos: true,
        sources: [
          { label: "OpenAI Codex 官方文档", url: "https://developers.openai.com/codex/", source_kind: "official" },
          { label: "Anthropic Claude Code 官方文档", url: "https://docs.anthropic.com/en/docs/claude-code/overview", source_kind: "official" },
          { label: "WorkBuddy public repo", url: "https://github.com/KadenMc/work-buddy", source_kind: "open-source" },
          { label: "OpenClaw public repo", url: "https://github.com/openclaw/openclaw", source_kind: "open-source" },
          { label: "Hermes Agent public repo", url: "https://github.com/NousResearch/hermes-agent", source_kind: "open-source" },
          { label: "dnakov/claude-code leaked archive", url: "https://github.com/dnakov/claude-code", source_kind: "leaked-risk" },
          { label: "iamdin/Claude-Code-Leak leaked archive", url: "https://github.com/iamdin/Claude-Code-Leak", source_kind: "leaked-risk" },
          { label: "Kuberwastaken/claurst leaked archive", url: "https://github.com/Kuberwastaken/claurst", source_kind: "leaked-risk" },
        ],
      },
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成目标模式执行桥请求", "info");
  };

  const createUserModelBridgeRequest = (action: Extract<ExecutorActionKind, "user_model_event" | "user_model_reflect" | "user_model_status">) => {
    const payload = action === "user_model_event"
      ? {
          dimension: "preference",
          stance: "claim",
          source: "frontend",
          summary: input.trim() ? `用户本轮关注：${input.trim().slice(0, 180)}` : "用户希望织梦工作台优先做可验证的长期推进。",
          confidence: 0.6,
        }
      : action === "user_model_reflect"
        ? { dimension: "preference" }
        : { dimension: "preference" };
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose: action === "user_model_event" ? "记录 Honcho-lite 用户模型观察" : action === "user_model_reflect" ? "反思并合并用户模型观察" : "查询 Honcho-lite 用户模型状态",
      payload,
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 User Model 执行桥请求", "info");
  };

  const createSubagentBridgeRequest = (action: Extract<ExecutorActionKind, "subagent_spawn" | "lock_acquire" | "subagent_status" | "swarm_bootstrap">) => {
    const agent = swarmPlanPreview.agents[0];
    const writeLock = swarmPlanPreview.locks.find((lock) => lock.mode === "write") || swarmPlanPreview.locks[0];
    const agentId = agent?.key || "coordinator";
    const payload = action === "swarm_bootstrap"
      ? {
          task: input || currentPlainText.slice(-600) || "织梦 Phase 4 多 Agent 演练",
          scope: `workspace/${workflowDagPreview.currentNodeId || "current"}`,
          workflow_id: `workflow-swarm-${workflowDagPreview.id}`,
          persist: true,
          start_workers: true,
          release_locks: true,
        }
      : action === "subagent_spawn"
      ? {
          agent_id: agentId,
          label: agent?.label || "Coordinator",
          mode: agent?.contextMode === "isolated" ? "isolated-context" : "forked-context",
          allowed_tools: agent?.allowedTools || [],
        }
      : action === "lock_acquire"
        ? {
            agent_id: agentId,
            scope: writeLock?.scope || workflowDagPreview.currentNodeId,
            mode: "write",
          }
        : {};
    const request = createExecutorBridgeRequest({
      manifest: executorBridgePreview,
      action,
      purpose: action === "swarm_bootstrap"
        ? "验收 Phase 4 Swarm：子代理、写锁冲突、allowlist worker 与安全闸门"
        : action === "subagent_spawn" ? `登记子代理：${agent?.label || agentId}` : action === "lock_acquire" ? `申请写锁：${writeLock?.scope || workflowDagPreview.currentNodeId}` : "查询子代理与锁状态",
      payload,
    });
    setBridgeRequests((prev) => [request, ...prev].slice(0, 10));
    showToast("已生成 Subagent 执行桥请求", "info");
  };

  const submitBridgeRequest = async (request: ExecutorBridgeRequest) => {
    try {
      const res = await fetch(executorBridgePreview.endpointHint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          action: request.action,
          purpose: request.purpose,
          execute: Boolean(request.payload.execute),
          payload: request.payload,
        }),
      });
      if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
      const data = await res.json() as Record<string, unknown>;
      const nextStatus: ExecutorBridgeRequestStatus = data.status === "blocked" ? "blocked" : data.status === "ok" ? "completed" : "submitted";
      const next = { ...request, status: nextStatus, lastResult: data };
      setBridgeRequests((prev) => prev.map((item) => item.id === request.id ? next : item));
      const workflowSnapshot = extractGatewayWorkflowSnapshot(data, request.action);
      if (workflowSnapshot) upsertWorkflowSnapshot(workflowSnapshot);
      const kairosSnapshot = extractGatewayKairosSnapshot(data, request.action);
      if (kairosSnapshot) upsertKairosSnapshot(kairosSnapshot);
      const schedulerSnapshot = extractGatewaySchedulerSnapshot(data, request.action);
      if (schedulerSnapshot) upsertSchedulerSnapshot(schedulerSnapshot);
      const workerSnapshot = extractGatewayWorkerSnapshot(data, request.action);
      if (workerSnapshot) upsertWorkerSnapshot(workerSnapshot);
      const providerSnapshot = extractGatewayProviderSnapshot(data, request.action);
      if (providerSnapshot) upsertProviderSnapshot(providerSnapshot);
      const memorySnapshot = extractGatewayMemorySnapshot(data, request.action);
      if (memorySnapshot) upsertMemorySnapshot(memorySnapshot);
      const skillSnapshot = extractGatewaySkillSnapshot(data, request.action);
      if (skillSnapshot) upsertSkillSnapshot(skillSnapshot);
      const sandboxSnapshot = extractGatewaySandboxSnapshot(data, request.action);
      if (sandboxSnapshot) upsertSandboxSnapshot(sandboxSnapshot);
      const phaseAuditSnapshot = extractGatewayPhaseAuditSnapshot(data, request.action);
      if (phaseAuditSnapshot) upsertPhaseAuditSnapshot(phaseAuditSnapshot);
      const sourceAuditSnapshot = extractGatewaySourceAuditSnapshot(data, request.action);
      if (sourceAuditSnapshot) upsertSourceAuditSnapshot(sourceAuditSnapshot);
      const goalBootstrapSnapshot = extractGatewayGoalBootstrapSnapshot(data, request.action);
      if (goalBootstrapSnapshot) upsertGoalBootstrapSnapshot(goalBootstrapSnapshot);
      const userModelSnapshot = extractGatewayUserModelSnapshot(data, request.action);
      if (userModelSnapshot) upsertUserModelSnapshot(userModelSnapshot);
      const subagentSnapshot = extractGatewaySubagentSnapshot(data, request.action);
      if (subagentSnapshot) upsertSubagentSnapshot(subagentSnapshot);
      appendBridgeRequestToWorkspace(next);
      const resultText = renderBridgeResultForChat(request, data, nextStatus);
      onMessagesChange((prev) => [...prev, { role: "assistant", content: resultText }]);
      onAiResultsChange((prev) => [{
        id: uid(),
        title: `工具结果：${request.action}`,
        source: "执行桥",
        content: resultText,
        createdAt: Date.now(),
        type: "tool",
      } as AIResult, ...prev]);
      showToast("本地 Gateway 已返回结果", nextStatus === "blocked" ? "warning" : "success");
      return { request: next, data, status: nextStatus, text: resultText };
    } catch (error) {
      const message = error instanceof Error ? error.message : "本地 Gateway 未连接";
      showToast(`无法连接执行桥：${message}`, "warning", 5000);
      return null;
    }
  };

  const runOneShotToolFollowup = async (params: {
    userText: string;
    toolRequests: ExecutorBridgeRequest[];
    controller: AbortController;
  }) => {
    if (!params.toolRequests.length) return "";
    const toolResults = (await Promise.all(params.toolRequests.map((request) => submitBridgeRequest(request))))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!toolResults.length) return "";
    const followupPrompt = buildOneShotToolFollowupPrompt({
      userText: params.userText,
      toolResultTexts: toolResults.map((item) => item.text),
    });
    const followup = await sendChat(
      settings,
      [{ role: "user", content: followupPrompt }],
      (t) => setStreamText(stripAgentProtocolForChatDisplay(t, "AI 正在根据工具结果继续...")),
      params.controller.signal,
    );
    const displayFollowup = stripAgentProtocolForChatDisplay(followup, "AI 已读取工具结果。");
    onMessagesChange((prev) => [...prev, { role: "assistant", content: displayFollowup }]);
    onAiResultsChange((prev) => [{
      id: uid(),
      title: `续答：${params.userText.slice(0, 15)}`,
      source: "工具续答",
      content: displayFollowup,
      createdAt: Date.now(),
      type: "manual",
    } as AIResult, ...prev]);
    return displayFollowup;
  };

  const sendCore = async (raw: string, opts: Partial<PendingPrompt> = {}) => {
    if (!isConfigured(settings)) { onOpenSettings(); return; }
    if (!raw.trim() || loading) return;
    const userText = raw.trim();
    if (raw === input) setInput("");
    onMessagesChange(p => [...p, { role: "user", content: userText }]);
    const runAgentContext = workspace.includeSmartContext
      ? selectAgentMemoryShards({
          files: workspace.files,
          selectedFileId: selectedFile?.id ?? null,
          associatedFileIds: workspace.associatedFileIds,
          raw,
          currentText: currentPlainText,
        })
      : { plan: planAgentIntent(raw, currentPlainText), memories: [] };
    const runRoutedSkills = workspace.includeSmartContext
      ? selectAgentSkills({
          raw,
          currentText: currentPlainText,
          customPrompts,
          selectedPromptIds: workspace.selectedPromptIds,
        })
      : [];
    const runPersonalOSPlan = planPersonalOS({
      raw,
      currentText: currentPlainText,
      agentPlan: runAgentContext.plan,
      memories: runAgentContext.memories,
      routedSkills: runRoutedSkills,
      selectedPrompts,
      files: workspace.files,
    });
    const runToolBundle = buildToolRouteBundle(runPersonalOSPlan);
    const runExecutorBridge = buildExecutorBridgeManifest({
      plan: runPersonalOSPlan,
      tools: runToolBundle,
    });
    const agentRun = createAgentRun({
      userText,
      selectedFileTitle: selectedFile?.title,
      plan: runPersonalOSPlan,
      memories: runAgentContext.memories,
      routedSkills: runRoutedSkills,
    });
    upsertAgentRun(agentRun);
    const payload = composePreview(raw);
    setLoading(true); setStreamText("");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const res = await sendChat(settings, [{ role: "user", content: payload }], (t) => setStreamText(stripAgentProtocolForChatDisplay(t, "AI 正在处理...")), controller.signal);
      const displayRes = stripAgentProtocolForChatDisplay(res, "AI 暂无可显示内容。");
      onMessagesChange(p => [...p, { role: "assistant", content: displayRes }]);
      onAiResultsChange(p => [{ id: uid(), title: opts.resultTitle || userText.slice(0, 15), source: opts.replaceMode ? "改写" : "指令", content: displayRes, createdAt: Date.now(), type: opts.forResult ? "tool" : "manual" } as AIResult, ...p]);
      const drafts = extractApprovalDraftsFromText(res);
      if (drafts.length) setApprovalDrafts((prev) => [...drafts, ...prev].slice(0, 10));
      const bridgeDrafts = extractExecutorBridgeRequestsFromText(res, runExecutorBridge);
      if (bridgeDrafts.length) {
        setBridgeRequests((prev) => [...bridgeDrafts, ...prev].slice(0, 10));
        const autoSubmitRequests = bridgeDrafts.filter(canAutoSubmitBridgeRequest);
        showToast(autoSubmitRequests.length ? `收到 ${bridgeDrafts.length} 个执行桥请求，自动提交 ${autoSubmitRequests.length} 个只读请求` : `收到 ${bridgeDrafts.length} 个执行桥请求`, "info");
        const followupRes = await runOneShotToolFollowup({ userText, toolRequests: autoSubmitRequests, controller });
        if (followupRes) {
          const completedRun = completeAgentRun(agentRun, followupRes);
          upsertAgentRun(completedRun);
          appendRunToMemory(completedRun);
          appendRunToKairos(completedRun);
          if (opts.replaceMode) onReplaceSelectionInEditor(followupRes);
          return;
        }
      }
      const completedRun = completeAgentRun(agentRun, displayRes);
      upsertAgentRun(completedRun);
      appendRunToMemory(completedRun);
      appendRunToKairos(completedRun);
      if (opts.replaceMode) onReplaceSelectionInEditor(displayRes);
    } catch (e) {
      if (controller.signal.aborted) {
        const abortedRun = failAgentRun(agentRun, "用户停止生成", "aborted");
        upsertAgentRun(abortedRun);
        appendRunToMemory(abortedRun);
        appendRunToKairos(abortedRun);
        onMessagesChange(p => [...p, { role: "assistant", content: "已停止生成。" }]);
        return;
      }
      const message = e instanceof Error ? e.message : "AI 请求失败";
      console.error(e);
      const failedRun = failAgentRun(agentRun, message);
      upsertAgentRun(failedRun);
      appendRunToMemory(failedRun);
      appendRunToKairos(failedRun);
      onMessagesChange(p => [...p, { role: "assistant", content: `请求失败：${message}` }]);
      showToast(message, "error", 5000);
    } finally { setLoading(false); abortRef.current = null; }
  };

  useEffect(() => {
    if (pendingPrompt && !loading) {
      if (pendingPrompt.forResult) setTab("results");
      sendCore(pendingPrompt.text, pendingPrompt);
      onPendingPromptConsumed();
    }
  }, [pendingPrompt]);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-slate-900 border-l border-slate-800">
      <div className="flex border-b border-slate-800 p-2 shrink-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${tab === t.key ? "bg-purple-600/20 text-purple-300" : "text-slate-400 hover:bg-slate-800"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {tab === "chat" ? (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-200"}`}>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{stripAgentProtocolForChatDisplay(m.content, "AI 暂无可显示内容。")}</pre>
              </div>
            </div>
          ))
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2"><Filter className="h-3 w-3 text-slate-500"/>{RESULT_TYPES.map(t => <button key={t.key} onClick={() => setResultType(t.key)} className={`rounded-lg px-2.5 py-1 text-[10px] ${resultType === t.key ? "bg-purple-600/30 text-purple-300 ring-1 ring-purple-500/30" : "bg-slate-800 text-slate-500"}`}>{t.label}</button>)}</div>
            {filteredResults.map(r => (
              <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2 group">
                <div className="text-xs font-bold text-white flex justify-between"><span>{r.title}</span><button onClick={() => onAiResultsChange(p => p.filter(x => x.id !== r.id))} className="text-slate-600 hover:text-red-400"><X className="h-3 w-3"/></button></div>
                <pre className="text-[10px] text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto bg-slate-900/50 p-2 rounded-lg leading-relaxed">{r.content}</pre>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => onInsertToEditor(r.content)} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-indigo-400 hover:bg-slate-700">插入正文</button>
                  <CopyButton text={r.content} />
                  <button
                    onClick={() => {
                      const title = window.prompt("保存到知识库，文件名称：", r.title);
                      if (!title) return;
                      onWorkspaceChange((prev) => ({
                        ...prev,
                        files: [
                          ...prev.files,
                          {
                            id: uid(),
                            category: "知识库",
                            title: title.trim(),
                            content: r.content,
                            summary: r.source + " · " + new Date(r.createdAt).toLocaleString(),
                            updatedAt: Date.now(),
                          },
                        ],
                      }));
                      showToast("已保存到左侧文件树「知识库」分类", "success");
                    }}
                    className="text-[10px] bg-emerald-500/10 px-2 py-1 rounded text-emerald-400 hover:bg-emerald-500/20"
                  >
                    📁 存入知识库
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {(loading || streamText) && (
          <div className="flex items-start gap-2 rounded-xl bg-slate-950/40 px-2 py-2 text-xs text-slate-500">
            {loading && <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />}
            <div className="min-w-0 flex-1 whitespace-pre-wrap leading-relaxed">{streamText || "AI正在构思中..."}</div>
            {loading && (
              <button onClick={() => abortRef.current?.abort()} className="flex shrink-0 items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20">
                <Square className="h-3 w-3" /> 停止
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {tab === "chat" && (
          <div className="shrink-0 border-t border-slate-800 p-3 space-y-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-slate-500">
              <button
                type="button"
                onClick={() => setShowAgentSummary((prev) => !prev)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-slate-200"
              >
                <Brain className="h-3 w-3 shrink-0" />
                <span className="truncate">AI 工作台</span>
                <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">域 {personalOSPreview.domain}</span>
                <span className={toolRoutePreview.approvalRequired ? "shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300" : "shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300"}>工具 {toolRoutePreview.tools.length}</span>
                <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">上下文 {agentContextPackPreview.budget.mode}</span>
                <span className="shrink-0 text-slate-600">{showAgentSummary ? "收起" : "展开"}</span>
              </button>
              <button onClick={() => onOpenPreview(composePreview(input || "请根据以上上下文继续辅助创作。"))} className="shrink-0 text-slate-400 hover:text-white">预览</button>
            </div>
            {showAgentSummary && (
              <>
                <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                  <span className={agentPreview.memories.length ? "text-cyan-300" : "text-slate-500"}>记忆 {agentPreview.memories.length}</span>
                  <span className={routedSkillPreview.length ? "text-purple-300" : "text-slate-500"}>路由 {routedSkillPreview.length}</span>
                  <span className={executorBridgePreview.mode === "dry-run" ? "text-emerald-300" : "text-amber-300"}>执行桥 {executorBridgePreview.mode}</span>
                  <span className={bridgeRequests.some((request) => request.status === "draft") ? "text-blue-300" : "text-slate-500"}>桥请求 {bridgeRequests.filter((request) => request.status === "draft").length}</span>
                  <span className="text-cyan-300">流程 {workflowDagPreview.nodes.length}</span>
                  <span className={agentRuns.length ? "text-emerald-300" : "text-slate-500"}>运行 {agentRuns.length}</span>
                  <span className={workflowSnapshots.length ? "text-cyan-300" : "text-slate-500"}>流程 {workflowSnapshots.length}</span>
                  <span className={kairosSnapshots.length ? "text-fuchsia-300" : "text-slate-500"}>观察 {kairosSnapshots.length}</span>
                  <span className={schedulerSnapshots.length ? "text-orange-300" : "text-slate-500"}>定时 {schedulerSnapshots.length}</span>
                  <span className={workerSnapshots.length ? "text-sky-300" : "text-slate-500"}>任务 {workerSnapshots.length}</span>
                  <span className={providerSnapshots.length ? "text-indigo-300" : "text-slate-500"}>接口 {providerSnapshots.length}</span>
                  <span className={memorySnapshots.length ? "text-emerald-300" : "text-slate-500"}>记忆 {memorySnapshots.length}</span>
                  <span className={skillSnapshots.length ? "text-purple-300" : "text-slate-500"}>技能 {skillSnapshots.length}</span>
                  <span className={sandboxSnapshots.length ? "text-amber-300" : "text-slate-500"}>沙盒 {sandboxSnapshots.length}</span>
                  <span className={phaseAuditSnapshots.length ? "text-lime-300" : "text-slate-500"}>阶段 {phaseAuditSnapshots.length}</span>
                  <span className={userModelSnapshots.length ? "text-pink-300" : "text-slate-500"}>画像 {userModelSnapshots.length}</span>
                  <span className={subagentSnapshots.length ? "text-blue-300" : "text-slate-500"}>AG {subagentSnapshots.length}</span>
                  <span className="text-indigo-300">架构 {agentArchitecturePreview.sources.length}</span>
                  <span className={skillAssemblyPreview.activeCoreSkills.length ? "text-fuchsia-300" : "text-slate-500"}>核心能力 {skillAssemblyPreview.activeCoreSkills.length}</span>
                  <span className={swarmPlanPreview.conflicts.length ? "text-red-300" : "text-blue-300"}>子代理 {swarmPlanPreview.agents.length}</span>
                  <span className={rawContextChars > MAX_EDITOR_CONTEXT_CHARS ? "text-amber-300" : "text-slate-500"}>{Math.round(rawContextChars / 1000)}k</span>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded-lg bg-slate-800 px-2 py-1 text-slate-400">阶段 {personalOSPreview.phase}</span>
                  <span className={personalOSPreview.risk === "high" ? "rounded-lg bg-red-500/10 px-2 py-1 text-red-300" : personalOSPreview.risk === "medium" ? "rounded-lg bg-amber-500/10 px-2 py-1 text-amber-300" : "rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-300"}>
                    风险 {personalOSPreview.risk}
                  </span>
                  <span className="rounded-lg bg-slate-800 px-2 py-1 text-slate-400">意图 {agentPreview.plan.intent}</span>
                  <span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-cyan-300">队列 {agentContextPackPreview.bridgeQueue.length}</span>
                  <span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-cyan-300">长期记忆</span>
                  <span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-cyan-300">当前步骤 {workflowDagPreview.currentNodeId}</span>
                  <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-amber-300">7层防线 {toolRoutePreview.safetyLayers.length}</span>
                  <span className="rounded-lg bg-red-500/10 px-2 py-1 text-red-300">命令验证 {COMMAND_VALIDATORS.length}</span>
                  <span className="rounded-lg bg-blue-500/10 px-2 py-1 text-blue-300">写锁 {swarmPlanPreview.locks.filter((lock) => lock.mode === "write").length}</span>
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-300">本地工具桥</span>
                  <span className="rounded-lg bg-indigo-500/10 px-2 py-1 text-indigo-300">模型中枢</span>
                  <span className="rounded-lg bg-purple-500/10 px-2 py-1 text-purple-300">审批协议</span>
                  <span className="rounded-lg bg-indigo-500/10 px-2 py-1 text-indigo-300">架构镜像 {agentArchitecturePreview.layers.filter((layer) => layer.status === "absorbed").length}/{agentArchitecturePreview.layers.length}</span>
                  {(personalOSPreview.goalMode || personalOSPreview.domain === "automation") && (
                    <span className="rounded-lg bg-fuchsia-500/10 px-2 py-1 text-fuchsia-300">长期观察草案</span>
                  )}
                  {agentArchitecturePreview.sources.slice(0, 3).map((source) => (
                    <span key={source.key} className="rounded-lg bg-indigo-500/10 px-2 py-1 text-indigo-300">
                      {source.label}
                    </span>
                  ))}
                  {personalOSPreview.tools.slice(0, 3).map((tool) => (
                    <span key={tool.key} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-300">
                      <Wrench className="h-3 w-3" /> {tool.label}
                    </span>
                  ))}
                  {personalOSPreview.subagents.slice(0, 2).map((agent) => (
                    <span key={agent.key} className="rounded-lg bg-blue-500/10 px-2 py-1 text-blue-300">
                      {agent.label}
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button onClick={onOpenPromptPicker} className="rounded-lg bg-purple-500/10 px-2 py-1 text-[10px] text-purple-300 hover:bg-purple-500/20">
                能力 {selectedPrompts.length}
              </button>
              <button
                onClick={() => onWorkspaceChange(prev => ({ ...prev, includeSmartContext: !(prev.includeSmartContext ?? true) }))}
                className={`rounded-lg px-2 py-1 text-[10px] ${(workspace.includeSmartContext ?? true) ? "bg-cyan-500/10 text-cyan-300" : "bg-slate-800 text-slate-500"}`}
              >
                智能记忆 {(workspace.includeSmartContext ?? true) ? "开" : "关"}
              </button>
              <button onClick={onOpenFileAssociate} className="rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-500/20">
                关联文件 {associatedFiles.length}
              </button>
              <button onClick={onOpenDistillationPicker} className="rounded-lg bg-fuchsia-500/10 px-2 py-1 text-[10px] text-fuchsia-300 hover:bg-fuchsia-500/20">
                蒸馏 {selectedDistillations.length}
              </button>
              <button
                onClick={() => onWorkspaceChange(prev => ({ ...prev, includeEditorContext: !prev.includeEditorContext }))}
                className={`rounded-lg px-2 py-1 text-[10px] ${workspace.includeEditorContext ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-500"}`}
              >
                当前正文 {workspace.includeEditorContext ? "开" : "关"}
              </button>
              <button onClick={createContextPackBridgeRequest} className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/20">
                生成上下文
              </button>
              <button onClick={() => createFileToolBridgeRequest("read_file")} className="rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-500/20">
                读文件
              </button>
              <button onClick={onSaveHistory} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700">保存对话</button>
              <button onClick={onOpenHistory} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700">历史</button>
              <button
                onClick={() => setShowAdvancedTools((prev) => !prev)}
                className={`rounded-lg px-2 py-1 text-[10px] ${showAdvancedTools ? "bg-indigo-500/20 text-indigo-200" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}
              >
                更多工具
              </button>
            </div>
            {showAdvancedTools && (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-800 pt-2">
                <button onClick={() => createWorkflowBridgeRequest("run")} className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/20">登记流程</button>
                <button onClick={() => createWorkflowBridgeRequest("advance")} className="rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-500/20">推进流程</button>
                <button onClick={() => createWorkflowBridgeRequest("status")} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700">桥状态</button>
                <button onClick={createKairosBridgeRequest} className="rounded-lg bg-fuchsia-500/10 px-2 py-1 text-[10px] text-fuchsia-300 hover:bg-fuchsia-500/20">登记观察</button>
                <button onClick={createKairosTickBridgeRequest} className="rounded-lg bg-fuchsia-500/10 px-2 py-1 text-[10px] text-fuchsia-300 hover:bg-fuchsia-500/20">运行观察</button>
                <button onClick={createEvolutionBootstrapBridgeRequest} className="rounded-lg bg-pink-500/10 px-2 py-1 text-[10px] text-pink-300 hover:bg-pink-500/20">进化验收</button>
                <button onClick={() => createSchedulerBridgeRequest("scheduler_plan")} className="rounded-lg bg-orange-500/10 px-2 py-1 text-[10px] text-orange-300 hover:bg-orange-500/20">计划定时</button>
                <button onClick={() => createSchedulerBridgeRequest("scheduler_install")} className="rounded-lg bg-orange-500/10 px-2 py-1 text-[10px] text-orange-300 hover:bg-orange-500/20">安装定时</button>
                <button onClick={() => createSchedulerBridgeRequest("scheduler_uninstall")} className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20">移除定时</button>
                <button onClick={() => createSchedulerBridgeRequest("scheduler_status")} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700">定时状态</button>
                <button onClick={() => createWorkerBridgeRequest("worker_run")} className="rounded-lg bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 hover:bg-sky-500/20">跑任务</button>
                <button onClick={() => createWorkerBridgeRequest("worker_status")} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700">任务状态</button>
                <button onClick={() => createWorkerBridgeRequest("worker_merge_proposal")} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/20">合并草案</button>
                <button onClick={() => createWorkerBridgeRequest("worker_cancel")} className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20">取消任务</button>
                <button onClick={createModelWorkerBridgeRequest} className="rounded-lg bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-300 hover:bg-indigo-500/20">模型任务</button>
                <button onClick={() => createProviderBridgeRequest("provider_catalog")} className="rounded-lg bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-300 hover:bg-indigo-500/20">模型目录</button>
                <button onClick={() => createProviderBridgeRequest("provider_status")} className="rounded-lg bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-300 hover:bg-indigo-500/20">模型状态</button>
                <button onClick={() => createProviderBridgeRequest("provider_probe")} className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20">模型探针</button>
                <button onClick={() => createMemoryBridgeRequest("memory_status")} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/20">记忆状态</button>
                <button onClick={() => createMemoryBridgeRequest("memory_retrieve")} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/20">检索记忆</button>
                <button onClick={() => createMemoryBridgeRequest("memory_bootstrap")} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/20">记忆验收</button>
                <button onClick={() => createMemoryBridgeRequest("memory_consolidate")} className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20">压缩记忆</button>
                <button onClick={() => createSkillBridgeRequest("skill_route")} className="rounded-lg bg-purple-500/10 px-2 py-1 text-[10px] text-purple-300 hover:bg-purple-500/20">路由技能</button>
                <button onClick={() => createSkillBridgeRequest("skill_invoke")} className="rounded-lg bg-fuchsia-500/10 px-2 py-1 text-[10px] text-fuchsia-300 hover:bg-fuchsia-500/20">调用技能</button>
                <button onClick={createLocalSkillInvokeBridgeRequest} className="rounded-lg bg-fuchsia-500/10 px-2 py-1 text-[10px] text-fuchsia-300 hover:bg-fuchsia-500/20">本地能力</button>
                <button onClick={() => createSkillBridgeRequest("skill_bootstrap")} className="rounded-lg bg-violet-500/10 px-2 py-1 text-[10px] text-violet-300 hover:bg-violet-500/20">技能验收</button>
                <button onClick={() => createSkillBridgeRequest("skill_crystallize")} className="rounded-lg bg-purple-500/10 px-2 py-1 text-[10px] text-purple-300 hover:bg-purple-500/20">技能结晶</button>
                <button onClick={() => createSkillBridgeRequest("skill_status")} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700">技能状态</button>
                <button onClick={() => createSkillBridgeRequest("skill_review")} className="rounded-lg bg-purple-500/10 px-2 py-1 text-[10px] text-purple-300 hover:bg-purple-500/20">审查技能</button>
                <button onClick={() => createSkillBridgeRequest("skill_activate")} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/20">激活技能</button>
                <button onClick={() => createSkillBridgeRequest("skill_run")} className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/20">运行技能</button>
                <button onClick={createWebFetchBridgeRequest} className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/20">读取网页</button>
                <button onClick={createMcpCallBridgeRequest} className="rounded-lg bg-violet-500/10 px-2 py-1 text-[10px] text-violet-300 hover:bg-violet-500/20">工具调用</button>
                <button onClick={createMcpStdioCatalogBridgeRequest} className="rounded-lg bg-violet-500/10 px-2 py-1 text-[10px] text-violet-300 hover:bg-violet-500/20">工具目录</button>
                <button onClick={createMcpStdioCallBridgeRequest} className="rounded-lg bg-violet-500/10 px-2 py-1 text-[10px] text-violet-300 hover:bg-violet-500/20">本地工具</button>
                <button onClick={() => createFileToolBridgeRequest("write_file", false)} className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20">写草案</button>
                <button onClick={() => createFileToolBridgeRequest("write_file", true)} className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20">工作区写入</button>
                <button onClick={() => createFileToolBridgeRequest("read_file", false, "full_access")} className="rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-500/20">完全读</button>
                <button onClick={() => createFileToolBridgeRequest("write_file", true, "full_access")} className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20">完全写入</button>
                <button onClick={createCommandBridgeRequest} className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20">验证命令</button>
                <button onClick={() => createSandboxBridgeRequest("sandbox_probe")} className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20">沙盒探针</button>
                <button onClick={() => createSandboxBridgeRequest("sandbox_status")} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700">沙盒状态</button>
                <button onClick={createPhaseAuditBridgeRequest} className="rounded-lg bg-lime-500/10 px-2 py-1 text-[10px] text-lime-300 hover:bg-lime-500/20">阶段审计</button>
                <button onClick={createCompletionAuditBridgeRequest} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/20">总验收</button>
                <button onClick={createSourceAuditBridgeRequest} className="rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/20">来源审计</button>
                <button onClick={createSourceDigestBridgeRequest} className="rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/20">吸收蓝图</button>
                <button onClick={createGoalBootstrapBridgeRequest} className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/20">目标模式</button>
                <button onClick={() => createUserModelBridgeRequest("user_model_event")} className="rounded-lg bg-pink-500/10 px-2 py-1 text-[10px] text-pink-300 hover:bg-pink-500/20">用户建模</button>
                <button onClick={() => createUserModelBridgeRequest("user_model_reflect")} className="rounded-lg bg-pink-500/10 px-2 py-1 text-[10px] text-pink-300 hover:bg-pink-500/20">模型反思</button>
                <button onClick={() => createUserModelBridgeRequest("user_model_status")} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700">用户模型</button>
                <button onClick={() => createSubagentBridgeRequest("subagent_spawn")} className="rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-500/20">登记代理</button>
                <button onClick={() => createSubagentBridgeRequest("lock_acquire")} className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20">申请写锁</button>
                <button onClick={() => createSubagentBridgeRequest("swarm_bootstrap")} className="rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-500/20">协作验收</button>
                <button onClick={() => createSubagentBridgeRequest("subagent_status")} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700">代理状态</button>
              </div>
            )}
          </div>
          {hasRuntimeDetails && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-2">
              <button
                type="button"
                onClick={() => setShowRuntimeDetails((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0 truncate text-[11px] font-medium text-slate-200">
                  运行详情
                </span>
                <span className="shrink-0 text-[10px] text-slate-500">
                  记录 {runtimeSnapshotCount} · 审批 {pendingApprovalCount} · 请求 {pendingBridgeCount} · {showRuntimeDetails ? "收起" : "展开"}
                </span>
              </button>
            </div>
          )}
          {showRuntimeDetails && (
            <>
          {agentRuns.length > 0 && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-cyan-300">
                <span>运行时间线</span>
                <span>{agentRuns.length} 条</span>
              </div>
              <div className="space-y-2">
                {agentRuns.slice(0, 3).map((run) => (
                  <div key={run.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-cyan-200">{run.userText}</span>
                      <span className={run.status === "completed" ? "text-emerald-300" : run.status === "failed" ? "text-red-300" : run.status === "aborted" ? "text-amber-300" : "text-blue-300"}>{run.status}</span>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">域 {run.plan.domain}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">阶段 {run.plan.phase}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">风险 {run.plan.risk}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">记忆 {run.memoryTitles.length}</span>
                    </div>
                    <div className="max-h-24 overflow-auto rounded bg-slate-900/70 p-2 leading-relaxed">
                      {run.steps.slice(0, 6).map((step) => `${step.status}: ${step.label} - ${step.detail}`).join("\n")}
                    </div>
                    {(run.responsePreview || run.error) && (
                      <p className="mt-2 line-clamp-2 text-slate-500">{run.responsePreview || run.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {workflowSnapshots.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-emerald-300">
                <span>流程状态</span>
                <span>{workflowSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {workflowSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-emerald-200">{snapshot.name}</span>
                      <span className={snapshot.status === "completed" ? "text-emerald-300" : snapshot.status === "running" ? "text-blue-300" : "text-amber-300"}>{snapshot.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">动作 {snapshot.action}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">节点 {snapshot.currentNodeId || "none"}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">事件 {snapshot.eventCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {kairosSnapshots.length > 0 && (
            <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-fuchsia-300">
                <span>KAIROS 状态</span>
                <span>{kairosSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {kairosSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-fuchsia-200">{snapshot.objective}</span>
                      <span className={snapshot.status === "observing" ? "text-blue-300" : snapshot.status === "queued" ? "text-fuchsia-300" : "text-amber-300"}>{snapshot.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">动作 {snapshot.action}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">来源 {snapshot.source || "none"}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">事件 {snapshot.eventCount}</span>
                      {snapshot.lastTickAt && <span className="rounded bg-slate-900 px-1.5 py-0.5">tick {snapshot.lastTickAt}</span>}
                    </div>
                    {snapshot.nextAction && <p className="mt-2 line-clamp-2 text-slate-500">{snapshot.nextAction}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {schedulerSnapshots.length > 0 && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-orange-300">
                <span>定时草案</span>
                <span>{schedulerSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {schedulerSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-orange-200">{snapshot.taskName}</span>
                      <span className="text-orange-300">{snapshot.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">动作 {snapshot.action}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">计划 {snapshot.planCount}</span>
                      {snapshot.intervalMinutes > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">{snapshot.intervalMinutes}m</span>}
                      {snapshot.execution && <span className={snapshot.execution.includes("executed") || snapshot.status === "installed" || snapshot.status === "uninstalled" ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>{snapshot.execution}</span>}
                      {snapshot.returnCode >= 0 && <span className={snapshot.returnCode === 0 ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300" : "rounded bg-red-500/10 px-1.5 py-0.5 text-red-300"}>rc {snapshot.returnCode}</span>}
                    </div>
                    {snapshot.installDraftPath && <p className="mt-2 line-clamp-2 text-slate-500">{snapshot.installDraftPath}</p>}
                    {snapshot.uninstallDraftPath && <p className="mt-1 line-clamp-2 text-slate-500">{snapshot.uninstallDraftPath}</p>}
                    {snapshot.output && <p className="mt-1 line-clamp-2 text-orange-200/70">{snapshot.output}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {workerSnapshots.length > 0 && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-sky-300">
                <span>任务状态</span>
                <span>{workerSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {workerSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sky-200">{snapshot.agentId}</span>
                      <span className={snapshot.status === "completed" ? "text-emerald-300" : snapshot.status === "blocked" || snapshot.status === "failed" ? "text-red-300" : "text-sky-300"}>{snapshot.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">动作 {snapshot.action}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">任务 {snapshot.jobCount}</span>
                      {snapshot.command && <span className="rounded bg-slate-900 px-1.5 py-0.5">{snapshot.command}</span>}
                      {snapshot.processPid > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">PID {snapshot.processPid}</span>}
                      {snapshot.hardCancelSupported && <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">硬取消 {snapshot.hardCancelStatus || "就绪"}</span>}
                      {snapshot.proposalPath && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">草案 {snapshot.proposalPath}</span>}
                    </div>
                    {snapshot.output && <p className="mt-2 line-clamp-2 text-slate-500">{snapshot.output}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {providerSnapshots.length > 0 && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-indigo-300">
                <span>接口中枢</span>
                <span>{providerSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {providerSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-indigo-200">{snapshot.providerLabel}</span>
                      <span className={snapshot.status === "ok" ? "text-emerald-300" : snapshot.status === "approval_required" ? "text-amber-300" : "text-red-300"}>{snapshot.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">动作 {snapshot.action}</span>
                      {snapshot.presetCount > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">预设 {snapshot.returned || snapshot.presetCount}/{snapshot.presetCount}</span>}
                      {snapshot.groupCount > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">分组 {snapshot.groupCount}</span>}
                      {snapshot.provider && <span className="rounded bg-slate-900 px-1.5 py-0.5">{snapshot.provider}</span>}
                      {snapshot.modelId && <span className="rounded bg-slate-900 px-1.5 py-0.5">{snapshot.modelId}</span>}
                      {snapshot.wireKind && <span className="rounded bg-slate-900 px-1.5 py-0.5">{snapshot.wireKind}</span>}
                      <span className={snapshot.localEndpoint ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>{snapshot.localEndpoint ? "本地" : "远程"}</span>
                      {snapshot.keyRequired && <span className={snapshot.keyAvailable ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300" : "rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300"}>Key {snapshot.keyAvailable ? "就绪" : "缺失"}</span>}
                      {snapshot.remoteRequiresAllow && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">远程需授权</span>}
                      {snapshot.statusCode > 0 && <span className={snapshot.statusCode < 400 ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300" : "rounded bg-red-500/10 px-1.5 py-0.5 text-red-300"}>HTTP {snapshot.statusCode}</span>}
                      {snapshot.modelCount > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">模型 {snapshot.modelCount}</span>}
                    </div>
                    {snapshot.apiUrl && <p className="mt-2 line-clamp-1 text-slate-500">{snapshot.apiUrl}</p>}
                    {snapshot.providers.length > 0 && <p className="mt-1 line-clamp-2 text-indigo-200/70">{snapshot.providers.join(" / ")}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {memorySnapshots.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-emerald-300">
                <span>记忆状态</span>
                <span>{memorySnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {memorySnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-emerald-200">{snapshot.dimension}</span>
                      <span className="text-emerald-300">{snapshot.action}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">L1 {snapshot.l1Count}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">L2 {snapshot.l2Count}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">待压缩 {snapshot.pendingCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">新增 {snapshot.createdCount}</span>
                    </div>
                    {snapshot.summary && <p className="mt-2 line-clamp-2 text-slate-500">{snapshot.summary}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {skillSnapshots.length > 0 && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-purple-300">
                <span>技能状态</span>
                <span>{skillSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {skillSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-purple-200">{snapshot.title}</span>
                      <span className={snapshot.status === "draft" || snapshot.status === "ok" ? "text-purple-300" : "text-amber-300"}>{snapshot.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">动作 {snapshot.action}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">候选 {snapshot.candidateCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">激活 {snapshot.activatedCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">新增 {snapshot.createdCount}</span>
                      {snapshot.domain && <span className="rounded bg-slate-900 px-1.5 py-0.5">域 {snapshot.domain}</span>}
                      {snapshot.expectedCount > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">挂载 {snapshot.mountedCount}/{snapshot.expectedCount}</span>}
                      {snapshot.agentCount > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">代理 {snapshot.agentCount}</span>}
                      {snapshot.contextItems > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">记忆 {snapshot.contextItems}</span>}
                      {snapshot.localSkillCount > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">本地 {snapshot.localSkillCount}</span>}
                      {snapshot.localRootCount > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">Root {snapshot.localRootCount}</span>}
                      {snapshot.commandExcluded && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">命令隔离</span>}
                    </div>
                    {snapshot.draftPath && <p className="mt-2 line-clamp-2 text-slate-500">{snapshot.draftPath}</p>}
                    {snapshot.activatedPath && <p className="mt-1 line-clamp-2 text-emerald-400/80">{snapshot.activatedPath}</p>}
                    {snapshot.localSkillLabels.length > 0 && <p className="mt-1 line-clamp-2 text-fuchsia-200/70">{snapshot.localSkillLabels.join(" / ")}</p>}
                    {snapshot.workflowId && <p className="mt-1 line-clamp-1 text-violet-200/70">{snapshot.workflowId}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {sandboxSnapshots.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-amber-300">
                <span>沙盒状态</span>
                <button onClick={() => void refreshGatewayRuntime()} className="rounded bg-slate-900 px-1.5 py-0.5 text-amber-200 hover:bg-slate-800">{sandboxSnapshots.length} 条</button>
              </div>
              <div className="space-y-2">
                {sandboxSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-amber-200">{snapshot.mode}</span>
                      <span className={snapshot.arbitraryCommands === "disabled" ? "text-emerald-300" : "text-red-300"}>{snapshot.arbitraryCommands}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">动作 {snapshot.action}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">探针 {snapshot.probes}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">通过 {snapshot.okCount}</span>
                      <span className={snapshot.executeRead ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>读 {snapshot.executeRead ? "开" : "关"}</span>
                      <span className={snapshot.executeWrite ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>写 {snapshot.executeWrite ? "开" : "关"}</span>
                      <span className={snapshot.executeScheduler ? "rounded bg-orange-500/10 px-1.5 py-0.5 text-orange-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>定时 {snapshot.executeScheduler ? "开" : "关"}</span>
                      <span className={snapshot.executeWeb ? "rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>Web {snapshot.executeWeb ? "开" : "关"}</span>
                      <span className={snapshot.executeMcp ? "rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>MCP {snapshot.executeMcp ? "开" : "关"}</span>
                      <span className={snapshot.fullAccessFiles ? "rounded bg-red-500/10 px-1.5 py-0.5 text-red-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>Full {snapshot.fullAccessFiles ? "开" : "关"}</span>
                      <span className={snapshot.workspaceSandbox ? "rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>Workspace</span>
                    </div>
                    {snapshot.matrix.length > 0 && (
                      <div className="mt-2 grid gap-1">
                        {snapshot.matrix.slice(0, 6).map((tool) => (
                          <div key={`${snapshot.id}-${tool.action}`} className="flex items-center justify-between gap-2 rounded bg-slate-900/70 px-2 py-1">
                            <span className="min-w-0 truncate">{tool.label}</span>
                            <span className={tool.enabled ? "shrink-0 text-emerald-300" : "shrink-0 text-slate-500"}>{tool.enabled ? "on" : tool.mode || "off"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {snapshot.summary.length > 0 && <p className="mt-2 line-clamp-2 text-slate-500">{snapshot.summary.join(" / ")}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {phaseAuditSnapshots.length > 0 && (
            <div className="rounded-xl border border-lime-500/20 bg-lime-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-lime-300">
                <span>阶段审计</span>
                <span>{phaseAuditSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {phaseAuditSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-lime-200">{snapshot.title}</span>
                      <span className={snapshot.overall === "pass" ? "text-emerald-300" : snapshot.overall === "partial" ? "text-amber-300" : "text-red-300"}>{snapshot.overall}</span>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">通过 {snapshot.pass}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">部分 {snapshot.partial}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">缺失 {snapshot.missing}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">证据 {snapshot.evidencePassed}/{snapshot.evidenceTotal}</span>
                      <span className={snapshot.gapCount ? "rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>缺口 {snapshot.gapCount}</span>
                    </div>
                    <div className="space-y-1">
                      {snapshot.phases.slice(0, 5).map((phase) => (
                        <div key={phase.id || phase.label} className="flex items-center justify-between gap-2 rounded bg-slate-900/70 px-2 py-1">
                          <span className="min-w-0 truncate">{phase.label}</span>
                          <span className={phase.status === "pass" ? "text-emerald-300" : phase.status === "partial" ? "text-amber-300" : "text-red-300"}>
                            {phase.status} {phase.passed}/{phase.total} G{phase.gapCount}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sourceAuditSnapshots.length > 0 && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-rose-300">
                <span>来源审计</span>
                <span>{sourceAuditSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {sourceAuditSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-rose-200">来源复用边界</span>
                      <span className={snapshot.nonReusable ? "text-red-300" : "text-emerald-300"}>{snapshot.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">来源 {snapshot.total}</span>
                      <span className={snapshot.nonReusable ? "rounded bg-red-500/10 px-1.5 py-0.5 text-red-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>不可复用 {snapshot.nonReusable}</span>
                      {snapshot.patternCount > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">模式 {snapshot.patternCount}</span>}
                      {snapshot.layerCount > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">层 {snapshot.layerCount}</span>}
                      {snapshot.sourceKinds && <span className="rounded bg-slate-900 px-1.5 py-0.5">{snapshot.sourceKinds}</span>}
                    </div>
                    {snapshot.riskyLabels.length > 0 && <p className="mt-2 line-clamp-2 text-red-300/80">{snapshot.riskyLabels.join(" / ")}</p>}
                    {snapshot.statePath && <p className="mt-1 line-clamp-1 text-rose-200/70">{snapshot.statePath}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {goalBootstrapSnapshots.length > 0 && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-cyan-300">
                <span>目标模式</span>
                <span>{goalBootstrapSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {goalBootstrapSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-cyan-200">{snapshot.objective || "织梦目标模式"}</span>
                      <span className={snapshot.blockedSourceCount ? "text-amber-300" : "text-emerald-300"}>{snapshot.action}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">阶段 {snapshot.phaseCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">P1任务 {snapshot.phase1TaskCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">节点 {snapshot.workflowNodeCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">代理 {snapshot.subagentCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">任务 {snapshot.workerCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">安全源 {snapshot.safeSourceCount}</span>
                      <span className={snapshot.blockedSourceCount ? "rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>阻断源 {snapshot.blockedSourceCount}</span>
                    </div>
                    {(snapshot.workflowId || snapshot.kairosTaskId) && (
                      <p className="mt-2 line-clamp-1 text-cyan-200/70">{[snapshot.workflowId, snapshot.kairosTaskId].filter(Boolean).join(" / ")}</p>
                    )}
                    {snapshot.statePath && <p className="mt-1 line-clamp-1 text-cyan-200/60">{snapshot.statePath}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {userModelSnapshots.length > 0 && (
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-pink-300">
                <span>用户画像</span>
                <span>{userModelSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {userModelSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-pink-200">{snapshot.dimension}</span>
                      <span className="text-pink-300">{snapshot.action}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">事件 {snapshot.eventCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">信念 {snapshot.beliefCount}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">待反思 {snapshot.pendingCount}</span>
                      {snapshot.confidence > 0 && <span className="rounded bg-slate-900 px-1.5 py-0.5">置信 {snapshot.confidence.toFixed(2)}</span>}
                    </div>
                    {snapshot.summary && <p className="mt-2 line-clamp-2 text-slate-500">{snapshot.summary}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {subagentSnapshots.length > 0 && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-blue-300">
                <span>子代理状态</span>
                <span>{subagentSnapshots.length} 条</span>
              </div>
              <div className="space-y-2">
                {subagentSnapshots.slice(0, 3).map((snapshot) => (
                  <div key={`${snapshot.id}-${snapshot.at}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-blue-200">{snapshot.label}</span>
                      <span className={snapshot.status === "blocked" ? "text-red-300" : snapshot.status === "running" || snapshot.status === "ok" ? "text-emerald-300" : "text-blue-300"}>{snapshot.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">动作 {snapshot.action}</span>
                      <span className="rounded bg-slate-900 px-1.5 py-0.5">锁 {snapshot.activeLocks}</span>
                      <span className={snapshot.conflicts ? "rounded bg-red-500/10 px-1.5 py-0.5 text-red-300" : "rounded bg-slate-900 px-1.5 py-0.5"}>冲突 {snapshot.conflicts}</span>
                      {snapshot.scope && <span className="rounded bg-slate-900 px-1.5 py-0.5">scope {snapshot.scope}</span>}
                      {snapshot.mode && <span className="rounded bg-slate-900 px-1.5 py-0.5">{snapshot.mode}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {approvalDrafts.some((draft) => draft.status === "draft") && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-amber-300">
                <span>写入审批草案</span>
                <span>{approvalDrafts.filter((draft) => draft.status === "draft").length} 待处理</span>
              </div>
              <div className="space-y-2">
                {approvalDrafts.filter((draft) => draft.status === "draft").slice(0, 3).map((draft) => (
                  <div key={draft.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-amber-200">{draft.target}</span>
                      <span className={draft.risk === "high" ? "text-red-300" : draft.risk === "medium" ? "text-amber-300" : "text-emerald-300"}>{draft.risk}</span>
                    </div>
                    <p className="line-clamp-2">{draft.reason}</p>
                    <div className="mt-2 max-h-24 overflow-auto rounded bg-slate-900/80 p-2 font-mono leading-relaxed">
                      {(draft.changes?.length ? draft.changes.map((change) => `${change.type}: ${change.text}`) : draft.diff.map((line) => `${line.type}: ${line.text}`)).slice(0, 8).join("\n") || "无具体变更"}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => applyApprovalDraft(draft)} className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-300 hover:bg-emerald-500/20">应用</button>
                      <button onClick={() => rejectApprovalDraft(draft.id)} className="rounded bg-slate-800 px-2 py-1 text-slate-400 hover:bg-slate-700">拒绝</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {bridgeRequests.some((request) => request.status !== "rejected" && request.status !== "completed") && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-blue-300">
                <span>本地执行桥请求</span>
                <span>{bridgeRequests.filter((request) => request.status !== "rejected" && request.status !== "completed").length} 待处理</span>
              </div>
              <div className="space-y-2">
                {bridgeRequests.filter((request) => request.status !== "rejected" && request.status !== "completed").slice(0, 3).map((request) => (
                  <div key={request.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-400">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-blue-200">{request.action}</span>
                      <span className={request.approvalRequired ? "text-amber-300" : "text-emerald-300"}>{request.status}</span>
                    </div>
                    <p className="line-clamp-2">{request.purpose}</p>
                    <div className="mt-2 max-h-24 overflow-auto rounded bg-slate-900/80 p-2 font-mono leading-relaxed">
                      {JSON.stringify(request.payload, null, 2)}
                    </div>
                    {request.validation.length > 0 && (
                      <div className="mt-2 max-h-20 overflow-auto rounded bg-slate-900/60 p-2 leading-relaxed">
                        {request.validation.map((item) => `${item.severity}: ${item.label || item.key} - ${item.message}`).join("\n")}
                      </div>
                    )}
                    {request.lastResult && (
                      <div className="mt-2 max-h-20 overflow-auto rounded bg-slate-900/60 p-2 font-mono leading-relaxed text-emerald-300">
                        {JSON.stringify(request.lastResult, null, 2)}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button onClick={() => submitBridgeRequest(request)} className="rounded bg-blue-500/10 px-2 py-1 text-blue-300 hover:bg-blue-500/20">发送本地桥</button>
                      <button onClick={() => queueBridgeRequest(request)} className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-300 hover:bg-emerald-500/20">登记</button>
                      <CopyButton text={JSON.stringify({
                        id: request.id,
                        action: request.action,
                        purpose: request.purpose,
                        payload: request.payload,
                      }, null, 2)} />
                      <button onClick={() => rejectBridgeRequest(request.id)} className="rounded bg-slate-800 px-2 py-1 text-slate-400 hover:bg-slate-700">拒绝</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
            </>
          )}
          <div className="relative">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入指令..." className="w-full h-20 resize-none rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 transition-colors" />
            <button onClick={() => sendCore(input)} className="absolute right-2 bottom-2 bg-indigo-500 p-1.5 rounded-lg text-white hover:bg-indigo-600 transition-colors"><Send className="h-4 w-4"/></button>
          </div>
          <div className="flex justify-between items-center px-1">
            <button onClick={onOpenPromptPicker} className="text-xs text-slate-500 hover:text-white transition-colors">📋 选择 Skill</button>
            <button onClick={() => onOpenPreview(composePreview(input))} className="text-xs text-slate-500 hover:text-white transition-colors"><Eye className="h-3.5 w-3.5"/></button>
          </div>
        </div>
      )}
    </aside>
  );
}

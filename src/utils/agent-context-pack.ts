import type { AgentIntentPlan, RankedMemoryShard } from "./agent-memory";
import type { ExecutorBridgeManifest, ExecutorActionKind } from "./executor-bridge";
import type { PersonalOSPlan } from "./personal-os";
import type { SkillAssembly } from "./skill-registry";
import type { ToolRouteBundle } from "./tool-registry";
import type { WorkflowDag } from "./workflow-dag";

export interface AgentContextMemoryRef {
  id: string;
  title: string;
  category: string;
  kind: RankedMemoryShard["kind"];
  score: number;
  reason: string[];
  anchors: string[];
}

export interface AgentContextSkillRef {
  key: string;
  label: string;
  source: string;
  memoryBanks: string[];
  safetyNote: string;
}

export interface AgentContextBridgeCall {
  action: ExecutorActionKind;
  purpose: string;
  payload: Record<string, unknown>;
  why: string;
}

export interface AgentContextPack {
  version: "0.1";
  task: {
    raw: string;
    domain: PersonalOSPlan["domain"];
    phase: PersonalOSPlan["phase"];
    intent: AgentIntentPlan["intent"];
    risk: PersonalOSPlan["risk"];
    contextMode: AgentIntentPlan["contextMode"];
    goalMode: boolean;
  };
  budget: {
    mode: "lean" | "balanced" | "deep";
    memoryShardLimit: number;
    memorySummaryChars: number;
    currentTextChars: number;
    rule: string;
  };
  memoryRefs: AgentContextMemoryRef[];
  activeSkills: AgentContextSkillRef[];
  workspaceSkillTitles: string[];
  toolPolicy: {
    allowedTools: string[];
    blockedTools: string[];
    approvalRequired: boolean;
    excludedToolScopes: string[];
  };
  bridgeQueue: AgentContextBridgeCall[];
  workflow: {
    id: string;
    currentNodeId: string;
    readyNodes: string[];
  };
  writebackRules: string[];
}

function compact(text: string, max = 240) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function memoryLimit(mode: AgentIntentPlan["contextMode"]) {
  if (mode === "deep") return 8;
  if (mode === "balanced") return 5;
  return 3;
}

function memorySummaryChars(mode: AgentIntentPlan["contextMode"]) {
  if (mode === "deep") return 900;
  if (mode === "balanced") return 620;
  return 360;
}

function memoryDimension(intent: AgentIntentPlan["intent"], domain: PersonalOSPlan["domain"]) {
  if (intent === "writeback" || intent === "memory_audit") return "project";
  if (intent === "review" || intent === "rewrite" || intent === "continue") return "episode";
  if (domain === "writing") return "skill";
  if (domain === "coding") return "tool";
  return "project";
}

function excludedToolScopes(plan: PersonalOSPlan, tools: ToolRouteBundle) {
  const excluded = new Set<string>();
  tools.blockedTools.forEach((tool) => excluded.add(tool.key));
  if (plan.domain === "writing") {
    excluded.add("run_command");
    excluded.add("code.compile");
    excluded.add("package.install");
  }
  if (plan.risk === "high") {
    excluded.add("web_fetch");
    excluded.add("mcp_call");
  }
  return Array.from(excluded);
}

export function buildAgentContextPack(params: {
  raw: string;
  currentText: string;
  plan: PersonalOSPlan;
  agentPlan: AgentIntentPlan;
  memories: RankedMemoryShard[];
  skills: SkillAssembly;
  tools: ToolRouteBundle;
  executorBridge: ExecutorBridgeManifest;
  workflow: WorkflowDag;
}): AgentContextPack {
  const limit = memoryLimit(params.agentPlan.contextMode);
  const query = params.agentPlan.queryTerms.slice(0, 18).join(" ");
  const bridgeQueue: AgentContextBridgeCall[] = [
    {
      action: "skill_route",
      purpose: "按当前任务路由 Personal OS / Skills",
      payload: {
        task: compact(params.raw, 420),
        domain: params.plan.domain,
        current_text: compact(params.currentText.slice(-1400), 700),
      },
      why: "先确定 active skills、memory banks 和 excluded tool scopes，避免无关技能污染上下文。",
    },
    {
      action: "memory_retrieve",
      purpose: "按任务检索 AutoDream L1/L2 紧凑记忆包",
      payload: {
        query: query || compact(params.raw, 180),
        dimension: memoryDimension(params.agentPlan.intent, params.plan.domain),
        limit,
      },
      why: "先取 context_pack，再决定是否需要显式关联文件或当前正文全文。",
    },
  ];

  if (params.workflow.currentNodeId) {
    bridgeQueue.push({
      action: "run",
      purpose: `登记或刷新工作流：${params.workflow.name}`,
      payload: {
        workflow_id: params.workflow.id,
        name: params.workflow.name,
        current_node_id: params.workflow.currentNodeId,
        nodes: params.workflow.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          status: node.status,
          dependsOn: node.dependsOn,
          verification: node.verification,
        })),
      },
      why: "把长期任务拆成可验收 DAG，便于后续推进和回灌。",
    });
  }

  return {
    version: "0.1",
    task: {
      raw: compact(params.raw, 360),
      domain: params.plan.domain,
      phase: params.plan.phase,
      intent: params.agentPlan.intent,
      risk: params.plan.risk,
      contextMode: params.agentPlan.contextMode,
      goalMode: params.plan.goalMode,
    },
    budget: {
      mode: params.agentPlan.contextMode,
      memoryShardLimit: limit,
      memorySummaryChars: memorySummaryChars(params.agentPlan.contextMode),
      currentTextChars: params.agentPlan.contextMode === "deep" ? 8000 : params.agentPlan.contextMode === "balanced" ? 5000 : 2600,
      rule: "默认只注入摘要切片、锚点和必要文件；全文读取必须由任务缺口触发。",
    },
    memoryRefs: params.memories.slice(0, limit).map((memory) => ({
      id: memory.id,
      title: memory.title,
      category: memory.category,
      kind: memory.kind,
      score: memory.score,
      reason: memory.reason,
      anchors: memory.anchors.slice(0, 5),
    })),
    activeSkills: params.skills.activeCoreSkills.map((skill) => ({
      key: skill.key,
      label: skill.label,
      source: skill.source,
      memoryBanks: skill.memoryBanks,
      safetyNote: skill.safetyNote,
    })),
    workspaceSkillTitles: params.skills.activeWorkspaceSkills.map((skill) => skill.title),
    toolPolicy: {
      allowedTools: params.tools.tools.map((tool) => tool.key),
      blockedTools: params.tools.blockedTools.map((tool) => tool.key),
      approvalRequired: params.tools.approvalRequired || params.executorBridge.mode !== "dry-run",
      excludedToolScopes: excludedToolScopes(params.plan, params.tools),
    },
    bridgeQueue,
    workflow: {
      id: params.workflow.id,
      currentNodeId: params.workflow.currentNodeId,
      readyNodes: params.workflow.nodes.filter((node) => node.status === "ready").map((node) => node.id),
    },
    writebackRules: [
      "工具结果只写事实、决策、风险、下一步动作，不写长篇聊天记录。",
      "小说任务写回 story_canon / chapter_state / entity_state 前先生成差异草案。",
      "技能结晶只生成 .py.draft；激活后也不由 Gateway 自动 import 或执行。",
      "来源不明、泄露或受保护代码只做不可复用标记，不进入实现。",
    ],
  };
}

export function renderAgentContextPack(pack: AgentContextPack) {
  const memory = pack.memoryRefs
    .map((item) => `- ${item.category}/${item.title}｜${item.kind}｜score=${item.score}｜${item.reason.join("、") || "相关"}｜anchors=${item.anchors.join(" / ") || "-"}`)
    .join("\n");
  const skills = pack.activeSkills
    .map((skill) => `- ${skill.label}｜${skill.key}｜banks=${skill.memoryBanks.join(",")}｜${skill.safetyNote}`)
    .join("\n");
  const calls = pack.bridgeQueue
    .map((call, index) => `${index + 1}. ${call.action}｜${call.purpose}\n   why=${call.why}\n   payload=${JSON.stringify(call.payload)}`)
    .join("\n");

  return `【Agent Context Pack v${pack.version}｜先路由、再检索、再行动】
任务：${pack.task.raw || "-"}
域/阶段/意图：${pack.task.domain} / ${pack.task.phase} / ${pack.task.intent}
上下文预算：${pack.budget.mode}｜memory<=${pack.budget.memoryShardLimit}｜summary<=${pack.budget.memorySummaryChars} chars｜current<=${pack.budget.currentTextChars} chars
预算规则：${pack.budget.rule}

Active Skills：
${skills || "- 无"}

Memory Refs：
${memory || "- 无；需要时先发起 memory_retrieve。"}

Tool Policy：
- allowed=${pack.toolPolicy.allowedTools.join(",") || "-"}
- blocked=${pack.toolPolicy.blockedTools.join(",") || "-"}
- excluded=${pack.toolPolicy.excludedToolScopes.join(",") || "-"}
- approval=${pack.toolPolicy.approvalRequired ? "required" : "not-required"}

Bridge Queue：
${calls || "- 无"}

Workflow：
- id=${pack.workflow.id}
- current=${pack.workflow.currentNodeId}
- ready=${pack.workflow.readyNodes.join(",") || "-"}

Writeback：
${pack.writebackRules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}`;
}

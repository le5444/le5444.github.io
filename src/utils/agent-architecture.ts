import type { PersonalOSPlan } from "./personal-os";
import type { SkillAssembly } from "./skill-registry";
import type { SwarmPlan } from "./subagent-swarm";
import type { ToolRouteBundle } from "./tool-registry";
import type { WorkflowDag } from "./workflow-dag";

export type AgentArchitectureSourceKey = "codex" | "claude_code" | "work_buddy" | "openclaw" | "hermes";

export interface AgentArchitectureSource {
  key: AgentArchitectureSourceKey;
  label: string;
  sourceKind: "official" | "open-source" | "public-docs";
  borrowedPattern: string;
  projectMapping: string;
}

export interface AgentArchitectureLayer {
  key: string;
  label: string;
  status: "absorbed" | "prototype" | "missing";
  from: AgentArchitectureSourceKey[];
  mapping: string;
  nextStep: string;
}

export interface AgentArchitecturePlan {
  sources: AgentArchitectureSource[];
  layers: AgentArchitectureLayer[];
  principles: string[];
  adoptionSummary: string;
}

export const AGENT_ARCHITECTURE_SOURCES: AgentArchitectureSource[] = [
  {
    key: "codex",
    label: "Codex",
    sourceKind: "official",
    borrowedPattern: "仓库规则、Skills、MCP/工具、Hooks/审批、任务运行记录和可验证改动。",
    projectMapping: "映射为 SOUL/MEMORY/BRIDGE、Skills Assembly、Executor Bridge、命令验证和 AgentRun。",
  },
  {
    key: "claude_code",
    label: "Claude Code",
    sourceKind: "official",
    borrowedPattern: "CLAUDE.md 记忆、权限/工具闸门、Subagents 隔离上下文、Hooks、MCP 与可复用 Skills。",
    projectMapping: "映射为织梦 Agent Workbench 记忆路由、Subagent Swarm、7 层安全防线和写入审批草案。",
  },
  {
    key: "work_buddy",
    label: "WorkBuddy",
    sourceKind: "open-source",
    borrowedPattern: "本地 sidecar/Gateway、四类动词、任务 DAG、看板状态和知识库联动。",
    projectMapping: "映射为 Python Gateway、Workflow DAG、KAIROS 状态和桥请求卡片。",
  },
  {
    key: "openclaw",
    label: "OpenClaw",
    sourceKind: "open-source",
    borrowedPattern: "本地优先、多入口任务、运行时编排、工具注册、会话历史和多代理调度。",
    projectMapping: "映射为浏览器写作台 + 本地 Gateway + Tool Registry + Memory/KAIROS 面板。",
  },
  {
    key: "hermes",
    label: "Hermes",
    sourceKind: "public-docs",
    borrowedPattern: "自我改进循环、经验压缩、技能沉淀、长期任务和多执行后端。",
    projectMapping: "映射为 AutoDream L1/L2、技能路由、KAIROS 长期观察和执行桥协议。",
  },
];

function layerStatus(condition: boolean, fallback: AgentArchitectureLayer["status"] = "prototype"): AgentArchitectureLayer["status"] {
  return condition ? "absorbed" : fallback;
}

export function buildAgentArchitecturePlan(params: {
  plan: PersonalOSPlan;
  tools: ToolRouteBundle;
  skills: SkillAssembly;
  swarm: SwarmPlan;
  workflow: WorkflowDag;
}): AgentArchitecturePlan {
  const hasWriteLock = params.swarm.locks.some((lock) => lock.mode === "write");
  const hasNovelSkill = params.skills.activeCoreSkills.some((skill) => /novel|tomato/i.test(skill.key));
  const hasGateway = params.workflow.gatewayActions.length > 0;
  const approvalRequired = params.tools.approvalRequired;

  const layers: AgentArchitectureLayer[] = [
    {
      key: "context-memory",
      label: "上下文/记忆",
      status: "absorbed",
      from: ["codex", "claude_code", "hermes"],
      mapping: "SOUL.md、MEMORY.md、AutoDream L1/L2 和按任务域的记忆路由。",
      nextStep: "继续把全文塞入降级为摘要切片、锚点和必要文件读取。",
    },
    {
      key: "skills",
      label: "Skills 调度",
      status: layerStatus(params.skills.activeCoreSkills.length > 0),
      from: ["codex", "claude_code", "hermes"],
      mapping: "Skills Assembly 根据任务域挂载小说、研究、代码和来源审计技能。",
      nextStep: hasNovelSkill ? "把小说 Skills 的输出统一写入章节控制卡和回灌草案。" : "补充更多非写作域 Skills，例如项目管理、代码审查和资料研究。",
    },
    {
      key: "tool-registry",
      label: "工具注册/权限",
      status: "absorbed",
      from: ["codex", "claude_code", "openclaw"],
      mapping: "Tool Registry + 7 层安全防线 + 23 条命令验证器。",
      nextStep: approvalRequired ? "高风险工具继续保持审批卡和 dry-run。" : "低风险读取工具可以直接执行，写入仍走审批。",
    },
    {
      key: "workflow-dag",
      label: "工作流 DAG",
      status: layerStatus(params.workflow.nodes.length > 0),
      from: ["work_buddy", "hermes"],
      mapping: `${params.workflow.name} 当前节点 ${params.workflow.currentNodeId}，由 Gateway run/advance/status 记录状态。`,
      nextStep: "把每个节点的验收结果写入 AgentRun 和 KAIROS，而不是只留在聊天里。",
    },
    {
      key: "subagents-locks",
      label: "子代理/锁",
      status: layerStatus(params.swarm.agents.length > 1 && hasWriteLock),
      from: ["claude_code", "openclaw", "hermes"],
      mapping: "Subagent Swarm 区分 forked/isolated 上下文，Gateway 记录 subagent 与读写锁。",
      nextStep: "下一阶段接入真正并发执行器，让子代理不只是规划而能产出可合并观察。",
    },
    {
      key: "local-gateway",
      label: "本地 Gateway",
      status: hasGateway ? "prototype" : "missing",
      from: ["work_buddy", "openclaw"],
      mapping: "Executor Bridge 把前端请求变成本地 HTTP Gateway 的可审计动作。",
      nextStep: "升级为完整 MCP transport / 执行沙箱 / 服务守护启动器。",
    },
    {
      key: "user-model",
      label: "Honcho 用户模型",
      status: "prototype",
      from: ["hermes", "codex"],
      mapping: "user_model_event/reflection 以证据、反例和置信度维护偏好，不伪造长期画像。",
      nextStep: "把用户模型摘要安全注入 SOUL/MEMORY 路由，并允许用户审查/删除错误信念。",
    },
    {
      key: "self-improvement",
      label: "自我改进循环",
      status: "prototype",
      from: ["hermes", "codex"],
      mapping: "AgentRun -> AutoDream -> MEMORY.md/KAIROS.md -> skill_crystallize，形成经验压缩、后续动作和 Skill 草案。",
      nextStep: "把草案接入人工审批和可启用 Skill 库，而不自动执行新脚本。",
    },
  ];

  const principles = [
    "把 agent 当运行时：计划、检索、工具、执行、验证、写回分层，不把所有内容塞进一次提示词。",
    "总编排器负责最终判断；子代理只提交观察、草案和风险。",
    "外部动作都走桥请求、审批或 dry-run，前端不隐式执行命令。",
    "公开/官方/开源资料只能吸收架构和接口思想，不复制受保护代码。",
    "长任务进入 KAIROS，短任务进入 AgentRun，记忆进入 AutoDream L1/L2。",
  ];

  const absorbed = layers.filter((layer) => layer.status === "absorbed").length;
  const prototype = layers.filter((layer) => layer.status === "prototype").length;
  const missing = layers.filter((layer) => layer.status === "missing").length;

  return {
    sources: AGENT_ARCHITECTURE_SOURCES,
    layers,
    principles,
    adoptionSummary: `已吸收 ${absorbed} 层，原型 ${prototype} 层，缺口 ${missing} 层。`,
  };
}

export function renderAgentArchitectureContext(plan: AgentArchitecturePlan) {
  return `【Agent Architecture Lens｜Codex / ClaudeCode / WorkBuddy / OpenClaw / Hermes】
来源边界：
${plan.sources.map((source) => `- ${source.label}｜${source.sourceKind}｜借鉴：${source.borrowedPattern}\n  用在织梦：${source.projectMapping}`).join("\n")}

架构层状态：
${plan.layers.map((layer) => `- [${layer.status}] ${layer.label}｜from=${layer.from.join(",")}｜${layer.mapping}\n  下一步：${layer.nextStep}`).join("\n")}

运行原则：
${plan.principles.map((item, index) => `${index + 1}. ${item}`).join("\n")}

总览：${plan.adoptionSummary}`;
}

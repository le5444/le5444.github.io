import type { ExecutorBridgeManifest } from "./executor-bridge";
import type { PersonalOSPlan } from "./personal-os";
import type { SkillAssembly } from "./skill-registry";
import type { SwarmPlan } from "./subagent-swarm";
import type { WorkflowDag } from "./workflow-dag";

export type CoordinatorRunMode = "goal-mode" | "task-mode";

export interface CoordinatorPhaseGate {
  phase: string;
  pass: string;
  fail: string;
}

export interface CoordinatorModePlan {
  mode: CoordinatorRunMode;
  role: string;
  statusLine: string;
  maxims: string[];
  delegationRules: string[];
  phaseGates: CoordinatorPhaseGate[];
  sourceBoundaries: string[];
  contextEconomy: string[];
  writebackRules: string[];
  toolInvariants: string[];
}

function gateFromWorkflow(dag: WorkflowDag): CoordinatorPhaseGate[] {
  return dag.nodes.slice(0, 6).map((node) => ({
    phase: `${node.id}｜${node.label}`,
    pass: node.verification,
    fail: "进入修订、补证或审批草案，不标记完成。",
  }));
}

export function buildCoordinatorModePlan(params: {
  plan: PersonalOSPlan;
  workflow: WorkflowDag;
  swarm: SwarmPlan;
  skills: SkillAssembly;
  executorBridge: ExecutorBridgeManifest;
}): CoordinatorModePlan {
  const runMode: CoordinatorRunMode = params.plan.goalMode ? "goal-mode" : "task-mode";
  const activeAgents = params.swarm.agents.map((agent) => agent.key).join(",") || "coordinator";
  const activeSkills = params.skills.activeCoreSkills.map((skill) => skill.key).join(",") || "personal-os-coordinator";
  const bridgeMode = params.executorBridge.mode;

  return {
    mode: runMode,
    role: "Personal OS chief coordinator for Zhimeng: plan, retrieve, delegate, verify, write back, and keep the user-facing answer clear.",
    statusLine: `${runMode}｜domain=${params.plan.domain}｜phase=${params.plan.phase}｜dag=${params.workflow.currentNodeId}｜agents=${activeAgents}｜skills=${activeSkills}｜bridge=${bridgeMode}`,
    maxims: [
      "先理解目标，再决定是否需要工具、记忆、Skills 或子代理。",
      "总编排器亲自综合证据和产物，不把最终判断外包给子代理。",
      "不要批准弱结果；验收不通过时给出修订路径或继续执行。",
      "把 agent 当运行时：计划、上下文、工具、执行、验证、写回分层处理。",
      "任务能直接完成时直接完成，不能把用户困在架构说明里。",
    ],
    delegationRules: [
      "forked 子代理可继承必要记忆摘要，isolated 子代理只能拿任务片段和验收标准。",
      "研究子代理只提交来源、证据和不确定性，不替 coordinator 下结论。",
      "写作子代理提交控制卡、正文草案、状态变化和伏笔影响。",
      "代码子代理提交最小补丁、验证命令和风险，不覆盖无关文件。",
      "审批守卫只审查风险和命令边界，不代替业务判断。",
    ],
    phaseGates: gateFromWorkflow(params.workflow),
    sourceBoundaries: [
      "只吸收官方文档、公开资料和正常开源仓库的架构思想。",
      "泄露源码、受保护代码、密钥和私有实现只能标记为不可复用风险，不能复制、改写或移植。",
      "Codex/Claude Code/WorkBuddy/OpenClaw/Hermes 的借鉴点必须落到接口、流程、权限和记忆策略，不能声称获得其内部私有逻辑。",
      "引用资料时区分事实、推断和项目内自建规则。",
    ],
    contextEconomy: [
      "默认 lean context：摘要切片、锚点和必要文件优先，全文只在明确需要时读取。",
      "上下文按 SOUL、MEMORY、项目真值、当前文件、工具观察、来源笔记分层。",
      "重复材料压缩为事实、决策、风险、后续动作四类。",
      "不要把所有提示词、全文和历史一次性塞给模型。",
    ],
    writebackRules: [
      "新事实写 MEMORY.md，新长期目标写 KAIROS.md，权限边界写 SOUL.md，工具协议写 BRIDGE.md。",
      "写回前先生成差异或 bridge-request；用户手写设定优先于自动总结。",
      "AutoDream 只能沉淀有证据的观察，不伪造长期画像。",
      "Skill 结晶先生成草案、审查、激活记录，不自动 import 或执行新脚本。",
    ],
    toolInvariants: [
      "前端不隐式执行命令，只生成可审计 bridge-request。",
      "run_command 不是任意 shell；必须经过验证器、allowlist 和 Gateway opt-in。",
      "write_file、web_fetch、mcp_call、kairos_task 需要审批或 dry-run 记录。",
      "没有工具返回结果时，不要声称工具已经执行。",
    ],
  };
}

export function renderCoordinatorModeContext(plan: CoordinatorModePlan) {
  return `【Coordinator System Prompt｜目标编排内核】
运行模式：${plan.mode === "goal-mode" ? "Goal Mode / 长期目标推进" : "Task Mode / 当前任务执行"}
角色：${plan.role}
状态：${plan.statusLine}

核心铁律：
${plan.maxims.map((item, index) => `${index + 1}. ${item}`).join("\n")}

委派规则：
${plan.delegationRules.map((item, index) => `${index + 1}. ${item}`).join("\n")}

阶段闸门：
${plan.phaseGates.map((gate, index) => `${index + 1}. ${gate.phase}\n   pass=${gate.pass}\n   fail=${gate.fail}`).join("\n")}

来源边界：
${plan.sourceBoundaries.map((item, index) => `${index + 1}. ${item}`).join("\n")}

上下文经济性：
${plan.contextEconomy.map((item, index) => `${index + 1}. ${item}`).join("\n")}

写回规则：
${plan.writebackRules.map((item, index) => `${index + 1}. ${item}`).join("\n")}

工具不变量：
${plan.toolInvariants.map((item, index) => `${index + 1}. ${item}`).join("\n")}`;
}

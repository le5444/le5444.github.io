import type { PersonalOSPlan, PersonalOSSubagentRoute } from "./personal-os";
import type { SkillAssembly } from "./skill-registry";
import type { ToolRouteBundle } from "./tool-registry";

export type SwarmContextMode = "forked" | "isolated";
export type WorkspaceLockMode = "read" | "write";

export interface SwarmAgentPlan {
  key: string;
  label: string;
  contextMode: SwarmContextMode;
  inheritedBanks: string[];
  allowedTools: string[];
  objective: string;
}

export interface WorkspaceLock {
  id: string;
  mode: WorkspaceLockMode;
  scope: string;
  owner: string;
  reason: string;
}

export interface SwarmPlan {
  agents: SwarmAgentPlan[];
  locks: WorkspaceLock[];
  conflicts: string[];
  mergeRule: string;
}

function normalizeMode(route: PersonalOSSubagentRoute): SwarmContextMode {
  return route.mode === "isolated-context" ? "isolated" : "forked";
}

function inheritedBanks(route: PersonalOSSubagentRoute, plan: PersonalOSPlan) {
  if (route.mode === "isolated-context") return [];
  return plan.memoryRoutes.map((routeItem) => routeItem.bank).slice(0, 6);
}

function buildAgentObjective(route: PersonalOSSubagentRoute, plan: PersonalOSPlan) {
  if (route.key === "coordinator") return "综合所有子节点结果，负责最终判断和验收。";
  if (route.key.includes("memory")) return "压缩上下文、提取事实、提出写回项。";
  if (route.key.includes("novel")) return "处理小说业务域的规划、审稿、状态回灌。";
  if (route.key.includes("code")) return "处理代码任务草案、验证计划和补丁边界。";
  if (route.key.includes("research") || route.key.includes("source")) return "收集证据并标注来源级别，不做最终判断。";
  if (route.key.includes("approval")) return "审查高风险动作、命令和写入草案。";
  if (route.key.includes("kairos")) return "规划长期任务、触发条件和停止方式。";
  return `服务 ${plan.domain}/${plan.phase} 阶段。`;
}

export function buildSwarmPlan(params: {
  plan: PersonalOSPlan;
  tools: ToolRouteBundle;
  skills: SkillAssembly;
}): SwarmPlan {
  const agents = params.plan.subagents.map((route): SwarmAgentPlan => ({
    key: route.key,
    label: route.label,
    contextMode: normalizeMode(route),
    inheritedBanks: inheritedBanks(route, params.plan),
    allowedTools: params.tools.tools
      .filter((tool) => tool.permission === "read" || route.key === "coordinator" || route.key.includes("approval"))
      .map((tool) => tool.key)
      .slice(0, 8),
    objective: buildAgentObjective(route, params.plan),
  }));

  const locks: WorkspaceLock[] = [
    {
      id: "read-memory",
      mode: "read",
      scope: params.plan.memoryRoutes.map((route) => route.bank).join(",") || "working",
      owner: "coordinator",
      reason: "所有 forked 子代理继承主记忆摘要。",
    },
  ];

  if (params.tools.approvalRequired) {
    locks.push({
      id: "write-approval",
      mode: "write",
      scope: "approval-drafts",
      owner: "approval_guard",
      reason: "写入、执行、联网和长期任务先进入审批草案。",
    });
  }

  if (params.plan.goalMode || params.plan.domain === "automation") {
    locks.push({
      id: "write-kairos",
      mode: "write",
      scope: "KAIROS.md",
      owner: "kairos_daemon",
      reason: "长期目标只追加日志，不覆盖旧记录。",
    });
  }

  if (params.skills.activeCoreSkills.some((skill) => skill.key.includes("novel"))) {
    locks.push({
      id: "write-novel-memory",
      mode: "write",
      scope: "story_canon,chapter_state,continuity_facts",
      owner: "novel_orchestrator",
      reason: "小说状态回灌需要集中提交，避免角色/伏笔漂移。",
    });
  }

  const writeScopes = locks.filter((lock) => lock.mode === "write").map((lock) => lock.scope);
  const conflicts = writeScopes
    .filter((scope, index) => writeScopes.indexOf(scope) !== index)
    .map((scope) => `重复写锁：${scope}`);

  return {
    agents,
    locks,
    conflicts,
    mergeRule: "只有 coordinator 可以合并子代理结果；isolated 子代理只提交观察，不直接写入。",
  };
}

export function renderSwarmPlanContext(plan: SwarmPlan) {
  return `【Subagent Swarm｜分支与锁】
子代理：
${plan.agents.map((agent) => `- ${agent.label}｜${agent.key}｜${agent.contextMode}｜banks=${agent.inheritedBanks.join(",") || "-"}｜tools=${agent.allowedTools.join(",") || "-"}\n  目标：${agent.objective}`).join("\n")}

读写锁：
${plan.locks.map((lock) => `- ${lock.mode.toUpperCase()}｜${lock.scope}｜owner=${lock.owner}｜${lock.reason}`).join("\n") || "- 无"}

冲突：
${plan.conflicts.join("\n") || "- 无"}

合并规则：
${plan.mergeRule}`;
}

import type { WorkspaceFile } from "../store/workspace";
import type { PersonalOSPlan } from "./personal-os";
import type { SkillAssembly } from "./skill-registry";

export type WorkflowNodeStatus = "ready" | "waiting" | "blocked" | "done";

export interface WorkflowDagNode {
  id: string;
  label: string;
  owner: "coordinator" | "memory" | "skill" | "tool" | "reviewer" | "gateway";
  status: WorkflowNodeStatus;
  dependsOn: string[];
  artifacts: string[];
  tools: string[];
  verification: string;
}

export interface WorkflowDag {
  id: string;
  name: string;
  domain: PersonalOSPlan["domain"];
  currentNodeId: string;
  nodes: WorkflowDagNode[];
  gatewayActions: Array<"search" | "run" | "advance" | "status">;
  policy: string[];
}

function hasFile(files: WorkspaceFile[], pattern: RegExp) {
  return files.some((file) => pattern.test(`${file.category}/${file.title}/${file.summary || ""}`));
}

function node(params: Omit<WorkflowDagNode, "status"> & { ready?: boolean; done?: boolean }): WorkflowDagNode {
  return {
    ...params,
    status: params.done ? "done" : params.ready ? "ready" : "waiting",
  };
}

function buildWritingDag(params: {
  plan: PersonalOSPlan;
  skills: SkillAssembly;
  files: WorkspaceFile[];
}): WorkflowDagNode[] {
  const hasMemory = hasFile(params.files, /MEMORY|SOUL|BRIDGE|KAIROS/i);
  const hasOutline = hasFile(params.files, /大纲|章纲|outline/i);
  const hasWorld = hasFile(params.files, /世界观|world/i);
  const hasCharacters = hasFile(params.files, /主角|角色|人物|character/i);
  const hasDraft = hasFile(params.files, /第\d+章|正文|主要内容/i);
  const hasNovelSkills = params.skills.activeCoreSkills.some((skill) => /novel|tomato/i.test(skill.key));

  return [
    node({
      id: "intake",
      label: "立项/目标澄清",
      owner: "coordinator",
      ready: true,
      done: params.plan.phase !== "intake",
      dependsOn: [],
      artifacts: ["SOUL.md", "项目定位", "目标读者画像"],
      tools: ["memory.search", "skill.route"],
      verification: "能说清目标字数、题材、读者、核心爽点和当前阶段。",
    }),
    node({
      id: "canon_search",
      label: "项目真值检索",
      owner: "memory",
      ready: hasMemory,
      dependsOn: ["intake"],
      artifacts: ["MEMORY.md", "BRIDGE.md"],
      tools: ["search", "workspace.read"],
      verification: "只注入命中的摘要切片，不把全部上下文塞给模型。",
    }),
    node({
      id: "world_character",
      label: "世界观/人物挂载",
      owner: "skill",
      ready: hasNovelSkills,
      done: hasWorld && hasCharacters,
      dependsOn: ["canon_search"],
      artifacts: ["世界观", "主角", "角色关系"],
      tools: ["novel-world-overview", "novel-protagonist-dossier", "novel-relationship-map"],
      verification: "设定、人物动机、关系和禁忌边界互不冲突。",
    }),
    node({
      id: "outline",
      label: "大纲/章纲生成",
      owner: "skill",
      ready: hasWorld || hasCharacters,
      done: hasOutline,
      dependsOn: ["world_character"],
      artifacts: ["全书大框架", "章节细纲", "黄金三章"],
      tools: ["novel-book-outline", "novel-chapter-outline", "novel-golden-three-chapters"],
      verification: "每章有推进义务、冲突、爽点、伏笔和章末钩子。",
    }),
    node({
      id: "draft",
      label: "正文生产",
      owner: "skill",
      ready: hasOutline || hasDraft,
      dependsOn: ["outline"],
      artifacts: ["第N章正文", "备用片段"],
      tools: ["novel-volume-folder", "novel-style-rules", "workspace.propose_patch"],
      verification: "正文遵守章纲、角色边界、文风规则和当前读者信息边界。",
    }),
    node({
      id: "review",
      label: "评审/反崩盘闸门",
      owner: "reviewer",
      ready: hasDraft,
      dependsOn: ["draft"],
      artifacts: ["章节校验清单", "修改记录"],
      tools: ["novel-chapter-reviewer", "novel-chapter-checklist", "anti-collapse"],
      verification: "低于接收标准时只输出问题和修订草案，不直接宣称完成。",
    }),
    node({
      id: "writeback",
      label: "状态回灌/长期记忆",
      owner: "gateway",
      ready: params.plan.phase === "writeback" || hasDraft,
      dependsOn: ["review"],
      artifacts: ["MEMORY.md", "KAIROS.md", "角色状态", "伏笔账本"],
      tools: ["bridge-request", "kairos_task", "memory.writeback"],
      verification: "只回灌事实、决策、状态变化、风险和下一步动作。",
    }),
  ];
}

function buildGeneralDag(params: {
  plan: PersonalOSPlan;
}): WorkflowDagNode[] {
  return [
    node({
      id: "scope",
      label: "目标拆解",
      owner: "coordinator",
      ready: true,
      dependsOn: [],
      artifacts: ["Planner Tree"],
      tools: ["memory.search"],
      verification: "目标、约束、风险和验收标准明确。",
    }),
    node({
      id: "gather",
      label: "上下文检索",
      owner: "memory",
      ready: true,
      dependsOn: ["scope"],
      artifacts: ["MEMORY.md", "关联文件"],
      tools: ["search", "workspace.read"],
      verification: "只读取与任务直接相关的上下文。",
    }),
    node({
      id: "act",
      label: "执行/草案",
      owner: params.plan.risk === "high" ? "reviewer" : "tool",
      ready: true,
      dependsOn: ["gather"],
      artifacts: ["approval-draft", "bridge-request"],
      tools: ["run", "advance", "workspace.propose_patch"],
      verification: "写入和执行动作必须可审计、可回退。",
    }),
    node({
      id: "verify",
      label: "验证/回写",
      owner: "coordinator",
      ready: true,
      dependsOn: ["act"],
      artifacts: ["AgentRun", "MEMORY.md"],
      tools: ["status", "memory.writeback"],
      verification: "结果有证据，失败进入修订而不是假完成。",
    }),
  ];
}

export function buildWorkflowDag(params: {
  plan: PersonalOSPlan;
  skills: SkillAssembly;
  files: WorkspaceFile[];
}): WorkflowDag {
  const nodes = params.plan.domain === "writing"
    ? buildWritingDag(params)
    : buildGeneralDag({ plan: params.plan });
  const current = nodes.find((item) => item.status === "ready") || nodes[0];
  return {
    id: `dag-${params.plan.domain}-${params.plan.phase}`,
    name: params.plan.domain === "writing" ? "织梦写作生产线 DAG" : "织梦通用执行 DAG",
    domain: params.plan.domain,
    currentNodeId: current.id,
    nodes,
    gatewayActions: ["search", "run", "advance", "status"],
    policy: [
      "Coordinator 负责合并结果，不能把判断外包给子节点。",
      "可确定的步骤优先走 DAG 和工具，减少无效 token 上下文。",
      "节点未通过 verification 时，进入修订/草案，不标记完成。",
      "Gateway 只接收 bridge-request，不接受隐式执行。",
    ],
  };
}

export function workflowDagToRunPayload(dag: WorkflowDag) {
  return {
    workflow_id: dag.id,
    name: dag.name,
    current_node_id: dag.currentNodeId,
    nodes: dag.nodes.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      dependsOn: item.dependsOn,
      verification: item.verification,
    })),
  };
}

export function workflowDagToAdvancePayload(dag: WorkflowDag) {
  return {
    workflow_id: dag.id,
    completed_node_id: dag.currentNodeId,
  };
}

export function renderWorkflowDagContext(dag: WorkflowDag) {
  const rows = dag.nodes.map((item, index) => {
    const depends = item.dependsOn.length ? item.dependsOn.join(", ") : "root";
    return `${index + 1}. [${item.status}] ${item.id}｜${item.label}｜owner=${item.owner}｜depends=${depends}
   artifacts=${item.artifacts.join(" / ") || "none"}
   tools=${item.tools.join(" / ") || "none"}
   verify=${item.verification}`;
  }).join("\n");

  return `【Workflow DAG｜WorkBuddy/Hermes 状态机】
名称：${dag.name}
域：${dag.domain}
当前节点：${dag.currentNodeId}
Gateway动作：${dag.gatewayActions.join(" / ")}

节点：
${rows}

策略：
${dag.policy.map((item, index) => `${index + 1}. ${item}`).join("\n")}

Gateway 请求约定：
1. 登记当前 DAG：action=run，payload.workflow_id/name/current_node_id/nodes。
2. 推进当前节点：action=advance，payload.workflow_id/completed_node_id。
3. 查询状态：action=status，payload.workflow_id。`;
}

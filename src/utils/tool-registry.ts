import type { PersonalOSDomain, PersonalOSPlan, PersonalOSRisk } from "./personal-os";

export type ToolPermission = "read" | "propose-write" | "execute-with-approval";
export type ToolRisk = "low" | "medium" | "high";

export interface ToolSafetyLayer {
  key: string;
  label: string;
  rule: string;
}

export interface RegisteredTool {
  key: string;
  label: string;
  domain: PersonalOSDomain | "all";
  description: string;
  permission: ToolPermission;
  risk: ToolRisk;
  schema: Record<string, string>;
  safetyLayers: string[];
}

export interface ToolRouteBundle {
  tools: RegisteredTool[];
  blockedTools: RegisteredTool[];
  safetyLayers: ToolSafetyLayer[];
  approvalRequired: boolean;
}

export const SEVEN_SAFETY_LAYERS: ToolSafetyLayer[] = [
  { key: "intent", label: "意图确认", rule: "确认用户目标、任务域和输出形态，不把模糊愿望当成执行许可。" },
  { key: "scope", label: "范围约束", rule: "工具只能作用于本轮明确相关的文件、记忆、网页或任务。" },
  { key: "source", label: "来源分级", rule: "官方/开源/社区/泄露或不可复用资料必须分级标注。" },
  { key: "permission", label: "权限闸门", rule: "读操作可直接使用；写入、执行、联网、长期任务必须进入审批或草案。" },
  { key: "input", label: "输入净化", rule: "过滤命令注入、路径越界、密钥、账号密码和不可复制源码。" },
  { key: "dry_run", label: "预演差异", rule: "写入前先展示预期差异、影响面、回退方式。" },
  { key: "writeback", label: "写回审计", rule: "工具观察只以摘要、事实、风险、后续动作写入记忆。" },
];

export const TOOL_REGISTRY: RegisteredTool[] = [
  {
    key: "memory.search",
    label: "检索记忆",
    domain: "all",
    description: "检索 SOUL.md、MEMORY.md、工作区摘要和关联文件。",
    permission: "read",
    risk: "low",
    schema: { query: "string", banks: "string[]", limit: "number" },
    safetyLayers: ["intent", "scope", "writeback"],
  },
  {
    key: "skill.route",
    label: "动态挂载 Skills",
    domain: "all",
    description: "根据任务域和意图挂载合适 Skills，避免无关工具污染上下文。",
    permission: "read",
    risk: "low",
    schema: { domain: "PersonalOSDomain", intent: "string", selectedSkillIds: "string[]" },
    safetyLayers: ["intent", "scope"],
  },
  {
    key: "workspace.read",
    label: "读取工作区",
    domain: "all",
    description: "读取当前正文、显式关联文件和项目配置。",
    permission: "read",
    risk: "low",
    schema: { fileIds: "string[]", includeCurrentEditor: "boolean" },
    safetyLayers: ["scope", "input"],
  },
  {
    key: "workspace.propose_patch",
    label: "提出写入差异",
    domain: "all",
    description: "生成文件写入草案，等待用户确认后再落盘。",
    permission: "propose-write",
    risk: "medium",
    schema: { targetFileId: "string", before: "string", after: "string", reason: "string" },
    safetyLayers: ["intent", "scope", "permission", "dry_run", "writeback"],
  },
  {
    key: "novel.control_card",
    label: "章节控制卡",
    domain: "writing",
    description: "生成章节义务、人物边界、伏笔和章末钩子。",
    permission: "read",
    risk: "low",
    schema: { chapterText: "string", outline: "string", constraints: "string[]" },
    safetyLayers: ["intent", "scope", "writeback"],
  },
  {
    key: "novel.acceptance_gate",
    label: "章节接收闸门",
    domain: "writing",
    description: "检查正文是否满足节奏、伏笔、人物和平台承诺。",
    permission: "read",
    risk: "low",
    schema: { draft: "string", controlCard: "string", scoreThreshold: "number" },
    safetyLayers: ["intent", "source", "writeback"],
  },
  {
    key: "novel.writeback",
    label: "小说状态回灌",
    domain: "writing",
    description: "提出人物、世界、伏笔、读者已知信息的写回草案。",
    permission: "propose-write",
    risk: "medium",
    schema: { draft: "string", targetBanks: "string[]", proposedFacts: "string[]" },
    safetyLayers: ["intent", "scope", "permission", "dry_run", "writeback"],
  },
  {
    key: "code.search",
    label: "代码检索",
    domain: "coding",
    description: "定位相关文件、类型、脚本和本地约定。",
    permission: "read",
    risk: "low",
    schema: { query: "string", globs: "string[]" },
    safetyLayers: ["intent", "scope", "input"],
  },
  {
    key: "code.patch",
    label: "代码补丁草案",
    domain: "coding",
    description: "生成小范围补丁和验证计划。",
    permission: "propose-write",
    risk: "medium",
    schema: { files: "string[]", patchSummary: "string", verification: "string[]" },
    safetyLayers: ["intent", "scope", "permission", "dry_run", "writeback"],
  },
  {
    key: "code.verify",
    label: "代码验证命令",
    domain: "coding",
    description: "运行或建议构建、类型检查、测试命令。",
    permission: "execute-with-approval",
    risk: "high",
    schema: { command: "string", cwd: "string", timeoutMs: "number" },
    safetyLayers: ["intent", "scope", "permission", "input", "dry_run", "writeback"],
  },
  {
    key: "web.official",
    label: "官方资料检索",
    domain: "research",
    description: "优先检索官方文档、一手来源和开源仓库说明。",
    permission: "read",
    risk: "medium",
    schema: { query: "string", allowedDomains: "string[]" },
    safetyLayers: ["intent", "source", "input", "writeback"],
  },
  {
    key: "source.classify",
    label: "来源分级",
    domain: "research",
    description: "标注资料是否官方、开源、社区、泄露或不可复用。",
    permission: "read",
    risk: "low",
    schema: { url: "string", sourceKind: "string", reusePolicy: "string" },
    safetyLayers: ["source", "writeback"],
  },
  {
    key: "kairos.schedule",
    label: "KAIROS 任务草案",
    domain: "automation",
    description: "把长期目标登记为可审计任务草案。",
    permission: "propose-write",
    risk: "medium",
    schema: { objective: "string", cadence: "string", trigger: "string", nextAction: "string" },
    safetyLayers: ["intent", "permission", "dry_run", "writeback"],
  },
];

function riskAllowed(toolRisk: ToolRisk, planRisk: PersonalOSRisk) {
  if (planRisk === "high") return true;
  if (planRisk === "medium") return toolRisk !== "high";
  return toolRisk === "low";
}

export function buildToolRouteBundle(plan: PersonalOSPlan): ToolRouteBundle {
  const candidates = TOOL_REGISTRY.filter((tool) => tool.domain === "all" || tool.domain === plan.domain);
  const tools = candidates.filter((tool) => riskAllowed(tool.risk, plan.risk) || tool.permission !== "execute-with-approval");
  const blockedTools = candidates.filter((tool) => !tools.includes(tool));
  const activeLayerKeys = new Set(tools.flatMap((tool) => tool.safetyLayers));
  const safetyLayers = SEVEN_SAFETY_LAYERS.filter((layer) => activeLayerKeys.has(layer.key));
  return {
    tools,
    blockedTools,
    safetyLayers,
    approvalRequired: tools.some((tool) => tool.permission !== "read") || plan.risk !== "low",
  };
}

export function renderToolRegistryContext(bundle: ToolRouteBundle) {
  return `【Tool Registry｜动态工具组装】
可用工具：
${bundle.tools.map((tool) => `- ${tool.label}｜${tool.key}｜${tool.permission}｜risk=${tool.risk}｜${tool.description}`).join("\n") || "- 无"}

暂缓工具：
${bundle.blockedTools.map((tool) => `- ${tool.label}｜${tool.key}｜risk=${tool.risk}｜需要更高权限或更明确目标`).join("\n") || "- 无"}

7层安全防线：
${SEVEN_SAFETY_LAYERS.map((layer, index) => `${index + 1}. ${layer.label}：${layer.rule}`).join("\n")}

审批策略：${bundle.approvalRequired ? "涉及写入/执行/联网/长期任务时，只输出差异或草案，等待用户确认。" : "本轮仅使用低风险读取与分析工具。"}`;
}

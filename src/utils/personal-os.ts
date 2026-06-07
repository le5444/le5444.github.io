import type { AgentIntentPlan, RankedMemoryShard, RoutedAgentSkill } from "./agent-memory";
import type { PromptTemplate, WorkspaceFile } from "../store/workspace";
import { htmlToPlainText } from "./helpers";

export type PersonalOSDomain =
  | "writing"
  | "coding"
  | "research"
  | "project"
  | "automation"
  | "memory"
  | "general";

export type PersonalOSRisk = "low" | "medium" | "high";

export interface PersonalOSToolRoute {
  key: string;
  label: string;
  purpose: string;
  permission: "read" | "propose-write" | "execute-with-approval";
}

export interface PersonalOSSubagentRoute {
  key: string;
  label: string;
  mode: "forked-context" | "isolated-context";
  purpose: string;
}

export interface PersonalOSMemoryRoute {
  bank: string;
  label: string;
  reason: string;
  limit: number;
}

export interface PersonalOSPlanNode {
  id: string;
  title: string;
  owner: string;
  gate: string;
}

export interface PersonalOSPlan {
  mode: "personal-os-coordinator";
  domain: PersonalOSDomain;
  phase: "intake" | "retrieve" | "plan" | "act" | "verify" | "writeback";
  risk: PersonalOSRisk;
  goalMode: boolean;
  coordinatorRules: string[];
  memoryRoutes: PersonalOSMemoryRoute[];
  tools: PersonalOSToolRoute[];
  subagents: PersonalOSSubagentRoute[];
  plannerTree: PersonalOSPlanNode[];
  verificationGates: string[];
  contextPolicy: string[];
}

const DOMAIN_RULES: Array<[RegExp, PersonalOSDomain]> = [
  [/小说|章节|正文|人物|角色|世界观|大纲|伏笔|爽点|番茄|网文|写作|创作|故事|开书/, "writing"],
  [/代码|仓库|编译|bug|修复|测试|组件|接口|vite|react|python|typescript|github|codex|claude code|claudecode/i, "coding"],
  [/搜索|研究|资料|论文|网页|github|源码|架构|对比|调研|分析/, "research"],
  [/项目|计划|里程碑|任务|需求|验收|进度|管理|拆解/, "project"],
  [/定时|cron|守护|后台|自动|监控|提醒|kairos|daemon/i, "automation"],
  [/记忆|memory|归档|沉淀|长期|偏好|画像|soul|autodream|上下文/i, "memory"],
];

function detectDomain(raw: string, currentText: string): PersonalOSDomain {
  const text = `${raw}\n${currentText.slice(-1200)}`;
  const hits = DOMAIN_RULES
    .map(([pattern, domain]) => ({ domain, hit: pattern.test(text) }))
    .filter((item) => item.hit);
  if (!hits.length) return "general";
  if (hits.some((item) => item.domain === "coding") && hits.some((item) => item.domain === "research")) return "research";
  return hits[0].domain;
}

function detectRisk(raw: string): PersonalOSRisk {
  if (/删除|覆盖|执行命令|shell|bash|powershell|部署|密钥|密码|token|联网|爬取|登录|付费|支付/.test(raw)) return "high";
  if (/写入|修改|同步|回灌|生成文件|导出|安装|调用工具|长期记忆/.test(raw)) return "medium";
  return "low";
}

function detectPhase(intent: AgentIntentPlan["intent"], raw: string): PersonalOSPlan["phase"] {
  if (/回灌|同步|写入记忆|保存状态/.test(raw) || intent === "writeback") return "writeback";
  if (/验证|测试|审查|检查|验收|评分/.test(raw) || intent === "review") return "verify";
  if (/执行|开始|生成|改写|续写|修复/.test(raw) || ["continue", "rewrite"].includes(intent)) return "act";
  if (/计划|规划|拆解|架构|路线/.test(raw) || intent === "plan") return "plan";
  if (/记忆|检索|搜索|查找|研究/.test(raw) || intent === "memory_audit") return "retrieve";
  return "intake";
}

function routeMemory(domain: PersonalOSDomain, memoryCount: number): PersonalOSMemoryRoute[] {
  const base: PersonalOSMemoryRoute[] = [
    { bank: "soul", label: "SOUL.md 身份/偏好", reason: "保持长期个性化和工作边界", limit: 1 },
    { bank: "user_model", label: "Honcho 用户模型", reason: "只使用有证据、可反驳、带置信度的偏好和边界", limit: 2 },
    { bank: "working", label: "工作记忆", reason: "只携带当前任务必需摘要", limit: Math.min(4, Math.max(2, memoryCount)) },
    { bank: "tool_observations", label: "工具观察", reason: "记录命令、检索、验证结果", limit: 3 },
  ];
  if (domain === "writing") {
    base.splice(1, 0,
      { bank: "story_canon", label: "故事真值", reason: "人物、世界、伏笔不得漂移", limit: 4 },
      { bank: "chapter_state", label: "章节状态", reason: "续写和审稿必须继承上一轮状态", limit: 3 },
    );
  }
  if (domain === "coding") {
    base.splice(1, 0,
      { bank: "repo_rules", label: "项目规则", reason: "优先遵守本地项目约定和构建命令", limit: 3 },
      { bank: "change_log", label: "修改记录", reason: "避免重复改动和误回滚", limit: 3 },
    );
  }
  if (domain === "research") {
    base.splice(1, 0,
      { bank: "source_notes", label: "来源笔记", reason: "区分证据、推断和不可用资料", limit: 5 },
    );
  }
  if (domain === "automation") {
    base.splice(1, 0,
      { bank: "schedule_state", label: "长期任务状态", reason: "守护进程和定时任务必须可追踪", limit: 4 },
    );
  }
  return base;
}

function routeTools(domain: PersonalOSDomain, risk: PersonalOSRisk): PersonalOSToolRoute[] {
  const tools: PersonalOSToolRoute[] = [
    { key: "memory.search", label: "检索记忆", purpose: "先检索摘要和索引，再决定是否需要全文", permission: "read" },
    { key: "skill.route", label: "挂载 Skills", purpose: "按意图加载小说/代码/研究/项目管理技能", permission: "read" },
    { key: "workspace.read", label: "读取工作区", purpose: "读取当前文件、关联文件和项目状态", permission: "read" },
  ];
  if (domain === "writing") {
    tools.push(
      { key: "novel.control_card", label: "章节控制卡", purpose: "把创作目标压成可执行义务", permission: "read" },
      { key: "novel.acceptance_gate", label: "接收闸门", purpose: "检查正文是否满足人物/伏笔/节奏承诺", permission: "read" },
      { key: "novel.writeback", label: "状态回灌", purpose: "提出角色、世界、伏笔状态更新", permission: "propose-write" },
    );
  }
  if (domain === "coding") {
    tools.push(
      { key: "code.search", label: "代码检索", purpose: "定位相关模块、类型、构建脚本", permission: "read" },
      { key: "code.patch", label: "补丁提案", purpose: "生成小范围修改并保留验证线索", permission: "propose-write" },
      { key: "code.verify", label: "构建验证", purpose: "运行可证明当前改动的命令", permission: risk === "high" ? "execute-with-approval" : "read" },
    );
  }
  if (domain === "research") {
    tools.push(
      { key: "web.official", label: "官方资料", purpose: "优先读取官方文档和一手来源", permission: "read" },
      { key: "source.diff", label: "来源分级", purpose: "标记开源、社区、泄露/不可复用资料", permission: "read" },
    );
  }
  if (domain === "automation") {
    tools.push(
      { key: "kairos.schedule", label: "KAIROS 计划", purpose: "把长期任务登记为可审计计划", permission: "propose-write" },
      { key: "cron.draft", label: "定时草案", purpose: "只生成定时任务草案，不直接常驻运行", permission: "propose-write" },
    );
  }
  tools.push({ key: "approval.diff", label: "写入审批", purpose: "任何文件写入先展示差异和风险", permission: "propose-write" });
  return tools;
}

function routeSubagents(domain: PersonalOSDomain, risk: PersonalOSRisk): PersonalOSSubagentRoute[] {
  const routes: PersonalOSSubagentRoute[] = [
    { key: "coordinator", label: "总编排器", mode: "forked-context", purpose: "亲自综合结果，不把判断外包" },
    { key: "memory_archivist", label: "记忆归档员", mode: "forked-context", purpose: "压缩上下文并提出写回项" },
  ];
  if (domain === "writing") {
    routes.push(
      { key: "novel_orchestrator", label: "小说编排", mode: "forked-context", purpose: "调度四套小说 Skills 和织梦写作台文件" },
      { key: "continuity_reviewer", label: "连续性审稿", mode: "isolated-context", purpose: "只检查矛盾、断线和越界" },
    );
  }
  if (domain === "coding") {
    routes.push(
      { key: "code_worker", label: "代码执行", mode: "forked-context", purpose: "小范围实现和验证" },
      { key: "security_reviewer", label: "安全审查", mode: "isolated-context", purpose: "检查命令、权限和泄露风险" },
    );
  }
  if (domain === "research") {
    routes.push(
      { key: "researcher", label: "资料研究", mode: "isolated-context", purpose: "只收集证据，不替主线程判断" },
      { key: "source_checker", label: "来源审计", mode: "isolated-context", purpose: "区分官方、开源、社区和不可复用资料" },
    );
  }
  if (domain === "automation") {
    routes.push({ key: "kairos_daemon", label: "守护计划", mode: "isolated-context", purpose: "规划长期任务和唤醒条件" });
  }
  if (risk === "high") {
    routes.push({ key: "approval_guard", label: "审批守卫", mode: "isolated-context", purpose: "高风险动作必须降级为草案" });
  }
  return routes;
}

function buildPlannerTree(domain: PersonalOSDomain, phase: PersonalOSPlan["phase"]): PersonalOSPlanNode[] {
  const nodes: PersonalOSPlanNode[] = [
    { id: "P0", title: "澄清目标与权限边界", owner: "总编排器", gate: "目标、输入、禁区明确" },
    { id: "P1", title: "检索最小必要记忆", owner: "记忆归档员", gate: "只注入摘要切片和必要锚点" },
    { id: "P2", title: "挂载任务 Skills 与工具", owner: "总编排器", gate: "工具与技能和任务域匹配" },
  ];
  if (phase === "act" || phase === "writeback") {
    nodes.push({ id: "P3", title: "执行或提出写入差异", owner: domain === "coding" ? "代码执行" : domain === "writing" ? "小说编排" : "总编排器", gate: "产物可检查、可回退" });
  } else {
    nodes.push({ id: "P3", title: "形成可执行方案", owner: "总编排器", gate: "下一步能直接行动" });
  }
  nodes.push({ id: "P4", title: "验收与写回", owner: "总编排器", gate: "记录新事实、决策和工具观察" });
  return nodes;
}

export function planPersonalOS(params: {
  raw: string;
  currentText: string;
  agentPlan: AgentIntentPlan;
  memories: RankedMemoryShard[];
  routedSkills: RoutedAgentSkill[];
  selectedPrompts: PromptTemplate[];
  files: WorkspaceFile[];
}): PersonalOSPlan {
  const domain = detectDomain(params.raw, params.currentText);
  const risk = detectRisk(params.raw);
  const phase = detectPhase(params.agentPlan.intent, params.raw);
  const goalMode = /目标|goal|长期|一口气|自动|持续|直到|完整|构建|系统|操作系统|personal os/i.test(params.raw);
  const fileTitles = params.files.map((file) => file.title).join(" ");
  const hasSoul = /SOUL\.md|身份|长期偏好/i.test(fileTitles);
  const hasMemory = /MEMORY\.md|记忆|工具观察/i.test(fileTitles);

  const coordinatorRules = [
    "你是 Personal OS 总编排器，不是单轮聊天机器人。",
    "任何子代理或技能结果都必须由总编排器亲自综合，不得盲目批准。",
    "优先使用可验证的本地状态和来源证据；不能假装读取过未提供内容。",
    "泄露源码、私有密钥、受保护代码只能做风险识别，不能复制或改写进项目。",
    "高风险动作降级为计划、差异或审批请求。",
  ];
  if (!hasSoul) coordinatorRules.push("若缺少 SOUL.md，只能使用本轮明确偏好，不能伪造长期画像。");
  if (!hasMemory) coordinatorRules.push("若缺少 MEMORY.md，只能临时记忆，不声明已持久化。");

  const contextPolicy = [
    "默认 lean：摘要切片优先，全文只在任务明确需要时注入。",
    "项目真值、用户显式关联文件、当前正文的优先级高于自动召回。",
    "工具观察写入记忆前必须压缩成事实、决策、风险、后续动作四类。",
    `当前自动路由 Skills：${params.routedSkills.map((item) => item.prompt.title).join(" / ") || "无"}`,
  ];

  const verificationGates = [
    "任务域是否识别正确",
    "记忆是否足够且没有全文滥塞",
    "工具是否符合权限和风险等级",
    "输出是否可执行、可验证、可写回",
    "涉及写入/执行/联网时是否保留审批边界",
  ];

  return {
    mode: "personal-os-coordinator",
    domain,
    phase,
    risk,
    goalMode,
    coordinatorRules,
    memoryRoutes: routeMemory(domain, params.memories.length),
    tools: routeTools(domain, risk),
    subagents: routeSubagents(domain, risk),
    plannerTree: buildPlannerTree(domain, phase),
    verificationGates,
    contextPolicy,
  };
}

export function renderPersonalOSContext(plan: PersonalOSPlan) {
  return `【Personal OS Coordinator｜总编排模式】
模式：${plan.goalMode ? "Goal Mode / 长期目标推进" : "Task Mode / 当前任务执行"}
任务域：${plan.domain}
阶段：${plan.phase}
风险：${plan.risk}

编排铁律：
${plan.coordinatorRules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}

Planner Tree：
${plan.plannerTree.map((node) => `${node.id}. ${node.title}｜owner=${node.owner}｜gate=${node.gate}`).join("\n")}

记忆路由：
${plan.memoryRoutes.map((route) => `- ${route.label}｜bank=${route.bank}｜limit=${route.limit}｜${route.reason}`).join("\n")}

工具路由：
${plan.tools.map((tool) => `- ${tool.label}｜${tool.key}｜${tool.permission}｜${tool.purpose}`).join("\n")}

子代理路由：
${plan.subagents.map((agent) => `- ${agent.label}｜${agent.key}｜${agent.mode}｜${agent.purpose}`).join("\n")}

上下文策略：
${plan.contextPolicy.map((item, index) => `${index + 1}. ${item}`).join("\n")}

验收闸门：
${plan.verificationGates.map((gate, index) => `${index + 1}. ${gate}`).join("\n")}`;
}

export function summarizeWorkspaceForPersonalOS(files: WorkspaceFile[]) {
  return files
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)
    .map((file) => `${file.category}/${file.title}: ${htmlToPlainText(file.summary || file.content).slice(0, 120)}`)
    .join("\n");
}

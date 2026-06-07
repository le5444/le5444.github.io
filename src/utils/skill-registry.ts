import type { PersonalOSDomain, PersonalOSPlan } from "./personal-os";
import type { PromptTemplate } from "../store/workspace";

export type SkillScope = "global" | "writing" | "coding" | "research" | "automation";

export interface CoreSkillSpec {
  key: string;
  label: string;
  scope: SkillScope;
  source: "codex-local" | "workspace" | "built-in";
  purpose: string;
  trigger: RegExp;
  memoryBanks: string[];
  safetyNote: string;
}

export interface SkillAssembly {
  activeCoreSkills: CoreSkillSpec[];
  activeWorkspaceSkills: PromptTemplate[];
  isolatedSkills: CoreSkillSpec[];
  reason: string[];
}

export const CORE_CODEX_NOVEL_SKILLS: CoreSkillSpec[] = [
  {
    key: "novel-creation-suite",
    label: "小说全链路创作套件",
    scope: "writing",
    source: "codex-local",
    purpose: "统筹立项、设定、人物、大纲、正文、审稿、复盘。",
    trigger: /小说|网文|长篇|开书|章节|正文|故事|创作/,
    memoryBanks: ["story_canon", "chapter_state", "style_guide", "continuity_facts"],
    safetyNote: "只能输出原创方案，不复刻参考作品的专有设定、桥段或表达。",
  },
  {
    key: "novel-kb-manager",
    label: "小说分层知识库管理器",
    scope: "writing",
    source: "codex-local",
    purpose: "管理项目真值、人物状态、伏笔、世界规则和写后回灌。",
    trigger: /记忆|知识库|伏笔|人物状态|世界规则|回灌|一致性/,
    memoryBanks: ["story_canon", "entity_state", "world_state", "tool_observations"],
    safetyNote: "写回必须先形成差异草案，避免覆盖用户手写设定。",
  },
  {
    key: "novel-distillation",
    label: "小说机制蒸馏",
    scope: "writing",
    source: "codex-local",
    purpose: "把可借鉴作品拆成结构、节奏、信息释放和冲突机制。",
    trigger: /拆书|蒸馏|借鉴|学习|参考|机制|套路/,
    memoryBanks: ["source_notes", "style_guide", "skill_notes"],
    safetyNote: "只提炼机制，不复制原句、人物名、专有世界观或标志性桥段。",
  },
  {
    key: "tomato-novel-auto-distill",
    label: "番茄小说自动蒸馏",
    scope: "writing",
    source: "codex-local",
    purpose: "面向番茄/免费文节奏做开篇、追读、爽点和章节钩子分析。",
    trigger: /番茄|免费文|追读|完读|爽点|黄金三章|开篇/,
    memoryBanks: ["reader_promise", "hook_rhythm", "retention_design"],
    safetyNote: "平台适配只优化节奏和承诺，不制造低质套路堆叠。",
  },
];

export const GENERAL_PERSONAL_OS_SKILLS: CoreSkillSpec[] = [
  {
    key: "personal-os-coordinator",
    label: "Personal OS 总编排",
    scope: "global",
    source: "built-in",
    purpose: "统筹记忆、工具、技能、验收、写回和长期任务。",
    trigger: /./,
    memoryBanks: ["soul", "working", "tool_observations"],
    safetyNote: "总编排器必须亲自综合结果，不盲目批准子任务输出。",
  },
  {
    key: "source-integrity",
    label: "来源完整性审计",
    scope: "research",
    source: "built-in",
    purpose: "区分官方、开源、社区、泄露/不可复用资料。",
    trigger: /github|源码|泄露|研究|资料|claude|codex|manus|devin/i,
    memoryBanks: ["source_notes", "tool_observations"],
    safetyNote: "泄露源码只能做风险识别和高层架构对比，不复制代码。",
  },
  {
    key: "autodream-skill-crystallizer",
    label: "AutoDream 技能结晶",
    scope: "global",
    source: "built-in",
    purpose: "把反复成功的工具观察、长期记忆和项目流程沉淀为可审查 Skill 草案。",
    trigger: /skill|技能|结晶|沉淀|复用|进化|autodream|长期记忆/i,
    memoryBanks: ["skill", "tool_observations", "project"],
    safetyNote: "只生成草案和候选记录，不自动执行新脚本；启用前需要人工审查。",
  },
];

function domainToScope(domain: PersonalOSDomain): SkillScope {
  if (["writing", "coding", "research", "automation"].includes(domain)) return domain as SkillScope;
  return "global";
}

export function assembleSkills(params: {
  plan: PersonalOSPlan;
  raw: string;
  workspaceSkills: PromptTemplate[];
}): SkillAssembly {
  const scope = domainToScope(params.plan.domain);
  const core = [...GENERAL_PERSONAL_OS_SKILLS, ...CORE_CODEX_NOVEL_SKILLS];
  const activeCoreSkills = core.filter((skill) => {
    const scopeMatch = skill.scope === "global" || skill.scope === scope;
    return scopeMatch && skill.trigger.test(params.raw);
  });
  const isolatedSkills = core.filter((skill) => skill.scope !== "global" && skill.scope !== scope && skill.trigger.test(params.raw));
  const activeWorkspaceSkills = params.workspaceSkills.slice(0, 6);
  const reason = [
    `任务域：${params.plan.domain}`,
    `核心 Skills：${activeCoreSkills.map((skill) => skill.label).join(" / ") || "无"}`,
    `工作区 Skills：${activeWorkspaceSkills.map((skill) => skill.title).join(" / ") || "无"}`,
  ];
  return { activeCoreSkills, activeWorkspaceSkills, isolatedSkills, reason };
}

export function renderSkillAssemblyContext(assembly: SkillAssembly) {
  const core = assembly.activeCoreSkills
    .map((skill) => `- ${skill.label}｜${skill.key}｜${skill.source}｜banks=${skill.memoryBanks.join(",")}｜${skill.purpose}\n  安全：${skill.safetyNote}`)
    .join("\n");
  const workspace = assembly.activeWorkspaceSkills
    .map((skill) => `- ${skill.title}｜${skill.category}｜${skill.primarySkill || "未标注"}`)
    .join("\n");
  const isolated = assembly.isolatedSkills
    .map((skill) => `- ${skill.label}｜${skill.key}｜scope=${skill.scope}｜本轮隔离，不注入全文`)
    .join("\n");

  return `【Skills Assembly｜动态技能矩阵】
核心 Skills：
${core || "- 无"}

工作区 Skills：
${workspace || "- 无"}

隔离 Skills：
${isolated || "- 无"}

挂载理由：
${assembly.reason.map((item, index) => `${index + 1}. ${item}`).join("\n")}`;
}

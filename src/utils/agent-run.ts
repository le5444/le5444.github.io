import type { RankedMemoryShard, RoutedAgentSkill } from "./agent-memory";
import type { PersonalOSPlan } from "./personal-os";
import type { AutoDreamL1Event } from "./autodream";
import { createAutoDreamEvent } from "./autodream";
import { uid } from "./helpers";

export type AgentRunStatus = "running" | "completed" | "failed" | "aborted";

export interface AgentRunStep {
  id: string;
  at: number;
  label: string;
  detail: string;
  status: "planned" | "done" | "failed";
}

export interface AgentRunRecord {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: AgentRunStatus;
  userText: string;
  selectedFileTitle?: string;
  plan: PersonalOSPlan;
  memoryTitles: string[];
  skillTitles: string[];
  steps: AgentRunStep[];
  responsePreview?: string;
  error?: string;
}

function step(label: string, detail: string, status: AgentRunStep["status"] = "planned"): AgentRunStep {
  return { id: uid(), at: Date.now(), label, detail, status };
}

export function createAgentRun(params: {
  userText: string;
  selectedFileTitle?: string;
  plan: PersonalOSPlan;
  memories: RankedMemoryShard[];
  routedSkills: RoutedAgentSkill[];
}): AgentRunRecord {
  return {
    id: uid(),
    startedAt: Date.now(),
    status: "running",
    userText: params.userText,
    selectedFileTitle: params.selectedFileTitle,
    plan: params.plan,
    memoryTitles: params.memories.map((memory) => `${memory.category}/${memory.title}`).slice(0, 8),
    skillTitles: params.routedSkills.map((skill) => skill.prompt.title).slice(0, 6),
    steps: [
      step("Planner Tree", `${params.plan.domain}/${params.plan.phase}/${params.plan.risk}`, "done"),
      step("Memory Route", params.memories.map((memory) => memory.title).join(" / ") || "无自动记忆", "done"),
      step("Skill Route", params.routedSkills.map((skill) => skill.prompt.title).join(" / ") || "无自动 Skill", "done"),
      step("LLM Call", "等待模型返回", "planned"),
    ],
  };
}

export function completeAgentRun(run: AgentRunRecord, response: string): AgentRunRecord {
  return {
    ...run,
    status: "completed",
    finishedAt: Date.now(),
    responsePreview: response.replace(/\s+/g, " ").trim().slice(0, 520),
    steps: run.steps.map((item) => item.label === "LLM Call" ? { ...item, status: "done" as const, detail: "模型已返回" } : item)
      .concat(step("Verification", "已形成可写回工具观察，等待后续人工/自动验收", "done")),
  };
}

export function failAgentRun(run: AgentRunRecord, error: string, status: AgentRunStatus = "failed"): AgentRunRecord {
  return {
    ...run,
    status,
    finishedAt: Date.now(),
    error,
    steps: run.steps.map((item) => item.label === "LLM Call" ? { ...item, status: "failed" as const, detail: error } : item),
  };
}

export function renderAgentRunObservation(run: AgentRunRecord) {
  const duration = run.finishedAt ? `${Math.max(1, Math.round((run.finishedAt - run.startedAt) / 1000))}s` : "running";
  const steps = run.steps.map((item) => `- ${item.status.toUpperCase()} ${item.label}: ${item.detail}`).join("\n");
  return `AgentRun ${run.id}
状态：${run.status}
耗时：${duration}
文件：${run.selectedFileTitle || "-"}
任务域：${run.plan.domain}
阶段：${run.plan.phase}
风险：${run.plan.risk}
用户指令：${run.userText.slice(0, 240)}
记忆命中：${run.memoryTitles.join(" / ") || "无"}
Skill 路由：${run.skillTitles.join(" / ") || "无"}
步骤：
${steps}
结果摘要：${run.responsePreview || run.error || "-"}`;
}

export function agentRunToAutoDreamEvents(run: AgentRunRecord): AutoDreamL1Event[] {
  const observation = renderAgentRunObservation(run);
  const events: AutoDreamL1Event[] = [
    createAutoDreamEvent({
      source: "AgentRun",
      title: `${run.plan.domain}/${run.plan.phase}`,
      content: observation,
      dimension: "tool",
      tags: ["agent-run", run.plan.domain, run.plan.phase, run.plan.risk],
      salience: run.status === "completed" ? 7 : 5,
      at: run.finishedAt ?? run.startedAt,
    }),
  ];

  if (run.plan.goalMode || run.userText.length > 80) {
    events.push(createAutoDreamEvent({
      source: "UserGoal",
      title: "用户目标片段",
      content: run.userText,
      dimension: "project",
      tags: ["goal", run.plan.domain],
      salience: 6,
      at: run.startedAt,
    }));
  }

  if (run.skillTitles.length) {
    events.push(createAutoDreamEvent({
      source: "SkillRoute",
      title: "本轮技能路由",
      content: run.skillTitles.join(" / "),
      dimension: "skill",
      tags: ["skill-route", run.plan.domain],
      salience: 4,
      at: run.finishedAt ?? run.startedAt,
    }));
  }

  return events;
}

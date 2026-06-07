import type { PersonalOSPlan } from "./personal-os";
import { htmlToPlainText, uid } from "./helpers";

export type KairosTaskStatus = "draft" | "active" | "paused" | "done";

export interface KairosTask {
  id: string;
  createdAt: number;
  status: KairosTaskStatus;
  objective: string;
  domain: string;
  cadence: "manual" | "daily" | "weekly" | "on-idle";
  trigger: string;
  nextAction: string;
  safetyNote: string;
}

export interface KairosLogEntry {
  id: string;
  at: number;
  taskId: string;
  event: "created" | "observed" | "proposed" | "completed" | "paused";
  summary: string;
}

function compact(text: string, max = 240) {
  return htmlToPlainText(text || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function createKairosTask(params: {
  objective: string;
  plan: PersonalOSPlan;
  nextAction?: string;
  cadence?: KairosTask["cadence"];
  trigger?: string;
  at?: number;
}): KairosTask {
  const at = params.at ?? Date.now();
  const objective = compact(params.objective, 360) || "未命名长期目标";
  const cadence = params.cadence ?? (params.plan.goalMode ? "on-idle" : "manual");
  return {
    id: `kairos-${uid()}`,
    createdAt: at,
    status: "draft",
    objective,
    domain: params.plan.domain,
    cadence,
    trigger: params.trigger || (cadence === "on-idle" ? "系统空闲且用户已确认长期目标" : "用户手动触发"),
    nextAction: params.nextAction || params.plan.plannerTree[0]?.title || "确认下一步",
    safetyNote: params.plan.risk === "high"
      ? "高风险目标必须保持草案状态，直到用户明确批准。"
      : "append-only 记录；执行前仍需确认写入或外部动作。",
  };
}

export function createKairosLog(task: KairosTask, event: KairosLogEntry["event"], summary: string, at = Date.now()): KairosLogEntry {
  return {
    id: `log-${uid()}`,
    at,
    taskId: task.id,
    event,
    summary: compact(summary, 360),
  };
}

export function renderKairosMarkdown(params: {
  task: KairosTask;
  logs: KairosLogEntry[];
  at?: number;
}) {
  const at = new Date(params.at ?? Date.now()).toLocaleString();
  const task = params.task;
  const logs = params.logs
    .map((log) => `- ${new Date(log.at).toLocaleString()}｜${log.event}｜${log.summary}`)
    .join("\n");
  return `\n\n---\n\n## KAIROS ${at}\n\n### 任务\n- id：${task.id}\n- 状态：${task.status}\n- 领域：${task.domain}\n- 节奏：${task.cadence}\n- 触发：${task.trigger}\n- 目标：${task.objective}\n- 下一步：${task.nextAction}\n- 安全注记：${task.safetyNote}\n\n### Append-only 日志\n${logs || "- 无"}\n`;
}

export function appendKairosMarkdown(existingContent: string, params: {
  task: KairosTask;
  logs: KairosLogEntry[];
  at?: number;
}) {
  const base = existingContent?.trim()
    ? existingContent.trim()
    : "## KAIROS 任务队列\n\n- 这里记录长期目标、空闲触发、下一步动作和 append-only 日志。\n- 当前版本只生成任务草案，不自动常驻执行。\n";
  return `${base}${renderKairosMarkdown(params)}`;
}

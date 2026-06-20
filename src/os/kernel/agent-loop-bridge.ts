import type { ExecutorActionKind, ExecutorBridgeRequest, ExecutorBridgeRequestStatus } from "../../utils/executor-bridge";

function bridgeDisplayText(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text || "");
      if (item && typeof item === "object" && "image_url" in item) return "[图片]";
      return "";
    }).filter(Boolean).join("\n");
  }
  return String(value || "");
}

export const AUTO_SUBMIT_BRIDGE_ACTIONS = new Set<ExecutorActionKind>([
  "status",
  "runtime_events",
  "approval_status",
  "context_pack",
  "provider_catalog",
  "provider_config_status",
  "provider_status",
  "memory_status",
  "memory_retrieve",
  "skill_status",
  "skill_route",
  "worker_status",
  "scheduler_status",
  "sandbox_status",
  "subagent_status",
  "user_model_status",
]);

export function canAutoSubmitBridgeRequest(request: ExecutorBridgeRequest) {
  if (request.approvalRequired) return false;
  if (request.validation.some((item) => item.severity === "block")) return false;
  if (!AUTO_SUBMIT_BRIDGE_ACTIONS.has(request.action)) return false;
  if (request.payload.execute === true || request.payload.execute_model === true) return false;
  return true;
}

export function renderBridgeResultForChat(
  request: ExecutorBridgeRequest,
  data: Record<string, unknown>,
  status: ExecutorBridgeRequestStatus,
) {
  const preview = JSON.stringify(data, null, 2).slice(0, 1800);
  return [
    `工具结果：${request.action}`,
    `状态：${status}`,
    `目的：${request.purpose}`,
    "",
    "摘要：",
    preview || "Gateway 已返回空结果。",
  ].join("\n");
}

export function buildOneShotToolFollowupPrompt(params: {
  userText: string;
  toolResultTexts: string[];
}) {
  const toolResultContext = params.toolResultTexts.map((text, index) => `【工具结果 ${index + 1}】\n${text}`).join("\n\n");
  return [
    "你刚刚请求了本地只读工具，下面是工具返回结果。",
    "请基于这些结果继续完成用户任务；不要再次输出 <bridge-request>，除非仍然缺少必要信息。",
    "",
    `【用户任务】\n${params.userText}`,
    "",
    toolResultContext,
  ].join("\n");
}

export interface AgentLoopApprovalResumeItem {
  id: string;
  action?: string;
  status?: string;
  message?: string;
  target?: string;
  result?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  request?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function clipEvidence(value: unknown, limit = 1200) {
  const text = asString(value).trimEnd();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}\n...已截断 ${text.length - limit} 字符` : text;
}

function approvalExecutionEvidence(item: AgentLoopApprovalResumeItem) {
  const result = asRecord(item.result);
  const decision = asRecord(item.decision);
  const request = asRecord(item.request);
  const commandResult = asRecord(
    decision.run_command
    || result.run_command
    || result.command_execution
    || asRecord(result.approval_decide).run_command
    || asRecord(asRecord(result.approval_decide).decision).run_command,
  );
  const writeResult = asRecord(
    decision.write_file
    || result.write_file
    || asRecord(result.approval_decide).write_file
    || asRecord(asRecord(result.approval_decide).decision).write_file,
  );
  const providerProbe = asRecord(
    decision.provider_probe
    || result.provider_probe
    || asRecord(result.approval_decide).provider_probe
    || asRecord(asRecord(result.approval_decide).decision).provider_probe,
  );
  const memoryResult = asRecord(
    decision.memory_management
    || result.memory_management
    || asRecord(result.approval_decide).memory_management
    || asRecord(asRecord(result.approval_decide).decision).memory_management,
  );

  if (Object.keys(commandResult).length) {
    const stdout = clipEvidence(commandResult.stdout, 1400);
    const stderr = clipEvidence(commandResult.stderr, 1400);
    return [
      "  命令执行证据：",
      `  - 命令：${asString(request.command, asString(asRecord(request.payload).command, item.target || "")) || item.target || "未声明"}`,
      `  - 状态：${asString(commandResult.status, item.status || "unknown")}`,
      `  - 退出码：${asString(commandResult.returncode, "-")}`,
      commandResult.cwd ? `  - 工作目录：${asString(commandResult.cwd)}` : "",
      commandResult.argv ? `  - argv：${JSON.stringify(commandResult.argv)}` : "",
      stdout ? `  - stdout：\n${stdout.split("\n").map((line) => `    ${line}`).join("\n")}` : "",
      stderr ? `  - stderr：\n${stderr.split("\n").map((line) => `    ${line}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
  }

  if (Object.keys(writeResult).length) {
    return [
      "  写入执行证据：",
      `  - 路径：${asString(writeResult.path, item.target || "") || item.target || "未声明"}`,
      writeResult.backup_path ? `  - 备份：${asString(writeResult.backup_path)}` : "",
      writeResult.sha256 ? `  - sha256：${asString(writeResult.sha256)}` : "",
      writeResult.bytes !== undefined ? `  - 字节：${asString(writeResult.bytes)}` : "",
      writeResult.message ? `  - 结果：${asString(writeResult.message)}` : "",
    ].filter(Boolean).join("\n");
  }

  if (Object.keys(providerProbe).length) {
    return [
      "  模型探针证据：",
      `  - 状态：${asString(providerProbe.status, item.status || "unknown")}`,
      providerProbe.url ? `  - 端点：${asString(providerProbe.url)}` : "",
      providerProbe.model_count !== undefined ? `  - 模型数：${asString(providerProbe.model_count)}` : "",
      providerProbe.reason ? `  - 说明：${asString(providerProbe.reason)}` : "",
    ].filter(Boolean).join("\n");
  }

  if (Object.keys(memoryResult).length) {
    return [
      "  记忆管理证据：",
      `  - 状态：${asString(memoryResult.status, item.status || "unknown")}`,
      memoryResult.target_id ? `  - 目标：${asString(memoryResult.target_id)}` : "",
      memoryResult.message ? `  - 结果：${asString(memoryResult.message)}` : "",
    ].filter(Boolean).join("\n");
  }

  return "";
}

function approvalResumeLine(item: AgentLoopApprovalResumeItem, index: number) {
  const base = [
    `${index + 1}.`,
    item.id ? `审批：${item.id}` : "",
    item.action ? `动作：${item.action}` : "",
    item.status ? `状态：${item.status}` : "",
    item.target ? `目标：${item.target}` : "",
    item.message ? `结果：${item.message}` : "",
  ].filter(Boolean).join(" ");
  const evidence = approvalExecutionEvidence(item);
  return [base, evidence].filter(Boolean).join("\n");
}

function compactEvidenceLine(value: string, limit = 420) {
  const text = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" · ");
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function buildAgentLoopApprovalResumeEvidenceSummary(params: {
  approvals: AgentLoopApprovalResumeItem[];
  fallbackDetail?: string;
  maxItems?: number;
}) {
  const maxItems = Math.max(1, params.maxItems || 4);
  const lines = params.approvals
    .filter((item) => item.id || item.action || item.status || item.message || item.target)
    .slice(0, maxItems)
    .map((item, index) => {
      const base = [
        `${index + 1}.`,
        item.action || "approval",
        item.status ? `状态 ${item.status}` : "",
        item.target ? `目标 ${item.target}` : "",
        item.id ? `审批 ${item.id}` : "",
      ].filter(Boolean).join(" · ");
      const evidence = compactEvidenceLine(approvalExecutionEvidence(item));
      const message = item.message ? compactEvidenceLine(item.message, 180) : "";
      return [base, evidence || message].filter(Boolean).join("\n");
    });
  if (params.approvals.length > maxItems) {
    lines.push(`...另有 ${params.approvals.length - maxItems} 个审批结果未展开。`);
  }
  return lines.length
    ? lines.join("\n")
    : params.fallbackDetail?.trim() || "审批结果已返回，但当前没有更详细的 Gateway 摘要。";
}

export function buildAgentLoopApprovalResumePrompt(params: {
  task: string;
  approvals: AgentLoopApprovalResumeItem[];
  fallbackDetail?: string;
}) {
  const task = params.task.trim();
  const approvalLines = params.approvals
    .filter((item) => item.id || item.action || item.status || item.message || item.target)
    .map((item, index) => approvalResumeLine(item, index));
  const approvalText = approvalLines.length
    ? approvalLines.join("\n")
    : params.fallbackDetail?.trim() || "审批结果已返回，但当前没有更详细的 Gateway 摘要。";
  return [
    task || "继续完成原任务。",
    "",
    "## 审批结果已返回",
    approvalText,
    "",
    "请基于审批结果继续完成原任务。",
    "如果写入已执行，先使用现有上下文和工具结果复核，再继续下一步。",
    "如果审批被拒绝或执行失败，不要假装已完成；说明阻塞点并给出下一步可选方案。",
    "任务完成时回复 ZHIMENG_TASK_COMPLETE。",
  ].join("\n");
}

export function stripAgentProtocolForChatDisplay(value: unknown, fallback = "") {
  const original = bridgeDisplayText(value);
  const hadProtocol = /<bridge-request\b|<\/bridge-request>|ZHIMENG_TASK_COMPLETE|LUMENOS_TASK_COMPLETE/i.test(original);
  const text = original
    .replace(/<bridge-request\b[^>]*>[\s\S]*?<\/bridge-request>/gi, "")
    .replace(/<bridge-request\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<\/bridge-request>/gi, "")
    .replace(/\b(?:ZHIMENG|LUMENOS)_TASK_COMPLETE\b/gi, "")
    .replace(/^\s*(?:任务完成|TASK\s*COMPLETE)\s*[:：]?\s*$/gim, "")
    .replace(/```(?:json|xml|text|markdown)?\s*```/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text) return text;
  if (hadProtocol) return "已生成本地工具请求，正在交给网关处理。";
  return fallback;
}

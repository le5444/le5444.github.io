import type { PersonalOSPlan } from "./personal-os";
import type { ToolRouteBundle } from "./tool-registry";
import { type CommandDraft, type CommandValidationResult, validateCommandDraft } from "./command-validators";
import { uid } from "./helpers";

export type ExecutorBridgeMode = "dry-run" | "approval-required" | "disabled";
export type ExecutorActionKind = "search" | "run" | "advance" | "status" | "approval_status" | "runtime_events" | "approval_decide" | "memory_event" | "memory_bootstrap" | "memory_consolidate" | "memory_status" | "memory_backup_status" | "memory_retrieve" | "memory_restore" | "context_pack" | "source_audit" | "source_digest" | "goal_bootstrap" | "skill_bootstrap" | "skill_route" | "skill_invoke" | "skill_crystallize" | "skill_review" | "skill_activate" | "skill_run" | "skill_status" | "scheduler_plan" | "scheduler_install" | "scheduler_uninstall" | "scheduler_status" | "worker_run" | "worker_status" | "worker_cancel" | "worker_merge_proposal" | "swarm_bootstrap" | "safety_review" | "sandbox_probe" | "sandbox_status" | "phase_audit" | "completion_audit" | "evolution_bootstrap" | "user_model_event" | "user_model_reflect" | "user_model_status" | "subagent_spawn" | "lock_acquire" | "lock_release" | "subagent_status" | "read_file" | "workspace_scan" | "write_file" | "run_command" | "web_fetch" | "mcp_stdio_catalog" | "mcp_call" | "provider_catalog" | "provider_status" | "provider_probe" | "kairos_task" | "kairos_tick";
export type ExecutorBridgeRequestStatus = "draft" | "submitted" | "completed" | "blocked" | "rejected";

export interface ExecutorBridgeManifest {
  name: "LumenOS Agent Gateway";
  mode: ExecutorBridgeMode;
  protocolVersion: "0.2";
  endpointHint: string;
  allowedActions: ExecutorActionKind[];
  deniedActions: ExecutorActionKind[];
  safety: string[];
}

export interface ExecutorBridgeRequest {
  id: string;
  createdAt: number;
  status: ExecutorBridgeRequestStatus;
  mode: ExecutorBridgeMode;
  action: ExecutorActionKind;
  purpose: string;
  payload: Record<string, unknown>;
  validation: CommandValidationResult[];
  approvalRequired: boolean;
  lastResult?: Record<string, unknown>;
}

export const DEFAULT_EXECUTOR_BRIDGE: ExecutorBridgeManifest = {
  name: "LumenOS Agent Gateway",
  mode: "dry-run",
  protocolVersion: "0.2",
  endpointHint: "http://127.0.0.1:8765/bridge",
  allowedActions: ["search", "run", "advance", "status", "approval_status", "runtime_events", "approval_decide", "memory_event", "memory_bootstrap", "memory_consolidate", "memory_status", "memory_backup_status", "memory_retrieve", "memory_restore", "context_pack", "source_audit", "source_digest", "goal_bootstrap", "skill_bootstrap", "skill_route", "skill_invoke", "skill_crystallize", "skill_review", "skill_activate", "skill_run", "skill_status", "scheduler_plan", "scheduler_install", "scheduler_uninstall", "scheduler_status", "worker_run", "worker_status", "worker_cancel", "worker_merge_proposal", "swarm_bootstrap", "safety_review", "sandbox_probe", "sandbox_status", "phase_audit", "completion_audit", "evolution_bootstrap", "user_model_event", "user_model_reflect", "user_model_status", "subagent_spawn", "lock_acquire", "lock_release", "subagent_status", "read_file", "workspace_scan", "write_file", "run_command", "web_fetch", "mcp_stdio_catalog", "mcp_call", "provider_catalog", "provider_status", "provider_probe", "kairos_task", "kairos_tick"],
  deniedActions: [],
  safety: [
    "浏览器前端不直接执行命令。",
    "前端只能提交 bridge-request；本地 Gateway 负责验证、记录和返回状态。",
    "run_command 必须先通过 23 个命令验证器；只有 Gateway 显式 --execute-command 且 payload.execute=true 时，才允许少量验证命令 allowlist 执行。",
    "workspace_scan 只列目录元数据，不读取文件正文；只有 Gateway 显式 --execute-read 且 payload.execute=true 时，才允许执行。",
    "write_file 默认生成 approval-draft；只有 Gateway 显式 --execute-write 且 payload.execute=true 时，才允许工作区写入，并自动备份。",
    "approval_status 只读查看审批队列；approval_decide 只能拒绝审批，或在 Gateway --execute-write 下执行已排队的 write_file 审批，或在 --execute-memory 下执行已排队的 Memory 管理审批，或在 --execute-provider 下执行已排队的 provider_probe 审批。",
    "文件工具默认工作区沙箱；full_access 文件路径需要 Gateway --full-access-files 与 payload.access_profile=full_access。",
    "scheduler_install/scheduler_uninstall 默认只返回审批；只有 Gateway 显式 --execute-scheduler 且 payload.execute=true 时才会调用 Windows schtasks。",
    "mcp_call 默认只返回审批；只有 Gateway 显式 --execute-mcp 且 payload.execute=true 时才会调用 HTTP JSON-RPC MCP 端点或注册表内置 stdio MCP 服务。",
    "provider_catalog/provider_status 只读模型供应商注册表；provider_probe 默认只生成审批草案，审批后执行仍需要 Gateway --execute-provider、payload.execute=true，远程端点还需要 allow_remote_model=true。",
    "skill_route/skill_invoke 可以读取本地或内置 SKILL.md 作为指令上下文；skill_run 只有 Gateway 显式 --execute-skill 且 payload.execute=true 时才运行已激活脚本。",
    "模型 worker 只有 payload.execute_model=true 才调用 provider；远程端点还要 allow_remote_model=true，执行时走受控子进程，worker_cancel 只能终止已登记的 worker PID。",
    "所有外部动作写入 AgentRun 与 MEMORY.md。",
    "KAIROS 任务只登记草案，不自动常驻执行。",
  ],
};

function actionNeedsApproval(action: ExecutorActionKind) {
  return ["approval_decide", "memory_restore", "write_file", "run_command", "web_fetch", "mcp_call", "provider_probe", "kairos_task", "scheduler_install", "scheduler_uninstall", "skill_run"].includes(action);
}

const EXECUTOR_ACTIONS: ExecutorActionKind[] = ["search", "run", "advance", "status", "approval_status", "runtime_events", "approval_decide", "memory_event", "memory_bootstrap", "memory_consolidate", "memory_status", "memory_backup_status", "memory_retrieve", "memory_restore", "context_pack", "source_audit", "source_digest", "goal_bootstrap", "skill_bootstrap", "skill_route", "skill_invoke", "skill_crystallize", "skill_review", "skill_activate", "skill_run", "skill_status", "scheduler_plan", "scheduler_install", "scheduler_uninstall", "scheduler_status", "worker_run", "worker_status", "worker_cancel", "worker_merge_proposal", "swarm_bootstrap", "safety_review", "sandbox_probe", "sandbox_status", "phase_audit", "completion_audit", "evolution_bootstrap", "user_model_event", "user_model_reflect", "user_model_status", "subagent_spawn", "lock_acquire", "lock_release", "subagent_status", "read_file", "workspace_scan", "write_file", "run_command", "web_fetch", "mcp_stdio_catalog", "mcp_call", "provider_catalog", "provider_status", "provider_probe", "kairos_task", "kairos_tick"];

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeAction(value: unknown): ExecutorActionKind | null {
  const action = String(value || "").trim() as ExecutorActionKind;
  return EXECUTOR_ACTIONS.includes(action) ? action : null;
}

function normalizePayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bridgeRequestRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.requests)) {
      return record.requests.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
    }
    return [record];
  }
  return [];
}

function executorBridgeRequestFromRecord(record: Record<string, unknown>, manifest: ExecutorBridgeManifest) {
  const action = normalizeAction(record.action);
  if (!action || manifest.deniedActions.includes(action)) return null;
  const payload = normalizePayload(record.payload);
  const purpose = String(record.purpose || record.reason || "AI 请求调用本地执行桥").trim();
  return createExecutorBridgeRequest({
    manifest,
    action,
    purpose,
    payload,
    commandDraft: action === "run_command"
      ? { command: String(payload.command || ""), cwd: String(payload.cwd || ""), purpose }
      : undefined,
  });
}

export function buildExecutorBridgeManifest(params: {
  plan: PersonalOSPlan;
  tools: ToolRouteBundle;
}): ExecutorBridgeManifest {
  const needsApproval = params.tools.approvalRequired || params.plan.risk !== "low";
  return {
    ...DEFAULT_EXECUTOR_BRIDGE,
    mode: needsApproval ? "approval-required" : "dry-run",
    deniedActions: params.plan.risk === "high" ? ["run_command", "web_fetch"] : [],
  };
}

export function createExecutorBridgeRequest(params: {
  manifest: ExecutorBridgeManifest;
  action: ExecutorActionKind;
  purpose: string;
  payload: Record<string, unknown>;
  commandDraft?: CommandDraft;
  at?: number;
}): ExecutorBridgeRequest {
  const validation = params.action === "run_command"
    ? validateCommandDraft(params.commandDraft || { command: String(params.payload.command || ""), cwd: String(params.payload.cwd || ""), purpose: params.purpose })
    : [];
  const blocked = validation.some((item) => item.severity === "block");
  return {
    id: `exec-${uid()}`,
    createdAt: params.at ?? Date.now(),
    status: "draft",
    mode: blocked ? "approval-required" : params.manifest.mode,
    action: params.action,
    purpose: params.purpose,
    payload: params.payload,
    validation,
    approvalRequired: blocked || actionNeedsApproval(params.action) || params.manifest.mode !== "dry-run",
  };
}

export function extractExecutorBridgeRequestsFromText(text: string, manifest: ExecutorBridgeManifest = DEFAULT_EXECUTOR_BRIDGE): ExecutorBridgeRequest[] {
  const matches = [...(text || "").matchAll(/<bridge-request>([\s\S]*?)<\/bridge-request>/gi)];
  return matches
    .flatMap((match) => {
      try {
        const parsed = JSON.parse(stripCodeFence(match[1])) as unknown;
        return bridgeRequestRecords(parsed)
          .map((record) => executorBridgeRequestFromRecord(record, manifest))
          .filter((item): item is ExecutorBridgeRequest => Boolean(item));
      } catch {
        return [];
      }
    })
}

export function renderExecutorBridgeRequestMarkdown(request: ExecutorBridgeRequest) {
  const validation = request.validation.length
    ? request.validation.map((item) => `- ${item.severity}: ${item.key} - ${item.message}`).join("\n")
    : "- 无命令验证项";
  return `【Bridge Request】
ID：${request.id}
状态：${request.status}
动作：${request.action}
模式：${request.mode}
审批：${request.approvalRequired ? "需要" : "不需要"}
目的：${request.purpose}

Payload：
${JSON.stringify(request.payload, null, 2)}

验证：
${validation}

结果：
${request.lastResult ? JSON.stringify(request.lastResult, null, 2) : "尚未提交本地 Gateway。"}`;
}

export function renderExecutorBridgeContext(manifest: ExecutorBridgeManifest) {
  return `【Executor Bridge｜本地执行器/MCP桥】
协议：${manifest.protocolVersion}
模式：${manifest.mode}
端点：${manifest.endpointHint}
允许动作：${manifest.allowedActions.join(" / ")}
禁用动作：${manifest.deniedActions.join(" / ") || "无"}

安全规则：
${manifest.safety.map((item, index) => `${index + 1}. ${item}`).join("\n")}

调用约束：
1. 当前前端只生成 dry-run 或 approval-required 请求。
2. 没有外部守护进程确认时，不要声称工具已经执行。
3. 所有 workspace_scan/write_file/run_command/web_fetch/mcp_call/provider_probe 都必须进入审批草案或执行桥请求。
4. run_command 不是任意 shell；只有 Gateway 以 --execute-command 启动、payload.execute=true、23 条验证器无 block、命令匹配验证 allowlist 时才可执行。
5. scheduler_install/scheduler_uninstall 只能安装/删除已登记的计划任务，且需要 --execute-scheduler + payload.execute=true。
6. mcp_call 只调用 HTTP/HTTPS JSON-RPC MCP 端点或注册表内置 stdio MCP 服务，且需要 --execute-mcp + payload.execute=true；私网/localhost 端点还要 allow_private_network=true，stdio 不接受任意命令字符串。
7. skill_route/skill_invoke 可以读取本地或内置 SKILL.md 指令；skill_run 只能运行已激活 Skill，且需要 --execute-skill + payload.execute=true。
8. provider_catalog/provider_status 是只读 Provider 注册表；provider_probe 只能探测模型列表端点，执行已排队探针仍需要 --execute-provider + execute=true，且远程探测必须显式 allow_remote_model=true。
9. worker_run 的 model_task 需要 execute_model=true；远程模型还需要 allow_remote_model=true，执行时由 Gateway 子进程隔离，worker_cancel 只处理已登记 job_id。
10. 一个 <bridge-request> 标签内可以放单个 JSON 对象、JSON 对象数组，或 {"requests":[...]}；多个独立标签也可以。
11. 当你需要本地工具时，输出以下 JSON 标签，除此之外不要伪造执行结果：

<bridge-request>
{
  "action": "search | run | advance | status | approval_status | runtime_events | approval_decide | memory_event | memory_bootstrap | memory_consolidate | memory_status | memory_backup_status | memory_retrieve | memory_restore | context_pack | source_audit | source_digest | goal_bootstrap | skill_bootstrap | skill_route | skill_invoke | skill_crystallize | skill_review | skill_activate | skill_run | skill_status | scheduler_plan | scheduler_install | scheduler_uninstall | scheduler_status | worker_run | worker_status | worker_cancel | worker_merge_proposal | swarm_bootstrap | safety_review | sandbox_probe | sandbox_status | phase_audit | completion_audit | evolution_bootstrap | user_model_event | user_model_reflect | user_model_status | subagent_spawn | lock_acquire | lock_release | subagent_status | read_file | workspace_scan | write_file | run_command | web_fetch | mcp_stdio_catalog | mcp_call | provider_catalog | provider_status | provider_probe | kairos_task | kairos_tick",
  "purpose": "为什么需要调用",
  "payload": {}
}
</bridge-request>`;
}

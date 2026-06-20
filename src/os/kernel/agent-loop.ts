/**
 * 织梦 Agent Loop — 六阶段状态机
 *
 * 这是整个 OS 唯一的核心。之前所有模块（personal-os、agent-memory、
 * skill-registry、tool-registry、context-pack）都是给这个循环提供决策输入的。
 * 没有这个循环，织梦工作台就只是一个"建议系统"。
 */

import { planPersonalOS, renderPersonalOSContext, type PersonalOSPlan } from "../../utils/personal-os";
import { planAgentIntent, selectAgentMemoryShards, selectAgentSkills } from "../../utils/agent-memory";
import { buildAgentContextPack, renderAgentContextPack } from "../../utils/agent-context-pack";
import { buildToolRouteBundle } from "../../utils/tool-registry";
import { sendRawChat, type ApiSettings, type ChatMessage } from "../../store/settings";
import { buildExecutorBridgeManifest, extractExecutorBridgeRequestsFromText } from "../../utils/executor-bridge";
import { buildWriteFileDiffDraftFromPayload } from "../../utils/write-file-diff-draft";
import { assembleSkills } from "../../utils/skill-registry";
import { buildWorkflowDag } from "../../utils/workflow-dag";
import { htmlToPlainText } from "../../utils/helpers";
import type { PromptTemplate, WorkspaceFile } from "../../store/workspace";
import { buildOneShotToolFollowupPrompt } from "./agent-loop-bridge";

// ─── 类型 ────────────────────────────────────────────────

export type AgentPhase =
  | "intake"
  | "retrieve"
  | "plan"
  | "act"
  | "verify"
  | "writeback";

export interface AgentState {
  phase: AgentPhase;
  userInput: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  toolResults: AgentToolResult[];
  iteration: number;
  maxIterations: number;
  plan: PersonalOSPlan | null;
  shouldStop: boolean;
  finalSummary: string;
}

export type AgentStopReason =
  | "completed"
  | "max_iterations"
  | "model_error"
  | "gateway_error"
  | "approval_required"
  | "no_progress";

export interface AgentResult {
  success: boolean;
  summary: string;
  toolCalls: number;
  iterations: number;
  stopReason: AgentStopReason;
  lastPhase: AgentPhase;
  toolResults: AgentToolResult[];
  pendingApprovals: AgentPendingApproval[];
  pendingReviews: AgentPendingReview[];
  error?: string;
}

export interface AgentToolResult {
  action: string;
  purpose: string;
  status: string;
  resultText: string;
  resultJson?: Record<string, unknown>;
  reviewGate?: "changes_diff";
  diffDraft?: ReturnType<typeof buildWriteFileDiffDraftFromPayload>;
  approvalId?: string;
  runId?: string;
  agentContext?: Record<string, unknown>;
  at: number;
}

export interface AgentPendingApproval {
  approvalId: string;
  action: string;
  purpose: string;
  status: string;
}

export interface AgentPendingReview {
  reviewId: string;
  gate: "changes_diff";
  action: string;
  purpose: string;
  status: string;
  targetPaths: string[];
  hunkCount: number;
}

// ─── Gateway 对接 ─────────────────────────────────────────

const GATEWAY_URL = "http://127.0.0.1:8765/bridge";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function loopMemoryDimension(plan: PersonalOSPlan) {
  if (plan.phase === "writeback" || plan.domain === "memory") return "project";
  if (plan.domain === "writing") return "skill";
  if (plan.domain === "coding") return "tool";
  if (plan.domain === "research") return "project";
  return "project";
}

function renderGatewayContextPack(result: AgentToolResult) {
  const root = asRecord(result.resultJson);
  const pack = asRecord(root.context_pack);
  const contextItems = asArray(pack.context_pack);
  const threadContext = asArray(pack.thread_context);
  const activeSkills = asArray(pack.active_skill_keys).map((item) => String(item)).filter(Boolean);
  const toolPolicy = asRecord(pack.tool_policy);
  const excludedToolScopes = asArray(toolPolicy.excluded_tool_scopes).map((item) => String(item)).filter(Boolean);
  const contextPreview = contextItems.slice(0, 4).map((item, index) => {
    const record = asRecord(item);
    const title = asString(record.title) || asString(record.dimension) || `context ${index + 1}`;
    const summary = asString(record.summary) || asString(record.content) || asString(record.detail);
    return `- ${title}: ${summary.slice(0, 360)}`;
  });
  return [
    "## Gateway context_pack",
    `状态：${result.status}`,
    `上下文：${contextItems.length} 条；线程上下文：${threadContext.length} 条；Skills：${activeSkills.length}`,
    activeSkills.length ? `Active Skills: ${activeSkills.slice(0, 12).join(", ")}` : "",
    excludedToolScopes.length ? `Excluded Tool Scopes: ${excludedToolScopes.slice(0, 12).join(", ")}` : "",
    contextPreview.length ? contextPreview.join("\n") : "Gateway 未返回可注入上下文切片；继续使用本地 context_pack。",
  ].filter(Boolean).join("\n");
}

function threadContextFromAgentContext(agentContext: Record<string, unknown>) {
  return asArray(agentContext.context_refs).map((item, index) => {
    const record = asRecord(item);
    const title = asString(record.title) || asString(record.ref) || `thread-context-${index + 1}`;
    const source = asString(record.source) || "agent_context";
    const status = asString(record.status) || "attached";
    return {
      id: asString(record.id) || `agent-context-${index + 1}`,
      kind: asString(record.kind) || "context",
      title,
      summary: [source, status, asString(record.ref)].filter(Boolean).join(" · ") || title,
      ref: asString(record.ref) || title,
      source,
      status,
    };
  }).filter((item) => item.title || item.summary).slice(0, 12);
}

function gatewayContextPackPayload(
  userInput: string,
  currentPlainText: string,
  plan: PersonalOSPlan,
  intentContextMode: "lean" | "balanced" | "deep",
  agentContext: Record<string, unknown>,
) {
  const workspaceRootProfile = asRecord(agentContext.workspace_root_profile);
  const workspaceScanIndex = asRecord(agentContext.workspace_scan_index);
  return {
    task: userInput,
    domain: plan.domain,
    dimension: loopMemoryDimension(plan),
    limit: intentContextMode === "deep" ? 8 : intentContextMode === "balanced" ? 6 : 4,
    current_text: currentPlainText.slice(-3000),
    thread_id: asString(agentContext.thread_id),
    thread_title: asString(agentContext.thread_title),
    workspace_id: asString(agentContext.workspace_id),
    approval_ids: asArray(agentContext.approval_ids).map((item) => String(item)).filter(Boolean).slice(0, 20),
    thread_context: threadContextFromAgentContext(agentContext),
    ...(Object.keys(workspaceRootProfile).length ? { workspace_root_profile: workspaceRootProfile } : {}),
    ...(Object.keys(workspaceScanIndex).length ? { workspace_scan_index: workspaceScanIndex } : {}),
  };
}

function withAgentContext(
  action: string,
  purpose: string,
  payload: Record<string, unknown>,
  agentContext: Record<string, unknown>,
) {
  const existingContext = asRecord(payload.__agent_context);
  const scopedAgentContext = {
    ...existingContext,
    ...agentContext,
    action,
    purpose,
  };
  if (!Object.keys(scopedAgentContext).length) return { payload, agentContext: scopedAgentContext };
  return {
    payload: {
      ...payload,
      __agent_context: scopedAgentContext,
    },
    agentContext: scopedAgentContext,
  };
}

function shouldExecuteReadOnlyBridgeAction(action: string) {
  return action === "read_file" || action === "workspace_scan";
}

function isErrorToolStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  return ["error", "failed", "fail", "rejected", "denied"].includes(normalized);
}

function isPendingApprovalTool(result: AgentToolResult) {
  if (result.approvalId) return true;
  const normalized = result.status.trim().toLowerCase();
  return normalized.includes("approval") || normalized === "pending" || normalized === "queued" || normalized === "diff_draft";
}

function collectPendingApprovals(results: AgentToolResult[]): AgentPendingApproval[] {
  const seen = new Set<string>();
  return results.flatMap((result) => {
    const root = asRecord(result.resultJson);
    const approvalId = result.approvalId || asString(root.approval_id) || asString(root.approvalId);
    if (!approvalId || seen.has(approvalId)) return [];
    seen.add(approvalId);
    return [{
      approvalId,
      action: result.action,
      purpose: result.purpose,
      status: result.status,
    }];
  });
}

function collectPendingReviews(results: AgentToolResult[]): AgentPendingReview[] {
  const seen = new Set<string>();
  return results.flatMap((result) => {
    if (result.reviewGate !== "changes_diff" || result.status !== "diff_draft" || !result.diffDraft) return [];
    const firstTargetPath = result.diffDraft.targetPaths[0] || "changes";
    const reviewId = [
      "changes-diff",
      result.diffDraft.proposal.request_id || "",
      firstTargetPath,
      result.diffDraft.hunks.length,
    ].filter(Boolean).join(":");
    if (!reviewId || seen.has(reviewId)) return [];
    seen.add(reviewId);
    return [{
      reviewId,
      gate: "changes_diff" as const,
      action: result.action,
      purpose: result.purpose,
      status: result.status,
      targetPaths: result.diffDraft.targetPaths,
      hunkCount: result.diffDraft.hunks.length,
    }];
  });
}

function completedToolLines(results: AgentToolResult[]) {
  return results.flatMap((result) => {
    if (isPendingApprovalTool(result) || isErrorToolStatus(result.status)) return [];
    const normalized = result.status.trim().toLowerCase();
    if (!["ok", "pass", "completed", "executed", "partial"].includes(normalized)) return [];
    return [`${result.action} · ${result.purpose} · ${result.status}`];
  });
}

export function agentLoopStopReasonFromToolResults(results: AgentToolResult[]): AgentStopReason {
  if (results.some((result) => isErrorToolStatus(result.status))) return "gateway_error";
  if (results.some(isPendingApprovalTool)) return "approval_required";
  return "no_progress";
}

export function buildAgentLoopApprovalPauseSummary(results: AgentToolResult[]) {
  const pendingApprovals = collectPendingApprovals(results);
  const pendingReviews = collectPendingReviews(results);
  const completedLines = completedToolLines(results);
  const pendingLines = pendingApprovals.map((approval, index) => (
    `${index + 1}. ${approval.action} · ${approval.purpose} · ${approval.approvalId}`
  ));
  const reviewLines = pendingReviews.map((review, index) => (
    `${index + 1}. ${review.action} · ${review.purpose} · ${review.hunkCount} 个 hunk · ${review.targetPaths.join(" / ")}`
  ));
  return [
    pendingReviews.length ? "Agent Loop 已暂停，等待 Diff 审查或审批。" : "Agent Loop 已暂停，等待审批。",
    "不会继续调用模型，也不会声称文件、命令或外部状态已经完成。",
    completedLines.length ? "本轮已完成工具：" : "",
    ...completedLines.map((line, index) => `${index + 1}. ${line}`),
    reviewLines.length ? "待审 Diff：" : "",
    ...reviewLines,
    pendingLines.length ? "待审批：" : "",
    ...pendingLines,
  ].filter(Boolean).join("\n");
}

function buildAgentResult(
  state: AgentState,
  modelToolCallCount: number,
  stopReason: AgentStopReason,
  summary: string,
  error?: string,
): AgentResult {
  const pendingApprovals = collectPendingApprovals(state.toolResults);
  const pendingReviews = collectPendingReviews(state.toolResults);
  return {
    success: stopReason === "completed",
    summary,
    toolCalls: modelToolCallCount,
    iterations: state.iteration,
    stopReason,
    lastPhase: state.phase,
    toolResults: [...state.toolResults],
    pendingApprovals,
    pendingReviews,
    ...(error ? { error } : {}),
  };
}

function buildWriteFileDiffToolResult(
  payload: Record<string, unknown>,
  purpose: string,
  agentContext: Record<string, unknown>,
  at = Date.now(),
): AgentToolResult {
  const fallbackPath = asString(agentContext.default_write_path) || "bridge/agent-files/command-center-plan.md";
  const draft = buildWriteFileDiffDraftFromPayload({
    payload,
    fallbackPath,
    purpose,
    requestId: asString(agentContext.request_id),
    round: Number(agentContext.loop_iteration || 0) || undefined,
  });
  if (!draft) {
    return {
      action: "write_file",
      purpose,
      status: "blocked",
      resultText: "write_file 请求未包含可审查的 path/content，已阻止提交 Gateway。",
      resultJson: {
        status: "blocked",
        action: "write_file",
        approval_required: true,
        review_gate: "Changes / Diff",
        message: "write_file 请求未包含可审查的 path/content，已阻止提交 Gateway。",
      },
      reviewGate: "changes_diff",
      agentContext,
      at,
    };
  }
  return {
    action: "write_file",
    purpose,
    status: "diff_draft",
    resultText: [
      `write_file 已转为 Changes / Diff 草案：${draft.targetPaths.length} 个文件、${draft.hunks.length} 个待审 hunk。`,
      "Agent Loop 已暂停，不会直接写入文件；请在 Changes / Diff 接受 hunk 后再生成 write_file 审批。",
      draft.targetPaths.map((path, index) => `${index + 1}. ${path}`).join("\n"),
    ].filter(Boolean).join("\n"),
    resultJson: {
      status: "diff_draft",
      action: "write_file",
      approval_required: true,
      review_gate: "Changes / Diff",
      message: `write_file 已转为 Changes / Diff 草案：${draft.targetPaths.length} 个文件、${draft.hunks.length} 个待审 hunk。`,
      diff_draft: {
        detail: draft.detail,
        target_paths: draft.targetPaths,
        file_count: draft.targetPaths.length,
        hunk_count: draft.hunks.length,
        proposal: draft.proposal,
        hunks: draft.hunks.map((hunk) => ({
          id: hunk.id,
          file_id: hunk.fileId,
          target_path: hunk.targetPath,
          mode: hunk.mode,
          access_profile: hunk.accessProfile,
          request_id: hunk.requestId,
          content_chars: hunk.writeContent.length,
        })),
      },
    },
    reviewGate: "changes_diff",
    diffDraft: draft,
    agentContext,
    at,
  };
}

async function callGateway(
  action: string,
  payload: Record<string, unknown>,
  purpose = "Agent Loop 工具请求",
  agentContext: Record<string, unknown> = {},
): Promise<AgentToolResult> {
  const at = Date.now();
  const scoped = withAgentContext(action, purpose, payload, agentContext);
  try {
    const requestPayload = shouldExecuteReadOnlyBridgeAction(action)
      ? { ...scoped.payload, execute: true }
      : scoped.payload;
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        purpose,
        payload: requestPayload,
        ...(shouldExecuteReadOnlyBridgeAction(action) ? { execute: true } : {}),
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return {
        action,
        purpose,
        status: "error",
        resultText: `Gateway 返回错误: ${res.status} ${res.statusText}\n${raw}`.trim(),
        agentContext: scoped.agentContext,
        at,
      };
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const parsedAgentContext = asRecord(parsed.agent_context);
      return {
        action,
        purpose,
        status: String(parsed.status || parsed.result_status || "ok"),
        resultText: JSON.stringify(parsed, null, 2),
        resultJson: parsed,
        approvalId: asString(parsed.approval_id) || asString(parsed.approvalId),
        runId: asString(parsed.run_id) || asString(parsed.runId),
        agentContext: Object.keys(parsedAgentContext).length ? parsedAgentContext : scoped.agentContext,
        at,
      };
    } catch {
      return {
        action,
        purpose,
        status: "ok",
        resultText: raw,
        agentContext: scoped.agentContext,
        at,
      };
    }
  } catch (e) {
    return {
      action,
      purpose,
      status: "error",
      resultText: `Gateway 调用失败: ${e instanceof Error ? e.message : String(e)}`,
      agentContext: scoped.agentContext,
      at,
    };
  }
}

// ─── 主循环 ───────────────────────────────────────────────

export async function runAgentLoop(
  userInput: string,
  settings: ApiSettings,
  options: {
    currentText?: string;
    workspaceFiles?: WorkspaceFile[];
    activeSkills?: PromptTemplate[];
    maxIterations?: number;
    agentContext?: Record<string, unknown>;
    onPhaseChange?: (phase: AgentPhase) => void;
    onToolCall?: (result: AgentToolResult) => void;
    onModelMessage?: (message: { content: string; iteration: number; phase: AgentPhase }) => void;
    onLoopPrompt?: (message: { content: string; iteration: number; phase: AgentPhase; reason: "tool_result" | "continue" }) => void;
  } = {},
): Promise<AgentResult> {
  const {
    currentText = "",
    workspaceFiles = [],
    activeSkills = [],
    maxIterations = 10,
    agentContext = {},
    onPhaseChange,
    onToolCall,
    onModelMessage,
    onLoopPrompt,
  } = options;
  const currentPlainText = htmlToPlainText(currentText);

  const state: AgentState = {
    phase: "intake",
    userInput,
    messages: [],
    toolResults: [],
    iteration: 0,
    maxIterations,
    plan: null,
    shouldStop: false,
    finalSummary: "",
  };
  let modelToolCallCount = 0;
  let stopReason: AgentStopReason = "no_progress";

  // ── Phase 1: Intake — 域检测 + 意图分析 + 风险判定 ──
  setPhase("intake");
  const intent = planAgentIntent(userInput, currentPlainText);
  const memorySelection = selectAgentMemoryShards({
    files: workspaceFiles,
    selectedFileId: null,
    associatedFileIds: [],
    raw: userInput,
    currentText: currentPlainText,
  });
  const memories = memorySelection.memories;
  const routedSkillCandidates = selectAgentSkills({
    raw: userInput,
    currentText: currentPlainText,
    customPrompts: activeSkills,
    selectedPromptIds: [],
    maxSkills: 6,
  });
  const plan = planPersonalOS({
    raw: userInput,
    currentText: currentPlainText,
    agentPlan: intent,
    memories,
    routedSkills: routedSkillCandidates,
    selectedPrompts: activeSkills,
    files: workspaceFiles,
  });
  state.plan = plan;

  // ── Phase 2: Retrieve — 记忆检索 + 技能匹配 ──
  setPhase("retrieve");
  const skills = assembleSkills({
    plan,
    raw: userInput,
    workspaceSkills: activeSkills,
  });

  // ── Phase 3: Plan — 上下文打包 + 工具路由 ──
  setPhase("plan");
  const tools = buildToolRouteBundle(plan);
  const executorBridge = buildExecutorBridgeManifest({ plan, tools });
  const workflow = buildWorkflowDag({ plan, skills, files: workspaceFiles });
  const contextPack = buildAgentContextPack({
    raw: userInput,
    currentText: currentPlainText,
    plan,
    agentPlan: intent,
    memories,
    skills,
    tools,
    executorBridge,
    workflow,
  });

  const gatewayContextPack = await callGateway(
    "context_pack",
    gatewayContextPackPayload(userInput, currentPlainText, plan, intent.contextMode, agentContext),
    "Agent Loop 预取 context_pack",
    {
      ...agentContext,
      loop_phase: "plan",
      loop_iteration: 0,
    },
  );
  state.toolResults.push(gatewayContextPack);
  onToolCall?.(gatewayContextPack);
  const gatewayContextText = gatewayContextPack.status === "error"
    ? `## Gateway context_pack\n状态：error\n${gatewayContextPack.resultText}\n已降级继续使用本地 context_pack。`
    : renderGatewayContextPack(gatewayContextPack);

  const systemPrompt = [
    renderPersonalOSContext(plan),
    renderAgentContextPack(contextPack),
    gatewayContextText,
    "当你需要本地工具时，只输出一个或多个 <bridge-request> JSON 标签；收到工具结果后继续推理。",
    "一个 <bridge-request> 标签内可以放单个请求对象、请求数组，或 {\"requests\":[...]}；不要伪造工具结果。",
    "任务完成时用自然中文总结，并包含 ZHIMENG_TASK_COMPLETE 标记，便于循环停止。",
  ].join("\n\n");

  // 初始化消息
  state.messages = [
    { role: "user", content: userInput },
  ];

  // ── Phase 4+5+6: Act/Verify/Writeback Loop ──
  // 这是核心循环：调模型 → 解析工具调用 → 执行 → 回灌结果 → 继续
  for (state.iteration = 1; state.iteration <= maxIterations; state.iteration++) {
    if (state.shouldStop) break;

    setPhase("act");

    // 4a. 调用模型
    let responseText: string;
    try {
      responseText = await sendRawChat(settings, systemPrompt, state.messages as ChatMessage[]);
      onModelMessage?.({ content: responseText, iteration: state.iteration, phase: state.phase });
    } catch (e) {
      state.finalSummary = `模型调用失败: ${e instanceof Error ? e.message : String(e)}`;
      stopReason = "model_error";
      return buildAgentResult(state, modelToolCallCount, stopReason, state.finalSummary, state.finalSummary);
    }

    // 4b. 解析响应中的工具调用标签
    const bridgeRequests = extractExecutorBridgeRequestsFromText(responseText);

    if (bridgeRequests.length > 0) {
      // 有工具调用 → 执行它们
      setPhase("verify");
      modelToolCallCount += bridgeRequests.length;

      for (const req of bridgeRequests) {
        const requestAgentContext = {
          ...agentContext,
          loop_iteration: state.iteration,
          loop_phase: state.phase,
          request_id: req.id,
        };
        const result = req.action === "write_file"
          ? buildWriteFileDiffToolResult(
            req.payload as Record<string, unknown>,
            req.purpose,
            requestAgentContext,
          )
          : await callGateway(
            req.action,
            req.payload as Record<string, unknown>,
            req.purpose,
            requestAgentContext,
          );
        state.toolResults.push(result);
        onToolCall?.(result);
      }

      const currentToolResults = state.toolResults.slice(-bridgeRequests.length);
      stopReason = agentLoopStopReasonFromToolResults(currentToolResults);

      if (stopReason === "gateway_error") {
        state.finalSummary = currentToolResults
          .filter((result) => isErrorToolStatus(result.status))
          .map((result) => `${result.action}: ${result.resultText}`)
          .join("\n\n") || "Gateway 工具执行异常。";
        return buildAgentResult(state, modelToolCallCount, stopReason, state.finalSummary, state.finalSummary);
      }

      if (stopReason === "approval_required") {
        state.finalSummary = buildAgentLoopApprovalPauseSummary(currentToolResults);
        return buildAgentResult(state, modelToolCallCount, stopReason, state.finalSummary);
      }

      // 把工具结果追加到消息中，让模型知道发生了什么
      const toolResultText = currentToolResults
        .map((r) => `<tool-result action="${r.action}" status="${r.status}">\n${r.resultText}\n</tool-result>`)
        .join("\n");

      const toolResultPrompt = `${buildOneShotToolFollowupPrompt({
        userText: userInput,
        toolResultTexts: [toolResultText],
      })}\n\n如果任务已完成，请回复 ZHIMENG_TASK_COMPLETE。`;

      state.messages.push({ role: "assistant", content: responseText });
      state.messages.push({
        role: "user",
        content: toolResultPrompt,
      });
      onLoopPrompt?.({ content: toolResultPrompt, iteration: state.iteration, phase: state.phase, reason: "tool_result" });

      // 继续循环，让模型消化工具结果
      continue;
    }

    // 4c. 没有工具调用 → 检查是否完成
    const isComplete =
      responseText.includes("LUMENOS_TASK_COMPLETE") ||
      responseText.includes("ZHIMENG_TASK_COMPLETE") ||
      responseText.includes("任务完成") ||
      state.iteration >= maxIterations;

    if (isComplete) {
      setPhase("writeback");
      state.shouldStop = true;
      state.finalSummary = responseText;
      stopReason = state.iteration >= maxIterations && !responseText.includes("LUMENOS_TASK_COMPLETE") && !responseText.includes("ZHIMENG_TASK_COMPLETE")
        ? "max_iterations"
        : "completed";
    } else {
      // 还没完，把响应追加进去继续
      state.messages.push({ role: "assistant", content: responseText });
      const continuePrompt = "请继续完成任务。如果已完成请回复 ZHIMENG_TASK_COMPLETE。";
      state.messages.push({
        role: "user",
        content: continuePrompt,
      });
      onLoopPrompt?.({ content: continuePrompt, iteration: state.iteration, phase: state.phase, reason: "continue" });
    }
  }

  // ── 回写 ──
  if (!state.finalSummary) {
    setPhase("writeback");
    state.finalSummary = state.messages.slice(-5).map((m) => m.content).join("\n");
    stopReason = state.iteration > maxIterations ? "max_iterations" : stopReason;
  } else if (stopReason === "no_progress" && state.iteration > maxIterations) {
    stopReason = "max_iterations";
  }

  return buildAgentResult(state, modelToolCallCount, stopReason, state.finalSummary);

  function setPhase(phase: AgentPhase) {
    state.phase = phase;
    onPhaseChange?.(phase);
  }
}

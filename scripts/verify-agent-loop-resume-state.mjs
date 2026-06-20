import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function compileTsModule(relativePath, name) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: sourcePath.pathname,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  const modulePath = join(tmpdir(), `zhimeng-verify-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  writeFileSync(modulePath, compiled, "utf8");
  return import(pathToFileURL(modulePath).href);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const {
  agentLoopResumeAfterApprovalDecision,
  agentLoopResumeAfterReviewSubmitted,
  agentLoopResumeAfterRunResult,
} = await compileTsModule("../src/utils/agent-loop-resume-state.ts", "agent-loop-resume-state");

const waiting = agentLoopResumeAfterRunResult({
  task: "修复文件写入",
  previous: null,
  success: false,
  stopReason: "approval_required",
  pendingApprovals: [{ approvalId: "approval-1" }, { approvalId: "" }, { approvalId: "approval-2" }],
  detail: "1 轮 · 2 个工具请求 · 等待审批",
  at: 100,
});
assert(waiting, "waiting state exists");
assertEqual(waiting.status, "waiting_approval", "approval required waits");
assertEqual(waiting.task, "修复文件写入", "waiting keeps task");
assertEqual(waiting.approvalIds.join(","), "approval-1,approval-2", "waiting filters approval ids");
assertEqual(waiting.decidedApprovalIds.length, 0, "waiting initializes decided approvals");
assertEqual(waiting.detail, "1 轮 · 2 个工具请求 · 等待审批", "waiting detail");

const waitingReview = agentLoopResumeAfterRunResult({
  task: "审查 AI 写入",
  previous: null,
  success: false,
  stopReason: "approval_required",
  pendingApprovals: [],
  pendingReviews: [{ reviewId: "changes-diff:src/example.ts:2" }],
  detail: "1 轮 · 1 个工具请求 · 等待审查或审批 · 待审 Diff 1 项",
  at: 120,
});
assert(waitingReview, "waiting review state exists");
assertEqual(waitingReview.status, "waiting_review", "diff review waits as review");
assertEqual(waitingReview.approvalIds.length, 0, "review state has no approvals");
assertEqual(waitingReview.reviewIds.join(","), "changes-diff:src/example.ts:2", "review state keeps review ids");

const reviewSubmitted = agentLoopResumeAfterReviewSubmitted({
  resume: waitingReview,
  approvalIds: ["approval-write-1", "", "approval-write-2"],
  detail: "Diff 审查已提交为 write_file 审批",
  at: 140,
});
assertEqual(reviewSubmitted.status, "waiting_approval", "submitted review waits for write approvals");
assertEqual(reviewSubmitted.reviewIds.length, 0, "submitted review clears review ids");
assertEqual(reviewSubmitted.approvalIds.join(","), "approval-write-1,approval-write-2", "submitted review keeps approval ids");
assert(reviewSubmitted.detail.includes("等待 2 个写入审批返回"), "submitted review detail mentions approvals");

const submittedFirstDecision = agentLoopResumeAfterApprovalDecision({
  resume: reviewSubmitted,
  approvalId: "approval-write-1",
  detail: "第一个写入审批已执行",
  at: 145,
});
assertEqual(submittedFirstDecision.status, "waiting_approval", "one submitted approval still waits");

const submittedSecondDecision = agentLoopResumeAfterApprovalDecision({
  resume: submittedFirstDecision,
  approvalId: "approval-write-2",
  detail: "两个写入审批均已执行",
  at: 148,
});
assertEqual(submittedSecondDecision.status, "approval_decided", "all submitted approvals can resume");

const firstDecision = agentLoopResumeAfterApprovalDecision({
  resume: waiting,
  approvalId: "approval-1",
  detail: "approval-1 已执行",
  at: 150,
});
assertEqual(firstDecision.status, "waiting_approval", "one of multiple approvals still waits");
assertEqual(firstDecision.decidedApprovalIds.join(","), "approval-1", "first decision tracked");
assert(firstDecision.detail.includes("仍有 1 个审批等待处理"), "partial decision detail mentions remaining");

const secondDecision = agentLoopResumeAfterApprovalDecision({
  resume: firstDecision,
  approvalId: "approval-2",
  detail: "全部审批已返回",
  at: 180,
});
assertEqual(secondDecision.status, "approval_decided", "all approvals decided can resume");
assertEqual(secondDecision.decidedApprovalIds.join(","), "approval-1,approval-2", "all decisions tracked");
assertEqual(secondDecision.detail, "全部审批已返回", "all decision detail");

const completed = agentLoopResumeAfterRunResult({
  task: "修复文件写入",
  previous: secondDecision,
  success: true,
  stopReason: "completed",
  pendingApprovals: [],
  detail: "完成",
  at: 200,
});
assert(completed, "completed state exists");
assertEqual(completed.status, "resumed", "success marks resumed");
assertEqual(completed.approvalIds.length, 0, "completed clears approvals");
assertEqual(completed.detail, "Agent Loop 已完成。", "completed detail");

const previous = {
  task: "继续原任务",
  approvalIds: ["approval-1"],
  status: "approval_decided",
  detail: "审批已返回，可继续",
  at: 150,
};
const retryable = agentLoopResumeAfterRunResult({
  task: "继续原任务",
  previous,
  success: false,
  stopReason: "model_error",
  pendingApprovals: [],
  detail: "模型调用失败",
  at: 300,
});
assert(retryable, "retryable state exists");
assertEqual(retryable.status, "approval_decided", "failed resume keeps resume entry");
assertEqual(retryable.approvalIds.join(","), "approval-1", "failed resume keeps approval ids");
assertEqual(retryable.detail, "模型调用失败", "failed resume updates detail");

const untouched = agentLoopResumeAfterRunResult({
  task: "普通失败",
  previous: null,
  success: false,
  stopReason: "gateway_error",
  pendingApprovals: [],
  detail: "Gateway 失败",
  at: 400,
});
assertEqual(untouched, null, "unrelated failure does not create resume state");

console.log("agent-loop-resume-state ok");

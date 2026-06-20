import { readFileSync } from "node:fs";

const doc = readFileSync(new URL("../docs/phase1-chat-acceptance-20260619.md", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const coreRunner = readFileSync(new URL("./verify-phase1-chat-core.mjs", import.meta.url), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const heading of [
  "## 1. 核心链路",
  "## 2. 卡点与验证",
  "## 3. API 优先原则",
  "## 4. Spec 成功标准",
  "## 6. 手动冒烟测试",
]) {
  assert(doc.includes(heading), `missing heading: ${heading}`);
}

for (const required of [
  "用户输入 / 附件",
  "Agent 线程保存",
  "API Provider 模型请求",
  "解析 <bridge-request>",
  "Gateway / Diff / 审批",
  "工具结果回灌到线程",
  "模型继续推理或停止",
]) {
  assert(doc.includes(required), `core chain missing: ${required}`);
}

for (const command of [
  "npm run verify:phase1",
  "npm run verify:phase1-chat-core",
  "npm run verify:provider-config",
  "npm run verify:agent-chat",
  "npm run verify:agent-chat-api-smoke",
  "npm run verify:agent-chat-attachment-api-smoke",
  "npm run verify:model-test-empty-reply",
  "npm run verify:agent-attachment",
  "npm run verify:executor-bridge",
  "npm run verify:agent-loop-read-tool",
  "npm run verify:agent-loop-write-file",
  "npm run verify:workspace-root",
  "npm run verify:workspace-scan",
  "npm run verify:workspace-read",
  "npm run verify:agent-home-sidebar",
  "npm run verify:agent-thread-store",
]) {
  assert(doc.includes(command), `verification command missing: ${command}`);
}

assert(
  packageJson.scripts?.typecheck === "tsc --noEmit --pretty false",
  "package.json must register typecheck",
);
assert(
  packageJson.scripts?.["verify:phase1"] === "npm run verify:phase1-chat-core && npm run typecheck && npm run build",
  "package.json must register verify:phase1 as the Phase 1 entrypoint with typecheck and build",
);
assert(
  packageJson.scripts?.["verify:phase1-chat-core"] === "node scripts/verify-phase1-chat-core.mjs",
  "package.json must register verify:phase1-chat-core",
);

for (const script of [
  "verify-agent-home-sidebar-contract.mjs",
  "verify-agent-thread-store.mjs",
  "verify-agent-chat-transport.mjs",
  "verify-agent-chat-api-smoke.mjs",
  "verify-agent-chat-attachment-api-smoke.mjs",
  "verify-model-test-empty-reply-guard.mjs",
  "verify-provider-config-boundary.mjs",
  "verify-agent-attachment-intake.mjs",
  "verify-executor-bridge.mjs",
  "verify-agent-loop-bridge.mjs",
  "verify-agent-loop-read-tool-followup.mjs",
  "verify-agent-loop-write-file-intercept.mjs",
  "verify-agent-loop-command-approval.mjs",
  "verify-gateway-command-approval.py",
  "verify-agent-loop-resume-state.mjs",
  "verify-agent-loop-resume-prompt.mjs",
  "verify-workspace-root-binding.mjs",
  "verify-workspace-scan-index.mjs",
  "verify-workspace-read-preview.mjs",
  "verify-write-file-diff-draft.mjs",
]) {
  assert(coreRunner.includes(script), `phase1 core runner missing: ${script}`);
}

assert(doc.includes("Gateway 不应该阻塞基础聊天"), "API priority must keep Gateway from blocking basic chat");
assert(doc.includes("文件写入永远先变成 Diff / 审批"), "success criteria must protect write_file approval flow");
assert(doc.includes("API / Provider 配置只在模型中心、设置或后续桌面配置工具中处理"), "provider config boundary missing");
assert(doc.includes("真实页面刷新后仍能看到用户消息和 AI 回复"), "thread persistence success criteria must include browser reload");
assert(doc.includes("浏览器刷新持久化冒烟"), "browser reload persistence evidence missing");
assert(doc.includes("Phase1 刷新持久化"), "browser reload persistence marker missing");
assert(doc.includes("agent-home-focused"), "browser reload evidence should keep Agent Home as the restored surface");
assert(doc.includes("空回复不能标记为完成"), "empty model replies must be explicit failures, not completed fake replies");
assert(doc.includes("decideAgentModelReplyContent"), "empty reply verification function should be documented");
assert(doc.includes("测试对话空回复不能算成功"), "model test empty replies must fail instead of passing");
assert(doc.includes("鉴权/权限类 4xx 错误不能被 non-stream fallback 掩盖"), "auth/permission errors must not be hidden by fallback requests");
assert(doc.includes("auth-fail-model"), "auth failure smoke model should be documented");
assert(doc.includes("超大附件必须在进入模型请求前被拒绝"), "oversized attachment model-request boundary missing");
assert(doc.includes("validateAgentAttachmentFile"), "attachment validation helper should be documented");
assert(doc.includes("未进入模型请求"), "oversized attachment rejection text should be documented");

for (const smokeCase of [
  "纯文本 API 对话",
  "模型不可用暂存",
  "文件附件",
  "图片 / 多模态",
  "工具请求回灌",
]) {
  assert(doc.includes(smokeCase), `manual smoke test missing: ${smokeCase}`);
}

console.log("phase1-chat-acceptance ok");

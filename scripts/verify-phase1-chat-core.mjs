import { spawnSync } from "node:child_process";

const checks = [
  ["Phase 1 验收文档", "scripts/verify-phase1-chat-acceptance.mjs"],
  ["默认首页模型入口边界", "scripts/verify-agent-home-sidebar-contract.mjs"],
  ["Agent 线程保存", "scripts/verify-agent-thread-store.mjs"],
  ["API 对话与多模态传输", "scripts/verify-agent-chat-transport.mjs"],
  ["API 对话本地冒烟", "scripts/verify-agent-chat-api-smoke.mjs"],
  ["附件多模态本地冒烟", "scripts/verify-agent-chat-attachment-api-smoke.mjs"],
  ["模型测试空回复守门", "scripts/verify-model-test-empty-reply-guard.mjs"],
  ["桌面 Provider 配置到聊天冒烟", "scripts/verify-desktop-provider-chat-smoke.mjs"],
  ["Provider 粘贴配置解析", "scripts/verify-provider-config-paste.mjs"],
  ["Provider/API 配置边界", "scripts/verify-provider-config-boundary.mjs"],
  ["附件解析入口", "scripts/verify-agent-attachment-intake.mjs"],
  ["Bridge 请求协议", "scripts/verify-executor-bridge.mjs"],
  ["Agent Loop Bridge 回灌协议", "scripts/verify-agent-loop-bridge.mjs"],
  ["Agent Loop 基础审批暂停", "scripts/verify-agent-loop-approval-pause.mjs"],
  ["Agent Loop 只读工具回灌", "scripts/verify-agent-loop-read-tool-followup.mjs"],
  ["Agent Loop 写文件 Diff 截获", "scripts/verify-agent-loop-write-file-intercept.mjs"],
  ["Agent Loop 读写审查", "scripts/verify-agent-loop-read-write-review.mjs"],
  ["Agent Loop 命令审批暂停", "scripts/verify-agent-loop-command-approval.mjs"],
  ["Gateway 命令审批", "scripts/verify-gateway-command-approval.py"],
  ["Agent Loop 审批续跑状态", "scripts/verify-agent-loop-resume-state.mjs"],
  ["Agent Loop 审批续跑提示", "scripts/verify-agent-loop-resume-prompt.mjs"],
  ["项目目录绑定", "scripts/verify-workspace-root-binding.mjs"],
  ["项目目录扫描", "scripts/verify-workspace-scan-index.mjs"],
  ["项目文件预览", "scripts/verify-workspace-read-preview.mjs"],
  ["项目文件上下文注入模型请求", "scripts/verify-workspace-read-context-injection.mjs"],
  ["写文件 Diff 草案", "scripts/verify-write-file-diff-draft.mjs"],
  ["浏览器自定义 Provider 聊天", "scripts/verify-phase1-browser-chat.mjs"],
];

for (const [label, script] of checks) {
  console.log(`\n[phase1-chat-core] ${label}`);
  const command = script.endsWith(".py") ? "python" : process.execPath;
  const result = spawnSync(command, [script], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[phase1-chat-core] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[phase1-chat-core] ${label} failed`);
    process.exit(result.status || 1);
  }
}

console.log("\nphase1-chat-core ok");

import { spawnSync } from "node:child_process";

const commands = [
  [process.execPath, ["scripts/verify-agent-loop-read-tool-followup.mjs"], "只读工具回灌"],
  [process.execPath, ["scripts/verify-agent-loop-write-file-intercept.mjs"], "写入 Diff 截获"],
  [process.execPath, ["scripts/verify-agent-loop-read-write-review.mjs"], "读文件后写入 Diff 审查"],
  [process.execPath, ["scripts/verify-agent-loop-command-approval.mjs"], "命令审批暂停"],
];

for (const [command, args, label] of commands) {
  console.log(`\n[agent-loop-tools] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[agent-loop-tools] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[agent-loop-tools] ${label} failed`);
    process.exit(result.status || 1);
  }
}

console.log("\nagent-loop-tools ok");

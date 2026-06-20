import { spawnSync } from "node:child_process";

function run(label, command, args) {
  console.log(`\n[phase4] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`[phase4] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[phase4] ${label} failed`);
    process.exit(result.status || 1);
  }
}

const checks = [
  ["Phase 3 项目模式总闸门", process.execPath, ["scripts/verify-phase3.mjs"]],
  ["Phase 4 Agent Runtime 工具链", process.execPath, ["scripts/verify-phase4-agent-runtime.mjs"]],
];

for (const [label, command, args] of checks) {
  run(label, command, args);
}

console.log("\nphase4 ok");

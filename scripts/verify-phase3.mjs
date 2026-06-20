import { spawnSync } from "node:child_process";

function run(label, command, args) {
  console.log(`\n[phase3] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`[phase3] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[phase3] ${label} failed`);
    process.exit(result.status || 1);
  }
}

const checks = [
  ["Phase 2 Agent Home 总闸门", process.execPath, ["scripts/verify-phase2.mjs"]],
  ["Phase 3 项目模式工具链", process.execPath, ["scripts/verify-phase3-project-mode.mjs"]],
];

for (const [label, command, args] of checks) {
  run(label, command, args);
}

console.log("\nphase3 ok");

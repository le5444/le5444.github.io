import { spawnSync } from "node:child_process";

function run(label, command, args) {
  console.log(`\n[phase5] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`[phase5] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[phase5] ${label} failed`);
    process.exit(result.status || 1);
  }
}

const checks = [
  ["四问核心链路校准", process.execPath, ["scripts/verify-core-chain-calibration.mjs"]],
  ["Phase 4 Agent Runtime 总闸门", process.execPath, ["scripts/verify-phase4.mjs"]],
  ["Phase 5 桌面 / Provider 就绪", process.execPath, ["scripts/verify-phase5-desktop-readiness.mjs"]],
];

for (const [label, command, args] of checks) {
  run(label, command, args);
}

console.log("\nphase5 ok");

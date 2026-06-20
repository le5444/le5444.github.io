import { spawnSync } from "node:child_process";

function run(label, command, args) {
  console.log(`\n[phase2] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`[phase2] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[phase2] ${label} failed`);
    process.exit(result.status || 1);
  }
}

const checks = [
  ["Agent Home 静态验收", process.execPath, ["scripts/verify-phase2-agent-home.mjs"]],
  ["左侧线程 / 项目管理契约", process.execPath, ["scripts/verify-agent-home-sidebar-contract.mjs"]],
  ["生产构建", process.execPath, ["node_modules/vite/bin/vite.js", "build"]],
  ["Agent Home 浏览器几何冒烟", process.execPath, ["scripts/verify-phase2-agent-home-browser.mjs"]],
];

for (const [label, command, args] of checks) {
  run(label, command, args);
}

console.log("\nphase2 ok");

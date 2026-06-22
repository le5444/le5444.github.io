import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/verify-phase2-agent-home-browser.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ZHIMENG_PHASE1_BROWSER_CHAT: "1",
  },
});

if (result.error) {
  console.error(`[phase1-browser-chat] failed: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error("[phase1-browser-chat] failed");
  process.exit(result.status || 1);
}

console.log("phase1-browser-chat ok");

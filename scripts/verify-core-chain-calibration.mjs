import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const coreDoc = readProjectFile("docs/core-chain-calibration-20260620.md");
const roadmapDoc = readProjectFile("docs/项目路线图.md");
const calibrationDoc = readProjectFile("docs/agent-workbench-calibration-20260618.md");
const phase0Doc = readProjectFile("docs/phase0-audit-20260618.md");
const currentStateAuditDoc = readProjectFile("docs/phase0-current-state-audit-20260622.md");
const phase1Doc = readProjectFile("docs/phase1-chat-acceptance-20260619.md");
const phase2Doc = readProjectFile("docs/phase2-agent-home-acceptance-20260619.md");
const phase3Doc = readProjectFile("docs/phase3-project-mode-acceptance-20260619.md");
const phase4Doc = readProjectFile("docs/phase4-agent-runtime-acceptance-20260619.md");
const phase5Doc = readProjectFile("docs/phase5-desktop-readiness-acceptance-20260619.md");
const packageJson = JSON.parse(readProjectFile("package.json"));
const phase3Aggregate = readProjectFile("scripts/verify-phase3.mjs");
const phase4Aggregate = readProjectFile("scripts/verify-phase4.mjs");
const phase5Aggregate = readProjectFile("scripts/verify-phase5.mjs");
const agentLoop = readProjectFile("src/os/kernel/agent-loop.ts");
const controlCenter = readProjectFile("src/components/AgentControlCenter.tsx");
const workbenchComposer = readProjectFile("src/components/WorkbenchComposer.tsx");
const settings = readProjectFile("src/store/settings.ts");
const executorBridge = readProjectFile("src/utils/executor-bridge.ts");
const agentHomeSurface = `${controlCenter}\n${workbenchComposer}`;

for (const phrase of [
  "核心链路是什么",
  "每个卡点怎么验证",
  "能不能优先用 API",
  "spec 文档里有没有成功标准",
  "参考资料吸收边界",
  "继续上下文-织梦PersonalOS.md",
  "对话记忆-织梦PersonalOS.md",
  "AI编程Agent工具全景与复刻指南.docx",
  "Codex_5.5_UI复刻完整指南 (3).docx",
  "C:\\Users\\30865\\Desktop\\ai可借鉴源码",
  "frontend(1).zip",
  "旧的 `LumenOS-first` 公开命名边界不再继承",
  "真实可用模型必须来自 `/models`",
  "cc switch / 配置工具思路",
  "不把 API 配置塞回默认右侧栏或全屏页面",
  "用户输入 / 附件 / 图片",
  "Provider API 模型请求",
  "解析 <bridge-request>",
  "Gateway 工具执行或 Diff / 审批草案",
  "工具结果回灌到线程和运行报告",
  "AI 对话、模型列表、模型测试、多模态输入优先走 Provider API",
  "保存并使用",
  "保存 API 配置",
  "复制进去的 baseURL / API key 必须保存为去空格的干净值",
  "填入草稿",
  "当前首页正在使用",
  "端点模板默认折叠且标明不是模型清单",
  "mock Provider 能记录文本附件",
  "图片 data URL",
  "unbound 线程空间",
  "文件、命令、目录扫描、Diff、审批、Worker、Memory、Skills、MCP、Scheduler 走 Gateway",
  "项目工具证据进入 Tool Trace / 运行报告时必须能追到 `read_file` 路径",
  "`workspace_scan` 扫描根和文件数",
  "npm run verify:phase1",
  "npm run verify:phase2",
  "npm run verify:phase3",
  "npm run verify:phase4",
  "npm run verify:phase5",
]) {
  assert(coreDoc.includes(phrase), `Core chain calibration doc missing: ${phrase}`);
}

for (const phrase of [
  "织梦写作台 / Zhimeng Writing Agent",
  "底层 Agent OS / Agent IDE 运行层",
  "写作是重要内置能力，但不是整个产品边界",
]) {
  assert(calibrationDoc.includes(phrase), `Workbench calibration boundary missing: ${phrase}`);
  assert(coreDoc.includes(phrase), `Core chain boundary missing: ${phrase}`);
}
for (const phrase of [
  "不是单纯的小说写作前端",
  "老大的中文 AI Agent 工作台",
  "目标分层",
  "3 个大目标",
  "Agent Home 像 Codex / Claude Code / VS Code",
  "核心 Agent 链路真实跑通",
  "桌面产品可用而且可维护",
  "5 个中目标",
  "AI 对话与模型配置",
  "Agent Home UI 精简",
  "项目模式闭环",
  "Agent Runtime 能力层",
  "桌面与稳定性",
  "当前 1 个小目标",
  "目标锁定与进度门禁",
  "不会又沿着旧的“写作前端 / 功能堆叠”惯性跑偏",
]) {
  assert(roadmapDoc.includes(phrase), `Project roadmap goal hierarchy missing: ${phrase}`);
}
assert(calibrationDoc.includes("TypeScript") && calibrationDoc.includes("设计稿"), "Workbench calibration must name TypeScript design-doc drift");
assert(coreDoc.includes("TypeScript") && coreDoc.includes("设计稿"), "Core chain calibration must name TypeScript design-doc drift");

for (const phrase of [
  "现在真正在跑的东西",
  "现在还没真正跑通的东西",
  "设计稿 / 概念层",
  "本轮止损清单",
]) {
  assert(phase0Doc.includes(phrase), `Phase 0 audit missing evidence section: ${phrase}`);
}

for (const phrase of [
  "当前项目总审计",
  "最新边界",
  "四个问题的当前答案",
  "综合完成度：约 55%",
  "项目已经从“写作前端 + 概念堆叠”推进到“有真实门禁的 Agent 工作台雏形”",
  "还没有达到老大要的 Codex / Claude Code 级完整 Agent IDE",
  "不要继续新建大功能",
  "把默认首页继续打磨成更像 Codex 的 Chat-first Agent Home",
]) {
  assert(currentStateAuditDoc.includes(phrase), `Current state audit missing calibrated conclusion: ${phrase}`);
}

const phaseDocs = [
  ["Phase 1", phase1Doc, "保存 API 配置", "## 4. Spec 成功标准"],
  ["Phase 2", phase2Doc, "Chat-first 三栏", "## 4. Spec 成功标准"],
  ["Phase 3", phase3Doc, "workspace_scan 目录索引", "## 5. Spec 成功标准"],
  ["Phase 4", phase4Doc, "tool result 回灌模型继续推理", "## 5. Spec 成功标准"],
  ["Phase 5", phase5Doc, "provider_config_status", "## 4. Phase 5 成功标准"],
];

for (const [label, doc, chainEvidence, successHeader] of phaseDocs) {
  for (const phrase of ["核心链路", "卡点", "验证", "API", successHeader, chainEvidence]) {
    assert(doc.includes(phrase), `${label} spec missing four-question evidence: ${phrase}`);
  }
}

for (const script of [
  "verify:core-chain",
  "verify:phase1",
  "verify:phase2",
  "verify:phase3",
  "verify:phase4",
  "verify:phase5",
  "verify:agent-chat-api-smoke",
  "verify:agent-chat-attachment-api-smoke",
  "verify:gateway-command-approval",
  "verify:agent-run-replay",
]) {
  assert(packageJson.scripts?.[script], `package script missing: ${script}`);
}
assert(phase5Aggregate.includes("verify-core-chain-calibration.mjs"), "Phase 5 aggregate gate must run core-chain calibration first");
assert(phase3Aggregate.includes("verify-phase2.mjs"), "Phase 3 aggregate gate must run Phase 2 Agent Home gate first");
assert(phase3Aggregate.includes("verify-phase3-project-mode.mjs"), "Phase 3 aggregate gate must run project-mode chain");
assert(phase4Aggregate.includes("verify-phase3.mjs"), "Phase 4 aggregate gate must run Phase 3 aggregate gate first");
assert(phase4Aggregate.includes("verify-phase4-agent-runtime.mjs"), "Phase 4 aggregate gate must run Agent Runtime gate");
assert(phase5Aggregate.includes("verify-phase4.mjs"), "Phase 5 aggregate gate must run Phase 4 aggregate gate");
assert(phase5Aggregate.includes("verify-phase5-desktop-readiness.mjs"), "Phase 5 aggregate gate must run desktop/provider readiness");
assert(phase5Doc.includes("npm run verify:core-chain"), "Phase 5 spec must name the core-chain calibration gate");

for (const snippet of [
  "sendChat",
  "sendRawChat",
]) {
  assert(settings.includes(snippet), `Provider API chat entry missing: ${snippet}`);
}

for (const snippet of [
  "sendAgentThreadMessage",
  "runAgentDirectChat",
  "bridgeAction",
  "createDiffDraftFromWriteFileRequest",
  "data-testid=\"agent-home-focused\"",
  "data-testid=\"agent-thread-composer\"",
  "data-testid=\"agent-home-side-tabs\"",
]) {
  assert(agentHomeSurface.includes(snippet), `Agent Home/core chain wiring missing: ${snippet}`);
}

for (const snippet of [
  "runAgentLoop",
  "context_pack",
  "shouldExecuteReadOnlyBridgeAction",
  "onToolCall",
]) {
  assert(agentLoop.includes(snippet), `Agent Loop chain missing: ${snippet}`);
}

for (const action of [
  "read_file",
  "write_file",
  "workspace_scan",
  "run_command",
  "provider_probe",
  "memory_retrieve",
  "skill_route",
  "worker_run",
]) {
  assert(executorBridge.includes(`"${action}"`), `Executor Bridge action missing: ${action}`);
}

console.log("core-chain-calibration ok");

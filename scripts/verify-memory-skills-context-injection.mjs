import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const {
  buildAgentContextPack,
  renderAgentContextPack,
} = await compileTsModule("../src/utils/agent-context-pack.ts", "memory-skills-context-pack");
const {
  buildAgentChatContent,
  buildAgentThreadContextText,
} = await compileTsModule("../src/utils/agent-chat-transport.ts", "memory-skills-chat-transport");

const memories = [
  {
    id: "mem-story-canon",
    fileId: "story-canon.md",
    category: "项目底本",
    title: "主角真值卡",
    kind: "canon",
    summary: "主角公开目标、隐性欲望和不可违背的人物边界。",
    keywords: ["主角", "真值", "边界"],
    anchors: ["# 主角真值", "- 不公开系统任务", "- 行动必须有代价"],
    updatedAt: Date.now(),
    charCount: 860,
    score: 18,
    reason: ["项目真值", "任务命中"],
  },
  {
    id: "mem-tool-observation",
    fileId: "tool-observations.md",
    category: "织梦工作台",
    title: "工具观察与审批边界",
    kind: "state",
    summary: "read_file 可直接进入上下文；write_file、run_command 和 skill_run 必须走审批。",
    keywords: ["read_file", "write_file", "skill_run"],
    anchors: ["# 工具观察", "- 先读后写", "- skill_run 受控执行"],
    updatedAt: Date.now(),
    charCount: 920,
    score: 15,
    reason: ["动态状态", "工具边界"],
  },
];

const skills = {
  activeCoreSkills: [
    {
      key: "zhimeng-workbench-coordinator",
      label: "织梦工作台总编排",
      scope: "global",
      source: "built-in",
      purpose: "统筹记忆、工具、技能、验收、写回和长期任务。",
      trigger: /./,
      memoryBanks: ["soul", "working", "tool_observations"],
      safetyNote: "总编排器必须亲自综合结果，不盲目批准子任务输出。",
    },
    {
      key: "novel-kb-manager",
      label: "小说分层知识库管理器",
      scope: "writing",
      source: "codex-local",
      purpose: "管理项目真值、人物状态、伏笔、世界规则和写后回灌。",
      trigger: /记忆|知识库|伏笔/,
      memoryBanks: ["story_canon", "entity_state", "world_state", "tool_observations"],
      safetyNote: "写回必须先形成差异草案，避免覆盖用户手写设定。",
    },
  ],
  activeWorkspaceSkills: [
    {
      id: "workspace-skill-writing-gate",
      title: "写作接收闸门",
      category: "反崩盘工作流",
      content: "检查人物边界、伏笔、节奏和读者已知信息。",
      updatedAt: Date.now(),
    },
  ],
  isolatedSkills: [],
  reason: ["任务域：writing", "核心 Skills：织梦工作台总编排 / 小说分层知识库管理器"],
};

const pack = buildAgentContextPack({
  raw: "继续完善织梦写作台的 Agent 对话，让记忆、Skills 和审批边界进入模型上下文。",
  currentText: "当前线程正在验证 memory_retrieve 与 skill_route 是否进入 context_pack。",
  plan: {
    mode: "personal-os-coordinator",
    domain: "writing",
    phase: "plan",
    risk: "medium",
    goalMode: true,
    coordinatorRules: [],
    memoryRoutes: [],
    tools: [],
    subagents: [],
    plannerTree: [],
    verificationGates: [],
    contextPolicy: [],
  },
  agentPlan: {
    intent: "plan",
    tools: ["上下文检索", "技能路由"],
    queryTerms: ["织梦", "Agent", "记忆", "Skills", "审批"],
    contextMode: "balanced",
  },
  memories,
  skills,
  tools: {
    tools: [
      { key: "memory.search" },
      { key: "skill.route" },
      { key: "workspace.read" },
      { key: "workspace.propose_patch" },
    ],
    blockedTools: [
      { key: "run_command" },
      { key: "skill_run" },
    ],
    safetyLayers: [],
    approvalRequired: true,
  },
  executorBridge: {
    name: "Zhimeng Agent Gateway",
    mode: "approval-required",
    protocolVersion: "0.2",
    endpointHint: "http://127.0.0.1:8765/bridge",
    allowedActions: ["context_pack", "memory_retrieve", "skill_route", "skill_run"],
    deniedActions: [],
    safety: [],
  },
  workflow: {
    id: "workflow-memory-skills",
    name: "Memory Skills Context Smoke",
    domain: "writing",
    currentNodeId: "context",
    gatewayActions: ["search", "status"],
    policy: [],
    nodes: [
      {
        id: "context",
        label: "上下文注入验证",
        owner: "memory",
        status: "ready",
        dependsOn: [],
        artifacts: ["context_pack", "thread_context"],
        tools: ["memory_retrieve", "skill_route"],
        verification: "记忆和 Skills 必须进入模型请求文本。",
      },
    ],
  },
});

assert(pack.memoryRefs.length === 2, "context pack should carry ranked memory refs");
assert(pack.memoryRefs.some((item) => item.title === "主角真值卡" && item.anchors.includes("# 主角真值")), "memory refs should keep memory title and anchors");
assert(pack.activeSkills.some((item) => item.key === "novel-kb-manager"), "context pack should carry active skill keys");
assert(pack.activeSkills.some((item) => item.memoryBanks.includes("story_canon")), "active skills should keep memory bank hints");
assert(pack.bridgeQueue.some((item) => item.action === "skill_route"), "context pack should request skill_route first");
assert(pack.bridgeQueue.some((item) => item.action === "memory_retrieve"), "context pack should request memory_retrieve");
assert(pack.toolPolicy.excludedToolScopes.includes("run_command"), "context pack should keep excluded tool scopes");
assert(pack.toolPolicy.excludedToolScopes.includes("skill_run"), "context pack should keep gated skill runtime excluded when blocked");

const rendered = renderAgentContextPack(pack);
for (const snippet of [
  "Active Skills",
  "Memory Refs",
  "小说分层知识库管理器",
  "novel-kb-manager",
  "story_canon",
  "写回必须先形成差异草案",
  "项目底本/主角真值卡",
  "项目真值",
  "# 主角真值",
  "Bridge Queue",
  "skill_route",
  "memory_retrieve",
  "run_command",
  "skill_run",
]) {
  assert(rendered.includes(snippet), `rendered context pack missing: ${snippet}`);
}

const threadContextText = buildAgentThreadContextText([
  {
    kind: "memory",
    title: "Memory Refs / 主角真值卡",
    source: "Gateway memory_retrieve",
    ref: "mem-story-canon",
    status: "ok",
    summary: "项目底本/主角真值卡｜canon｜anchors=# 主角真值 / - 不公开系统任务｜reason=项目真值、任务命中",
  },
  {
    kind: "skill",
    title: "Active Skills / 小说分层知识库管理器",
    source: "Gateway skill_route",
    ref: "novel-kb-manager",
    status: "active",
    summary: "active_skill_keys=zhimeng-workbench-coordinator,novel-kb-manager；memory_banks=story_canon,entity_state,world_state；安全=写回必须先形成差异草案。",
  },
  {
    kind: "context_pack",
    title: "Agent Context Pack",
    source: "Gateway context_pack",
    ref: "context-pack-memory-skills-smoke",
    status: "ready",
    summary: rendered,
  },
], 5000);

for (const snippet of [
  "[当前线程上下文]",
  "Gateway memory_retrieve",
  "Gateway skill_route",
  "Gateway context_pack",
  "主角真值卡",
  "active_skill_keys",
  "novel-kb-manager",
  "Memory Refs",
  "Active Skills",
]) {
  assert(threadContextText.includes(snippet), `thread context missing: ${snippet}`);
}

const modelContent = buildAgentChatContent("请基于当前上下文继续规划下一步。", [], threadContextText);
assert(typeof modelContent === "string", "text-only memory/skills context should produce a text model payload");
for (const snippet of [
  "请基于当前上下文继续规划下一步。",
  "[当前线程上下文]",
  "Gateway memory_retrieve",
  "主角真值卡",
  "Gateway skill_route",
  "novel-kb-manager",
  "active_skill_keys",
]) {
  assert(modelContent.includes(snippet), `model content missing memory/skills context: ${snippet}`);
}

const component = readProjectFile("src/components/AgentControlCenter.tsx");
const doc = readProjectFile("docs/phase4-agent-runtime-acceptance-20260619.md");
const agentLoop = readProjectFile("src/os/kernel/agent-loop.ts");
const gateway = readProjectFile("bridge/zhimeng_bridge.py");
const healthcheck = readProjectFile("bridge/healthcheck_bridge.py");

for (const snippet of [
  'bridgeAction("context_pack"',
  'bridgeAction("skill_route"',
  'bridgeAction("memory_status"',
  "thread_context_policy",
  "active_skill_keys",
  "buildAgentThreadContextText",
  "activeSkillKeys",
  "Direct chat context_pack",
]) {
  assert(component.includes(snippet), `AgentControlCenter should wire memory/skills context: ${snippet}`);
}

for (const snippet of [
  "Memory / Skills",
  "`memory_retrieve` 与 `skill_route` 是 context_pack 的只读来源",
  "`skill_run` 必须显式 Gateway 授权",
  "npm run verify:memory-skills-context",
  "Memory、Skills、Worker、runtime_events 进入真实 Gateway / UI 链路",
]) {
  assert(doc.includes(snippet), `Phase 4 doc missing memory/skills acceptance: ${snippet}`);
}

for (const snippet of [
  "active_skill_keys",
  "thread_context_policy",
  "context_pack",
]) {
  assert(agentLoop.includes(snippet), `Agent Loop should preserve context pack fields: ${snippet}`);
}

for (const snippet of [
  '"memory_retrieve"',
  '"skill_route"',
  '"skill_run"',
  '"active_skill_keys"',
  '"thread_context_policy"',
  '"uses": ["skill_route", "memory_retrieve", "thread_context"]',
]) {
  assert(gateway.includes(snippet), `Gateway should expose memory/skills context contract: ${snippet}`);
}

for (const snippet of [
  'add("memory_autodream", memory)',
  'add("skill_router", skill_router)',
  'add("skill_runtime", skill_runtime)',
  'assert_true("memory_retrieve" in pack.get("schema", {}).get("uses", [])',
  'assert_true("skill_route" in pack.get("schema", {}).get("uses", [])',
]) {
  assert(healthcheck.includes(snippet), `Gateway healthcheck should guard memory/skills: ${snippet}`);
}

console.log("memory-skills-context-injection ok");

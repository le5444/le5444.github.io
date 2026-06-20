import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const component = readFileSync(new URL("../src/components/AgentControlCenter.tsx", import.meta.url), "utf8");
const transport = readFileSync(new URL("../src/utils/agent-chat-transport.ts", import.meta.url), "utf8");

const start = component.indexOf("const runDirectModelTest = async");
const end = component.indexOf("const frontendProviderRecords", start);
assert(start >= 0 && end > start, "runDirectModelTest block not found");
const block = component.slice(start, end);

assert(
  block.includes("const replyDecision = decideAgentModelReplyContent(output)"),
  "model test must use shared empty-reply guard",
);
assert(
  block.includes("if (!replyDecision.ok)"),
  "model test must branch on empty reply",
);
assert(
  block.includes("throw new Error(replyDecision.detail)"),
  "model test empty reply must enter failure path",
);
assert(
  !block.includes('|| "模型返回为空。"'),
  "model test must not convert an empty reply into a successful sample",
);
assert(
  transport.includes("模型没有返回可显示内容；本次不标记为完成"),
  "shared empty reply guard should explain that empty output is not completed",
);

console.log("model-test-empty-reply-guard ok");

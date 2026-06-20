import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

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

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const {
  buildAgentLoopApprovalResumeEvidenceSummary,
  buildAgentLoopApprovalResumePrompt,
  buildOneShotToolFollowupPrompt,
  stripAgentProtocolForChatDisplay,
} = await compileTsModule("../src/os/kernel/agent-loop-bridge.ts", "agent-loop-bridge");

const followup = buildOneShotToolFollowupPrompt({
  userText: "读取 README 并总结",
  toolResultTexts: ["read_file ok", "workspace_scan ok"],
});
assert(followup.includes("你刚刚请求了本地只读工具"), "followup starts with read-only context");
assert(followup.includes("【用户任务】\n读取 README 并总结"), "followup includes user task");
assert(followup.includes("【工具结果 2】\nworkspace_scan ok"), "followup includes second result");

const resumePrompt = buildAgentLoopApprovalResumePrompt({
  task: "修复项目模式的写入审批链路。",
  approvals: [
    {
      id: "approval-write-1",
      action: "write_file",
      status: "executed",
      target: "src/app.ts",
      message: "写入成功，已备份旧文件。",
    },
    {
      id: "approval-command-2",
      action: "run_command",
      status: "executed",
      target: "node --version",
      message: "run_command approval executed through verification allowlist.",
      request: {
        action: "run_command",
        payload: { command: "node --version", cwd: "." },
      },
      decision: {
        status: "executed",
        action: "run_command",
        target: "node --version",
        run_command: {
          status: "ok",
          returncode: 0,
          argv: ["node", "--version"],
          cwd: "C:/repo",
          stdout: "v22.19.0\n",
          stderr: "",
        },
      },
    },
  ],
});
assert(resumePrompt.startsWith("修复项目模式的写入审批链路。"), "resume prompt starts with original task");
assert(resumePrompt.includes("## 审批结果已返回"), "resume prompt has approval section");
assert(resumePrompt.includes("1. 审批：approval-write-1 动作：write_file 状态：executed 目标：src/app.ts 结果：写入成功，已备份旧文件。"), "resume prompt includes write approval");
assert(resumePrompt.includes("2. 审批：approval-command-2 动作：run_command 状态：executed 目标：node --version 结果：run_command approval executed through verification allowlist."), "resume prompt includes executed command");
assert(resumePrompt.includes("命令执行证据："), "resume prompt includes command evidence");
assert(resumePrompt.includes("- 命令：node --version"), "resume prompt includes command text");
assert(resumePrompt.includes("- 退出码：0"), "resume prompt includes return code");
assert(resumePrompt.includes("- stdout：\n    v22.19.0"), "resume prompt includes stdout");
assert(resumePrompt.includes("如果审批被拒绝或执行失败，不要假装已完成"), "resume prompt guards rejected approval");
assert(resumePrompt.includes("任务完成时回复 ZHIMENG_TASK_COMPLETE。"), "resume prompt keeps completion marker");

const writeEvidencePrompt = buildAgentLoopApprovalResumePrompt({
  task: "继续写入后复核。",
  approvals: [{
    id: "approval-write-evidence",
    action: "write_file",
    status: "executed",
    target: "src/app.ts",
    decision: {
      status: "executed",
      write_file: {
        path: "src/app.ts",
        backup_path: "bridge/backups/app.ts.bak",
        sha256: "abc123",
        bytes: 42,
        message: "写入成功",
      },
    },
  }],
});
assert(writeEvidencePrompt.includes("写入执行证据："), "resume prompt includes write evidence");
assert(writeEvidencePrompt.includes("- 备份：bridge/backups/app.ts.bak"), "write evidence includes backup path");
assert(writeEvidencePrompt.includes("- sha256：abc123"), "write evidence includes hash");

const evidenceSummary = buildAgentLoopApprovalResumeEvidenceSummary({
  approvals: [
    {
      id: "approval-command-2",
      action: "run_command",
      status: "executed",
      target: "node --version",
      decision: {
        run_command: {
          status: "ok",
          returncode: 0,
          argv: ["node", "--version"],
          stdout: "v22.19.0\n",
          stderr: "",
        },
      },
    },
    {
      id: "approval-write-evidence",
      action: "write_file",
      status: "executed",
      target: "src/app.ts",
      decision: {
        write_file: {
          path: "src/app.ts",
          backup_path: "bridge/backups/app.ts.bak",
          sha256: "abc123",
        },
      },
    },
  ],
});
assert(evidenceSummary.includes("run_command · 状态 executed · 目标 node --version"), "evidence summary includes command base");
assert(evidenceSummary.includes("退出码：0"), "evidence summary includes command return code");
assert(evidenceSummary.includes("stdout： · v22.19.0"), "evidence summary includes compact stdout");
assert(evidenceSummary.includes("write_file · 状态 executed · 目标 src/app.ts"), "evidence summary includes write base");
assert(evidenceSummary.includes("备份：bridge/backups/app.ts.bak"), "evidence summary includes write backup");

const fallbackPrompt = buildAgentLoopApprovalResumePrompt({
  task: "   ",
  approvals: [],
  fallbackDetail: "审批状态已经改变。",
});
assert(fallbackPrompt.startsWith("继续完成原任务。"), "fallback prompt has task fallback");
assert(fallbackPrompt.includes("审批状态已经改变。"), "fallback prompt includes detail");

const stripped = stripAgentProtocolForChatDisplay("准备执行\n<bridge-request>{}</bridge-request>\nZHIMENG_TASK_COMPLETE", "fallback");
assertEqual(stripped, "准备执行", "strip removes bridge protocol and marker");
assertEqual(stripAgentProtocolForChatDisplay("<bridge-request>{}</bridge-request>", "fallback"), "已生成本地工具请求，正在交给网关处理。", "strip protocol-only fallback");

console.log("agent-loop-bridge ok");

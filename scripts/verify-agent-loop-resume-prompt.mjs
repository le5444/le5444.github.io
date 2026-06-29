import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function compileTsFileTo(sourceRelativePath, outputPath) {
  const sourcePath = new URL(sourceRelativePath, import.meta.url);
  let source = readFileSync(sourcePath, "utf8");
  source = source.replace(/from "\.\.\/os\/kernel\/agent-loop-bridge"/g, 'from "../os/kernel/agent-loop-bridge.mjs"');
  const compiled = ts.transpileModule(source, {
    fileName: sourcePath.pathname,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  writeFileSync(outputPath, compiled, "utf8");
}

async function compileAgentLoopResumePromptModule() {
  const moduleRoot = join(tmpdir(), `zhimeng-verify-agent-loop-resume-prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const bridgePath = join(moduleRoot, "src", "os", "kernel", "agent-loop-bridge.mjs");
  const promptPath = join(moduleRoot, "src", "utils", "agent-loop-resume-prompt.mjs");
  await import("node:fs").then(({ mkdirSync }) => {
    mkdirSync(dirname(bridgePath), { recursive: true });
    mkdirSync(dirname(promptPath), { recursive: true });
  });
  compileTsFileTo("../src/os/kernel/agent-loop-bridge.ts", bridgePath);
  compileTsFileTo("../src/utils/agent-loop-resume-prompt.ts", promptPath);
  return import(pathToFileURL(promptPath).href);
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
  buildAgentLoopApprovalResumeItems,
  buildAgentLoopResumePromptBundle,
} = await compileAgentLoopResumePromptModule();

const resume = {
  task: "修复项目模式：读取文件，写入补丁，并跑 node --version 验证。",
  approvalIds: ["approval-command-1", "approval-write-2"],
  detail: "审批已返回，可继续 Agent Loop。",
};

const liveApprovals = [
  {
    id: "approval-command-1",
    action: "run_command",
    status: "executed",
    target: "node --version",
    message: "命令审批已经执行。",
  },
  {
    id: "approval-write-2",
    action: "write_file",
    status: "executed",
    target: "src/app.ts",
    message: "写入审批已经执行。",
    result: {
      approval_decide: {
        write_file: {
          path: "src/app.ts",
          backup_path: "bridge/backups/app.ts.bak",
          sha256: "abc123",
          bytes: 42,
          message: "写入成功",
        },
        write_file_verify_read_result: {
          action: "read_file",
          source: "write_file_approval_verify",
          approval_id: "approval-write-2",
          target_path: "src/app.ts",
          status: "ok",
          content_chars: 42,
          detail: "已复核 42 字符：src/app.ts",
          content_preview: "export const ok = true;\n",
        },
      },
    },
  },
];

const records = [
  {
    id: "approval-command-1",
    request: {
      action: "run_command",
      payload: { command: "node --version", cwd: "." },
    },
    result: {
      approval_decide: {
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
    decision: {
      status: "executed",
      action: "run_command",
      target: "node --version",
      message: "run_command approval executed through verification allowlist.",
    },
  },
  {
    id: "approval-write-2",
    request: {
      action: "write_file",
      payload: { path: "src/app.ts" },
    },
    result: {
      approval_decide: {
        write_file: {
          path: "src/app.ts",
          backup_path: "bridge/backups/app.ts.bak",
          sha256: "abc123",
          bytes: 42,
          message: "写入成功",
        },
      },
    },
    decision: {
      status: "executed",
      action: "write_file",
      target: "src/app.ts",
      message: "写入成功，已备份旧文件。",
    },
  },
];

const items = buildAgentLoopApprovalResumeItems({ resume, liveApprovals, records });
assertEqual(items.length, 2, "resume item count");
assertEqual(items[0].action, "run_command", "command action from live approval");
assertEqual(items[0].status, "executed", "command status from decision");
assertEqual(items[1].action, "write_file", "write action from live approval");

const bundle = buildAgentLoopResumePromptBundle({ resume, liveApprovals, records });
assertEqual(bundle.items.length, 2, "bundle keeps evidence items");
assert(bundle.task.startsWith("修复项目模式"), "bundle task starts with original task");
assert(bundle.task.includes("## 审批结果已返回"), "bundle task includes approval section");
assert(bundle.task.includes("命令执行证据："), "bundle task includes command evidence");
assert(bundle.task.includes("- 命令：node --version"), "bundle task includes command text");
assert(bundle.task.includes("- 退出码：0"), "bundle task includes return code");
assert(bundle.task.includes("- stdout：\n    v22.19.0"), "bundle task includes stdout");
assert(bundle.task.includes("写入执行证据："), "bundle task includes write evidence");
assert(bundle.task.includes("- 备份：bridge/backups/app.ts.bak"), "bundle task includes backup path");
assert(bundle.task.includes("- sha256：abc123"), "bundle task includes write hash");
assert(bundle.task.includes("写后复核证据："), "bundle task includes write verification evidence");
assert(bundle.task.includes("- 来源：write_file_approval_verify"), "bundle task includes write verification source");
assert(bundle.task.includes("- 路径：src/app.ts"), "bundle task includes write verification path");
assert(bundle.task.includes("任务完成时回复 ZHIMENG_TASK_COMPLETE。"), "bundle task keeps completion marker");
assert(bundle.evidenceSummary.includes("run_command · 状态 executed · 目标 node --version"), "summary includes command approval");
assert(bundle.evidenceSummary.includes("stdout： · v22.19.0"), "summary includes command stdout");
assert(bundle.evidenceSummary.includes("write_file · 状态 executed · 目标 src/app.ts"), "summary includes write approval");
assert(bundle.evidenceSummary.includes("备份：bridge/backups/app.ts.bak"), "summary includes write backup");
assert(bundle.evidenceSummary.includes("写后复核证据："), "summary includes write verification evidence");
assert(bundle.evidenceSummary.includes("来源：write_file_approval_verify"), "summary includes write verification source");

const fallbackBundle = buildAgentLoopResumePromptBundle({
  resume: {
    task: "",
    approvalIds: ["approval-missing"],
    detail: "审批结果已返回，但 Gateway 记录暂不可用。",
  },
  snapshots: [{
    id: "approval-missing",
    action: "provider_probe",
    status: "executed",
    target: "https://example.test/v1/models",
    message: "模型列表探针已完成。",
  }],
});
assert(fallbackBundle.task.startsWith("继续完成原任务。"), "fallback task title");
assert(fallbackBundle.task.includes("provider_probe"), "fallback uses snapshot action");
assert(fallbackBundle.evidenceSummary.includes("模型列表探针已完成"), "fallback summary uses snapshot message");

console.log("agent-loop-resume-prompt ok");

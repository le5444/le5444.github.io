import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function compileTsModule(relativePath, name, replacements = []) {
  const sourcePath = new URL(relativePath, import.meta.url);
  let source = readFileSync(sourcePath, "utf8");
  for (const [pattern, replacement] of replacements) {
    source = source.replace(pattern, replacement);
  }
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

const stubPath = join(tmpdir(), `zhimeng-executor-bridge-stubs-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
writeFileSync(stubPath, [
  "export function uid(){ return 'testid'; }",
].join("\n"), "utf8");
const stubUrl = pathToFileURL(stubPath).href;

const commandValidatorsSourcePath = new URL("../src/utils/command-validators.ts", import.meta.url);
const commandValidatorsCompiled = ts.transpileModule(readFileSync(commandValidatorsSourcePath, "utf8"), {
  fileName: commandValidatorsSourcePath.pathname,
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2020,
    verbatimModuleSyntax: false,
  },
}).outputText;
const commandValidatorsPath = join(tmpdir(), `zhimeng-command-validators-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
writeFileSync(commandValidatorsPath, commandValidatorsCompiled, "utf8");
const commandValidatorsUrl = pathToFileURL(commandValidatorsPath).href;

const {
  DEFAULT_EXECUTOR_BRIDGE,
  createExecutorBridgeRequest,
  extractExecutorBridgeRequestsFromText,
} = await compileTsModule("../src/utils/executor-bridge.ts", "executor-bridge", [
  [/import type \{ PersonalOSPlan \} from "\.\/personal-os";/g, ""],
  [/import type \{ ToolRouteBundle \} from "\.\/tool-registry";/g, ""],
  [/import \{ type CommandDraft, type CommandValidationResult, validateCommandDraft \} from "\.\/command-validators";/g, `import { validateCommandDraft } from ${JSON.stringify(commandValidatorsUrl)};`],
  [/import \{ uid \} from "\.\/helpers";/g, `import { uid } from ${JSON.stringify(stubUrl)};`],
]);

const single = extractExecutorBridgeRequestsFromText(`
<bridge-request>
{"action":"read_file","purpose":"读取 README","payload":{"path":"README.md"}}
</bridge-request>
`);
assertEqual(single.length, 1, "single request count");
assertEqual(single[0].action, "read_file", "single request action");
assertEqual(single[0].purpose, "读取 README", "single request purpose");
assertEqual(single[0].payload.path, "README.md", "single request payload");
assertEqual(single[0].approvalRequired, false, "read_file dry-run request is not approval-required");

const fenced = extractExecutorBridgeRequestsFromText(`
<bridge-request>
\`\`\`JSON
{"action":"workspace_scan","reason":"列目录","payload":{"path":"C:/repo","metadata_only":true}}
\`\`\`
</bridge-request>
`);
assertEqual(fenced.length, 1, "uppercase JSON fence count");
assertEqual(fenced[0].action, "workspace_scan", "uppercase JSON fence action");
assertEqual(fenced[0].purpose, "列目录", "reason fallback purpose");

const arrayRequests = extractExecutorBridgeRequestsFromText(`
<bridge-request>
[
  {"action":"read_file","payload":{"path":"a.md"}},
  {"action":"write_file","purpose":"写入草案","payload":{"path":"b.md","content":"ok"}}
]
</bridge-request>
`);
assertEqual(arrayRequests.length, 2, "array request count");
assertEqual(arrayRequests[0].purpose, "AI 请求调用本地执行桥", "default purpose");
assertEqual(arrayRequests[1].action, "write_file", "array second action");
assertEqual(arrayRequests[1].approvalRequired, true, "write_file needs approval");

const wrapped = extractExecutorBridgeRequestsFromText(`
<bridge-request>
{"requests":[
  {"action":"status","payload":{}},
  {"action":"run_command","purpose":"危险命令","payload":{"command":"git reset --hard","cwd":"C:/repo"}}
]}
</bridge-request>
`);
assertEqual(wrapped.length, 2, "wrapped request count");
assertEqual(wrapped[0].action, "status", "wrapped status action");
assertEqual(wrapped[1].action, "run_command", "wrapped command action");
assertEqual(wrapped[1].approvalRequired, true, "dangerous command approval required");
assert(wrapped[1].validation.some((item) => item.severity === "block" && item.key === "git_reset_hard"), "dangerous command blocked");

const denied = extractExecutorBridgeRequestsFromText(
  `<bridge-request>{"action":"run_command","payload":{"command":"node --version"}}</bridge-request>`,
  { ...DEFAULT_EXECUTOR_BRIDGE, deniedActions: ["run_command"] },
);
assertEqual(denied.length, 0, "denied action ignored");

const invalid = extractExecutorBridgeRequestsFromText(`
<bridge-request>{not valid json}</bridge-request>
<bridge-request>{"action":"not_real","payload":{}}</bridge-request>
`);
assertEqual(invalid.length, 0, "invalid json and unknown action ignored");

const direct = createExecutorBridgeRequest({
  manifest: DEFAULT_EXECUTOR_BRIDGE,
  action: "run_command",
  purpose: "环境检查",
  payload: { command: "node --version" },
});
assertEqual(direct.validation[0].severity, "pass", "safe command validator pass");
assertEqual(direct.approvalRequired, true, "run_command still needs approval by action policy");

console.log("executor-bridge ok");

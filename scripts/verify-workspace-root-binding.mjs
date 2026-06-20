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

const { planWorkspaceRootBinding } = await compileTsModule("../src/utils/workspace-root-binding.ts", "workspace-root-binding");

const emptyPlan = planWorkspaceRootBinding({
  workspaceTitle: "织梦项目",
  rootInput: "   ",
  current: { rootPath: "", accessMode: "virtual" },
});
assertEqual(emptyPlan.ok, false, "empty root is not ok");
assertEqual(emptyPlan.runtimeStatus, "skipped", "empty root skipped");
assertEqual(emptyPlan.shouldClearScanIndex, false, "empty root does not clear scan index");
assert(emptyPlan.previewDetail.includes("虚拟文件树"), "empty root keeps virtual tree hint");

const firstBindPlan = planWorkspaceRootBinding({
  workspaceTitle: "织梦项目",
  rootInput: " C:\\Projects\\Dream ",
  current: { rootPath: "", accessMode: "virtual" },
});
assertEqual(firstBindPlan.ok, true, "first bind ok");
assertEqual(firstBindPlan.nextRoot, "C:\\Projects\\Dream", "first bind trims root");
assertEqual(firstBindPlan.rootChanged, true, "first bind root changed");
assertEqual(firstBindPlan.nextAccessMode, "read_only", "virtual mode upgrades to read_only");
assertEqual(firstBindPlan.shouldClearScanIndex, true, "changed root clears scan index");
assert(firstBindPlan.eventDetail.includes("旧路径索引已清空"), "changed root event mentions scan reset");
assert(firstBindPlan.attachmentDetail.includes("只读映射"), "first bind attachment uses read-only label");

const confirmPlan = planWorkspaceRootBinding({
  workspaceTitle: "织梦项目",
  rootInput: "C:\\Projects\\Dream",
  current: { rootPath: "C:\\Projects\\Dream", accessMode: "read_only" },
});
assertEqual(confirmPlan.ok, true, "confirm root ok");
assertEqual(confirmPlan.rootChanged, false, "confirm root unchanged");
assertEqual(confirmPlan.nextAccessMode, "read_only", "confirm keeps read_only");
assertEqual(confirmPlan.shouldClearScanIndex, false, "unchanged root keeps scan index");
assert(confirmPlan.eventDetail.includes("路径未变化"), "confirm event mentions unchanged path");

const approvalPlan = planWorkspaceRootBinding({
  workspaceTitle: "织梦项目",
  rootInput: "/Users/me/project",
  current: { rootPath: "/Users/me/old", accessMode: "approval" },
});
assertEqual(approvalPlan.nextAccessMode, "approval", "approval mode is preserved");
assert(approvalPlan.attachmentDetail.includes("审批访问"), "approval attachment label is preserved");

console.log("workspace-root-binding ok");

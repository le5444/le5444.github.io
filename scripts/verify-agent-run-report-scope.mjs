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

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const {
  filterRunReportsForThread,
  latestRunReportForThread,
  planRunReportAttachToThread,
  resolveRunReportWorkspaceScope,
} = await compileTsModule("../src/utils/agent-run-report-scope.ts", "agent-run-report-scope");

const reports = [
  { id: "report-global-newest", threadId: "thread-other", threadTitle: "别的线程", createdAt: 3000 },
  { id: "report-current-newest", threadId: "thread-current", threadTitle: "当前线程", createdAt: 2000 },
  { id: "report-current-old", threadId: "thread-current", threadTitle: "当前线程", createdAt: 1000 },
];

const currentReports = filterRunReportsForThread(reports, "thread-current");
assertEqual(currentReports.length, 2, "filters current thread reports");
assertEqual(currentReports[0].id, "report-current-newest", "keeps report ordering after filtering");
assertEqual(latestRunReportForThread(reports, "thread-current")?.id, "report-current-newest", "latest uses current thread, not global latest");
assertEqual(latestRunReportForThread(reports, "missing-thread"), null, "missing thread has no report");
assertEqual(filterRunReportsForThread(reports, "").length, 0, "empty thread does not expose global reports");

const okPlan = planRunReportAttachToThread(reports[1], { id: "thread-current", title: "当前线程" });
assertEqual(okPlan.ok, true, "same-thread report can attach");
assertEqual(okPlan.status, "attachable", "same-thread status");

const missingPlan = planRunReportAttachToThread(reports[1], null);
assertEqual(missingPlan.ok, false, "missing active thread blocks attach");
assertEqual(missingPlan.status, "missing_thread", "missing active thread status");

const mismatchPlan = planRunReportAttachToThread(reports[0], { id: "thread-current", title: "当前线程" });
assertEqual(mismatchPlan.ok, false, "cross-thread report is blocked");
assertEqual(mismatchPlan.status, "thread_mismatch", "cross-thread status");
assertEqual(mismatchPlan.reportThreadId, "thread-other", "cross-thread report id kept");
assertEqual(mismatchPlan.activeThreadId, "thread-current", "cross-thread active id kept");
assert(mismatchPlan.detail.includes("避免上下文串线"), "cross-thread detail explains risk");

const workspaces = [
  { id: "book-other", title: "别的项目", domain: "research" },
  { id: "book-current", title: "当前绑定项目", domain: "coding" },
];
const boundWorkspace = resolveRunReportWorkspaceScope({
  id: "thread-current",
  workspaceId: "book-current",
}, workspaces);
assertEqual(boundWorkspace.workspaceTitle, "当前绑定项目", "workspace resolves by thread workspace id");
assertEqual(boundWorkspace.workspaceDomain, "coding", "workspace domain resolves by thread workspace id");

const threadWorkspaceOverride = resolveRunReportWorkspaceScope({
  id: "thread-current",
  workspaceId: "book-current",
  workspaceTitle: "线程快照项目",
  workspaceDomain: "snapshot-domain",
}, workspaces);
assertEqual(threadWorkspaceOverride.workspaceTitle, "线程快照项目", "thread workspace title wins over current workspace");
assertEqual(threadWorkspaceOverride.workspaceDomain, "snapshot-domain", "thread workspace domain wins over current workspace");

const freeThreadWorkspace = resolveRunReportWorkspaceScope({ id: "thread-free" }, workspaces);
assertEqual(freeThreadWorkspace.workspaceTitle, "未绑定工作区", "free thread does not inherit selected workspace");
assertEqual(freeThreadWorkspace.workspaceDomain, "未指定", "free thread domain stays unbound");

console.log("agent-run-report-scope ok");

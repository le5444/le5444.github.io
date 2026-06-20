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
  buildWriteFileDiffDraftFromPayload,
  commandFileIdFromPath,
  writeFileDraftInputsFromPayload,
} = await compileTsModule("../src/utils/write-file-diff-draft.ts", "write-file-diff-draft");

const fallback = "bridge/agent-files/command-center-plan.md";

const multiInputs = writeFileDraftInputsFromPayload({
  mode: "replace",
  access_profile: "workspace",
  request_id: "req-root",
  files: [
    { path: "src/a.ts", content: "export const a = 1;", expected_sha256: "sha-a" },
    { target_path: "docs/b.md", text: "# B\nhello", mode: "append", access_profile: "full_access" },
    { path: "empty.md", content: "   " },
  ],
}, fallback);
assertEqual(multiInputs.length, 2, "multi input filters empty file");
assertEqual(multiInputs[0].path, "src/a.ts", "first path");
assertEqual(multiInputs[0].mode, "replace", "first inherits mode");
assertEqual(multiInputs[0].oldSha256, "sha-a", "first sha");
assertEqual(multiInputs[1].path, "docs/b.md", "second target path fallback");
assertEqual(multiInputs[1].mode, "append", "second own mode");
assertEqual(multiInputs[1].accessProfile, "full_access", "second own access profile");

const draft = buildWriteFileDiffDraftFromPayload({
  payload: {
    mode: "replace",
    access_profile: "workspace",
    files: [
      { path: "src/a.ts", content: "export const a = 1;" },
      { target_relative: "docs/b.md", text: "# B\nhello", mode: "append" },
    ],
  },
  fallbackPath: fallback,
  purpose: "修复 Agent 写入请求\n并进入 Diff 审查",
  requestId: "exec-1",
  round: 2,
  hunkId: (_input, index) => `hunk-${index + 1}`,
});
assert(draft, "draft exists");
assertEqual(draft.status, "draft", "draft status");
assertEqual(draft.targetPaths.join(","), "src/a.ts,docs/b.md", "draft target paths");
assertEqual(draft.hunks.length, 2, "draft hunk count");
assertEqual(draft.hunks[0].id, "hunk-1", "deterministic hunk id");
assertEqual(draft.hunks[0].fileId, commandFileIdFromPath("src/a.ts", fallback), "file id");
assert(draft.hunks[0].content.includes("@@ AI write_file proposal · replace · file 1/2 @@"), "first hunk header");
assert(draft.hunks[0].content.includes("第 2 轮"), "round marker");
assert(draft.hunks[0].content.includes("目的：修复 Agent 写入请求 并进入 Diff 审查"), "purpose sanitized");
assertEqual(draft.proposal.files.length, 2, "proposal files");
assertEqual(draft.proposal.files[1].path, "docs/b.md", "proposal second path");
assertEqual(draft.proposal.source, "ai_write_file_bridge_request", "proposal source");
assert(draft.planItems.some((item) => item.label === "文件级写入审批" && item.status === "approval_required"), "approval step exists");

const single = buildWriteFileDiffDraftFromPayload({
  payload: { target_path: "notes/todo.md", content: "- one", mode: "append" },
  fallbackPath: fallback,
});
assert(single, "single draft exists");
assertEqual(single.targetPaths[0], "notes/todo.md", "single target");
assertEqual(single.hunks[0].writeContent, "- one", "single write content");

const blocked = buildWriteFileDiffDraftFromPayload({
  payload: { path: "notes/empty.md", content: " " },
  fallbackPath: fallback,
});
assertEqual(blocked, null, "empty content blocked");

console.log("write-file-diff-draft ok");

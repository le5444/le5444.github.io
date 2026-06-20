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
  buildWorkspacePreviewDiffDraft,
  buildWorkspaceReadPreviewAttachment,
} = await compileTsModule("../src/utils/workspace-read-preview.ts", "workspace-read-preview");

const preview = {
  status: "ok",
  path: "src/agent-loop.ts",
  targetPath: "C:\\Projects\\Zhimeng\\src\\agent-loop.ts",
  content: [
    "export async function runAgentLoop() {",
    "  return 'loop';",
    "}",
    "const marker = 'preview-only';",
  ].join("\n"),
};

const attachmentDraft = buildWorkspaceReadPreviewAttachment({
  preview,
  title: "agent-loop.ts",
  maxChars: 42,
});
assertEqual(attachmentDraft.attachment.kind, "file", "attachment kind");
assertEqual(attachmentDraft.attachment.title, "agent-loop.ts", "attachment title");
assertEqual(attachmentDraft.attachment.source, "Gateway read_file 预览", "attachment source");
assertEqual(attachmentDraft.attachment.status, "ok", "attachment status");
assertEqual(attachmentDraft.attachment.ref, preview.targetPath, "attachment ref target");
assertEqual(attachmentDraft.previewText.length, 42, "attachment preview length");
assertEqual(attachmentDraft.totalChars, preview.content.length, "attachment total chars");
assertEqual(attachmentDraft.truncated, true, "attachment truncated");
assert(attachmentDraft.attachment.detail.includes("路径：src/agent-loop.ts"), "attachment detail path");
assert(attachmentDraft.attachment.detail.includes("读取目标：C:\\Projects\\Zhimeng\\src\\agent-loop.ts"), "attachment detail target");
assert(attachmentDraft.attachment.detail.includes("完整正文未持久保存"), "attachment warns not persisted");
assert(attachmentDraft.attachment.detail.includes("```text"), "attachment wraps preview");

const diffDraft = buildWorkspacePreviewDiffDraft({
  preview,
  taskText: "把 agent 循环补上真实工具回放。",
  hunkId: "read-preview-diff-test",
  sourcePreviewChars: 55,
  sourcePreviewLines: 2,
});
assertEqual(diffDraft.targetPath, preview.targetPath, "diff target path");
assertEqual(diffDraft.sourcePath, preview.path, "diff source path");
assertEqual(diffDraft.taskText, "把 agent 循环补上真实工具回放。", "diff task text");
assertEqual(diffDraft.hunk.id, "read-preview-diff-test", "diff hunk id");
assertEqual(diffDraft.hunk.fileId, `command-${preview.targetPath}`, "diff hunk file id");
assertEqual(diffDraft.hunk.mode, "append", "diff hunk mode");
assertEqual(diffDraft.hunk.accessProfile, "workspace", "diff hunk access profile");
assertEqual(diffDraft.hunk.status, "pending", "diff hunk is pending");
assert(diffDraft.hunk.title.includes("agent-loop.ts"), "diff hunk title uses basename");
assert(diffDraft.hunk.content.includes("read_file 预览生成"), "diff hunk states preview source");
assert(diffDraft.hunk.content.includes("+## 建议修改"), "diff hunk contains edit section");
assert(diffDraft.hunk.content.includes("+...预览已截断，完整文件仍需再次 read_file。"), "diff hunk warns truncated source");
assert(!diffDraft.hunk.writeContent.includes("--- "), "write content strips diff header");
assert(!diffDraft.hunk.writeContent.includes("+++ "), "write content strips target header");
assert(diffDraft.hunk.writeContent.includes("当前任务：把 agent 循环补上真实工具回放。"), "write content keeps task");
assertEqual(diffDraft.approval.status, "draft", "approval status");
assertEqual(diffDraft.approval.decision, "等待审查 Diff", "approval decision");
assert(diffDraft.approval.detail.includes("接受后可进入 write_file 审批"), "approval detail says approval required");
assertEqual(diffDraft.approval.planItems.length, 4, "approval plan length");
assert(diffDraft.approval.planItems[1].detail.includes("不写入磁盘"), "approval plan says no disk write");
assertEqual(diffDraft.approval.proposal.source, "read_file_preview", "approval proposal source");
assertEqual(diffDraft.approval.writeRequest, null, "approval has no write request");
assertEqual(diffDraft.approval.writeResult, null, "approval has no write result");

console.log("workspace-read-preview ok");

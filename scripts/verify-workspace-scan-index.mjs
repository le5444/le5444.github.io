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
  buildWorkspaceScanIndex,
  normalizeWorkspaceScanIndex,
  normalizeWorkspaceScanIndexItem,
  planWorkspaceScanRequest,
  workspaceIndexedReadPath,
  workspaceScanIndexContextItem,
} = await compileTsModule("../src/utils/workspace-scan-index.ts", "workspace-scan-index");

const emptyRootScanPlan = planWorkspaceScanRequest({
  workspaceSelected: true,
  rootPath: "",
  accessMode: "virtual",
  gatewayOnline: true,
  readGateOpen: true,
  fullAccessGateOpen: true,
  execute: true,
});
assertEqual(emptyRootScanPlan.ok, false, "empty root scan is blocked");
assert(emptyRootScanPlan.blockedReason.includes("未绑定"), "empty root explains binding requirement");
assertEqual(emptyRootScanPlan.request, null, "empty root does not create fake dot scan request");

const virtualRootScanPlan = planWorkspaceScanRequest({
  workspaceSelected: true,
  rootPath: "C:\\Projects\\Dream",
  accessMode: "virtual",
  gatewayOnline: true,
  readGateOpen: true,
  fullAccessGateOpen: true,
  execute: true,
});
assertEqual(virtualRootScanPlan.ok, false, "virtual root scan is blocked");
assert(virtualRootScanPlan.blockedReason.includes("虚拟路径"), "virtual root explains real mapping requirement");
assertEqual(virtualRootScanPlan.request, null, "virtual root does not create executable scan request");

const fullAccessClosedPlan = planWorkspaceScanRequest({
  workspaceSelected: true,
  rootPath: "C:\\Projects\\Dream",
  accessMode: "read_only",
  gatewayOnline: true,
  readGateOpen: true,
  fullAccessGateOpen: false,
  execute: true,
});
assertEqual(fullAccessClosedPlan.ok, false, "real root execute scan requires full access gate");
assertEqual(fullAccessClosedPlan.request.path, "C:\\Projects\\Dream", "blocked real root plan keeps auditable request");
assertEqual(fullAccessClosedPlan.request.metadata_only, true, "blocked real root request stays metadata only");

const dryRunPlan = planWorkspaceScanRequest({
  workspaceSelected: true,
  rootPath: "C:\\Projects\\Dream",
  accessMode: "read_only",
  gatewayOnline: false,
  readGateOpen: false,
  fullAccessGateOpen: false,
  includeGlobs: ["**/*.md"],
  excludeGlobs: ["node_modules/**", ".git/**", "src/**/*.test.ts"],
  execute: false,
});
assertEqual(dryRunPlan.ok, true, "real root dry run can be prepared without live gateway");
assertEqual(dryRunPlan.request.path, "C:\\Projects\\Dream", "dry run uses bound root path");
assertEqual(dryRunPlan.request.root, "C:\\Projects\\Dream", "dry run root uses bound root path");
assertEqual(dryRunPlan.request.access_profile, "full_access", "real root dry run uses full access profile");
assertEqual(dryRunPlan.request.metadata_only, true, "dry run is metadata only");
assertEqual(dryRunPlan.request.execute, false, "dry run request is not executable");
assert(dryRunPlan.request.exclude_dirs.includes("src"), "dry run derives stable exclude dirs from globs");

const executablePlan = planWorkspaceScanRequest({
  workspaceSelected: true,
  rootPath: "C:\\Projects\\Dream",
  accessMode: "approval",
  gatewayOnline: true,
  readGateOpen: true,
  fullAccessGateOpen: true,
  includeGlobs: ["**/*.ts"],
  excludeGlobs: ["dist/**"],
  maxDepth: 4,
  limit: 32,
  execute: true,
});
assertEqual(executablePlan.ok, true, "bound real root can execute when gates are open");
assertEqual(executablePlan.request.path, "C:\\Projects\\Dream", "execute plan uses bound root path");
assertEqual(executablePlan.request.max_depth, 4, "execute plan preserves max depth");
assertEqual(executablePlan.request.limit, 32, "execute plan preserves limit");
assertEqual(executablePlan.request.execute, true, "execute plan marks request executable");

const normalizedFile = normalizeWorkspaceScanIndexItem({
  path: "src\\main.ts",
  is_dir: false,
  extension: ".ts",
  size: "128",
  modified_at: "2026-06-19T00:00:00Z",
  depth: "2",
});
assertEqual(normalizedFile.name, "main.ts", "normalizes basename from Windows path");
assertEqual(normalizedFile.isDir, false, "normalizes file flag");
assertEqual(normalizedFile.size, 128, "normalizes size");
assertEqual(normalizedFile.depth, 2, "normalizes depth");
assertEqual(normalizeWorkspaceScanIndexItem({ name: "missing-path" }), null, "rejects item without path");

const scanIndex = buildWorkspaceScanIndex({
  workspaceId: "book-1",
  workspaceTitle: "织梦项目",
  request: { path: "C:\\Projects\\Dream", metadata_only: true },
  at: 123456,
  scan: {
    root_input: "C:\\Projects\\Dream",
    access_profile: "full_access",
    max_depth: 3,
    limit: 10,
    has_more: true,
    skipped: 2,
    items: [
      { path: ".", is_dir: true, depth: 0 },
      { path: "docs/guide.md", is_dir: false, extension: ".md", size: 20, depth: 1 },
      { path: "src\\main.ts", is_dir: false, extension: ".ts", size: 128, depth: 2 },
    ],
    policy: { metadata_only: true },
  },
});
assertEqual(scanIndex.workspaceId, "book-1", "build index workspace id");
assertEqual(scanIndex.rootPath, "C:\\Projects\\Dream", "build index root path");
assertEqual(scanIndex.accessProfile, "full_access", "build index access profile");
assertEqual(scanIndex.returned, 3, "build index default returned");
assertEqual(scanIndex.fileCount, 2, "build index file count");
assertEqual(scanIndex.dirCount, 1, "build index dir count");
assertEqual(scanIndex.hasMore, true, "build index has more");
assertEqual(scanIndex.request.path, "C:\\Projects\\Dream", "build index keeps request");

const persisted = normalizeWorkspaceScanIndex({
  workspaceId: "book-1",
  workspaceTitle: "织梦项目",
  rootPath: "/Users/me/project",
  accessProfile: "workspace",
  returned: "2",
  hasMore: "false",
  items: [
    { path: "./README.md", isDir: false, extension: ".md" },
    { path: "src", isDir: true },
  ],
});
assertEqual(persisted.fileCount, 1, "persisted file count fallback");
assertEqual(persisted.dirCount, 1, "persisted dir count fallback");
assertEqual(persisted.returned, 2, "persisted returned number");
assertEqual(persisted.hasMore, false, "persisted has more false");

assertEqual(
  workspaceIndexedReadPath(scanIndex, scanIndex.items[1]),
  "C:\\Projects\\Dream\\docs\\guide.md",
  "Windows root joins with backslash",
);
assertEqual(
  workspaceIndexedReadPath(persisted, persisted.items[0]),
  "/Users/me/project/README.md",
  "POSIX root joins with slash and strips leading dot",
);
assertEqual(
  workspaceIndexedReadPath({ ...persisted, rootPath: "" }, { ...persisted.items[0], path: "" }),
  ".",
  "empty relative path falls back to root",
);

const contextItem = workspaceScanIndexContextItem(scanIndex);
assert(contextItem.summary.includes("2 个文件"), "context summary includes file count");
assert(contextItem.summary.includes("仅目录元数据"), "context summary states metadata only");
assertEqual(contextItem.sample_paths.length, 3, "context item exposes sample paths");

console.log("workspace-scan-index ok");

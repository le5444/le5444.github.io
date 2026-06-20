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

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    writes: [],
    loadJSON(key, fallback) {
      if (!map.has(key)) return fallback;
      return JSON.parse(map.get(key));
    },
    saveJSON(key, value) {
      this.writes.push({ key, value });
      map.set(key, JSON.stringify(value));
      return true;
    },
    raw(key) {
      return map.has(key) ? JSON.parse(map.get(key)) : undefined;
    },
  };
}

const {
  AGENT_THREADS_KEY,
  AGENT_THREAD_SPACES_KEY,
  LEGACY_AGENT_THREADS_KEY,
  LEGACY_AGENT_THREAD_SPACES_KEY,
  agentThreadSpaceKey,
  agentThreadSpaceLabel,
  archiveAgentThreadRecord,
  buildAgentThreadSpacesIndex,
  createAgentThreadRecord,
  deleteAgentThreadRecord,
  flattenAgentThreadSpaces,
  loadAgentThreads,
  mergeAgentThreadContextAttachments,
  normalizeAgentThreadRecord,
  normalizeAgentThreadSpacesIndex,
  persistAgentThreads,
  renameAgentThreadRecord,
  restoreAgentThreadRecord,
  threadMessageRoleFromEvent,
  togglePinAgentThreadRecord,
} = await compileTsModule("../src/utils/agent-thread-store.ts", "agent-thread-store");

const freeThread = {
  id: "thread-free",
  title: "自由对话",
  task: "不绑定项目地聊天",
  status: "current",
  summary: "自由对话摘要",
  createdAt: 100,
  updatedAt: 300,
  workspaceId: null,
  approvalCount: 0,
  approvalIds: [],
  approvalSnapshots: [],
  diffCount: 0,
  events: [],
  messages: [{
    id: "msg-free",
    role: "user",
    title: "用户消息",
    content: "你好",
    status: "sent",
    at: 301,
    attachments: [{
      id: "image-1",
      kind: "image",
      name: "screen.png",
      mimeType: "image/png",
      size: 12,
      dataUrl: "data:image/png;base64,AAAA",
      parseStatus: "parsed",
      parser: "图片输入",
    }],
  }],
  contextAttachments: [],
};

const projectThread = {
  id: "thread-project",
  title: "项目对话",
  task: "读取项目文件",
  status: "current",
  summary: "项目对话摘要",
  createdAt: 100,
  updatedAt: 500,
  pinnedAt: 450,
  workspaceId: "book-1",
  workspaceTitle: "织梦项目",
  workspaceDomain: "AI Agent 工作台",
  approvalCount: 0,
  approvalIds: [],
  approvalSnapshots: [],
  diffCount: 1,
  events: [{
    id: "event-approval",
    kind: "approval",
    title: "审批",
    detail: "approval approval-run-1 等待执行命令",
    status: "pending",
    at: 400,
  }],
  messages: [{
    id: "msg-project",
    role: "assistant",
    title: "文件摘要",
    content: "已读取文件。",
    status: "ok",
    at: 410,
    attachments: [{
      id: "file-1",
      kind: "file",
      name: "README.md",
      mimeType: "text/markdown",
      size: 120,
      textPreview: "# 织梦",
      parseStatus: "parsed",
      parser: "文本片段",
    }],
  }],
  contextAttachments: [{
    id: "context-workspace",
    kind: "workspace",
    title: "织梦项目",
    detail: "已绑定",
    ref: "book-1",
    source: "workspace",
    status: "bound",
    at: 405,
  }],
};

const index = buildAgentThreadSpacesIndex([freeThread, projectThread], "test");
assertEqual(Object.keys(index.spaces).sort().join(","), "unbound,workspace:book-1", "spaces group free and project threads");
assertEqual(index.spaces["workspace:book-1"][0].id, "thread-project", "project space keeps project thread");
assertEqual(flattenAgentThreadSpaces(index)[0].id, "thread-project", "flatten sorts newest first");
assertEqual(agentThreadSpaceKey("book-1"), "workspace:book-1", "workspace space key");
assertEqual(agentThreadSpaceKey(null), "unbound", "free space key");
assertEqual(agentThreadSpaceLabel("workspace:book-1", [{ id: "book-1", title: "织梦项目" }]), "织梦项目", "space label from workspace list");
assertEqual(agentThreadSpaceLabel("unbound", []), "自由对话", "unbound label");

const normalized = normalizeAgentThreadSpacesIndex({
  version: 1,
  spaces: {
    "workspace:book-1": [projectThread],
    unbound: [freeThread],
  },
});
assert(normalized, "normalizes spaces index");
assertEqual(normalized.spaces["workspace:book-1"][0].approvalIds[0], "approval-run-1", "approval id recovered from event detail");
assertEqual(normalized.spaces.unbound[0].messages[0].attachments[0].dataUrl, "data:image/png;base64,AAAA", "image data url survives normalize");
assertEqual(normalized.spaces["workspace:book-1"][0].messages[0].attachments[0].textPreview, "# 织梦", "file preview survives normalize");

const fallback = normalizeAgentThreadRecord({
  id: "thread-fallback",
  title: "旧线程",
  task: "恢复任务",
  summary: "只有事件没有消息",
  updatedAt: 200,
  events: [{
    id: "event-write",
    kind: "write",
    title: "写入草案",
    detail: "生成 Diff 审查",
    status: "pending",
    at: 210,
  }],
});
assert(fallback.messages.some((message) => message.title === "线程恢复"), "fallback restore message is created");
assert(fallback.messages.some((message) => message.title === "目标任务"), "fallback task message is created");
assert(fallback.messages.some((message) => message.role === "tool" && message.title === "写入草案"), "fallback event becomes tool message");
assertEqual(threadMessageRoleFromEvent("draft"), "assistant", "draft event maps to assistant");
assertEqual(threadMessageRoleFromEvent("approval"), "tool", "approval event maps to tool");

const currentSpaceStorage = memoryStorage({
  [AGENT_THREAD_SPACES_KEY]: {
    version: 1,
    spaces: {
      "workspace:book-1": [projectThread],
      unbound: [freeThread],
    },
  },
});
assertEqual(loadAgentThreads(currentSpaceStorage)[0].id, "thread-project", "load prefers spaces index");

const legacyFlatStorage = memoryStorage({
  [LEGACY_AGENT_THREADS_KEY]: [freeThread, projectThread],
});
const migratedThreads = loadAgentThreads(legacyFlatStorage);
assertEqual(migratedThreads.length, 2, "legacy flat threads load");
assertEqual(legacyFlatStorage.raw(AGENT_THREAD_SPACES_KEY).migratedFrom, LEGACY_AGENT_THREADS_KEY, "legacy flat threads migrate to spaces key");

const legacySpaceStorage = memoryStorage({
  [LEGACY_AGENT_THREAD_SPACES_KEY]: {
    version: 1,
    spaces: {
      "workspace:book-1": [projectThread],
    },
  },
});
assertEqual(loadAgentThreads(legacySpaceStorage)[0].id, "thread-project", "legacy spaces key loads");
assert(legacySpaceStorage.writes.some((write) => write.key === AGENT_THREAD_SPACES_KEY), "legacy spaces key is copied to current key");

const blankStorage = memoryStorage();
const initialThreads = loadAgentThreads(blankStorage);
assertEqual(initialThreads.length, 1, "blank storage creates initial thread");
assert(blankStorage.raw(AGENT_THREAD_SPACES_KEY).spaces.unbound.length === 1, "initial thread persists into unbound space");

const persistedStorage = memoryStorage();
persistAgentThreads([freeThread, projectThread], persistedStorage);
assertEqual(persistedStorage.raw(AGENT_THREADS_KEY).length, 2, "persist keeps flat compatibility list");
assertEqual(Object.keys(persistedStorage.raw(AGENT_THREAD_SPACES_KEY).spaces).sort().join(","), "unbound,workspace:book-1", "persist writes spaces index");

const mergedContext = mergeAgentThreadContextAttachments(
  [{ id: "old", kind: "file", title: "README", detail: "old", ref: "README.md", source: "thread", status: "attached", at: 100 }],
  [{ id: "new", kind: "file", title: "README", detail: "new", ref: "README.md", source: "thread", status: "attached", at: 200 }],
);
assertEqual(mergedContext.length, 1, "context merge dedupes by kind and ref");
assertEqual(mergedContext[0].id, "new", "context merge prefers incoming attachment");

const created = createAgentThreadRecord({ workspaceId: "book-2", workspaceTitle: "新项目", task: "绑定项目继续" });
assertEqual(created.workspaceId, "book-2", "created project thread keeps workspace id");
assert(created.contextAttachments.some((item) => item.kind === "workspace" && item.ref === "book-2"), "created project thread attaches workspace context");

const pinnedResult = togglePinAgentThreadRecord([freeThread, projectThread], "thread-free", 1000);
assertEqual(pinnedResult.threads.find((thread) => thread.id === "thread-free").pinnedAt, 1000, "pin action sets pinnedAt");
assertEqual(pinnedResult.threads.find((thread) => thread.id === "thread-free").events[0].title, "线程置顶", "pin action records event");
const unpinnedResult = togglePinAgentThreadRecord(pinnedResult.threads, "thread-free", 1100);
assertEqual(unpinnedResult.threads.find((thread) => thread.id === "thread-free").pinnedAt, undefined, "pin action toggles off");
assertEqual(unpinnedResult.threads.find((thread) => thread.id === "thread-free").events[0].status, "unpinned", "unpin action records status");

const renamedResult = renameAgentThreadRecord([freeThread, projectThread], "thread-project", "灵枢 LumenOS 任务", 1200);
const renamedProject = renamedResult.threads.find((thread) => thread.id === "thread-project");
assertEqual(renamedProject.title, "织梦写作台 任务", "rename applies public product wording");
assertEqual(renamedProject.events[0].title, "线程重命名", "rename records event");
assertEqual(renameAgentThreadRecord(renamedResult.threads, "thread-project", "织梦写作台 任务", 1300).changed, false, "same rename is no-op");

const archivedResult = archiveAgentThreadRecord([freeThread, projectThread], "thread-project", 1400);
const archivedProject = archivedResult.threads.find((thread) => thread.id === "thread-project");
assertEqual(archivedProject.archivedAt, 1400, "archive sets archivedAt");
assertEqual(archivedProject.status, "archived", "archive status");
assertEqual(archivedProject.events[0].title, "线程归档", "archive records event");
const restoredResult = restoreAgentThreadRecord(archivedResult.threads, "thread-project", 1500);
const restoredProject = restoredResult.threads.find((thread) => thread.id === "thread-project");
assertEqual(restoredProject.archivedAt, undefined, "restore clears archivedAt");
assertEqual(restoredResult.nextActiveThreadId, "thread-project", "restore selects restored thread");
assertEqual(restoredProject.events[0].title, "线程恢复", "restore records event");

const deleteProjectResult = deleteAgentThreadRecord([freeThread, projectThread], "thread-project", {}, "thread-project");
assertEqual(deleteProjectResult.threads.length, 1, "delete removes target thread");
assertEqual(deleteProjectResult.nextActiveThreadId, "thread-free", "delete active selects remaining visible thread");
const sameWorkspaceThread = { ...freeThread, id: "thread-project-2", workspaceId: "book-1", updatedAt: 250 };
const deleteSameWorkspaceResult = deleteAgentThreadRecord([freeThread, projectThread, sameWorkspaceThread], "thread-project", {}, "thread-project");
assertEqual(deleteSameWorkspaceResult.nextActiveThreadId, "thread-project-2", "delete prefers same workspace thread");
const deleteInactiveResult = deleteAgentThreadRecord([freeThread, projectThread], "thread-project", {}, "thread-free");
assertEqual(deleteInactiveResult.nextActiveThreadId, "thread-free", "delete inactive keeps current active thread");
const deleteLastResult = deleteAgentThreadRecord([freeThread], "thread-free", { workspaceId: "book-fallback", workspaceTitle: "兜底项目" }, "thread-free");
assertEqual(deleteLastResult.threads.length, 1, "delete last creates fallback thread");
assertEqual(deleteLastResult.threads[0].workspaceId, "book-fallback", "fallback thread keeps workspace context");
assertEqual(deleteLastResult.nextActiveThreadId, deleteLastResult.threads[0].id, "delete last selects fallback thread");

console.log("agent-thread-store ok");

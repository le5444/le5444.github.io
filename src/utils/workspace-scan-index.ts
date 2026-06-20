export type JsonRecord = Record<string, unknown>;

export interface WorkspaceScanIndexItem {
  path: string;
  name: string;
  isDir: boolean;
  extension: string;
  size: number;
  modifiedAt: string;
  depth: number;
}

export interface WorkspaceScanIndex {
  workspaceId: string;
  workspaceTitle: string;
  rootPath: string;
  accessProfile: string;
  at: number;
  status: string;
  maxDepth: number;
  limit: number;
  returned: number;
  hasMore: boolean;
  skipped: number;
  fileCount: number;
  dirCount: number;
  items: WorkspaceScanIndexItem[];
  policy: JsonRecord;
  request: JsonRecord | null;
}

export type WorkspaceScanAccessMode = "virtual" | "read_only" | "approval";

export interface WorkspaceScanRequestPlan {
  ok: boolean;
  status: "ready" | "blocked";
  blockedReason: string;
  detail: string;
  rootPath: string;
  accessProfile: "workspace" | "full_access";
  request: JsonRecord | null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function firstStableDirectoryFromGlob(glob: string) {
  return glob.replace(/\\/g, "/").split("/").find((part) => part && part !== "**" && !part.includes("*")) || "";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function planWorkspaceScanRequest(input: {
  workspaceSelected: boolean;
  rootPath: string;
  accessMode: WorkspaceScanAccessMode;
  gatewayOnline: boolean;
  readGateOpen: boolean;
  fullAccessGateOpen: boolean;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  maxDepth?: number;
  limit?: number;
  execute?: boolean;
}): WorkspaceScanRequestPlan {
  const rootPath = input.rootPath.trim();
  const execute = Boolean(input.execute);
  const accessProfile: WorkspaceScanRequestPlan["accessProfile"] = input.accessMode === "virtual" ? "workspace" : "full_access";
  const blocked = (blockedReason: string, request: JsonRecord | null = null): WorkspaceScanRequestPlan => ({
    ok: false,
    status: "blocked",
    blockedReason,
    detail: blockedReason,
    rootPath,
    accessProfile,
    request,
  });

  if (!input.workspaceSelected) {
    return blocked("请先选择或创建一个项目对话。");
  }
  if (!rootPath) {
    return blocked("请先绑定本机项目目录；未绑定时不会用 . 伪装真实目录扫描。");
  }
  if (input.accessMode === "virtual") {
    return blocked("当前根目录仍是虚拟路径声明；请先保存为只读或审批本机映射后再扫描。");
  }

  const request: JsonRecord = {
    path: rootPath,
    root: rootPath,
    access_profile: accessProfile,
    max_depth: input.maxDepth ?? 2,
    limit: input.limit ?? 120,
    exclude_dirs: uniqueStrings([
      "node_modules",
      ".git",
      "dist",
      "dist-pwa",
      ".vite",
      "__pycache__",
      ...(input.excludeGlobs || []).map(firstStableDirectoryFromGlob),
    ]),
    include_globs: input.includeGlobs || [],
    metadata_only: true,
    execute,
  };

  if (execute && !input.gatewayOnline) {
    return blocked("Gateway 离线，无法扫描本机目录。", request);
  }
  if (execute && !input.readGateOpen) {
    return blocked("Gateway 未开启读取闸门，无法建立目录索引。", request);
  }
  if (execute && accessProfile === "full_access" && !input.fullAccessGateOpen) {
    return blocked("真实本机目录扫描需要开启 full-access 文件闸门。", request);
  }

  return {
    ok: true,
    status: "ready",
    blockedReason: "",
    detail: execute ? "可以通过 Gateway 只读扫描目录元数据。" : "可以生成 workspace_scan dry-run 草案。",
    rootPath,
    accessProfile,
    request,
  };
}

export function normalizeWorkspaceScanIndexItem(value: unknown): WorkspaceScanIndexItem | null {
  const record = asRecord(value);
  const path = asString(record.path);
  if (!path) return null;
  return {
    path,
    name: asString(record.name, basename(path)),
    isDir: asBoolean(record.isDir, asBoolean(record.is_dir)),
    extension: asString(record.extension),
    size: asNumber(record.size),
    modifiedAt: asString(record.modifiedAt, asString(record.modified_at)),
    depth: asNumber(record.depth),
  };
}

export function normalizeWorkspaceScanIndex(value: unknown): WorkspaceScanIndex | null {
  const record = asRecord(value);
  const workspaceId = asString(record.workspaceId);
  if (!workspaceId) return null;
  const items = asArray(record.items)
    .map(normalizeWorkspaceScanIndexItem)
    .filter((item): item is WorkspaceScanIndexItem => Boolean(item))
    .slice(0, 500);
  return {
    workspaceId,
    workspaceTitle: asString(record.workspaceTitle, "未命名工作区"),
    rootPath: asString(record.rootPath),
    accessProfile: asString(record.accessProfile, "workspace"),
    at: asNumber(record.at, 0),
    status: asString(record.status, "indexed"),
    maxDepth: asNumber(record.maxDepth),
    limit: asNumber(record.limit),
    returned: asNumber(record.returned, items.length),
    hasMore: asBoolean(record.hasMore),
    skipped: asNumber(record.skipped),
    fileCount: asNumber(record.fileCount, items.filter((item) => !item.isDir).length),
    dirCount: asNumber(record.dirCount, items.filter((item) => item.isDir).length),
    items,
    policy: asRecord(record.policy),
    request: Object.keys(asRecord(record.request)).length ? asRecord(record.request) : null,
  };
}

export function buildWorkspaceScanIndex(input: {
  workspaceId: string;
  workspaceTitle: string;
  scan: JsonRecord;
  request: JsonRecord | null;
  at?: number;
}): WorkspaceScanIndex {
  const items = asArray(input.scan.items)
    .map(normalizeWorkspaceScanIndexItem)
    .filter((item): item is WorkspaceScanIndexItem => Boolean(item))
    .slice(0, 500);
  return {
    workspaceId: input.workspaceId,
    workspaceTitle: input.workspaceTitle || "未命名工作区",
    rootPath: asString(input.scan.root_input, asString(input.scan.root)),
    accessProfile: asString(input.scan.access_profile, "workspace"),
    at: input.at || Date.now(),
    status: "indexed",
    maxDepth: asNumber(input.scan.max_depth),
    limit: asNumber(input.scan.limit),
    returned: asNumber(input.scan.returned, items.length),
    hasMore: asBoolean(input.scan.has_more),
    skipped: asNumber(input.scan.skipped),
    fileCount: asNumber(input.scan.file_count, items.filter((item) => !item.isDir).length),
    dirCount: asNumber(input.scan.dir_count, items.filter((item) => item.isDir).length),
    items,
    policy: asRecord(input.scan.policy),
    request: input.request,
  };
}

export function workspaceScanIndexContextItem(index: WorkspaceScanIndex): JsonRecord {
  const sample = index.items
    .slice(0, 12)
    .map((item) => `${item.isDir ? "dir" : "file"}:${item.path}`)
    .join(" / ");
  return {
    id: `workspace-scan-index-${index.workspaceId}`,
    kind: "workspace",
    dimension: "workspace_scan_index",
    title: "工作区真实路径索引",
    summary: [
      `root ${index.rootPath || "未声明"}`,
      `profile ${index.accessProfile}`,
      `${index.dirCount} 个目录`,
      `${index.fileCount} 个文件`,
      `返回 ${index.returned}`,
      index.hasMore ? `还有更多，跳过 ${index.skipped}` : "",
      sample ? `样例 ${sample}` : "",
      "仅目录元数据，不含正文",
    ].filter(Boolean).join(" · "),
    ref: index.rootPath || index.workspaceId,
    source: "workspace_scan",
    status: index.status,
    at: index.at,
    root_path: index.rootPath,
    access_profile: index.accessProfile,
    returned: index.returned,
    file_count: index.fileCount,
    dir_count: index.dirCount,
    has_more: index.hasMore,
    sample_paths: index.items.slice(0, 24).map((item) => ({
      path: item.path,
      is_dir: item.isDir,
      extension: item.extension,
      size: item.size,
      depth: item.depth,
    })),
    policy: index.policy,
    injected_by: "workspace_scan_index",
  };
}

export function workspaceIndexedReadPath(index: WorkspaceScanIndex, item: WorkspaceScanIndexItem) {
  const root = (index.rootPath || ".").trim() || ".";
  const relative = item.path.replace(/^[./\\]+/, "");
  if (!relative) return root;
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${relative.replace(/[\\/]+/g, separator)}`;
}

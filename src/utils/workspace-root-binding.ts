export type WorkspaceRootAccessMode = "virtual" | "read_only" | "approval";

export interface WorkspaceRootProfileLike {
  rootPath: string;
  accessMode: WorkspaceRootAccessMode;
}

export interface WorkspaceRootBindingPlan {
  ok: boolean;
  nextRoot: string;
  rootChanged: boolean;
  nextAccessMode: WorkspaceRootAccessMode;
  shouldClearScanIndex: boolean;
  previewStatus: "idle" | "skipped";
  previewDetail: string;
  runtimeTitle: string;
  runtimeDetail: string;
  runtimeStatus: "bound" | "skipped";
  eventTitle: string;
  eventDetail: string;
  attachmentDetail: string;
}

const ACCESS_MODE_LABELS: Record<WorkspaceRootAccessMode, string> = {
  virtual: "虚拟路径",
  read_only: "只读映射",
  approval: "审批访问",
};

export function planWorkspaceRootBinding(input: {
  workspaceTitle: string;
  rootInput: string;
  current: WorkspaceRootProfileLike;
}): WorkspaceRootBindingPlan {
  const workspaceTitle = input.workspaceTitle || "未命名工作区";
  const currentRoot = input.current.rootPath.trim();
  const nextRoot = input.rootInput.trim();
  if (!nextRoot) {
    return {
      ok: false,
      nextRoot: "",
      rootChanged: false,
      nextAccessMode: input.current.accessMode,
      shouldClearScanIndex: false,
      previewStatus: "skipped",
      previewDetail: "没有填写本机目录，项目模式仍使用虚拟文件树。",
      runtimeTitle: "未绑定目录",
      runtimeDetail: "没有填写本机目录，项目模式仍使用虚拟文件树。",
      runtimeStatus: "skipped",
      eventTitle: "未绑定目录",
      eventDetail: "没有填写本机目录，项目模式仍使用虚拟文件树。",
      attachmentDetail: "未绑定本机目录 · 仍使用虚拟文件树",
    };
  }

  const rootChanged = nextRoot !== currentRoot;
  const nextAccessMode = input.current.accessMode === "virtual" ? "read_only" : input.current.accessMode;
  return {
    ok: true,
    nextRoot,
    rootChanged,
    nextAccessMode,
    shouldClearScanIndex: rootChanged,
    previewStatus: "idle",
    previewDetail: rootChanged ? "已更新本机目录映射；下一步可扫描目录元数据。" : "本机目录映射已确认；可继续刷新目录索引。",
    runtimeTitle: rootChanged ? "已绑定本机目录" : "已确认本机目录",
    runtimeDetail: `${workspaceTitle} -> ${nextRoot}`,
    runtimeStatus: "bound",
    eventTitle: rootChanged ? "绑定本机目录" : "确认本机目录",
    eventDetail: `${workspaceTitle} 已绑定到 ${nextRoot}；${rootChanged ? "旧路径索引已清空，待重新扫描。" : "路径未变化，可继续刷新索引。"}`,
    attachmentDetail: `根目录 ${nextRoot} · 访问模式 ${ACCESS_MODE_LABELS[nextAccessMode]} · ${rootChanged ? "待扫描索引" : "路径已确认"}`,
  };
}

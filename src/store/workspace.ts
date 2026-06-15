import { htmlToPlainText, STORAGE_ERROR_EVENT } from "../utils/helpers";

export type FileCategory = string;

export interface FileVersion {
  timestamp: number;
  content: string;
  summary: string;
}

export interface WorkspaceFile {
  id: string;
  category: FileCategory;
  title: string;
  content: string;
  summary: string;
  updatedAt: number;
  history?: FileVersion[];
  kind?: "text" | "image";
  mimeType?: string;
  dataUrl?: string;
  size?: number;
  altText?: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  content: string;
  description?: string;
  favorite?: boolean;
  builtIn?: boolean;
  primarySkill?: string;
  skillTags?: string[];
  validationLayers?: string[];
  linkedDistillationIds?: string[];
  autoSkillClusterKey?: string;
}

export interface WorkspaceState {
  projectTitle: string;
  categories: FileCategory[];
  files: WorkspaceFile[];
  selectedFileId: string | null;
  theme: "dark" | "light";
  includeEditorContext: boolean;
  includeRecentHistory: boolean;
  includeSmartContext: boolean;
  selectedPromptIds: string[];
  selectedDistillationIds: string[];
  associatedFileIds: string[];
  customPrompts: PromptTemplate[];
}

const STORAGE_KEY = "novelsmith-workspace";

export const defaultCategories: FileCategory[] = [
  "织梦工作台",
  "项目底本",
  "剧情大纲",
  "反崩盘",
  "主要内容",
  "设定",
  "角色",
  "组织势力",
  "知识库",
  "多模态素材",
];
const LEGACY_HTTP_ONLY_MCP_RULE = "- 外部 MCP 连接器只调用 HTTP/HTTPS JSON-RPC 端点；" + "不自动 spawn 任意 stdio MCP 进程。";
const LEGACY_WORKBENCH_CATEGORY = `${String.fromCharCode(20010, 20154)}OS`;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeCategory(category: string) {
  return category === LEGACY_WORKBENCH_CATEGORY ? "织梦工作台" : category;
}

function normalizeBridgeFile(file: WorkspaceFile): WorkspaceFile {
  const normalizedFile = {
    ...file,
    category: normalizeCategory(file.category),
  };
  if (normalizedFile.title !== "BRIDGE.md") return normalizedFile;
  return {
    ...normalizedFile,
    content: normalizedFile.content
      .replace(
        "- web_fetch / mcp_call：进入审批提案。",
        "- web_fetch：默认进入审批提案；只有 `--execute-web` + `payload.execute=true` 才执行受控 GET/POST。\n- mcp_stdio_catalog：读取内置 stdio MCP 注册表，不启动进程。\n- mcp_call：默认进入审批提案；只有 `--execute-mcp` + `payload.execute=true` 才调用受控 HTTP JSON-RPC MCP 端点或注册表内置 stdio MCP 服务。",
      )
      .replace(
        "- HTTP `/mcp` 与 stdio facade 共用同一套工具 registry 与 safety path，并支持 initialize、tools、resources、prompts。\n- 写文件、跑命令、联网、MCP 调用必须先生成审批草案或执行桥请求。",
        "- HTTP `/mcp` 与 stdio facade 共用同一套工具 registry 与 safety path，并支持 initialize、tools、resources、prompts。\n- MCP 连接器支持 HTTP/HTTPS JSON-RPC 与注册表内置 stdio server_id；不接受任意 stdio 命令字符串。\n- 写文件、跑命令、联网、MCP 调用必须先生成审批草案或执行桥请求。",
      )
      .replace(
        LEGACY_HTTP_ONLY_MCP_RULE,
        "- MCP 连接器支持 HTTP/HTTPS JSON-RPC 与注册表内置 stdio server_id；不接受任意 stdio 命令字符串。",
      ),
  };
}

export const defaultWorkspace = (): WorkspaceState => {
  const now = Date.now();
  const files: WorkspaceFile[] = [
    {
      id: uid(),
      category: "主要内容",
      title: "第1章",
      content: "",
      summary: "",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "织梦工作台",
      title: "SOUL.md",
      content:
        "## 身份与偏好\n\n- 这里记录长期偏好、工作边界、常用项目和个人原则。\n- AI 只能根据用户明确写入的内容使用长期画像，不得臆造。\n\n## 权限边界\n\n- 高风险操作先提出计划和差异，不直接执行。\n- 泄露源码和受保护代码只做风险识别，不复制进项目。\n",
      summary: "织梦工作台身份、偏好与权限边界。",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "织梦工作台",
      title: "COORDINATOR.md",
      content:
        "## Coordinator System Prompt\n\n- 运行模式：Goal Mode 用于长期目标推进，Task Mode 用于当前任务执行。\n- 首席编排器负责计划、检索、委派、验收、写回和最终综合。\n- 子代理只提交观察、草案、风险和证据，最终判断不能外包。\n- 不批准弱结果；验收不过就继续修订、补证或降级为审批草案。\n\n## 来源边界\n\n- 只吸收官方文档、公开资料和正常开源仓库的架构思想。\n- 泄露源码、受保护代码、密钥和私有实现只能标记为不可复用风险，不能复制或移植。\n\n## 上下文经济性\n\n- 默认先生成 Agent Context Pack，列出任务、技能、记忆引用、工具边界和写回规则。\n- 默认只注入摘要切片、锚点和必要文件。\n- 全文、全部提示词和历史记录只在任务明确需要时读取。\n- 重复材料压缩为事实、决策、风险、后续动作四类。\n\n## 验收与写回\n\n- 每个 DAG 节点必须有 pass/fail 标准。\n- 新事实写 MEMORY.md，长期任务写 KAIROS.md，权限边界写 SOUL.md，工具协议写 BRIDGE.md。\n- 写文件、命令、联网、MCP 调用必须先走 bridge-request 或审批草案。\n",
      summary: "织梦总编排器运行法、委派规则、来源边界和上下文经济性。",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "织梦工作台",
      title: "MEMORY.md",
      content:
        "## L1 工作记忆\n\n- 当前活跃目标、最近决策、工具观察。\n\n## L2 长期记忆\n\n- 经用户确认后沉淀的项目事实、偏好、技能和复盘。\n",
      summary: "织梦 L1/L2 记忆索引。",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "织梦工作台",
      title: "KAIROS.md",
      content:
        "## KAIROS 任务队列\n\n- 这里记录长期目标、空闲触发、下一步动作和 append-only 日志。\n- 当前版本只生成任务草案，不自动常驻执行。\n",
      summary: "织梦长期任务队列与 append-only 日志。",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "织梦工作台",
      title: "BRIDGE.md",
      content:
        "## Executor Bridge\n\n- 协议版本：0.2\n- 默认模式：dry-run\n- 端点提示：http://127.0.0.1:8765/bridge\n- Gateway 启动：`python bridge/zhimeng_bridge.py --serve`\n- Rust wrapper：`cargo run --manifest-path bridge/rust-core/Cargo.toml -- health`\n- stdio MCP-like：`python bridge/zhimeng_mcp_stdio.py`\n- 验证命令执行启动：`python bridge/zhimeng_bridge.py --serve --execute-command`\n- Skill 运行启动：`python bridge/zhimeng_bridge.py --serve --execute-skill`\n- 守护启动：`python bridge/zhimeng_bridge.py --serve --kairos-interval 60 --autodream-interval 300 --autodream-threshold 2`\n- Windows 双击：`启动织梦PersonalOS网关.cmd`\n- 健康检查：`python bridge/healthcheck_bridge.py`\n\n## Gateway Actions\n\n- search：只读搜索项目文本。\n- status：读取桥状态、最近运行、Workflow、KAIROS、Memory、Skill、Scheduler、Worker、Sandbox、User Model、Subagent 和 daemon 状态。\n- phase_audit：审计织梦 Agent Workbench Phase 1-5 完成度、证据与缺口。\n- run / advance：登记并推进工作流提案。\n- memory_event / memory_consolidate / memory_status / memory_retrieve：记录、压缩、查看和按任务检索 AutoDream L1/L2 记忆。\n- skill_route：按任务路由织梦 Agent Workbench / 小说 Skills，返回 active skills、memory banks 与 excluded tool scopes；默认不执行。\n- skill_crystallize / skill_review / skill_activate / skill_status：从 AutoDream L2 记忆生成 `.py.draft`，审查后复制到 `activated/*.py`。\n- skill_run：仅在 `--execute-skill` + `payload.execute=true` 时，用隔离子进程运行已激活 Skill 的 `run(context)`。\n- scheduler_plan / scheduler_status：生成 KAIROS Windows 计划任务安装/卸载 `.cmd.draft`，不直接注册 OS 任务。\n- worker_run / worker_status：后台执行 allowlist 内部 bridge_action、验证命令或受控模型任务，记录结构化阶段事件。\n- worker_cancel：软取消普通线程任务；模型 worker 走受控子进程，取消时只终止已登记 PID。\n- worker_merge_proposal：把 Worker 输出转成可审查合并草案，写入 `bridge/workers/merge-proposals/*.json`，不直接改目标文件。\n- swarm_bootstrap：验收 Phase 4 子代理分支、写锁冲突、allowlist worker 与安全闸门。\n- sandbox_probe / sandbox_status：只运行 allowlist 版本探针，任意 shell 仍禁用。\n- user_model_event / user_model_reflect / user_model_status：以证据、反例和置信度维护 Honcho-lite 用户模型。\n- kairos_task：登记长期观察任务，并写入 append-only daily log。\n- subagent_spawn / lock_acquire / lock_release / subagent_status：登记子代理与读写锁。\n- safety_review：执行 7 层安全审查与命令验证。\n- read_file：仅在 Gateway 显式允许 execute-read 时读取项目内文件。\n- write_file：进入审批队列，不直接写入。\n- run_command：默认只验证；只有 `--execute-command` + `payload.execute=true` + allowlist 匹配时执行验证命令。\n- web_fetch：默认进入审批提案；只有 `--execute-web` + `payload.execute=true` 才执行受控 GET/POST。\n- mcp_stdio_catalog：读取内置 stdio MCP 注册表，不启动进程。\n- mcp_call：默认进入审批提案；只有 `--execute-mcp` + `payload.execute=true` 才调用受控 HTTP JSON-RPC MCP 端点或注册表内置 stdio MCP 服务。\n\n## 规则\n\n- 浏览器前端不直接执行命令。\n- AI 需要本地工具时必须输出 `<bridge-request>` JSON。\n- Rust wrapper 目前是 Python Gateway 的可审查入口骨架；未安装 Rust 工具链时只验证文件存在。\n- HTTP `/mcp` 与 stdio facade 共用同一套工具 registry 与 safety path，并支持 initialize、tools、resources、prompts。\n- MCP 连接器支持 HTTP/HTTPS JSON-RPC 与注册表内置 stdio server_id；不接受任意 stdio 命令字符串。\n- 写文件、跑命令、联网、MCP 调用、Skill 运行必须先生成审批草案或执行桥请求。\n- KAIROS 与 AutoDream 守护进程只观察、压缩、记录，不自动执行外部动作。\n- AutoDream 六维记忆包含 identity、preference、project、episode、skill、tool；memory_retrieve 只返回紧凑 context_pack，不把全文塞进模型。\n- Scheduler 只生成可审查草案，不调用 `schtasks`，不修改系统计划任务。\n- Worker 可异步运行 allowlist 内部动作，如 memory_retrieve/search/status；模型 Worker 执行时隔离到子进程，可硬取消，生成合并草案但最终写入仍走 write_file 闸门。\n- Swarm bootstrap 只运行本地安全演习，不执行任意 shell、不启动模型 worker、不写用户项目文件。\n- Skill Route 负责按任务挂载技能和隔离工具，例如写作任务默认挂载四套小说技能并排除 run_command。\n- Skill 结晶先生成草案；激活后只有 `skill_run` 能在 `--execute-skill` 显式授权下运行 `activated/*.py` 的 `run(context)`。\n- 沙盒探针只允许 `python/node/npm --version` 这类非变更版本检查，不开放任意命令。\n- 验证命令执行只允许 `python/node/npm --version`、`python -m py_compile bridge/*.py`、`python bridge/healthcheck_bridge.py`、`npx tsc --noEmit`。\n- 用户模型必须有证据，可被反例降低置信度，不伪造长期画像。\n- Python Gateway 负责验证、记录和返回状态。\n",
      summary: "织梦本地执行器/MCP 桥配置。",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "织梦工作台",
      title: "COMPLETION_AUDIT.md",
      content:
        "## 织梦工作台总验收\n\n- `phase_audit`：审计 Phase 1-5 阶段证据。\n- `completion_audit`：按 Codex / Claude Code / WorkBuddy / OpenClaw / Hermes 式 Agent 能力矩阵审计总完成度。\n\n## 诚实缺口\n\n- `production_mcp_transport`：当前是可用 JSON-RPC/MCP facade，不是带 streaming/subscription 的生产级传输。\n- `scheduler_install_not_enabled`：定时器只生成草案，只有显式执行门才注册系统计划任务。\n- `activated_skill_runtime_gated`：已激活 Skill 可以通过 `skill_run` 受控运行，但默认仍是审批/显式授权模式。\n\n## 已验证能力\n\n- `model_worker_child_process_cancel`：本地 live 模型 Worker、OpenAI-compatible 流式 chunk 事件、合并草案和受控子进程硬取消均由健康检查覆盖。\n",
      summary: "织梦工作台总验收入口和仍未完成的生产级缺口。",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "设定",
      title: "世界观",
      content: "",
      summary: "",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "角色",
      title: "主角",
      content: "",
      summary: "",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "组织势力",
      title: "势力1",
      content: "",
      summary: "",
      updatedAt: now,
    },
    {
      id: uid(),
      category: "知识库",
      title: "灵感记录",
      content: "",
      summary: "",
      updatedAt: now,
    },
  ];
  const normalizedFiles = files.map(normalizeBridgeFile);

  return {
    projectTitle: "我的小说",
    categories: [...defaultCategories],
    files: normalizedFiles,
    selectedFileId: normalizedFiles[0]?.id ?? null,
    theme: "light",
    includeEditorContext: true,
    includeRecentHistory: false,
    includeSmartContext: true,
    selectedPromptIds: [],
    selectedDistillationIds: [],
    associatedFileIds: [],
    customPrompts: [],
  };
};

export function loadWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspace();
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    const fallback = defaultWorkspace();
    if (!parsed.files?.length) return fallback;
    const categories = parsed.categories && parsed.categories.length
      ? [...defaultCategories, ...parsed.categories.map(normalizeCategory)]
      : [...defaultCategories];
    return {
      ...fallback,
      ...parsed,
      categories: Array.from(new Set(categories)),
      files: parsed.files.map(normalizeBridgeFile),
      selectedPromptIds: parsed.selectedPromptIds ?? [],
      selectedDistillationIds: parsed.selectedDistillationIds ?? [],
      associatedFileIds: parsed.associatedFileIds ?? [],
      includeSmartContext: parsed.includeSmartContext ?? true,
      customPrompts: parsed.customPrompts ?? [],
    };
  } catch {
    return defaultWorkspace();
  }
}

export function saveWorkspace(state: WorkspaceState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Novelsmith workspace write failed:", error);
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key: STORAGE_KEY } }));
  }
}

export function groupFiles(files: WorkspaceFile[], categories: FileCategory[]) {
  return categories.map((category) => ({
    category: normalizeCategory(category),
    files: files.filter((f) => normalizeCategory(f.category) === normalizeCategory(category)),
  }));
}

export function createFile(category: FileCategory): WorkspaceFile {
  const normalizedCategory = normalizeCategory(category);
  const titleMap: Record<string, string> = {
    织梦工作台: "新工作台记忆",
    项目底本: "新底本",
    剧情大纲: "新大纲",
    反崩盘: "新状态卡",
    主要内容: "新章节",
    设定: "新设定",
    角色: "新角色",
    组织势力: "新组织",
    知识库: "新文件",
    多模态素材: "新素材",
  };

  return {
    id: uid(),
    category: normalizedCategory,
    title: titleMap[normalizedCategory] ?? "新文件",
    content: "",
    summary: "",
    updatedAt: Date.now(),
  };
}

export function exportWorkspaceTxt(state: WorkspaceState) {
  const mainFiles = state.files.filter((f) => f.category === "主要内容");
  const content = mainFiles
    .map((file) => `${file.title}\n\n${htmlToPlainText(file.content)}`)
    .join("\n\n====================\n\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.projectTitle || "novel"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}




# 织梦写作台 / LumenOS 总规划

记录日期：2026-06-06

## Final Goal

公开项目入口保持为 **织梦写作台 / Zhimeng Writing Agent**。底层运行层暂定为 **灵枢 LumenOS**：它让织梦不只是提示词网页或单点小说编辑器，而是把上下文记忆、Skills、Tool Use、项目管理、长期记忆、模型 Provider、Worker、MCP/Gateway、安全审批和多工作区组织成一个可持续运行的写作 Agent 工作台。

**织梦** 是公开产品名、写作入口和主场。小说 Skills、蒸馏、反崩盘、章节树、项目知识库都优先服务 Writing Agent；LumenOS 是底层 Agent OS / Agent IDE，可以继续扩展 coding、research、automation、knowledge、personal admin 等域。

界面目标采用类似 VS Code / Codex / Claude Code 的三栏圣杯布局：

- Header：全局状态、当前 profile、模型/API、刷新/设置入口。
- Primary Sidebar：全局导航、workspace/project tree、domain 切换。
- Main Content / Editor：任务线程、Runtime Inspector、编辑器或当前工作区主任务。
- Secondary Sidebar：上下文、记忆、工具权限、Worker、审批、Provider、KAIROS 辅助面板。

## Source Boundary

可借鉴来源：官方文档、公开开源仓库、可观察产品交互、论文和正常社区经验。

不可复用来源：泄露源码、私有实现、密钥、受保护代码。相关仓库只能作为风险分类和产品启发，不复制、不移植、不反编译。

执行原则：用户提到的 Claude Code 泄露仓库不进入实现来源；如果要对标 Claude Code / Codex，只查官方文档、`openai/codex` 等公开开源仓库、公开社区项目和可观察 UI。灵枢要像成熟 Agent IDE 一样工作，但不能把不可信来源变成代码依赖。

已吸收的公开模式：

- OpenAI Codex / `openai/codex`：本地运行的 coding agent、终端/IDE/桌面入口、项目指令文件、权限/审批、沙箱、任务线程和验证命令。
- Claude Code 官方文档：`SKILL.md` 渐进加载、Skills、subagents、MCP、hooks、动态上下文、权限模式。
- OpenHands：sandbox runtime、动作执行服务、插件化执行环境。
- OpenClaw / Harnss 等公开项目：多引擎 Agent 会话、工具调用可视化、Changes/Diff 面板、内置 terminal/browser/git/MCP、项目 spaces。
- Kiro：Specs、Steering、Agent Hooks、MCP servers，强调“需求 -> 设计 -> 任务”的可审查工程化流程。
- VS Code：Activity Bar 作为核心导航面，侧边栏 / 主工作区 / 辅助侧边栏组成可长期工作的 workbench。

2026-06-07 公开参考校准：

- VS Code 官方 UI 文档明确了 Editor、Primary Side Bar、Secondary Side Bar、Status Bar、Activity Bar、Panel 的分工；灵枢布局必须继续按这个 workbench 模型推进。
- VS Code 官方 Custom Layout 文档强调标题栏布局控制、Secondary Side Bar、Panel、Activity Bar 可切换并跨会话记忆；灵枢应把布局状态做成可持久化的 Workbench state，而不是固定三栏页面。
- Claude Code 官方 docs 的 Skills / subagents / MCP / hooks 证明：能力层不是 prompt 卡片，而是可路由、可限权、可隔离上下文的执行/协作系统。
- OpenAI Codex 公开仓库定位为本地 coding agent；DeepWiki 对 `openai/codex` 的公开拆解显示沙箱策略和审批策略是两套协同机制。灵枢当前的 Gateway profile + approval queue 继续沿这个方向，而不是开放任意 shell。
- OpenHands 公开 README 把 SDK、CLI、Local GUI、REST API、React 单页应用拆成不同入口；灵枢也应保持“本地 Gateway + 桌面壳 + Agent Workbench”的分层。
- Harnss 公开 README 的重点是多 Agent session、tool visualization、word-level diff、Changes panel、terminal/browser/git/MCP 同窗；灵枢下一步 UI 应优先补“会话列表 / Changes-Diff / 底部终端面板 / 真实文件树”，不要再堆指标卡。
- Kiro 官方文档把 Steering、Specs、Hooks、MCP 放进左侧 IDE 面板；灵枢的 Phase 2/5 要吸收“持久项目知识 + 规格化任务 + 可审查自动化”的产品形状。
- 用户补充的桌面 IDE/AI 应用布局术语已作为产品语义校准：灵枢应持续使用 Workbench / Part / View Container / Editor Group / Panel / Statusbar / Auxiliary Side Bar 这一套架构词表；AI 能力应作为 Agent-Centric View Container，而不是写作卡片页。附件中关于具体商业产品实现的判断只作为布局观察，不作为源码事实或实现依赖。

2026-06-08 公开参考校准：

- OpenAI Codex 官方 AGENTS.md 文档确认“项目级指令文件”是 Agent 工作流的一等上下文；灵枢应继续把 `.lumen/*`、Steering、Skills、thread_context 和 context_pack 做成可审查、可追溯的上下文来源。
- Anthropic Claude Code 官方 Hooks / Subagents 文档确认：Hook 事件、权限、子代理和 MCP 需要明确配置、可隔离上下文和可观察日志；灵枢只借鉴这种产品机制，不使用泄露代码。
- Kiro 官方文档确认它的核心能力是 Specs、Steering、Hooks、Agentic Chat、MCP Servers；Steering 还支持 workspace/global scope、AGENTS.md 和多种 inclusion modes。灵枢的 Specs / Steering / Hooks 面板继续对标这个“规格化任务 + 项目知识 + 自动化闸门”模型。
- GitHub 公开生态里已有 OpenCode、OpenClaw、AionUi、cmux 等围绕 AI coding agents 的会话、终端和工作区壳项目；灵枢可借鉴“多 Agent session / terminal / MCP / workspace”的产品形状，但代码实现仍以本仓库现有桥接层和审批门为准。

## Phase 1 - OS Shell and Goal Mode

目标：先让产品一打开就是灵枢 LumenOS 的 Personal OS 运行台，而不是书架首页。

交付物：

- VS Code 式三栏圣杯布局。
- Goal Mode / Task Mode 明确展示。
- Primary Sidebar 有 Agent OS、Workspaces、Memory、Skills、Providers、Workers、Automation、Writing Agent 域。
- Main Content 默认进入 Agent 运行台，而不是营销页或单一小说页。
- Secondary Sidebar 显示 runtime profile、Gateway 状态、权限矩阵、近期 Worker、审批提示。
- 最终目标与 Phase 1-5 固化为项目真值文档。

验收门：

- 首屏可见灵枢 LumenOS / Personal OS，而不是「小说工具」。
- 用户能从首屏看清当前目标、阶段、权限、记忆、技能、模型、Worker。
- 写作入口存在，但不再占据产品定义。

## Phase 2 - Memory and Context OS

目标：上下文不再靠全量塞 prompt，而是由系统检索、压缩、召回、写回。

交付物：

- AutoDream L1/L2 六维记忆稳定可查看。
- 长期记忆管理器：首版已支持 L1/L2 搜索、类型/维度筛选、详情检查、标签/证据展示、冻结/软删除视觉状态、编辑/冻结/删除审阅草案、备份历史和恢复草案；Gateway 已提供 `memory_update` / `memory_freeze` / `memory_delete` / `memory_merge` / `memory_restore` approval-only 管理门，默认只排队审批，不直接修改记忆；`approval_status` 可只读查看最近 approvals 记录。
- Context Pack：任务、相关文件、Skills、记忆摘要、工具边界统一打包。
- SOUL / MEMORY / KAIROS / BRIDGE / COORDINATOR 工作区文件成为 OS 默认真值。
- 用户偏好和项目事实必须带证据、置信度、时间。

验收门：

- 新任务能先召回相关记忆摘要，再决定是否读取全文。
- 记忆写回必须可审查，不伪造长期画像。
- token 消耗从「全量上下文」转向「摘要切片 + 必要全文」。

## Phase 3 - Skills and Domain Agents

目标：Skills 变成可路由能力层；写作域是织梦的主场，其他 domain 通过同一套底层协议挂载。

交付物：

- 本地 `SKILL.md` 索引、搜索、预览、启用、禁用。
- Codex skills、小说四套 skills、用户自定义 skills 统一展示。
- Skill Route：按任务域自动挂载 skills。
- Skill Invoke：生成 prompt-only 调用包。
- Skill Run：仅在显式 gate 下执行已审查 activated skill。
- Domain Agents：Writing、Coding、Research、Automation、Knowledge 等。

验收门：

- 写作任务自动挂载小说 skills，同时排除不必要危险工具。
- coding/research/automation 任务不会被小说工具污染。
- 激活后的 skill runtime 仍保留显式授权门。

## Phase 4 - Tools, Workers, Providers, MCP

目标：把本地能力做成受控执行层，而不是模型自由调用系统。

交付物：

- Provider/API 设置中心：OpenAI-compatible、Claude、Gemini、Ollama、OpenRouter、国内 API。
- Provider Probe：本地/远程模型测试，远程调用显式授权。
- Worker Center：模型 worker、验证 worker、bridge action worker、硬取消、合并草案。
- Tool Matrix：read/write/file/network/mcp/scheduler/skill 的 profile 与 request gate。
- MCP facade 升级路线：从 JSON-RPC facade 走向 streaming/subscription transport。
- Diff/Approval：任何写入、联网、MCP、调度都可审查；审批队列可只读观察，但批准/执行仍需独立显式 gate。

验收门：

- 用户能在 UI 中看到哪些工具可用、为什么不可用、怎样开启。
- Worker 输出默认变成合并草案，不直接写文件。
- 任意 shell 仍不开放；验证命令只走 allowlist。

## Phase 5 - Autonomy, Multi-Workspace, Desktop OS

目标：Personal OS 能长期运行、管理多个项目、做可审查自动化。

交付物：

- 多 workspace 管理：每个项目有独立根目录、记忆、skills、权限 profile。
- KAIROS 可审查自动化：计划、唤醒、日志、审批后执行。
- Scheduler 草案与显式安装/卸载门。
- Subagents / locks：多代理分工、读写锁、冲突阻断。
- 桌面 EXE：双击启动 Gateway + UI，profile 可切换。
- 健康检查和 completion audit 作为发布门。

验收门：

- 用户能把它当成长期个人操作系统使用，而不是一次性网页工具。
- 自动化只能提出计划或草案，外部动作仍需明确 gate。
- EXE、健康检查、build、核心 UI 验证全部通过。

## Current Immediate Work

当前方向已回正为“织梦写作 Agent + LumenOS Agent IDE 底层”，不是普通写作 dashboard，也不是把写作入口弱化掉：

1. 公开项目名保持为 **织梦写作台 / Zhimeng Writing Agent**；**灵枢 LumenOS** 作为英文/技术底层名，承载 Agent OS / Agent IDE 运行层。
2. `HomePage` 已删除旧书架首页、写作追踪、Prompt 卡片库的首屏主场，只保留灵枢 LumenOS 的 Agent OS Shell。
3. `AgentControlCenter` 已升级为全屏 IDE 工作台：Title/Menu Bar + Activity Bar + 主侧边栏 + 主工作区 / Agent 运行台 + 辅助侧边栏。
4. Writing 能力继续作为公开主场保留，并通过 `Writing Agent` / `Writing Workspace` 节点进入主侧边栏；LumenOS 负责底层工作台和运行协议。
5. Main Content 已从静态 dashboard 升级为可切换 Agent Workbench：`Agent OS`、`Workspaces`、`Memory`、`Skills`、`Tools`、`Providers`、`Workers`、`Automation`、`Writing Agent` 都有独立主面板。
6. 最新 UI 收口已把旧的能力矩阵/工具快照/领域路由大卡从 Agent OS 首屏移除；首屏应保持为“Agent 运行线程 + 命令中心 + 上下文检查器 + 运行轨迹/审批/证据/终端预览”的工作台形态。
7. 多模态消息类型已开始接入：ChatMessage 可承载文本或图片内容，历史对话与聊天渲染已改为通过 `chatContentToText` 兼容。
8. `BookProject` 仍作为历史存储类型保留，但首页和工作区创建弹窗已改为工作区 / 领域 Agent 语义；旧本地数据如“未命名作品 / 番茄小说”在 OS Shell 展示层映射为“未命名工作区 / 写作 Agent”，不直接篡改用户数据。
9. Activity Bar、Primary Sidebar、Workbench Tabs 已真实联动 `activeView`；点击 Workspaces / Memory / Tools / Workers / Providers / Automation / Writing Agent 会切换 Main Content，而不是只做静态装饰。
10. Provider view 已从模型目录页升级为“模型 Provider 中枢 / 模型运行时 / API Gateway”：展示当前运行时配置、凭据状态、Provider 闸门、已保存配置档案、前端预设库、模型 Worker 载荷，并提供草案状态检查、探针审批草案和刷新目录。
11. 运行时详情区已从 `Agent 详情中枢` 改名为“运行时检查器”，作为跨视图审计面板，不再像旧写作前端下方堆功能卡。
12. 默认 `SYSTEM_PROMPT` 已从“织梦写作台中文小说写作助手”改为“灵枢 LumenOS 个人超级 Agent”；Writing Agent 规则只在写作域触发时作为专业子域规则。
13. 中文优先收口已完成：顶部菜单、主侧边栏、主工作区、运行时检查器、Provider tab、辅助侧边栏均改为中文优先；保留 `Skills`、`tokens`、`Provider`、`Gateway`、`Worker` 等稳定技术词。
14. 命令中心已从静态导航入口升级为真实任务输入框：输入任务后会优先调用 Gateway `context_pack` 生成只读任务草案，展示“任务草案”“上下文包草案”“Skills / 工具边界”“工具计划 / 审批预览”。Gateway 离线或请求失败时会降级为本地只读草案，仍不执行写文件、远程模型、Skill runtime 或 Scheduler。
15. 命令中心已接入受控 Worker 派发预览：任务草案生成后会出现“Worker 派发预览”“派发请求草案”“审批状态”，只允许 `worker_run` 的 `bridge_action / context_pack`，权限标记为 `只读 / allowlist`。
16. 命令中心已新增计划级审批流：只读 Worker 完成后显示“计划审批”，支持“接受计划”“拒绝计划”“修改计划”。这些决策只作用于当前计划，不直接触发写文件、远程模型、Skill runtime 或 Scheduler。
17. 命令中心已新增“生成合并草案”：将当前计划审批记录打包为 `worker_merge_proposal` 请求，目标为 `bridge/agent-files/command-center-plan.md`，模式为 append。新版桥接层会生成 `bridge/workers/merge-proposals/*.json` 并给出 diff preview；若浏览器连接的是旧 HTTP Gateway 且返回 unsupported，前端会保留“本地合并草案请求”和 diff 摘要，等待重启 Gateway 后重试。
18. 命令中心已完成 hunk 级 Diff 审查：`worker_merge_proposal` 的 `diff_preview` 会解析为“Diff 改动块审查”，支持接受/拒绝单个 hunk、接受/拒绝全部 hunk。
19. 命令中心已完成最终 `write_file` 审批门：只把已接受 hunk 拼成写入内容，生成 `write_file` 请求草案；请求不带 `execute=true`，因此只进入 Gateway 审批队列，不直接落盘。
20. 已用直跑 Gateway 验证 `write_file` 安全门：`python -X utf8 bridge\zhimeng_bridge.py --json ... write_file ...` 返回 `approval_required` 和 `approval_id`，目标文件未被写入。
21. 已用浏览器 DOM 复核 hunk 流程：可见 `Diff 改动块审查`、`接受全部改动块`、`生成 write_file 审批`、`write_file 请求草案`、`write_file 审批结果`；同时已确认首屏不再出现 `能力对标矩阵`、`工具权限快照`、`领域 Agent 路由`、`书架` 等旧信号。
22. 最新构建验证：`npx tsc --noEmit` 通过，`npm run build` 通过，`dist/index.html` 已更新。
23. Agent IDE 骨架继续补齐：主侧边栏新增 `Agent 线程` 与 `工作区文件树`，辅助侧边栏新增 `Changes / Diff`，主工作区新增 VS Code 式 `底部 Panel`，包含 `终端 / 输出 / 问题 / Worker / Gateway / 审批` 标签。
24. 这些新面板目前是首版 UI 骨架：线程来自当前任务草案、只读 Worker、计划审批、write_file 审批门；文件树来自当前工作区文件；Changes 来自 diff hunks 或 merge proposals；底部 Panel 来自 Gateway、Provider、Worker 和 completion audit 状态。
25. Workspace Explorer 首版继续推进：`工作区文件树` 已从平铺列表升级为按分类分组的目录树；支持搜索文件/摘要/内容、全部展开、全部收起、清空搜索。辅助侧边栏新增 `只读文件预览`，点击文件后展示分类、更新时间、字数、版本数和纯文本预览。写入入口仍指向工具/审批，不直接编辑。
26. Workspace Explorer 已补齐更像 IDE 的导航闭环：左侧新增 `最近文件`，文件项支持双击跳转；右侧 `只读文件预览` 的主按钮改为 `跳转编辑器`，通过 `selectedFileId` 打开真实 Workspace 编辑器。该动作只改变导航与选中文件，不绕过 `write_file` 审批门。
27. `Agent 线程` 已从静态流水线升级为本地持久线程管理器：使用 `lumenos-agent-threads` 保存线程标题、任务、绑定工作区、Worker id、审批数、Diff 数和事件轨迹；左侧支持 `新建线程`、显示/隐藏归档、归档/恢复；主工作区新增 `线程管理器`，可恢复线程任务并查看线程事件。命令中心生成草案、Worker、计划审批、合并草案、`write_file` 审批都会写入当前线程事件。
28. `Changes / Diff` 已从草案平铺升级为文件级面板：派生 `ChangeFileRow`，展示文件级 Diff 列表、目标路径、接受/拒绝/待审 hunk 统计、单 hunk 接受/拒绝、接受全部、拒绝全部、`回滚草案`、`write_file 审批` 和可匹配工作区文件时的 `跳转编辑器`。这仍然复用现有 hunk 审批门，不直接写文件。
29. `底部 Panel` 已从状态概览升级为本地 runtime log 流：使用 `lumenos-runtime-logs` 持久化 `terminal / output / problems / workers / gateway / approvals` 六类日志；Gateway refresh、quick action、Provider action、命令中心草案、Worker、计划审批、合并草案、`write_file` 审批和记忆管理审批都会追加日志。底部 Panel 现在按 VS Code Panel 语义展示 `终端`、`输出日志`、`问题`、`Worker`、`Gateway 日志`、`审批`，支持文本筛选、状态筛选、Markdown/JSONL 导出当前 Panel 日志、清空前端本地日志，而不是静态占位。
30. Workbench layout state 已落地：使用 `lumenos-workbench-layout` 持久化 `activeView`、运行时检查器 tab、底部 Panel tab、Activity Bar、主侧边栏、辅助侧边栏、底部 Panel、Statusbar 可见性；顶部提供 Part 控制按钮，底部状态栏显示 `布局: n/6 Parts` 并可重置布局。刷新页面后保持当前工作台姿态，更接近 VS Code / Codex 的工作台行为。
31. Workbench layout state 继续扩展：`lumenos-workbench-layout` 现在还持久化底部日志搜索词、状态筛选、导出格式；底部 Panel 的 `导出` 只导出当前 tab 的筛选日志，`清空` 只清本地 runtime log 并保留一条“运行日志已清空”审计记录，不触碰审批队列、Worker 状态、Gateway 文件或项目文件。
32. Memory view 已从旧的“最近 L1 / 最近 L2”概览升级为 Memory Manager：支持搜索摘要/证据/标签/来源、按 L1/L2 和维度筛选、点击记忆查看详情、展示重要度/置信度/证据链，并生成编辑/冻结/删除草案；草案提交到 Gateway `memory_update` / `memory_freeze` / `memory_delete` approval queue，不覆盖或删除原记录。Runtime Inspector 的记忆 tab 保留轻量审计快照，避免复制一整套管理器。
33. Gateway 已新增 Memory Management approval gates：`memory_update`、`memory_freeze`、`memory_delete`、`memory_merge` 均返回 `approval_required`、`approval_id`、目标记忆快照和 review gate，不直接改 `bridge/memory/autodream-state.json`。
34. Gateway 已新增 `approval_status` 只读动作，Bridge manifest 和 MCP tools/list 均暴露该工具；前端刷新流已拉取最近 approvals，底部 Panel 新增 `审批` 标签，展示队列计数、动作/状态分布、最近审批摘要和 proposal JSON 预览。该面板不提供批准或执行按钮。
35. `审批` Panel 已从只读卡片列表升级为审批复核台：支持按 action / status 筛选、选择单条 approval、右侧查看目标/用途/状态，并在 `Proposal 草案`、`Request 请求`、`Result 结果` 三个只读视图之间切换。浏览器已验证筛选 `memory_freeze` 后当前筛选为 2 条，详情 JSON 可见，且没有 `批准执行` / `同意执行` 按钮。
36. `Agent 线程` 已新增本地持久消息流：线程记录现在包含 `messages`，旧线程会由事件迁移出系统/工具/Agent 消息；主工作区新增 `Agent 消息流` 和线程输入框。普通发送只记录消息并给出 Agent 就绪回复；`发送并生成草案` 会把消息送入命令中心的 `context_pack` / Skills / 工具审批预览，不直接执行写入。
37. `Agent 线程` 继续按 Codex / Claude Code 的任务线程方向推进：左侧线程视图新增搜索、当前工作区 / 全部空间 / 未绑定三种线程空间过滤、显示归档；主工作区新增绑定当前工作区、创建分支、导出、归档/恢复、删除本地记录；消息流支持“从此回滚分支”。这些动作只操作浏览器本地线程记录和下载导出文件，不删除项目文件、不修改审批队列、不绕过 Gateway。
38. `Agent 线程` 已新增线程级上下文附件和审批关联首版：线程记录包含 `contextAttachments` 与 `approvalIds`，可显式挂载当前文件、选中记忆、任务草案 context_pack、Skills、工作区和审批；`write_file`、Memory 管理审批和 Provider probe 审批会把 approval id 写回当前线程；审批复核台新增“关联当前线程”，当前线程也能看到关联审批摘要。该能力只建立可审查关系，不批准、不执行、不修改 Gateway 队列。
39. 线程上下文附件已进入 `context_pack` 任务协议：前端命令中心和只读 Worker 的 payload 现在包含 `thread_id`、`workspace_id`、`approval_ids`、`thread_context` 和 `thread_context_policy`；Gateway `build_context_pack` 会把最多 12 条线程附件压成只读 `thread_context`，合并进返回的 `context_pack`，并在 schema.uses 中声明 `thread_context`。命令中心 UI 会显示“线程附件注入”，计划审批记录也会写入线程附件章节。
40. 模型 Worker 已接入 Agent 线程首版：`worker_run:model_task` 的前端 payload 会携带 `thread_id`、`workspace_id`、`approval_ids`、`thread_context`、`thread_context_policy` 和当前文件片段；Gateway `prepare_model_worker_task` 会把这些字段继续传给 `build_context_pack`，因此模型预检/执行上下文不再丢失线程附件。Agent 消息流新增“模型 Worker 预检”和“运行模型 Worker”，预检默认不访问模型端点，运行仍受 Provider/Gateway/远程授权闸门控制。
41. 模型 Worker 事件流 UI 已落地首版：前端轮询 `worker_status(job_id)`，消费 `worker_run`、`worker_stage`、`model_child_*`、`model_stream_chunk`、`model_stream_end` 等事件，使用 job 启动时间和事件 key 去重；Agent 消息流会写入“模型 Worker 事件流”，状态卡展示最近 `Worker 事件流` 与 stream preview。Gateway 未在线时模型 Worker 按钮禁用，避免刚加载误点进入离线分支。
42. 模型 Worker 流式回复已改为原地更新：线程消息新增 `sourceRef`，同一 `model-worker-stream:<job_id>` 的 chunk 会持续更新同一条“模型 Worker 回复”，最终 completed 输出也回填到这条消息，不再把每批 `model_stream_chunk` 追加成碎片消息；线程导出会保留来源引用，便于审计。
43. Agent 线程关联审批已接入只读状态同步：线程记录新增 `approvalSnapshots`，刷新 `approval_status` 后会把已关联 approval 的 action/status/target/message 同步进线程快照和上下文附件；关联审批面板优先显示 Gateway 实时状态，最近队列未命中时使用线程快照兜底，仍然不提供批准或执行入口。
44. 底部 `终端` Panel 已接入 allowlist 命令闭环：新增命令预设、命令输入、`只校验` 和 `执行 allowlist`；执行仍必须满足 Gateway `--execute-command`、payload `execute=true`、validators pass 和 verification allowlist 命中。结果会写入 terminal runtime log 与当前 Agent 线程工具消息，危险命令仍 blocked。
45. Agent 线程跨工作区 thread spaces 独立存储首版已落地：新增 `lumenos-agent-thread-spaces` v1 索引，按 `workspace:<id>` / `unbound` 分桶保存线程，并从旧 `lumenos-agent-threads` 自动迁移；运行时仍展开为列表兼容现有 UI，侧边栏和线程管理器显示当前线程空间、space 数和各空间线程数，切换当前工作区时优先选择该 workspace 的可见线程。
46. `规格 / 钩子` 控制面已落地：原“自动化”视图升级为 Kiro / Claude Code 风格的 Spec-driven Agent 面板，展示 Specs 工作流（Requirements / Design / Tasks / Review）、Steering 规则、Agent Hooks、MCP 治理、Subagents 和执行闸门。该面板只做策略、草案和审计展示，不会绕过 Gateway 审批或直接执行外部动作。
47. Specs / Steering / Hooks 项目协议审批入口已落地：`规格 / 钩子` 面板新增“生成协议草案”和“提交写入审批”，会生成 `.lumen/specs/current/requirements.md`、`.lumen/specs/current/design.md`、`.lumen/specs/current/tasks.md`、`.lumen/steering/lumenos.md`、`.lumen/hooks/lumenos-hooks.md` 五个 Markdown 草案，并逐个调用 Gateway `write_file`。请求不带 `execute=true`，因此默认只进入 approval queue；审批 ID 会回写当前 Agent 线程和底部审批复核台。
48. 审批复核台已接入 `approval_decide` 决策闭环：Gateway 现在可对单条 approval 记录写入 `decision`，支持拒绝审批，或在 Gateway `--execute-write` 与前端显式 execute 请求同时满足时执行已排队的 `write_file` 审批；也支持在 Gateway `--execute-memory` 下执行 `memory_update` / `memory_freeze` / `memory_delete` / `memory_merge` / `memory_restore`，以及在 Gateway `--execute-provider` 下执行已排队的 `provider_probe`。前端复核台新增“拒绝审批”“执行 write_file / Memory / Provider probe”和 `Decision 决策` 详情页签，结果会进入底部审批日志和当前 Agent 线程。执行器 v1 仍不执行任意 action；MCP / Scheduler 继续保留各自专用执行门。
49. Memory Manager 已补齐备份历史和恢复审批草案：Gateway 新增 `memory_backup_status` 只读快照与 `memory_restore` 审批门，恢复执行仍必须通过 `approval_decide`、Gateway `--execute-memory` 和前端显式 execute；前端刷新流会拉取最近 AutoDream 备份，Memory view 展示备份列表、当前状态文件、恢复闸门、冻结/软删除/合并状态徽标和 `Diff 预览`，可从备份生成 `memory_restore` 恢复草案并提交 approvals，不会直接覆盖记忆。
50. Specs / Steering / Hooks 已从“生成入口”升级为协议管理器首版：前端可通过 Gateway `read_file` 只读同步 `.lumen/specs/current/requirements.md`、`design.md`、`tasks.md`、`.lumen/steering/lumenos.md` 和 `.lumen/hooks/lumenos-hooks.md`，不存在时显示未落地；同屏展示当前草案、现有协议状态、字符数变化和 `协议 Diff 审查`，再通过 `write_file` 审批提交。该流程继续保持 Kiro 式 Specs / Steering / Hooks 与 Claude Code 式可审查规则，不直接创建目录、不直接写入、不启用后台 hook。
51. Workspace Explorer 已新增文件操作草案：在辅助侧边栏的只读文件预览中，可生成 `新建草案`、`克隆草案`、`归档快照`，目标统一落在 `workspace-drafts/*` 下，并通过 Gateway `write_file` 进入审批队列；请求不带 `execute=true`，因此不会直接修改当前工作区、不会重命名/删除原文件。审批 ID 会进入底部审批复核台和当前 Agent 线程，保持 VS Code 文件树 + Codex/Claude Code 审批式改动流。
52. Workspace Explorer 已新增分组归档草案：可从当前选中文件所在分类聚合多个文件，生成 `workspace-drafts/<workspace>/archive/*-category-*.md` 批量快照草案；提交仍只走 Gateway `write_file` approval queue，不移动、不删除、不批量改写真实工作区文件。这是目录级/批量操作的安全雏形，后续再扩展为真实目录树操作与多文件 diff。
53. Workspace Explorer 已新增跨工作区定位器：主侧边栏文件树下方可按同一搜索词检索全库文件，显示来源工作区、分类、更新时间和字数；点击当前工作区文件会选中预览，点击外部结果会通过现有编辑器入口打开目标工作区文件，不写入文件、不生成审批、不改变真实目录。这让资源管理器更接近 VS Code / Codex 的全局项目导航，而不是单一写作项目侧栏。
54. Workspace Explorer 已新增跨项目最近打开历史：通过本地 `lumenos-cross-workspace-recents` 只保存 `bookId/fileId/openedAt`，从当前 Library 反解标题和工作区信息；打开任意工作区文件会进入最近列表，后续可快速跳回，不复制正文、不写项目文件、不修改审批队列。
55. Workspace Explorer 已新增项目级虚拟文件路径索引：从当前 Library 派生 `<workspace>/<category>/<title>.md` 或图片扩展路径，不改旧数据结构；当前文件树、最近文件、跨项目最近打开、跨工作区定位、只读预览和归档/克隆草案都会展示或写入该虚拟路径，搜索也能按路径匹配。这为后续真实文件路径映射、多文件 diff 和目录级操作打底。
56. Workspace Explorer 已新增路径索引导出草案：在只读文件预览的文件操作草案中可生成 `workspace-drafts/<workspace>/indexes/file-path-index-*.md`，内容是虚拟路径、分类、类型、字数、更新时间和版本数的 Markdown 索引表；提交仍只走 `write_file` approval queue，不创建真实目录、不复制正文、不修改工作区文件。
57. Provider/API 设置中心闭环首版已落地：`Provider 配置草案` 可从当前 API 设置、保存档案或前端/Gateway 预设载入，支持编辑 endpoint、Provider 类型、模型 ID、显示名、temperature、Max tokens 和探针超时；同屏展示脱敏运行时 payload、探针审批 payload 和模型 Worker payload。Provider workbench 已复用 `novelsmith-api-settings` / `ApiSettings.profiles` 完成本地配置档案保存、保存并激活、载入草案、激活和删除；手动改 endpoint / Provider / 模型 ID 会清掉旧档案来源，避免误覆盖。草案状态检查调用只读 `provider_status`，探针按钮调用默认不带 `execute=true` 的 `provider_probe`，只生成审批草案；审批复核台现在可在 Gateway `--execute-provider` 与前端显式 execute 同时满足时执行已排队的 `provider_probe`，且只探测模型列表端点，远程端点仍必须 `allow_remote_model=true`。草案可挂入当前 Agent 线程作为 `thread_context` 附件；页面不渲染明文 API key，保存档案只更新本地浏览器设置，不访问模型端点。
58. Skills 库 / 路由管理器首版已落地：Skills 视图不再只是最近候选/已激活/根目录状态卡，而是统一展示 Codex 用户 Skills、Agents 用户 Skills、Codex 内置 Skills、OpenAI Bundled Skills、AutoDream 候选/已激活 Skills 和 `skill_route` 返回的 core/local/isolated Skills。支持搜索名称/路径/标签/root，按领域 scope 过滤，运行只读路由预览，查看 `active_core_skills`、`active_local_skills`、`isolated_skills`、schema.execution 和安全说明；选中 Skill 可进入 Skill 检查器并挂入当前 Agent 线程作为 `thread_context`。该流程只读取 SKILL.md 指令和 Gateway 元数据，不执行脚本；`skill_run` 仍保留 `--execute-skill` + `payload.execute=true` gate。
59. Multi Workspace Manager 首版已落地：`工作区` 视图从简单卡片升级为多工作区管理器，提供工作区搜索、领域过滤、工作区列表、工作区检查器、工作区线程空间、最近打开、跨工作区定位、线程空间索引、容量统计和 fail-closed 边界说明。每个工作区展示文件/字数/分组、活跃线程、上下文附件、审批数、最近文件和最近打开；可打开工作区、进入 Agent 线程空间、把当前线程绑定到当前工作区。所有文件操作仍复用 Workspace Explorer 的 `write_file` approval queue，不直接写入、不复制正文、不移动文件。
60. 工作区级 `context_pack` 首版已落地：Multi Workspace Manager 的工作区检查器新增 `工作区 context_pack` 面板，可把当前工作区摘要、最近文件、活跃线程、已有 thread_context、记忆和 Skills 路由压成只读上下文包；在线时调用 Gateway `context_pack`，离线或失败时降级为本地只读草案。面板展示上下文切片、线程上下文数量、active Skills 和工具排除项，并可把生成结果挂入当前 Agent 线程作为 `thread_context` 附件；不写文件、不运行 Skill、不访问远程模型。
61. 工作区级 `context_pack` 历史版本首版已落地：新增 `lumenos-workspace-context-pack-history` 本地历史，成功生成或降级生成的工作区上下文包会保存最近 40 条；工作区检查器展示当前工作区最近 5 条历史版本，可一键恢复到当前预览，也可直接挂载到当前 Agent 线程。历史只保存上下文切片、Skills、工具排除和请求/结果摘要，不写入工作区文件、不执行审批、不复制真实目录。
62. 工作区权限 profile 首版已落地：新增 `lumenos-workspace-permission-profiles` 本地策略表，Multi Workspace Manager 的工作区检查器可按项目设置读文件、写文件、终端命令、远程模型、MCP、Skill runtime、Scheduler 的策略级别（继承 / 允许 / 审批 / 禁用）和备注。该 profile 会注入工作区级 `context_pack`，也可挂入当前 Agent 线程作为 `thread_context`；它只声明工作区策略，不开启 Gateway execute flag，不绕过请求级 `execute=true`、`allow_remote_model` 或审批队列。
63. Codex2API Provider 预设与模型列表闭环已落地：前端 `PROVIDER_PRESETS` 与 Gateway `PROVIDER_PRESETS` 新增 `Codex2API · gpt-5.3-codex`，Base URL 为 `https://www.codex2api.com/v1`，默认按 OpenAI-compatible wire format 处理；本地一次性 `provider_status` 识别为 key available，`provider_probe` 在 Gateway `--execute-provider`、payload `execute=true`、`allow_remote_model=true` 下成功访问 `/models`，返回 200 和 10 个模型（包含 `gpt-5.5`、`gpt-5.4`、`gpt-5.3-codex`、`codex-auto-review`、`gpt-image-*`）。Provider 中枢新增“实时获取模型列表”动作和脱敏 `execute=true` payload 预览，可在只填 endpoint 时拉取 `/models`，远程端点必须勾选授权且 Gateway 必须开启 `--execute-provider`；“生成探针审批”继续保持 `execute=false`，只生成审批草案。Provider 结果检查器会把探针返回的 `data/models` 解析成“模型列表”，展示 `display_name` / `type` / `owned_by`，点击模型可填入草案，也可保存为本地配置档案并激活；该动作不调用模型生成。API key 不写入源码、文档或预设，只能保存在本机设置/环境变量/一次性 payload。
64. 工作区 Skills 集首版已落地：新增 `lumenos-workspace-skill-sets` 本地策略表，Multi Workspace Manager 的工作区检查器可按项目启用/禁用 Skill key、编辑备注、查看已解析/总数、从当前 Skill 检查器加入候选，并把整个工作区 Skills 集挂入当前 Agent 线程。该策略会注入工作区级 `context_pack` 与 `thread_context`，并将工作区启用集并入 snapshot 的 `activeSkillKeys`；它只声明默认上下文能力，不执行 Skill runtime，`skill_run` 仍必须经过 `--execute-skill` 与 `payload.execute=true`。
65. 主外壳品牌纠偏已落地并再次校准：浏览器标题、Open Graph 和 README 首屏保持 **织梦写作台 / Zhimeng Writing Agent**，`AgentControlCenter` 说明 LumenOS 是底层 Agent OS / Agent IDE；`Activity Bar` 补齐模型 Provider、Worker、规格 / 钩子、写作 Agent 等核心 View Container。这样用户从 GitHub Pages 或 source 分支进入时，第一印象仍是写小说 Agent，深入后能看到支撑它长期运行的 Agent IDE 底盘。
66. Agent 线程附件托盘首版已落地：`AgentThreadMessage` 新增本地 `attachments`，线程输入区支持添加图片和文本/代码/JSON/Markdown 等文件，图片在消息流内本地预览，文本类文件读取有限预览片段；附件受数量和体积上限限制，只进入浏览器本地线程记录，不上传、不写项目文件、不自动调用远程模型。发送并生成草案或模型 Worker 预检时，会把附件名称、类型、大小和文本片段写入任务摘要，并同步挂为 `thread_context` 文件附件，便于 context_pack / Worker 审查。
67. 全局命令面板 / Quick Switcher 首版已落地：Header 新增“命令”入口，支持 `Ctrl/Cmd+K` 与 `Ctrl/Cmd+Shift+P` 打开；命令面板可搜索并执行主工作区 View Container 切换、底部 Panel 切换、新建 Agent 线程、生成 `context_pack` 任务草案、Provider 草案状态检查、Provider 探针审批草案和 Workbench 布局重置。结果按 `View / Panel / 动作 / 布局` 分组语义展示，支持上下键选择与 Enter 执行，执行记录写入本地 runtime log；它只触发已有受控入口，不绕过 Gateway、审批队列、远程模型授权或文件写入门。
68. 主工作区 Editor Group 首版已落地：`lumenos-workbench-layout` 现在持久化 `editorTabs` 与 `activeEditorTabId`，旧布局会迁移为 Agent OS / 工作区 / 模型 Provider 三个默认标签；Activity Bar、主侧栏、命令面板和内部按钮切换 View 时会打开或激活对应 View 标签。工作区文件树、最近文件和跨工作区定位双击会在 Shell 内打开只读文件标签，展示虚拟路径、正文/图片元数据、工作区上下文和写入边界，并可从文件标签生成克隆/归档草案；关闭标签会回退到邻近标签。该 Editor Group 只负责定位、阅读和上下文承载，真实编辑/写入仍走 Workspace Explorer、Changes Diff 和 Gateway approval。
69. Diff Editor Tab 首版已落地：`EditorTabKind` 扩展为 `view/file/diff`，Diff 标签可持久化 `changeId`、路径和状态；右侧 `Changes / Diff` 文件行支持双击打开主工作区 Diff 标签，详情区新增“打开 Diff 标签”，命令面板也新增 `/diff.open`。主工作区 Diff 标签展示 hunk 列表、路径、状态、接受/拒绝、接受全部、拒绝全部、回滚待审、打开文件标签和生成 `write_file` 审批；没有 hunk 的 worker merge proposal 也能作为只读 Diff 标签查看和跳转。该能力把 Changes 从辅助侧栏提升为 Editor Group 一等审查对象，但仍只改变 hunk 审查状态和生成审批请求，不直接写入项目文件。
70. 底部终端 Panel 已升级为命令历史审计台：新增 `lumenos-terminal-command-history` 本地历史，`run_command` 的只校验、allowlist 执行、离线失败和异常都会记录 command、execute、status、request/result、stdout、stderr、exit code 和时间；终端 Panel 现在分为命令输入、命令历史、stdout、stderr、命令历史索引和 runtime log，不再把所有输出混在单个文本块里。点击历史记录可恢复对应命令和结果；该历史只记录 Gateway 返回的受控命令结果，不开放任意 shell，执行仍必须满足 Gateway `--execute-command`、payload `execute=true`、validators pass 和 verification allowlist。
71. Statusbar 已升级为 Agent IDE 状态带：底部状态栏不再只是静态计数，而是承载可点击的工作台状态入口，包括灵枢 Agent OS、当前工作区、当前 Agent 线程、thread space、Gateway 在线/离线刷新入口、Provider/模型、审批队列、Worker Panel、tokens 和可见 Parts 数；点击相应段落会跳转 Agent OS、工作区、Provider、审批或 Worker Panel。状态栏仍只做导航和状态展示，不触发审批执行、命令执行或远程模型调用。
72. 工作区根目录映射 profile 首版已落地：新增 `lumenos-workspace-root-profiles` 本地声明表，Multi Workspace Manager 的工作区检查器可填写本机根目录、访问模式（虚拟路径 / 只读映射 / 审批访问）、include/exclude globs 和备注。该 profile 会注入工作区级 `context_pack`，也可挂入当前 Agent 线程作为 `thread_context`；当前版本只声明路径映射和扫描意图，不自动读取本地磁盘，不授予文件读写权限，真实文件访问仍走 Gateway `read_file` / `write_file` 与审批门。
73. 工作区根目录映射已接入 Gateway 文件闸门同步视图：根目录卡片现在会显示 `read_file`、`write_file`、`access_profile` 的当前运行时状态，交叉解释 root access mode、`--execute-read`、`--execute-write`、`--full-access-files` 和请求级 `execute=true` 的关系。该视图只做能力态势和下一步建议，不自动扫描磁盘、不打开 full access、不绕过 `write_file` approval；它为后续真实路径映射和目录级 diff 打下安全状态层。
74. Gateway `workspace_scan` 首版已落地：执行器、MCP 工具表、前端 Executor action 和 Multi Workspace Manager 根目录卡片都新增目录元数据扫描入口；默认生成 dry-run 草案，不解析真实磁盘路径，执行时必须同时满足 Gateway `--execute-read` 与请求 `execute=true`，full access 根目录还需要 `--full-access-files`。返回内容只包含路径、名称、扩展名、大小、修改时间、目录/文件类型和层级，明确不读取正文、不写文件、不执行 shell，并已加入健康检查防回归。
75. Workspace Scan Index 首版已落地：`workspace_scan` 成功返回后会把当前工作区的目录元数据写入本地 `lumenos-workspace-scan-indexes`，最多保留 500 条路径；Multi Workspace Manager 会展示当前真实路径索引、索引时间、目录/文件数、样例路径，并支持清除或挂入当前 Agent 线程。该索引会注入工作区 `context_pack` / `thread_context`，让 Agent 能看到真实项目路径结构；索引仍只保存元数据，正文读取继续必须走 Gateway `read_file`。
76. Workspace Scan Index 的 `read_file` 预览闭环已落地：真实路径索引里的文件项可被选中，前端会把扫描 root 与相对路径拼成读取候选，并通过 Gateway `read_file` 做一次性正文预览；执行仍要求 Gateway `--execute-read`、请求级 `execute=true`，full access 索引还要求 `--full-access-files`。预览内容只存在当前会话状态，不写入 `lumenos-workspace-scan-indexes`；用户可显式把预览片段挂入当前 Agent 线程作为 `thread_context` 文件附件。
77. Provider / Worker 记录层脱敏已补齐：Gateway `save_record` 现在会在写入 `bridge/runs` 与 `bridge/approvals` 前递归清理 `api_key` / `apiKey` / `Authorization` / `x-api-key` / `token` / `secret` / `cookie` / `password` 等敏感字段，并清理 URL query 中的 `key` / `token` / `secret`。Codex2API 仍可通过 OpenAI-compatible `GET /models` 拉取模型列表；一次性真实 key 探针确认返回 200 与 10 个模型，但 key 不写入源码、文档、运行记录或构建产物。
78. Provider 预设目录显示已取消前端截断：Agent Control Center 刷新 `provider_catalog` 时请求 80 条，手动“刷新目录”也请求 80 条；前端兜底预设库不再只显示前 20 个。这样 `Codex2API · gpt-5.3-codex` 等靠后的聚合网关预设会出现在 Provider 配置草案下拉与预设库里，而不是只在 Gateway catalog 里存在。
79. Provider 草案模型 Worker 测试闭环首版已落地：模型 Provider 中枢新增 `Worker 预检` 与 `测试模型`，直接使用当前 Provider 配置草案生成 `worker_run:model_task`，不必先保存为全局活跃设置。预检只准备上下文和模型 payload，不访问模型；测试会发送 `execute_model=true`，本地端点可直接走模型 Worker，远程端点必须先勾选授权并继续受 `allow_remote_model` gate 约束。结果复用现有模型 Worker 状态卡、线程事件流和底部 Worker 日志，不写文件、不运行命令。
80. Gateway 统一运行事件流首版已落地：新增只读 `runtime_events` action/MCP tool，合并 `bridge/runs`、`bridge/approvals` 与 `bridge/workers/worker-state.json` 的任务和事件，输出统一 `source/type/status/title/detail/ref/at` 结构，并继续复用记录层脱敏。Agent Control Center 刷新时会读取该事件流，底部 Panel 新增“事件流”标签，展示来源分布、状态分布和最近 Gateway/审批/Worker 轨迹，让 Provider 探针、模型 Worker、审批决策和工具调用能像 Codex / Claude Code 式工作台一样被串联审查。
81. 运行观察 / 自动同步首版已落地：底部“事件流”Panel 新增只读运行观察控制条，可按 5s / 15s / 30s 自动同步 `runtime_events`、`worker_status` 和 `approval_status`，也可手动“同步”；同步结果会刷新事件流、Worker 和审批状态，并合并进前端 runtime log。Gateway `/bridge` 支持请求级 `record=false`，因此这类订阅式轮询不会把自身写进 `bridge/runs` 刷屏；它不调用 Provider 探针、不运行模型、不写文件、不执行命令、不做审批决策。命令面板新增“开启/暂停运行观察”和“立即同步运行状态”，状态栏显示“观察 开/关”，让运行态更接近 Codex / Claude Code / VS Code 的底部运行面板。
82. 运行事件增量游标首版已落地：Gateway `runtime_events` 新增 `after_epoch` / `after_id` 输入和 `cursor` / `latest` / `incremental` / `has_new` 输出，仍保留 `events/count/total/by_source/by_status` 兼容旧 UI。前端运行观察会在首次同步或完整刷新后建立游标，后续自动同步只请求新增事件，再与本地 runtime log 去重合并；面板显示“新增数、最近同步、游标时间、tick”，让事件流从“反复拉最近窗口”升级成更像 IDE runtime stream 的增量状态通道。该增量同步继续使用 `record=false`，不污染 runs，不触发模型、命令、写文件或审批执行。
83. 运行事件长连接订阅首版已落地：Gateway 新增只读 `GET /runtime/stream` SSE 端点，按 `limit/interval/ticks/after_epoch/after_id` 推送 `hello`、`runtime_events` 和 `done` 事件，内部复用 `runtime_events` 增量游标协议，不写 `bridge/runs`，不触发任何执行门。前端运行观察开启时优先建立 EventSource 长连接，收到 `runtime_events` 后实时合并本地 runtime log 和游标；长连接结束或错误时自动关闭并回落到现有增量轮询。事件流面板新增“通道 长连接 / 轮询”提示，让底部运行面板更接近 Codex / Claude Code 式实时任务流。

后续优先补：

1. 继续把 `Agent 线程` 从本地会话系统升级到真实任务协议：线程搜索/空间过滤/导出/删除/分支、上下文附件、审批关联、context_pack 协议注入、模型 Worker 请求注入、事件流 UI、流式回复原地更新、审批状态刷新同步、运行观察轻轮询、增量事件游标、SSE 长连接事件流、跨工作区 thread spaces 存储、write_file 授权执行闭环、Memory 授权执行闭环和多工作区管理器首版已落地，下一步是更多专用审批执行器、多项目 thread space 持久化协议和任务状态协议收敛。
2. 继续把 `Changes / Diff` 从单文件派生面板升级成完整多文件 diff 系统：多文件 proposal、真实文件路径映射、hunk 解释、回滚草案、历史 diff、与审批队列双向同步。
3. 继续把 `底部 Panel` 从本地 runtime log 流升级成真实可审查运行面板：allowlist 验证命令闭环、运行观察轻轮询、增量事件游标、SSE 长连接订阅、Worker/Gateway/审批统一事件流已落地，下一步是历史命令索引、stdout/stderr 更细分流和 Worker 任务时间线可视化。
4. 把 `工作区文件树` 和 Multi Workspace Manager 从当前搜索/折叠/最近文件/只读预览/跳转编辑器/文件操作草案/分组归档草案/跨工作区定位/跨项目最近打开/虚拟路径索引/路径索引导出草案/工作区级 context_pack/历史版本/权限 profile/工作区 Skills 集继续升级成完整 Workspace Explorer：真实文件路径映射、多文件 diff、目录级批量草案、跨项目 context_pack 对比、项目独立记忆切片、真实根目录映射、profile/Skills 与 Gateway 执行门状态同步已落地首版，下一步是真实目录扫描审批草案和虚拟路径到本机路径的逐文件映射；写入继续走 approval。
5. 升级 Memory Manager：Memory 专用审批执行器、备份历史、恢复草案、冻结/软删除视觉状态和 proposal diff 首版已落地，下一步补手动合并交互、历史版本对比、恢复后的可视化审计和订阅式审批状态流；当前执行仍需要 Gateway `--execute-memory` 与前端显式 execute。
6. Provider/API 设置中心已具备配置草案、脱敏 payload、profile 持久化编辑/激活/删除、只读状态检查、探针审批草案、线程附件、`provider_probe` 审批执行门、Codex2API `/models` 拉取、模型 Worker 测试闭环和运行观察同步首版；下一步补更多 provider wire format 适配、模型能力标签、探针历史对比和长连接式审批状态流。
7. Multi Workspace Manager 首版已具备搜索/领域过滤、检查器、线程空间、最近打开、跨工作区定位、安全边界说明、工作区级 context_pack、历史版本、权限 profile 和工作区 Skills 集；下一步补每个项目独立记忆切片、真实根目录映射、context_pack 版本对比、profile/Gateway 状态同步和跨项目 Skills 策略差异对比。
8. Skills Market / Skill 路由管理首版已具备统一 Skill 库、搜索/领域过滤、路由预览、检查器、线程挂载和工作区启用/禁用策略；下一步补 Skill 历史版本、危险能力审计、Skill 包导入/导出、运行审批复核和按工作区策略自动解释路由原因。
9. 真实 MCP transport / streaming。
10. Specs / Steering / Hooks 协议管理器首版已能读取现有 `.lumen/*` 并做草案 diff；下一步补历史版本索引、协议文件树、逐文件接受/拒绝、merge 策略和 hook 启用审批。

# 灵枢 LumenOS 总规划

记录日期：2026-06-06

## Final Goal

成品名暂定为 **灵枢 LumenOS**。它不再定位为单一的小说 Agent，也不是提示词网页。最终目标是一个本地 Personal Operating System：把上下文记忆、Skills、Tool Use、项目管理、长期记忆、模型 Provider、Worker、MCP/Gateway、安全审批和多工作区组织成一个可持续运行的个人超级 Agent。

**织梦** 保留为内置 Writing Agent / Writing Workspace 的名字。写作是第一个高价值 Agent 域。小说 Skills、织梦写作台、蒸馏、反崩盘、章节树都应该作为 Writing Workspace 存在；同一套 OS 还要能承载 coding、research、automation、knowledge、personal admin 等域。

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
- 长期记忆管理器：首版已支持 L1/L2 搜索、类型/维度筛选、详情检查、标签/证据展示、编辑/冻结/删除审阅草案；Gateway 已提供 `memory_update` / `memory_freeze` / `memory_delete` / `memory_merge` approval-only 管理门，默认只排队审批，不直接修改记忆；`approval_status` 可只读查看最近 approvals 记录。
- Context Pack：任务、相关文件、Skills、记忆摘要、工具边界统一打包。
- SOUL / MEMORY / KAIROS / BRIDGE / COORDINATOR 工作区文件成为 OS 默认真值。
- 用户偏好和项目事实必须带证据、置信度、时间。

验收门：

- 新任务能先召回相关记忆摘要，再决定是否读取全文。
- 记忆写回必须可审查，不伪造长期画像。
- token 消耗从「全量上下文」转向「摘要切片 + 必要全文」。

## Phase 3 - Skills and Domain Agents

目标：Skills 变成 OS 的可路由能力层，写作只是其中一个 domain。

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

当前立即止损方向已回正为 Agent IDE，而不是写作 dashboard：

1. 成品名定为 **灵枢 LumenOS**：中文产品名“灵枢”，英文/技术名 `LumenOS`；**织梦** 只保留为内置 Writing Agent / 写作工作区。
2. `HomePage` 已删除旧书架首页、写作追踪、Prompt 卡片库的首屏主场，只保留灵枢 LumenOS 的 Agent OS Shell。
3. `AgentControlCenter` 已升级为全屏 IDE 工作台：Title/Menu Bar + Activity Bar + 主侧边栏 + 主工作区 / Agent 运行台 + 辅助侧边栏。
4. Writing 能力继续保留，但只作为 `Writing Agent` / `Writing Workspace` 节点挂载在主侧边栏，不再定义整个产品。
5. Main Content 已从静态 dashboard 升级为可切换 Agent Workbench：`Agent OS`、`Workspaces`、`Memory`、`Skills`、`Tools`、`Providers`、`Workers`、`Automation`、`Writing Agent` 都有独立主面板。
6. 最新 UI 收口已把旧的能力矩阵/工具快照/领域路由大卡从 Agent OS 首屏移除；首屏应保持为“Agent 运行线程 + 命令中心 + 上下文检查器 + 运行轨迹/审批/证据/终端预览”的工作台形态。
7. 多模态消息类型已开始接入：ChatMessage 可承载文本或图片内容，历史对话与聊天渲染已改为通过 `chatContentToText` 兼容。
8. `BookProject` 仍作为历史存储类型保留，但首页和工作区创建弹窗已改为工作区 / 领域 Agent 语义；旧本地数据如“未命名作品 / 番茄小说”在 OS Shell 展示层映射为“未命名工作区 / 写作 Agent”，不直接篡改用户数据。
9. Activity Bar、Primary Sidebar、Workbench Tabs 已真实联动 `activeView`；点击 Workspaces / Memory / Tools / Workers / Providers / Automation / Writing Agent 会切换 Main Content，而不是只做静态装饰。
10. Provider view 已从模型目录页升级为“模型 Provider 中枢 / 模型运行时 / API Gateway”：展示当前运行时配置、凭据状态、Provider 闸门、已保存配置档案、前端预设库、模型 Worker 载荷，并提供“状态检查”“探针草案”“刷新目录”。
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

后续优先补：

1. 继续把 `Agent 线程` 从本地会话系统升级到真实任务协议：线程搜索/空间过滤/导出/删除/分支、上下文附件、审批关联、context_pack 协议注入、模型 Worker 请求注入、事件流 UI、流式回复原地更新和审批状态刷新同步已落地，下一步是跨工作区 thread spaces 的独立存储、真实订阅式 approval/worker 状态流和授权执行闭环。
2. 继续把 `Changes / Diff` 从单文件派生面板升级成完整多文件 diff 系统：多文件 proposal、真实文件路径映射、hunk 解释、回滚草案、历史 diff、与审批队列双向同步。
3. 继续把 `底部 Panel` 从本地 runtime log 流升级成真实可审查运行面板：allowlist 验证命令闭环已落地，下一步是 Worker/Gateway 事件订阅、历史命令索引和 stdout/stderr 更细分流。
4. 把 `工作区文件树` 从当前搜索/折叠/最近文件/只读预览/跳转编辑器继续升级成完整 Workspace Explorer：目录级操作、文件操作草案、跨项目定位；写入继续走 approval。
5. 升级 Memory Manager：补 memory proposal diff、审批后执行器和手动合并交互；当前 approval 队列已可只读复核，但 Gateway 管理门仍是 approval-only。
6. Provider/API 设置中心的 profile 编辑、live status/probe 执行授权流和模型 worker 测试闭环。
7. Multi Workspace Manager：每个项目独立 workspace、记忆、Skills、权限 profile。
8. Skills Market / Skill 路由管理。
9. 真实 MCP transport / streaming。

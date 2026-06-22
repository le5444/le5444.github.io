# Core Chain Calibration - 2026-06-20

这份顶层校准文档只回答老大提出的四个问题，并把它们变成后续开发的共同门禁：

1. 核心链路是什么
2. 每个卡点怎么验证
3. 能不能优先用 API
4. spec 文档里有没有成功标准

它不是新概念，也不是新面板。它的作用是防止项目继续沿着旧的“写作前端 / 功能堆叠 / 控制台大杂烩”惯性走。

## 0. 当前边界

- 公开入口、浏览器标题、README 首屏继续保持：`织梦写作台 / Zhimeng Writing Agent`。
- 灵枢 LumenOS 只作为底层 Agent OS / Agent IDE 运行层，用来组织线程、上下文、Skills、工具、Provider、Gateway、Worker、审批、记忆和桌面运行时。
- 写作是重要内置能力，但不是整个产品边界。
- 后续参考资料、文档和本地可借鉴源码只能提炼架构、交互、链路和验收标准；落地代码必须按当前项目结构重写。

### 0.1 参考资料吸收边界

本轮校准已经把老大给的资料纳入判断，但它们进入项目的方式必须是“转成链路和验收”，不是“照搬页面或静态模型清单”：

- `继续上下文-织梦PersonalOS.md`、`对话记忆-织梦PersonalOS.md`：只继承 Agent IDE、三栏工作台、Gateway / Memory / Skills / Worker / Provider / 审批这些架构经验；旧的 `LumenOS-first` 公开命名边界不再继承。
- `AI编程Agent工具全景与复刻指南.docx`：吸收桌面端、CLI、VS Code 插件、MCP、工具执行层、权限审批层、模型适配层和会话管理层的拆解，落到本项目就是线程、工具、审批、Provider、Gateway 和运行报告。
- `Codex_5.5_UI复刻完整指南 (3).docx`：吸收三栏布局、会话列表、聊天窗口、文件树、终端、Diff、权限弹窗、设置面板、状态栏和模型注册表这些 UI / 架构目标；其中出现的未来模型名或版本号只当示例，不进入本项目 Provider 预设的真实模型清单，真实可用模型必须来自 `/models`。
- `C:\Users\30865\Desktop\ai可借鉴源码`：吸收 Agent Harness 的 query loop、tool pool、permission gate、context pipeline、subagent、skills、hooks、MCP、provider proxy 等结构，不把外部源码机械移植到本仓库。
- `frontend(1).zip`：吸收 cc switch / 配置工具思路，落地为“粘贴配置解析、模型发现、保存启用、桌面 Provider 配置工具”，不把 API 配置塞回默认右侧栏或全屏页面。

这些资料的共同结论是：默认首页必须继续围绕 `线程 / 中间 AI 对话 / 右侧上下文与审批`，每个新功能都要回答它接在核心链路哪一段、怎么验证、是否优先复用 Provider API 或 Gateway。

## 1. 核心链路是什么

当前项目的最短可用 Agent 链路必须是：

```text
用户输入 / 附件 / 图片
-> Agent 线程保存
-> 上下文打包：thread_context / workspace / memory / skills / runbook
-> Provider API 模型请求
-> 模型回复
-> 解析 <bridge-request>
-> Gateway 工具执行或 Diff / 审批草案
-> 工具结果回灌到线程和运行报告
-> 模型继续推理或明确停止
```

这条链路决定 UI 和功能的优先级：

- 左侧只服务线程、项目、工作区导航。
- 中间只服务 AI 对话主线程、任务状态和输入框。
- 右侧只服务上下文、文件、Diff、审批、运行状态。
- 底部终端 / 日志只在需要时出现。
- API / Provider 配置只进设置、模型中心或桌面配置工具，不抢默认首页。

## 2. 每个卡点怎么验证

| 卡点 | 必须证明什么 | 自动验证 / 手动证据 |
| --- | --- | --- |
| 公开边界 | 入口仍是 Zhimeng-first，不回到 LumenOS-first | `npm run verify:phase5` |
| 默认首页 | Chat-first 三栏，右侧默认不被 API 配置占用 | `npm run verify:phase2`、`npm run verify:phase2-agent-home-browser` |
| 普通对话 | 文本进入真实 Provider API，请求失败不生成假回复 | `npm run verify:phase1`、手动发送文本 |
| 模型配置入口 | 首页模型胶囊能打开轻量设置；自定义 baseURL / API key / modelId 可点“保存 API 配置”立即驱动对话；复制进去的 baseURL / API key 必须保存为去空格的干净值；模型发现必须先“填入草稿”，并显示当前首页正在使用的 Provider 状态；端点模板默认折叠且标明不是模型清单 | `npm run verify:phase1-browser-chat`、`npm run verify:provider-config`、`npm run verify:phase2-agent-home-browser` |
| 附件 / 图片 | 文件片段和 image part 进入模型请求，真实首页发送后 mock Provider 能记录文本附件、image_url 和图片 data URL，超大附件发送前拒绝 | `npm run verify:agent-attachment`、`npm run verify:agent-chat-attachment-api-smoke`、`npm run verify:phase2-agent-home-browser` |
| 线程保存 | 用户消息、AI 回复、附件、上下文、审批和运行事件可恢复；自由对话落在 unbound 线程空间，刷新后仍可见 | `npm run verify:agent-thread-store`、`npm run verify:phase2-agent-home-browser` |
| 项目模式 | 绑定目录、扫描、读文件、挂上下文、Diff、审批形成闭环；项目工具证据进入 Tool Trace / 运行报告时必须能追到 `read_file` 路径、`workspace_scan` 扫描根和文件数 | `npm run verify:phase3` |
| 写文件 | 模型不能直写磁盘，必须先生成 Diff / 审批 | `npm run verify:write-file-diff`、`npm run verify:agent-loop-write-file` |
| 命令执行 | 不开放任意 shell，命令走 Gateway allowlist / 审批 | `npm run verify:gateway-command-approval` |
| Agent Loop | 不停在一次 sendChat，能工具请求、回灌和续跑 | `npm run verify:phase4` |
| 运行报告 | 工具、审批、Diff、Worker 和日志按线程过滤可回放 | `npm run verify:agent-run-replay`、`npm run verify:agent-run-report-scope` |
| Provider / 桌面配置 | 可通过设置或桌面配置工具接 API，密钥不进入历史和源码 | `npm run verify:phase5`、`npm run verify:desktop-provider-chat` |

## 3. 能不能优先用 API

能，而且应该优先用 API，但要分清职责：

- AI 对话、模型列表、模型测试、多模态输入优先走 Provider API。
- 首页自定义 API 配置必须能在轻量设置里完成：填 baseURL、API key、modelId 后点“保存并使用”，下一条对话直接走该 Provider。
- 文件、命令、目录扫描、Diff、审批、Worker、Memory、Skills、MCP、Scheduler 走 Gateway / bridge contract。
- Gateway 离线不能阻塞基础聊天；Provider 不可用也不能阻塞线程保存。
- 远程模型探测、Skill runtime、MCP、Scheduler、写文件和命令执行都必须保留执行门和审批门。
- 任何“看起来像成功”的 mock、兜底回复或静态卡片，都不能替代真实 API / Gateway 证据。

## 4. Spec 文档里有没有成功标准

必须有。每个阶段 spec 至少要包含：

1. `核心链路`：说明该阶段最短闭环。
2. `卡点与验证`：列出卡点、成功标准、验证命令或手动证据。
3. `API / Gateway 优先原则`：说明哪些走 Provider API，哪些走 Gateway，哪些必须审批。
4. `Spec 成功标准`：明确什么算完成，不能只写愿景。
5. `总门禁命令`：例如 `npm run verify:phase1` 到 `npm run verify:phase5`。

当前阶段对应关系：

| Phase | 重点 | 总门禁 |
| --- | --- | --- |
| Phase 0 | 审计设计稿和真实运行链路，列止损清单 | `docs/phase0-audit-20260618.md` |
| Phase 1 | AI 对话、附件、图片、多模态、线程保存、Provider API | `npm run verify:phase1` |
| Phase 2 | Codex / Claude Code / VS Code 风格 Agent Home | `npm run verify:phase2` |
| Phase 3 | 项目目录、文件读取、Diff、审批、命令 Gateway | `npm run verify:phase3` |
| Phase 4 | Agent Loop、Runbook、Instruction Stack、Memory、Skills、Worker | `npm run verify:phase4` |
| Phase 5 | 桌面化、Provider 配置工具、密钥边界、构建就绪 | `npm run verify:phase5` |

## 5. 止损规则

- 不再因为“功能很多”就往首页加按钮。
- 不再把 TypeScript 类型、设计稿或静态卡片当成已完成能力。
- 不再把 API 配置、Provider 调试或模型错误页塞回默认右侧栏。
- 不再让模型直接写文件或执行命令。
- 不再为旧的写作前端路径堆兼容入口；写作能力要作为 Agent domain 接入主链路。

## 6. 下一个小目标

下一步优先做能加强主链路证据的改动，而不是新增概念：

1. 如果改 UI，先看它是否让左侧线程 / 中间对话 / 右侧上下文更清楚。
2. 如果改 Agent Loop，先看它是否让工具请求、审批、回灌、续跑更真实。
3. 如果改 Provider，先看它是否让模型列表、测试对话、真实聊天和密钥边界更稳。
4. 如果改项目模式，先看它是否让绑定目录、读文件、Diff、审批、复核更顺。

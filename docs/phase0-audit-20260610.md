# Phase 0 Audit - 2026-06-10

## 目标

这份审计只做一件事：基于当前代码，确认什么是真正在跑的，什么只是骨架，什么是旧入口残留，并给出后续开发必须遵守的止损边界。

公开产品边界按最新共识执行：

- 公开入口保持 **织梦写作台 / Zhimeng Writing Agent**。
- `LumenOS / 灵枢` 只作为底层运行层语义，不再作为公开产品壳。
- 写作是核心能力之一，但不是整个产品边界。

## 核心结论

当前项目不是“什么都没做出来”，而是“已经做出两套并行系统，并且新旧边界还没有彻底收口”。

- 新主线已经存在：`HomePage -> AgentControlCenter` 已经是更接近 Codex / Claude Code / VS Code 风格的 AI Agent 工作台入口。
- 旧主线还活着：`WorkspacePage -> AIChatPanel` 仍然保留了旧写作工作区和大量 Personal OS / Goal Mode / Swarm 控件。
- Gateway 和部分工具链是真实可用的，不只是 TypeScript 设计稿。
- `src/os/kernel/agent-loop.ts` 已经有实验版真实循环，但还没有接入主入口，且命名和停止标记仍是旧 `LumenOS` 语义。

P0 结论：后续开发必须先把“唯一主壳”和“旧入口冻结”定下来，否则功能越接越乱。

## 当前真实主入口

- 主应用仍保留多视图分支，见 [App.tsx](src/App.tsx:22) 与 [App.tsx](src/App.tsx:483)。
- `home` 视图已经进入 [HomePage.tsx](src/components/HomePage.tsx:7)，而 `HomePage` 只保留 [AgentControlCenter](src/components/HomePage.tsx:41) 作为主工作台。
- 但 `App.tsx` 仍保留旧页面分支：[PromptOverviewPage](src/App.tsx:508)、[DistillationPage](src/App.tsx:513)、[WorkspacePage](src/App.tsx:532)。

判断：

- 对外默认主壳应视为 `AgentControlCenter`。
- `WorkspacePage / PromptOverviewPage / DistillationPage` 现阶段应视为遗留入口，不应继续承载新的产品主流程。

## 当前真正可用的能力

### 1. AI 对话主链已经可跑

- 模型系统提示和 provider 发送主链在 [settings.ts](src/store/settings.ts:116)、[settings.ts](src/store/settings.ts:136)、[settings.ts](src/store/settings.ts:164)。
- 工作台直接对话链路在 [AgentControlCenter.tsx](src/components/AgentControlCenter.tsx:8757)。
- 模型输出后会解析 `<bridge-request>`，见 [AgentControlCenter.tsx](src/components/AgentControlCenter.tsx:8817)。

判断：

- “发消息后只保存线程、不形成 Agent 闭环”的状态已经不是完全成立。
- 当前至少存在一条可工作的最小闭环：`模型回复 -> bridge-request -> Gateway -> 工具结果 -> 模型续答`。

### 2. 右侧模型/终端体验已经开始收口

- 模型侧栏已支持在工作台内配置，不需要全屏跳出。
- 模型面板已加“回到对话”，见 [AgentControlCenter.tsx](src/components/AgentControlCenter.tsx:18250)。
- 右侧终端页已新增“工具轨迹 / Gateway”，见 [AgentControlCenter.tsx](src/components/AgentControlCenter.tsx:18517)。

判断：

- “点进去回不来”“API 配置像整页中断”这个问题已经开始被修正。
- 这条方向应继续保持：配置仍留在工作台内，且必须始终有回到对话的路径。

### 3. Gateway 的文件 / 命令 / 目录扫描不是空壳

- `run_command` 在 [zhimeng_bridge.py](bridge/zhimeng_bridge.py:8527)。
- `read_file` 在 [zhimeng_bridge.py](bridge/zhimeng_bridge.py:8547)。
- `workspace_scan` 在 [zhimeng_bridge.py](bridge/zhimeng_bridge.py:8557)。
- `write_file` 在 [zhimeng_bridge.py](bridge/zhimeng_bridge.py:8584)。

判断：

- 这些能力已经是“受控真实执行”，不是纯前端假动作。
- 当前问题不是“完全没有工具”，而是“工作台对这些真实能力的主流程组织还不够清楚”。

## 当前只是骨架或实验态的部分

### 1. 实验版 Agent Loop 已写，但还没接入主工作台

- 实验循环在 [agent-loop.ts](src/os/kernel/agent-loop.ts:72)。
- 它已经包含 `sendRawChat`、工具调用解析、Gateway 回灌和停止标记，见 [agent-loop.ts](src/os/kernel/agent-loop.ts:182)、[agent-loop.ts](src/os/kernel/agent-loop.ts:195)。
- 但它仍使用 `LUMENOS_TASK_COMPLETE` 和旧文案，见 [agent-loop.ts](src/os/kernel/agent-loop.ts:164)。

判断：

- 这不是空文件，也不是纯概念稿。
- 但它还不能算产品主链，因为没有接入当前默认工作台，也没有完成命名和状态整合。

### 2. Skills / Memory / Worker / Subagent 更像后台能力层，不是成熟主流程

- `AgentControlCenter` 已经在拉 `phase_audit`、`completion_audit`、`worker_status`、`memory_status` 等状态。
- 这些能力在 UI 中可见，但还偏“运行层/工程面板”，并没有整理成用户主流程中的自然步骤。

判断：

- 这些模块可以继续保留，但 Phase 1 不应把它们当作前台主角。
- 它们当前更适合作为底层能力层，而不是默认首页最先被用户理解的内容。

## 当前明确的冲突与遗留

### 1. 新工作台和旧写作工作区并存

- 旧工作区仍是标准三栏写作工具，见 [WorkspacePage.tsx](src/components/WorkspacePage.tsx:20)、[WorkspacePage.tsx](src/components/WorkspacePage.tsx:21)、[WorkspacePage.tsx](src/components/WorkspacePage.tsx:480)。
- 旧 `AIChatPanel` 仍保留大量 Personal OS / 目标模式 / 子代理控制，见 [AIChatPanel.tsx](src/components/AIChatPanel.tsx:2490)、[AIChatPanel.tsx](src/components/AIChatPanel.tsx:2499)、[AIChatPanel.tsx](src/components/AIChatPanel.tsx:2511)。

影响：

- 用户会看到两套产品哲学同时存在。
- 任意继续往 `AIChatPanel` 加 Agent IDE 级能力，都会把旧写作壳继续养大。

### 2. 文档与底层命名仍有旧边界残留

- `bridge/README.md` 仍把顶层产品写成 `LumenOS Personal Agent OS`，并明确写出“织梦是内置 Writing Agent”，见 [bridge/README.md](bridge/README.md:1)、[bridge/README.md](bridge/README.md:3)、[bridge/README.md](bridge/README.md:292)。
- 前端工作台里已经出现了“运行时纠偏”，通过字符串替换清洗旧公开名，见 [AgentControlCenter.tsx](src/components/AgentControlCenter.tsx:1189)。

影响：

- 当前产品边界不是完全一致，而是“前台已经纠偏，后台和文档仍有历史残留”。
- 这会让后续线程继续误把 `LumenOS-first` 当作当前目标。

### 3. 单文件过重

- `AgentControlCenter.tsx` 已经承担首页壳、线程、上下文、审批、终端、项目模式、Provider、Worker、运行日志等过多职责。

影响：

- 短期内它是唯一能继续推进的主壳。
- 中期必须拆，但 P0/P1 不宜为了“代码洁癖”先大拆。

## P0 止损规则

从这份文档开始，后续开发默认遵守以下规则：

1. `AgentControlCenter` 是唯一主工作台壳。
2. `WorkspacePage / AIChatPanel / PromptOverviewPage / DistillationPage` 只做维护，不再承接新的主产品能力。
3. 所有新的 AI 对话、项目目录、Diff、审批、终端、Provider、工具轨迹，都只落在 `AgentControlCenter` 这条主线上。
4. 公开命名继续保持“织梦写作台 / Zhimeng Writing Agent”；底层可保留 `LumenOS / 灵枢` 技术语义，但不再回到 `LumenOS-first` 对外表述。
5. `bridge/README.md`、底层描述、示例 goal 文案后续需要统一纠偏，但这属于边界清理，不属于 Phase 1 核心功能。
6. 不再新增会让首页更像“杂乱仪表盘”的指标卡、实验按钮或并列入口。

## Phase 1 准入条件

只有满足下面这些条件，才算真正进入 Phase 1：

1. 默认首页稳定是“左侧线程/项目，中间 AI 对话，右侧上下文/文件/审批/终端”。
2. 对话模式下，文本、文件、图片输入都能清楚进入同一条发送链。
3. 模型配置只走右侧模型面板或设置，不再出现新的全屏打断入口。
4. 工具请求、工具结果、失败和审批阻塞，用户都能在当前线程里看懂，不是黑箱。
5. 没绑定项目目录时也能聊天；绑定目录后再增强文件树、扫描、读写和 Diff。
6. 新功能优先补“清晰主流程”，不是继续扩张旧页面或后台能力面板。

## P0 完成定义

本次 P0 审计完成后，可以认为已经得到这些结论：

- 主壳已经确认。
- 旧入口已经确认并被冻结范围。
- 真正可用的链路已经确认，不再误判为“全是设计稿”。
- 仅骨架或实验态的部分已经被单独标记。
- 后续 P1 不再以“继续堆功能”为目标，而以“收口主流程”为目标。


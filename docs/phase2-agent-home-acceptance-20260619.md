# Phase 2 Agent Home 验收标准

这份文件只回答 Phase 2 的四个问题：核心链路是什么、每个卡点怎么验证、能不能优先用 API、spec 文档里有没有成功标准。默认首页的目标是从“写作前端 / 杂乱仪表盘”收敛成“AI Agent IDE 首页”。

公开入口仍保持“织梦写作台 / Zhimeng Writing Agent”。灵枢 LumenOS 只作为底层 Agent OS / Agent IDE 运行层，不作为默认公开标题。

## 1. 核心链路

Phase 2 的默认首页核心链路是：

```text
打开织梦写作台
-> 左侧选择 / 新建自由对话或项目对话
-> 中间 AI 对话主线程输入任务
-> 模型可用时走 Provider API，模型不可用时只保存线程
-> 右侧按当前线程显示上下文 / 文件 / Diff / 审批 / 状态
-> 需要配置时进入设置 / 模型中心 / 桌面配置工具
```

这条链路要求 Chat-first 三栏，而不是功能面板堆叠：

```
左侧 Primary Sidebar -> 中间 Main Content -> 右侧 Secondary Sidebar
线程 / 项目 / 工作区       AI 对话主线程           上下文 / 文件 / Diff / 审批 / 状态
```

硬要求：

- 左侧是线程和项目导航，不是写作文件树，也不是设置中心。
- 中间是 AI 对话主线程和输入框，是第一主角。
- 右侧只放辅助上下文、文件、变更、审批和状态。
- API / Provider 配置只能走设置、模型中心或后续桌面配置工具，不默认占右侧栏，也不全屏打断首页。
- 底部终端 / 状态栏只在完整工作台或需要时出现，不在 Agent Home 首屏喧宾夺主。

## 2. 卡点与验证

| 卡点 | 成功标准 | 验证命令 / 证据 |
| --- | --- | --- |
| 首页布局 | `agent-home-focused` 存在；左侧栏、中间对话、右侧辅助栏同时存在；浏览器几何上中间对话区必须明显宽于两侧，右侧折叠栏保持窄栏；浏览器验收同时输出默认折叠态截图和状态展开态截图，避免把测试后半段的展开态误判为默认首页 | `npm run verify:phase2`、`npm run verify:phase2-agent-home-browser` |
| 左侧导航 | 支持新建自由对话、项目对话、新建项目、搜索、置顶/项目/自由筛选、归档入口 | `npm run verify:agent-home-sidebar` |
| 线程管理 | 线程行支持打开、置顶、重命名、分支、导出、归档、删除 | `npm run verify:agent-home-sidebar` |
| 左侧降噪 | 自由对话默认不显示“自由 / 不绑定目录”模式说明条；只有项目模式显示项目上下文条 | `npm run verify:phase2-agent-home`，左栏首屏 |
| 中间对话 | 输入框和附件入口清楚；模型不可用时默认不显示大块阻断提示，只保留轻量入口；状态文案必须区分“需要配置模型”“模型异常”“仅保存到线程”“模型可用”，不能把未配置和本地服务离线都混成“暂存模式”；只有“线程创建 / 线程恢复”这类元数据时，应显示轻量 starter，而不是让系统卡片占住主聊天区；starter 不使用大面积填充背景，避免变成新的仪表盘卡片 | `npm run verify:phase2-agent-home`、`npm run verify:agent-home-sidebar`，浏览器手动检查 |
| 右侧辅助栏 | 只保留上下文、文件、变更、审批、状态，不出现模型/API 配置标签；展开后顶部必须有可见的“回到对话”和“收起侧栏”出口，不能只靠小图标猜 | `npm run verify:agent-home-sidebar` |
| 右侧默认态 | 首屏右侧默认是窄工具栏，DOM 暴露 `data-panel-state="collapsed"`；只有用户点击文件 / 上下文 / Diff / 审批 / 状态，或任务产生需要审查的证据时才展开详情 | `npm run verify:phase2`、`npm run verify:phase2-agent-home-browser` |
| 右侧工具轨迹 | 状态页里的工具轨迹必须像任务链路而不是调试列表：每条可见工具行有 `home-tool-trace-next-step`，明确下一步是等待审批、审查 Diff、处理错误、等待运行还是继续推理 | `npm run verify:phase2-agent-home`、`npm run verify:phase4-agent-runtime` |
| 模型设置浮层 | 点击首页模型入口后，只出现白色轻量桌面浮层；宽度不超过 760px、距离顶部保留页面上下文、圆角克制；能填写自定义 baseURL / API key / 模型 ID，也能粘贴 cc switch / JSON 配置解析到草稿，再保存驱动首页对话；不得回到黑色全屏配置页、右侧栏配置页或旧模型抽屉 | `npm run verify:provider-config`、`npm run verify:phase2-agent-home-browser` |
| 公开边界 | 页面标题和公开文案仍是“织梦写作台 / Zhimeng Writing Agent”，不是 LumenOS-first | `npm run verify:phase2-agent-home` |

## 3. API 优先原则

Phase 2 可以且应该优先让首页围绕真实 API 对话工作，但 API 配置不能反过来霸占首页：

- 中间输入框优先服务 Provider API 对话；模型可用时发送给 AI，模型不可用时保存线程并给轻量入口。
- 模型状态文案要先帮用户判断原因：未填 API / 模型时显示“需要配置模型”，密钥或权限失败显示“模型异常”，本地端点离线显示“仅保存到线程”，配置可用时显示“模型可用”。
- API / Provider 配置只进入设置、模型中心或后续桌面配置工具，不作为右侧默认标签，也不全屏打断。
- 右侧辅助栏优先展示当前线程可消费的上下文、文件、Diff、审批和状态；不要把 Provider 调试项当成首屏主内容。
- 首页按钮必须指向真实链路：新对话、项目对话、附件、发送、线程管理、右侧上下文切换；不为尚未接通的能力堆占位按钮。

## 4. Spec 成功标准

Phase 2 不追求把所有能力塞进首页。Codex / Claude Code / VS Code 风格的重点不是按钮多，而是任务主线清楚：

1. 从左侧选择线程或项目。
2. 在中间直接对 AI 发任务。
3. 需要项目文件、Diff、审批、状态时，再看右侧辅助栏。
4. Provider、Skills、Memory、Worker、Automation 等高级能力放进设置、命令、右侧面板或完整工作台，不抢默认首页。

Phase 2 暂定硬成功标准：

1. 默认首页恢复后能直接看到线程 / 项目导航、AI 对话输入框和右侧辅助入口。
2. 首屏不出现多层“暂无”、大面积 Provider 配置、模型抽屉、写作专用首页或旧全页跳转。
3. 左侧线程和项目有可发现的管理动作，但默认视觉不拥挤；自由对话态不额外显示模式说明条，项目模式才显示项目上下文条。
4. 中间对话区可在无项目目录时启动普通对话，在项目模式下承接文件 / Diff / 审批链路；新线程只有系统元数据时要露出“需要我做什么？”轻量 starter。
5. 右侧辅助栏默认是窄工具栏，并用 `data-panel-state="collapsed"` 暴露状态；展开详情后要能直接点“回到对话”或“收起侧栏”，不把调试卡片、API 配置和运行日志堆满首屏。
6. 右侧状态里的工具轨迹每条可见行都要显示“下一步”，让用户知道该审批、看 Diff、等运行、处理错误，还是让模型继续推理。
7. 模型 / API 配置只作为轻量白色设置浮层出现，保留 Agent Home 背景上下文；浏览器门禁必须断言 `settings-modal-panel` 的宽度、顶部位置、白色背景和克制圆角。
8. 所有关键入口有稳定 `data-testid`，能被浏览器和脚本验证。
9. Phase 1 的 API 对话、附件、多模态、线程保存、Agent Loop Bridge、Diff / 审批验证继续通过。
10. 首页模型状态不能再用一个“暂存模式”覆盖所有不可用情况；左侧模型状态、输入框模型 pill、保存到线程横幅和发送按钮说明都要让用户知道是“需要配置模型”、密钥/权限异常，还是本地服务未连接。

## 5. 下一步

1. 用 `npm run verify:phase2` 守住 Agent Home 静态结构、左侧契约、生产构建和真实浏览器几何冒烟。
2. 用 `npm run verify:phase2-agent-home-browser` 单独复查真实浏览器冒烟，确认首页标题、三栏几何比例、右侧默认折叠、轻量白色模型设置浮层和截图产物：`phase2-agent-home-browser-collapsed.png` 是默认首页，`phase2-agent-home-browser-status-open.png` 是用户点击状态后的展开面板。
3. 继续做视觉打磨：白色 / Codex-like 主题、低噪音左栏、紧凑右栏、清晰的消息流。
4. 在不加乱按钮的前提下，逐步把项目模式、工具执行、Agent Loop、Memory、Skills 放进真实链路。

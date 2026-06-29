# 当前项目总审计 - 2026-06-26

这份审计用于回答老大的两个问题：

1. 现在项目到底做到哪了，有没有幻觉。
2. 离最终的 Codex / Claude Code / VS Code 风格个人 AI Agent 工作台还有多远。

本轮判断只按当前工作树、当前文档、当前截图和本轮重新执行过的命令算证据。旧上下文里曾经出现的 `LumenOS-first` 公开边界只作为历史背景，不作为当前产品边界。

## 1. 最新产品边界

- 公开入口、浏览器标题、README 首屏保持：`织梦写作台 / Zhimeng Writing Agent`。
- `灵枢 LumenOS` 只作为底层 Agent OS / Agent IDE 运行层语义，不作为公开第一产品名。
- 写作是重要内置能力，但不是产品天花板。
- 当前目标是中文 Personal AI Agent 工作台：对标 Codex / Claude Code / VS Code / Kiro / Devin / Manus 的任务线程、项目模式、工具调用、Diff、审批、上下文、记忆、Skills、Worker、Provider 和桌面化能力。

## 2. 本轮已读资料

本轮重新读取或抽取了：

- `继续上下文-织梦PersonalOS.md`
- `对话记忆-织梦PersonalOS.md`
- `C:\Users\30865\Downloads\AI编程Agent工具全景与复刻指南.docx`
- `C:\Users\30865\Downloads\Codex_5.5_UI复刻完整指南 (3).docx`
- `C:\Users\30865\Desktop\ai可借鉴源码`
- `C:\Users\30865\xwechat_files\wxid_6pnnot5t4c1w22_fd79\msg\file\2026-05\frontend(1).zip`
- 当前项目的 `README.md`、`docs/项目路线图.md`、阶段验收文档、`src/store/api-providers.ts`、`src/os/kernel/agent-loop.ts`、`src/components/AgentControlCenter.tsx` 等关键文件。

可执行结论：

- Agent 产品的核心不是聊天框，而是 `任务线程 -> 上下文组装 -> Provider API -> 工具请求 -> Gateway / Diff / 审批 -> 工具结果回灌 -> 继续推理`。
- UI 第一眼必须是清晰工作台，不是能力矩阵 dashboard。
- Provider / API 配置属于设置、模型中心或桌面配置工具，不应该默认占右侧栏或全屏打断。
- 项目模式必须围绕本地目录：绑定目录、扫描目录、读文件、挂上下文、生成 Diff、审批写入、写后复核、终端命令和运行日志。
- 参考源码和外部文档的价值在架构和交互拆解，落地仍按本项目结构重写。

## 3. 四个问题的当前答案

### 3.1 核心链路是什么

当前项目应该继续围绕这条主链路推进：

```text
用户输入 / 附件 / 图片
-> Agent 线程保存
-> 上下文打包：thread_context / workspace / memory / skills / runbook / instruction stack
-> Provider API 模型请求
-> 模型回复
-> 解析 <bridge-request>
-> Gateway 工具执行，或生成 Diff / 审批草案
-> 工具结果、审批结果、Diff 和运行证据回灌到线程
-> 模型继续推理或明确停止
```

本轮确认：这条链路已经写进 `docs/core-chain-calibration-20260620.md`，并由 `npm run verify:core-chain` 守门。

### 3.2 每个卡点怎么验证

当前项目已经有分层门禁：

| 卡点 | 本轮证据 |
| --- | --- |
| 核心四问 | `npm run verify:core-chain` 通过 |
| AI 对话、附件、多模态、Provider、线程保存 | `npm run verify:phase1-chat-core` 通过 |
| Agent Home UI | `npm run verify:phase2-agent-home` 和 `npm run verify:phase2-agent-home-browser` 通过 |
| Provider 配置边界 | `npm run verify:provider-config` 通过 |
| 项目模式文件链路 | `npm run verify:phase3-project-mode` 通过 |
| Agent Runtime / Loop / Memory / Skills / Worker | `npm run verify:phase4-agent-runtime` 通过 |
| 构建产物 | `npm run build` 通过 |

### 3.3 能不能优先用 API

能，而且应该继续优先：

- 普通聊天、模型列表、模型测试、附件文本、图片 / 多模态输入优先走 Provider API。
- 文件读写、目录扫描、命令、Diff、审批、Memory、Skills、Worker、MCP、Scheduler 走 Gateway / bridge contract。
- API 不可用时不能生成假回复；必须保留线程、显示失败原因、给设置和重试入口。
- Gateway 离线不能阻塞基础聊天，但本地文件 / 命令 / 审批类能力必须明确显示不可用或待授权。

### 3.4 Spec 文档有没有成功标准

有。当前成功标准主要分布在：

- `docs/core-chain-calibration-20260620.md`
- `docs/phase1-chat-acceptance-20260619.md`
- `docs/phase2-agent-home-acceptance-20260619.md`
- `docs/phase3-project-mode-acceptance-20260619.md`
- `docs/phase4-agent-runtime-acceptance-20260619.md`
- `docs/phase5-desktop-readiness-acceptance-20260619.md`
- `docs/项目路线图.md`

这些文档已经能回答“做什么、怎么验、什么时候算过”，但还需要持续防止旧上下文和旧术语把线程带回 `LumenOS-first` 或写作前端方向。

## 4. 当前真正完成了什么

### Phase 0：目标校准与止乱

状态：基本完成，仍需持续守门。

已完成：

- 最新公开边界已写入 README、路线图和核心校准文档。
- 核心四问有文档和脚本守门。
- 当前工作树的默认首页、Provider 配置边界、Agent Loop 和项目模式都不再是纯设计稿。

不足：

- 两份旧上下文前半段仍保留历史 `LumenOS-first` 表述，容易误导后续线程。
- `AgentControlCenter.tsx` 仍然过重，是维护和审美迭代风险。

当前完成度：约 82%。

### Phase 1：AI 对话、模型配置、附件、多模态

状态：当前验收范围内扎实通过，真实模型体验仍依赖用户配置。

已完成：

- `sendChat` / `sendRawChat` 是真实 Provider API 入口。
- Provider 层支持 OpenAI-compatible、Anthropic、Gemini、Ollama 基本请求形态。
- 附件、图片和多模态 parts 能进入模型请求。
- 模型发现、配置保存、鉴权失败、空回复守门、附件大小和元数据边界都有脚本覆盖。
- 本轮 `npm run verify:phase1-chat-core` 通过。

不足：

- “图片识别质量”取决于真实多模态模型，当前自动验收只能证明 image part 被发送。
- PDF / Office / 大型复杂文件的解析体验还不是最终成熟形态。
- API 配置工具已经有基础，但还需要更像 cc switch 的桌面一键配置体验。

当前完成度：约 72%。

### Phase 2：Codex / Claude Code / VS Code 风格 Agent Home

状态：骨架正确，观感还未达到 Codex 级。

已完成：

- 当前首页截图已经是：左侧线程 / 项目，中间 AI 对话主线程，右侧窄工具栏。
- API 配置没有默认占右侧或全屏打断。
- 左侧有项目、对话、置顶、线程管理；中间有空状态、消息流、输入框、附件；右侧有上下文、文件、Diff、审批、运行状态。
- 本轮 `npm run verify:phase2-agent-home`、`npm run verify:phase2-agent-home-browser` 通过，并刷新截图：
  - `.codex-runtime/phase2-agent-home-browser-collapsed.png`
  - `.codex-runtime/phase2-agent-home-browser-status-open.png`

不足：

- 当前截图方向对了，但还不够精致：空白比例、右侧图标解释、输入框视觉、状态条质感仍弱。
- 首屏仍有一点“能跑的工程 UI”气味，不是成熟 Codex / Claude Code 产品质感。
- 项目入口和对话入口仍可以更像 Codex 的任务列表和会话流。

当前完成度：约 68%。

### Phase 3：项目模式、文件、Diff、终端、审批、Gateway

状态：核心工具链可验证，成熟 IDE 文件体验不足。

已完成：

- 对话模式和项目模式已经明确区分。
- 项目模式绑定目录、`workspace_scan`、`read_file`、挂入上下文、生成 Diff、`write_file` 审批、`run_command` allowlist / 审批都有门禁。
- `read_file` 预览会进入下一轮模型请求，不只是停在右侧面板。
- `write_file` 不允许模型直写，必须先变成 Diff / 审批草案。
- 本轮 `npm run verify:phase3-project-mode` 通过。

不足：

- 目录监听、真实持续文件同步、多文件补丁、跨文件任务收束还不成熟。
- 终端仍偏受控命令入口和日志，不是完整 xterm + PTY 体验。
- 文件树体验还不像真正 VS Code / Codex 项目文件系统。

当前完成度：约 58%。

### Phase 4：Agent Loop、Memory、Skills、Worker、Runbook

状态：已经通电，但不是成熟自主 Agent。

已完成：

- `src/os/kernel/agent-loop.ts` 存在真实 `runAgentLoop`。
- 它能走 `context_pack -> Provider -> <bridge-request> -> Gateway / Diff / 审批 -> tool-result -> follow-up`。
- 只读工具可自动提交并回灌模型。
- `write_file` 转 Diff 草案，`run_command` 停在审批。
- Runbook、Instruction Stack、Memory、Skills 可以进入上下文。
- Worker、运行报告、线程作用域、审批续跑都有验证。
- 本轮 `npm run verify:phase4-agent-runtime` 通过。

不足：

- 多步复杂任务仍需要用户较多点击，不是稳定的“给目标后自动推进到完成”。
- 多文件 Diff、失败恢复、自动中断恢复、后台长期任务收束仍弱。
- Memory / Skills / Worker 还没达到自然自动路由、自动委派和自动回收结果的成熟水平。

当前完成度：约 48%。

### Phase 5：桌面 exe、Provider 工具、稳定性、产品体验

状态：有基础，不是正式完成。

已完成：

- 项目已有 desktop / provider switch / Bridge doctor / Gateway / PWA / build 相关基础。
- Provider 配置边界和桌面聊天冒烟在 Phase1 核心门禁里通过。
- 公开入口边界已收口。

不足：

- 本轮没有重跑完整 `npm run verify:phase5`。
- 本轮没有重新验证完整 EXE 打包、安装、启动、升级、错误恢复和真实桌面截图。
- Provider 配置工具还需要更顺手，不能长期依赖网页设置浮层。

当前完成度：约 42%。

## 5. 总体完成度

按最终目标“Codex / Claude Code / VS Code 风格个人超级 Agent 工作台 / 桌面 Agent IDE”估算：

| 维度 | 完成度 | 判断 |
| --- | ---: | --- |
| 方向校准 | 82% | 边界和门禁已回正，旧上下文仍有噪音 |
| AI 对话 | 72% | API、附件、图片传输、Provider 配置和失败边界有实证 |
| Agent Home UI | 68% | 三栏结构对了，产品质感仍不够 Codex |
| 项目模式 | 58% | 扫描、读文件、上下文、Diff、审批通了，IDE 文件体验还弱 |
| Agent Runtime | 48% | Agent Loop 已通电，但自主推进不成熟 |
| Memory / Skills / Worker | 48% | 能入模和回放，但自动编排不足 |
| 桌面产品化 | 42% | 有配置和打包基础，正式 EXE 产品体验未完成 |

综合完成度：约 58%。

更准确的判断：

```text
它已经不是“写作前端”或“纯设计稿”。
它是一个有真实 Provider、Gateway、Diff、审批、Agent Loop 门禁的 Agent 工作台雏形。
但它还不是成熟 Codex / Claude Code 级 Agent IDE。
```

## 6. 当前最大问题

1. UI 方向对了，但还不够好看、不够精致、不够 Codex。
2. `AgentControlCenter.tsx` 仍过重，后续会拖慢维护和审美迭代。
3. Agent Loop 已通，但复杂任务自动推进能力不足，仍像“按钮辅助的 Agent”。
4. 项目模式能跑链路，但还不像完整 IDE 文件系统。
5. Memory / Skills / Worker 还没有形成自然的自动编排。
6. Phase5 桌面正式体验没有在本轮重新验收，不能宣称完成。

## 7. 下一步最应该做什么

下一步不要开新大概念，也不要继续堆按钮。最优先做一个小目标：

```text
把默认首页的右侧窄栏做成更清楚的 Codex-like 辅助栏：
状态、上下文、文件、Diff、审批每个入口要一眼知道是什么；
展开后只显示当前线程最相关的下一步，不再像调试面板。
```

推荐执行顺序：

1. 固定当前首页主线：左侧线程 / 项目，中间 AI 对话，右侧上下文 / 文件 / Diff / 审批 / 状态。
2. 继续降低右侧面板噪音：只展示当前线程下一步和关键证据。
3. 优化消息流和输入框视觉：让它更像 Codex / Claude Code 的任务线程。
4. 运行层下一刀放在多文件 Diff / 审批 / 写后复核 / 继续推理闭环，不再新增概念页。

## 8. 本轮重新执行过的验证

本轮已重新执行并通过：

```bash
npm run typecheck
npm run verify:core-chain
npm run verify:phase1-chat-core
npm run verify:phase2-agent-home
npm run verify:phase2-agent-home-browser
npm run verify:provider-config
npm run verify:phase3-project-mode
npm run verify:phase4-agent-runtime
npm run build
```

本轮没有重新证明：

- 线上 GitHub Pages 已同步到当前本地 WIP。
- 完整 `npm run verify:phase5` 通过。
- 完整 EXE 打包、安装、启动、升级和错误恢复成熟。
- 每个真实第三方模型都能识图；当前只能证明多模态 image part 能进入请求。

## 9. 反幻觉结论

本轮不是凭记忆判断，也不是只看旧文档。本轮重新读取了上下文和参考资料，检查了当前代码，重新跑了核心门禁，并查看了当前浏览器截图。

所以当前可信结论是：

- 可以确认：核心链路、AI 对话、Provider 配置、首页结构、项目文件链路、Agent Runtime 在当前验收范围内真实存在且通过验证。
- 不能确认：最终产品已经完成、UI 已经完美复刻 Codex、桌面 exe 已经成熟、Agent 已能自动完成复杂任务。
- 下一步应该继续小步打磨默认首页和项目/运行链路，而不是新堆功能。

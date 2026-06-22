# 当前项目总审计 - 2026-06-22

这份审计只回答一个问题：当前项目离老大的最终目标到底有多远。结论必须以当前工作树、文档、脚本、浏览器截图和门禁结果为准，不再沿用旧的“写作前端 / 功能堆叠”惯性，也不把历史上下文里的 LumenOS-first 当成当前边界。

## 0. 最新边界

- 公开入口、浏览器标题、README 首屏继续保持：`织梦写作台 / Zhimeng Writing Agent`。
- `灵枢 LumenOS` 只能作为底层 Agent OS / Agent IDE 运行层，不作为公开产品第一标题。
- 写作是重要内置 Agent / domain，但不是产品天花板。
- 当前目标是中文 Personal AI Agent 工作台：对标 Codex / Claude Code / VS Code / Kiro / Devin / Manus 的任务线程、项目模式、工具调用、Diff、审批、上下文、记忆、Skills、Worker、Provider 和桌面化能力。

## 1. 本轮读入的资料

已读并纳入判断：

- `继续上下文-织梦PersonalOS.md`
- `对话记忆-织梦PersonalOS.md`
- `C:\Users\30865\Downloads\AI编程Agent工具全景与复刻指南.docx`
- `C:\Users\30865\Downloads\Codex_5.5_UI复刻完整指南 (3).docx`
- `C:\Users\30865\Desktop\ai可借鉴源码`
- `C:\Users\30865\xwechat_files\wxid_6pnnot5t4c1w22_fd79\msg\file\2026-05\frontend(1).zip`

吸收方式：

- 两份旧上下文里仍有 `LumenOS-first` 历史边界，本轮只继承 Agent IDE / Gateway / Memory / Skills / Worker / Provider / 审批等架构经验，不继承公开命名。
- 两份 docx 的共同结论是：核心产品不是 dashboard，而是三栏 Agent 工作台；优先级是聊天主线程、文件 / Diff、终端、审批、模型配置和任务循环。
- `frontend(1).zip` 的价值主要在 Provider / cc switch 类配置工具思路：粘贴配置、解析 key/baseURL/model、模型发现、保存启用。
- `ai可借鉴源码` 的价值主要在 Agent loop、权限闸门、上下文管道、工具池、subagent、hooks、MCP、provider proxy 等架构拆解；落地代码仍按本项目结构重写。

## 2. 四个问题的当前答案

### 2.1 核心链路是什么

当前项目的核心链路应固定为：

```text
用户输入 / 附件 / 图片
-> Agent 线程保存
-> 上下文打包：thread_context / workspace / memory / skills / runbook / instruction stack
-> Provider API 模型请求
-> 模型回复
-> 解析 <bridge-request>
-> Gateway 工具执行或 Diff / 审批草案
-> 工具结果回灌到线程、运行报告和模型后续 prompt
-> 模型继续推理或明确停止
```

这个链路已经写进 `docs/core-chain-calibration-20260620.md`，并由 `npm run verify:core-chain` 守门。

### 2.2 每个卡点怎么验证

当前项目已有阶段门禁：

| 卡点 | 当前证据 |
| --- | --- |
| 公开边界 | `README.md`、`index.html`、`verify:phase5` |
| 默认首页 | `verify:phase2`、`verify:phase2-agent-home-browser`、截图 `phase2-agent-home-browser-collapsed.png` |
| AI 对话 / 附件 / 图片 | `verify:phase1`、mock Provider 浏览器冒烟、附件多模态冒烟 |
| Provider 配置 | `verify:provider-config`、`verify:desktop-provider-chat` |
| 项目模式 | `verify:phase3`、`workspace_scan`、`read_file`、项目浏览器门禁 |
| Diff / 审批 | `verify:write-file-diff`、`verify:agent-loop-write-file`、`verify:gateway-command-approval` |
| Agent Loop | `verify:phase4`、read tool follow-up、approval resume、run replay |
| 桌面 / 配置工具 | `verify:phase5`、`verify:provider-switch` |

注意：这些脚本证明的是“当前验收范围内的链路没有回退”，不是证明最终产品已经完成。

### 2.3 能不能优先用 API

能，而且应该优先：

- 普通聊天、模型测试、模型列表、附件文本、图片 / 多模态输入优先走 Provider API。
- 文件读写、目录扫描、命令、Diff、审批、Memory、Skills、Worker、MCP、Scheduler 走 Gateway / bridge contract。
- API 不可用时不能生成假回复；必须保存线程、给模型设置和重试入口。
- Gateway 离线不能阻塞基础聊天；但本地文件 / 命令 / 审批类能力必须明确显示不可用或待授权。

### 2.4 Spec 文档有没有成功标准

有，而且当前已分散在：

- `docs/core-chain-calibration-20260620.md`
- `docs/phase1-chat-acceptance-20260619.md`
- `docs/phase2-agent-home-acceptance-20260619.md`
- `docs/phase3-project-mode-acceptance-20260619.md`
- `docs/phase4-agent-runtime-acceptance-20260619.md`
- `docs/phase5-desktop-readiness-acceptance-20260619.md`
- `docs/项目路线图.md`

本轮还修正了 `scripts/verify-core-chain-calibration.mjs`：它现在会把拆出去的 `WorkbenchComposer.tsx` 一起算入 Agent Home 表面，避免组件拆分后误判 `agent-thread-composer` 丢失。

## 3. 当前真正完成了什么

### Phase 0：目标校准与止乱

状态：基本完成，仍需持续守门。

已完成：

- 最新公开边界已写入 README、index、核心校准文档和阶段验收。
- 旧的 `LumenOS-first` 历史边界已经识别为旧上下文，不再作为当前产品入口。
- `docs/core-chain-calibration-20260620.md` 明确回答了四个问题。
- 阶段门禁能防止 API 配置回到右侧栏、首页回到 dashboard、写作变回唯一边界。

不足：

- 旧上下文文件仍保留历史表述，容易误导后续线程；当前策略是“不删历史，但用最新校准覆盖它”。
- `AgentControlCenter.tsx` 仍有 2 万多行，是长期维护风险。

完成度：约 80%。

### Phase 1：AI 对话、模型配置、附件、多模态

状态：当前验收范围内通过，但真实 Provider 体验还要继续实测。

已完成：

- `sendChat` / `sendRawChat` 是真实 Provider API 入口。
- 首页能通过轻量设置保存自定义 baseURL / API key / modelId。
- mock Provider 浏览器门禁覆盖 `/models`、保存配置、发送文本、文本附件、图片 data URL。
- 附件有大小守门和回执条，能区分进入模型请求 / 仅元数据 / 未进入模型请求。
- 图片不会在 Provider 失败时伪装成 Worker 摘要识别。
- 模型失败会给中文判断、设置和重试入口。

不足：

- 真实多模态识别质量依赖用户配置的模型，自动门禁只能证明 image part 发出，不能证明每个真实模型都会识图。
- PDF / docx / 复杂文件解析仍是分层能力，不等于所有格式都已高质量解析。
- 对话 UI 观感已经收敛，但还不够 Codex 级精致。

完成度：约 70%。

### Phase 2：Codex / Claude Code / VS Code 风格 Agent Home

状态：结构方向对了，审美和信息密度还要继续打磨。

已完成：

- 默认首页截图已呈现：左侧线程 / 项目，中间 AI 对话主线程，右侧窄工具栏。
- API / Provider 配置不再默认占右侧或全屏打断。
- 线程支持新建、搜索、筛选、置顶、重命名、分支、导出、归档、删除等契约。
- 右侧只保留上下文、文件、变更、审批、状态。
- 当前白色主题明显接近 Codex-like 工作台，不是旧写作首页。

不足：

- 首页仍偏空，消息区、右侧图标、输入框和状态条还不够高级。
- 右侧图标语义不够直观，第一次打开仍可能需要猜。
- 部分高级状态仍有“开发者味”，需要继续中文产品化。

完成度：约 65%。

### Phase 3：项目模式、文件、Diff、终端、审批、Gateway

状态：核心工具链通过，产品闭环还未达到成熟 IDE。

已完成：

- 项目模式区分自由对话和绑定目录。
- `workspace_scan`、`read_file`、文件预览、挂上下文、Diff 草案、写文件审批已有门禁。
- `write_file` 不允许模型直写，必须先 Diff / 审批。
- `run_command` 走 Gateway allowlist / 审批，不开放任意 shell。
- 项目工具证据能进入运行报告和回放。

不足：

- 目录监听、真实文件树持续同步、多文件补丁任务流、失败恢复还不完整。
- 终端还偏“受控命令入口 / 日志”，不是完整 xterm + PTY 体验。
- 文件树和项目目录体验还需要更像 VS Code / Codex 项目模式。

完成度：约 55%。

### Phase 4：Agent Loop、Memory、Skills、Worker、Runbook

状态：不是设计稿了，但还不是完全自主 Agent。

已完成：

- `runAgentLoop` 已存在，并接通 plan / context_pack / model / bridge-request / Gateway / tool-result / follow-up。
- 只读工具可自动提交并回灌模型。
- `write_file` 会转 Diff 草案，命令会停在审批。
- 审批后续跑状态和 prompt 已有门禁。
- Runbook、Instruction Stack、Memory、Skills 可进入上下文注入链路。
- Worker、运行报告、线程作用域、回放都有验证。

不足：

- 多步复杂任务仍需要大量人工点击，不是稳定的“给目标后自动推进到完成”。
- 多文件修改、失败恢复、自动中断恢复、后台长期任务收束仍是下一阶段重点。
- Memory / Skills / Worker 还没有达到自然自动路由、自动委派、自动回收结果的成熟程度。

完成度：约 45%。

### Phase 5：桌面 exe、Provider 工具、稳定性、产品体验

状态：桌面与 Provider 就绪门禁通过，但离“正式桌面产品”还有距离。

已完成：

- Provider switch 工具和桌面 Provider 配置到聊天冒烟已通过。
- Phase5 门禁会串 core-chain、Phase4 和桌面 / Provider readiness。
- README、PWA、公开入口边界已收口。
- Bridge / Gateway doctor 和 provider config 边界存在。

不足：

- 完整 EXE 启动、真实桌面截图、全部 profile doctor、安装/升级/错误恢复还需要一轮正式验收。
- Provider 配置工具还需要更顺手，不应长期依赖网页浮层。
- 审美、空状态、新手路径、设置分层仍未达到最终产品质感。

完成度：约 40%。

## 4. 总体完成度

按最终目标“个人超级 Agent 工作台 / 桌面 Agent IDE”估算：

| 维度 | 完成度 | 判断 |
| --- | ---: | --- |
| 方向校准 | 80% | 边界已经回正，门禁能守住，但旧上下文仍有噪音 |
| AI 对话 | 70% | API、附件、图片传输、失败恢复已有实证 |
| Agent Home UI | 65% | 三栏结构对了，审美和交互还没到 Codex 质感 |
| 项目模式 | 55% | 扫描、读文件、Diff、审批通了，持续同步和多文件任务还弱 |
| Agent Runtime | 45% | Agent Loop 已通电，但自主推进能力还不成熟 |
| Memory / Skills / Worker | 45% | 能进上下文和运行层，但自动编排不足 |
| 桌面产品化 | 40% | Provider 工具和门禁有了，正式 EXE 产品体验未完成 |

综合完成度：约 55%。

这不是“烂尾”，也不是“已经完成”。更准确地说：项目已经从“写作前端 + 概念堆叠”推进到“有真实门禁的 Agent 工作台雏形”，但还没有达到老大要的 Codex / Claude Code 级完整 Agent IDE。

## 5. 当前最大问题

1. `AgentControlCenter.tsx` 过重，虽然功能能跑，但维护和审美迭代风险很高。
2. UI 现在方向正确，但还不够精致：像轻量 Agent Home，而不是成熟 Codex。
3. Agent Loop 有真实链路，但复杂任务仍不够自动，容易变成“按钮驱动的 Agent”。
4. 项目模式能扫描和读写审批，但还不像真正 IDE 文件系统。
5. Memory / Skills / Worker 有入口和上下文注入，但还没变成自然调度。
6. 旧文档、旧命名、旧运行产物很多，容易让后续线程误判当前边界。

## 6. 下一步最优先

不要继续新建大功能。下一步只做一个方向：

**把默认首页继续打磨成更像 Codex 的 Chat-first Agent Home。**

具体小目标：

1. 继续降低右侧栏噪音：图标含义更清楚，展开面板更像任务辅助，不像调试卡片。
2. 优化中间消息流：空状态、用户消息、AI 回复、工具轨迹、附件卡统一成更自然的对话体验。
3. 保持 API 配置在轻量设置，不回右侧，不全屏。
4. 不新增按钮，优先重排、隐藏、合并、改文案。
5. 每次改完跑：

```bash
npm run verify:phase2-agent-home
npm run verify:provider-config
npm run verify:phase2-agent-home-browser
```

如果要推进底层能力，则下一步不是再加面板，而是加强 Agent Loop 的“多文件 Diff -> 审批 -> 写后复核 -> 继续推理”闭环。

## 7. 本轮验证结果

本轮已验证通过：

```bash
npm run typecheck
python -m py_compile bridge\zhimeng_bridge.py bridge\healthcheck_bridge.py
npm run verify:core-chain
npm run verify:phase2-agent-home
npm run verify:provider-config
npm run verify:phase1
npm run verify:phase3
npm run verify:phase4
npm run verify:phase5
```

浏览器截图产物：

- `.codex-runtime/phase2-agent-home-browser-collapsed.png`
- `.codex-runtime/phase2-agent-home-browser-status-open.png`

注意：Phase4 / Phase5 曾在并行运行时因为两个浏览器门禁抢同一个 DevTools 端口失败；顺序重跑后通过。这说明以后浏览器门禁不要并行跑。

## 8. 二次反幻觉复验 - 2026-06-22 晚

本节只记录当前对话里重新执行过的证据，避免把历史记忆、旧线程总结或未重跑脚本误当成当前事实。

### 8.1 当前重新确认的事实

- `src/os/kernel/agent-loop.ts` 存在真实 `runAgentLoop`，不是只有 TypeScript 设计稿。
- `package.json` 仍保留 Agent Loop、Run Replay、Provider、Phase 2、Phase 4 等关键门禁脚本。
- `src/components/AgentControlCenter.tsx` 仍保留首页 `配置模型` 主动作，点击后进入轻量模型设置链路。
- 默认首页浏览器截图仍是左侧线程 / 项目、中间 AI 对话、右侧窄工具栏的 Agent Home，不是旧写作首页，也不是 API 配置全屏页。

### 8.2 当前重新跑过并通过的命令

```bash
npm run verify:agent-loop-read-tool
npm run verify:agent-run-replay
npm run verify:provider-config
npm run verify:phase4-agent-runtime
npm run typecheck
npm run verify:phase2-agent-home
npm run verify:phase1-chat-acceptance
npm run build
npm run verify:core-chain
npm run verify:phase2-agent-home-browser
```

浏览器门禁重新生成截图：

- `.codex-runtime/phase2-agent-home-browser-collapsed.png`
- `.codex-runtime/phase2-agent-home-browser-status-open.png`

### 8.3 这轮没有重新证明的事

- 没有重新证明线上 GitHub Pages 已同步到这些本地 WIP。
- 没有重新证明真实第三方 Provider 的每个模型都支持图片识别；本轮只能证明 mock Provider 收到 image part / data URL。
- 没有重新证明完整 EXE 安装、启动、升级和错误恢复体验已经成熟。
- 没有重新证明项目模式已经达到完整 VS Code 文件系统体验；当前证据仍停留在扫描、读文件、挂上下文、Diff、审批和门禁链路。

### 8.4 本轮重新校准后的下一刀

继续做小步、可验证的改动，不再新堆大面板：

1. 默认首页优先继续打磨 Codex-like 的对话主体验：消息流、空状态、输入框、附件回执和工具轨迹。
2. Provider/API 继续留在轻量设置或配置工具，不回到右侧默认栏，也不做全屏打断。
3. 底层能力优先强化 Agent Loop 的多文件 Diff、审批、写后复核、继续推理闭环，而不是新增抽象概念页。
4. 每次 UI 改动至少重跑 `verify:phase2-agent-home`、`verify:provider-config`、`verify:phase2-agent-home-browser`；每次运行层改动至少重跑 `verify:phase4-agent-runtime`。

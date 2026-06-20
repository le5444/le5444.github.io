# Phase 1 AI Chat Acceptance - 2026-06-19

这份文件只回答四个问题，作为 Phase 1 继续开发的验收尺子：核心链路是什么、每个卡点怎么验证、能不能优先用 API、spec 文档里有没有成功标准。

## 1. 核心链路

Phase 1 的核心链路不是 UI 面板，也不是写作工具集合，而是一次任务从输入到结果的最短闭环：

```text
用户输入 / 附件
-> Agent 线程保存
-> API Provider 模型请求
-> 模型回复
-> 解析 <bridge-request>
-> Gateway / Diff / 审批
-> 工具结果回灌到线程
-> 模型继续推理或停止
```

当前代码里的权威入口：

- `src/store/settings.ts`：`sendChat` / `sendRawChat` 是 API Provider 请求入口。
- `src/components/AgentControlCenter.tsx`：`sendAgentThreadMessage` 是首页发送入口，`runAgentDirectChat` 是直接对话和工具请求回灌入口。
- `src/os/kernel/agent-loop.ts`：`runAgentLoop` 是计划、上下文、工具、Gateway、结果回灌的内核循环入口。
- `src/utils/executor-bridge.ts`：`<bridge-request>` 解析和工具协议边界。

## 2. 卡点与验证

一键核心验证：

```bash
npm run verify:phase1
npm run verify:phase1-chat-core
```

`verify:phase1` 是推荐入口，当前会依次跑 `verify:phase1-chat-core`、`typecheck` 和 `build`。这条命令覆盖 Phase 1 主链路的自动化部分：验收文档、首页 Provider 边界、线程保存、API 对话 / 多模态传输、本地 mock API 真实 HTTP 冒烟、模型测试空回复守门、桌面 Provider 配置到聊天冒烟、附件解析、Bridge 协议、Agent Loop Bridge 回灌协议、写文件 Diff、命令审批、Gateway 命令审批、审批续跑、项目文件读链路、TypeScript 类型检查和生产构建。真实 Provider 回复质量、图片识别质量和浏览器交互仍需要手动试发确认。

| 卡点 | 成功标准 | 验证命令 / 证据 |
| --- | --- | --- |
| 模型配置 | 可保存、激活、读取模型列表、测试对话；测试对话空回复不能算成功；前端 Provider 预设与 Gateway 预设一致；模型发现历史只保存模型名称和密钥存在状态，不恢复或回显 API 密钥；模型配置不占默认右侧栏 | `npm run verify:provider-config`、`npm run verify:agent-home-sidebar`、`npm run verify:model-test-empty-reply`，Provider 中心 UI |
| Agent 线程保存 | 用户消息、附件、运行事件、审批和上下文附件能沉淀到可恢复线程；真实页面刷新后仍能看到用户消息和 AI 回复 | `npm run verify:agent-thread-store`，浏览器刷新持久化冒烟 |
| 普通对话 | 文本能进入 API Provider；本地 mock API 可收到真实 HTTP 请求并返回流式回复；模型回复写回线程；桌面 Provider 配置可通过 Gateway 导入并直接驱动聊天；模型不可用时只保存消息并给轻量入口；空回复不能标记为完成；鉴权/权限类 4xx 错误不能被 non-stream fallback 掩盖 | `npm run verify:agent-chat`、`npm run verify:agent-chat-api-smoke`、`npm run verify:desktop-provider-chat`，手动发送一条文本 |
| 附件 / 图片 | 文本文件抽取片段；图片作为 multimodal / vision part 进入模型请求；日志明确说明进入了什么；本地 mock Provider 可记录到文本片段和 image_url；超大附件必须在进入模型请求前被拒绝并提示“未进入模型请求”；图片请求失败时不能静默降级成只含文字摘要的 Worker 回复 | `npm run verify:agent-attachment`、`npm run verify:agent-chat`、`npm run verify:agent-chat-attachment-api-smoke` |
| 工具请求 | 模型输出 `<bridge-request>` 后可解析；只读工具可走 Gateway；结果能回灌继续推理；直接对话每轮工具结果要形成 `replay_rows`，进入 Tool Trace / 运行报告 | `npm run verify:executor-bridge`、`npm run verify:agent-chat`、`npm run verify:agent-run-replay`、`npm run verify:agent-loop-bridge`、`npm run verify:agent-loop-read-tool` |
| 写文件 | `write_file` 不能模型直写；必须转 Diff 草案，再进入审批 / Gateway | `npm run verify:write-file-diff`、`npm run verify:agent-loop-write-file` |
| 命令执行 | 不能开放任意 shell；必须走 Gateway、allowlist、审批或明确 gate | `npm run verify:agent-loop-command`、`npm run verify:gateway-command-approval` |
| 项目文件 | 项目模式要能绑定目录、扫描、读取预览、挂入上下文、生成 Diff 草案 | `npm run verify:workspace-root`、`npm run verify:workspace-scan`、`npm run verify:workspace-read` |
| Agent Loop | 不停在一次 `sendChat`；必须有 plan/context/tool/result/follow-up 的可测链路 | `npm run verify:agent-loop`、`npm run verify:agent-loop-bridge`、`npm run verify:agent-loop-read-write` |
| 审批后续跑 | 审批结果能形成可续跑状态，继续注入原任务 | `npm run verify:agent-loop-resume`、`npm run verify:agent-loop-resume-prompt` |

## 3. API 优先原则

Phase 1 可以且应该优先用 API。原因：

- 普通聊天、附件文本、图片 / 多模态、模型测试都属于 Provider/API 链路，能最快证明“AI 对话可用”。
- Gateway 不应该阻塞基础聊天；Gateway 只负责本地文件、命令、Diff、审批、Memory、Worker、Provider 探针等受控动作。
- 模型不可用时，首页不应全屏打断，也不应把 API 配置塞回右侧栏；只保存线程消息，并给“模型中心 / 设置”轻量入口。
- 本地模型是 Provider 的一种，不是默认假设。没有本地模型时不应让用户以为已经能回复。

## 4. Spec 成功标准

现在已有方向性 spec，但成功标准还不够硬：

- `docs/agent-workbench-calibration-20260618.md` 给出 P0/P1/P2 方向。
- `docs/phase0-audit-20260618.md` 区分已跑通、未跑通和止损清单。
- `docs/Personal-OS-Roadmap.md` 有阶段验收门，但范围偏大。

Phase 1 的硬成功标准暂定为：

1. 打开首页，第一主角是 AI 对话线程，不是写作前端、模型配置页或调试仪表盘。
2. 无项目目录时，也能发起普通 API 对话，并保存线程。
3. 可添加文件和图片；可在日志或线程事件里确认哪些内容进入模型请求；超大附件被拒绝时必须说明未进入模型请求。
4. 模型返回工具请求时，能解析并按权限交给 Gateway；失败时有可读状态；工具结果不只写入续答 prompt，还要进入可审计 Tool Trace / 运行报告。
5. 文件写入永远先变成 Diff / 审批，不允许模型直接落盘。
6. API / Provider 配置只在模型中心、设置或后续桌面配置工具中处理，不默认占右侧栏或全屏打断。
7. 至少通过 `npm run verify:phase1`，再按需要补手动发送文本、图片和项目文件任务。

## 5. 下一步执行顺序

1. 先跑通并守住 API 对话、附件、多模态、线程保存。
2. 再补直接对话里的工具请求回灌体验，让用户看见“AI 请求了什么、结果是什么、下一步为什么停住”。
3. 再把项目模式的绑定目录、扫描、读文件、Diff、审批统一成一条任务流。
4. 最后才继续做 Skills、Memory、Worker、Subagent 的自动编排。

## 6. 手动冒烟测试

自动脚本只能证明协议、解析、状态和本地工具链路；真实 Provider、浏览器交互和图片识别仍要手动试发。

Phase 1 每次大改后至少手动跑这 5 个用例：

1. **纯文本 API 对话**：配置一个真实可用 Provider，发送“用一句中文回复：织梦连接成功”。成功标准：线程里出现用户消息和 AI 回复；没有跳到全屏配置页；模型状态只作为轻量入口出现；如果模型返回空内容，本次显示为失败/可重试，不标记为完成。
2. **模型不可用暂存**：清空或填错模型配置后发送一句话。成功标准：用户消息被保存到线程；不生成假回复；页面只提示去模型中心修复，可稍后重试。
3. **文件附件**：上传一个 `.md` 或 `.txt` 文件并让 AI 总结。成功标准：运行日志或线程事件能看到文件片段进入模型请求；AI 回复引用的是附件内容，不是空泛说明。
4. **图片 / 多模态**：上传一张简单截图或图片并询问画面内容。成功标准：图片以 multimodal / vision part 进入模型请求；如果当前模型不支持图片或直连失败，界面要能说明限制，不能自动降级成只含文字摘要的 Worker 回复，更不能假装已识别。
5. **工具请求回灌**：让模型读取一个项目文件或生成写文件请求。成功标准：`read_file` 类请求可进入 Gateway 并回灌；`write_file` 必须先变成 Diff / 审批，不直接落盘。

## 7. 当前浏览器证据

2026-06-19 已用构建产物 `npm run preview -- --host 127.0.0.1 --port 5185` 做一次独立 origin 冒烟：

- 页面标题为 `织梦写作台 / Zhimeng Writing Agent`。
- 默认页存在 `agent-home-focused`、`agent-thread-composer`、`agent-send-button`、`agent-home-composer-attachment-input` 和 `agent-home-side-tabs`。
- 右侧轻量标签为上下文、文件、变更、审批、状态；API / Provider 配置没有占默认右侧栏。
- 首页输入区的模型入口打开轻量 `接口设置` 弹窗，底层仍保持 Agent Home；不会跳到完整 Provider 工作台或占满右侧栏。
- 模型未配置时发送 “UI 冒烟：模型未连接时请只保存这条消息，不要生成假回复。”，输入框会清空，用户消息进入线程，并显示 “已保存，等待模型连接：模型配置不完整，请打开模型设置填写模型地址、模型 ID 和必要密钥。”。
- 同一次冒烟没有出现 `模型没有返回可显示内容`、`zhimeng-api-ok` 或 `fallback-ok` 这类假回复。

2026-06-19 又用本机 mock OpenAI-compatible 服务做了一次配置后真实回复冒烟：

- `node scripts/smoke-openai-compatible-server.mjs 5191` 提供本机 `/v1/models` 与 `/v1/chat/completions`。
- 通过首页轻量 `接口设置` 弹窗保存 `http://127.0.0.1:5191/v1`、`smoke-model`、本地测试 key 后，模型 pill 从 `待配置` 变为 `本地冒烟模型`。
- 发送按钮语义从 `保存` 变成 `发送给 AI`，提示为“会把本条消息、附件和会话上下文发送给当前模型，并生成 AI 回复。”
- 从首页发送“请回复：浏览器模型配置冒烟。”后，线程出现用户消息和助手回复“浏览器模型配置冒烟成功。”，输入框清空，没有进入 Worker 兜底或失败状态。

同日补了浏览器刷新持久化冒烟：

- 使用隔离临时页面 `http://127.0.0.1:5196/?phase1-persistence=1` 和 mock OpenAI-compatible 服务 `http://127.0.0.1:5197/v1`。
- 通过首页轻量 `接口设置` 保存 `本地冒烟模型`、`smoke-model` 和本地测试 key 后，从 `agent-thread-composer` 发送唯一标记消息 `Phase1 刷新持久化 1781875259877`。
- 发送后页面同时出现用户消息和助手回复 `浏览器模型配置冒烟成功。`。
- 执行同页刷新后，`agent-home-focused` 仍存在，浏览器标题仍为 `织梦写作台 / Zhimeng Writing Agent`，同一条用户消息和助手回复仍可见。

同日补了请求级附件冒烟：`npm run verify:agent-chat-attachment-api-smoke` 会解析一个 `.txt` 和一张 PNG，组装 Agent 对话请求并发送到本机 mock Provider；mock 的 `/__last-chat` 记录证明请求包含 `phase1-notes.txt` 的文本片段、线程上下文和 1 个 OpenAI-compatible `image_url` 图片 part。

同日补了附件大小守门：`npm run verify:agent-attachment` 覆盖 `validateAgentAttachmentFile`。小附件进入解析队列；超过 `MAX_THREAD_ATTACHMENT_BYTES` 的附件会在发送前被阻断，并返回“未进入模型请求”，避免大文件拖垮 API / 多模态链路。

同日补了桌面 Provider 配置到聊天冒烟：`npm run verify:desktop-provider-chat` 会启动本机 mock OpenAI-compatible 服务，用 `desktop/zhimeng_provider_switch.py apply` 写入临时 `provider-settings.json`，再通过 Gateway `provider_config_status` 显式导入配置，最后复用 `sendChatViaProvider` 发送真实 HTTP 对话。成功标准是 mock Provider 收到 `smoke-model`、鉴权只以 header 存在、诊断不回显 API key，并返回“浏览器模型配置冒烟成功。”。

同日补了图片失败态策略：`npm run verify:agent-chat` 覆盖 `decideAgentDirectChatFallback`。纯文本直连失败时可切换 Gateway 模型 Worker 兜底；停止生成、Gateway 离线、鉴权失败和包含图片 dataUrl 的多模态请求都不会自动兜底。图片失败态会提示“不会降级成只含文字摘要的 Worker 回复”，避免把图片识别能力伪装成摘要能力。

同日补了空回复失败态策略：`npm run verify:agent-chat` 覆盖 `decideAgentModelReplyContent`。模型首轮返回空内容时不会把“模型没有返回可显示内容”写成 completed；工具回灌后的空续答会标记为 partial/error 语义，并提示检查模型输出、流式接口或重试。

同日补了模型测试空回复守门：`npm run verify:model-test-empty-reply` 检查 `runDirectModelTest` 必须复用 `decideAgentModelReplyContent`。模型配置测试如果拿到空回复，会进入失败路径，不再把“模型返回为空。”当成测试成功样本。

同日补了 API 鉴权失败守门：`npm run verify:agent-chat-api-smoke` 会让 mock Provider 对 `auth-fail-model` 返回 401。成功标准是 `sendChatViaProvider` 抛出包含 401 和 provider error code 的错误，并且 mock 只收到 1 次 stream 请求，不再额外发起 non-stream fallback。

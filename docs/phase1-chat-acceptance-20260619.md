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

`verify:phase1` 是推荐入口，当前会先跑 `typecheck` 和 `build`，再跑 `verify:phase1-chat-core`。这条命令覆盖 Phase 1 主链路的自动化部分：验收文档、首页 Provider 边界、线程保存、API 对话 / 多模态传输、本地 mock API 真实 HTTP 冒烟、浏览器自定义 Provider 配置后真实发送、模型测试空回复守门、桌面 Provider 配置到聊天冒烟、附件解析、Bridge 协议、Agent Loop Bridge 回灌协议、写文件 Diff、命令审批、Gateway 命令审批、审批续跑、项目文件读链路、TypeScript 类型检查和生产构建。真实 Provider 回复质量和图片识别质量仍需要手动试发确认。

| 卡点 | 成功标准 | 验证命令 / 证据 |
| --- | --- | --- |
| 模型配置 | 可保存、激活、读取模型列表、测试对话；首页轻量设置可直接填写自定义 baseURL / API key / 模型 ID，也可把 cc switch / JSON / 普通文本里的 `baseURL`、`apiKey`、`modelId` 粘贴进去解析到草稿，并能从自定义 API 区域点“保存 API 配置”立即驱动首页对话；模型中心同样可以直接粘贴新的 API key，保存、模型列表探针和模型测试都优先使用本次草案密钥，留空则沿用已保存密钥且不明文回显；设置弹窗只有一套 API/key 主入口；模型发现优先走 Gateway，Gateway 不可用时可尝试浏览器直连 `/models`；发现模型要先“填入草稿”，再点“保存 API 配置”让首页生效；设置面板必须显示“当前首页正在使用”的 Provider 状态，并区分“已保存生效 / 草稿未保存 / 待保存”；测试对话空回复不能算成功；前端 Provider 预设与 Gateway 预设一致；模型发现历史只保存模型名称和密钥存在状态，不恢复或回显 API 密钥；模型配置不占默认右侧栏，不全屏打断，并以白色轻量桌面浮层呈现 | `npm run verify:provider-config`、`npm run verify:agent-home-sidebar`、`npm run verify:phase1-browser-chat`、`npm run verify:phase2-agent-home-browser`、`npm run verify:model-test-empty-reply`，Provider 中心 UI |
| Agent 线程保存 | 用户消息、附件、运行事件、审批和上下文附件能沉淀到可恢复线程；自由对话必须落在 `unbound` 线程空间，不强制绑定项目目录；真实页面刷新后仍能看到用户消息、AI 回复、文本附件卡和图片附件卡 | `npm run verify:agent-thread-store`，浏览器刷新持久化冒烟 |
| 普通对话 | 文本能进入 API Provider；本地 mock API 可收到真实 HTTP 请求并返回流式回复；模型回复写回线程；浏览器内保存自定义 Provider 后可从首页直接发送并收到回复；桌面 Provider 配置可通过 Gateway 导入并直接驱动聊天；模型不可用时只保存消息并给轻量入口；空回复不能标记为完成；鉴权/权限类 4xx 错误不能被 non-stream fallback 掩盖；401/403/404/网络失败要给中文判断和下一步，至少能引导用户回到“模型设置”修复并“重试” | `npm run verify:agent-chat`、`npm run verify:agent-chat-api-smoke`、`npm run verify:phase1-browser-chat`、`npm run verify:desktop-provider-chat`，手动发送一条文本 |
| 附件 / 图片 | 文本文件抽取片段；图片作为 multimodal / vision part 进入模型请求；日志明确说明进入了什么；本地 mock Provider 可记录到文本片段和 image_url；真实首页上传文本附件 + 图片后点击发送，mock Provider 的 `/__last-chat` 必须记录文本附件文件名、文本片段、`image_url` 和图片 data URL；超大附件必须在进入模型请求前被拒绝并提示“未进入模型请求”；图片请求失败时不能静默降级成只含文字摘要的 Worker 回复 | `npm run verify:agent-attachment`、`npm run verify:agent-chat`、`npm run verify:agent-chat-attachment-api-smoke`、`npm run verify:phase2-agent-home-browser` |
| 首页附件回执 | 上传或粘贴附件后，默认首页输入框下方必须出现 `agent-home-composer-attachment-receipt`；它要标明“进入模型请求 / 仅摘要/元数据 / 未进入模型请求”，并暴露图片数、文本片段数和是否有模型 payload，避免用户误以为选择文件就等于模型已读取正文 | `npm run verify:agent-home-sidebar`、浏览器手动上传文件/图片 |
| 工具请求 | 模型输出 `<bridge-request>` 后可解析；只读工具可走 Gateway；结果能回灌继续推理；聊天里的工具请求 / 工具结果卡必须显示“下一步”，说明是交给 Gateway、等待审批、审查 Diff、处理失败还是继续推理；直接对话每轮工具结果要形成 `replay_rows`，进入 Tool Trace / 运行报告；运行报告回放行本身也必须显示“下一步”，不能只留下状态码和调试摘要 | `npm run verify:executor-bridge`、`npm run verify:agent-chat`、`npm run verify:agent-run-replay`、`npm run verify:agent-loop-bridge`、`npm run verify:agent-loop-read-tool` |
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
6. API / Provider 配置只在模型中心、设置或后续桌面配置工具中处理，不默认占右侧栏或全屏打断。首页空状态必须把“配置模型”放进主动作；点击后打开轻量设置，并能看到自定义 API key 输入框。
7. 首页模型设置必须是轻量白色桌面浮层：面板宽度受限、背景仍能看到 Agent Home、不能退回黑色全屏配置页；这条由 `npm run verify:phase2-agent-home-browser` 的真实浏览器几何和样式断言覆盖。
8. 至少通过 `npm run verify:phase1`；默认首页的自定义 Provider 保存 + 真实 UI 发送链路必须由 `npm run verify:phase1-browser-chat` 覆盖，再按需要补真实 Provider 的手动文本、图片和项目文件任务。
9. 失败消息必须提供模型设置和重试入口；用户看到 `AI 请求失败`、`请求失败`、鉴权错误或模型未连接时，不能只剩复制按钮或无声失败。401 必须解释为“密钥没有通过认证”，403 必须指向权限 / 额度 / 白名单，404/405 必须指向 baseURL 或模型 ID，网络失败必须指向 baseURL / 代理 / 防火墙 / 本地服务；消息里要出现“下一步”，并说明保存后点“重试”继续。

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

2026-06-20 已把本机 mock OpenAI-compatible 服务升级为自动浏览器门禁：`npm run verify:phase2-agent-home-browser` 会启动 mock Provider、打开构建产物、通过首页轻量设置保存自定义 API 配置，再从首页发送真实对话。

- `scripts/verify-phase2-agent-home-browser.mjs` 启动 `scripts/smoke-openai-compatible-server.mjs`，提供本机 `/v1/models` 与 `/v1/chat/completions`。
- 设置浮层必须先通过“粘贴配置并解析”把包含 `baseURL`、`apiKey`、`provider`、`model` 的配置片段填入草稿；浏览器门禁会检查解析提示“已解析并填入草稿”、草稿 URL/key/model/provider，以及解析动作不会自动保存或请求模型。
- 首页空状态必须出现 `agent-home-starter-config-model` 主动作，文字为“配置模型”；浏览器门禁会优先点击这个入口打开轻量设置，而不是依赖底部模型 pill 或隐藏入口。
- 通过首页轻量 `接口设置` 弹窗填写 `http://127.0.0.1:<port>/v1` 和本地测试 key，点击“获取账号模型”读取 mock `/v1/models`，再点“填入草稿”；模型卡会显示“草稿已选，保存 API 配置后首页生效”。
- 同一门禁会故意输入带前后空格的 baseURL 和 API key；点击“保存 API 配置”后，本地设置必须保存为去掉空格和尾部 `/` 的干净值，避免复制 key 后看似已填但鉴权失败。
- 端点模板默认保持折叠，并明确写成“不是模型清单”；模板卡只提示“只填端点模板，模型从账号读取”，不能再把 placeholder 模型 ID 当成可选模型展示。
- 点击自定义 API 区域里的“保存 API 配置”后，localStorage 中能读到自定义 `apiUrl`、`apiKey`、`modelId` 和 `provider`。
- 设置弹窗顶部会显示“当前首页正在使用”的 Provider 状态，并区分已保存生效、草稿未保存和待保存，避免填完 key 后不知道是否生效。
- 保存后模型 pill 显示 `Browser Smoke Model` 或 `smoke-model`，即使本地模型检测仍在进行，也不能让用户误以为配置没有保存。
- 同一浏览器门禁还检查 `settings-modal-panel` 是白色轻量桌面浮层：宽度不超过 760px、距离顶部保留页面上下文、背景色为白色、圆角不超过 14px，避免 API 配置重新变成黑色全屏或右侧栏占位。
- 从首页 composer 发送“请回复浏览器模型配置冒烟。”后，线程出现助手回复“浏览器模型配置冒烟成功。”，mock Provider 的 `/__last-chat` 证明请求带着 `smoke-model`、Authorization header 和用户输入文本。
- 同一浏览器门禁还会上传 `phase2-receipt.txt` 和 `phase2-image.png` 后真实点击发送；mock Provider 的 `/__last-chat` 证明首页请求包含文本附件文件名、`文件片段进入模型请求` 文本片段、至少 1 个 `image_url` part 和 `data:image/png;base64,...` 图片 data URL。

同日补了浏览器刷新持久化冒烟：

- 使用隔离临时页面 `http://127.0.0.1:5196/?phase1-persistence=1` 和 mock OpenAI-compatible 服务 `http://127.0.0.1:5197/v1`。
- 通过首页轻量 `接口设置` 保存 `本地冒烟模型`、`smoke-model` 和本地测试 key 后，从 `agent-thread-composer` 发送唯一标记消息 `Phase1 刷新持久化 1781875259877`。
- 发送后页面同时出现用户消息和助手回复 `浏览器模型配置冒烟成功。`。
- 执行同页刷新后，`agent-home-focused` 仍存在，浏览器标题仍为 `织梦写作台 / Zhimeng Writing Agent`，同一条用户消息和助手回复仍可见。
- 2026-06-20 又把刷新持久化纳入 `npm run verify:phase2-agent-home-browser`：真实首页发送文本附件 + 图片后刷新，仍必须看到用户消息、AI 回复、`phase2-receipt.txt` 文本附件卡、`phase2-image.png` 图片附件卡，并确认 `zhimeng-agent-thread-spaces` 里存在 `unbound` 自由对话空间。

同日补了请求级附件冒烟：`npm run verify:agent-chat-attachment-api-smoke` 会解析一个 `.txt` 和一张 PNG，组装 Agent 对话请求并发送到本机 mock Provider；mock 的 `/__last-chat` 记录证明请求包含 `phase1-notes.txt` 的文本片段、线程上下文和 1 个 OpenAI-compatible `image_url` 图片 part。

同日补了附件大小守门：`npm run verify:agent-attachment` 覆盖 `validateAgentAttachmentFile`。小附件进入解析队列；超过 `MAX_THREAD_ATTACHMENT_BYTES` 的附件会在发送前被阻断，并返回“未进入模型请求”，避免大文件拖垮 API / 多模态链路。

同日补了桌面 Provider 配置到聊天冒烟：`npm run verify:desktop-provider-chat` 会启动本机 mock OpenAI-compatible 服务，用 `desktop/zhimeng_provider_switch.py apply` 写入临时 `provider-settings.json`，再通过 Gateway `provider_config_status` 显式导入配置，最后复用 `sendChatViaProvider` 发送真实 HTTP 对话。成功标准是 mock Provider 收到 `smoke-model`、鉴权只以 header 存在、诊断不回显 API key，并返回“浏览器模型配置冒烟成功。”。

同日补了图片失败态策略：`npm run verify:agent-chat` 覆盖 `decideAgentDirectChatFallback`。纯文本直连失败时可切换 Gateway 模型 Worker 兜底；停止生成、Gateway 离线、鉴权失败和包含图片 dataUrl 的多模态请求都不会自动兜底。图片失败态会提示“不会降级成只含文字摘要的 Worker 回复”，避免把图片识别能力伪装成摘要能力。

同日补了空回复失败态策略：`npm run verify:agent-chat` 覆盖 `decideAgentModelReplyContent`。模型首轮返回空内容时不会把“模型没有返回可显示内容”写成 completed；工具回灌后的空续答会标记为 partial/error 语义，并提示检查模型输出、流式接口或重试。

同日补了模型测试空回复守门：`npm run verify:model-test-empty-reply` 检查 `runDirectModelTest` 必须复用 `decideAgentModelReplyContent`。模型配置测试如果拿到空回复，会进入失败路径，不再把“模型返回为空。”当成测试成功样本。

同日补了 API 鉴权失败守门：`npm run verify:agent-chat-api-smoke` 会让 mock Provider 对 `auth-fail-model` 返回 401。成功标准是 `sendChatViaProvider` 抛出包含 401 和 provider error code 的错误，并且 mock 只收到 1 次 stream 请求，不再额外发起 non-stream fallback。

同日又把浏览器失败恢复纳入 `npm run verify:phase2-agent-home-browser`：mock Provider 对 `auth-fail-model` 返回 401 后，首页必须显示 `AI 请求失败` / `请求失败`，同时露出 `模型设置` 和 `重试`；错误正文必须包含“密钥没有通过认证”“下一步”和“保存后点‘重试’”，让用户知道该修 key、模型或服务商配置，而不是以为发送按钮坏了。

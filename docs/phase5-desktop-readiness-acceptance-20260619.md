# Phase 5 Desktop / Provider 就绪验收标准

这份文件回答 Phase 5 现阶段的四个问题：核心链路是什么、卡点怎么验证、能不能优先用 API、spec 里有没有成功标准。

Phase 5 目前定义为“桌面化与配置就绪闸门”，不等同于宣布正式 EXE 产品完成。公开入口仍保持 **织梦写作台 / Zhimeng Writing Agent**；灵枢 LumenOS 只作为底层 Agent OS / Agent IDE 运行层。

## 1. 核心链路

Phase 5 的最短闭环是：

```text
用户打开桌面版或浏览器版
-> 首屏仍进入织梦写作台 Agent Workbench
-> 设置 / 模型面板或桌面 Provider 配置工具配置端点、模型和密钥
-> 桌面配置工具写入本机 provider-settings.json
-> Gateway provider_config_status 只读返回本机配置
-> 前端启动时在 Gateway 可用时导入桌面配置
-> 模型列表优先通过 Gateway provider_probe 走 API 探测
-> Gateway 检查 --execute-provider、payload.execute、allow_remote_model
-> 返回模型列表、失败原因或审批状态
-> 用户保存本地配置档案
-> AI 对话 / Agent Loop / Worker 使用同一套 Provider 设置
-> 文件、命令、Skill、MCP、Scheduler、远程模型继续走独立审批门
```

桌面版核心链路是“启动器拉起 Gateway + 服务 dist 前端 + 权限 profile 明确”，不是让页面直接绕过本地 Gateway 去做危险操作。

## 2. 卡点与验证

| 卡点 | 成功标准 | 验证命令 / 证据 |
| --- | --- | --- |
| 公开边界 | `index.html`、`README.md`、PWA manifest 和桌面启动器都保持 Zhimeng-first，不回到 LumenOS-first | `npm run verify:phase5` |
| 构建入口 | 普通单文件构建和 GitHub Pages/PWA 构建命令都存在 | `npm run build`、`npm run build:pwa` |
| 设置体验 | API / Provider 配置在设置或模型面板里，不默认占右栏、不全屏打断 Agent Home | `npm run verify:phase5`、`npm run verify:phase2-agent-home` |
| Provider API 优先 | 模型列表走 `provider_probe`，设置页默认 `record:false`，远程端点显式 `allow_remote_model=true` | `npm run verify:provider-config` |
| 桌面配置工具 | `desktop/zhimeng_provider_switch.py` 能列 preset、写本机配置、打码输出、探测模型列表、用 `chat-smoke` 发起一次最小聊天冒烟、被 Gateway `provider_config_status` 读取，并被前端启动导入 | `npm run verify:phase5`、`npm run verify:provider-switch` |
| 密钥安全 | 模型发现历史只保存 `keyPresent`，不保存或回放 `apiKey/api_key`；源码/文档/脚本不提交真实 `sk-*` 密钥 | `npm run verify:phase5` |
| Gateway 权限 | Provider、write、command、web、MCP、Skill、Scheduler 都有 Gateway flag 和 request gate | `npm run verify:phase4-agent-runtime`、`python bridge/healthcheck_bridge.py` |
| 前置阶段防回退 | Phase 5 总门禁必须先跑四问 core-chain，再跑 Phase 4；Phase 4 必须先跑 Phase 3；Phase 3 必须先跑 Phase 2 Agent Home 浏览器/构建基线，避免桌面配置通过但首页、项目模式或运行层退化 | `npm run verify:phase5`、`npm run verify:core-chain` |
| 桌面启动器 | `desktop/zhimeng_desktop_launcher.py` 支持 `safe/workspace/network/full/autonomy/dev` 权限 profile，默认 workspace | `python desktop/zhimeng_desktop_launcher.py --doctor --profile workspace` |
| 打包路径 | PyInstaller spec 打包 `dist/`、`bridge/`、`desktop/`，打包脚本先 `npm run build` 再执行 doctor | `打包织梦PersonalOS桌面版.cmd` |

## 3. API 优先原则

Phase 5 的 Provider 和模型管理优先走 API，而不是只做输入框：

- `provider_catalog` 用来列出可选 Provider / preset。
- `provider_status` 用来检查端点、密钥需求、wire format 和 worker payload。
- `provider_probe` 用来读取 `/models` 或等价模型列表接口。
- 桌面配置工具的 `probe` 命令复用 Gateway `provider_probe`，本地端点可直接探测，远程端点必须显式 `--allow-remote`。
- 桌面配置工具的 `chat-smoke` 命令复用 Gateway model worker 路径发起最小聊天，本地端点可直接测试，远程端点必须显式 `--allow-remote`。
- 远程 Provider 探测必须同时满足 Gateway `--execute-provider`、请求 `execute=true`、请求 `allow_remote_model=true`。
- 设置页和模型面板不得把密钥写入运行记录；历史记录只保存模型名、标签、状态和 `keyPresent`。
- 桌面配置工具可以把密钥保存到本机用户目录，但普通 `status` 输出必须打码；前端只通过本机 Gateway 的 `provider_config_status` 导入。
- 对话、Agent Loop、Worker 测试模型都复用 `ApiSettings` / Provider 层，不另造一套隐形配置。

## 4. Phase 5 成功标准

Phase 5 当前硬成功标准：

1. 打开项目时仍能识别为“织梦写作台 / Zhimeng Writing Agent”，不是 LumenOS-first 或抽象 Personal OS-first。
2. API / Provider 配置入口轻量、可返回、不占默认右栏、不阻断主聊天。
3. Provider preset、Gateway preset、模型发现、模型发现历史和密钥边界有同一套验证。
4. 桌面 Provider 配置工具能脱离网页写入本机配置、探测模型列表、发起最小聊天冒烟，Gateway 和前端能读取同一份配置。
5. 桌面启动器有明确权限 profile，并能在 doctor 模式下验证 dist、bridge、spec 和打包脚本。
6. 普通构建、PWA 构建、Provider 边界、Phase4 运行层、类型检查都能跑通。
7. 任何真实密钥不得进入源码、文档、脚本、构建配置或提交历史新增内容。
8. `npm run verify:phase5` 是 Phase 5 的总门禁：先跑 `npm run verify:core-chain` 确认四问校准没有回退，再跑 `npm run verify:phase4`；而 Phase 4 会先跑 `npm run verify:phase3`，Phase 3 会先跑 Phase 2 Agent Home 总闸门，最后才验证桌面 / Provider 就绪。

## 5. 下一步

1. 用 `npm run verify:phase5` 守住四问校准、Phase 4 运行层和 Phase 5 桌面 / Provider 总闸门。
   只需要单独复核桌面 / Provider readiness 时，可运行 `npm run verify:phase5-desktop-readiness`。
2. 继续把桌面配置工具从网页设置里抽成更像 cc switch 的一键配置器，但仍复用同一套 Provider / Gateway 协议。
3. 后续若要宣布 EXE 完成，必须额外跑完整打包脚本、所有 profile doctor、真实启动和浏览器/桌面截图验收。

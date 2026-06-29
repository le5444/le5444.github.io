# 织梦写作台 / Zhimeng Writing Agent

> 面向中文写作与个人任务的开源 AI Agent 工作台。把 AI 对话、项目文件、上下文、写作 Skills、模型配置、工具执行和审批流程放在一个清晰的工作台里。

[在线体验](https://le5444.github.io/) · [源码分支](https://github.com/le5444/le5444.github.io/tree/source) · [路线图](docs/项目路线图.md)

![织梦写作台界面](docs/zhimeng-workbench-20260629.png)

## 一句话

织梦写作台不是单纯的提示词网页，也不只是小说编辑器。它以中文写作为核心入口，把 AI 对话、项目文件、上下文、记忆、Skills、工具执行和审批流程组织成一个可长期陪跑的个人 AI Agent 工作台；小说创作是重要内置能力，但不是整个产品边界。

简单说：**打开它，你应该先看到一个清楚的 AI 对话与项目工作台；写作、文件、上下文、工具、审批和设置都围绕任务流组织，不再堆一堆看不懂的名字。**

## 当前能力

- **Chat-first Agent Home**：默认首页收束为左侧线程 / 项目列表、中间 AI 对话、右侧窄工具栏；模型未配置时首页直接给出“配置模型”入口。
- **左侧线程 / 项目导航**：支持项目对话、自由对话、搜索、置顶、重命名、删除和归档，保持类似 Codex / VS Code 的轻量侧栏。
- **右侧当前下一步**：上下文、文件、变更、审批、状态五个辅助页签都有清晰中文短标签；展开后会显示当前页签的主动作，不再只靠图标或日志面板猜下一步。
- **AI 对话与附件回执**：支持文本、文件、图片和多模态请求；附件会显示是否进入模型请求、是否仅元数据、是否被拒绝。
- **模型 Provider 配置**：支持 OpenAI-compatible baseURL、API key、模型 ID、模型测试、cc switch / JSON / 半截配置粘贴解析、桌面 Provider 配置导入和本地 mock Provider 冒烟。
- **Agent Runtime / Tool Trace**：模型可产生 `<bridge-request>` 工具请求；只读工具、文件读取、工作区扫描、写文件 Diff、命令审批、运行回放和报告都有脚本验收；状态页主动作可直接运行或续跑 Agent Loop。
- **当前线程任务来源**：Agent Loop 不再只认手填任务草案，也会从当前线程最近用户消息、附件兜底、摘要或标题里提取任务，普通对话线程可以直接进入执行流。
- **文件 / Diff / 审批工作流**：AI 写文件先形成 Diff 草案和审批记录；审批后可续跑，结果进入线程和运行轨迹；浏览器验收覆盖读文件、挂上下文、生成 Diff、提交审批、执行审批和写后复核。
- **小说写作工作区**：管理作品、章节、正文、设定资料、分类、版本历史和写作统计。
- **小说 Skills 库**：内置中文网文、人物、剧情、世界观、写作、修订和蒸馏相关 Skill，并支持自定义 Skill。
- **反崩盘系统**：围绕人物声音、连续性、伏笔、约束卡、成长弧线和 AI 痕迹做检查。
- **蒸馏与对标**：从参考文本中提取节奏、场景功能、叙事机制和可复用技法，避免只停留在泛泛提示词。
- **Agent 线程与多工作区**：把任务、上下文附件、Worker 结果、审批 ID、Diff 和消息流沉淀到可恢复的本地线程；支持工作区搜索、领域过滤、最近打开和跨工作区定位。
- **上下文包 context_pack**：把当前任务、工作区摘要、最近文件、线程附件、记忆和 Skills 压成可审查上下文。
- **本地 Bridge / Gateway**：Python Bridge 提供健康检查、context_pack、memory、approval、provider、worker、MCP-like facade 等受控能力。
- **记忆 / Skills / 指令栈入模**：Runbook、Memory、Skills、Instruction Stack 可以作为受控上下文进入 Agent 线程。
- **PWA 部署**：线上版本可作为静态 PWA 打开和安装；完整本地 Agent 能力需要启动 Bridge。

## 工作台结构

项目界面采用类似 VS Code / Codex / Claude Code 的工作台结构，但默认用中文直白命名：

```text
Header            品牌、设置、源码入口
左侧栏            对话线程、项目、工作区导航
中间主区          AI 对话、消息流、输入框、附件
右侧栏            上下文、文件 / Diff、审批、终端 / 日志
底部面板          完整工作台里的终端、输出、问题和运行记录
设置              模型接口、密钥、Provider、权限和本地 Bridge
```

这不是为了做一个好看的 Dashboard，而是为了让写作任务、项目知识、工具执行和审批轨迹能在同一个工作流里闭环。

## 技术栈

- React 19
- TypeScript
- Vite 7
- Tailwind CSS 4
- TipTap / ProseMirror
- vite-plugin-pwa
- Python Bridge / Gateway
- Rust wrapper prototype

## 快速开始

安装依赖并启动前端：

```bash
npm install
npm run dev
```

构建普通单文件版本：

```bash
npm run build
```

常用验证命令：

```bash
npm run verify:core-chain
npm run verify:phase1
npm run verify:phase2
npm run verify:phase3
npm run verify:phase4
npm run verify:phase5
npm run verify:provider-config-paste
npm run verify:phase3-project-browser
```

构建 GitHub Pages 版本：

```bash
npm run build:pwa
```

> 当前线上版本会主动注销旧 Service Worker 并清理旧缓存，避免浏览器继续显示历史 PWA 里的旧界面。

启动本地 Bridge：

```bash
python bridge/zhimeng_bridge.py --serve
```

启动带工作区文件和 Provider 模型列表探针的本地 Gateway：

```bash
python bridge/zhimeng_bridge.py --serve --execute-read --execute-write --execute-provider
```

运行 Bridge 健康检查：

```bash
python bridge/healthcheck_bridge.py
```

也可以使用仓库里的 `.cmd` 启动脚本切换不同权限 profile，例如工作区、网络、MCP、API、完全文件权限或桌面版启动模式。

## 目录结构

```text
src/                  React 应用源码
src/anti-collapse/    小说反崩盘与连续性检查
src/components/       写作台、Agent 控制台、编辑器和管理器组件
src/store/            本地数据、设置、历史、工作区和 Provider 状态
src/utils/            Agent 对话、附件、线程、运行回放、Bridge 协议和工具层
scripts/              Phase 1-5、浏览器、Provider、Gateway 和 Agent Runtime 验收脚本
skills/               小说创作 Skill 库
bridge/               本地 Agent Gateway、健康检查、MCP-like facade
desktop/              桌面版启动器和打包配置
public/               PWA 图标与兼容页面
docs/                 路线图、截图和项目说明
```

## 分支说明

这个仓库同时承担源码保存和 GitHub Pages 部署：

- `source`：完整源码、文档、Bridge、桌面启动器和 Skills。日常开发和开源阅读看这个分支。
- `main`：GitHub Pages 静态产物，来自 `dist-pwa/`，用于线上访问 [le5444.github.io](https://le5444.github.io/)；其中 `sw.js` 只用于退役旧缓存，不再把页面离线固定住。

保留 `source` 分支是为了让已有链接继续有效：

```text
https://github.com/le5444/le5444.github.io/tree/source
```

## 安全边界

项目默认采用 fail-closed 思路：模型可以生成计划、草案、上下文包和审批请求，但危险动作不会默认执行。

- 文件写入默认进入 `write_file` 审批队列。
- Memory 修改、冻结、删除、合并和恢复默认进入审批队列。
- 远程模型探针需要 Provider/Gateway/请求级授权：Gateway 要开启 `--execute-provider`，请求仍要 `execute=true` 和 `allow_remote_model=true`。
- MCP、Scheduler、Skill runtime 和命令执行都有独立 gate。
- 任意 shell 不作为默认能力开放。
- API key、个人记忆、运行日志、审批状态、构建产物和本地缓存默认不进入 Git。

## 当前状态

项目仍在快速迭代中。现在优先把入口收清楚：打开项目时先看到 **织梦写作台 / Zhimeng Writing Agent**，核心体验围绕 AI 对话、项目线程、附件 / 图片、文件上下文、模型配置、工具执行和审批流程展开。

- 默认首页已经从旧书架首页收束为 Chat-first Agent Home。
- 左侧线程 / 项目列表、空状态、输入框、右侧窄工具栏和运行状态栏已经做过多轮 Codex-like 收敛；右侧栏现在有“当前下一步”主动作。
- 附件 / 图片进入模型请求、超大附件拒绝、仅元数据附件、浏览器真实上传冒烟均有验收。
- Provider 配置、粘贴配置解析、桌面 Provider 导入、mock OpenAI-compatible 服务、鉴权失败边界和空回复守门均有脚本覆盖。
- Agent Loop 可以从当前线程自动提取任务，状态页可直接运行 / 续跑；Diff 审批后的写后 `read_file` 复核已经纳入 Phase 3 浏览器链路。
- Phase 1-5 已有聚合门禁；`verify:phase5` 会先跑核心链路四问校准，再守住运行层和桌面 / Provider readiness。
- 当前仍不是完整复刻 Codex / Claude Code 的成熟产品，下一步重点是继续打磨消息流、工具轨迹、多文件 Diff、审批续跑和真实桌面体验。

更完整的阶段规划见 [docs/项目路线图.md](docs/项目路线图.md)、[docs/core-chain-calibration-20260620.md](docs/core-chain-calibration-20260620.md)、[docs/phase0-current-state-audit-20260622.md](docs/phase0-current-state-audit-20260622.md) 和 [docs/phase0-current-state-audit-20260626.md](docs/phase0-current-state-audit-20260626.md)。

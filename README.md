# 织梦写作台 / Zhimeng Writing Agent

> 面向中文写作与个人任务的开源 AI Agent 工作台。把 AI 对话、项目文件、上下文、写作 Skills、模型配置、工具执行和审批流程放在一个清晰的工作台里。

[在线体验](https://le5444.github.io/) · [源码分支](https://github.com/le5444/le5444.github.io/tree/source) · [路线图](docs/项目路线图.md)

![织梦写作台界面](docs/zhimeng-workbench-20260615.png)

## 一句话

织梦写作台不是单纯的提示词网页，也不只是小说编辑器。它以中文写作为核心入口，把 AI 对话、项目文件、上下文、记忆、Skills、工具执行和审批流程组织成一个可长期陪跑的个人 AI Agent 工作台；小说创作是重要内置能力，但不是整个产品边界。

简单说：**打开它，你应该先看到一个清楚的 AI 对话与项目工作台；写作、文件、上下文、工具、审批和设置都围绕任务流组织，不再堆一堆看不懂的名字。**

## 当前能力

- **小说写作工作区**：管理作品、章节、正文、设定资料、分类、版本历史和写作统计。
- **小说 Skills 库**：内置中文网文、人物、剧情、世界观、写作、修订和蒸馏相关 Skill，并支持自定义 Skill。
- **反崩盘系统**：围绕人物声音、连续性、伏笔、约束卡、成长弧线和 AI 痕迹做检查。
- **蒸馏与对标**：从参考文本中提取节奏、场景功能、叙事机制和可复用技法，避免只停留在泛泛提示词。
- **Agent 线程**：把任务、上下文附件、Worker 结果、审批 ID、Diff 和消息流沉淀到可恢复的本地线程。
- **多工作区管理器**：支持工作区搜索、领域过滤、最近打开、跨工作区定位、线程空间和工作区检查器。
- **上下文包 context_pack**：把当前任务、工作区摘要、最近文件、线程附件、记忆和 Skills 压成可审查上下文。
- **模型配置**：管理 OpenAI-compatible 等模型接口、配置档案、模型列表和测试结果。
- **任务 / Diff / 审批**：AI 生成的文件修改先形成草案和 Diff；写文件、记忆修改、模型探针等动作进入审批队列。
- **本地 Bridge / Gateway**：Python Bridge 提供健康检查、context_pack、memory、approval、provider、worker、MCP-like facade 等受控能力。
- **Memory Manager**：管理 L1/L2 记忆、证据、标签、冻结、软删除、备份和恢复草案。
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

验证 Phase 1 核心链路：

```bash
npm run verify:phase1
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
src/utils/            Agent 计划、技能路由、Bridge 协议、上下文和工具层
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

项目仍在快速迭代中。现在优先把入口收清楚：打开项目时先看到 **织梦写作台 / Zhimeng Writing Agent**，核心体验围绕 AI 对话、写作项目、文件上下文、模型配置和审批流程展开。

- AI 对话首屏工作台已替代旧书架首页。
- Agent 线程、消息流、上下文附件和审批关联已落地。
- Multi Workspace Manager、工作区 context_pack、权限 profile、工作区 Skills 集已落地。
- Provider 配置草案、模型列表探针、Worker 载荷和审批执行门已落地。
- Specs / Steering / Hooks 协议管理器、Changes / Diff、底部运行面板已进入首版。
- 运行事件流、增量游标和 SSE 长连接观察已落地，用于只读串联 Gateway、Worker、审批和前端 runtime log。

更完整的阶段规划见 [docs/Personal-OS-Roadmap.md](docs/Personal-OS-Roadmap.md)。

# 织梦写作台 / Zhimeng Writing Agent

> 面向中文长篇小说创作的 AI Agent 工作台：从灵感、设定、章节、正文到复盘，把写作过程拆成可记忆、可检查、可迭代的工作流。

[在线体验](https://le5444.github.io/) · [源码分支](https://github.com/le5444/le5444.github.io/tree/source)

![织梦写作台界面](docs/lumenos-agent-shell-20260606.png)

## 项目定位

织梦写作台最初是一个小说写作编辑器，现在正在升级为写小说 Agent：它不只是聊天框，而是把小说项目里的世界观、人物、章节、伏笔、风格、记忆和工具执行组织成一套可协作的创作系统。

项目当前包含两层：

- **Writing Workspace**：面向作者的写作台、章节树、富文本编辑器、灵感向导、蒸馏、版本历史和统计。
- **Agent Runtime**：面向任务的计划、上下文打包、技能路由、反崩盘检查、子代理分工、安全审批和本地 Bridge。

## 核心能力

- **小说项目工作台**：管理书籍、章节、正文、设定资料和写作进度。
- **AI 写作助手**：围绕构思、扩写、润色、改稿、拆章和续写组织提示词。
- **反崩盘系统**：检查人物声音、伏笔兑现、约束卡、连续性和成长弧线。
- **蒸馏与对标**：从参考文本中抽取节奏、场景功能、叙事机制和可复用技法。
- **技能库**：内置中文网文、人物、题材、剧情、世界观、写作和修订技能。
- **Personal OS / Agent Bridge**：本地 Gateway 支持记忆、上下文包、工作流、子代理、审批队列和受控工具调用。
- **PWA 部署**：支持安装到手机主屏，离线缓存核心资源。

## 技术栈

- React 19
- TypeScript
- Vite 7
- Tailwind CSS 4
- TipTap / ProseMirror
- vite-plugin-pwa
- Python Bridge
- Rust wrapper prototype

## 快速开始

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

PWA 构建：

```bash
npm run build:pwa
```

本地 Bridge：

```bash
python bridge/zhimeng_bridge.py --serve
python bridge/healthcheck_bridge.py
```

## 仓库分支

这个仓库同时承担 GitHub Pages 部署和源码保存：

- `main`：线上 GitHub Pages 静态产物，来自 `dist-pwa/`。
- `source`：完整源码、文档、Bridge、桌面启动器和技能库。

日常开发请看 `source` 分支；线上访问请看 `main` 分支或打开 [le5444.github.io](https://le5444.github.io/)。

## 目录结构

```text
src/                 React 应用源码
src/anti-collapse/   小说反崩盘与连续性检查
src/components/      写作台、Agent 控制台和编辑器组件
src/store/           本地数据、设置、历史和项目状态
src/utils/           Agent 计划、技能路由、Bridge 协议和工具层
skills/              小说创作技能库
bridge/              本地 Agent Gateway、健康检查和 MCP-like facade
desktop/             桌面版启动器和打包配置
public/              PWA 图标与兼容页面
docs/                路线图与截图
```

## 安全边界

项目里的本地 Bridge 默认以审查和草案为主：文件写入、命令执行、联网、MCP 调用和 Skill 执行都需要显式授权或启动参数打开。运行态数据、日志、构建产物、个人对话记忆和密钥文件默认不进入 Git。

## 当前状态

项目仍在快速迭代中。当前重点是把写作台从“AI 辅助编辑器”推进到“可长期陪跑的小说 Agent”：更稳定的跨工作区线程、审批状态同步、多文件 diff、真实工具事件流和更完整的小说项目知识库。

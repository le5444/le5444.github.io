# Phase 3 项目模式验收标准

这份文件回答 Phase 3 的四个问题：核心链路是什么、每个卡点怎么验证、能不能优先用 API / Gateway、spec 文档里有没有成功标准。项目模式不能只是“看起来有项目按钮”，必须推进到可验证的 Agent IDE 项目链路。

公开入口仍保持“织梦写作台 / Zhimeng Writing Agent”。灵枢 LumenOS 只作为底层 Agent OS / Agent IDE 运行层。

## 1. 核心链路

Phase 3 的项目模式最短闭环是：

```
选择 / 新建项目对话
-> 绑定本机工作目录
-> workspace_scan 目录索引
-> read_file 读取预览
-> 挂入线程上下文
-> 生成 Changes / Diff 草案
-> 人工接受 hunk
-> write_file 审批草案
-> Gateway 审批执行
-> read_file 写后复核
```

这里的重点是“受控项目工具链”，不是让浏览器前端直接读写任意磁盘文件。

## 2. 卡点与验证

| 卡点 | 成功标准 | 验证命令 / 证据 |
| --- | --- | --- |
| 项目对话入口 | Agent Home 左侧能新建项目对话，线程可和项目关联，且 Phase 2 首页总闸门继续通过 | `npm run verify:phase3`、浏览器左侧导航 |
| 目录绑定 | 空目录不误认为绑定成功；第一次绑定会从虚拟树升级为只读映射；变更目录会清空旧索引 | `npm run verify:workspace-root` |
| 目录扫描闸门 | 项目模式没有绑定真实本机目录时，`workspace_scan` 必须阻断，不得把 `.` 或虚拟树伪装成真实目录索引 | `npm run verify:workspace-scan` |
| 目录索引 | `workspace_scan` 结果能规范化路径、文件数、目录数、Windows / POSIX 拼接路径；dry-run 和执行请求都必须使用已绑定根目录 | `npm run verify:workspace-scan` |
| 文件读取 | `read_file` 预览能生成线程附件，明确“完整正文未持久保存”；可从预览生成待审 Diff | `npm run verify:workspace-read` |
| 文件上下文注入 | 挂入线程的 `read_file` 预览必须进入下一轮模型请求的线程上下文，而不只是显示在右侧面板 | `npm run verify:agent-chat` |
| 写入保护 | AI 的 `write_file` 请求先变成 Changes / Diff 草案，不直接提交 Gateway 写入 | `npm run verify:write-file-diff`、`npm run verify:agent-loop-write-file` |
| 工具协议 | `<bridge-request>` 能解析 `workspace_scan`、`read_file`、`write_file`、`run_command`；危险命令进入阻断 / 审批 | `npm run verify:executor-bridge` |
| 命令审批 | `run_command` 默认只验证；只有 Gateway 显式授权和 allowlist 通过才执行 | `npm run verify:gateway-command-approval` |
| UI 入口 | 右侧有文件 / Diff / 审批入口；项目目录动作、扫描、读取、Diff 和审批入口可定位；首页仍保持左列表 / 中对话 / 右窄工具栏 | `npm run verify:phase3` |

## 3. API / Gateway 优先原则

Phase 3 的“API 优先”不是让浏览器直接碰磁盘，而是优先复用本地 Gateway / bridge action / Provider API 的真实 contract：

- 项目目录、文件读取、写入、命令都优先走 `workspace_scan`、`read_file`、`write_file`、`run_command` 这组 Gateway / bridge contract。
- UI 只负责选择线程、展示文件树、挂上下文、展示 Diff 和审批；不能绕过 Gateway 直接读写任意本机路径。
- 模型请求仍走 Phase 1 的 Provider API；项目文件片段作为线程上下文进入模型请求。
- 没有真实目录绑定时，项目工具 API 必须返回阻断或待绑定状态，不允许用虚拟树、`.` 或前端假数据伪装成功。
- 写入、命令、联网和 Skill runtime 的执行都必须保留 Gateway flag、请求级 execute 和审批门。

## 4. 当前边界

Phase 3 可以逐步接通真实文件和命令，但必须保留这些边界：

- 浏览器前端不直接执行 shell，也不直接写磁盘。
- `workspace_scan` 默认是目录元数据索引，不把全项目正文塞进模型。
- `workspace_scan` 只能对已绑定的真实本机项目根目录生成请求；未绑定或仍是虚拟路径时必须提示绑定，不允许回退到 `.` 扫描。
- `read_file` 只读指定文件预览，并把摘要挂入线程上下文；下一轮 AI 对话必须把该文件片段注入模型请求。
- `write_file` 永远先进入 Diff / 审批，不直接落盘。
- `run_command` 默认只验证，不直接执行任意 shell。
- `run_command` 走命令验证器、Gateway flag、请求级 `execute=true` 和 allowlist。
- 文件、Diff、审批、运行状态要能回到同一个 Agent 线程里追溯。

## 5. Spec 成功标准

Phase 3 暂定硬成功标准：

1. 对话模式不绑定目录也能工作；项目模式必须绑定指定本地文件夹。
2. 项目线程能持久关联项目，并在左侧作为项目对话出现。
3. 目录绑定、扫描、文件预览、上下文挂载、Diff 草案、write_file 审批形成最短路径；没有真实目录绑定时，扫描和索引入口必须阻断。
4. 写入、命令和联网能力不绕过 Gateway / 审批。
5. 右侧辅助栏承担文件、Diff、审批和状态，不把项目工具散成一堆首页按钮。
6. Phase 1 API 对话和 Phase 2 Agent Home 验收继续通过；`npm run verify:phase3` 必须同时覆盖 Phase 2 总闸门和项目模式工具链。

## 6. 下一步

1. 用 `npm run verify:phase3` 守住 Phase 2 首页骨架和 Phase 3 项目模式链路。
2. 用 `npm run verify:phase3-project-mode` 单独复查目录绑定、扫描、读文件、Diff 和命令审批。
3. 继续把右侧文件工作流做成更少步骤、更像 IDE 的文件 / Diff / 审批面板。
4. 接通更多真实 Gateway 执行证据：`read_file` live preview、`write_file` 审批执行、命令 allowlist 运行日志。

# Phase 4 Agent Runtime 验收标准

这份文件回答 Phase 4 的四个问题：核心链路是什么、每个卡点怎么验证、能不能优先用 API / Gateway、spec 文档里有没有成功标准。它的目标是证明当前系统不是“普通聊天页 + 一堆概念”，而是开始具备 Agent IDE 运行层。

公开入口仍保持“织梦写作台 / Zhimeng Writing Agent”。灵枢 LumenOS 只作为底层 Agent OS / Agent IDE 运行层。

## 1. 核心链路

Phase 4 的运行层最短闭环是：

```
用户任务
-> Runbook 归纳当前阶段、阻塞点和下一步
-> Instruction Stack 注入项目规则 / Skills / 安全边界
-> context_pack 汇总线程上下文、记忆和技能路由
-> Agent Loop 调模型
-> 解析 <bridge-request>
-> Gateway 执行只读工具或生成审批 / Diff
-> tool result 回灌模型继续推理
-> Worker / runtime_events 记录后台任务与运行证据
-> 运行报告 / 线程回放可复盘
```

这条链路的重点是“可恢复、可审查、可回放”，不是让模型绕过审批自主改磁盘。

## 2. 卡点与验证

| 卡点 | 成功标准 | 验证命令 / 证据 |
| --- | --- | --- |
| Agent Loop 多轮 | 只读工具能自动进入 Gateway，并把 `<tool-result>` 回灌给下一轮模型 | `npm run verify:agent-loop-read-tool` |
| 写入安全 | `write_file` 在 Agent Loop 中先变成 Diff 草案，暂停等待审查 | `npm run verify:agent-loop-write-file`、`npm run verify:agent-loop-read-write` |
| 命令安全 | `run_command` 进入审批暂停，不直接执行任意 shell | `npm run verify:agent-loop-command` |
| 审批续跑 | 审批 / Diff 结果能形成续跑状态和续跑提示 | `npm run verify:agent-loop-resume`、`npm run verify:agent-loop-resume-prompt` |
| Runbook | 当前线程可归纳阶段、阻塞点、下一步，并能作为线程上下文附件 | `npm run verify:phase4`，Agent Home / 状态面板 |
| Instruction Stack | Codex AGENTS、Claude CLAUDE、Kiro Steering/Specs/Hooks、Runbook 和安全闸门以只读规则层进入上下文 | `npm run verify:phase4` |
| Memory / Skills | `memory_retrieve` 与 `skill_route` 是 context_pack 的只读来源；`skill_run` 必须显式 Gateway 授权 | `npm run verify:phase4`，`bridge/healthcheck_bridge.py` |
| Worker / Runtime Events | `worker_run`、`worker_status`、`runtime_events` 能作为运行证据进入右侧 / 底部运行面板 | `npm run verify:phase4` |
| 运行报告 | 线程轨迹可导出为按用户请求、工具、审批、Diff、Worker、结果复核排序的报告 | `npm run verify:agent-run-replay` |
| Agent Loop 工具证据 | `AgentToolResult[]` 必须能标准化为任务回放 rows，区分工具、审批和 Diff，并展开进入 Tool Trace / 运行报告，不只停留在 summary 文案 | `npm run verify:agent-run-replay`、`npm run verify:phase4-agent-runtime` |
| 直接对话工具证据 | 普通 AI 对话里的 `<bridge-request>` 每轮工具结果也必须标准化为 `replay_rows`，由 Tool Trace / 运行报告消费，避免直接对话变成不可复盘的黑箱 | `npm run verify:agent-run-replay`、`npm run verify:phase4-agent-runtime` |
| 线程归属 | Tool Trace 展开 `replay_rows` 前必须按 `agent_context.thread_id` 过滤，当前线程只能看到本线程或未声明归属的运行证据，不能串入其他线程 | `npm run verify:phase4-agent-runtime` |
| 报告证据范围 | 运行报告必须显式声明当前 Thread ID、Tool Trace 来源和 `agent_context.thread_id` 过滤规则，避免把报告误读成全局运行日志 | `npm run verify:phase4-agent-runtime` |
| 报告日志范围 | 运行报告里的 Agent Loop 轨迹、直接对话 / 附件传输和最近运行日志段必须按当前 Thread ID 过滤，不能混入其他线程的 runtime log | `npm run verify:phase4-agent-runtime` |
| 报告入口 | 命令面板、Agent Home 和右侧运行栏默认只能打开 / 挂入当前线程的运行报告；没有当前线程报告时生成新报告，而不是拿全局最近报告顶替 | `npm run verify:agent-run-report-scope`、`npm run verify:phase4-agent-runtime` |
| 报告挂入守门 | 手动打开历史报告时，若报告 `threadId` 不等于当前线程 ID，不能挂入当前线程上下文；UI 应禁用挂入按钮并记录本地阻塞日志 | `npm run verify:agent-run-report-scope`、`npm run verify:phase4-agent-runtime` |
| 报告工作区归属 | 运行报告的工作区名称和领域必须来自线程快照或线程绑定的 `workspaceId`，自由对话不能继承当前 UI 选中的工作区 | `npm run verify:agent-run-report-scope`、`npm run verify:phase4-agent-runtime` |

## 3. API / Gateway 优先原则

Phase 4 的运行层必须优先复用已有 Provider API、Gateway 和 bridge contract，不再把 TypeScript 类型当成“已经实现”：

- 模型推理走 Phase 1 的 Provider API，不另造隐藏模型配置。
- `context_pack`、`memory_retrieve`、`skill_route`、`worker_status`、`runtime_events` 等只读能力优先走 Gateway / bridge action，返回结果再进入线程上下文和运行证据。
- `write_file`、`run_command`、`skill_run`、`worker_run:model_task`、MCP、Scheduler 等有副作用能力必须走显式执行门和审批，不从 Agent Loop 直接落盘或启动进程。
- 运行报告、Tool Trace 和 Worker 时间线消费真实工具结果、runtime log 和 thread context，不通过猜日志文本伪造证据。
- API 不可用时要暴露阻塞点并保留线程状态，而不是生成假成功、假工具结果或假报告。

## 4. 当前边界

Phase 4 可以逐步接通更强的后台执行，但必须保留这些边界：

- `skill_route` / `skill_invoke` 只读读取 SKILL.md 指令，不执行脚本。
- `skill_run` 只有 Gateway 显式 `--execute-skill` 且 `payload.execute=true` 时才能运行已激活 Skill。
- `worker_run:model_task` 需要 `execute_model=true`；远程模型还需要 `allow_remote_model=true`。
- `memory_retrieve` 返回紧凑 context_pack，不把长期记忆全文塞进模型。
- `runtime_events`、`worker_status`、`approval_status` 是只读观察，不触发模型、命令或写文件。
- 子 Agent / swarm 先验证锁、隔离和 allowlist，不默认启动任意外部进程。

## 5. Spec 成功标准

Phase 4 暂定硬成功标准：

1. Agent Loop 不停在一次 `sendChat`，能多轮调模型、解析工具、回灌结果、等待审批并续跑。
2. Runbook、Instruction Stack、thread_context、context_pack 在任务前形成可审查上下文层。
3. Memory、Skills、Worker、runtime_events 进入真实 Gateway / UI 链路，而不是只写在 TypeScript 类型里。
4. 写文件、命令、Skill runtime、远程模型、MCP、Scheduler 都保留显式执行门。
5. 运行报告和线程回放能把一次任务的请求、工具、审批、Diff、Worker 和结果证据串起来。
6. Agent Loop 结束时要保留可回放的工具证据结构，并展开进入当前线程 Tool Trace / 运行报告，而不是重新猜测日志文本。
7. 直接对话的工具回灌也要保留同样的可回放证据结构，和 Agent Loop 使用同一套 Tool Trace / 运行报告消费路径。
8. Tool Trace / 运行报告必须按线程归属过滤，避免一个线程的工具证据污染另一个线程。
9. 运行报告必须写明证据范围、当前 Thread ID 和线程归属过滤规则，方便任务交接与继续执行。
10. 报告里的 Agent Loop、直接对话和最近运行日志段也必须按当前 Thread ID 过滤。
11. 默认报告入口必须当前线程优先；全局报告历史可以保留，但不能在当前线程视图里默认打开或挂入别的线程报告。
12. 历史报告可以手动打开，但跨线程报告不能被静默挂入当前线程上下文，必须显式阻塞。
13. 运行报告的工作区归属必须以线程为准；自由对话报告不能因为当前 UI 选中了某个项目而被写成项目报告。
14. Phase 1 API 对话、Phase 2 Agent Home、Phase 3 项目模式验收继续通过。
15. `npm run verify:phase4` 是 Phase 4 的总门禁：先确认 Phase 3 没回退，再验证 Agent Runtime 工具链。

## 6. 下一步

1. 用 `npm run verify:phase4` 守住 Phase 3 基线和 Phase 4 运行层协议。
2. 继续把 Agent Loop 的失败恢复、审批后自动续跑、多文件任务收束做成更稳定的真实执行体验。
3. 把 Memory / Skills / Worker 从“可路由、可观察”推进到“按任务自动挂载、按审批执行、按报告复盘”。

# Zhimeng Personal OS Bridge

Local Gateway prototype for the Personal OS layer.

Coordinator mode:

- `src/utils/coordinator-mode.ts` renders the top-level Goal Mode / Task Mode system prompt for the browser editor.
- `src/utils/agent-context-pack.ts` builds a compact runtime context pack: task intent, active skills, memory refs, bridge queue, tool exclusions, workflow node, and writeback rules.
- `COORDINATOR.md` is part of the default Personal OS workspace, next to `SOUL.md`, `MEMORY.md`, `KAIROS.md`, and `BRIDGE.md`.
- The coordinator prompt makes delegation, verification gates, source boundaries, context economy, writeback rules, and tool invariants explicit before other context is injected.
- The context pack is injected before detailed modules so the model can route skills and retrieve memory before asking for full context.
- Public agent systems such as Codex, Claude Code, WorkBuddy, OpenClaw, and Hermes are used as architecture references only. Leaked/protected code is treated as non-reusable risk material.

Rust/Python hybrid skeleton:

- `bridge/rust-core/Cargo.toml`
- `bridge/rust-core/src/main.rs`
- `启动织梦PersonalOS-RustCore-健康检查.cmd`

The Rust wrapper delegates to the Python Gateway and stdio facade. It is a
scaffold for the hybrid core, not a replacement for the Python Gateway yet.

Desktop shell / EXE path:

- `desktop/zhimeng_desktop_launcher.py` starts the Gateway, serves `dist/`, and opens the editor.
- `desktop/zhimeng_desktop_launcher.spec` packages the launcher, `bridge/`, and `dist/` through PyInstaller.
- `打包织梦PersonalOS桌面版.cmd` runs `npm run build`, packages the app, then verifies the packaged EXE with `--doctor`.
- A packaged build is present at `desktop-release/ZhimengPersonalOS/ZhimengPersonalOS.exe`; packaged `--doctor` supports both `workspace` and `network` profiles.
- Desktop permission profiles are explicit: `safe`, `workspace`, `network`, `full`, `autonomy`, and `dev`.
- Default desktop mode is `workspace`: workspace read/write tools are enabled, while arbitrary shell, full filesystem, scheduler, web fetch, and MCP connectors remain off unless a stronger profile or env flag is used.

Current behavior:

- Reads a JSON request from `--json`, `--request`, stdin, or the HTTP Gateway.
- Exposes a tiny local Gateway at `http://127.0.0.1:8765`.
- Validates command drafts with 23 safety validators.
- Records Gateway calls under `bridge/runs`.
- Queues write approvals under `bridge/approvals`.
- Stores workflow DAG state under `bridge/workflows/workflow-state.json`.
- Stores KAIROS long-running task state under `bridge/kairos/kairos-state.json`.
- Runs safe `kairos_tick` observations that prepare context/skill suggestions without external execution.
- Stores AutoDream L1/L2 memory state under `bridge/memory/autodream-state.json`.
- Retrieves compact AutoDream context packs through `memory_retrieve` across six dimensions: identity, preference, project, episode, skill, and tool.
- Verifies Phase 2 memory through `memory_bootstrap`, seeding simulated long-context L1 events and consolidating them into L2 evidence.
- Builds one-shot Gateway agent packs through `context_pack`, combining skill routing, memory retrieval, tool exclusions, and writeback rules.
- Audits Codex / Claude Code / WorkBuddy / OpenClaw / Hermes research sources through `source_audit`; leaked/protected materials are marked non-reusable and are not fetched, cloned, or inspected.
- Digests safe official/open-source agent architecture patterns through `source_digest`, writing reviewed adoption notes under `bridge/research/source-digest-state.json`.
- Bootstraps Goal Mode through `goal_bootstrap`, writing planner-tree history under `bridge/goals/goal-bootstrap-state.json` and optionally registering workflow DAG, subagents, safe Phase 1 worker jobs, and KAIROS task records.
- Verifies Phase 3 skill mounting through `skill_bootstrap`, proving writing-domain skills, context pack, tool exclusions, workflow hooks, and bounded subagents without importing or executing scripts.
- Creates prompt-only skill invocation packets through `skill_invoke` without importing or executing activated scripts.
- Discovers local/built-in `SKILL.md` libraries from `.codex/skills`, `.agents/skills`, `.codex/skills/.system`, bundled plugin caches, and optional `ZHIMENG_SKILL_ROOTS`.
- Reads local `SKILL.md` content as instruction context for `skill_route` / `skill_invoke`; it never imports, installs, or executes Skill scripts automatically.
- Stores generated skill candidates under `bridge/skills/skill-crystallization-state.json`.
- Routes tasks through built-in Personal OS / novel skill specs with `skill_route` without importing or executing scripts.
- Writes non-executable skill drafts under `bridge/skills/drafts/*.py.draft`.
- Copies reviewed skill drafts into `bridge/skills/activated/*.py` without importing or executing them.
- Stores Honcho-lite user model events and tentative beliefs under `bridge/user-model/honcho-state.json`.
- Appends KAIROS daemon notes under `bridge/kairos/daily/YYYYMMDD.md`.
- Stores reviewed scheduler drafts under `bridge/scheduler/scheduler-state.json` and `bridge/scheduler/drafts/*.cmd.draft`.
- Supports reviewed `scheduler_install` / `scheduler_uninstall` through Windows `schtasks` only when the Gateway starts with `--execute-scheduler` and the request sets `execute=true`.
- Stores background worker jobs under `bridge/workers/worker-state.json`.
- Supports gated `worker_run` model tasks through `kind=model_task`. Model tasks build a compact context pack and require `execute_model=true`; remote provider calls additionally require `allow_remote_model=true`, and API keys are read from an environment variable or one-shot payload without being persisted.
- Executes approved model workers in a controlled child process; `worker_cancel` can terminate only the recorded worker PID and records `worker_hard_cancel` events.
- Stores reviewable worker merge proposals under `bridge/workers/merge-proposals/*.json`; proposals include a diff preview and review gate, but never modify target files directly.
- Exposes a Provider Hub through `provider_catalog`, `provider_status`, and `provider_probe`, mirroring the frontend API presets for OpenAI-compatible, Anthropic, Gemini, and Ollama providers.
- Keeps Provider Hub catalog/status read-only; `provider_probe` only checks model-list endpoints after `payload.execute=true`, and remote endpoints additionally require `allow_remote_model=true`.
- Stores subagent branches and read/write locks under `bridge/subagents/subagent-state.json`; conflicting write locks are blocked and logged as `lock_conflict` events.
- Verifies Phase 4 swarm safety through `swarm_bootstrap`, registering forked/isolated agents, exercising same-scope write-lock conflict, running allowlisted workers, and proving command validators block dangerous drafts.
- Verifies Phase 5 evolution through `evolution_bootstrap`, connecting KAIROS task/tick, append-only daily log, scheduler drafts, AutoDream L1/L2 consolidation, reviewed Skill activation, and Honcho-lite reflection.
- Provides `phase_audit` to report Phase 1-5 Personal OS evidence and known gaps.
- Provides `completion_audit` to map public Codex / Claude Code / WorkBuddy / OpenClaw / Hermes-style agent capabilities onto Zhimeng Personal OS requirements, marking each as proven, partial, missing, or approval-blocked.
- Keeps browser-origin requests in dry-run mode by default.
- Allows safe `read_file` only when `--execute` is passed in CLI mode, or when the Gateway is started with `--execute-read` and the request also sets `"execute": true`.
- Allows workspace `write_file` only when `--execute-write` is enabled and the request also sets `"execute": true`; direct writes create backup/diff audit metadata.
- Supports two file access profiles: `workspace` stays inside the project root; `full_access` can target the wider filesystem only when the Gateway is also started with `--full-access-files`.
- Exposes runtime permission flags through `/health`, `/tools`, and `status.runtime_capabilities` so the UI can distinguish Gateway startup permissions from a single request's `execute=true`.
- Exposes an agent runtime `tool_matrix` through `/health`, `/tools`, and `status.runtime_capabilities`; each tool declares whether it is enabled, the required Gateway flag, the per-request gate, the scope, and the default fallback behavior.
- Allows a small allowlist of verification commands only when `--execute-command` is enabled and the request also sets `"execute": true`.
- Allows bounded `web_fetch` API calls only when `--execute-web` is enabled and the request also sets `"execute": true`; private/localhost targets additionally require `allow_private_network=true`, response size is capped, and sensitive headers are redacted.
- Allows bounded `mcp_call` HTTP JSON-RPC or registered stdio MCP calls only when `--execute-mcp` is enabled and the request also sets `"execute": true`; private/localhost HTTP endpoints additionally require `allow_private_network=true`, JSON-RPC methods are allowlisted, response size is capped, stdio servers must come from the registry, and sensitive headers/output are limited or redacted.
- Provides Provider Hub catalog/status/probe actions for many model APIs; API keys are never persisted, local endpoints can be keyless, and remote model calls/probes require an explicit `allow_remote_model=true` gate.
- Allows reviewed activated `skill_run` only when `--execute-skill` is enabled and the request also sets `"execute": true`; the skill file must live under `bridge/skills/activated`, pass a static risk scan, and expose `run(context)`.
- Allows Windows scheduler install/uninstall only when `--execute-scheduler` is enabled and the request also sets `"execute": true`; otherwise scheduler actions return approval-required metadata.
- Does not execute arbitrary shell commands; `run_command` otherwise returns validation and approval status.
- Provides `sandbox_probe` for allowlisted non-mutating subprocess probes (`python --version`, `node --version`, `npm --version`) with `shell=False`.

Runtime tool matrix today:

- `read_file`: workspace/full-access text reads; requires `--execute-read` and `payload.execute=true`.
- `write_file`: approval draft by default; direct write requires `--execute-write`, `payload.execute=true`, backup/diff audit, and optional `--full-access-files`.
- `run_command`: command validation by default; execution is limited to verification allowlist commands and requires `--execute-command`.
- `skill_route` / `skill_invoke`: always-on Skill instruction routing; local/bundled `SKILL.md` can be read as bounded context.
- `skill_run`: approval-only by default; with `--execute-skill` it runs reviewed activated Skills through `run(context)` in a bounded subprocess after static risk scanning.
- `scheduler_install` / `scheduler_uninstall`: reviewed Windows `schtasks` plans only; requires `--execute-scheduler`.
- `web_fetch`: proposal-only by default; with `--execute-web` it can run bounded GET/POST HTTP/API calls with timeout, size limits, private-network gate, and header redaction.
- `mcp_stdio_catalog`: read-only registry of built-in stdio MCP servers; does not spawn processes.
- `mcp_call`: proposal-only by default; with `--execute-mcp` it can call reviewed HTTP/HTTPS JSON-RPC MCP endpoints or registered stdio MCP servers with method allowlist, timeout, size limits, private-network gate for HTTP, and header/output redaction.
- `provider_catalog` / `provider_status`: always-on read-only Provider Hub for API presets, key requirements, wire formats, and model-worker readiness.
- `provider_probe`: explicit model-list probe; requires `payload.execute=true`, and remote providers also require `allow_remote_model=true`.
- `worker_run:model_task`: provider-backed model execution; requires `execute_model=true`, isolates the call in a child process, and never writes files directly.
- `worker_cancel`: soft-cancels thread jobs and hard-cancels model worker child processes by recorded PID.
- `worker_merge_proposal`: creates a reviewable proposal from worker output with diff metadata; final writes still go through `write_file`.

CLI example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "run_command", "purpose": "test", "payload": { "command": "rm -rf /" } }'
```

Gateway mode:

```powershell
python bridge/zhimeng_bridge.py --serve
```

Gateway mode with allowlisted verification command execution:

```powershell
python bridge/zhimeng_bridge.py --serve --execute-command
```

Gateway mode with workspace file tools:

```powershell
python bridge/zhimeng_bridge.py --serve --execute-read --execute-write
```

Gateway mode with workspace file tools and Provider model-list probes:

```powershell
python bridge/zhimeng_bridge.py --serve --execute-read --execute-write --execute-provider
```

Gateway mode with reviewed activated Skill runtime:

```powershell
python bridge/zhimeng_bridge.py --serve --execute-skill
```

Gateway mode with explicit full-access file paths:

```powershell
python bridge/zhimeng_bridge.py --serve --execute-read --execute-write --full-access-files
```

Gateway mode with reviewed Windows scheduler install/uninstall:

```powershell
python bridge/zhimeng_bridge.py --serve --execute-read --execute-write --execute-scheduler
```

Gateway mode with bounded API/Web fetch:

```powershell
python bridge/zhimeng_bridge.py --serve --execute-read --execute-write --execute-provider --execute-web
```

Gateway mode with bounded API/Web fetch and HTTP/registered-stdio MCP connector:

```powershell
python bridge/zhimeng_bridge.py --serve --execute-read --execute-write --execute-provider --execute-web --execute-mcp
```

Gateway mode with conservative KAIROS heartbeat:

```powershell
python bridge/zhimeng_bridge.py --serve --kairos-interval 60
```

Gateway mode with KAIROS heartbeat and AutoDream background consolidation:

```powershell
python bridge/zhimeng_bridge.py --serve --kairos-interval 60 --autodream-interval 300 --autodream-threshold 2
```

Windows users can also double-click:

```powershell
启动织梦PersonalOS网关.cmd
```

Or run the desktop shell directly:

```powershell
启动织梦PersonalOS桌面版.cmd
启动织梦PersonalOS桌面版-网络权限.cmd
启动织梦PersonalOS桌面版-自检.cmd
```

Desktop launcher profiles:

```powershell
python desktop/zhimeng_desktop_launcher.py --list-profiles
python desktop/zhimeng_desktop_launcher.py --doctor
python desktop/zhimeng_desktop_launcher.py --profile workspace
python desktop/zhimeng_desktop_launcher.py --profile network
python desktop/zhimeng_desktop_launcher.py --profile full
python desktop/zhimeng_desktop_launcher.py --profile autonomy
python desktop/zhimeng_desktop_launcher.py --profile dev
```

`safe` is read-only workspace context. `workspace` enables workspace read/write tools. `network` also enables gated `web_fetch` plus HTTP and registered stdio MCP. `full` additionally enables full-access file paths. `autonomy` enables reviewed scheduler install/uninstall for KAIROS plans. `dev` enables the verification-command allowlist plus reviewed activated Skill runtime. Arbitrary shell commands remain disabled in every profile.

Package the desktop EXE:

```powershell
打包织梦PersonalOS桌面版.cmd
```

The result is `desktop-release/ZhimengPersonalOS/ZhimengPersonalOS.exe`. The packaged app can be checked with:

```powershell
desktop-release/ZhimengPersonalOS/ZhimengPersonalOS.exe --doctor
desktop-release/ZhimengPersonalOS/ZhimengPersonalOS.exe --doctor --profile workspace
desktop-release/ZhimengPersonalOS/ZhimengPersonalOS.exe --doctor --profile network
desktop-release/ZhimengPersonalOS/ZhimengPersonalOS.exe --profile network
```

Or double-click the opt-in verification command launcher:

```powershell
启动织梦PersonalOS网关-验证命令.cmd
```

Or double-click the opt-in scheduler permission launcher:

```powershell
启动织梦PersonalOS网关-定时任务权限.cmd
```

Or double-click the opt-in API/MCP permission launcher:

```powershell
启动织梦PersonalOS网关-MCP权限.cmd
```

The heartbeat and AutoDream daemon only record observation ticks and consolidate pending memory. They do not execute commands, write business files, fetch the web, or call MCP tools without a separate bridge request or approval.

Healthcheck:

```powershell
python bridge/healthcheck_bridge.py
python bridge/healthcheck_bridge.py --url http://127.0.0.1:8765
```

The healthcheck exercises status, MCP tools/list, safety review, sandbox probing, user modeling, memory consolidation, skill crystallization, workflow DAG, KAIROS logging, and subagent locks.
It also starts a temporary local OpenAI-compatible `/v1/models` server to verify Provider Hub catalog/status/probe behavior without touching real remote APIs.

Skill routing example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "skill_route", "purpose": "verify writing skills", "payload": { "task": "开始构思小说世界观", "domain": "writing", "local_limit": 8 } }'
```

`skill_route` returns active core skill specs, matched local/built-in `SKILL.md` entries, related memory banks, isolated skills, and excluded tool scopes. It is route-only: generated or activated skill scripts are never imported or executed by this action.

Agent context pack example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "context_pack", "purpose": "verify agent context", "payload": { "task": "开始构思小说世界观", "domain": "writing", "dimension": "skill", "limit": 4 } }'
```

`context_pack` is read-only. It composes `skill_route` and `memory_retrieve`, then returns `active_skill_keys`, compact `context_pack`, `tool_policy.excluded_tool_scopes`, and writeback rules.

File tool example:

```powershell
python bridge/zhimeng_bridge.py --execute-write --json '{ "action": "write_file", "purpose": "write workspace note", "payload": { "path": "bridge/agent-files/note.txt", "content": "hello", "execute": true, "access_profile": "workspace" } }'
```

`write_file` queues an approval draft by default. With `--execute-write` and `execute=true`, it writes UTF-8 text, creates parent folders, preserves an optional backup, and returns a diff preview. `access_profile=full_access` additionally requires `--full-access-files`.

Source audit example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "source_audit", "purpose": "audit agent research sources", "payload": { "sources": [ { "label": "OpenAI Codex docs", "url": "https://developers.openai.com/codex/" }, { "label": "dnakov/claude-code leaked archive", "url": "https://github.com/dnakov/claude-code" }, { "label": "Hermes Agent", "url": "https://github.com/NousResearch/hermes-agent" } ] } }'
```

`source_audit` is read-only and does not fetch, clone, or inspect repository contents. It classifies sources as official/open-source/community/leaked-risk/protected/unknown, then returns allowed uses and blocked uses. Known Claude Code leak archives are non-reusable; use them only as provenance-risk examples and learn architecture from official/public/open-source alternatives.

Source digest example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "source_digest", "purpose": "digest public agent architecture", "payload": { "persist": true } }'
```

`source_digest` first runs the same audit, excludes non-reusable sources from the learning context, and turns safe official/open-source patterns into Personal OS adoption layers: coordinator, memory/context, tool gateway, workflow DAG, subagents/locks, and evolution loop. It never fetches, clones, or inspects leaked repositories.

Goal bootstrap example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "goal_bootstrap", "purpose": "bootstrap Personal OS", "payload": { "goal": "把织梦写作台升级为 Personal OS", "persist": true, "spawn_subagents": true, "start_workers": true, "kairos": true } }'
```

`goal_bootstrap` turns the safe public agent architecture digest into a Goal Mode planner tree. It creates Phase 1-5 tasks, a detailed Phase 1 subtask tree, verification gates, bounded subagent specs, safe internal worker job plans, source-boundary rules, and next bridge requests. When `persist=true`, it registers a workflow DAG, optional subagent branches, a KAIROS long-running task record, and a compact bootstrap state file. When `start_workers=true`, it starts only allowlisted internal Gateway worker actions such as `source_digest`, `context_pack`, `safety_review`, `sandbox_status`, and `phase_audit`; it still does not fetch external sources, inspect leaked code, execute arbitrary shell commands, or execute model workers.

Skill bootstrap example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "skill_bootstrap", "purpose": "verify writing domain skills", "payload": { "task": "开始构思小说世界观", "domain": "writing", "persist": true, "spawn_subagents": true } }'
```

`skill_bootstrap` is the Phase 3 acceptance gate. It verifies that writing tasks mount `novel-creation-suite`, `novel-kb-manager`, `novel-distillation`, and `tomato-novel-auto-distill`; excludes `code.compile`, `package.install`, and `run_command`; builds a compact `context_pack`; prepares bounded writing-domain agents; and can register a workflow hook/subagent records when `persist=true`. It remains prompt-only and never imports or executes Skill scripts.

Skill invocation example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "skill_invoke", "purpose": "verify skill invoke", "payload": { "skill_key": "novel-creation-suite", "task": "开始构思小说世界观", "domain": "writing" } }'
```

`skill_invoke` returns a prompt-only invocation packet: selected skill spec, memory banks, compact context, suggested next bridge actions, and an invocation prompt. It never imports or executes activated Python files.

Local `SKILL.md` invocation example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "skill_invoke", "purpose": "invoke local skill instruction", "payload": { "skill_key": "novel-creation-suite", "task": "开始构思小说世界观", "domain": "writing", "max_skill_chars": 7000 } }'
```

If the requested key matches a local or bundled `SKILL.md`, the Gateway reads a bounded excerpt as instruction context and returns it inside the invocation packet. Script execution remains disabled unless a separate reviewed bridge action is added later.

Swarm bootstrap example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "swarm_bootstrap", "purpose": "verify Phase 4 swarm", "payload": { "task": "Personal OS Phase 4 swarm rehearsal", "scope": "workspace/current", "persist": true, "start_workers": true, "release_locks": true } }'
```

`swarm_bootstrap` is the Phase 4 acceptance gate. It registers bounded forked and isolated subagents, acquires a write lock, intentionally attempts a second same-scope write lock to prove conflict blocking, releases the rehearsal lock, starts allowlisted bridge-action workers (`context_pack`, `safety_review`, `sandbox_status`), and reports evidence. It does not spawn model-running workers, execute arbitrary shell commands, or modify user project files.

Evolution bootstrap example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "evolution_bootstrap", "purpose": "verify Phase 5 evolution", "payload": { "objective": "把织梦写作台升级为 Personal OS", "interval_minutes": 5, "activate_skill": true, "persist": true } }'
```

`evolution_bootstrap` is the Phase 5 acceptance gate. It registers a KAIROS task, runs an observation tick, appends the daily log, creates reviewed scheduler install/uninstall drafts, seeds and consolidates AutoDream memory, crystallizes a reusable Skill draft, activates the reviewed copy into `bridge/skills/activated/*.py`, and reflects an evidence-backed user-model belief. It does not install OS scheduled tasks, import/execute activated Skills, or perform external actions.

Scheduler install/uninstall example:

```powershell
python bridge/zhimeng_bridge.py --execute-scheduler --json '{ "action": "scheduler_install", "purpose": "install reviewed KAIROS task", "payload": { "plan_id": "scheduler-example", "execute": true } }'
python bridge/zhimeng_bridge.py --execute-scheduler --json '{ "action": "scheduler_uninstall", "purpose": "remove reviewed KAIROS task", "payload": { "plan_id": "scheduler-example", "execute": true } }'
```

`scheduler_install` and `scheduler_uninstall` only operate on plans already created by `scheduler_plan`. Without `--execute-scheduler` and `execute=true`, they return `approval_required` with the exact `schtasks` argv that would be used.

Completion audit example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "completion_audit", "purpose": "audit Personal OS against public agent architecture", "payload": {} }'
```

`completion_audit` is the top-level acceptance matrix. It reads the current manifest, MCP tool specs, memory, skill, scheduler, worker, subagent, sandbox, user-model, and phase-audit state. It intentionally reports `partial` while production gaps remain, including `production_mcp_transport`, `scheduler_install_requires_explicit_gate`, and explicitly gated activated Skills. Local OpenAI-compatible live calls, streaming chunk events, reviewable merge proposals, and model-worker hard cancel are covered by `healthcheck_bridge.py`.

Model worker example:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "worker_run", "purpose": "prepare bounded model worker", "payload": { "kind": "model_task", "provider": "ollama", "api_url": "http://127.0.0.1:11434", "model_id": "qwen2.5:14b", "prompt": "Summarize current Personal OS gaps.", "execute_model": false } }'
```

With `execute_model=false`, the Gateway only prepares and records the model task. To run a local Ollama model, set `execute_model=true`. For remote providers, also set `allow_remote_model=true` and provide `ZHIMENG_MODEL_API_KEY` or a one-shot `api_key`; the raw key is not written to worker state. When `stream_model=true` on an OpenAI-compatible endpoint, SSE chunks are appended to the worker event log and reconstructed into final output. When `merge_target_path` is present, successful model output becomes a reviewable merge proposal instead of directly writing a file. Executed model workers run in a controlled child process; `worker_cancel` terminates only the recorded child PID and records the result for audit.

Provider Hub examples:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "provider_catalog", "purpose": "list providers", "payload": { "limit": 40 } }'
python bridge/zhimeng_bridge.py --json '{ "action": "provider_status", "purpose": "check local provider", "payload": { "preset_id": "ollama-qwen" } }'
python bridge/zhimeng_bridge.py --json '{ "action": "provider_probe", "purpose": "probe local models", "payload": { "provider": "openai-compatible", "api_url": "http://127.0.0.1:1234/v1", "model_id": "local-model", "execute": true } }'
```

`provider_catalog` mirrors the editor presets, currently covering OpenAI-compatible routers/self-hosted endpoints, Anthropic, Gemini, and Ollama. `provider_status` is read-only and reports key requirements, local/remote classification, wire format, and a prepared model-worker payload. `provider_probe` is a bounded model-list check; remote probes require `allow_remote_model=true`, and keys should come from `ZHIMENG_MODEL_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or a one-shot redacted `api_key`.

Gateway endpoints:

- `GET /health`
- `GET /tools`
- `GET /runs`
- `GET /approvals`
- `POST /bridge`
- `POST /approval`
- `POST /mcp`

MCP-style JSON-RPC facade:

```json
{
  "jsonrpc": "2.0",
  "id": "init",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05"
  }
}
```

List tools:

```json
{
  "jsonrpc": "2.0",
  "id": "tools",
  "method": "tools/list",
  "params": {}
}
```

Call a tool through the same safety path:

```json
{
  "jsonrpc": "2.0",
  "id": "search-1",
  "method": "tools/call",
  "params": {
    "name": "search",
    "purpose": "Find workflow notes",
    "arguments": {
      "keyword": "Workflow DAG",
      "limit": 5
    }
  }
}
```

List/read Personal OS resources:

```json
{
  "jsonrpc": "2.0",
  "id": "resources",
  "method": "resources/list",
  "params": {}
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "manifest",
  "method": "resources/read",
  "params": {
    "uri": "zhimeng://manifest"
  }
}
```

List/get reusable prompts:

```json
{
  "jsonrpc": "2.0",
  "id": "prompts",
  "method": "prompts/list",
  "params": {}
}
```

This is an HTTP JSON-RPC facade for local tooling. It is not claiming to be a full production MCP transport yet, but it exposes the same core shape: initialize, list tools/resources/prompts, call tools, read resources, and return structured content.

Stdio JSON-RPC facade:

```powershell
'{"jsonrpc":"2.0","id":"tools","method":"tools/list","params":{}}' | python bridge/zhimeng_mcp_stdio.py --once
```

Long-running line-delimited mode is also supported:

```powershell
python bridge/zhimeng_mcp_stdio.py
```

Each input line should be one JSON-RPC request. The stdio facade reuses the same tool registry and safety path as `/mcp`.

Registered stdio MCP connector through the Gateway:

```powershell
python bridge/zhimeng_bridge.py --json '{ "action": "mcp_stdio_catalog", "purpose": "list built-in MCP stdio servers", "payload": {} }'
```

```powershell
python bridge/zhimeng_bridge.py --execute-mcp --json '{ "action": "mcp_call", "purpose": "call built-in Gateway MCP over stdio", "payload": { "transport": "stdio", "server_id": "zhimeng-local", "method": "tools/list", "params": {}, "execute": true } }'
```

Only registered `server_id` values are spawnable. The Gateway does not accept arbitrary stdio command strings from browser or model payloads.

Bridge request format used by the web UI:

```json
{
  "action": "search",
  "purpose": "Find project memory about AutoDream",
  "payload": {
    "keyword": "AutoDream",
    "limit": 10
  }
}
```

Workflow DAG request:

```json
{
  "action": "run",
  "purpose": "Register current writing workflow",
  "payload": {
    "workflow_id": "dag-writing-writeback",
    "name": "Hermes 写作生产线 DAG",
    "current_node_id": "canon_search",
    "nodes": [
      {
        "id": "canon_search",
        "label": "项目真值检索",
        "status": "ready",
        "dependsOn": ["intake"],
        "verification": "只注入命中的摘要切片，不把全部上下文塞给模型。"
      }
    ]
  }
}
```

Advance current node:

```json
{
  "action": "advance",
  "purpose": "Move DAG after verification",
  "payload": {
    "workflow_id": "dag-writing-writeback",
    "completed_node_id": "canon_search"
  }
}
```

KAIROS task request:

```json
{
  "action": "kairos_task",
  "purpose": "Remember to continue the current workflow later",
  "payload": {
    "task_id": "continue-current-dag",
    "objective": "Continue current writing workflow after review",
    "next_action": "Check workflow status and advance verified nodes",
    "source_workflow_id": "dag-writing-writeback",
    "interval_seconds": 3600
  }
}
```

KAIROS observation tick:

```json
{
  "action": "kairos_tick",
  "purpose": "Prepare due KAIROS suggestions",
  "payload": {
    "message": "manual heartbeat",
    "limit": 5,
    "include_suggestions": true
  }
}
```

`kairos_tick` updates queued/observing task timestamps, appends daily logs, and returns suggested `context_pack` / `skill_invoke` requests. It does not execute external actions.

Scheduler draft request:

```json
{
  "action": "scheduler_plan",
  "purpose": "Create KAIROS scheduler drafts",
  "payload": {
    "plan_id": "scheduler-kairos",
    "task_name": "ZhimengPersonalOSKairos",
    "interval_minutes": 5,
    "launcher": "启动织梦PersonalOS网关.cmd"
  }
}
```

The Gateway writes install/uninstall `.cmd.draft` files only. It does not call `schtasks` or register OS scheduled tasks.

Background worker job with an internal bridge action:

```json
{
  "action": "worker_run",
  "purpose": "Run an allowlisted agent context pack job in the background",
  "payload": {
    "job_id": "worker-context-pack",
    "agent_id": "context-worker",
    "kind": "bridge_action",
    "action": "context_pack",
    "payload": {
      "task": "开始构思小说世界观",
      "domain": "writing",
      "dimension": "skill",
      "limit": 4
    }
  }
}
```

Worker jobs can execute allowlisted internal bridge actions without shell access. The default frontend worker request uses `context_pack` so a background agent receives skills, compact memory, and tool exclusions together. Verification command workers are still available, but they require `--execute-command` plus `payload.execute=true`. Model workers can call approved local/remote providers, record OpenAI-compatible streaming chunks, and create merge proposals; hard cancellation remains the production gap.

Worker merge proposal from the latest completed output:

```json
{
  "action": "worker_merge_proposal",
  "purpose": "Turn reviewed worker output into a file merge draft",
  "payload": {
    "job_id": "model-worker-example",
    "target_path": "bridge/agent-files/worker-output.md",
    "mode": "replace"
  }
}
```

The proposal records `old_sha256`, `new_sha256`, `diff_preview`, and `proposal_path`. It does not edit the target file; after review, use `write_file` with an expected hash.

AutoDream memory event:

```json
{
  "action": "memory_event",
  "purpose": "Record a tool observation",
  "payload": {
    "dimension": "tool",
    "source": "gateway",
    "summary": "Workflow DAG was registered through the local Gateway.",
    "tags": ["workflow", "gateway"],
    "importance": 4
  }
}
```

Consolidate pending L1 events:

```json
{
  "action": "memory_consolidate",
  "purpose": "Compress pending L1 events into L2 summaries",
  "payload": {
    "dimension": "tool"
  }
}
```

Phase 2 memory bootstrap:

```json
{
  "action": "memory_bootstrap",
  "purpose": "Verify AutoDream L1/L2 memory",
  "payload": {
    "goal": "把织梦写作台升级为 Personal OS",
    "query": "Personal OS 长期记忆",
    "limit": 6
  }
}
```

`memory_bootstrap` seeds five simulated long-context L1 events across project, episode, skill, tool, and preference dimensions, consolidates pending L1 items into L2 summaries, then retrieves a compact context pack as evidence. It writes only local AutoDream state under `bridge/memory/autodream-state.json`; it does not call a model, fetch the web, or execute scripts.

Crystallize reusable skill drafts from L2 memory:

```json
{
  "action": "skill_crystallize",
  "purpose": "Turn repeated tool observations into a reviewed draft skill",
  "payload": {
    "dimension": "tool",
    "limit": 3
  }
}
```

Generated drafts use the `.py.draft` suffix and are not imported or executed by the Gateway. Review and approve them before turning them into real skills.

Review and activate a skill candidate:

```json
{
  "action": "skill_review",
  "purpose": "Review latest draft skill",
  "payload": {}
}
```

```json
{
  "action": "skill_activate",
  "purpose": "Activate reviewed skill candidate",
  "payload": {
    "candidate_id": "skill-...",
    "reviewed_by": "operator"
  }
}
```

Activation copies a reviewed `.py.draft` into `bridge/skills/activated/*.py` and records the event. Activated skills are still not imported or executed automatically.

Seven-layer safety review:

```json
{
  "action": "safety_review",
  "purpose": "Review a proposed command",
  "payload": {
    "action": "run_command",
    "purpose": "Inspect project files",
    "payload": {
      "command": "dir",
      "cwd": "."
    }
  }
}
```

Sandbox probe:

```json
{
  "action": "sandbox_probe",
  "purpose": "Verify conservative subprocess probing",
  "payload": {
    "probes": ["python", "node"],
    "timeout_seconds": 5
  }
}
```

Sandbox probes are allowlisted version checks only. Arbitrary shell commands remain disabled.

Allowlisted verification command:

```json
{
  "action": "run_command",
  "purpose": "Verify Python is available",
  "payload": {
    "command": "python --version",
    "execute": true,
    "timeout_seconds": 5
  }
}
```

This only executes when the Gateway was started with `--execute-command`. Current allowlist: `python/node/npm --version`, `python -m py_compile bridge/*.py`, `python bridge/healthcheck_bridge.py`, and `npx tsc --noEmit`. Commands run with `shell=false`; anything outside the allowlist remains blocked or approval-only.

Phase audit:

```json
{
  "action": "phase_audit",
  "purpose": "Audit Personal OS Phase 1-5 evidence and gaps",
  "payload": {}
}
```

The audit is intentionally evidence-backed. It reports implemented proof points and explicit remaining gaps such as the missing Rust core, production MCP transport, real worker concurrency, OS scheduler integration, or approved command executor.

Honcho-lite user model:

```json
{
  "action": "user_model_event",
  "purpose": "Record an evidence-backed preference",
  "payload": {
    "dimension": "preference",
    "stance": "claim",
    "summary": "User prefers implementation progress over pure planning.",
    "source": "conversation",
    "confidence": 0.7
  }
}
```

Reflect pending observations:

```json
{
  "action": "user_model_reflect",
  "purpose": "Consolidate tentative user model beliefs",
  "payload": {
    "dimension": "preference"
  }
}
```

The user model is evidence-backed only. Counterexamples lower confidence, and beliefs are tentative until reviewed.

Every `/bridge` and `/mcp tools/call` result also includes `safety_layers` with `intent`, `scope`, `source`, `permission`, `input`, `dry_run`, and `writeback`.

Subagent and lock registry:

```json
{
  "action": "subagent_spawn",
  "purpose": "Register a reviewer branch",
  "payload": {
    "agent_id": "reviewer-1",
    "label": "Reviewer",
    "mode": "isolated-context",
    "allowed_tools": ["search", "memory_status"]
  }
}
```

Acquire a write lock:

```json
{
  "action": "lock_acquire",
  "purpose": "Protect chapter outline edits",
  "payload": {
    "agent_id": "reviewer-1",
    "scope": "outline/chapter-001",
    "mode": "write"
  }
}
```

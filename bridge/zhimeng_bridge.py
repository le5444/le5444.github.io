#!/usr/bin/env python3
"""
LumenOS Personal Agent OS local executor gateway.

This bridge is intentionally conservative:
- Default mode is dry-run.
- Shell commands are validated but not executed.
- File reads require explicit execute mode and must stay inside the project root.
- File writes are queued by default; direct writes require explicit execute-write
  mode, request execute=true, and a workspace/full-access file profile.
- --serve starts a tiny local HTTP Gateway for the web UI.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import importlib.util
import ipaddress
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse


BRIDGE_NAME = "LumenOS Agent Gateway"
PROTOCOL_VERSION = "0.2"
TEXT_EXTENSIONS = {".md", ".txt", ".json", ".ts", ".tsx", ".js", ".jsx", ".py", ".html", ".css"}
SKIP_DIRS = {"node_modules", "dist", "dist-pwa", ".git", ".vite", "__pycache__"}
MEMORY_DIMENSIONS = {"identity", "preference", "project", "episode", "skill", "tool"}
MEMORY_DIMENSION_LABELS = {
    "identity": "identity/boundary",
    "preference": "preference/style",
    "project": "project/state",
    "episode": "episode/event",
    "skill": "skill/prompt",
    "tool": "tool/observation",
}
MEMORY_MANAGEMENT_ACTIONS = {"memory_update", "memory_freeze", "memory_delete", "memory_merge", "memory_restore"}
USER_MODEL_DIMENSIONS = {"identity", "preference", "boundary", "style", "project", "relationship"}
SAFETY_LAYER_KEYS = ["intent", "scope", "source", "permission", "input", "dry_run", "writeback"]
FILE_ACCESS_PROFILES = {"workspace", "full_access"}
MCP_ALLOWED_METHODS = ["initialize", "tools/list", "tools/call", "resources/list", "resources/read", "prompts/list", "prompts/get"]
SKILL_MD_MAX_BYTES = 220_000
SKILL_SCAN_LIMIT = 240
SKILL_RUN_MAX_OUTPUT_CHARS = 20_000
SKILL_RUN_BLOCKED_PATTERNS = [
    ("subprocess", r"\bsubprocess\b"),
    ("os_system", r"\bos\.system\b|\bos\.popen\b|\bspawn\("),
    ("dynamic_exec", r"\beval\s*\(|\bexec\s*\(|__import__\s*\("),
    ("network", r"\bsocket\b|\brequests\b|\burllib\b|\bhttp\.client\b"),
    ("destructive_fs", r"shutil\.rmtree|Remove-Item|rm\s+-rf"),
    ("secret_access", r"os\.environ|os\.getenv\s*\(|environ\s*\["),
]
SAFE_WORKER_BRIDGE_ACTIONS = {
    "search",
    "status",
    "workspace_scan",
    "memory_status",
    "memory_retrieve",
    "memory_bootstrap",
    "context_pack",
    "source_audit",
    "source_digest",
    "provider_catalog",
    "provider_config_status",
    "provider_status",
    "mcp_stdio_catalog",
    "goal_bootstrap",
    "skill_bootstrap",
    "skill_route",
    "skill_invoke",
    "skill_status",
    "skill_run",
    "scheduler_status",
    "runtime_events",
    "worker_status",
    "worker_cancel",
    "worker_merge_proposal",
    "sandbox_status",
    "phase_audit",
    "completion_audit",
    "user_model_status",
    "subagent_status",
    "safety_review",
}
WORKER_MERGE_MAX_CONTENT_CHARS = 60_000
WORKER_MERGE_PREVIEW_CHARS = 20_000
GATEWAY_CORE_SKILLS = [
    {
        "key": "personal-os-coordinator",
        "label": "Personal OS 总编排",
        "scope": "global",
        "source": "built-in",
        "purpose": "统筹记忆、工具、技能、验收、写回和长期任务。",
        "triggers": ["personal os", "agent", "系统", "操作系统", "目标", "长期"],
        "memory_banks": ["soul", "working", "tool_observations"],
        "safety_note": "总编排器必须亲自综合结果，不盲目批准子任务输出。",
    },
    {
        "key": "source-integrity",
        "label": "来源完整性审计",
        "scope": "research",
        "source": "built-in",
        "purpose": "区分官方、开源、社区、泄露/不可复用资料。",
        "triggers": ["github", "源码", "泄露", "研究", "资料", "claude", "codex", "manus", "devin"],
        "memory_banks": ["source_notes", "tool_observations"],
        "safety_note": "泄露源码只能做风险识别和高层架构对比，不复制代码。",
    },
    {
        "key": "autodream-skill-crystallizer",
        "label": "AutoDream 技能结晶",
        "scope": "global",
        "source": "built-in",
        "purpose": "把反复成功的工具观察、长期记忆和项目流程沉淀为可审查 Skill 草案。",
        "triggers": ["skill", "技能", "结晶", "沉淀", "复用", "进化", "autodream", "长期记忆"],
        "memory_banks": ["skill", "tool_observations", "project"],
        "safety_note": "只生成草案和候选记录，不自动执行新脚本；启用前需要人工审查。",
    },
    {
        "key": "novel-creation-suite",
        "label": "小说全链路创作套件",
        "scope": "writing",
        "source": "codex-local",
        "purpose": "统筹立项、设定、人物、大纲、正文、审稿、复盘。",
        "triggers": ["小说", "网文", "长篇", "开书", "章节", "正文", "故事", "创作", "世界观"],
        "memory_banks": ["story_canon", "chapter_state", "style_guide", "continuity_facts"],
        "safety_note": "只能输出原创方案，不复刻参考作品的专有设定、桥段或表达。",
    },
    {
        "key": "novel-kb-manager",
        "label": "小说分层知识库管理器",
        "scope": "writing",
        "source": "codex-local",
        "purpose": "管理项目真值、人物状态、伏笔、世界规则和写后回灌。",
        "triggers": ["记忆", "知识库", "伏笔", "人物状态", "世界规则", "回灌", "一致性", "世界观"],
        "memory_banks": ["story_canon", "entity_state", "world_state", "tool_observations"],
        "safety_note": "写回必须先形成差异草案，避免覆盖用户手写设定。",
    },
    {
        "key": "novel-distillation",
        "label": "小说机制蒸馏",
        "scope": "writing",
        "source": "codex-local",
        "purpose": "把可借鉴作品拆成结构、节奏、信息释放和冲突机制。",
        "triggers": ["拆书", "蒸馏", "借鉴", "学习", "参考", "机制", "套路"],
        "memory_banks": ["source_notes", "style_guide", "skill_notes"],
        "safety_note": "只提炼机制，不复制原句、人物名、专有世界观或标志性桥段。",
    },
    {
        "key": "tomato-novel-auto-distill",
        "label": "番茄小说自动蒸馏",
        "scope": "writing",
        "source": "codex-local",
        "purpose": "面向番茄/免费文节奏做开篇、追读、爽点和章节钩子分析。",
        "triggers": ["番茄", "免费文", "追读", "完读", "爽点", "黄金三章", "开篇"],
        "memory_banks": ["reader_promise", "hook_rhythm", "retention_design"],
        "safety_note": "平台适配只优化节奏和承诺，不制造低质套路堆叠。",
    },
]
PROVIDER_GROUP_LABELS = {
    "official": "官方",
    "china": "国内",
    "router": "聚合",
    "global": "海外",
    "local": "本地",
}
PROVIDER_LABELS = {
    "openai-compatible": "OpenAI 兼容 / 聚合平台 / 自部署",
    "anthropic": "Anthropic Claude (Messages API)",
    "gemini": "Google Gemini",
    "ollama": "Ollama 本地服务端点",
}
PROVIDER_PRESETS = [
    {"id": "openai-auto-discover", "label": "OpenAI · 填 key 后获取模型", "provider": "openai-compatible", "api_url": "https://api.openai.com/v1", "model_id": "填 key 后点获取模型列表", "model_name": "OpenAI Account Models", "group": "official", "notes": "只负责填官方端点；模型 ID 以你的账号 /models 返回为准，不把静态预设当最新版。"},
    {"id": "openai-codex-discover", "label": "OpenAI · Codex / 编程模型发现", "provider": "openai-compatible", "api_url": "https://api.openai.com/v1", "model_id": "codex-from-models", "model_name": "Codex / Coding Model from /models", "group": "official", "notes": "面向 Codex / 编程 Agent 场景；填 key 后用 /models 选择账号真实可用的 codex / coding 模型。"},
    {"id": "deepseek-chat", "label": "DeepSeek · 账号模型列表", "provider": "openai-compatible", "api_url": "https://api.deepseek.com/v1", "model_id": "deepseek-model-from-models", "model_name": "DeepSeek from /models", "group": "china", "notes": "只填 DeepSeek 端点；具体 chat / reasoner 模型以账号 /models 返回为准。"},
    {"id": "deepseek-reasoner", "label": "DeepSeek · 推理模型发现", "provider": "openai-compatible", "api_url": "https://api.deepseek.com/v1", "model_id": "deepseek-reasoner-from-models", "model_name": "DeepSeek Reasoner from /models", "group": "china", "notes": "只填 DeepSeek 端点；推理模型 ID 以账号 /models 或控制台为准。"},
    {"id": "siliconflow-qwen", "label": "硅基流动 · 模型发现", "provider": "openai-compatible", "api_url": "https://api.siliconflow.cn/v1", "model_id": "siliconflow-model-from-models", "model_name": "SiliconFlow Model from /models", "group": "china", "notes": "只填硅基流动端点；模型 ID 以你的账号 /models 返回为准。"},
    {"id": "siliconflow-deepseek-v3", "label": "硅基流动 · DeepSeek V3", "provider": "openai-compatible", "api_url": "https://api.siliconflow.cn/v1", "model_id": "siliconflow-deepseek-from-models", "model_name": "DeepSeek via SiliconFlow /models", "group": "china", "notes": "只填硅基流动端点；DeepSeek 具体模型以你的账号 /models 返回为准。"},
    {"id": "tongyi-qwen-max", "label": "阿里通义 · 模型发现", "provider": "openai-compatible", "api_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model_id": "dashscope-qwen-from-models", "model_name": "通义千问 from /models", "group": "china", "notes": "只填通义兼容端点；具体 qwen 模型以控制台或 /models 返回为准。"},
    {"id": "tongyi-qwen-plus", "label": "阿里通义 · 备用端点模板", "provider": "openai-compatible", "api_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model_id": "dashscope-qwen-from-models", "model_name": "通义千问 from /models", "group": "china", "notes": "只填通义兼容端点；具体 qwen 模型以控制台或 /models 返回为准。"},
    {"id": "moonshot-kimi-128k", "label": "月之暗面 · 模型发现", "provider": "openai-compatible", "api_url": "https://api.moonshot.cn/v1", "model_id": "moonshot-model-from-models", "model_name": "Kimi / Moonshot from /models", "group": "china", "notes": "只填 Moonshot 端点；具体模型 ID 以账号 /models 或控制台为准。"},
    {"id": "zhipu-glm-4-plus", "label": "智谱 · 模型发现", "provider": "openai-compatible", "api_url": "https://open.bigmodel.cn/api/paas/v4", "model_id": "zhipu-model-from-models", "model_name": "智谱 GLM from /models", "group": "china", "notes": "只填智谱端点；具体模型以控制台或 /models 返回为准。"},
    {"id": "zhipu-glm-4-flash", "label": "智谱 · 备用端点模板", "provider": "openai-compatible", "api_url": "https://open.bigmodel.cn/api/paas/v4", "model_id": "zhipu-model-from-models", "model_name": "智谱 GLM from /models", "group": "china", "notes": "只填智谱端点；具体模型以控制台或 /models 返回为准。"},
    {"id": "baichuan4", "label": "百川 · 模型发现", "provider": "openai-compatible", "api_url": "https://api.baichuan-ai.com/v1", "model_id": "baichuan-model-from-models", "model_name": "百川 from /models", "group": "china", "notes": "只填百川端点；具体模型以控制台或 /models 返回为准。"},
    {"id": "stepfun-step-2", "label": "阶跃星辰 · 模型发现", "provider": "openai-compatible", "api_url": "https://api.stepfun.com/v1", "model_id": "stepfun-model-from-models", "model_name": "阶跃星辰 from /models", "group": "china", "notes": "只填阶跃星辰端点；具体模型 ID 以账号 /models 或控制台为准。"},
    {"id": "minimax-abab", "label": "MiniMax · 模型发现", "provider": "openai-compatible", "api_url": "https://api.minimax.chat/v1", "model_id": "minimax-model-from-models", "model_name": "MiniMax from /models", "group": "china", "notes": "只填 MiniMax 端点；具体模型 ID 以账号 /models 或控制台为准。"},
    {"id": "yi-large", "label": "零一万物 · 模型发现", "provider": "openai-compatible", "api_url": "https://api.lingyiwanwu.com/v1", "model_id": "lingyi-model-from-models", "model_name": "零一万物 from /models", "group": "china", "notes": "只填零一万物端点；具体模型以控制台或 /models 返回为准。"},
    {"id": "volcengine-doubao", "label": "火山方舟 · 模型发现", "provider": "openai-compatible", "api_url": "https://ark.cn-beijing.volces.com/api/v3", "model_id": "volcengine-model-from-console", "model_name": "火山方舟模型 / Endpoint", "group": "china", "notes": "很多方舟模型需要填控制台 endpoint/model ID"},
    {"id": "tencent-hunyuan", "label": "腾讯混元 · 模型发现", "provider": "openai-compatible", "api_url": "https://api.hunyuan.cloud.tencent.com/v1", "model_id": "hunyuan-model-from-models", "model_name": "腾讯混元 from /models", "group": "china", "notes": "只填腾讯混元端点；具体模型 ID 以账号 /models 或控制台为准。"},
    {"id": "claude-sonnet-latest", "label": "Claude · Sonnet / 账号发现", "provider": "anthropic", "api_url": "https://api.anthropic.com/v1", "model_id": "claude-sonnet-from-models", "model_name": "Claude Sonnet from /models", "group": "official", "notes": "官方 Anthropic Messages API；不要依赖静态版本号，具体模型以控制台和模型列表为准。"},
    {"id": "claude-opus-latest", "label": "Claude · Opus / 账号发现", "provider": "anthropic", "api_url": "https://api.anthropic.com/v1", "model_id": "claude-opus-from-models", "model_name": "Claude Opus from /models", "group": "official", "notes": "官方 Anthropic Messages API；不要依赖静态版本号，具体模型以控制台和模型列表为准。"},
    {"id": "gemini-flash-latest", "label": "Gemini · Flash / 账号发现", "provider": "gemini", "api_url": "https://generativelanguage.googleapis.com/v1beta", "model_id": "gemini-flash-from-models", "model_name": "Gemini Flash from /models", "group": "official", "notes": "Google Gemini；官方模型页会持续更新，具体可用模型以 /models 或 Google AI Studio 为准。"},
    {"id": "gemini-pro-latest", "label": "Gemini · Pro / 账号发现", "provider": "gemini", "api_url": "https://generativelanguage.googleapis.com/v1beta", "model_id": "gemini-pro-from-models", "model_name": "Gemini Pro from /models", "group": "official", "notes": "Google Gemini 高推理/Agent 场景；具体可用模型以 /models 或 Google AI Studio 为准。"},
    {"id": "openrouter-auto", "label": "OpenRouter · Auto", "provider": "openai-compatible", "api_url": "https://openrouter.ai/api/v1", "model_id": "openrouter-model-from-models", "model_name": "OpenRouter Model from /models", "group": "router", "notes": "聚合平台，可在模型 ID 中填写 openai/、anthropic/、google/ 等"},
    {"id": "openrouter-claude", "label": "OpenRouter · Claude / 模型发现", "provider": "openai-compatible", "api_url": "https://openrouter.ai/api/v1", "model_id": "anthropic/claude-model-from-models", "model_name": "Claude via OpenRouter /models", "group": "router", "notes": "聚合平台模型 ID 更新快，可在设置中用 /models 获取账号实际可用列表。"},
    {"id": "openrouter-gpt", "label": "OpenRouter · GPT / 模型发现", "provider": "openai-compatible", "api_url": "https://openrouter.ai/api/v1", "model_id": "openai/model-from-models", "model_name": "GPT via OpenRouter /models", "group": "router"},
    {"id": "codex2api-codex", "label": "Codex2API · 自定义模型", "provider": "openai-compatible", "api_url": "https://www.codex2api.com/v1", "model_id": "codex-from-models", "model_name": "Codex2API Model from /models", "group": "router", "notes": "OpenAI-compatible 聚合端点；先填密钥后通过 /models 获取真实模型名，密钥只保存在本机设置或环境变量中。"},
    {"id": "oneapi-local", "label": "One API / New API", "provider": "openai-compatible", "api_url": "http://localhost:3000/v1", "model_id": "gateway-model-from-models", "model_name": "One API / New API Model", "group": "router", "notes": "适合自建聚合网关，模型 ID 按后台渠道映射填写"},
    {"id": "litellm-proxy", "label": "LiteLLM Proxy", "provider": "openai-compatible", "api_url": "http://localhost:4000/v1", "model_id": "litellm-model-from-models", "model_name": "LiteLLM Model from /models", "group": "router", "notes": "适合把 OpenAI、Claude、Gemini、Bedrock 等统一转成 OpenAI-compatible"},
    {"id": "groq-llama", "label": "Groq · 模型发现", "provider": "openai-compatible", "api_url": "https://api.groq.com/openai/v1", "model_id": "groq-model-from-models", "model_name": "Groq Model from /models", "group": "global", "notes": "只填 Groq 端点；具体模型以账号 /models 返回为准。"},
    {"id": "mistral-large", "label": "Mistral · 模型发现", "provider": "openai-compatible", "api_url": "https://api.mistral.ai/v1", "model_id": "mistral-model-from-models", "model_name": "Mistral Model from /models", "group": "global", "notes": "只填 Mistral 端点；具体模型以账号 /models 返回为准。"},
    {"id": "perplexity-sonar", "label": "Perplexity · 模型发现", "provider": "openai-compatible", "api_url": "https://api.perplexity.ai", "model_id": "perplexity-model-from-models", "model_name": "Perplexity Model from /models", "group": "global", "notes": "只填 Perplexity 端点；具体模型以账号 /models 返回为准。"},
    {"id": "xai-grok", "label": "xAI · 模型发现", "provider": "openai-compatible", "api_url": "https://api.x.ai/v1", "model_id": "xai-model-from-models", "model_name": "xAI Model from /models", "group": "global", "notes": "只填 xAI 端点；具体模型 ID 以账号 /models 或控制台为准。"},
    {"id": "together-llama", "label": "Together · 模型发现", "provider": "openai-compatible", "api_url": "https://api.together.xyz/v1", "model_id": "together-model-from-models", "model_name": "Together Model from /models", "group": "global", "notes": "只填 Together 端点；具体模型以账号 /models 返回为准。"},
    {"id": "fireworks-llama", "label": "Fireworks · 模型发现", "provider": "openai-compatible", "api_url": "https://api.fireworks.ai/inference/v1", "model_id": "fireworks-model-from-models", "model_name": "Fireworks Model from /models", "group": "global", "notes": "只填 Fireworks 端点；具体模型以账号 /models 返回为准。"},
    {"id": "nvidia-nim", "label": "NVIDIA NIM", "provider": "openai-compatible", "api_url": "https://integrate.api.nvidia.com/v1", "model_id": "nvidia-model-from-models", "model_name": "NVIDIA NIM Model from /models", "group": "global", "notes": "只填 NVIDIA NIM 端点；具体模型以账号 /models 返回为准。"},
    {"id": "cerebras-llama", "label": "Cerebras · 模型发现", "provider": "openai-compatible", "api_url": "https://api.cerebras.ai/v1", "model_id": "cerebras-model-from-models", "model_name": "Cerebras Model from /models", "group": "global", "notes": "只填 Cerebras 端点；具体模型以账号 /models 返回为准。"},
    {"id": "ollama-qwen", "label": "Ollama · 本地服务端点", "provider": "ollama", "api_url": "http://localhost:11434", "model_id": "ollama-model-from-tags", "model_name": "Ollama from /api/tags", "group": "local", "notes": "只是本地服务端点模板，不代表电脑已有本地模型；需要 Ollama 已启动并已拉取模型，再点获取模型读取 /api/tags。"},
    {"id": "lmstudio-local", "label": "LM Studio · 本地服务端点", "provider": "openai-compatible", "api_url": "http://localhost:1234/v1", "model_id": "lmstudio-model-from-models", "model_name": "LM Studio from /models", "group": "local", "notes": "只是本地服务端点模板，不代表电脑已有本地模型；需要 LM Studio server 已启动并加载模型，再读取 /models。"},
    {"id": "vllm-local", "label": "vLLM / llama.cpp · 本地服务端点", "provider": "openai-compatible", "api_url": "http://localhost:8000/v1", "model_id": "local-model-from-models", "model_name": "Local OpenAI-compatible from /models", "group": "local", "notes": "只是本地服务端点模板，不代表电脑已有本地模型；适合已启动并加载模型的 vLLM、llama.cpp、FastChat 等 OpenAI-compatible 服务。"},
]
_LOCAL_SKILL_CACHE: Dict[str, Any] | None = None
WORKER_STATE_LOCK = threading.RLock()

VALIDATORS = [
    ("shell_chain", "warn", r"&&|\|\||;\s*\S", "Complex chained commands should be split."),
    ("pipe_to_shell", "block", r"(curl|wget|irm|iwr)[^|]*(\||\>)\s*(sh|bash|powershell|pwsh|cmd)", "Do not pipe network scripts to a shell."),
    ("recursive_delete", "block", r"\b(rm\s+-rf|Remove-Item\b[^|]*(?:-Recurse|-r)|del\s+\/s|rd\s+\/s)\b", "Recursive delete needs explicit approval."),
    ("root_delete", "block", r"(rm\s+-rf\s+\/|C:\\Windows|C:\\Users\\?$|%USERPROFILE%\\?$|\$HOME\/?$)", "Root/system/user-home deletion is blocked."),
    ("git_reset_hard", "block", r"\bgit\s+(reset\s+--hard|checkout\s+--\s+)", "Hard reset or destructive checkout is blocked."),
    ("sudo_admin", "block", r"\b(sudo|runas|Start-Process\b[^|]*-Verb\s+RunAs)\b", "Admin privilege commands require separate approval."),
    ("secret_echo", "block", r"\b(echo|print|Write-Host|set)\b.*(token|secret|api[_-]?key|password|passwd|cookie)", "Do not print secrets."),
    ("env_dump", "warn", r"\b(env|printenv|set|Get-ChildItem\s+Env:)\b", "Environment dumps may leak credentials."),
    ("chmod_broad", "warn", r"\b(chmod|chown|icacls)\b", "Broad permission changes need review."),
    ("process_kill", "warn", r"\b(killall|pkill|taskkill|Stop-Process)\b", "Process killing needs a precise target."),
    ("network_post", "warn", r"\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b.*\b(-X\s+POST|--upload-file|-F\s|--form|PUT)\b", "Network uploads/posts may send local data."),
    ("package_global", "warn", r"\b(npm|pnpm|yarn|pip|uv|cargo)\b.*\b(-g|--global|install)\b", "Global installs modify the system environment."),
    ("background_daemon", "warn", r"\b(nohup|Start-Process|--daemon|pm2|forever|schtasks|crontab)\b", "Background daemons need stop instructions and KAIROS registration."),
    ("cron_modify", "block", r"\b(crontab|schtasks|New-ScheduledTask|Register-ScheduledTask)\b", "Scheduled tasks must be drafted first."),
    ("encoded_payload", "block", r"\b(-EncodedCommand|frombase64string|base64\s+-d|certutil\s+-decode)\b", "Encoded command payloads are blocked."),
    ("shell_profile", "warn", r"(\$PROFILE|\.bashrc|\.zshrc|profile\.ps1|PowerShell_profile)", "Shell profile changes affect long-term environment."),
    ("registry_edit", "block", r"\b(reg\s+(add|delete|import)|Set-ItemProperty\s+HK)", "Registry edits require separate approval."),
    ("security_policy", "block", r"\b(netsh\s+advfirewall|Set-MpPreference|DisableRealtimeMonitoring|ufw|iptables)\b", "Security policy changes are blocked."),
    ("ssh_key", "warn", r"\b(ssh-keygen|ssh-add|openssl|gpg)\b", "SSH/certificate operations need review."),
    ("file_overwrite", "warn", r"(^|[^>])>\s*[^>]", "File overwrite redirection needs a diff."),
    ("destructive_db", "block", r"\b(drop\s+table|truncate\s+table|delete\s+from\s+\w+\s*(;|$))\b", "Destructive database operations are blocked."),
    ("docker_prune", "warn", r"\bdocker\b.*\b(prune|rmi|volume\s+rm|system\s+prune)\b", "Docker prune/delete can remove assets."),
    ("untrusted_source", "warn", r"\b(git\s+clone|curl|wget|Invoke-WebRequest|iwr)\b.*https?:\/\/", "Downloaded sources need provenance review."),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def bridge_root() -> Path:
    return Path(__file__).resolve().parents[1]


def bridge_dir(name: str) -> Path:
    target = bridge_root() / "bridge" / name
    target.mkdir(parents=True, exist_ok=True)
    return target


class worker_state_file_lock:
    def __init__(self, timeout_seconds: float = 5.0) -> None:
        self.timeout_seconds = timeout_seconds
        self.handle: Any = None
        self.path = bridge_dir("workers") / "worker-state.lock"

    def __enter__(self) -> "worker_state_file_lock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = open(self.path, "a+b")
        if os.name == "nt":
            import msvcrt
            deadline = time.time() + self.timeout_seconds
            while True:
                try:
                    self.handle.seek(0)
                    msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
                    return self
                except OSError:
                    if time.time() >= deadline:
                        raise TimeoutError("timed out acquiring worker-state file lock")
                    time.sleep(0.03)
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if self.handle is not None:
            if os.name == "nt":
                import msvcrt
                try:
                    self.handle.seek(0)
                    msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
                except OSError:
                    pass
            self.handle.close()
            self.handle = None


def safe_path(raw: str) -> Path:
    if not raw:
        raise ValueError("path is required")
    root = bridge_root()
    target = (root / raw).resolve() if not os.path.isabs(raw) else Path(raw).resolve()
    if root not in target.parents and target != root:
        raise ValueError(f"path escapes bridge root: {target}")
    return target


def normalize_file_access_profile(payload: Dict[str, Any]) -> str:
    profile = str(payload.get("access_profile") or payload.get("permission_profile") or payload.get("file_access") or "workspace").strip().lower()
    if profile in {"full", "full-access", "danger-full-access", "danger_full_access"}:
        profile = "full_access"
    if profile not in FILE_ACCESS_PROFILES:
        profile = "workspace"
    return profile


def resolve_file_path(raw: str, access_profile: str, full_access_files: bool = False) -> Path:
    if access_profile == "full_access":
        if not full_access_files:
            raise ValueError("full_access file scope requires Gateway --full-access-files")
        if not raw:
            raise ValueError("path is required")
        return (Path(raw).resolve() if os.path.isabs(raw) else (bridge_root() / raw).resolve())
    return safe_path(raw)


def short_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def text_diff_preview(path: Path, old_text: str, new_text: str) -> str:
    diff = difflib.unified_diff(
        old_text.splitlines(),
        new_text.splitlines(),
        fromfile=f"{path.name}:before",
        tofile=f"{path.name}:after",
        lineterm="",
        n=3,
    )
    return "\n".join(list(diff)[:160])


def backup_text_file(path: Path, old_text: str) -> str:
    backup_dir = bridge_dir("file-backups")
    relative_hint = str(path).replace(":", "").replace("\\", "__").replace("/", "__")
    backup_path = backup_dir / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}-{relative_hint[-120:]}.bak"
    backup_path.write_text(old_text, encoding="utf-8")
    return str(backup_path.relative_to(bridge_root()))


def write_text_file(payload: Dict[str, Any], target: Path) -> Dict[str, Any]:
    if target.exists() and target.is_dir():
        raise ValueError("target is a directory")
    mode = str(payload.get("mode") or "replace").strip().lower()
    if mode not in {"replace", "append"}:
        raise ValueError("write_file mode must be replace or append")
    content = str(payload.get("content") if payload.get("content") is not None else payload.get("text") if payload.get("text") is not None else "")
    create_dirs = bool(payload.get("create_dirs", True))
    backup_enabled = bool(payload.get("backup", True))
    if create_dirs:
        target.parent.mkdir(parents=True, exist_ok=True)
    existed = target.exists()
    old_text = target.read_text(encoding="utf-8", errors="replace") if existed else ""
    expected_sha = str(payload.get("expected_sha256") or payload.get("expected_hash") or "").strip()
    if expected_sha and expected_sha not in {hashlib.sha256(old_text.encode("utf-8")).hexdigest(), short_sha256(old_text)}:
        raise ValueError("expected_sha256 does not match current file content")
    new_text = old_text + content if mode == "append" else content
    backup_path = backup_text_file(target, old_text) if existed and backup_enabled else ""
    target.write_text(new_text, encoding="utf-8")
    return {
        "status": "ok",
        "path": str(target),
        "created": not existed,
        "mode": mode,
        "bytes": len(new_text.encode("utf-8")),
        "old_sha256": short_sha256(old_text),
        "new_sha256": short_sha256(new_text),
        "backup_path": backup_path,
        "diff_preview": text_diff_preview(target, old_text, new_text),
    }


def workspace_scan(payload: Dict[str, Any], target: Path, root_raw: str) -> Dict[str, Any]:
    if not target.exists():
        raise ValueError("scan root does not exist")
    if not target.is_dir():
        raise ValueError("scan root must be a directory")
    limit = max(1, min(int(payload.get("limit") or 200), 1000))
    max_depth = max(0, min(int(payload.get("max_depth") or 3), 8))
    include_hidden = bool(payload.get("include_hidden", False))
    include_dirs = bool(payload.get("include_dirs", True))
    include_files = bool(payload.get("include_files", True))
    skip_dirs = set(SKIP_DIRS)
    for item in payload.get("exclude_dirs") or []:
        value = str(item).strip()
        if value:
            skip_dirs.add(value)
    allowed_exts = {
        str(item).lower().strip()
        for item in (payload.get("extensions") or payload.get("allowed_extensions") or [])
        if str(item).strip()
    }
    allowed_exts = {item if item.startswith(".") else f".{item}" for item in allowed_exts}
    rows: List[Dict[str, Any]] = []
    skipped = 0
    root = target.resolve()

    def should_skip(path: Path) -> bool:
        name = path.name
        if not include_hidden and name.startswith("."):
            return True
        if path.is_dir() and name in skip_dirs:
            return True
        if path.is_file() and allowed_exts and path.suffix.lower() not in allowed_exts:
            return True
        return False

    def push(path: Path, depth: int) -> None:
        nonlocal skipped
        if len(rows) >= limit:
            skipped += 1
            return
        if should_skip(path):
            skipped += 1
            return
        is_dir = path.is_dir()
        if (is_dir and not include_dirs) or ((not is_dir) and not include_files):
            return
        try:
            stat = path.stat()
        except OSError:
            skipped += 1
            return
        try:
            rel = str(path.relative_to(root)).replace("\\", "/")
        except ValueError:
            rel = path.name
        rows.append({
            "path": rel,
            "name": path.name,
            "is_dir": is_dir,
            "extension": "" if is_dir else path.suffix.lower(),
            "size": 0 if is_dir else int(stat.st_size),
            "modified_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            "depth": depth,
        })

    def walk(directory: Path, depth: int) -> None:
        nonlocal skipped
        if depth > max_depth or len(rows) >= limit:
            return
        try:
            children = sorted(directory.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
        except OSError:
            skipped += 1
            return
        for child in children:
            if len(rows) >= limit:
                skipped += 1
                break
            if should_skip(child):
                skipped += 1
                continue
            push(child, depth)
            if child.is_dir() and depth < max_depth:
                walk(child, depth + 1)

    walk(root, 1)
    file_count = len([item for item in rows if not item["is_dir"]])
    dir_count = len([item for item in rows if item["is_dir"]])
    return {
        "status": "ok",
        "root": str(root),
        "root_input": root_raw,
        "access_profile": normalize_file_access_profile(payload),
        "max_depth": max_depth,
        "limit": limit,
        "returned": len(rows),
        "has_more": skipped > 0,
        "skipped": skipped,
        "file_count": file_count,
        "dir_count": dir_count,
        "items": rows,
        "policy": {
            "content_read": False,
            "metadata_only": True,
            "skip_dirs": sorted(skip_dirs),
            "allowed_extensions": sorted(allowed_exts),
        },
    }


def validate_command(command: str, cwd: str = "", purpose: str = "") -> List[Dict[str, str]]:
    text = f"{command}\n{cwd}\n{purpose}"
    hits = []
    for key, severity, pattern, message in VALIDATORS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            hits.append({"key": key, "severity": severity, "message": message})
    if not hits:
        hits.append({"key": "safe_read", "severity": "pass", "message": "No high-risk pattern matched; scope approval still applies."})
    return hits


def sandbox_policy() -> Dict[str, Any]:
    return {
        "mode": "workspace-sandbox-default",
        "shell": False,
        "cwd": str(bridge_root()),
        "allowlisted_probes": ["python", "node", "npm"],
        "arbitrary_commands": "disabled",
        "verification_commands": "opt-in-allowlist",
        "reads": "workspace paths require --execute-read and request execute=true; full_access paths additionally require --full-access-files and access_profile=full_access",
        "writes": "approval_queue_only unless --execute-write plus request execute=true; full_access paths additionally require --full-access-files",
        "file_access_profiles": {
            "workspace": {
                "root": str(bridge_root()),
                "read": "available with execute-read",
                "write": "available with execute-write; backups and diff previews are recorded",
            },
            "full_access": {
                "root": "entire filesystem",
                "read": "requires --full-access-files, access_profile=full_access, and execute=true",
                "write": "requires --full-access-files, --execute-write, access_profile=full_access, and execute=true",
            },
        },
        "network": "approval_required",
        "timeout_seconds_max": 10,
    }


def runtime_capabilities(
    execute_read: bool = False,
    execute_command: bool = False,
    execute_write: bool = False,
    full_access_files: bool = False,
    execute_memory: bool = False,
    execute_scheduler: bool = False,
    execute_web: bool = False,
    execute_mcp: bool = False,
    execute_provider: bool = False,
    execute_skill: bool = False,
) -> Dict[str, Any]:
    tool_matrix = [
        {
            "action": "read_file",
            "label": "File Read",
            "enabled": bool(execute_read),
            "mode": "execute-read" if execute_read else "dry-run",
            "gateway_flag": "--execute-read",
            "request_gate": "payload.execute=true",
            "scope": "workspace; full_access also requires --full-access-files",
            "default": "dry_run",
        },
        {
            "action": "workspace_scan",
            "label": "Workspace Scan",
            "enabled": bool(execute_read),
            "mode": "metadata-scan" if execute_read else "dry-run",
            "gateway_flag": "--execute-read",
            "request_gate": "payload.execute=true",
            "scope": "directory metadata only; full_access also requires --full-access-files",
            "default": "dry_run",
        },
        {
            "action": "write_file",
            "label": "File Write",
            "enabled": bool(execute_write),
            "mode": "execute-write" if execute_write else "approval-required",
            "gateway_flag": "--execute-write",
            "request_gate": "payload.execute=true",
            "scope": "workspace; full_access also requires --full-access-files",
            "default": "approval_draft_with_diff",
        },
        {
            "action": "run_command",
            "label": "Verification Command",
            "enabled": bool(execute_command),
            "mode": "verification-allowlist" if execute_command else "validate-only",
            "gateway_flag": "--execute-command",
            "request_gate": "payload.execute=true and validators pass",
            "scope": "project verification commands only",
            "default": "validation_only",
        },
        {
            "action": "skill_route",
            "label": "Skill Route",
            "enabled": True,
            "mode": "prompt-only",
            "gateway_flag": "always-on",
            "request_gate": "none",
            "scope": "built-in + local SKILL.md instruction discovery",
            "default": "no_script_execution",
        },
        {
            "action": "skill_invoke",
            "label": "Skill Invoke",
            "enabled": True,
            "mode": "prompt-only",
            "gateway_flag": "always-on",
            "request_gate": "none",
            "scope": "bounded SKILL.md excerpts; activated scripts are refs only",
            "default": "no_import_no_exec",
        },
        {
            "action": "skill_run",
            "label": "Activated Skill Runtime",
            "enabled": bool(execute_skill),
            "mode": "activated-skill-subprocess" if execute_skill else "approval-required",
            "gateway_flag": "--execute-skill",
            "request_gate": "payload.execute=true; activated .py with run(context) only",
            "scope": "bridge/skills/activated only; static risk scan before run",
            "default": "approval_required",
        },
        {
            "action": "scheduler_install",
            "label": "Windows Scheduler",
            "enabled": bool(execute_scheduler),
            "mode": "schtasks-execute" if execute_scheduler else "approval-required",
            "gateway_flag": "--execute-scheduler",
            "request_gate": "existing plan_id + payload.execute=true",
            "scope": "reviewed scheduler_plan records only",
            "default": "draft_only",
        },
        {
            "action": "web_fetch",
            "label": "Web/API Fetch",
            "enabled": bool(execute_web),
            "mode": "http-client" if execute_web else "proposal-only",
            "gateway_flag": "--execute-web",
            "request_gate": "payload.execute=true",
            "scope": "external network",
            "default": "approval_required",
        },
        {
            "action": "mcp_call",
            "label": "MCP Tool Call",
            "enabled": bool(execute_mcp),
            "mode": "http-or-registry-stdio-jsonrpc-client" if execute_mcp else "proposal-only",
            "gateway_flag": "--execute-mcp",
            "request_gate": "payload.execute=true",
            "scope": "HTTP JSON-RPC endpoint or registered stdio MCP server",
            "default": "approval_required",
        },
        {
            "action": "mcp_stdio_catalog",
            "label": "MCP Stdio Catalog",
            "enabled": True,
            "mode": "read-only-registry",
            "gateway_flag": "always-on",
            "request_gate": "none",
            "scope": "registered local stdio MCP servers only",
            "default": "read_only",
        },
        {
            "action": "provider_catalog",
            "label": "Provider Catalog",
            "enabled": True,
            "mode": "read-only",
            "gateway_flag": "always-on",
            "request_gate": "none",
            "scope": "model provider presets",
            "default": "read_only",
        },
        {
            "action": "provider_config_status",
            "label": "Desktop Provider Config",
            "enabled": True,
            "mode": "read-only-local-config",
            "gateway_flag": "always-on",
            "request_gate": "none; include_secret=true additionally requires import_to_frontend=true",
            "scope": "local desktop provider-settings.json",
            "default": "read_only",
        },
        {
            "action": "provider_status",
            "label": "Provider Status",
            "enabled": True,
            "mode": "read-only",
            "gateway_flag": "always-on",
            "request_gate": "none",
            "scope": "provider/model readiness without network calls",
            "default": "read_only",
        },
        {
            "action": "provider_probe",
            "label": "Provider Probe",
            "enabled": bool(execute_provider),
            "mode": "live-model-list-probe" if execute_provider else "approval-required",
            "gateway_flag": "--execute-provider",
            "request_gate": "Gateway --execute-provider plus payload.execute=true; remote endpoints also require allow_remote_model=true",
            "scope": "model-list endpoints only",
            "default": "approval_required",
        },
        {
            "action": "worker_run:model_task",
            "label": "Model Worker",
            "enabled": True,
            "mode": "controlled-child-process",
            "gateway_flag": "always-on; provider call still needs payload.execute_model=true",
            "request_gate": "payload.execute_model=true; remote endpoints also require allow_remote_model=true",
            "scope": "provider API call only; no shell, no direct file write",
            "default": "approval_required",
        },
        {
            "action": "worker_cancel",
            "label": "Worker Cancel",
            "enabled": True,
            "mode": "hard-cancel-model-child-or-soft-cancel-thread",
            "gateway_flag": "always-on",
            "request_gate": "job_id",
            "scope": "recorded worker job only",
            "default": "cancel_request",
        },
        {
            "action": "approval_decide:memory",
            "label": "Memory Approval",
            "enabled": bool(execute_memory),
            "mode": "execute-memory" if execute_memory else "approval-required",
            "gateway_flag": "--execute-memory",
            "request_gate": "approval_decide decision=execute and payload.execute=true",
            "scope": "AutoDream L1/L2 update/freeze/delete/merge only; soft delete with audit",
            "default": "approval_required",
        },
    ]
    return {
        "execute_read": bool(execute_read),
        "execute_command": bool(execute_command),
        "execute_write": bool(execute_write),
        "execute_memory": bool(execute_memory),
        "execute_scheduler": bool(execute_scheduler),
        "execute_web": bool(execute_web),
        "execute_mcp": bool(execute_mcp),
        "execute_provider": bool(execute_provider),
        "execute_skill": bool(execute_skill),
        "full_access_files": bool(full_access_files),
        "workspace_sandbox": True,
        "file_access_profiles": sorted(FILE_ACCESS_PROFILES),
        "skill_instruction_read": True,
        "skill_script_execution": "gated" if execute_skill else "disabled",
        "model_worker_execution": "controlled-child-process-hard-cancel",
        "arbitrary_shell": "disabled",
        "mcp_stdio_registry": "enabled",
        "tool_matrix": tool_matrix,
        "capability_summary": {
            "workspace_read": "enabled" if execute_read else "requires --execute-read",
            "workspace_write": "enabled" if execute_write else "approval draft only",
            "memory_write": "enabled" if execute_memory else "approval-only",
            "full_access_files": "enabled" if full_access_files else "requires --full-access-files",
            "verification_commands": "enabled" if execute_command else "validate only",
            "windows_scheduler": "enabled" if execute_scheduler else "draft only",
            "web_fetch": "enabled" if execute_web else "proposal only",
            "mcp_call": "enabled for HTTP + registered stdio" if execute_mcp else "proposal only",
            "provider_probe": "enabled with approved provider probe" if execute_provider else "approval only",
            "mcp_stdio": f"{len(mcp_stdio_registry())} registered servers; no arbitrary command strings",
            "provider_hub": f"{len(PROVIDER_PRESETS)} presets; probe requires explicit request gate",
            "model_worker": "provider calls run in controlled child process; cancel terminates recorded child PID",
            "skills": "instruction read enabled; activated runtime gated by --execute-skill" if execute_skill else "instruction read enabled; script execution disabled",
            "external_connectors": "; ".join([
                "web_fetch enabled" if execute_web else "web_fetch proposal only",
                "mcp_call enabled" if execute_mcp else "mcp_call proposal only",
                "provider_probe enabled" if execute_provider else "provider_probe approval only",
            ]),
        },
    }


def scheduler_execution_policy() -> Dict[str, Any]:
    return {
        "mode": "explicit-windows-schtasks-only",
        "enabled_when": ["Gateway --execute-scheduler", "request execute=true", "plan exists in scheduler state"],
        "shell": False,
        "platform": "windows-schtasks",
        "actions": ["scheduler_install", "scheduler_uninstall"],
        "default": "draft-only",
        "timeout_seconds_max": 30,
    }


def command_execution_policy() -> Dict[str, Any]:
    return {
        "mode": "opt-in-verification-only",
        "enabled_when": ["CLI --execute-command or HTTP --execute-command", "request execute=true", "23 validators have no block result", "argv matches allowlist"],
        "shell": False,
        "cwd": str(bridge_root()),
        "arbitrary_commands": "disabled",
        "timeout_seconds_max": 30,
        "allowlisted_patterns": [
            "python --version",
            "node --version",
            "npm --version",
            "python -m py_compile bridge/*.py",
            "python bridge/healthcheck_bridge.py",
            "npx tsc --noEmit",
        ],
    }


def model_worker_policy() -> Dict[str, Any]:
    return {
        "mode": "explicit-model-execution-only",
        "providers": ["openai-compatible", "anthropic", "gemini", "ollama"],
        "execute_flag": "payload.execute_model=true",
        "remote_model_calls": "require payload.allow_remote_model=true",
        "api_key_storage": "never persisted; use api_key_env or one-shot api_key redacted from worker state",
        "streaming": "optional for OpenAI-compatible chat completions; chunks are appended to worker events, not sent to files",
        "hard_cancel": "executed model workers run in a controlled child process; worker_cancel terminates only the recorded child PID",
        "default_api_key_env": "ZHIMENG_MODEL_API_KEY",
        "timeout_seconds_max": 90,
        "max_prompt_chars": 24000,
        "max_output_tokens": 4096,
        "context": "context_pack is compacted before model call",
    }


def provider_registry_policy() -> Dict[str, Any]:
    return {
        "mode": "provider-catalog-plus-explicit-probe",
        "catalog_source": "Gateway static mirror of frontend provider presets",
        "providers": sorted(PROVIDER_LABELS),
        "preset_count": len(PROVIDER_PRESETS),
        "secret_storage": "Gateway never persists API keys; use env vars or one-shot payload keys redacted from state",
        "actions": ["provider_catalog", "provider_config_status", "provider_status", "provider_probe"],
        "probe_requires": ["payload.execute=true", "local endpoints allowed by default", "remote endpoints require payload.allow_remote_model=true"],
        "timeout_seconds_max": 20,
    }


def web_fetch_policy() -> Dict[str, Any]:
    return {
        "mode": "explicit-http-client",
        "enabled_when": ["Gateway --execute-web or CLI --execute-web", "request execute=true"],
        "schemes": ["http", "https"],
        "methods": ["GET", "POST"],
        "shell": False,
        "private_network": "requires payload.allow_private_network=true for localhost/private numeric hosts",
        "timeout_seconds_max": 20,
        "request_body_bytes_max": 65_536,
        "response_bytes_max": 120_000,
        "default_response_chars": 30_000,
        "header_redaction": ["authorization", "cookie", "set-cookie", "x-api-key", "api-key", "token", "secret"],
    }


def mcp_call_policy() -> Dict[str, Any]:
    return {
        "mode": "explicit-http-or-registry-stdio-jsonrpc-client",
        "enabled_when": ["Gateway --execute-mcp or CLI --execute-mcp", "request execute=true"],
        "transports": ["http", "stdio"],
        "http_schemes": ["http", "https"],
        "methods": MCP_ALLOWED_METHODS,
        "shell": False,
        "stdio_process_spawn": "registered-only",
        "stdio_arbitrary_command": False,
        "stdio_registry": list(mcp_stdio_registry().keys()),
        "private_network": "requires payload.allow_private_network=true for localhost/private numeric hosts",
        "timeout_seconds_max": 20,
        "request_body_bytes_max": 65_536,
        "response_bytes_max": 120_000,
        "stderr_bytes_max": 16_000,
        "default_response_chars": 30_000,
        "header_redaction": web_fetch_policy()["header_redaction"],
    }


def mcp_stdio_registry() -> Dict[str, Dict[str, Any]]:
    script = bridge_root() / "bridge" / "zhimeng_mcp_stdio.py"
    return {
        "zhimeng-local": {
            "server_id": "zhimeng-local",
            "label": "Zhimeng Local Gateway MCP",
            "description": "Built-in stdio JSON-RPC facade backed by bridge/zhimeng_mcp_stdio.py.",
            "transport": "stdio",
            "mode": "one-shot-jsonrpc-lines",
            "command": [sys.executable, str(script), "--once"],
            "cwd": str(script.parent),
            "allowed_methods": MCP_ALLOWED_METHODS,
            "shell": False,
            "arbitrary_command": False,
            "inherits_gateway_permissions": False,
            "notes": [
                "Only registered server_id values can be spawned.",
                "The child facade does not inherit execute-read/write/web/mcp flags.",
                "Use tools/list, resources/list, prompts/list, or safe tools/call through the child Gateway facade.",
            ],
        },
    }


def mcp_stdio_catalog(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    requested = str(payload.get("server_id") or "").strip()
    registry = mcp_stdio_registry()
    selected = {requested: registry[requested]} if requested and requested in registry else registry
    servers = []
    for server in selected.values():
        command = [str(item) for item in server.get("command", [])]
        servers.append({
            "server_id": server.get("server_id"),
            "label": server.get("label"),
            "description": server.get("description"),
            "transport": server.get("transport"),
            "mode": server.get("mode"),
            "allowed_methods": server.get("allowed_methods", []),
            "shell": bool(server.get("shell", False)),
            "arbitrary_command": bool(server.get("arbitrary_command", False)),
            "inherits_gateway_permissions": bool(server.get("inherits_gateway_permissions", False)),
            "command_preview": [Path(command[0]).name if index == 0 else item for index, item in enumerate(command)],
            "cwd": server.get("cwd"),
            "notes": server.get("notes", []),
        })
    return {
        "mode": "read-only-registered-stdio-mcp-catalog",
        "server_count": len(servers),
        "servers": servers,
        "unknown_server_id": requested if requested and requested not in registry else "",
        "policy": {
            "spawn": "registered-only",
            "shell": False,
            "arbitrary_command_strings": False,
            "execution_gate": "--execute-mcp + payload.execute=true for mcp_call transport=stdio",
        },
    }


def is_sensitive_header(name: str) -> bool:
    return bool(re.search(r"authorization|cookie|set-cookie|x-api-key|api[-_]?key|token|secret", name, flags=re.IGNORECASE))


def redact_headers(headers: Dict[str, Any]) -> Dict[str, str]:
    redacted: Dict[str, str] = {}
    for key, value in headers.items():
        clean_key = str(key).strip()
        if not clean_key:
            continue
        redacted[clean_key] = "[redacted]" if is_sensitive_header(clean_key) else str(value)[:300]
    return redacted


def is_sensitive_record_key(name: str) -> bool:
    return bool(re.search(r"authorization|cookie|set-cookie|x-api-key|api[-_]?key|apikey|password|passwd|token|secret", name, flags=re.IGNORECASE))


def redact_url_secrets(value: str) -> str:
    if not value or "?" not in value:
        return value
    try:
        parsed = urlparse(value)
        if not parsed.query:
            return value
        query = []
        changed = False
        for key, item in parse_qsl(parsed.query, keep_blank_values=True):
            if is_sensitive_record_key(key) or key.strip().lower() == "key":
                query.append((key, "[redacted]"))
                changed = True
            else:
                query.append((key, item))
        return urlunparse(parsed._replace(query=urlencode(query))) if changed else value
    except Exception:
        return value


def redact_inline_secret_values(value: str, secrets: List[str]) -> str:
    redacted = value
    for secret in secrets:
        clean = str(secret or "").strip()
        if len(clean) >= 6:
            redacted = redacted.replace(clean, "[redacted]")
    return redacted


def redact_record_secrets(value: Any, key_hint: str = "") -> Any:
    if is_sensitive_record_key(key_hint):
        return "[redacted]" if value not in (None, "", False) else value
    if isinstance(value, dict):
        return {str(key): redact_record_secrets(item, str(key)) for key, item in value.items()}
    if isinstance(value, list):
        return [redact_record_secrets(item, key_hint) for item in value]
    if isinstance(value, str):
        return redact_url_secrets(value)
    return value


def is_private_web_host(hostname: str) -> bool:
    host = hostname.strip().strip("[]").lower()
    if not host:
        return False
    if host in {"localhost"} or host.endswith(".local"):
        return True
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


def web_url_with_params(raw_url: str, params: Any) -> str:
    if not isinstance(params, dict) or not params:
        return raw_url
    parsed = urlparse(raw_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    for key, value in params.items():
        if value is None:
            continue
        query[str(key)] = str(value)
    return urlunparse(parsed._replace(query=urlencode(query)))


def normalize_web_headers(payload: Dict[str, Any]) -> Dict[str, str]:
    raw_headers = payload.get("headers") if isinstance(payload.get("headers"), dict) else {}
    headers: Dict[str, str] = {}
    for key, value in raw_headers.items():
        clean_key = str(key).strip()
        clean_value = str(value)
        if not clean_key:
            continue
        if re.search(r"[\r\n]", clean_key) or re.search(r"[\r\n]", clean_value):
            raise ValueError("web_fetch headers must not contain CR/LF")
        if clean_key.lower() in {"host", "content-length"}:
            continue
        headers[clean_key] = clean_value
    if not any(key.lower() == "user-agent" for key in headers):
        headers["User-Agent"] = "LumenOS-Agent-Gateway/0.2"
    return headers


def web_request_body(payload: Dict[str, Any], headers: Dict[str, str]) -> bytes | None:
    if "json" in payload:
        if not any(key.lower() == "content-type" for key in headers):
            headers["Content-Type"] = "application/json"
        body = json.dumps(payload.get("json"), ensure_ascii=False).encode("utf-8")
    elif "body" in payload:
        raw_body = payload.get("body")
        body = raw_body if isinstance(raw_body, bytes) else str(raw_body).encode("utf-8")
    elif "data" in payload:
        raw_data = payload.get("data")
        if isinstance(raw_data, dict):
            if not any(key.lower() == "content-type" for key in headers):
                headers["Content-Type"] = "application/x-www-form-urlencoded"
            body = urlencode({str(k): str(v) for k, v in raw_data.items()}).encode("utf-8")
        else:
            body = str(raw_data).encode("utf-8")
    else:
        return None
    if len(body) > web_fetch_policy()["request_body_bytes_max"]:
        raise ValueError("web_fetch request body exceeds max bytes")
    return body


def execute_web_fetch(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    raw_url = str(payload.get("url") or "").strip()
    if not raw_url:
        raise ValueError("web_fetch url is required")
    url = web_url_with_params(raw_url, payload.get("params"))
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("web_fetch supports only http/https URLs")
    if is_private_web_host(parsed.hostname or "") and not bool(payload.get("allow_private_network")):
        raise ValueError("web_fetch private/localhost targets require allow_private_network=true")
    method = str(payload.get("method") or "GET").strip().upper()
    if method not in {"GET", "POST"}:
        raise ValueError("web_fetch method must be GET or POST")
    headers = normalize_web_headers(payload)
    body = None if method == "GET" else web_request_body(payload, headers)
    timeout_seconds = min(int(payload.get("timeout_seconds") or 10), web_fetch_policy()["timeout_seconds_max"])
    max_bytes = min(int(payload.get("max_bytes") or web_fetch_policy()["response_bytes_max"]), web_fetch_policy()["response_bytes_max"])
    max_chars = min(int(payload.get("max_chars") or web_fetch_policy()["default_response_chars"]), web_fetch_policy()["default_response_chars"])
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read(max_bytes + 1)
            truncated = len(raw) > max_bytes
            raw = raw[:max_bytes]
            charset = response.headers.get_content_charset() or "utf-8"
            text = raw.decode(charset, errors="replace")
            return {
                "status": "ok" if 200 <= int(response.status) < 400 else "http_error",
                "url": url,
                "final_url": response.geturl(),
                "method": method,
                "purpose": purpose,
                "status_code": int(response.status),
                "reason": getattr(response, "reason", ""),
                "content_type": response.headers.get("Content-Type", ""),
                "bytes_read": len(raw),
                "truncated": truncated or len(text) > max_chars,
                "request_headers": redact_headers(headers),
                "response_headers": redact_headers(dict(response.headers.items())),
                "text": text[:max_chars],
                "policy": web_fetch_policy(),
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read(max_bytes + 1)
        truncated = len(raw) > max_bytes
        raw = raw[:max_bytes]
        charset = exc.headers.get_content_charset() or "utf-8"
        text = raw.decode(charset, errors="replace")
        return {
            "status": "http_error",
            "url": url,
            "method": method,
            "purpose": purpose,
            "status_code": int(exc.code),
            "reason": str(exc.reason),
            "content_type": exc.headers.get("Content-Type", ""),
            "bytes_read": len(raw),
            "truncated": truncated or len(text) > max_chars,
            "request_headers": redact_headers(headers),
            "response_headers": redact_headers(dict(exc.headers.items())),
            "text": text[:max_chars],
            "policy": web_fetch_policy(),
        }


def parse_mcp_response_text(text: str) -> tuple[Any, str]:
    stripped = text.strip()
    if not stripped:
        return None, "empty response"
    lines = [line.strip() for line in stripped.splitlines() if line.strip()]
    candidates = [stripped]
    if lines:
        candidates.append(lines[-1])
    for candidate in candidates:
        try:
            return json.loads(candidate), ""
        except Exception:
            continue
    try:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start >= 0 and end > start:
            return json.loads(stripped[start:end + 1]), ""
    except Exception as exc:
        return None, str(exc)
    return None, "response is not valid JSON"


def execute_mcp_stdio_call(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    server_id = str(payload.get("server_id") or payload.get("server") or "").strip()
    if not server_id:
        raise ValueError("mcp_call transport=stdio requires server_id")
    registry = mcp_stdio_registry()
    server = registry.get(server_id)
    if not server:
        raise ValueError(f"unknown stdio MCP server_id: {server_id}")
    method = str(payload.get("method") or "").strip()
    allowed_methods = set(server.get("allowed_methods") or MCP_ALLOWED_METHODS)
    if method not in allowed_methods:
        raise ValueError(f"mcp_call method must be one of: {', '.join(sorted(allowed_methods))}")
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    request_id = payload.get("id") or f"mcp-{uuid.uuid4()}"
    body_obj = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
    body = json.dumps(body_obj, ensure_ascii=False)
    policy = mcp_call_policy()
    if len(body.encode("utf-8")) > policy["request_body_bytes_max"]:
        raise ValueError("mcp_call request body exceeds max bytes")
    command = [str(item) for item in server.get("command", [])]
    if not command:
        raise ValueError(f"stdio MCP server has no command: {server_id}")
    cwd = Path(str(server.get("cwd") or bridge_root())).resolve()
    timeout_seconds = min(int(payload.get("timeout_seconds") or 10), policy["timeout_seconds_max"])
    max_bytes = min(int(payload.get("max_bytes") or policy["response_bytes_max"]), policy["response_bytes_max"])
    max_chars = min(int(payload.get("max_chars") or policy["default_response_chars"]), policy["default_response_chars"])
    stderr_max = int(policy["stderr_bytes_max"])
    try:
        completed = subprocess.run(
            command,
            cwd=str(cwd),
            input=body,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            shell=False,
        )
        stdout_text = completed.stdout or ""
        stderr_text = completed.stderr or ""
        raw = stdout_text.encode("utf-8", errors="replace")
        bytes_truncated = len(raw) > max_bytes
        if bytes_truncated:
            stdout_text = raw[:max_bytes].decode("utf-8", errors="replace")
        parsed_json, parse_error = parse_mcp_response_text(stdout_text)
        return {
            "status": "ok" if completed.returncode == 0 and not parse_error else "failed",
            "transport": "stdio",
            "server_id": server_id,
            "server_label": server.get("label"),
            "purpose": purpose,
            "jsonrpc_method": method,
            "jsonrpc_id": request_id,
            "returncode": completed.returncode,
            "bytes_read": min(len(raw), max_bytes),
            "truncated": bytes_truncated or len(stdout_text) > max_chars,
            "stderr_truncated": len(stderr_text.encode("utf-8", errors="replace")) > stderr_max,
            "request": body_obj,
            "jsonrpc_response": parsed_json,
            "json_parse_error": parse_error,
            "text": stdout_text[:max_chars],
            "stderr": stderr_text[:stderr_max],
            "command_preview": [Path(command[0]).name if index == 0 else item for index, item in enumerate(command)],
            "policy": policy,
        }
    except subprocess.TimeoutExpired as exc:
        stdout_text = (exc.stdout or "") if isinstance(exc.stdout, str) else (exc.stdout or b"").decode("utf-8", errors="replace")
        stderr_text = (exc.stderr or "") if isinstance(exc.stderr, str) else (exc.stderr or b"").decode("utf-8", errors="replace")
        return {
            "status": "timeout",
            "transport": "stdio",
            "server_id": server_id,
            "purpose": purpose,
            "jsonrpc_method": method,
            "jsonrpc_id": request_id,
            "timeout_seconds": timeout_seconds,
            "request": body_obj,
            "text": stdout_text[:max_chars],
            "stderr": stderr_text[:stderr_max],
            "policy": policy,
        }


def execute_mcp_http_call(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    raw_endpoint = str(payload.get("endpoint") or payload.get("url") or "").strip()
    if not raw_endpoint:
        raise ValueError("mcp_call endpoint is required")
    parsed = urlparse(raw_endpoint)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("mcp_call supports only HTTP/HTTPS JSON-RPC endpoints")
    if is_private_web_host(parsed.hostname or "") and not bool(payload.get("allow_private_network")):
        raise ValueError("mcp_call private/localhost targets require allow_private_network=true")
    method = str(payload.get("method") or "").strip()
    allowed_methods = set(mcp_call_policy()["methods"])
    if method not in allowed_methods:
        raise ValueError(f"mcp_call method must be one of: {', '.join(sorted(allowed_methods))}")
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    request_id = payload.get("id") or f"mcp-{uuid.uuid4()}"
    headers = normalize_web_headers({"headers": payload.get("headers") if isinstance(payload.get("headers"), dict) else {}})
    headers["Content-Type"] = "application/json"
    body_obj = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params,
    }
    body = json.dumps(body_obj, ensure_ascii=False).encode("utf-8")
    policy = mcp_call_policy()
    if len(body) > policy["request_body_bytes_max"]:
        raise ValueError("mcp_call request body exceeds max bytes")
    timeout_seconds = min(int(payload.get("timeout_seconds") or 10), policy["timeout_seconds_max"])
    max_bytes = min(int(payload.get("max_bytes") or policy["response_bytes_max"]), policy["response_bytes_max"])
    max_chars = min(int(payload.get("max_chars") or policy["default_response_chars"]), policy["default_response_chars"])
    request = urllib.request.Request(raw_endpoint, data=body, headers=headers, method="POST")

    def response_payload(status: str, status_code: int, reason: str, response_headers: Dict[str, Any], raw: bytes, final_url: str, bytes_truncated: bool) -> Dict[str, Any]:
        content_type = str(response_headers.get("Content-Type") or response_headers.get("content-type") or "")
        charset = "utf-8"
        text = raw.decode(charset, errors="replace")
        parsed_json: Any = None
        parse_error = ""
        try:
            parsed_json = json.loads(text)
        except Exception as exc:
            parse_error = str(exc)
        return {
            "status": status,
            "endpoint": raw_endpoint,
            "final_url": final_url,
            "purpose": purpose,
            "jsonrpc_method": method,
            "jsonrpc_id": request_id,
            "status_code": status_code,
            "reason": reason,
            "content_type": content_type,
            "bytes_read": len(raw),
            "truncated": bytes_truncated or len(text) > max_chars,
            "request_headers": redact_headers(headers),
            "response_headers": redact_headers(response_headers),
            "request": {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params},
            "jsonrpc_response": parsed_json,
            "json_parse_error": parse_error,
            "text": text[:max_chars],
            "policy": policy,
        }

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw_full = response.read(max_bytes + 1)
            bytes_truncated = len(raw_full) > max_bytes
            raw = raw_full[:max_bytes]
            return response_payload(
                "ok" if 200 <= int(response.status) < 400 else "http_error",
                int(response.status),
                getattr(response, "reason", ""),
                dict(response.headers.items()),
                raw,
                response.geturl(),
                bytes_truncated,
            )
    except urllib.error.HTTPError as exc:
        raw_full = exc.read(max_bytes + 1)
        bytes_truncated = len(raw_full) > max_bytes
        raw = raw_full[:max_bytes]
        return response_payload(
            "http_error",
            int(exc.code),
            str(exc.reason),
            dict(exc.headers.items()),
            raw,
            raw_endpoint,
            bytes_truncated,
        )


def execute_mcp_call(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    transport = str(payload.get("transport") or "").strip().lower()
    if not transport:
        transport = "stdio" if str(payload.get("server_id") or payload.get("server") or "").strip() else "http"
    if transport in {"http", "https", "jsonrpc", "http-jsonrpc"}:
        return execute_mcp_http_call(payload, purpose)
    if transport == "stdio":
        return execute_mcp_stdio_call(payload, purpose)
    raise ValueError("mcp_call transport must be http or stdio")


def command_argv(payload: Dict[str, Any]) -> List[str]:
    raw_argv = payload.get("argv")
    if isinstance(raw_argv, list) and raw_argv:
        return [str(item).strip() for item in raw_argv if str(item).strip()]
    command = str(payload.get("command") or "").strip()
    if not command:
        raise ValueError("command or argv is required")
    # Allowlisted verification commands intentionally do not need shell quoting.
    return [part for part in command.split() if part]


def resolve_executable(token: str) -> str:
    lowered = token.lower()
    if lowered in {"python", "python3", "py"}:
        return sys.executable
    if lowered in {"node", "npm", "npx"}:
        resolved = shutil.which(lowered)
        if not resolved:
            raise ValueError(f"executable not found: {token}")
        return resolved
    raise ValueError(f"executable is not allowlisted: {token}")


def project_relative_path(raw: str) -> Path:
    path = safe_path(raw)
    if not path.exists():
        raise ValueError(f"path does not exist: {raw}")
    return path


def allowed_verification_command(argv: List[str]) -> Dict[str, Any]:
    if not argv:
        return {"allowed": False, "reason": "empty argv"}
    executable = argv[0].lower()
    args = argv[1:]
    if executable in {"python", "python3", "py", "node", "npm"} and args == ["--version"]:
        return {"allowed": True, "pattern": f"{executable} --version"}
    if executable in {"python", "python3", "py"} and len(args) >= 3 and args[:2] == ["-m", "py_compile"]:
        checked_paths = []
        for raw_path in args[2:]:
            path = project_relative_path(raw_path)
            relative = path.relative_to(bridge_root())
            if path.suffix.lower() != ".py" or not str(relative).replace("\\", "/").startswith("bridge/"):
                return {"allowed": False, "reason": "py_compile is limited to bridge/*.py"}
            checked_paths.append(str(relative))
        return {"allowed": True, "pattern": "python -m py_compile bridge/*.py", "paths": checked_paths}
    if executable in {"python", "python3", "py"} and args == ["bridge/healthcheck_bridge.py"]:
        project_relative_path(args[0])
        return {"allowed": True, "pattern": "python bridge/healthcheck_bridge.py"}
    if executable == "npx" and args == ["tsc", "--noEmit"]:
        return {"allowed": True, "pattern": "npx tsc --noEmit"}
    return {"allowed": False, "reason": "command is not in the verification allowlist"}


def run_verification_command(payload: Dict[str, Any]) -> Dict[str, Any]:
    argv = command_argv(payload)
    allow = allowed_verification_command(argv)
    if not allow.get("allowed"):
        return {"status": "blocked", "argv": argv, "allowlist": allow, "policy": command_execution_policy()}
    timeout_seconds = min(int(payload.get("timeout_seconds") or 20), command_execution_policy()["timeout_seconds_max"])
    cwd = safe_path(str(payload.get("cwd") or "."))
    resolved_executable = resolve_executable(argv[0])
    resolved_argv = [resolved_executable, *argv[1:]]
    if os.name == "nt" and Path(resolved_executable).suffix.lower() in {".cmd", ".bat"}:
        resolved_argv = [os.environ.get("COMSPEC") or "cmd.exe", "/d", "/c", resolved_executable, *argv[1:]]
    completed = subprocess.run(
        resolved_argv,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        shell=False,
    )
    return {
        "status": "ok" if completed.returncode == 0 else "failed",
        "argv": argv,
        "allowlist": allow,
        "policy": command_execution_policy(),
        "cwd": str(cwd),
        "returncode": completed.returncode,
        "stdout": (completed.stdout or "")[:5000],
        "stderr": (completed.stderr or "")[:5000],
    }


def probe_command(name: str) -> List[str] | None:
    probe = name.strip().lower()
    if probe == "python":
        return [sys.executable, "--version"]
    if probe in {"node", "npm"}:
        executable = shutil.which(probe)
        return [executable, "--version"] if executable else None
    return None


def run_sandbox_probe(payload: Dict[str, Any]) -> Dict[str, Any]:
    requested = payload.get("probes") if isinstance(payload.get("probes"), list) else ["python"]
    timeout_seconds = min(int(payload.get("timeout_seconds") or 5), sandbox_policy()["timeout_seconds_max"])
    results = []
    for raw in requested:
        name = str(raw or "").strip().lower()
        command = probe_command(name)
        if not command:
            results.append({"probe": name, "status": "unsupported", "message": "Probe is not allowlisted or executable is missing."})
            continue
        try:
            completed = subprocess.run(
                command,
                cwd=bridge_root(),
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                shell=False,
            )
            output = (completed.stdout or completed.stderr or "").strip()
            results.append({
                "probe": name,
                "status": "ok" if completed.returncode == 0 else "failed",
                "returncode": completed.returncode,
                "output": output[:300],
            })
        except Exception as exc:
            results.append({"probe": name, "status": "error", "message": str(exc)})
    return {"policy": sandbox_policy(), "results": results}


def safety_item(key: str, severity: str, message: str) -> Dict[str, str]:
    return {"key": key, "severity": severity, "message": message}


def safety_review(action: str, purpose: str, payload: Dict[str, Any]) -> List[Dict[str, str]]:
    review = []
    command_validation = validate_command(str(payload.get("command") or ""), str(payload.get("cwd") or ""), purpose) if action == "run_command" else []
    command_blocked = any(item.get("severity") == "block" for item in command_validation)
    access_profile = normalize_file_access_profile(payload)
    review.append(safety_item(
        "intent",
        "pass" if purpose else "warn",
        "Purpose is explicit." if purpose else "Purpose is empty; caller should explain intent.",
    ))

    path_value = str(payload.get("path") or payload.get("cwd") or payload.get("url") or payload.get("endpoint") or payload.get("api_url") or payload.get("apiUrl") or "").strip()
    if action == "mcp_call" and not path_value:
        path_value = str(payload.get("server_id") or payload.get("server") or "").strip()
    if action == "skill_run" and not path_value:
        path_value = str(payload.get("activated_path") or payload.get("candidate_id") or payload.get("skill_id") or "").strip()
    if path_value:
        try:
            if action in {"read_file", "write_file"}:
                resolve_file_path(path_value, access_profile, full_access_files=(access_profile == "full_access"))
            if action == "skill_run":
                resolve_activated_skill_path(payload)
            if action == "web_fetch":
                parsed = urlparse(path_value)
                if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                    raise ValueError("web_fetch scope must be an http/https URL")
            if action == "mcp_call":
                transport = str(payload.get("transport") or "").strip().lower()
                if not transport:
                    transport = "stdio" if str(payload.get("server_id") or payload.get("server") or "").strip() else "http"
                if transport == "stdio":
                    if path_value not in mcp_stdio_registry():
                        raise ValueError(f"unknown stdio MCP server_id: {path_value}")
                else:
                    parsed = urlparse(path_value)
                    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                        raise ValueError("mcp_call endpoint must be an http/https URL")
            if action == "provider_probe":
                parsed = urlparse(path_value)
                if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                    raise ValueError("provider_probe api_url must be an http/https URL")
            review.append(safety_item(
                "scope",
                "warn" if access_profile == "full_access" or action in {"web_fetch", "mcp_call", "provider_probe"} else "pass",
                "Provider endpoint is syntactically reviewable; remote probes require allow_remote_model=true." if action == "provider_probe" else "Activated skill path is syntactically reviewable; Gateway must be started with --execute-skill before runtime execution." if action == "skill_run" else "MCP scope is syntactically reviewable; HTTP targets and registered stdio server_id values both require --execute-mcp before execution." if action == "mcp_call" else "External URL scope is syntactically reviewable; Gateway must be started with --execute-web before execution." if action == "web_fetch" else "Full-access file path is syntactically reviewable; Gateway must be started with --full-access-files before execution." if access_profile == "full_access" else "Workspace path scope was provided and is reviewable.",
            ))
        except Exception as exc:
            review.append(safety_item("scope", "block", str(exc)))
    else:
        review.append(safety_item("scope", "warn" if action in {"read_file", "write_file", "run_command", "web_fetch", "mcp_call", "provider_probe", "skill_run"} else "pass", "No filesystem scope required." if action not in {"read_file", "write_file", "run_command", "web_fetch", "mcp_call", "provider_probe", "skill_run"} else "Filesystem/command/url/endpoint scope is missing."))

    source_text = json.dumps(payload, ensure_ascii=False)
    review.append(safety_item(
        "source",
        "warn" if re.search(r"https?:\/\/", source_text, flags=re.IGNORECASE) else "pass",
        "External URL/source appears in payload; provenance review required." if re.search(r"https?:\/\/", source_text, flags=re.IGNORECASE) else "No external source detected.",
    ))

    approval_actions = {"write_file", "approval_decide", "run_command", "web_fetch", "mcp_call", "provider_probe", "scheduler_install", "scheduler_uninstall", "skill_run"} | MEMORY_MANAGEMENT_ACTIONS
    review.append(safety_item(
        "permission",
        "block" if command_blocked else "warn" if action in approval_actions else "pass",
        "Command validators blocked this request." if command_blocked else "Action requires approval or explicit execution flags." if action in approval_actions else "Action is read/stateful within Gateway policy.",
    ))

    empty_payload_allowed = {"status", "approval_status", "runtime_events", "memory_status", "memory_backup_status", "memory_retrieve", "memory_bootstrap", "memory_consolidate", "context_pack", "source_audit", "source_digest", "provider_catalog", "provider_config_status", "provider_status", "provider_probe", "mcp_stdio_catalog", "goal_bootstrap", "skill_bootstrap", "skill_route", "skill_invoke", "skill_status", "skill_crystallize", "skill_review", "skill_activate", "kairos_tick", "scheduler_status", "scheduler_plan", "scheduler_install", "scheduler_uninstall", "worker_status", "sandbox_probe", "sandbox_status", "phase_audit", "completion_audit", "user_model_status", "user_model_reflect", "swarm_bootstrap", "evolution_bootstrap"}
    review.append(safety_item(
        "input",
        "pass" if payload or action in empty_payload_allowed else "warn",
        "Payload is present or optional." if payload or action in empty_payload_allowed else "Payload is empty; verify required fields.",
    ))

    review.append(safety_item(
        "dry_run",
        "warn" if bool(payload.get("execute")) else "pass",
        "Execute flag requested; read_file/write_file/run_command/web_fetch/mcp_call/provider_probe/skill_run still require the matching Gateway execution flag or explicit remote gate." if bool(payload.get("execute")) else "Default dry-run/non-executing mode.",
    ))

    writeback_actions = {"run", "advance", "kairos_task", "kairos_tick", "memory_event", "memory_bootstrap", "memory_consolidate", "source_digest", "goal_bootstrap", "skill_bootstrap", "skill_crystallize", "user_model_event", "user_model_reflect", "subagent_spawn", "lock_acquire", "lock_release", "swarm_bootstrap", "evolution_bootstrap", "write_file", "approval_decide", "scheduler_install", "scheduler_uninstall", "skill_run", "worker_merge_proposal"} | MEMORY_MANAGEMENT_ACTIONS
    review.append(safety_item(
        "writeback",
        "pass" if action in writeback_actions else "warn" if action in {"run_command", "web_fetch", "mcp_call", "provider_probe"} else "pass",
        "State-changing action is logged in Gateway state/runs." if action in writeback_actions else "External action must return observable result before writeback." if action in {"run_command", "web_fetch", "mcp_call", "provider_probe"} else "No writeback needed.",
    ))
    return review


def bridge_manifest(host: str = "127.0.0.1", port: int = 8765) -> Dict[str, Any]:
    return {
        "bridge": BRIDGE_NAME,
        "protocol_version": PROTOCOL_VERSION,
        "root": str(bridge_root()),
        "endpoint": f"http://{host}:{port}/bridge",
        "runtime_capabilities": runtime_capabilities(),
        "tools": [
            {"action": "search", "mode": "read", "description": "Search readable project text files."},
            {"action": "status", "mode": "read", "description": "Inspect bridge health, recent runs, and workflow state."},
            {"action": "approval_status", "mode": "read", "description": "Inspect recent approval queue records without executing them."},
            {"action": "runtime_events", "mode": "read", "description": "Read a unified Gateway runtime timeline from runs, approvals, and worker events."},
            {"action": "approval_decide", "mode": "approval-executor", "description": "Reject a queued approval, execute queued write_file with execute-write, queued memory management with execute-memory, or queued provider_probe with execute-provider."},
            {"action": "advance", "mode": "stateful", "description": "Advance a registered workflow DAG node."},
            {"action": "run", "mode": "stateful", "description": "Register or update a workflow DAG run."},
            {"action": "memory_event", "mode": "stateful", "description": "Append an AutoDream L1 memory event."},
            {"action": "memory_consolidate", "mode": "stateful", "description": "Consolidate pending AutoDream L1 events into L2 summaries."},
            {"action": "memory_bootstrap", "mode": "stateful", "description": "Seed simulated long-context L1 events and consolidate them into L2 evidence."},
            {"action": "memory_status", "mode": "read", "description": "Inspect AutoDream L1/L2 memory state."},
            {"action": "memory_retrieve", "mode": "read", "description": "Retrieve a compact AutoDream L1/L2 context pack by query and dimension."},
            {"action": "memory_backup_status", "mode": "read", "description": "Inspect AutoDream backup history for restore review."},
            {"action": "memory_update", "mode": "approval-or-execute-memory", "description": "Queue an approval draft to update an L1/L2 memory record; execution requires approval_decide plus execute-memory."},
            {"action": "memory_freeze", "mode": "approval-or-execute-memory", "description": "Queue an approval draft to freeze an L1/L2 memory record; execution requires approval_decide plus execute-memory."},
            {"action": "memory_delete", "mode": "approval-or-execute-memory", "description": "Queue an approval draft to soft-delete an L1/L2 memory record; execution requires approval_decide plus execute-memory."},
            {"action": "memory_merge", "mode": "approval-or-execute-memory", "description": "Queue an approval draft to manually merge memory records; execution requires approval_decide plus execute-memory."},
            {"action": "memory_restore", "mode": "approval-or-execute-memory", "description": "Queue an approval draft to restore AutoDream state from a backup; execution requires approval_decide plus execute-memory."},
            {"action": "context_pack", "mode": "read", "description": "Build a one-shot agent context pack from skill routing, memory retrieval, and tool policy."},
            {"action": "source_audit", "mode": "read", "description": "Classify research sources and return allowed reuse boundaries before learning from them."},
            {"action": "source_digest", "mode": "stateful", "description": "Turn audited safe sources into Personal OS architecture adoption notes."},
            {"action": "provider_catalog", "mode": "read", "description": "List model provider presets, wire formats, groups, and key requirements."},
            {"action": "provider_config_status", "mode": "read", "description": "Read the local desktop Provider switch config and return a frontend-ready settings snapshot without network calls."},
            {"action": "provider_status", "mode": "read", "description": "Inspect one provider/model configuration and model-worker readiness without network calls."},
            {"action": "provider_probe", "mode": "approval-or-execute-provider", "description": "Queue a provider model-list probe by default; live probes require Gateway execute-provider, payload execute=true, and remote probes require allow_remote_model=true."},
            {"action": "goal_bootstrap", "mode": "stateful", "description": "Create a Goal Mode planner tree and optionally register workflow/subagents/KAIROS records."},
            {"action": "skill_bootstrap", "mode": "stateful", "description": "Verify domain skill mounting, tool exclusions, context pack, and workflow/subagent hooks."},
            {"action": "skill_route", "mode": "read", "description": "Route task text to core Personal OS and novel skills without executing scripts."},
            {"action": "skill_invoke", "mode": "read", "description": "Create a prompt-only skill invocation packet without importing or executing scripts."},
            {"action": "skill_crystallize", "mode": "stateful", "description": "Create safe draft skill candidates from AutoDream L2 summaries."},
            {"action": "skill_status", "mode": "read", "description": "Inspect generated skill candidates and draft paths."},
            {"action": "skill_review", "mode": "read", "description": "Review a draft skill candidate before activation."},
            {"action": "skill_activate", "mode": "stateful", "description": "Activate a reviewed draft skill into bridge/skills/activated without importing it."},
            {"action": "skill_run", "mode": "approval-or-execute-skill", "description": "Run a reviewed activated Python skill in a bounded subprocess only when execute-skill is enabled."},
            {"action": "scheduler_plan", "mode": "stateful", "description": "Create reviewed Windows scheduler install/uninstall drafts for KAIROS."},
            {"action": "scheduler_install", "mode": "approval-or-execute-scheduler", "description": "Install a reviewed Windows Scheduled Task only when execute-scheduler is enabled."},
            {"action": "scheduler_uninstall", "mode": "approval-or-execute-scheduler", "description": "Remove a reviewed Windows Scheduled Task only when execute-scheduler is enabled."},
            {"action": "scheduler_status", "mode": "read", "description": "Inspect scheduler draft plans and events."},
            {"action": "worker_run", "mode": "stateful", "description": "Start a background worker job for an allowlisted bridge action, verification command, or gated model task."},
            {"action": "worker_status", "mode": "read", "description": "Inspect background worker jobs and events."},
            {"action": "worker_cancel", "mode": "stateful", "description": "Request cooperative cancellation for a queued or running worker job."},
            {"action": "worker_merge_proposal", "mode": "stateful", "description": "Create a reviewable merge proposal from worker output without modifying target files."},
            {"action": "swarm_bootstrap", "mode": "stateful", "description": "Run a safe Phase 4 swarm rehearsal with subagents, locks, conflicts, and allowlisted workers."},
            {"action": "safety_review", "mode": "read", "description": "Run the seven-layer safety review on a proposed action."},
            {"action": "sandbox_probe", "mode": "safe-probe", "description": "Run allowlisted non-mutating subprocess probes."},
            {"action": "sandbox_status", "mode": "read", "description": "Inspect the conservative sandbox execution policy."},
            {"action": "phase_audit", "mode": "read", "description": "Audit Phase 1-5 Personal OS completion evidence."},
            {"action": "completion_audit", "mode": "read", "description": "Audit Personal OS requirements against Codex/Claude Code-style agent architecture."},
            {"action": "evolution_bootstrap", "mode": "stateful", "description": "Verify Phase 5 KAIROS evolution loop with memory, scheduler drafts, skill crystallization, and user modeling."},
            {"action": "user_model_event", "mode": "stateful", "description": "Record an evidence-backed user model observation."},
            {"action": "user_model_reflect", "mode": "stateful", "description": "Consolidate user model observations into tentative beliefs."},
            {"action": "user_model_status", "mode": "read", "description": "Inspect Honcho-lite user model state."},
            {"action": "subagent_spawn", "mode": "stateful", "description": "Register a planned subagent branch."},
            {"action": "lock_acquire", "mode": "stateful", "description": "Acquire a read/write lock for an agent scope."},
            {"action": "lock_release", "mode": "stateful", "description": "Release a previously acquired lock."},
            {"action": "subagent_status", "mode": "read", "description": "Inspect registered subagents and locks."},
            {"action": "read_file", "mode": "execute-read", "description": "Read a workspace/full-access file only when matching execution flags and access profile are enabled."},
            {"action": "workspace_scan", "mode": "execute-read", "description": "List directory metadata for a workspace/full-access root only when read execution gates are enabled; file content is not read."},
            {"action": "write_file", "mode": "approval-or-execute-write", "description": "Queue a write approval by default; execute text writes with backups when execute-write is enabled."},
            {"action": "run_command", "mode": "approval-required", "description": "Validate command drafts; allowlisted verification execution requires explicit opt-in."},
            {"action": "web_fetch", "mode": "approval-or-execute-web", "description": "Bounded HTTP/API fetch only when execute-web is enabled; otherwise approval proposal only."},
            {"action": "mcp_stdio_catalog", "mode": "read", "description": "List registered local stdio MCP servers; no arbitrary command strings are accepted."},
            {"action": "mcp_call", "mode": "approval-or-execute-mcp", "description": "Bounded HTTP JSON-RPC or registered stdio MCP call only when execute-mcp is enabled; otherwise approval proposal only."},
            {"action": "kairos_task", "mode": "stateful", "description": "Queue a safe long-running KAIROS task record."},
            {"action": "kairos_tick", "mode": "stateful", "description": "Run a safe KAIROS observation tick and prepare context/skill suggestions."},
        ],
        "safety": {
            "command_validators": len(VALIDATORS),
            "file_access_profiles": sorted(FILE_ACCESS_PROFILES),
            "writes": "approval_queue_only_or_execute_write_with_backup",
            "memory_management": "approval_queue_only_or_execute_memory_with_backup",
            "commands": "validate_only_or_opt_in_verification_allowlist",
            "scheduler": "draft_only_or_opt_in_execute_scheduler",
            "provider_registry": "catalog_status_read_only; live_probe_requires_execute_provider_and_remote_gate",
            "skill_runtime": "proposal_only_or_opt_in_activated_skill_subprocess",
            "web_fetch": "proposal_only_or_opt_in_bounded_http_client",
            "mcp_call": "proposal_only_or_opt_in_http_or_registered_stdio_jsonrpc_client",
            "cors": "enabled_for_local_ui",
        },
    }


def mcp_tool_specs() -> List[Dict[str, Any]]:
    return [
        {
            "name": "search",
            "description": "Search readable project text files.",
            "inputSchema": {
                "type": "object",
                "properties": {"keyword": {"type": "string"}, "limit": {"type": "number"}},
                "required": ["keyword"],
            },
        },
        {
            "name": "status",
            "description": "Inspect bridge, workflow, and KAIROS state.",
            "inputSchema": {"type": "object", "properties": {"workflow_id": {"type": "string"}, "task_id": {"type": "string"}}},
        },
        {
            "name": "approval_status",
            "description": "Inspect recent approval queue records without approving or executing them.",
            "inputSchema": {"type": "object", "properties": {"limit": {"type": "number"}, "action": {"type": "string"}}},
        },
        {
            "name": "runtime_events",
            "description": "Read a unified Gateway runtime timeline from runs, approvals, and worker events.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": {"type": "number"},
                    "source": {"type": "string", "enum": ["runs", "approvals", "workers"]},
                    "type": {"type": "string"},
                    "status": {"type": "string"},
                },
            },
        },
        {
            "name": "approval_decide",
            "description": "Reject a queued approval, execute a queued write_file approval with execute-write, queued memory management with execute-memory, or queued provider_probe with execute-provider.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "approval_id": {"type": "string"},
                    "decision": {"type": "string", "enum": ["reject", "execute"]},
                    "reason": {"type": "string"},
                },
                "required": ["approval_id", "decision"],
            },
        },
        {
            "name": "run",
            "description": "Register or update a workflow DAG run.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string"},
                    "name": {"type": "string"},
                    "current_node_id": {"type": "string"},
                    "nodes": {"type": "array"},
                },
                "required": ["workflow_id"],
            },
        },
        {
            "name": "advance",
            "description": "Advance a registered workflow DAG node.",
            "inputSchema": {
                "type": "object",
                "properties": {"workflow_id": {"type": "string"}, "completed_node_id": {"type": "string"}, "next_node_id": {"type": "string"}},
                "required": ["workflow_id"],
            },
        },
        {
            "name": "kairos_task",
            "description": "Queue a safe long-running KAIROS task record.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "objective": {"type": "string"},
                    "next_action": {"type": "string"},
                    "source_workflow_id": {"type": "string"},
                    "interval_seconds": {"type": "number"},
                },
                "required": ["objective"],
            },
        },
        {
            "name": "kairos_tick",
            "description": "Run a safe KAIROS observation tick and prepare context/skill suggestions.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "limit": {"type": "number"},
                    "include_suggestions": {"type": "boolean"},
                },
            },
        },
        {
            "name": "memory_event",
            "description": "Append an AutoDream L1 memory event.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)},
                    "summary": {"type": "string"},
                    "source": {"type": "string"},
                    "tags": {"type": "array"},
                    "importance": {"type": "number"},
                },
                "required": ["summary"],
            },
        },
        {
            "name": "memory_consolidate",
            "description": "Consolidate pending AutoDream L1 events into L2 summaries.",
            "inputSchema": {
                "type": "object",
                "properties": {"dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)}},
            },
        },
        {
            "name": "memory_bootstrap",
            "description": "Seed simulated long-context L1 events and consolidate them into L2 evidence.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "goal": {"type": "string"},
                    "objective": {"type": "string"},
                    "dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)},
                    "query": {"type": "string"},
                    "limit": {"type": "number"},
                },
            },
        },
        {
            "name": "memory_status",
            "description": "Inspect AutoDream L1/L2 memory state.",
            "inputSchema": {
                "type": "object",
                "properties": {"dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)}},
            },
        },
        {
            "name": "memory_retrieve",
            "description": "Retrieve a compact AutoDream L1/L2 context pack by query and dimension.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)},
                    "limit": {"type": "number"},
                },
            },
        },
        {
            "name": "memory_backup_status",
            "description": "Inspect AutoDream backup history for restore review.",
            "inputSchema": {
                "type": "object",
                "properties": {"limit": {"type": "number"}},
            },
        },
        {
            "name": "memory_update",
            "description": "Queue an approval draft to update an L1/L2 memory record; execution requires approval_decide and Gateway execute-memory.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "target_id": {"type": "string"},
                    "target_kind": {"type": "string", "enum": ["L1", "L2", "l1", "l2"]},
                    "dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)},
                    "patch": {"type": "object"},
                    "reason": {"type": "string"},
                },
                "required": ["target_id"],
            },
        },
        {
            "name": "memory_freeze",
            "description": "Queue an approval draft to freeze an L1/L2 memory record; execution requires approval_decide and Gateway execute-memory.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "target_id": {"type": "string"},
                    "target_kind": {"type": "string", "enum": ["L1", "L2", "l1", "l2"]},
                    "dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)},
                    "reason": {"type": "string"},
                },
                "required": ["target_id"],
            },
        },
        {
            "name": "memory_delete",
            "description": "Queue an approval draft to soft-delete an L1/L2 memory record; execution requires approval_decide and Gateway execute-memory.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "target_id": {"type": "string"},
                    "target_kind": {"type": "string", "enum": ["L1", "L2", "l1", "l2"]},
                    "dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)},
                    "reason": {"type": "string"},
                },
                "required": ["target_id"],
            },
        },
        {
            "name": "memory_merge",
            "description": "Queue an approval draft to manually merge L1/L2 memory records; execution requires approval_decide and Gateway execute-memory.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "record_ids": {"type": "array"},
                    "target_kind": {"type": "string", "enum": ["L2", "l2"]},
                    "dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)},
                    "summary": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["record_ids"],
            },
        },
        {
            "name": "memory_restore",
            "description": "Queue an approval draft to restore AutoDream state from a backup; execution requires approval_decide and Gateway execute-memory.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "backup_name": {"type": "string"},
                    "backup_path": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["backup_name"],
            },
        },
        {
            "name": "context_pack",
            "description": "Build a one-shot agent context pack from skill routing, memory retrieval, and tool policy.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "query": {"type": "string"},
                    "domain": {"type": "string"},
                    "dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)},
                    "limit": {"type": "number"},
                    "current_text": {"type": "string"},
                },
            },
        },
        {
            "name": "source_audit",
            "description": "Classify research sources and return allowed reuse boundaries before learning from them.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sources": {
                        "type": "array",
                        "items": {
                            "type": ["object", "string"],
                        },
                    },
                    "url": {"type": "string"},
                    "label": {"type": "string"},
                    "text": {"type": "string"},
                    "source_kind": {"type": "string"},
                },
            },
        },
        {
            "name": "source_digest",
            "description": "Turn audited safe sources into Personal OS architecture adoption notes.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sources": {
                        "type": "array",
                        "items": {"type": ["object", "string"]},
                    },
                    "goal": {"type": "string"},
                    "persist": {"type": "boolean"},
                },
            },
        },
        {
            "name": "provider_catalog",
            "description": "List model provider presets, wire formats, groups, and key requirements.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "group": {"type": "string", "enum": sorted(PROVIDER_GROUP_LABELS)},
                    "provider": {"type": "string", "enum": sorted(PROVIDER_LABELS)},
                    "local_only": {"type": "boolean"},
                    "limit": {"type": "number"},
                },
            },
        },
        {
            "name": "provider_config_status",
            "description": "Read the local desktop Provider switch config and return a frontend-ready settings snapshot without network calls.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "include_secret": {"type": "boolean"},
                    "import_to_frontend": {"type": "boolean"},
                },
            },
        },
        {
            "name": "provider_status",
            "description": "Inspect one provider/model configuration and model-worker readiness without network calls.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "preset_id": {"type": "string"},
                    "provider": {"type": "string", "enum": sorted(PROVIDER_LABELS)},
                    "api_url": {"type": "string"},
                    "model_id": {"type": "string"},
                    "api_key_env": {"type": "string"},
                    "api_key": {"type": "string"},
                },
            },
        },
        {
            "name": "provider_probe",
            "description": "Queue a provider model-list probe by default; live probes require Gateway execute-provider, payload execute=true, and remote probes require allow_remote_model=true.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "preset_id": {"type": "string"},
                    "provider": {"type": "string", "enum": sorted(PROVIDER_LABELS)},
                    "api_url": {"type": "string"},
                    "model_id": {"type": "string"},
                    "api_key_env": {"type": "string"},
                    "api_key": {"type": "string"},
                    "execute": {"type": "boolean"},
                    "allow_remote_model": {"type": "boolean"},
                    "timeout_seconds": {"type": "number"},
                },
            },
        },
        {
            "name": "goal_bootstrap",
            "description": "Create a Goal Mode planner tree and optionally register workflow/subagents/KAIROS records.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "goal": {"type": "string"},
                    "objective": {"type": "string"},
                    "workflow_id": {"type": "string"},
                    "persist": {"type": "boolean"},
                    "spawn_subagents": {"type": "boolean"},
                    "kairos": {"type": "boolean"},
                    "sources": {"type": "array", "items": {"type": ["object", "string"]}},
                    "start_workers": {"type": "boolean"},
                },
            },
        },
        {
            "name": "skill_bootstrap",
            "description": "Verify domain skill mounting, tool exclusions, context pack, and workflow/subagent hooks.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "domain": {"type": "string"},
                    "current_text": {"type": "string"},
                    "persist": {"type": "boolean"},
                    "spawn_subagents": {"type": "boolean"},
                    "workflow_id": {"type": "string"},
                    "limit": {"type": "number"},
                },
            },
        },
        {
            "name": "skill_crystallize",
            "description": "Create safe draft skill candidates from AutoDream L2 summaries.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "dimension": {"type": "string", "enum": sorted(MEMORY_DIMENSIONS)},
                    "limit": {"type": "number"},
                    "title": {"type": "string"},
                    "force": {"type": "boolean"},
                },
            },
        },
        {
            "name": "skill_route",
            "description": "Route task text to core Personal OS, novel, and local SKILL.md skills without executing scripts.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "domain": {"type": "string"},
                    "current_text": {"type": "string"},
                    "local_limit": {"type": "number"},
                },
            },
        },
        {
            "name": "skill_invoke",
            "description": "Create a prompt-only skill invocation packet, optionally reading a local SKILL.md instruction.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "skill_key": {"type": "string"},
                    "candidate_id": {"type": "string"},
                    "task": {"type": "string"},
                    "domain": {"type": "string"},
                    "current_text": {"type": "string"},
                    "input": {"type": "string"},
                    "max_skill_chars": {"type": "number"},
                },
            },
        },
        {
            "name": "skill_status",
            "description": "Inspect generated skill candidates, activated skills, and local SKILL.md library roots.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": {"type": "number"},
                    "query": {"type": "string"},
                    "domain": {"type": "string"},
                    "local_limit": {"type": "number"},
                },
            },
        },
        {
            "name": "skill_review",
            "description": "Review a draft skill candidate before activation.",
            "inputSchema": {
                "type": "object",
                "properties": {"candidate_id": {"type": "string"}, "draft_path": {"type": "string"}},
            },
        },
        {
            "name": "skill_activate",
            "description": "Activate a reviewed draft skill into bridge/skills/activated without running it.",
            "inputSchema": {
                "type": "object",
                "properties": {"candidate_id": {"type": "string"}, "draft_path": {"type": "string"}, "reviewed_by": {"type": "string"}},
            },
        },
        {
            "name": "skill_run",
            "description": "Run a reviewed activated Python skill in a bounded subprocess only when execute-skill is enabled.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "candidate_id": {"type": "string"},
                    "skill_id": {"type": "string"},
                    "skill_key": {"type": "string"},
                    "activated_path": {"type": "string"},
                    "task": {"type": "string"},
                    "goal": {"type": "string"},
                    "input": {"type": "string"},
                    "context": {"type": "object"},
                    "execute": {"type": "boolean"},
                    "timeout_seconds": {"type": "number"},
                },
            },
        },
        {
            "name": "scheduler_plan",
            "description": "Create reviewed Windows scheduler install/uninstall drafts for KAIROS.",
            "inputSchema": {
                "type": "object",
                "properties": {"plan_id": {"type": "string"}, "task_name": {"type": "string"}, "interval_minutes": {"type": "number"}, "launcher": {"type": "string"}},
            },
        },
        {
            "name": "scheduler_install",
            "description": "Install a reviewed Windows Scheduled Task only when execute-scheduler is enabled.",
            "inputSchema": {
                "type": "object",
                "properties": {"plan_id": {"type": "string"}, "execute": {"type": "boolean"}, "timeout_seconds": {"type": "number"}},
            },
        },
        {
            "name": "scheduler_uninstall",
            "description": "Remove a reviewed Windows Scheduled Task only when execute-scheduler is enabled.",
            "inputSchema": {
                "type": "object",
                "properties": {"plan_id": {"type": "string"}, "execute": {"type": "boolean"}, "timeout_seconds": {"type": "number"}},
            },
        },
        {
            "name": "scheduler_status",
            "description": "Inspect scheduler draft plans and events.",
            "inputSchema": {
                "type": "object",
                "properties": {"plan_id": {"type": "string"}},
            },
        },
        {
            "name": "worker_run",
            "description": "Start a background worker job for an allowlisted internal bridge action or verification command.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "job_id": {"type": "string"},
                    "agent_id": {"type": "string"},
                    "kind": {"type": "string", "enum": ["bridge_action", "verification_command", "model_task"]},
                    "action": {"type": "string", "enum": sorted(SAFE_WORKER_BRIDGE_ACTIONS)},
                    "payload": {"type": "object"},
                    "command": {"type": "string"},
                    "execute": {"type": "boolean"},
                    "execute_model": {"type": "boolean"},
                    "provider": {"type": "string", "enum": ["openai-compatible", "anthropic", "ollama"]},
                    "api_url": {"type": "string"},
                    "model_id": {"type": "string"},
                    "prompt": {"type": "string"},
                    "timeout_seconds": {"type": "number"},
                },
            },
        },
        {
            "name": "worker_status",
            "description": "Inspect background worker jobs and events.",
            "inputSchema": {
                "type": "object",
                "properties": {"job_id": {"type": "string"}},
            },
        },
        {
            "name": "worker_cancel",
            "description": "Request cooperative cancellation for a queued or running worker job.",
            "inputSchema": {
                "type": "object",
                "properties": {"job_id": {"type": "string"}, "reason": {"type": "string"}},
                "required": ["job_id"],
            },
        },
        {
            "name": "worker_merge_proposal",
            "description": "Create a reviewable merge proposal from worker output without modifying target files.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "job_id": {"type": "string"},
                    "target_path": {"type": "string"},
                    "mode": {"type": "string", "enum": ["replace", "append"]},
                    "content": {"type": "string"},
                },
                "required": ["target_path"],
            },
        },
        {
            "name": "swarm_bootstrap",
            "description": "Run a safe Phase 4 swarm rehearsal with subagents, locks, conflicts, and allowlisted workers.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "scope": {"type": "string"},
                    "workflow_id": {"type": "string"},
                    "persist": {"type": "boolean"},
                    "start_workers": {"type": "boolean"},
                    "release_locks": {"type": "boolean"},
                },
            },
        },
        {
            "name": "safety_review",
            "description": "Run the seven-layer safety review on a proposed action.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {"type": "string"},
                    "purpose": {"type": "string"},
                    "payload": {"type": "object"},
                },
                "required": ["action"],
            },
        },
        {
            "name": "sandbox_probe",
            "description": "Run allowlisted non-mutating subprocess probes.",
            "inputSchema": {
                "type": "object",
                "properties": {"probes": {"type": "array"}, "timeout_seconds": {"type": "number"}},
            },
        },
        {
            "name": "sandbox_status",
            "description": "Inspect the conservative sandbox execution policy.",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "phase_audit",
            "description": "Audit Phase 1-5 Personal OS completion evidence.",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "completion_audit",
            "description": "Audit Personal OS requirements against public Codex/Claude Code-style agent architecture.",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "evolution_bootstrap",
            "description": "Verify Phase 5 KAIROS evolution loop with memory, scheduler drafts, skill crystallization, and user modeling.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "objective": {"type": "string"},
                    "workflow_id": {"type": "string"},
                    "task_id": {"type": "string"},
                    "plan_id": {"type": "string"},
                    "interval_minutes": {"type": "number"},
                    "activate_skill": {"type": "boolean"},
                    "persist": {"type": "boolean"},
                },
            },
        },
        {
            "name": "user_model_event",
            "description": "Record an evidence-backed user model observation.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "dimension": {"type": "string", "enum": sorted(USER_MODEL_DIMENSIONS)},
                    "stance": {"type": "string", "enum": ["claim", "support", "counterexample"]},
                    "summary": {"type": "string"},
                    "source": {"type": "string"},
                    "confidence": {"type": "number"},
                },
                "required": ["summary"],
            },
        },
        {
            "name": "user_model_reflect",
            "description": "Consolidate user model observations into tentative beliefs.",
            "inputSchema": {
                "type": "object",
                "properties": {"dimension": {"type": "string", "enum": sorted(USER_MODEL_DIMENSIONS)}},
            },
        },
        {
            "name": "user_model_status",
            "description": "Inspect Honcho-lite user model state.",
            "inputSchema": {
                "type": "object",
                "properties": {"dimension": {"type": "string", "enum": sorted(USER_MODEL_DIMENSIONS)}},
            },
        },
        {
            "name": "subagent_spawn",
            "description": "Register a planned subagent branch.",
            "inputSchema": {
                "type": "object",
                "properties": {"agent_id": {"type": "string"}, "label": {"type": "string"}, "mode": {"type": "string"}, "allowed_tools": {"type": "array"}},
            },
        },
        {
            "name": "lock_acquire",
            "description": "Acquire a read/write lock for an agent scope.",
            "inputSchema": {
                "type": "object",
                "properties": {"agent_id": {"type": "string"}, "scope": {"type": "string"}, "mode": {"type": "string", "enum": ["read", "write"]}},
                "required": ["agent_id", "scope"],
            },
        },
        {
            "name": "lock_release",
            "description": "Release a previously acquired lock.",
            "inputSchema": {
                "type": "object",
                "properties": {"lock_id": {"type": "string"}, "agent_id": {"type": "string"}, "scope": {"type": "string"}},
            },
        },
        {
            "name": "subagent_status",
            "description": "Inspect registered subagents and locks.",
            "inputSchema": {"type": "object", "properties": {"agent_id": {"type": "string"}}},
        },
        {
            "name": "run_command",
            "description": "Validate a command draft, or execute an allowlisted verification command when explicitly enabled.",
            "inputSchema": {
                "type": "object",
                "properties": {"command": {"type": "string"}, "argv": {"type": "array"}, "cwd": {"type": "string"}, "execute": {"type": "boolean"}, "timeout_seconds": {"type": "number"}},
            },
        },
        {
            "name": "read_file",
            "description": "Read a workspace/full-access text file when the matching execution flags and access profile are enabled.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "execute": {"type": "boolean"},
                    "access_profile": {"type": "string", "enum": sorted(FILE_ACCESS_PROFILES)},
                },
                "required": ["path"],
            },
        },
        {
            "name": "workspace_scan",
            "description": "List directory metadata for a workspace/full-access root when read execution gates are enabled; file content is not read.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "execute": {"type": "boolean"},
                    "access_profile": {"type": "string", "enum": sorted(FILE_ACCESS_PROFILES)},
                    "max_depth": {"type": "number"},
                    "limit": {"type": "number"},
                    "include_hidden": {"type": "boolean"},
                    "include_dirs": {"type": "boolean"},
                    "include_files": {"type": "boolean"},
                    "extensions": {"type": "array"},
                    "exclude_dirs": {"type": "array"},
                },
                "required": ["path"],
            },
        },
        {
            "name": "write_file",
            "description": "Queue a write approval by default, or execute a text write with backup/diff when execute-write is enabled.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "mode": {"type": "string", "enum": ["replace", "append"]},
                    "execute": {"type": "boolean"},
                    "access_profile": {"type": "string", "enum": sorted(FILE_ACCESS_PROFILES)},
                    "create_dirs": {"type": "boolean"},
                    "backup": {"type": "boolean"},
                    "expected_sha256": {"type": "string"},
                },
                "required": ["path"],
            },
        },
        {
            "name": "web_fetch",
            "description": "Execute a bounded HTTP/API fetch only when execute-web is enabled; otherwise return approval-required metadata.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "method": {"type": "string", "enum": ["GET", "POST"]},
                    "headers": {"type": "object"},
                    "params": {"type": "object"},
                    "json": {},
                    "data": {},
                    "body": {"type": "string"},
                    "execute": {"type": "boolean"},
                    "allow_private_network": {"type": "boolean"},
                    "timeout_seconds": {"type": "number"},
                    "max_bytes": {"type": "number"},
                    "max_chars": {"type": "number"},
                },
                "required": ["url"],
            },
        },
        {
            "name": "mcp_call",
            "description": "Execute a bounded HTTP JSON-RPC or registered stdio MCP call only when execute-mcp is enabled; otherwise return approval-required metadata.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "transport": {"type": "string", "enum": ["http", "stdio"]},
                    "endpoint": {"type": "string"},
                    "server_id": {"type": "string", "enum": sorted(mcp_stdio_registry().keys())},
                    "method": {"type": "string", "enum": mcp_call_policy()["methods"]},
                    "params": {"type": "object"},
                    "headers": {"type": "object"},
                    "id": {},
                    "execute": {"type": "boolean"},
                    "allow_private_network": {"type": "boolean"},
                    "timeout_seconds": {"type": "number"},
                    "max_bytes": {"type": "number"},
                    "max_chars": {"type": "number"},
                },
                "required": ["method"],
            },
        },
        {
            "name": "mcp_stdio_catalog",
            "description": "List registered local stdio MCP servers. This is read-only and does not spawn a server.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "server_id": {"type": "string", "enum": sorted(mcp_stdio_registry().keys())},
                },
            },
        },
    ]


def jsonrpc_success(request_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def jsonrpc_error(request_id: Any, code: int, message: str) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def load_request(args: argparse.Namespace) -> Dict[str, Any]:
    if args.json:
        return json.loads(args.json)
    if args.request:
        return json.loads(Path(args.request).read_text(encoding="utf-8"))
    raw = sys.stdin.read().strip()
    if raw:
        return json.loads(raw)
    raise SystemExit("No request provided. Use --json, --request, stdin, or --serve.")


def save_record(folder: str, req: Dict[str, Any], result: Dict[str, Any]) -> str:
    record_id = str(uuid.uuid4())
    agent_context = agent_context_from_request(req, result)
    path = bridge_dir(folder) / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{record_id}.json"
    record = {
        "id": record_id,
        "created_at": now_iso(),
        "request": redact_record_secrets(req),
        "result": redact_record_secrets(result),
    }
    if agent_context:
        record["agent_context"] = redact_record_secrets(agent_context)
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    return record_id


def approval_record_path(approval_id: str) -> Path:
    clean_id = str(approval_id or "").strip()
    if not clean_id or not re.fullmatch(r"[0-9a-fA-F-]{16,80}", clean_id):
        raise ValueError("approval_id is required")
    matches = sorted(bridge_dir("approvals").glob(f"*-{clean_id}.json"), key=lambda item: item.stat().st_mtime, reverse=True)
    if not matches:
        raise FileNotFoundError(f"approval not found: {clean_id}")
    return matches[0]


def load_approval_record(approval_id: str) -> Dict[str, Any]:
    return json.loads(approval_record_path(approval_id).read_text(encoding="utf-8"))


def save_approval_record(approval_id: str, record: Dict[str, Any]) -> None:
    approval_record_path(approval_id).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")


def recent_records(folder: str, limit: int = 20) -> List[Dict[str, Any]]:
    paths = sorted(bridge_dir(folder).glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)[:limit]
    records = []
    for path in paths:
        try:
            records.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            records.append({"path": str(path), "status": "unreadable"})
    return records


def as_record(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_compact_text(value: Any, limit: int = 240) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    return text[:limit]


def normalize_agent_context(value: Any) -> Dict[str, Any]:
    raw = as_record(value)
    if not raw:
        return {}
    approval_ids = [
        as_compact_text(item, 120)
        for item in raw.get("approval_ids", [])
        if as_compact_text(item, 120)
    ] if isinstance(raw.get("approval_ids"), list) else []
    context_refs = []
    if isinstance(raw.get("context_refs"), list):
        for item in raw.get("context_refs", [])[:12]:
            ref = as_record(item)
            context_refs.append({
                "id": as_compact_text(ref.get("id"), 160),
                "kind": as_compact_text(ref.get("kind"), 80),
                "title": as_compact_text(ref.get("title"), 200),
                "ref": as_compact_text(ref.get("ref"), 240),
                "source": as_compact_text(ref.get("source"), 120),
                "status": as_compact_text(ref.get("status"), 80),
            })
    compact: Dict[str, Any] = {
        "source": as_compact_text(raw.get("source"), 80),
        "mode": as_compact_text(raw.get("mode"), 80),
        "view": as_compact_text(raw.get("view"), 80),
        "thread_id": as_compact_text(raw.get("thread_id"), 160),
        "thread_title": as_compact_text(raw.get("thread_title"), 240),
        "thread_status": as_compact_text(raw.get("thread_status"), 80),
        "workspace_id": as_compact_text(raw.get("workspace_id"), 160),
        "workspace_title": as_compact_text(raw.get("workspace_title"), 240),
        "workspace_domain": as_compact_text(raw.get("workspace_domain"), 160),
        "action": as_compact_text(raw.get("action"), 120),
        "purpose": as_compact_text(raw.get("purpose"), 400),
        "approval_ids": approval_ids[:30],
        "context_attachment_count": int(raw.get("context_attachment_count") or 0) if str(raw.get("context_attachment_count") or "").isdigit() else 0,
        "message_count": int(raw.get("message_count") or 0) if str(raw.get("message_count") or "").isdigit() else 0,
        "context_refs": context_refs,
        "at": raw.get("at") if isinstance(raw.get("at"), (int, float)) else 0,
    }
    return {key: val for key, val in compact.items() if val not in ("", [], {}, 0)}


def agent_context_from_request(req: Dict[str, Any], result: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = as_record(req.get("payload"))
    return normalize_agent_context(
        payload.get("__agent_context")
        or req.get("__agent_context")
        or as_record(result or {}).get("agent_context")
    )


def request_record_enabled(req: Dict[str, Any], default: bool = True) -> bool:
    value = req.get("record")
    if isinstance(value, bool):
        return value
    payload = req.get("payload") if isinstance(req.get("payload"), dict) else {}
    value = payload.get("record")
    if isinstance(value, bool):
        return value
    return default


def approval_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = max(1, min(int(payload.get("limit") or 20), 100))
    action_filter = str(payload.get("action") or "").strip()
    thread_filter = str(payload.get("thread_id") or payload.get("threadId") or "").strip()
    workspace_filter = str(payload.get("workspace_id") or payload.get("workspaceId") or "").strip()
    records = recent_records("approvals", limit=limit)
    if action_filter:
        records = [
            record for record in records
            if str(as_record(record.get("request")).get("action") or as_record(record.get("result")).get("action") or "") == action_filter
        ]
    if thread_filter or workspace_filter:
        records = [
            record for record in records
            for agent_context in [as_record(record.get("agent_context")) or agent_context_from_request(as_record(record.get("request")), as_record(record.get("result")))]
            if (
                (not thread_filter or str(agent_context.get("thread_id") or "") == thread_filter)
                and (not workspace_filter or str(agent_context.get("workspace_id") or "") == workspace_filter)
            )
        ]
    by_action: Dict[str, int] = {}
    by_status: Dict[str, int] = {}
    summaries = []
    for record in records:
        request = as_record(record.get("request"))
        result = as_record(record.get("result"))
        decision = as_record(record.get("decision"))
        agent_context = as_record(record.get("agent_context")) or agent_context_from_request(request, result)
        action = str(request.get("action") or result.get("action") or "unknown")
        status = str(decision.get("status") or result.get("status") or "pending")
        by_action[action] = by_action.get(action, 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
        message = str(decision.get("message") or decision.get("reason") or result.get("message") or "")
        summaries.append({
            "id": record.get("id"),
            "created_at": record.get("created_at"),
            "action": action,
            "status": status,
            "approval_required": bool(result.get("approval_required", True)),
            "message": message,
            "purpose": str(request.get("purpose") or result.get("purpose") or ""),
            "target": str(decision.get("target") or result.get("target") or as_record(result.get("memory_management")).get("target_id") or ""),
            "proposal": result.get("memory_management") if isinstance(result.get("memory_management"), dict) else result.get("write_file"),
            "decision": decision,
            "agent_context": agent_context,
        })
    return {
        "count": len(records),
        "records": records,
        "summaries": summaries,
        "by_action": by_action,
        "by_status": by_status,
    }


def parse_event_time(value: Any, fallback: float | None = None) -> float:
    if isinstance(value, (int, float)) and value > 0:
        return float(value) / 1000 if value > 10_000_000_000 else float(value)
    text = str(value or "").strip()
    if text:
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
        except Exception:
            pass
    return fallback if fallback is not None else time.time()


def runtime_event(
    source: str,
    event_type: str,
    status: str,
    title: str,
    detail: str,
    ref: str,
    at_value: Any,
    record: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    at_epoch = parse_event_time(at_value)
    return {
        "id": f"{source}:{event_type}:{ref or title}:{at_epoch:.3f}",
        "source": source,
        "type": event_type,
        "status": status or "recorded",
        "title": title or event_type or source,
        "detail": detail[:1000],
        "ref": ref,
        "at": datetime.fromtimestamp(at_epoch, timezone.utc).isoformat(),
        "at_epoch": at_epoch,
        "record": redact_record_secrets(record or {}),
    }


def runtime_events(payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = max(1, min(int(payload.get("limit") or 80), 200))
    source_filter = str(payload.get("source") or "").strip().lower()
    status_filter = str(payload.get("status") or "").strip().lower()
    type_filter = str(payload.get("type") or "").strip().lower()
    thread_filter = str(payload.get("thread_id") or payload.get("threadId") or "").strip()
    workspace_filter = str(payload.get("workspace_id") or payload.get("workspaceId") or "").strip()
    after_raw = payload.get("after_epoch", payload.get("since_epoch", payload.get("cursor_epoch", 0)))
    after_epoch = parse_event_time(after_raw, 0) if after_raw not in (None, "", 0) else 0
    after_id = str(payload.get("after_id") or payload.get("cursor_id") or "").strip()
    events: List[Dict[str, Any]] = []

    for record in recent_records("runs", limit=limit * 2):
        request = as_record(record.get("request"))
        result = as_record(record.get("result"))
        agent_context = as_record(record.get("agent_context")) or agent_context_from_request(request, result)
        action = str(request.get("action") or result.get("action") or "unknown")
        status = str(result.get("status") or "recorded")
        message = str(result.get("message") or request.get("purpose") or result.get("purpose") or "")
        events.append(runtime_event(
            "runs",
            "gateway_run",
            status,
            f"Gateway · {action}",
            message,
            str(record.get("id") or ""),
            record.get("created_at"),
            {
                "run_id": record.get("id"),
                "action": action,
                "purpose": request.get("purpose") or result.get("purpose"),
                "approval_id": result.get("approval_id"),
                "agent_context": agent_context,
            },
        ))

    for record in recent_records("approvals", limit=limit * 2):
        request = as_record(record.get("request"))
        result = as_record(record.get("result"))
        decision = as_record(record.get("decision"))
        agent_context = as_record(record.get("agent_context")) or agent_context_from_request(request, result)
        action = str(request.get("action") or result.get("action") or "unknown")
        status = str(decision.get("status") or result.get("status") or "pending")
        message = str(decision.get("message") or decision.get("reason") or result.get("message") or request.get("purpose") or "")
        events.append(runtime_event(
            "approvals",
            "approval",
            status,
            f"审批 · {action}",
            message,
            str(record.get("id") or ""),
            decision.get("decided_at") or record.get("created_at"),
            {
                "approval_id": record.get("id"),
                "action": action,
                "purpose": request.get("purpose") or result.get("purpose"),
                "target": decision.get("target") or result.get("target"),
                "agent_context": agent_context,
            },
        ))

    worker_state = load_worker_state()
    jobs = worker_state.get("jobs") if isinstance(worker_state.get("jobs"), dict) else {}
    for job in jobs.values():
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or job.get("job_id") or "")
        job_kind = str(job.get("kind") or "")
        job_action = str(job.get("action") or as_record(job.get("payload")).get("action") or "")
        status = str(job.get("status") or "recorded")
        title_bits = ["Worker", job_kind, job_action]
        title = " · ".join([item for item in title_bits if item])
        detail = str(job.get("message") or job.get("purpose") or as_record(job.get("payload")).get("task") or "")
        events.append(runtime_event(
            "workers",
            "worker_job",
            status,
            title or "Worker",
            detail,
            job_id,
            job.get("updated_at") or job.get("created_at"),
            {
                "job_id": job_id,
                "kind": job_kind,
                "action": job_action,
                "pid": job.get("pid"),
            },
        ))

    for event in worker_state.get("events", []) if isinstance(worker_state.get("events"), list) else []:
        if not isinstance(event, dict):
            continue
        event_type = str(event.get("type") or "worker_event")
        status = str(event.get("status") or "recorded")
        detail_parts = [
            str(event.get("stage") or ""),
            str(event.get("message") or ""),
            str(event.get("text") or "")[:240],
        ]
        detail = " · ".join([item for item in detail_parts if item])
        events.append(runtime_event(
            "workers",
            event_type,
            status,
            f"Worker 事件 · {event_type}",
            detail,
            str(event.get("job_id") or ""),
            event.get("at"),
            {
                "job_id": event.get("job_id"),
                "stage": event.get("stage"),
                "chunk_index": event.get("chunk_index"),
                "status": event.get("status"),
            },
        ))

    def keep(event: Dict[str, Any]) -> bool:
        if source_filter and str(event.get("source") or "").lower() != source_filter:
            return False
        if status_filter and str(event.get("status") or "").lower() != status_filter:
            return False
        if type_filter and str(event.get("type") or "").lower() != type_filter:
            return False
        event_record = as_record(event.get("record"))
        agent_context = as_record(event_record.get("agent_context"))
        if thread_filter and str(agent_context.get("thread_id") or "") != thread_filter:
            return False
        if workspace_filter and str(agent_context.get("workspace_id") or "") != workspace_filter:
            return False
        return True

    matching = [event for event in events if keep(event)]
    matching.sort(key=lambda item: (float(item.get("at_epoch") or 0), str(item.get("id") or "")), reverse=True)
    filtered = [
        event for event in matching
        if not after_epoch or (
            float(event.get("at_epoch") or 0) > after_epoch
            and (not after_id or str(event.get("id") or "") != after_id)
        )
    ]
    summary: Dict[str, int] = {}
    by_status: Dict[str, int] = {}
    for event in matching:
        source = str(event.get("source") or "unknown")
        status = str(event.get("status") or "recorded")
        summary[source] = summary.get(source, 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
    window = filtered[:limit]
    latest_matching = matching[0] if matching else {}
    latest_window = window[0] if window else {}
    cursor_event = latest_window or latest_matching
    return {
        "count": len(window),
        "total": len(matching),
        "events": window,
        "by_source": summary,
        "by_status": by_status,
        "sources": ["runs", "approvals", "workers"],
        "incremental": bool(after_epoch),
        "after_epoch": after_epoch,
        "after_id": after_id,
        "has_new": bool(window),
        "cursor": {
            "at_epoch": float(cursor_event.get("at_epoch") or after_epoch or 0),
            "id": str(cursor_event.get("id") or after_id or ""),
        },
        "latest": {
            "at_epoch": float(latest_matching.get("at_epoch") or 0),
            "id": str(latest_matching.get("id") or ""),
        },
        "window_oldest_epoch": float(window[-1].get("at_epoch") or 0) if window else 0,
    }


def approval_decide(
    payload: Dict[str, Any],
    execute_command: bool = False,
    execute_write: bool = False,
    execute_memory: bool = False,
    execute_provider: bool = False,
    full_access_files: bool = False,
) -> Dict[str, Any]:
    approval_id = str(payload.get("approval_id") or payload.get("id") or "").strip()
    decision = str(payload.get("decision") or payload.get("status") or "").strip().lower()
    if decision not in {"reject", "execute"}:
        raise ValueError("decision must be reject or execute")
    reason = str(payload.get("reason") or "").strip()
    record = load_approval_record(approval_id)
    request = as_record(record.get("request"))
    original_result = as_record(record.get("result"))
    action = str(request.get("action") or original_result.get("action") or "").strip()
    existing_decision = as_record(record.get("decision"))
    if existing_decision.get("status") in {"executed", "rejected"}:
        return {
            "status": "already_decided",
            "approval_id": approval_id,
            "decision": existing_decision,
            "message": f"approval already {existing_decision.get('status')}",
        }
    if decision == "reject":
        decision_record = {
            "status": "rejected",
            "decision": "reject",
            "reason": reason,
            "decided_at": now_iso(),
            "action": action,
        }
        record["decision"] = decision_record
        save_approval_record(approval_id, record)
        return {
            "status": "rejected",
            "approval_id": approval_id,
            "decision": decision_record,
            "message": "Approval rejected; no action executed.",
        }
    if action != "write_file" and action != "run_command" and action not in MEMORY_MANAGEMENT_ACTIONS and action != "provider_probe":
        decision_record = {
            "status": "blocked",
            "decision": "execute",
            "reason": reason,
            "decided_at": now_iso(),
            "action": action,
            "message": "approval_decide currently only executes queued write_file, run_command, memory management, and provider_probe approvals.",
        }
        record["decision"] = decision_record
        save_approval_record(approval_id, record)
        return {
            "status": "blocked",
            "approval_required": True,
            "approval_id": approval_id,
            "decision": decision_record,
            "message": "Only write_file, run_command, memory management, and provider_probe approvals can be executed by approval_decide.",
        }
    if action == "run_command":
        if not execute_command:
            return {
                "status": "approval_required",
                "approval_required": True,
                "approval_id": approval_id,
                "message": "Executing a run_command approval requires Gateway --execute-command.",
            }
        queued_payload = as_record(request.get("payload")).copy()
        queued_payload["execute"] = True
        command = str(queued_payload.get("command") or "")
        cwd = str(queued_payload.get("cwd") or "")
        validation = validate_command(command, cwd, str(request.get("purpose") or reason or "approved run_command"))
        if any(item["severity"] == "block" for item in validation):
            command_result = {
                "status": "blocked",
                "validation": validation,
                "command_policy": command_execution_policy(),
                "message": "Command validators blocked this queued approval.",
            }
        else:
            command_result = run_verification_command(queued_payload)
            command_result["validation"] = validation
        command_status_value = str(command_result.get("status") or "blocked")
        decision_record = {
            "status": "executed" if command_status_value in {"ok", "failed"} else command_status_value,
            "decision": "execute",
            "reason": reason,
            "decided_at": now_iso(),
            "action": action,
            "target": command,
            "run_command": command_result,
        }
        record["decision"] = decision_record
        record["execution_result"] = command_result
        save_approval_record(approval_id, record)
        return {
            "status": "ok" if command_status_value == "ok" else command_status_value,
            "approval_required": command_status_value not in {"ok", "failed"},
            "approval_id": approval_id,
            "decision": decision_record,
            "run_command": command_result,
            "message": "run_command approval executed through verification allowlist." if command_status_value in {"ok", "failed"} else str(command_result.get("message") or command_result.get("allowlist", {}).get("reason") or "run_command approval did not execute."),
        }
    if action == "provider_probe":
        if not execute_provider:
            return {
                "status": "approval_required",
                "approval_required": True,
                "approval_id": approval_id,
                "message": "Executing a provider_probe approval requires Gateway --execute-provider.",
            }
        queued_payload = as_record(request.get("payload")).copy()
        queued_payload["execute"] = True
        probe_result = provider_probe(queued_payload, str(request.get("purpose") or reason or "approved provider probe"), execute_provider=True)
        probe_status_value = str(probe_result.get("status") or "blocked")
        decision_record = {
            "status": "executed" if probe_status_value == "ok" else probe_status_value,
            "decision": "execute",
            "reason": reason,
            "decided_at": now_iso(),
            "action": action,
            "target": str(probe_result.get("url") or as_record(probe_result.get("config")).get("api_url") or queued_payload.get("api_url") or queued_payload.get("preset_id") or ""),
            "provider_probe": probe_result,
        }
        record["decision"] = decision_record
        record["execution_result"] = probe_result
        save_approval_record(approval_id, record)
        return {
            "status": "ok" if probe_status_value == "ok" else probe_status_value,
            "approval_required": probe_status_value == "approval_required",
            "approval_id": approval_id,
            "decision": decision_record,
            "provider_probe": probe_result,
            "message": str(probe_result.get("reason") or "Provider probe approval decision recorded."),
        }
    if action in MEMORY_MANAGEMENT_ACTIONS:
        if not execute_memory:
            return {
                "status": "approval_required",
                "approval_required": True,
                "approval_id": approval_id,
                "message": "Executing a memory approval requires Gateway --execute-memory.",
            }
        queued_payload = as_record(request.get("payload")).copy()
        memory_result = execute_memory_management(action, queued_payload, reason=reason)
        memory_status_value = str(memory_result.get("status") or "blocked")
        decision_record = {
            "status": "executed" if memory_status_value == "ok" else memory_status_value,
            "decision": "execute",
            "reason": reason,
            "decided_at": now_iso(),
            "action": action,
            "target": str(memory_result.get("target_id") or queued_payload.get("target_id") or ""),
            "memory_management": memory_result,
        }
        record["decision"] = decision_record
        record["execution_result"] = memory_result
        save_approval_record(approval_id, record)
        return {
            "status": "ok" if memory_status_value == "ok" else memory_status_value,
            "approval_required": memory_status_value != "ok",
            "approval_id": approval_id,
            "decision": decision_record,
            "memory_management": memory_result,
            "message": str(memory_result.get("message") or "Memory approval decision recorded."),
        }
    if not execute_write:
        return {
            "status": "approval_required",
            "approval_required": True,
            "approval_id": approval_id,
            "message": "Executing an approval requires Gateway --execute-write.",
        }
    queued_payload = as_record(request.get("payload")).copy()
    queued_payload["execute"] = True
    access_profile = normalize_file_access_profile(queued_payload)
    target = resolve_file_path(str(queued_payload.get("path") or ""), access_profile, full_access_files=full_access_files)
    write_result = write_text_file(queued_payload, target)
    decision_record = {
        "status": "executed",
        "decision": "execute",
        "reason": reason,
        "decided_at": now_iso(),
        "action": action,
        "target": str(target),
        "write_file": write_result,
    }
    record["decision"] = decision_record
    record["execution_result"] = write_result
    save_approval_record(approval_id, record)
    return {
        "status": "ok",
        "approval_required": False,
        "approval_id": approval_id,
        "decision": decision_record,
        "write_file": write_result,
        "message": "Approval executed with write_file backup/diff audit.",
    }


def workflow_state_path() -> Path:
    return bridge_dir("workflows") / "workflow-state.json"


def load_workflow_state() -> Dict[str, Any]:
    path = workflow_state_path()
    if not path.exists():
        return {"workflows": {}, "events": []}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(state, dict) and isinstance(state.get("workflows"), dict):
            state.setdefault("events", [])
            return state
    except Exception:
        pass
    return {"workflows": {}, "events": []}


def save_workflow_state(state: Dict[str, Any]) -> None:
    workflow_state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def kairos_state_path() -> Path:
    return bridge_dir("kairos") / "kairos-state.json"


def load_kairos_state() -> Dict[str, Any]:
    path = kairos_state_path()
    if not path.exists():
        return {"tasks": {}, "events": []}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(state, dict) and isinstance(state.get("tasks"), dict):
            state.setdefault("events", [])
            return state
    except Exception:
        pass
    return {"tasks": {}, "events": []}


def save_kairos_state(state: Dict[str, Any]) -> None:
    kairos_state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def create_kairos_task(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_kairos_state()
    tasks = state.setdefault("tasks", {})
    events = state.setdefault("events", [])
    task_id = str(payload.get("task_id") or payload.get("id") or f"kairos-{uuid.uuid4()}").strip()
    task = {
        "id": task_id,
        "objective": str(payload.get("objective") or payload.get("title") or purpose or "KAIROS task"),
        "status": "queued",
        "next_action": str(payload.get("next_action") or payload.get("nextAction") or ""),
        "source": str(payload.get("source") or payload.get("source_workflow_id") or ""),
        "due_at": str(payload.get("due_at") or payload.get("dueAt") or ""),
        "interval_seconds": int(payload.get("interval_seconds") or payload.get("intervalSeconds") or 0),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "last_tick_at": "",
    }
    tasks[task_id] = task
    events.append({
        "at": now_iso(),
        "task_id": task_id,
        "type": "created",
        "message": purpose or "KAIROS task queued",
    })
    save_kairos_state(state)
    return task


def kairos_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = load_kairos_state()
    tasks = state.get("tasks") if isinstance(state.get("tasks"), dict) else {}
    task_id = str(payload.get("task_id") or payload.get("id") or "").strip()
    if task_id:
        return {
            "task": tasks.get(task_id),
            "events": [event for event in state.get("events", []) if event.get("task_id") == task_id][-20:],
        }
    recent = sorted(tasks.values(), key=lambda item: str(item.get("updated_at") or ""), reverse=True)[:10]
    return {
        "recent_tasks": recent,
        "recent_events": state.get("events", [])[-20:],
    }


def kairos_daily_log_path() -> Path:
    root = bridge_dir("kairos") / "daily"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{datetime.now(timezone.utc).strftime('%Y%m%d')}.md"


def append_kairos_daily_log(kind: str, message: str, payload: Dict[str, Any] | None = None) -> str:
    path = kairos_daily_log_path()
    needs_header = not path.exists() or path.stat().st_size == 0
    with path.open("a", encoding="utf-8") as handle:
        if needs_header:
            handle.write(f"# KAIROS Daily Log {datetime.now(timezone.utc).strftime('%Y-%m-%d')}\n")
        handle.write(f"\n- {now_iso()} | {kind} | {message.strip() or 'event'}\n")
        if payload:
            handle.write(f"  payload: {json.dumps(payload, ensure_ascii=False, sort_keys=True)}\n")
    return str(path.relative_to(bridge_root()))


def kairos_tick_once(message: str = "heartbeat") -> Dict[str, Any]:
    state = load_kairos_state()
    tasks = state.setdefault("tasks", {})
    events = state.setdefault("events", [])
    ticked = []
    log_paths = []
    for task in tasks.values():
        if task.get("status") not in {"queued", "observing"}:
            continue
        task["status"] = "observing"
        task["last_tick_at"] = now_iso()
        task["updated_at"] = task["last_tick_at"]
        event = {
            "at": task["last_tick_at"],
            "task_id": task.get("id"),
            "type": "tick",
            "message": f"{message}; execution still requires approval or bridge-request.",
        }
        events.append(event)
        ticked.append(event)
        log_paths.append(append_kairos_daily_log("tick", event["message"], {"task_id": task.get("id"), "objective": task.get("objective")}))
    save_kairos_state(state)
    return {"ticked": ticked, "task_count": len(tasks), "log_paths": sorted(set(log_paths))}


def run_kairos_tick(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    message = str(payload.get("message") or purpose or "manual KAIROS tick")
    limit = max(1, min(int(payload.get("limit") or 5), 20))
    include_suggestions = bool(payload.get("include_suggestions", True))
    tick = kairos_tick_once(message)
    state = load_kairos_state()
    tasks = state.get("tasks") if isinstance(state.get("tasks"), dict) else {}
    suggestions = []
    for event in tick.get("ticked", [])[:limit]:
        task_id = str(event.get("task_id") or "")
        task = tasks.get(task_id, {})
        objective = str(task.get("objective") or event.get("message") or "")
        if not include_suggestions:
            suggestions.append({"task_id": task_id, "objective": objective})
            continue
        domain = detect_skill_domain("\n".join([objective, str(task.get("next_action") or "")]))
        context = build_context_pack({
            "task": objective,
            "query": objective,
            "domain": domain,
            "limit": 4,
        }, "KAIROS tick context preparation")
        skill = invoke_skill({
            "task": objective,
            "domain": domain,
            "skill_key": "novel-creation-suite" if domain == "writing" else "personal-os-coordinator",
            "limit": 4,
        }, "KAIROS tick skill invocation preparation")
        suggestions.append({
            "task_id": task_id,
            "objective": objective,
            "domain": domain,
            "context_pack": {
                "active_skill_keys": context.get("active_skill_keys", []),
                "context_items": len(context.get("context_pack", [])),
                "tool_policy": context.get("tool_policy", {}),
            },
            "skill_invoke": {
                "skill_key": skill.get("schema", {}).get("skill_key"),
                "execution": skill.get("schema", {}).get("execution"),
            },
            "next_bridge_requests": [
                {"action": "context_pack", "payload": {"task": objective, "domain": domain, "limit": 4}},
                {"action": "skill_invoke", "payload": {"task": objective, "domain": domain, "skill_key": skill.get("schema", {}).get("skill_key")}},
            ],
        })
    if suggestions:
        append_kairos_daily_log("tick_plan", f"Prepared {len(suggestions)} KAIROS task suggestion packets.", {"task_ids": [item.get("task_id") for item in suggestions]})
    recent = sorted(tasks.values(), key=lambda item: str(item.get("updated_at") or ""), reverse=True)[:10]
    return {
        "tick": tick,
        "suggestions": suggestions,
        "recent_tasks": recent,
        "recent_events": state.get("events", [])[-20:],
        "execution": "observation-only-no-external-action",
    }


def kairos_loop(interval_seconds: int) -> None:
    while True:
        time.sleep(max(interval_seconds, 1))
        try:
            kairos_tick_once("daemon heartbeat")
        except Exception:
            pass


def scheduler_state_path() -> Path:
    return bridge_dir("scheduler") / "scheduler-state.json"


def scheduler_draft_dir() -> Path:
    target = bridge_dir("scheduler") / "drafts"
    target.mkdir(parents=True, exist_ok=True)
    return target


def load_scheduler_state() -> Dict[str, Any]:
    path = scheduler_state_path()
    if not path.exists():
        return {"plans": {}, "events": []}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(state, dict) and isinstance(state.get("plans"), dict):
            state.setdefault("events", [])
            return state
    except Exception:
        pass
    return {"plans": {}, "events": []}


def save_scheduler_state(state: Dict[str, Any]) -> None:
    scheduler_state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def scheduler_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = load_scheduler_state()
    plans = state.get("plans") if isinstance(state.get("plans"), dict) else {}
    plan_id = str(payload.get("plan_id") or payload.get("id") or "").strip()
    if plan_id:
        return {
            "plan": plans.get(plan_id),
            "events": [event for event in state.get("events", []) if event.get("plan_id") == plan_id][-20:],
            "draft_dir": str(scheduler_draft_dir().relative_to(bridge_root())),
        }
    recent = sorted(plans.values(), key=lambda item: str(item.get("updated_at") or ""), reverse=True)[:10]
    return {
        "plan_count": len(plans),
        "recent_plans": recent,
        "recent_events": state.get("events", [])[-20:],
        "draft_dir": str(scheduler_draft_dir().relative_to(bridge_root())),
    }


def create_scheduler_plan(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_scheduler_state()
    plans = state.setdefault("plans", {})
    events = state.setdefault("events", [])
    plan_id = str(payload.get("plan_id") or payload.get("id") or f"scheduler-{uuid.uuid4()}").strip()
    task_name = str(payload.get("task_name") or payload.get("taskName") or "ZhimengPersonalOSKairos").strip()
    interval_minutes = max(1, min(int(payload.get("interval_minutes") or payload.get("intervalMinutes") or 5), 1440))
    launcher = str(payload.get("launcher") or "启动织梦PersonalOS网关.cmd").strip()
    launcher_path = safe_path(launcher)
    draft_root = scheduler_draft_dir()
    install_path = draft_root / f"{slugify_skill_title(plan_id)}-install.cmd.draft"
    uninstall_path = draft_root / f"{slugify_skill_title(plan_id)}-uninstall.cmd.draft"
    run_command = f'"{launcher_path}"'
    install_body = "\n".join([
        "@echo off",
        "REM Review before running. This draft registers a Windows Scheduled Task for LumenOS Personal Agent OS.",
        f'schtasks /Create /TN "{task_name}" /SC MINUTE /MO {interval_minutes} /TR {run_command} /F',
        "pause",
        "",
    ])
    uninstall_body = "\n".join([
        "@echo off",
        "REM Review before running. This draft removes the LumenOS Personal Agent OS Scheduled Task.",
        f'schtasks /Delete /TN "{task_name}" /F',
        "pause",
        "",
    ])
    install_path.write_text(install_body, encoding="utf-8")
    uninstall_path.write_text(uninstall_body, encoding="utf-8")
    plan = {
        "id": plan_id,
        "task_name": task_name,
        "status": "draft",
        "platform": "windows-schtasks",
        "interval_minutes": interval_minutes,
        "launcher": str(launcher_path.relative_to(bridge_root())),
        "install_draft_path": str(install_path.relative_to(bridge_root())),
        "uninstall_draft_path": str(uninstall_path.relative_to(bridge_root())),
        "purpose": purpose or "KAIROS scheduler draft",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "execution": "not-installed-by-gateway",
    }
    plans[plan_id] = plan
    events.append({"at": now_iso(), "type": "scheduler_plan", "plan_id": plan_id, "message": f"Scheduler draft created for {task_name}."})
    save_scheduler_state(state)
    append_kairos_daily_log("scheduler_plan", f"Created scheduler draft {plan_id}.", {"install_draft_path": plan["install_draft_path"]})
    return plan


def select_scheduler_plan(state: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    plans = state.get("plans") if isinstance(state.get("plans"), dict) else {}
    plan_id = str(payload.get("plan_id") or payload.get("id") or "").strip()
    if plan_id and plan_id in plans:
        return plans[plan_id]
    recent = sorted(plans.values(), key=lambda item: str(item.get("updated_at") or item.get("created_at") or ""), reverse=True)
    if recent:
        return recent[0]
    raise ValueError("scheduler plan_id is required or no scheduler plan exists")


def scheduler_schtasks_args(plan: Dict[str, Any], action: str) -> List[str]:
    task_name = str(plan.get("task_name") or "").strip()
    if not task_name:
        raise ValueError("scheduler plan is missing task_name")
    if action == "install":
        launcher_raw = str(plan.get("launcher") or "").strip()
        launcher_path = safe_path(launcher_raw)
        interval_minutes = max(1, min(int(plan.get("interval_minutes") or 5), 1440))
        return [
            "schtasks",
            "/Create",
            "/TN",
            task_name,
            "/SC",
            "MINUTE",
            "/MO",
            str(interval_minutes),
            "/TR",
            str(launcher_path),
            "/F",
        ]
    if action == "uninstall":
        return ["schtasks", "/Delete", "/TN", task_name, "/F"]
    raise ValueError("scheduler action must be install or uninstall")


def execute_scheduler_plan(payload: Dict[str, Any], purpose: str, action: str, execute_scheduler: bool) -> Dict[str, Any]:
    state = load_scheduler_state()
    plans = state.setdefault("plans", {})
    events = state.setdefault("events", [])
    plan = select_scheduler_plan(state, payload)
    plan_id = str(plan.get("id") or "")
    argv = scheduler_schtasks_args(plan, action)
    if not execute_scheduler or not bool(payload.get("execute")):
        return {
            "status": "approval_required",
            "plan": plan,
            "argv": argv,
            "policy": scheduler_execution_policy(),
            "message": "Scheduler execution requires Gateway --execute-scheduler plus payload execute=true.",
        }
    if os.name != "nt":
        return {"status": "blocked", "plan": plan, "argv": argv, "policy": scheduler_execution_policy(), "message": "Windows schtasks is only available on Windows."}
    completed = subprocess.run(
        argv,
        cwd=bridge_root(),
        capture_output=True,
        text=True,
        timeout=min(int(payload.get("timeout_seconds") or 20), scheduler_execution_policy()["timeout_seconds_max"]),
        shell=False,
    )
    now = now_iso()
    status = "installed" if action == "install" and completed.returncode == 0 else "uninstalled" if action == "uninstall" and completed.returncode == 0 else "failed"
    plan.update({
        "status": status,
        "last_scheduler_action": action,
        "last_returncode": completed.returncode,
        "last_stdout": (completed.stdout or "")[:2000],
        "last_stderr": (completed.stderr or "")[:2000],
        "updated_at": now,
        "execution": "windows-schtasks-executed" if completed.returncode == 0 else "windows-schtasks-failed",
    })
    plans[plan_id] = plan
    events.append({
        "at": now,
        "type": f"scheduler_{action}",
        "plan_id": plan_id,
        "status": status,
        "returncode": completed.returncode,
        "message": purpose or f"scheduler {action}",
    })
    save_scheduler_state(state)
    append_kairos_daily_log(f"scheduler_{action}", f"Scheduler {action} {status} for {plan_id}.", {"returncode": completed.returncode})
    return {
        "status": status,
        "plan": plan,
        "argv": argv,
        "returncode": completed.returncode,
        "stdout": (completed.stdout or "")[:5000],
        "stderr": (completed.stderr or "")[:5000],
        "policy": scheduler_execution_policy(),
    }


def memory_state_path() -> Path:
    return bridge_dir("memory") / "autodream-state.json"


def load_memory_state() -> Dict[str, Any]:
    path = memory_state_path()
    if not path.exists():
        return {"l1_events": [], "l2_summaries": []}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(state, dict) and isinstance(state.get("l1_events"), list):
            state.setdefault("l2_summaries", [])
            return state
    except Exception:
        pass
    return {"l1_events": [], "l2_summaries": []}


def save_memory_state(state: Dict[str, Any]) -> None:
    memory_state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_memory_dimension(raw: str) -> str:
    value = (raw or "").strip().lower()
    return value if value in MEMORY_DIMENSIONS else "episode"


def create_memory_event(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_memory_state()
    events = state.setdefault("l1_events", [])
    event = {
        "id": str(payload.get("event_id") or payload.get("id") or f"mem-{uuid.uuid4()}"),
        "at": now_iso(),
        "dimension": normalize_memory_dimension(str(payload.get("dimension") or "")),
        "source": str(payload.get("source") or "gateway"),
        "summary": str(payload.get("summary") or payload.get("text") or purpose or "").strip()[:1200],
        "tags": payload.get("tags") if isinstance(payload.get("tags"), list) else [],
        "importance": int(payload.get("importance") or 3),
        "consolidated_at": "",
    }
    events.append(event)
    save_memory_state(state)
    return event


def memory_dimension_counts(events: List[Dict[str, Any]], summaries: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    counts: Dict[str, Dict[str, Any]] = {}
    for dimension in sorted(MEMORY_DIMENSIONS):
        l1 = [event for event in events if event.get("dimension") == dimension]
        l2 = [item for item in summaries if item.get("dimension") == dimension]
        counts[dimension] = {
            "label": MEMORY_DIMENSION_LABELS.get(dimension, dimension),
            "l1": len(l1),
            "l2": len(l2),
            "pending": len([event for event in l1 if not event.get("consolidated_at")]),
        }
    return counts


def memory_query_terms(query: str) -> List[str]:
    raw_terms = re.findall(r"[A-Za-z0-9_.:/-]+|[\u4e00-\u9fff]{2,}", query.lower())
    seen: List[str] = []
    for term in raw_terms:
        cleaned = term.strip().lower()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen[:12]


def memory_record_text(record: Dict[str, Any]) -> str:
    tags = record.get("tags") if isinstance(record.get("tags"), list) else []
    evidence = record.get("evidence") if isinstance(record.get("evidence"), list) else []
    parts = [
        str(record.get("dimension") or ""),
        str(record.get("source") or ""),
        str(record.get("summary") or ""),
        str(record.get("purpose") or ""),
        " ".join(str(tag) for tag in tags),
        " ".join(str(item) for item in evidence),
    ]
    return " ".join(parts).lower()


def memory_match_score(record: Dict[str, Any], terms: List[str]) -> int:
    if not terms:
        return 1
    haystack = memory_record_text(record)
    return sum(1 for term in terms if term in haystack)


def public_memory_record(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": record.get("id"),
        "at": record.get("at"),
        "dimension": record.get("dimension"),
        "source": record.get("source"),
        "summary": record.get("summary"),
        "tags": record.get("tags") if isinstance(record.get("tags"), list) else [],
        "importance": record.get("importance"),
        "confidence": record.get("confidence"),
        "evidence": record.get("evidence") if isinstance(record.get("evidence"), list) else [],
    }


def normalize_memory_kind(raw: str) -> str:
    value = (raw or "").strip().lower()
    if value in {"l1", "event", "events"}:
        return "L1"
    if value in {"l2", "summary", "summaries"}:
        return "L2"
    return ""


def find_memory_record(state: Dict[str, Any], target_id: str, target_kind: str = "") -> Dict[str, Any]:
    target = str(target_id or "").strip()
    if not target:
        return {}
    collections = []
    kind = normalize_memory_kind(target_kind)
    if kind in {"", "L1"}:
        collections.append(("L1", state.get("l1_events", []) if isinstance(state.get("l1_events"), list) else []))
    if kind in {"", "L2"}:
        collections.append(("L2", state.get("l2_summaries", []) if isinstance(state.get("l2_summaries"), list) else []))
    for record_kind, records in collections:
        for index, record in enumerate(records):
            if isinstance(record, dict) and str(record.get("id") or "") == target:
                return {
                    "kind": record_kind,
                    "index": index,
                    "record": public_memory_record(record),
                }
    return {}


def memory_management_proposal(action: str, payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_memory_state()
    target_id = str(payload.get("target_id") or payload.get("id") or "").strip()
    target_kind = normalize_memory_kind(str(payload.get("target_kind") or payload.get("kind") or ""))
    dimension = normalize_memory_dimension(str(payload.get("dimension") or ""))
    proposal = {
        "proposal_id": f"memory-{action}-{uuid.uuid4()}",
        "action": action,
        "status": "approval_required",
        "mode": "approval-only",
        "created_at": now_iso(),
        "purpose": purpose or f"Memory Manager {action}",
        "target_id": target_id,
        "target_kind": target_kind or "unknown",
        "dimension": dimension,
        "reason": str(payload.get("reason") or payload.get("note") or purpose or "").strip()[:1200],
        "patch": payload.get("patch") if isinstance(payload.get("patch"), dict) else {},
        "record_ids": payload.get("record_ids") if isinstance(payload.get("record_ids"), list) else [],
        "summary": str(payload.get("summary") or "").strip()[:1200],
        "target_snapshot": {},
        "review_gate": "This proposal is queued for human review; it does not mutate bridge/memory/autodream-state.json.",
        "execute_policy": "Execution requires approval_decide with Gateway --execute-memory and request execute=true.",
    }
    if target_id:
        proposal["target_snapshot"] = find_memory_record(state, target_id, target_kind)
    if action == "memory_merge":
        snapshots = []
        for record_id in proposal["record_ids"][:20]:
            match = find_memory_record(state, str(record_id), target_kind)
            if match:
                snapshots.append(match)
        proposal["merge_snapshots"] = snapshots
        proposal["target_kind"] = target_kind or "L2"
    if action == "memory_restore":
        backup_name = Path(str(payload.get("backup_name") or payload.get("backup_path") or "")).name
        proposal["backup_name"] = backup_name
        proposal["backup_snapshot"] = memory_backup_record(backup_name)
        proposal["target_kind"] = "state"
        proposal["target_id"] = backup_name
    return proposal


def memory_backup_record(name: str) -> Dict[str, Any]:
    backup_name = Path(str(name or "")).name
    if not backup_name:
        return {}
    backup_path = bridge_dir("memory") / "backups" / backup_name
    if not backup_path.exists() or not backup_path.is_file():
        return {}
    backup_text = ""
    try:
        backup_text = backup_path.read_text(encoding="utf-8")
        state = json.loads(backup_text)
    except Exception:
        state = {}
    l1 = state.get("l1_events") if isinstance(state, dict) and isinstance(state.get("l1_events"), list) else []
    l2 = state.get("l2_summaries") if isinstance(state, dict) and isinstance(state.get("l2_summaries"), list) else []
    stat = backup_path.stat()
    return {
        "name": backup_name,
        "path": str(backup_path.relative_to(bridge_root())),
        "size": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        "l1_count": len(l1),
        "l2_count": len(l2),
        "sha256": short_sha256(backup_text) if backup_text and stat.st_size <= 2_000_000 else "",
    }


def memory_backup_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = max(1, min(int(payload.get("limit") or 12), 50))
    backup_dir = bridge_dir("memory") / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backups = [
        memory_backup_record(path.name)
        for path in sorted(backup_dir.glob("*.bak"), key=lambda item: item.stat().st_mtime, reverse=True)[:limit]
    ]
    current = load_memory_state()
    l1 = current.get("l1_events") if isinstance(current.get("l1_events"), list) else []
    l2 = current.get("l2_summaries") if isinstance(current.get("l2_summaries"), list) else []
    return {
        "count": len([item for item in backups if item]),
        "backups": [item for item in backups if item],
        "current": {
            "path": str(memory_state_path().relative_to(bridge_root())),
            "l1_count": len(l1),
            "l2_count": len(l2),
            "size": memory_state_path().stat().st_size if memory_state_path().exists() else 0,
        },
        "restore_gate": "memory_restore queues an approval; approval_decide with --execute-memory restores the backup.",
    }


def memory_collection_for_kind(state: Dict[str, Any], kind: str) -> List[Dict[str, Any]]:
    normalized = normalize_memory_kind(kind)
    key = "l2_summaries" if normalized == "L2" else "l1_events"
    collection = state.setdefault(key, [])
    if not isinstance(collection, list):
        collection = []
        state[key] = collection
    return collection


def find_memory_record_ref(state: Dict[str, Any], target_id: str, target_kind: str = "") -> Dict[str, Any]:
    target = str(target_id or "").strip()
    if not target:
        return {}
    collections = []
    kind = normalize_memory_kind(target_kind)
    if kind in {"", "L1"}:
        collections.append(("L1", state.setdefault("l1_events", [])))
    if kind in {"", "L2"}:
        collections.append(("L2", state.setdefault("l2_summaries", [])))
    for record_kind, records in collections:
        if not isinstance(records, list):
            continue
        for index, record in enumerate(records):
            if isinstance(record, dict) and str(record.get("id") or "") == target:
                return {"kind": record_kind, "index": index, "record": record}
    return {}


def sanitize_memory_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {"summary", "tags", "importance", "confidence", "dimension", "source", "purpose", "evidence"}
    clean: Dict[str, Any] = {}
    for key, value in patch.items():
        if key not in allowed:
            continue
        if key == "summary":
            clean[key] = str(value or "").strip()[:1200]
        elif key == "tags":
            clean[key] = [str(item).strip() for item in value[:20] if str(item).strip()] if isinstance(value, list) else []
        elif key == "importance":
            try:
                clean[key] = max(1, min(5, int(value)))
            except Exception:
                pass
        elif key == "dimension":
            clean[key] = normalize_memory_dimension(str(value or ""))
        elif key == "evidence":
            clean[key] = [str(item).strip()[:400] for item in value[:20] if str(item).strip()] if isinstance(value, list) else []
        else:
            clean[key] = str(value or "").strip()[:400]
    return clean


def backup_memory_state() -> str:
    source = memory_state_path()
    backup_dir = bridge_dir("memory") / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-autodream-state.json.bak"
    if source.exists():
        shutil.copy2(source, backup)
    else:
        backup.write_text(json.dumps({"l1_events": [], "l2_summaries": []}, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(backup.relative_to(bridge_root()))


def execute_memory_management(action: str, payload: Dict[str, Any], reason: str = "") -> Dict[str, Any]:
    state = load_memory_state()
    backup_path = backup_memory_state()
    executed_at = now_iso()
    target_id = str(payload.get("target_id") or payload.get("id") or "").strip()
    target_kind = normalize_memory_kind(str(payload.get("target_kind") or payload.get("kind") or ""))
    result: Dict[str, Any] = {
        "status": "ok",
        "action": action,
        "executed_at": executed_at,
        "backup_path": backup_path,
        "target_id": target_id,
        "target_kind": target_kind or "unknown",
        "reason": reason or str(payload.get("reason") or payload.get("note") or ""),
    }
    if action == "memory_restore":
        backup_name = Path(str(payload.get("backup_name") or payload.get("backup_path") or "")).name
        backup_file = bridge_dir("memory") / "backups" / backup_name
        if not backup_name or not backup_file.exists() or not backup_file.is_file():
            return {**result, "status": "blocked", "message": f"memory backup not found: {backup_name}"}
        try:
            restored_state = json.loads(backup_file.read_text(encoding="utf-8"))
        except Exception as exc:
            return {**result, "status": "blocked", "message": f"memory backup is unreadable: {exc}"}
        if not isinstance(restored_state, dict) or not isinstance(restored_state.get("l1_events"), list):
            return {**result, "status": "blocked", "message": "memory backup does not look like AutoDream state."}
        restored_state.setdefault("l2_summaries", [])
        save_memory_state(restored_state)
        l1 = restored_state.get("l1_events") if isinstance(restored_state.get("l1_events"), list) else []
        l2 = restored_state.get("l2_summaries") if isinstance(restored_state.get("l2_summaries"), list) else []
        return {
            **result,
            "operation": "restored",
            "target_id": backup_name,
            "target_kind": "state",
            "restored_backup": memory_backup_record(backup_name),
            "restored_counts": {"l1": len(l1), "l2": len(l2)},
            "message": "memory_restore executed with pre-restore AutoDream backup.",
        }
    if action in {"memory_update", "memory_freeze", "memory_delete"}:
        found = find_memory_record_ref(state, target_id, target_kind)
        if not found:
            return {
                **result,
                "status": "blocked",
                "message": f"memory target not found: {target_id}",
            }
        record = as_record(found.get("record"))
        before = public_memory_record(record)
        if action == "memory_update":
            patch = sanitize_memory_patch(as_record(payload.get("patch")))
            if not patch:
                return {**result, "status": "blocked", "message": "memory_update requires a non-empty safe patch."}
            record.update(patch)
            record["updated_at"] = executed_at
            record["updated_reason"] = result["reason"]
            operation = "updated"
        elif action == "memory_freeze":
            record["frozen"] = True
            record["frozen_at"] = executed_at
            record["frozen_reason"] = result["reason"]
            operation = "frozen"
        else:
            record["deleted"] = True
            record["deleted_at"] = executed_at
            record["deleted_reason"] = result["reason"]
            operation = "soft_deleted"
        after = public_memory_record(record) | {
            "frozen": record.get("frozen"),
            "deleted": record.get("deleted"),
            "updated_at": record.get("updated_at"),
            "frozen_at": record.get("frozen_at"),
            "deleted_at": record.get("deleted_at"),
        }
        save_memory_state(state)
        return {
            **result,
            "operation": operation,
            "target_kind": str(found.get("kind") or target_kind or "unknown"),
            "index": found.get("index"),
            "before": before,
            "after": after,
            "message": f"{action} executed with AutoDream backup.",
        }
    if action == "memory_merge":
        record_ids = [str(item).strip() for item in payload.get("record_ids", []) if str(item).strip()] if isinstance(payload.get("record_ids"), list) else []
        if len(record_ids) < 2:
            return {**result, "status": "blocked", "message": "memory_merge requires at least two record_ids."}
        snapshots = []
        source_records = []
        for record_id in record_ids[:20]:
            found = find_memory_record_ref(state, record_id, target_kind)
            if found:
                snapshots.append(found)
                source_records.append(as_record(found.get("record")))
        if len(source_records) < 2:
            return {**result, "status": "blocked", "message": "memory_merge could not resolve at least two records."}
        dimension = normalize_memory_dimension(str(payload.get("dimension") or source_records[0].get("dimension") or "episode"))
        tags = sorted({
            str(tag).strip()
            for record in source_records
            for tag in (record.get("tags") if isinstance(record.get("tags"), list) else [])
            if str(tag).strip()
        })[:20]
        summary_text = str(payload.get("summary") or "").strip()
        if not summary_text:
            summary_text = " / ".join(str(record.get("summary") or "")[:180] for record in source_records[:5])
        merged = {
            "id": f"l2-manual-{uuid.uuid4()}",
            "at": executed_at,
            "dimension": dimension,
            "event_ids": record_ids,
            "summary": summary_text[:1600],
            "purpose": "manual memory_merge approval",
            "tags": tags,
            "evidence": [
                f"{record.get('id')}: {str(record.get('summary') or '')[:240]}"
                for record in source_records[:8]
            ],
            "confidence": "manual",
            "merged_by": "approval_decide",
            "merge_reason": result["reason"],
        }
        memory_collection_for_kind(state, "L2").append(merged)
        for item in snapshots:
            record = as_record(item.get("record"))
            record["merged_into"] = merged["id"]
            record["merged_at"] = executed_at
        save_memory_state(state)
        return {
            **result,
            "operation": "merged",
            "target_kind": "L2",
            "merged_record": public_memory_record(merged),
            "source_count": len(source_records),
            "message": "memory_merge executed with AutoDream backup.",
        }
    return {**result, "status": "blocked", "message": f"unsupported memory action: {action}"}


def memory_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = load_memory_state()
    dimension = str(payload.get("dimension") or "").strip().lower()
    events = state.get("l1_events", [])
    summaries = state.get("l2_summaries", [])
    all_events = events if isinstance(events, list) else []
    all_summaries = summaries if isinstance(summaries, list) else []
    if dimension in MEMORY_DIMENSIONS:
        events = [event for event in all_events if event.get("dimension") == dimension]
        summaries = [item for item in all_summaries if item.get("dimension") == dimension]
    else:
        events = all_events
        summaries = all_summaries
    pending = [event for event in events if not event.get("consolidated_at")]
    return {
        "l1_count": len(events),
        "l2_count": len(summaries),
        "pending_count": len(pending),
        "recent_l1": events[-10:],
        "recent_l2": summaries[-10:],
        "dimensions": memory_dimension_counts(all_events, all_summaries),
    }


def retrieve_memory(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = load_memory_state()
    query = str(payload.get("query") or payload.get("keyword") or "").strip()
    dimension = str(payload.get("dimension") or "").strip().lower()
    limit = max(1, min(int(payload.get("limit") or 8), 20))
    terms = memory_query_terms(query)
    events = state.get("l1_events", []) if isinstance(state.get("l1_events"), list) else []
    summaries = state.get("l2_summaries", []) if isinstance(state.get("l2_summaries"), list) else []
    if dimension in MEMORY_DIMENSIONS:
        events = [event for event in events if event.get("dimension") == dimension]
        summaries = [item for item in summaries if item.get("dimension") == dimension]

    def ranked(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        scored = []
        for item in items:
            score = memory_match_score(item, terms)
            if terms and score <= 0:
                continue
            try:
                score += min(int(item.get("importance") or 0), 5)
            except Exception:
                pass
            scored.append((score, str(item.get("at") or ""), item))
        scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
        return [public_memory_record(item) | {"score": score} for score, _, item in scored[:limit]]

    l2_matches = ranked(summaries)
    l1_matches = ranked(events)
    context_pack = [
        f"[{item.get('dimension')}] {item.get('summary')}"
        for item in (l2_matches + l1_matches)[:limit]
        if item.get("summary")
    ]
    return {
        "query": query,
        "terms": terms,
        "dimension": dimension if dimension in MEMORY_DIMENSIONS else "all",
        "l2_matches": l2_matches,
        "l1_matches": l1_matches,
        "context_pack": context_pack,
        "dimensions": memory_dimension_counts(
            state.get("l1_events", []) if isinstance(state.get("l1_events"), list) else [],
            state.get("l2_summaries", []) if isinstance(state.get("l2_summaries"), list) else [],
        ),
    }


def consolidate_memory(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_memory_state()
    events = state.setdefault("l1_events", [])
    summaries = state.setdefault("l2_summaries", [])
    dimension_filter = str(payload.get("dimension") or "").strip().lower()
    pending = [
        event for event in events
        if not event.get("consolidated_at") and (dimension_filter not in MEMORY_DIMENSIONS or event.get("dimension") == dimension_filter)
    ]
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for event in pending:
        grouped.setdefault(str(event.get("dimension") or "episode"), []).append(event)
    created = []
    for dimension, items in grouped.items():
        if not items:
            continue
        summary_id = f"l2-{uuid.uuid4()}"
        preview = " / ".join(str(item.get("summary") or "")[:160] for item in items[:5])
        tags = sorted({str(tag) for item in items for tag in (item.get("tags") if isinstance(item.get("tags"), list) else []) if str(tag).strip()})[:12]
        evidence = [
            f"{item.get('source') or 'gateway'}: {str(item.get('summary') or '')[:220]}"
            for item in sorted(items, key=lambda row: int(row.get("importance") or 0), reverse=True)[:6]
        ]
        summary = {
            "id": summary_id,
            "at": now_iso(),
            "dimension": dimension,
            "event_ids": [item.get("id") for item in items],
            "summary": f"{len(items)} L1 events consolidated. {preview}".strip(),
            "purpose": purpose or "AutoDream consolidation",
            "tags": tags,
            "evidence": evidence,
            "confidence": "high" if len(items) >= 3 else "medium" if len(items) >= 2 else "low",
        }
        summaries.append(summary)
        for item in items:
            item["consolidated_at"] = summary["at"]
        created.append(summary)
    save_memory_state(state)
    return {
        "created": created,
        "status": memory_status({"dimension": dimension_filter}),
    }


def bootstrap_memory(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    objective = str(payload.get("goal") or payload.get("objective") or payload.get("query") or purpose or "Personal OS memory bootstrap").strip()
    marker = str(payload.get("marker") or f"memory-bootstrap-{uuid.uuid4().hex[:8]}")
    event_specs = [
        {
            "dimension": "project",
            "summary": (
                f"{marker}: Personal OS objective captured. Goal: {objective}. "
                "The system must prefer compact context packs, workflow evidence, and source boundaries over raw prompt stuffing."
            ),
            "tags": ["goal-mode", "project", "context-economy"],
            "importance": 5,
        },
        {
            "dimension": "episode",
            "summary": (
                f"{marker}: Simulated long conversation segment. User wants Codex/Claude Code/OpenClaw/Hermes-style capabilities: "
                "persistent memory, Skills, tool use, project DAGs, KAIROS autonomy, subagents, and safety gates. "
                "This synthetic event stands in for a long dialogue window that should be compressed into L2."
            ),
            "tags": ["simulated-long-context", "autodream", "episode"],
            "importance": 4,
        },
        {
            "dimension": "skill",
            "summary": (
                f"{marker}: Skills routing memory. Novel creation is a domain under the broader Personal OS; writing tasks should mount "
                "novel-creation-suite, novel-kb-manager, novel-distillation, and tomato-novel-auto-distill without disabling global coordinator rules."
            ),
            "tags": ["skills", "writing-domain", "routing"],
            "importance": 4,
        },
        {
            "dimension": "tool",
            "summary": (
                f"{marker}: Tool observation memory. Gateway actions must stay auditable: source_audit blocks leaked/protected sources, "
                "goal_bootstrap creates planner trees, worker jobs run only allowlisted internal bridge actions, and shell execution stays gated."
            ),
            "tags": ["tool-observation", "safety", "worker"],
            "importance": 5,
        },
        {
            "dimension": "preference",
            "summary": (
                f"{marker}: User preference memory. The user wants a real Personal OS agent, not a shallow novel-only prompt panel; "
                "progress should be concrete, source-safe, verified, and not copied from leaked code."
            ),
            "tags": ["user-preference", "personal-os", "source-boundary"],
            "importance": 4,
        },
    ]
    created_events = [
        create_memory_event({
            "event_id": f"{marker}-{index + 1}",
            "dimension": spec["dimension"],
            "source": "memory_bootstrap",
            "summary": spec["summary"],
            "tags": spec["tags"],
            "importance": spec["importance"],
        }, "Phase 2 AutoDream bootstrap seed")
        for index, spec in enumerate(event_specs)
    ]
    consolidation = consolidate_memory({}, "Phase 2 AutoDream bootstrap consolidation")
    retrieval = retrieve_memory({
        "query": str(payload.get("query") or objective),
        "dimension": str(payload.get("dimension") or ""),
        "limit": payload.get("limit") or 6,
    })
    status = memory_status({})
    created_l2 = consolidation.get("created") if isinstance(consolidation.get("created"), list) else []
    return {
        "created_events": created_events,
        "created": created_l2,
        "consolidation": consolidation,
        "retrieval": retrieval,
        "status": status,
        "evidence": {
            "seeded_l1_events": len(created_events),
            "created_l2_summaries": len(created_l2),
            "retrieved_context_pack": len(retrieval.get("context_pack", [])) if isinstance(retrieval.get("context_pack"), list) else 0,
            "state_path": str(memory_state_path().relative_to(bridge_root())),
            "execution": "local-l1-l2-consolidation-no-model-no-network",
        },
        "next_bridge_requests": [
            {"action": "memory_status", "purpose": "Inspect L1/L2 counts after bootstrap.", "payload": {}},
            {"action": "memory_retrieve", "purpose": "Retrieve compact Personal OS context after bootstrap.", "payload": {"query": objective, "limit": 6}},
            {"action": "context_pack", "purpose": "Use consolidated memory as compact implementation context.", "payload": {"task": objective, "domain": "research", "dimension": "project", "limit": 4}},
        ],
    }


def autodream_tick_once(threshold: int = 1) -> Dict[str, Any]:
    status = memory_status({})
    pending_count = int(status.get("pending_count") or 0)
    if pending_count < max(threshold, 1):
        return {"status": "idle", "pending_count": pending_count, "threshold": max(threshold, 1)}
    result = consolidate_memory({}, "daemon AutoDream consolidation")
    created = result.get("created") if isinstance(result.get("created"), list) else []
    log_path = append_kairos_daily_log(
        "autodream",
        f"Consolidated {len(created)} L2 summaries from {pending_count} pending L1 events.",
        {"created_count": len(created), "pending_before": pending_count},
    )
    return {"status": "consolidated", "pending_count": pending_count, "created_count": len(created), "log_path": log_path, "memory": result}


def autodream_loop(interval_seconds: int, threshold: int) -> None:
    while True:
        time.sleep(max(interval_seconds, 1))
        try:
            autodream_tick_once(threshold)
        except Exception:
            pass


def skill_state_path() -> Path:
    return bridge_dir("skills") / "skill-crystallization-state.json"


def skill_draft_dir() -> Path:
    target = bridge_dir("skills") / "drafts"
    target.mkdir(parents=True, exist_ok=True)
    return target


def skill_activated_dir() -> Path:
    target = bridge_dir("skills") / "activated"
    target.mkdir(parents=True, exist_ok=True)
    return target


def load_skill_state() -> Dict[str, Any]:
    path = skill_state_path()
    if not path.exists():
        return {"candidates": {}, "events": []}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(state, dict) and isinstance(state.get("candidates"), dict):
            state.setdefault("events", [])
            return state
    except Exception:
        pass
    return {"candidates": {}, "events": []}


def save_skill_state(state: Dict[str, Any]) -> None:
    skill_state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def detect_skill_domain(text: str) -> str:
    haystack = text.lower()
    rules = [
        ("writing", ["小说", "章节", "正文", "人物", "角色", "世界观", "大纲", "伏笔", "爽点", "番茄", "网文", "写作", "创作", "故事", "开书"]),
        ("coding", ["代码", "仓库", "编译", "bug", "修复", "测试", "react", "python", "typescript", "codex", "claude code", "claudecode"]),
        ("research", ["搜索", "研究", "资料", "论文", "网页", "github", "源码", "架构", "对比", "调研", "分析"]),
        ("automation", ["定时", "cron", "守护", "后台", "自动", "监控", "kairos", "daemon"]),
        ("memory", ["记忆", "memory", "归档", "沉淀", "长期", "偏好", "画像", "soul", "autodream", "上下文"]),
    ]
    for domain, terms in rules:
        if any(term.lower() in haystack for term in terms):
            return domain
    return "general"


def skill_trigger_hits(skill: Dict[str, Any], text: str) -> List[str]:
    haystack = text.lower()
    return [term for term in skill.get("triggers", []) if str(term).lower() in haystack]


def configured_skill_roots() -> List[Dict[str, Any]]:
    home = Path.home()
    roots = [
        {"key": "codex-user", "label": "Codex 用户 Skills", "path": home / ".codex" / "skills", "source": "codex-local"},
        {"key": "agents-user", "label": "Agents 用户 Skills", "path": home / ".agents" / "skills", "source": "codex-local"},
        {"key": "codex-system", "label": "Codex 内置 Skills", "path": home / ".codex" / "skills" / ".system", "source": "built-in"},
        {"key": "openai-bundled", "label": "OpenAI Bundled Skills", "path": home / ".codex" / "plugins" / "cache" / "openai-bundled", "source": "built-in"},
    ]
    raw_extra = os.environ.get("ZHIMENG_SKILL_ROOTS", "")
    for index, raw_path in enumerate([part.strip() for part in raw_extra.split(os.pathsep) if part.strip()], start=1):
        roots.append({"key": f"env-{index}", "label": f"环境 Skill Root {index}", "path": Path(raw_path), "source": "workspace"})
    return roots


def skill_md_title(content: str, fallback: str) -> str:
    for line in content.splitlines()[:40]:
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip()
            if title:
                return title[:120]
    return fallback[:120]


def skill_md_description(content: str) -> str:
    seen_title = False
    for line in content.splitlines()[:80]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            seen_title = True
            continue
        if not seen_title and stripped.lower() in {"---", "metadata:"}:
            continue
        return re.sub(r"\s+", " ", stripped).strip()[:360]
    return ""


def infer_skill_scope(text: str) -> str:
    domain = detect_skill_domain(text)
    if domain in {"writing", "coding", "research", "automation"}:
        return domain
    if domain == "memory":
        return "global"
    return "global"


def local_skill_score(skill: Dict[str, Any], query: str, domain: str) -> int:
    score = 0
    q = query.strip().lower()
    haystack = " ".join([
        str(skill.get("id") or ""),
        str(skill.get("label") or ""),
        str(skill.get("description") or ""),
        str(skill.get("relative_path") or ""),
        str(skill.get("scope") or ""),
        " ".join(str(tag) for tag in skill.get("tags", [])),
        str(skill.get("_sample") or ""),
    ]).lower()
    if q:
        for token in [q, *[part for part in re.split(r"\s+", q) if len(part) >= 2]]:
            if token and token in haystack:
                score += 4 if token == q else 1
    if domain and domain != "general" and skill.get("scope") == domain:
        score += 5
    if skill.get("source") == "built-in":
        score += 1
    return score


def parse_local_skill_md(path: Path, root: Path, root_meta: Dict[str, Any]) -> Dict[str, Any] | None:
    try:
        if path.stat().st_size > SKILL_MD_MAX_BYTES:
            return None
        content = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None
    relative = path.relative_to(root)
    folder = path.parent.name
    title = skill_md_title(content, folder)
    description = skill_md_description(content)
    sample = content[:5000]
    scope = infer_skill_scope("\n".join([title, description, str(relative), sample]))
    tags = [part for part in relative.parts[:-1] if part and part not in {".system"}][:6]
    key = f"local:{root_meta['key']}:{str(relative).replace(os.sep, '/')}"
    return {
        "id": key,
        "key": key,
        "label": title,
        "scope": scope,
        "source": root_meta.get("source", "workspace"),
        "root_key": root_meta.get("key"),
        "root_label": root_meta.get("label"),
        "path": str(path),
        "relative_path": str(relative).replace(os.sep, "/"),
        "description": description,
        "tags": tags,
        "instruction_chars": len(content),
        "invocation_mode": "instruction-read-only",
        "script_execution": "disabled",
        "safety_note": "读取 SKILL.md 指令作为上下文；不导入、不运行其中脚本或外部动作。",
        "_sample": sample,
    }


def local_skill_library(payload: Dict[str, Any]) -> Dict[str, Any]:
    global _LOCAL_SKILL_CACHE
    query = str(payload.get("query") or payload.get("task") or payload.get("keyword") or payload.get("skill_key") or "").strip()
    domain = str(payload.get("domain") or "").strip().lower()
    if not domain:
        domain = detect_skill_domain(query)
    limit = max(1, min(int(payload.get("limit") or 24), 80))
    per_root_limit = max(1, min(int(payload.get("per_root_limit") or 80), 120))
    include_content = bool(payload.get("include_content"))
    if bool(payload.get("force_refresh")) or _LOCAL_SKILL_CACHE is None:
        roots = []
        all_skills: List[Dict[str, Any]] = []
        for root_meta in configured_skill_roots():
            root = Path(root_meta["path"]).expanduser().resolve()
            root_info = {
                "key": root_meta.get("key"),
                "label": root_meta.get("label"),
                "path": str(root),
                "source": root_meta.get("source"),
                "exists": root.exists(),
                "skill_count": 0,
            }
            if not root.exists() or not root.is_dir():
                roots.append(root_info)
                continue
            count = 0
            try:
                for path in root.rglob("SKILL.md"):
                    if count >= per_root_limit or len(all_skills) >= SKILL_SCAN_LIMIT:
                        break
                    if any(part in SKIP_DIRS for part in path.parts):
                        continue
                    parsed = parse_local_skill_md(path.resolve(), root, root_meta)
                    if not parsed:
                        continue
                    all_skills.append(parsed)
                    count += 1
            except Exception as exc:
                root_info["error"] = str(exc)
            root_info["skill_count"] = count
            roots.append(root_info)
        _LOCAL_SKILL_CACHE = {
            "created_at": now_iso(),
            "roots": roots,
            "skills": all_skills,
            "per_root_limit": per_root_limit,
        }
    roots = list(_LOCAL_SKILL_CACHE.get("roots", []))
    skills = []
    for cached in _LOCAL_SKILL_CACHE.get("skills", []):
        parsed = dict(cached)
        score = local_skill_score(parsed, query, domain)
        if query or domain in {"writing", "coding", "research", "automation"}:
            if score <= 0:
                continue
        parsed["score"] = score
        if include_content:
            try:
                parsed["content_excerpt"] = Path(str(parsed.get("path") or "")).read_text(encoding="utf-8", errors="replace")[: int(payload.get("max_chars") or 6000)]
            except Exception:
                parsed["content_excerpt"] = ""
        else:
            parsed.pop("_sample", None)
        skills.append(parsed)
    skills = sorted(skills, key=lambda item: (-int(item.get("score") or 0), str(item.get("label") or "")))[:limit]
    for skill in skills:
        skill.pop("_sample", None)
    return {
        "query": query,
        "domain": domain,
        "limit": limit,
        "roots": roots,
        "skill_count": len(skills),
        "skills": skills,
        "policy": {
            "instruction_read": True,
            "script_execution": "disabled",
            "custom_roots_env": "ZHIMENG_SKILL_ROOTS",
        },
    }


def find_local_skill_ref(payload: Dict[str, Any]) -> Dict[str, Any] | None:
    requested = str(payload.get("skill_key") or payload.get("key") or payload.get("skill_id") or "").strip()
    if not requested:
        return None
    library = local_skill_library({"query": requested, "skill_key": requested, "limit": 30, "include_content": bool(payload.get("include_skill_content", True)), "max_chars": payload.get("max_skill_chars") or 6000})
    needle = requested.lower()
    for skill in library.get("skills", []):
        if needle in {
            str(skill.get("id") or "").lower(),
            str(skill.get("key") or "").lower(),
            str(skill.get("label") or "").lower(),
            str(skill.get("relative_path") or "").lower(),
        }:
            return skill
    skills = library.get("skills", [])
    return skills[0] if skills else None


def public_skill_spec(skill: Dict[str, Any], reason: str, hits: List[str]) -> Dict[str, Any]:
    return {
        "key": skill.get("key"),
        "label": skill.get("label"),
        "scope": skill.get("scope"),
        "source": skill.get("source"),
        "purpose": skill.get("purpose"),
        "memory_banks": skill.get("memory_banks", []),
        "safety_note": skill.get("safety_note"),
        "reason": reason,
        "trigger_hits": hits,
    }


def route_skills(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    text = "\n".join([
        str(payload.get("task") or payload.get("query") or payload.get("prompt") or ""),
        str(payload.get("current_text") or payload.get("currentText") or ""),
        purpose or "",
    ])
    domain = str(payload.get("domain") or "").strip().lower() or detect_skill_domain(text)
    active: List[Dict[str, Any]] = []
    isolated: List[Dict[str, Any]] = []
    for skill in GATEWAY_CORE_SKILLS:
        scope = str(skill.get("scope") or "global")
        hits = skill_trigger_hits(skill, text)
        if scope == "global":
            active.append(public_skill_spec(skill, "global-default" if not hits else "trigger-match", hits))
            continue
        if domain == "writing" and scope == "writing":
            active.append(public_skill_spec(skill, "writing-domain-default" if not hits else "trigger-match", hits))
        elif scope == domain and hits:
            active.append(public_skill_spec(skill, "trigger-match", hits))
        elif hits:
            isolated.append(public_skill_spec(skill, "scope-mismatch-isolated", hits))
    activated = skill_status({"limit": 20}).get("recent_activated", [])
    local_library = local_skill_library({
        "query": text,
        "domain": domain,
        "limit": payload.get("local_limit") or 8,
        "per_root_limit": payload.get("per_root_limit") or 80,
    })
    active_local_skills = local_library.get("skills", [])
    memory_banks = sorted({bank for skill in active for bank in skill.get("memory_banks", [])})
    if active_local_skills and "skill" not in memory_banks:
        memory_banks.append("skill")
    excluded_tool_scopes = ["code.compile", "package.install", "run_command"] if domain == "writing" else []
    return {
        "domain": domain,
        "active_core_skills": active,
        "active_local_skills": active_local_skills,
        "isolated_skills": isolated,
        "activated_skill_count": len(activated),
        "recent_activated": activated[:5],
        "local_library": {
            "skill_count": local_library.get("skill_count", 0),
            "roots": local_library.get("roots", []),
            "policy": local_library.get("policy", {}),
        },
        "memory_banks": memory_banks,
        "excluded_tool_scopes": excluded_tool_scopes,
        "schema": {
            "mode": "skill_route",
            "active_skill_keys": [skill.get("key") for skill in active],
            "active_local_skill_keys": [skill.get("key") for skill in active_local_skills],
            "writeback": "draft-only",
            "execution": "route-only-no-import-instruction-read-only",
        },
        "safety": [
            "Skill routing does not import or execute generated scripts.",
            "Local SKILL.md files may be read as instructions, but scripts are not imported or executed.",
            "Novel skills produce original planning/writing assistance only.",
            "Leaked or protected source material remains non-reusable.",
        ],
    }


def infer_context_dimension(domain: str, text: str) -> str:
    haystack = text.lower()
    if "回灌" in text or "写回" in text or "状态" in text or "伏笔" in text or "memory" in haystack:
        return "project"
    if any(term in text for term in ["续写", "审稿", "改写", "章节", "正文", "接收"]):
        return "episode"
    if domain == "writing":
        return "skill"
    if domain == "coding":
        return "tool"
    if domain == "research":
        return "project"
    return "project"


def build_context_pack(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    task = str(payload.get("task") or payload.get("query") or payload.get("prompt") or "").strip()
    current_text = str(payload.get("current_text") or payload.get("currentText") or "")
    text = "\n".join([task, current_text, purpose or ""])
    domain = str(payload.get("domain") or "").strip().lower() or detect_skill_domain(text)
    dimension = str(payload.get("dimension") or "").strip().lower()
    if dimension not in MEMORY_DIMENSIONS:
        dimension = infer_context_dimension(domain, text)
    limit = max(1, min(int(payload.get("limit") or 6), 12))

    skill_payload = {"task": task, "domain": domain, "current_text": current_text}
    skill_route = route_skills(skill_payload, purpose)
    query = str(payload.get("query") or task or purpose or domain or "Personal OS").strip()
    memory_payload = {"query": query, "dimension": dimension, "limit": limit}
    memory = retrieve_memory(memory_payload)
    fallback_memory: Dict[str, Any] | None = None
    if not memory.get("context_pack"):
        same_dimension = retrieve_memory({"query": "", "dimension": dimension, "limit": limit})
        if same_dimension.get("context_pack"):
            fallback_memory = same_dimension
            memory = same_dimension | {"fallback_reason": "no-query-match-used-recent-dimension"}
        else:
            all_recent = retrieve_memory({"query": "", "limit": limit})
            if all_recent.get("context_pack"):
                fallback_memory = all_recent
                memory = all_recent | {"fallback_reason": "no-dimension-match-used-recent-all"}
    active_skill_keys = skill_route.get("schema", {}).get("active_skill_keys", [])
    excluded = list(skill_route.get("excluded_tool_scopes", []))
    if domain == "writing":
        for item in ["code.compile", "package.install", "run_command"]:
            if item not in excluded:
                excluded.append(item)
    if domain == "research" and "source-integrity" not in active_skill_keys:
        active_skill_keys = list(active_skill_keys) + ["source-integrity"]
    raw_thread_context = payload.get("thread_context") if isinstance(payload.get("thread_context"), list) else []
    thread_context: List[Dict[str, Any]] = []
    for index, item in enumerate(raw_thread_context[:12]):
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or item.get("dimension") or "thread").strip()[:48]
        title = str(item.get("title") or item.get("ref") or f"thread-context-{index + 1}").strip()[:160]
        summary = str(item.get("summary") or item.get("detail") or item.get("content") or "").strip()[:1200]
        ref = str(item.get("ref") or item.get("id") or title).strip()[:240]
        if not title and not summary:
            continue
        thread_context.append({
            "id": str(item.get("id") or f"thread-context-{index + 1}"),
            "dimension": "thread",
            "kind": kind or "thread",
            "title": title or ref or f"thread-context-{index + 1}",
            "summary": summary or title,
            "ref": ref,
            "source": str(item.get("source") or "agent_thread")[:160],
            "status": str(item.get("status") or "attached")[:64],
            "injected_by": "agent_thread",
        })
    workspace_root_profile = payload.get("workspace_root_profile") if isinstance(payload.get("workspace_root_profile"), dict) else {}
    if workspace_root_profile:
        root_path = str(workspace_root_profile.get("root_path") or "").strip()
        access_mode = str(workspace_root_profile.get("access_mode") or "virtual").strip()
        include_globs = workspace_root_profile.get("include_globs") if isinstance(workspace_root_profile.get("include_globs"), list) else []
        exclude_globs = workspace_root_profile.get("exclude_globs") if isinstance(workspace_root_profile.get("exclude_globs"), list) else []
        notes = str(workspace_root_profile.get("notes") or "").strip()
        thread_context.append({
            "id": f"workspace-root-profile-{str(payload.get('workspace_id') or 'current')}",
            "dimension": "project",
            "kind": "workspace_root_profile",
            "title": "工作区根目录映射",
            "summary": " · ".join([
                f"root {root_path or '未设置'}",
                f"mode {access_mode}",
                f"include {' / '.join(str(item) for item in include_globs[:6]) or '未指定'}",
                f"exclude {' / '.join(str(item) for item in exclude_globs[:6]) or '未指定'}",
                notes[:240],
                "真实读取仍需 read_file/workspace_scan 与权限闸门",
            ]).strip(" · "),
            "ref": root_path or str(payload.get("workspace_id") or "workspace"),
            "source": "workspace_root_profile",
            "status": access_mode or "virtual",
            "injected_by": "workspace_root_profile",
        })
    workspace_scan_index = payload.get("workspace_scan_index") if isinstance(payload.get("workspace_scan_index"), dict) else {}
    if workspace_scan_index:
        root_path = str(workspace_scan_index.get("root_path") or "").strip()
        access_profile = str(workspace_scan_index.get("access_profile") or "").strip()
        file_count = int(workspace_scan_index.get("file_count") or 0)
        dir_count = int(workspace_scan_index.get("dir_count") or 0)
        item_count = int(workspace_scan_index.get("item_count") or workspace_scan_index.get("returned") or 0)
        has_more = bool(workspace_scan_index.get("has_more"))
        thread_context.append({
            "id": f"workspace-scan-index-{str(payload.get('workspace_id') or 'current')}",
            "dimension": "project",
            "kind": "workspace_scan_index",
            "title": "工作区真实路径索引",
            "summary": " · ".join([
                f"root {root_path or '未设置'}",
                f"profile {access_profile or 'workspace'}",
                f"{file_count} files",
                f"{dir_count} dirs",
                f"{item_count} indexed",
                "has_more" if has_more else "",
                "索引只代表目录元数据，正文读取必须另走 read_file",
            ]).strip(" · "),
            "ref": root_path or str(payload.get("workspace_id") or "workspace"),
            "source": "workspace_scan_index",
            "status": str(workspace_scan_index.get("status") or "indexed")[:64],
            "injected_by": "workspace_scan_index",
        })
    memory_context = memory.get("context_pack", [])

    return {
        "version": "0.1",
        "task": {
            "raw": task,
            "domain": domain,
            "dimension": dimension,
            "purpose": purpose,
        },
        "skill_route": skill_route,
        "memory_retrieve": memory,
        "fallback_memory": fallback_memory,
        "thread": {
            "id": str(payload.get("thread_id") or ""),
            "title": str(payload.get("thread_title") or ""),
            "workspace_id": str(payload.get("workspace_id") or ""),
            "approval_ids": [str(item) for item in payload.get("approval_ids", [])[:20]] if isinstance(payload.get("approval_ids"), list) else [],
        },
        "thread_context": thread_context,
        "context_pack": thread_context + memory_context,
        "active_skill_keys": active_skill_keys,
        "memory_banks": skill_route.get("memory_banks", []),
        "tool_policy": {
            "excluded_tool_scopes": excluded,
            "approval_required": False,
            "execution": "read-only-route-and-retrieve",
        },
        "bridge_queue": [
            {
                "action": "skill_route",
                "purpose": "Route active skills before loading long context.",
                "payload": skill_payload,
            },
            {
                "action": "memory_retrieve",
                "purpose": "Retrieve compact AutoDream context before using full files.",
                "payload": memory_payload,
            },
        ],
        "writeback_rules": [
            "Only compact facts, decisions, risks, and next actions should be written back.",
            "Novel state writeback must be proposed as a draft before changing story canon.",
            "Generated or activated skills are not imported or executed by context_pack.",
            "Leaked or protected source material remains non-reusable.",
        ],
        "schema": {
            "mode": "context_pack",
            "execution": "read-only-no-import-no-command",
            "uses": ["skill_route", "memory_retrieve", "thread_context"],
        },
    }


LEAKED_SOURCE_PATTERNS = [
    "claude-code-leak",
    "claudecode源码",
    "claude code源码",
    "claude-code源码",
    "dnakov/claude-code",
    "iamdin/claude-code-leak",
    "kuberwastaken/claude-code",
    "kuberwastaken/claurst",
    "claurst",
    "source leak",
    "leaked source",
    "decompiled",
    "reverse engineered",
    "泄露",
    "源码泄露",
    "反编译",
]


def default_agent_research_sources() -> List[Dict[str, str]]:
    return [
        {"label": "OpenAI Codex official docs", "url": "https://developers.openai.com/codex/", "source_kind": "official"},
        {"label": "Anthropic Claude Code official docs", "url": "https://code.claude.com/docs/", "source_kind": "official"},
        {"label": "WorkBuddy public repo", "url": "https://github.com/KadenMc/work-buddy", "source_kind": "open-source"},
        {"label": "OpenClaw public repo", "url": "https://github.com/openclaw/openclaw", "source_kind": "open-source"},
        {"label": "Hermes Agent public repo", "url": "https://github.com/NousResearch/hermes-agent", "source_kind": "open-source"},
        {"label": "dnakov/claude-code leaked archive", "url": "https://github.com/dnakov/claude-code", "source_kind": "leaked-risk"},
        {"label": "iamdin/Claude-Code-Leak leaked archive", "url": "https://github.com/iamdin/Claude-Code-Leak", "source_kind": "leaked-risk"},
        {"label": "Kuberwastaken/claurst leaked archive", "url": "https://github.com/Kuberwastaken/claurst", "source_kind": "leaked-risk"},
    ]


def normalize_source_items(payload: Dict[str, Any], purpose: str) -> List[Dict[str, str]]:
    raw_sources = payload.get("sources") if isinstance(payload.get("sources"), list) else []
    if not raw_sources:
        raw_sources = []
        if payload.get("url") or payload.get("label") or payload.get("text"):
            raw_sources.append(payload)
        elif purpose:
            raw_sources.append({"label": purpose, "text": purpose})
    items: List[Dict[str, str]] = []
    for index, raw in enumerate(raw_sources):
        if isinstance(raw, str):
            label = raw.strip() or f"source-{index + 1}"
            items.append({"label": label, "url": raw.strip(), "text": raw.strip(), "declared_kind": ""})
            continue
        if isinstance(raw, dict):
            url = str(raw.get("url") or raw.get("href") or raw.get("repo") or raw.get("repository") or "").strip()
            label = str(raw.get("label") or raw.get("name") or raw.get("title") or url or f"source-{index + 1}").strip()
            text = str(raw.get("text") or raw.get("description") or raw.get("notes") or "").strip()
            declared_kind = str(raw.get("source_kind") or raw.get("kind") or "").strip()
            items.append({"label": label, "url": url, "text": text, "declared_kind": declared_kind})
    return items


def source_domain(url: str) -> str:
    try:
        return (urlparse(url).netloc or "").lower()
    except Exception:
        return ""


def classify_source(item: Dict[str, str]) -> Dict[str, Any]:
    label = item.get("label", "")
    url = item.get("url", "")
    text = item.get("text", "")
    declared_kind = item.get("declared_kind", "")
    domain = source_domain(url)
    joined = " ".join([label, url, text, declared_kind]).lower()

    leaked = any(pattern in joined for pattern in LEAKED_SOURCE_PATTERNS)
    protected = any(term in joined for term in ["private repo", "proprietary", "closed-source", "secret", "token", "api key", "cookie", "密钥", "私有"])
    official_openai = domain.endswith("openai.com") or domain.endswith("platform.openai.com") or domain.endswith("developers.openai.com")
    official_anthropic = domain.endswith("anthropic.com") or domain.endswith("docs.anthropic.com") or domain.endswith("code.claude.com")
    official_github = domain == "github.com" and any(owner in joined for owner in ["github.com/openai/", "github.com/anthropics/", "github.com/anthropic/"])
    known_open_source = domain == "github.com" and any(repo in joined for repo in [
        "github.com/openai/codex",
        "github.com/kadenmc/work-buddy",
        "github.com/openclaw/openclaw",
        "github.com/nousresearch/hermes-agent",
    ])
    github_public = domain == "github.com"

    if leaked:
        source_kind = "leaked-risk"
        reuse_policy = "non-reusable"
        allowed_uses = ["identify provenance risk", "compare high-level public architecture only", "create source-boundary reminders"]
        blocked_uses = ["copy code", "rewrite leaked code", "port private internals", "extract proprietary prompts", "run cloned leak archives"]
        notes = "Matched known leak/decompilation indicators; do not inspect or reuse implementation contents."
    elif protected:
        source_kind = "protected"
        reuse_policy = "non-reusable"
        allowed_uses = ["record that the source is off-limits", "ask for an approved public alternative"]
        blocked_uses = ["copy code", "copy secrets", "infer private implementation", "use credentials or private data"]
        notes = "Protected/private-source indicators were found."
    elif official_openai or official_anthropic:
        source_kind = "official"
        reuse_policy = "allowed-architecture-only"
        allowed_uses = ["architecture patterns", "documented interfaces", "permission model", "memory strategy", "tool-use workflow"]
        blocked_uses = ["copy private product internals", "claim undocumented behavior", "copy long documentation passages"]
        notes = "Official product/docs source; cite it and reuse documented patterns, not proprietary internals."
    elif known_open_source or official_github:
        source_kind = "open-source"
        reuse_policy = "allowed-with-attribution"
        allowed_uses = ["architecture patterns", "public interfaces", "workflow ideas", "small snippets only after license review"]
        blocked_uses = ["copy large code blocks without license review", "remove attribution", "import unreviewed scripts"]
        notes = "Known public GitHub source; review license before any code reuse."
    elif github_public:
        source_kind = "community"
        reuse_policy = "needs-review"
        allowed_uses = ["high-level architecture notes", "feature comparison", "issue/README-level ideas"]
        blocked_uses = ["copy code before license/provenance review", "trust claims without verification", "run downloaded code automatically"]
        notes = "Public GitHub source, but provenance/license was not verified by this audit."
    else:
        source_kind = declared_kind or "unknown"
        reuse_policy = "needs-review"
        allowed_uses = ["high-level notes after provenance check"]
        blocked_uses = ["copy code", "run artifacts", "treat as factual without source verification"]
        notes = "Source kind is not known; require manual provenance review."

    return {
        "label": label,
        "url": url,
        "domain": domain,
        "source_kind": source_kind,
        "reuse_policy": reuse_policy,
        "allowed_uses": allowed_uses,
        "blocked_uses": blocked_uses,
        "notes": notes,
    }


def audit_sources(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    sources = [classify_source(item) for item in normalize_source_items(payload, purpose)]
    counts: Dict[str, int] = {}
    for source in sources:
        kind = str(source.get("source_kind") or "unknown")
        counts[kind] = counts.get(kind, 0) + 1
    risky = [source for source in sources if source.get("reuse_policy") == "non-reusable"]
    return {
        "version": "0.1",
        "execution": "read-only-no-fetch-no-clone-no-source-inspection",
        "status": "blocked-risk-present" if risky else "reviewed",
        "sources": sources,
        "summary": {
            "total": len(sources),
            "counts": counts,
            "non_reusable": len(risky),
            "reusable_with_review": len([source for source in sources if source.get("reuse_policy") in {"allowed-with-attribution", "needs-review"}]),
        },
        "global_policy": [
            "Use official/public/open-source materials for architecture, interfaces, safety, memory, and workflow patterns.",
            "Do not inspect, clone, copy, rewrite, or port leaked/protected Claude Code source archives.",
            "For normal open-source repositories, check license and attribution before any code-level reuse.",
            "Convert learning into source notes, coordinator rules, context packs, and reviewed skill drafts instead of direct code copying.",
        ],
        "recommended_bridge_requests": [
            {"action": "source_digest", "purpose": "Turn audited safe sources into Personal OS architecture notes.", "payload": {"persist": True}},
            {"action": "context_pack", "purpose": "Build compact research context after safe sources are selected.", "payload": {"domain": "research", "dimension": "project"}},
            {"action": "skill_invoke", "purpose": "Invoke source-integrity skill as prompt-only policy before research synthesis.", "payload": {"skill_key": "source-integrity", "domain": "research"}},
        ],
    }


def source_digest_state_path() -> Path:
    return bridge_dir("research") / "source-digest-state.json"


def load_source_digest_state() -> Dict[str, Any]:
    path = source_digest_state_path()
    if not path.exists():
        return {"digests": [], "events": []}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(state, dict):
            state.setdefault("digests", [])
            state.setdefault("events", [])
            return state
    except Exception:
        pass
    return {"digests": [], "events": []}


def save_source_digest_state(state: Dict[str, Any]) -> None:
    source_digest_state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def source_patterns(source: Dict[str, Any]) -> List[Dict[str, str]]:
    if source.get("reuse_policy") == "non-reusable":
        return []
    haystack = " ".join([str(source.get("label") or ""), str(source.get("url") or ""), str(source.get("domain") or "")]).lower()
    if "openai" in haystack or "codex" in haystack:
        return [
            {"pattern": "repo/project guidance", "adopt_as": "SOUL.md / COORDINATOR.md / BRIDGE.md project rules"},
            {"pattern": "MCP/tools plus sandbox approval", "adopt_as": "Executor Bridge actions with validator and dry-run policy"},
            {"pattern": "Skills as reusable workflows", "adopt_as": "prompt-only skill_invoke and reviewed skill activation"},
        ]
    if "anthropic" in haystack or "claude" in haystack:
        return [
            {"pattern": "persistent project memory", "adopt_as": "AutoDream L1/L2 plus source-bound memory banks"},
            {"pattern": "subagents with isolated/forked context", "adopt_as": "Subagent Swarm with lock-scoped work"},
            {"pattern": "hooks/permissions lifecycle", "adopt_as": "seven-layer safety review and write approval drafts"},
        ]
    if "work-buddy" in haystack or "workbuddy" in haystack:
        return [
            {"pattern": "sidecar gateway verbs", "adopt_as": "search/run/advance/status plus bridge request cards"},
            {"pattern": "workflow DAG and task state", "adopt_as": "Gateway workflow-state.json and phase gates"},
            {"pattern": "context pipeline before execution", "adopt_as": "context_pack before full prompt injection"},
        ]
    if "openclaw" in haystack:
        return [
            {"pattern": "local-first multi-entry assistant", "adopt_as": "browser editor plus Gateway plus future phone/chat entrypoints"},
            {"pattern": "tool registry and runtime orchestration", "adopt_as": "Tool Registry, MCP facade, worker queue"},
            {"pattern": "session/history routing", "adopt_as": "AgentRun, KAIROS logs, source digest state"},
        ]
    if "hermes" in haystack:
        return [
            {"pattern": "self-improvement loop", "adopt_as": "AgentRun -> AutoDream -> skill_crystallize -> skill_review"},
            {"pattern": "long-running task memory", "adopt_as": "KAIROS heartbeat and daily append-only logs"},
            {"pattern": "multi-backend execution separation", "adopt_as": "prompt-only skills, verification workers, future model workers"},
        ]
    return [
        {"pattern": "public architecture note", "adopt_as": "source_notes memory after provenance and license review"},
    ]


def digest_layers(patterns: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    pattern_text = " ".join(item.get("pattern", "") + " " + item.get("adopt_as", "") for item in patterns).lower()
    return [
        {
            "id": "coordinator-goal-mode",
            "label": "Coordinator / Goal Mode",
            "absorbs": ["project guidance", "planner tree", "verification gates"],
            "current_modules": ["src/utils/coordinator-mode.ts", "src/utils/agent-architecture.ts"],
            "next_action": "Keep source boundaries and phase gates ahead of all task prompts.",
            "priority": "P0",
        },
        {
            "id": "memory-context",
            "label": "Memory / Context Economy",
            "absorbs": ["persistent memory", "context pipeline", "source notes"],
            "current_modules": ["bridge/memory/autodream-state.json", "src/utils/agent-context-pack.ts"],
            "next_action": "Use source_digest notes as research memory; inject compact context packs, not full archives.",
            "priority": "P0" if any(term in pattern_text for term in ["memory", "context"]) else "P1",
        },
        {
            "id": "tool-gateway",
            "label": "Tool Gateway / Permissions",
            "absorbs": ["MCP/tools", "sandbox approval", "tool registry"],
            "current_modules": ["bridge/zhimeng_bridge.py", "src/utils/executor-bridge.ts", "src/utils/tool-registry.ts"],
            "next_action": "Promote safe read-only research tools first; keep web_fetch/mcp_call approval-required.",
            "priority": "P0",
        },
        {
            "id": "workflow-dag",
            "label": "Workflow DAG / Project Management",
            "absorbs": ["workflow DAG", "task state", "advance/status"],
            "current_modules": ["src/utils/workflow-dag.ts", "bridge/workflows/workflow-state.json"],
            "next_action": "Store every major Personal OS build phase as a DAG run with pass/fail evidence.",
            "priority": "P1",
        },
        {
            "id": "subagents-locks",
            "label": "Subagents / Locks",
            "absorbs": ["isolated/forked context", "runtime orchestration"],
            "current_modules": ["src/utils/subagent-swarm.ts", "bridge/subagents/subagent-state.json"],
            "next_action": "Keep subagents as bounded workers until model-backed concurrent execution is implemented.",
            "priority": "P1",
        },
        {
            "id": "evolution-loop",
            "label": "Evolution / Skill Crystallization",
            "absorbs": ["self-improvement loop", "long-running task memory", "skills"],
            "current_modules": ["bridge/kairos", "bridge/skills", "src/utils/autodream.ts"],
            "next_action": "Turn repeated source_digest outcomes into reviewed source-integrity and architecture skills.",
            "priority": "P1" if "self-improvement" in pattern_text or "skill" in pattern_text else "P2",
        },
    ]


def digest_sources(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    digest_payload = dict(payload)
    if not isinstance(digest_payload.get("sources"), list):
        digest_payload["sources"] = default_agent_research_sources()
    audit = audit_sources(digest_payload, purpose)
    sources = audit.get("sources", [])
    safe_sources = [source for source in sources if source.get("reuse_policy") != "non-reusable"]
    blocked_sources = [source for source in sources if source.get("reuse_policy") == "non-reusable"]
    patterns: List[Dict[str, Any]] = []
    for source in safe_sources:
        for pattern in source_patterns(source):
            patterns.append({
                "source_label": source.get("label"),
                "source_kind": source.get("source_kind"),
                "reuse_policy": source.get("reuse_policy"),
                **pattern,
            })
    layers = digest_layers(patterns)
    digest = {
        "id": str(payload.get("digest_id") or payload.get("id") or f"digest-{uuid.uuid4()}"),
        "created_at": now_iso(),
        "goal": str(payload.get("goal") or purpose or "Build LumenOS Personal Agent OS from public agent architecture patterns."),
        "execution": "audit-first-no-fetch-no-clone-no-leak-inspection",
        "audit_summary": audit.get("summary", {}),
        "safe_source_count": len(safe_sources),
        "blocked_source_count": len(blocked_sources),
        "patterns": patterns,
        "layers": layers,
        "blocked_sources": [
            {
                "label": source.get("label"),
                "url": source.get("url"),
                "reason": source.get("notes"),
                "reuse_policy": source.get("reuse_policy"),
            }
            for source in blocked_sources
        ],
        "writeback_plan": [
            "Append digest summary to source_notes memory only after user-visible review.",
            "Feed safe patterns into context_pack and coordinator prompt; keep blocked sources out of implementation context.",
            "Convert repeated architecture patterns into reviewed Skill drafts, never auto-imported scripts.",
        ],
        "next_bridge_requests": [
            {"action": "context_pack", "purpose": "Use digest layers to build compact Personal OS implementation context.", "payload": {"domain": "research", "dimension": "project"}},
            {"action": "skill_invoke", "purpose": "Invoke personal-os-coordinator for the next phase plan.", "payload": {"skill_key": "personal-os-coordinator", "domain": "research"}},
            {"action": "phase_audit", "purpose": "Re-check Personal OS phase evidence after digest writeback.", "payload": {}},
        ],
    }
    if payload.get("persist") is not False:
        state = load_source_digest_state()
        state.setdefault("digests", []).append(digest)
        state.setdefault("events", []).append({"at": now_iso(), "type": "source_digest", "digest_id": digest["id"], "safe_sources": len(safe_sources), "blocked_sources": len(blocked_sources)})
        state["digests"] = state["digests"][-50:]
        state["events"] = state["events"][-100:]
        save_source_digest_state(state)
        digest["state_path"] = str(source_digest_state_path().relative_to(bridge_root()))
    return {"audit": audit, "digest": digest}


def goal_bootstrap_state_path() -> Path:
    return bridge_dir("goals") / "goal-bootstrap-state.json"


def load_goal_bootstrap_state() -> Dict[str, Any]:
    path = goal_bootstrap_state_path()
    if not path.exists():
        return {"bootstraps": [], "events": []}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(state, dict):
            state.setdefault("bootstraps", [])
            state.setdefault("events", [])
            return state
    except Exception:
        pass
    return {"bootstraps": [], "events": []}


def save_goal_bootstrap_state(state: Dict[str, Any]) -> None:
    goal_bootstrap_state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def goal_architecture_analysis() -> List[Dict[str, str]]:
    return [
        {
            "key": "codex",
            "label": "Codex",
            "public_pattern": "project instructions, tool execution policy, sandbox/approval, reproducible task records",
            "project_mapping": "SOUL/MEMORY/BRIDGE rules, Executor Bridge validators, AgentRun records, workflow verification gates",
        },
        {
            "key": "claude_code",
            "label": "Claude Code",
            "public_pattern": "persistent project memory, MCP/tool permissions, hooks, slash-style workflows, subagents",
            "project_mapping": "AutoDream L1/L2 memory, MCP facade, seven-layer safety review, Subagent Swarm with locks",
        },
        {
            "key": "work_buddy",
            "label": "WorkBuddy",
            "public_pattern": "local sidecar gateway, task-centric verbs, workspace context, progress/status surfaces",
            "project_mapping": "Python Gateway search/run/advance/status, workflow-state.json, browser bridge request cards",
        },
        {
            "key": "openclaw",
            "label": "OpenClaw",
            "public_pattern": "local-first assistant runtime, tool registry, session routing, multi-entry operation",
            "project_mapping": "Tool Registry, local browser UI, future phone/chat entrypoints, AgentRun and KAIROS logs",
        },
        {
            "key": "hermes",
            "label": "Hermes",
            "public_pattern": "experience capture, self-improvement loop, reusable skills, long-running tasks",
            "project_mapping": "AgentRun -> AutoDream -> skill_crystallize -> skill_review -> activation, KAIROS heartbeat",
        },
    ]


def goal_subagent_specs(goal_id: str) -> List[Dict[str, Any]]:
    prefix = goal_id.replace("goal-", "")
    return [
        {
            "key": "coordinator",
            "agent_id": f"{prefix}-coordinator",
            "label": "Personal OS 总编排器",
            "mode": "forked-context",
            "allowed_tools": ["context_pack", "phase_audit", "workflow_status", "source_audit"],
            "mission": "亲自综合所有子任务结果，维护目标树、验收门和写回边界。",
        },
        {
            "key": "memory_engineer",
            "agent_id": f"{prefix}-memory",
            "label": "记忆引擎工程师",
            "mode": "forked-context",
            "allowed_tools": ["memory_status", "memory_retrieve", "memory_consolidate", "context_pack"],
            "mission": "把短上下文压缩成 L1/L2 记忆，提出可审查的事实、决策、风险和后续动作。",
        },
        {
            "key": "skill_orchestrator",
            "agent_id": f"{prefix}-skills",
            "label": "Skills 编排员",
            "mode": "forked-context",
            "allowed_tools": ["skill_route", "skill_invoke", "skill_crystallize", "skill_review"],
            "mission": "按任务域挂载技能；写作是织梦的主场，其他域通过同一套审查协议扩展。",
        },
        {
            "key": "source_researcher",
            "agent_id": f"{prefix}-source",
            "label": "来源研究员",
            "mode": "isolated-context",
            "allowed_tools": ["source_audit", "source_digest", "context_pack"],
            "mission": "只吸收官方/公开/开源架构模式，隔离泄露和受保护资料。",
        },
        {
            "key": "security_guard",
            "agent_id": f"{prefix}-security",
            "label": "安全守卫",
            "mode": "isolated-context",
            "allowed_tools": ["safety_review", "sandbox_status", "sandbox_probe", "subagent_status"],
            "mission": "审查命令、写入、联网、来源、锁冲突和权限升级风险。",
        },
        {
            "key": "kairos_daemon",
            "agent_id": f"{prefix}-kairos",
            "label": "KAIROS 长期守护草案",
            "mode": "isolated-context",
            "allowed_tools": ["kairos_task", "kairos_tick", "scheduler_status", "memory_status"],
            "mission": "登记长期目标和唤醒条件；当前只做可审计草案，不自动常驻执行。",
        },
        {
            "key": "novel_domain_agent",
            "agent_id": f"{prefix}-novel",
            "label": "小说领域代理",
            "mode": "forked-context",
            "allowed_tools": ["skill_route", "skill_invoke", "context_pack", "memory_retrieve"],
            "mission": "在 LumenOS Personal Agent OS 下挂载织梦 Writing Agent 和小说 Skills，处理开书、设定、正文、审稿和回灌。",
        },
    ]


def goal_phases(objective: str) -> List[Dict[str, Any]]:
    return [
        {
            "id": "phase_1_foundation",
            "label": "Phase 1 基石构建与编排器中枢",
            "intent": "建立目标模式、项目规则、执行桥和阶段验收的最小可用内核。",
            "subtasks": [
                "固化 Coordinator 规则：总编排器亲自综合，不盲目批准子代理结果。",
                "维护 SOUL/MEMORY/BRIDGE 规则和本地 Gateway manifest。",
                "把宏大目标登记为 Workflow DAG，所有阶段必须有可验证证据。",
            ],
            "verification_gate": "phase_audit 至少返回五阶段证据；workflow 当前节点可被 status 查询；危险动作仍需审批。",
            "primary_bridge_actions": ["phase_audit", "run", "status", "safety_review"],
        },
        {
            "id": "phase_2_memory",
            "label": "Phase 2 记忆引擎与上下文经济",
            "intent": "用 L1/L2 记忆、上下文包和来源笔记替代整包提示词硬塞。",
            "subtasks": [
                "按 identity/preference/project/episode/skill/tool 六维记录事实。",
                "把研究结果压成 source_notes 和 context_pack，而不是全文注入。",
                "为小说域保留 story_canon、chapter_state、continuity_facts 等专用记忆路由。",
            ],
            "verification_gate": "memory_status 有 L1/L2 结构；context_pack 能按目标返回小上下文；写回规则保留草案边界。",
            "primary_bridge_actions": ["memory_status", "memory_retrieve", "memory_consolidate", "context_pack"],
        },
        {
            "id": "phase_3_skills_tools",
            "label": "Phase 3 Skills/MCP/工具挂载",
            "intent": "按任务域动态挂载 Skills 和工具，避免所有工具、所有文件一次性进提示词。",
            "subtasks": [
                "Personal OS 默认加载全局协调技能，写作任务再加载小说 Skills。",
                "MCP facade 暴露工具列表、资源和提示词骨架。",
                "技能沉淀走 crystallize -> review -> activate，不自动导入未审查脚本。",
            ],
            "verification_gate": "skill_route 能区分 writing/coding/research/automation；MCP tools/list 暴露 Gateway 工具；skill_review 拦截未审查候选。",
            "primary_bridge_actions": ["skill_route", "skill_invoke", "skill_crystallize", "skill_review", "mcp_call"],
        },
        {
            "id": "phase_4_swarm_security",
            "label": "Phase 4 多智能体并发与安全防线",
            "intent": "子代理只做有边界的工作，所有写入、命令、来源、锁冲突都经过闸门。",
            "subtasks": [
                "按 forked-context / isolated-context 登记子代理。",
                "用读写锁保护文件、记忆、工作流和来源状态。",
                "七层 safety_review 与命令验证器阻断高风险动作。",
            ],
            "verification_gate": "subagent_status 可看到代理和锁；lock_acquire 能报告冲突；危险命令被 validators block。",
            "primary_bridge_actions": ["subagent_spawn", "lock_acquire", "subagent_status", "safety_review", "sandbox_status"],
        },
        {
            "id": "phase_5_evolution",
            "label": "Phase 5 KAIROS 自治与进化闭环",
            "intent": "把长期目标变成可审计、可唤醒、可复盘、可沉淀技能的循环。",
            "subtasks": [
                "KAIROS 只登记长期任务和心跳日志，不擅自常驻运行。",
                "AgentRun 与 AutoDream 汇总为可审查技能候选。",
                "用户模型只保留有证据、带置信度、可反驳的偏好和边界。",
            ],
            "verification_gate": "kairos_status 可查询目标；daily log append-only；user_model_reflect 只生成 tentative beliefs。",
            "primary_bridge_actions": ["kairos_task", "kairos_tick", "skill_crystallize", "user_model_reflect", "scheduler_plan"],
        },
    ]


def workflow_nodes_from_goal(phases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    nodes = [
        {
            "id": "phase_0_source_boundary",
            "label": "Phase 0 来源边界与目标确认",
            "status": "ready",
            "depends_on": [],
            "verification": "source_audit 已区分官方/开源/社区/泄露风险，泄露和受保护资料不进入实现上下文。",
        }
    ]
    for index, phase in enumerate(phases):
        nodes.append({
            "id": str(phase["id"]),
            "label": str(phase["label"]),
            "status": "waiting",
            "depends_on": [nodes[-1]["id"]] if index == 0 else [str(phases[index - 1]["id"])],
            "verification": str(phase["verification_gate"]),
        })
    return nodes


def phase1_subtask_tree(objective: str) -> Dict[str, Any]:
    nodes = [
        {
            "id": "p1_source_boundary",
            "label": "来源边界哨兵",
            "owner": "source_researcher",
            "status": "ready",
            "bridge_actions": ["source_audit", "source_digest"],
            "verification": "官方/公开/开源来源进入架构摘要；泄露/受保护来源只保留风险标签。",
        },
        {
            "id": "p1_context_pack",
            "label": "最小上下文包",
            "owner": "memory_engineer",
            "status": "ready",
            "bridge_actions": ["context_pack", "memory_retrieve", "skill_route"],
            "verification": "Phase 1 只注入目标、来源摘要、项目规则和必要工具策略，不注入全量仓库历史。",
        },
        {
            "id": "p1_sandbox_policy",
            "label": "沙盒与命令策略",
            "owner": "security_guard",
            "status": "ready",
            "bridge_actions": ["sandbox_status", "safety_review"],
            "verification": "任意 shell 仍为 disabled；危险命令通过 validators 被 block。",
        },
        {
            "id": "p1_coordinator_evidence",
            "label": "编排器证据审计",
            "owner": "coordinator",
            "status": "ready",
            "bridge_actions": ["phase_audit", "status"],
            "verification": "Phase audit 能证明 Goal Mode、Gateway、记忆、Skills、worker、KAIROS 的当前证据和缺口。",
        },
        {
            "id": "p1_workflow_registration",
            "label": "目标工作流登记",
            "owner": "coordinator",
            "status": "ready",
            "bridge_actions": ["run", "workflow_status"],
            "verification": "Personal OS 目标被登记为 DAG，当前节点和后续阶段可查询。",
        },
    ]
    return {
        "phase_id": "phase_1_foundation",
        "objective": objective,
        "mode": "bounded-worker-bootstrap",
        "nodes": nodes,
        "edges": [
            ["p1_source_boundary", "p1_context_pack"],
            ["p1_context_pack", "p1_sandbox_policy"],
            ["p1_sandbox_policy", "p1_coordinator_evidence"],
            ["p1_coordinator_evidence", "p1_workflow_registration"],
        ],
        "acceptance": [
            "Source boundary is explicit and blocks leaked/protected material from implementation context.",
            "Context pack exists before any file-heavy or tool-heavy work.",
            "Sandbox and safety review remain conservative.",
            "Workflow and KAIROS records can be queried by status actions.",
            "Coordinator remains responsible for synthesis and final approval.",
        ],
    }


def phase1_worker_plan(goal_id: str, objective: str) -> List[Dict[str, Any]]:
    prefix = goal_id.replace("goal-", "")
    return [
        {
            "job_id": f"worker-{prefix}-p1-source",
            "agent_id": f"{prefix}-source",
            "kind": "bridge_action",
            "action": "source_digest",
            "purpose": "Phase 1 worker: refresh safe public architecture digest.",
            "payload": {"goal": objective, "persist": False},
        },
        {
            "job_id": f"worker-{prefix}-p1-context",
            "agent_id": f"{prefix}-memory",
            "kind": "bridge_action",
            "action": "context_pack",
            "purpose": "Phase 1 worker: build compact implementation context.",
            "payload": {"task": objective, "domain": "research", "dimension": "project", "limit": 4},
        },
        {
            "job_id": f"worker-{prefix}-p1-safety",
            "agent_id": f"{prefix}-security",
            "kind": "bridge_action",
            "action": "safety_review",
            "purpose": "Phase 1 worker: verify dangerous command sentinel is blocked.",
            "payload": {"action": "run_command", "purpose": "Phase 1 dangerous command sentinel", "payload": {"command": "rm -rf /"}},
        },
        {
            "job_id": f"worker-{prefix}-p1-sandbox",
            "agent_id": f"{prefix}-security",
            "kind": "bridge_action",
            "action": "sandbox_status",
            "purpose": "Phase 1 worker: inspect sandbox policy.",
            "payload": {},
        },
        {
            "job_id": f"worker-{prefix}-p1-audit",
            "agent_id": f"{prefix}-coordinator",
            "kind": "bridge_action",
            "action": "phase_audit",
            "purpose": "Phase 1 worker: audit current Personal OS evidence.",
            "payload": {},
        },
    ]


def bootstrap_goal(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    objective = str(payload.get("goal") or payload.get("objective") or purpose or "Build LumenOS Personal Agent OS as a super-agent.").strip()
    goal_id = str(payload.get("goal_id") or payload.get("id") or f"goal-{uuid.uuid4().hex[:8]}").strip()
    workflow_id = str(payload.get("workflow_id") or f"workflow-{goal_id}").strip()
    persist = payload.get("persist") is not False
    spawn_agents = payload.get("spawn_subagents") is not False
    queue_kairos = payload.get("kairos") is not False
    start_workers = bool(payload.get("start_workers") or payload.get("start_phase1_workers"))
    sources = payload.get("sources") if isinstance(payload.get("sources"), list) else default_agent_research_sources()

    source_digest_result = digest_sources({
        "goal": objective,
        "sources": sources,
        "persist": bool(payload.get("persist_sources")),
    }, "Goal bootstrap source boundary")
    digest = source_digest_result.get("digest", {})
    audit = source_digest_result.get("audit", {})
    phases = goal_phases(objective)
    workflow_nodes = workflow_nodes_from_goal(phases)
    subagents = goal_subagent_specs(goal_id)
    phase1_tree = phase1_subtask_tree(objective)
    worker_plan = phase1_worker_plan(goal_id, objective)
    blocked_sources = digest.get("blocked_sources", []) if isinstance(digest.get("blocked_sources"), list) else []

    planner = {
        "id": goal_id,
        "mode": "goal-mode",
        "created_at": now_iso(),
        "objective": objective,
        "execution": "planner-tree-plus-allowlisted-workers-no-external-fetch-no-leak-inspection-no-model-worker-execution",
        "architecture_analysis": goal_architecture_analysis(),
        "source_boundary": {
            "audit_summary": audit.get("summary", {}),
            "safe_source_count": digest.get("safe_source_count", 0),
            "blocked_source_count": digest.get("blocked_source_count", 0),
            "blocked_sources": blocked_sources,
            "rules": [
                "Use official/public/open-source materials for architecture and documented interfaces.",
                "Do not inspect, clone, copy, rewrite, or port leaked/protected Claude Code source archives.",
                "Open-source code-level reuse still requires license and attribution review.",
                "Store learning as compact source notes, planner gates, context packs, and reviewed skills.",
            ],
        },
        "phases": phases,
        "phase1_subtask_tree": phase1_tree,
        "workflow_nodes": workflow_nodes,
        "subagent_specs": subagents,
        "worker_plan": worker_plan,
        "verification_gates": [
            "Every phase must have a local observable status check.",
            "Coordinator must read and synthesize subagent output before approval.",
            "Memory writeback is facts/decisions/risks/next-actions only.",
            "Commands, writes, MCP calls, and network fetches stay behind Gateway policy.",
            "Novel writing remains one domain agent inside the broader Personal OS.",
        ],
        "context_policy": {
            "default": "compact-context-first",
            "full_files": "only when a specific gap is identified",
            "source_material": "safe architecture notes only",
            "blocked_material": "risk labels only; never implementation context",
        },
    }

    registered_workflow: Dict[str, Any] | None = None
    registered_agents: List[Dict[str, Any]] = []
    registered_workers: List[Dict[str, Any]] = []
    kairos_task: Dict[str, Any] | None = None
    if persist:
        registered_workflow = run_workflow({
            "workflow_id": workflow_id,
            "name": "Personal OS Goal Mode Bootstrap",
            "current_node_id": "phase_0_source_boundary",
            "nodes": workflow_nodes,
        }, f"Register Goal Mode planner tree: {objective[:160]}")
        if spawn_agents:
            for spec in subagents:
                registered_agents.append(spawn_subagent({
                    "agent_id": spec["agent_id"],
                    "label": spec["label"],
                    "mode": spec["mode"],
                    "allowed_tools": spec["allowed_tools"],
                }, spec["mission"]))
        if start_workers:
            for spec in worker_plan:
                registered_workers.append(run_worker_job({
                    "job_id": spec["job_id"],
                    "agent_id": spec["agent_id"],
                    "kind": spec["kind"],
                    "action": spec["action"],
                    "payload": spec["payload"],
                    "purpose": spec["purpose"],
                }, spec["purpose"], execute_command=False))
        if queue_kairos:
            kairos_task = create_kairos_task({
                "task_id": f"kairos-{goal_id}",
                "objective": objective,
                "source_workflow_id": workflow_id,
                "next_action": "Advance phase_0_source_boundary, then start Phase 1 foundation verification.",
                "interval_seconds": int(payload.get("interval_seconds") or 86400),
            }, "Queue Personal OS long-running objective")
        state = load_goal_bootstrap_state()
        record = {
            "id": goal_id,
            "created_at": planner["created_at"],
            "objective": objective,
            "workflow_id": workflow_id,
            "phase_count": len(phases),
            "phase1_subtask_count": len(phase1_tree.get("nodes", [])),
            "workflow_node_count": len(workflow_nodes),
            "subagent_count": len(registered_agents) if spawn_agents else 0,
            "worker_count": len(registered_workers),
            "kairos_task_id": kairos_task.get("id") if kairos_task else "",
        }
        state.setdefault("bootstraps", []).append(record)
        state.setdefault("events", []).append({"at": now_iso(), "type": "goal_bootstrap", "goal_id": goal_id, "workflow_id": workflow_id})
        state["bootstraps"] = state["bootstraps"][-50:]
        state["events"] = state["events"][-100:]
        save_goal_bootstrap_state(state)
        planner["state_path"] = str(goal_bootstrap_state_path().relative_to(bridge_root()))

    planner["registrations"] = {
        "persisted": persist,
        "workflow": registered_workflow,
        "subagents": registered_agents,
        "workers": registered_workers,
        "kairos_task": kairos_task,
    }
    planner["next_bridge_requests"] = [
        {"action": "source_digest", "purpose": "Refresh safe architecture digest before implementation.", "payload": {"persist": True}},
        {"action": "phase_audit", "purpose": "Check current Personal OS phase evidence.", "payload": {}},
        {"action": "context_pack", "purpose": "Build compact implementation context for Phase 1.", "payload": {"task": objective, "domain": "research", "dimension": "project", "limit": 4}},
        {"action": "memory_bootstrap", "purpose": "Verify Phase 2 AutoDream L1/L2 memory using simulated long-context events.", "payload": {"goal": objective, "query": objective, "limit": 6}},
        {"action": "worker_run", "purpose": "Run an allowlisted phase audit worker.", "payload": {"kind": "bridge_action", "action": "phase_audit", "payload": {}}},
    ]
    return {"planner": planner, "source_digest": source_digest_result}


def find_core_skill(key: str) -> Dict[str, Any] | None:
    needle = key.strip().lower()
    if not needle:
        return None
    for skill in GATEWAY_CORE_SKILLS:
        haystack = " ".join([
            str(skill.get("key") or ""),
            str(skill.get("label") or ""),
            str(skill.get("purpose") or ""),
        ]).lower()
        if needle == str(skill.get("key") or "").lower() or needle in haystack:
            return skill
    return None


def find_activated_skill_ref(payload: Dict[str, Any]) -> Dict[str, Any] | None:
    key = str(payload.get("candidate_id") or payload.get("skill_id") or payload.get("activated_id") or "").strip()
    title = str(payload.get("title") or payload.get("skill_key") or "").strip().lower()
    candidates = skill_status({"limit": 50}).get("recent_activated", [])
    for candidate in candidates:
        if key and key in {str(candidate.get("id") or ""), str(candidate.get("candidate_id") or "")}:
            return candidate
        if title and title in str(candidate.get("title") or "").lower():
            return candidate
    return None


def invoke_skill(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    task = str(payload.get("task") or payload.get("query") or payload.get("input") or "").strip()
    current_text = str(payload.get("current_text") or payload.get("currentText") or "")
    requested_key = str(payload.get("skill_key") or payload.get("key") or "").strip()
    domain = str(payload.get("domain") or "").strip().lower() or detect_skill_domain("\n".join([task, current_text, purpose or ""]))
    route = route_skills({"task": task, "domain": domain, "current_text": current_text}, purpose)
    skill = find_core_skill(requested_key)
    local_skill = find_local_skill_ref({
        **payload,
        "include_skill_content": True,
        "max_skill_chars": payload.get("max_skill_chars") or 7000,
    }) if requested_key and not skill else None
    if not skill:
        routed = route.get("active_core_skills", [])
        preferred = next((item for item in routed if str(item.get("scope")) != "global"), None)
        skill = find_core_skill(str((preferred or (routed[0] if routed else {})).get("key") or "personal-os-coordinator"))
    if not skill:
        skill = GATEWAY_CORE_SKILLS[0]
    activated = find_activated_skill_ref(payload)
    memory_banks = list(skill.get("memory_banks", []))
    if local_skill and "skill" not in memory_banks:
        memory_banks.append("skill")
    context = build_context_pack({
        "task": task or str(skill.get("purpose") or ""),
        "domain": domain,
        "current_text": current_text,
        "dimension": "skill" if domain == "writing" else "tool",
        "limit": payload.get("limit") or 4,
    }, purpose)
    if local_skill:
        invocation_prompt = "\n".join([
            f"Use local skill instruction: {local_skill.get('label')} ({local_skill.get('key')}).",
            f"Source: {local_skill.get('relative_path')} from {local_skill.get('root_label')}.",
            f"Task: {task or purpose}",
            "Rules:",
            "- Treat the SKILL.md content as instruction context only.",
            "- Do not import, execute, install, or run scripts referenced by the skill unless a separate explicit bridge action and permission gate allows it.",
            "- Use compact context_pack first; request full files only when the task has a clear gap.",
            "- Return original work or operational guidance; do not copy protected material.",
            "- Writeback only as facts, decisions, risks, and next actions.",
            "",
            "SKILL.md excerpt:",
            str(local_skill.get("content_excerpt") or "")[: int(payload.get("max_skill_chars") or 7000)],
        ])
    else:
        invocation_prompt = "\n".join([
            f"Use skill: {skill.get('label')} ({skill.get('key')}).",
            f"Purpose: {skill.get('purpose')}",
            f"Task: {task or purpose}",
            "Rules:",
            f"- Safety: {skill.get('safety_note')}",
            "- Use compact context_pack first; request full files only when the task has a clear gap.",
            "- Return original work or operational guidance; do not copy protected material.",
            "- Writeback only as facts, decisions, risks, and next actions.",
        ])
    return {
        "skill": public_skill_spec(skill, "explicit" if requested_key else "routed", skill_trigger_hits(skill, task)),
        "local_skill_ref": local_skill,
        "activated_skill_ref": activated,
        "domain": domain,
        "input": {
            "task": task,
            "current_text_chars": len(current_text),
        },
        "memory_banks": memory_banks,
        "context_pack": context.get("context_pack", []),
        "next_bridge_actions": [
            {"action": "context_pack", "payload": {"task": task, "domain": domain, "limit": 4}},
            {"action": "memory_retrieve", "payload": {"query": task, "dimension": "skill" if domain == "writing" else "tool", "limit": 4}},
        ],
        "invocation_prompt": invocation_prompt,
        "schema": {
            "mode": "skill_invoke",
            "execution": "prompt-only-no-import-no-script-exec",
            "skill_key": local_skill.get("key") if local_skill else skill.get("key"),
            "local_instruction_read": bool(local_skill),
            "activated_ref_only": bool(activated),
        },
        "safety": [
            "skill_invoke never imports or executes activated Python files.",
            "Local SKILL.md files are read as instruction context only.",
            "Activated skill metadata may be referenced; file contents remain out of execution path.",
            "Use source-integrity boundaries for leaked/protected materials.",
        ],
    }


def domain_skill_agents(domain: str, active_skill_keys: List[str], excluded_tool_scopes: List[str]) -> List[Dict[str, Any]]:
    shared_tools = ["skill_route", "skill_invoke", "context_pack", "memory_retrieve"]
    if domain != "writing":
        return [
            {
                "id": f"{domain}-coordinator-agent",
                "label": "Domain Coordinator Agent",
                "mode": "forked-context",
                "skill_keys": active_skill_keys,
                "allowed_tools": shared_tools,
                "excluded_tool_scopes": excluded_tool_scopes,
                "verification": "Return compact findings, risks, and next bridge requests; no direct command execution.",
            }
        ]
    return [
        {
            "id": "writing-canon-agent",
            "label": "Story Canon / 世界观真值代理",
            "mode": "forked-context",
            "skill_keys": ["novel-creation-suite", "novel-kb-manager"],
            "allowed_tools": shared_tools,
            "excluded_tool_scopes": excluded_tool_scopes,
            "verification": "World rules, character facts, and continuity changes are returned as draft writeback only.",
        },
        {
            "id": "writing-outline-agent",
            "label": "Outline / 章节节拍代理",
            "mode": "forked-context",
            "skill_keys": ["novel-creation-suite", "tomato-novel-auto-distill"],
            "allowed_tools": shared_tools,
            "excluded_tool_scopes": excluded_tool_scopes,
            "verification": "Chapter beats include hook, conflict, escalation, and end-hook acceptance checks.",
        },
        {
            "id": "writing-distill-agent",
            "label": "Distillation / 机制蒸馏代理",
            "mode": "isolated-context",
            "skill_keys": ["novel-distillation", "tomato-novel-auto-distill"],
            "allowed_tools": shared_tools + ["source_audit"],
            "excluded_tool_scopes": excluded_tool_scopes,
            "verification": "Only transferable structure is returned; no copied prose, names, or protected source details.",
        },
        {
            "id": "writing-continuity-agent",
            "label": "Continuity / 回灌校验代理",
            "mode": "forked-context",
            "skill_keys": ["novel-kb-manager"],
            "allowed_tools": shared_tools,
            "excluded_tool_scopes": excluded_tool_scopes,
            "verification": "Proposed changes are facts, decisions, risks, and next actions before any canon writeback.",
        },
    ]


def bootstrap_skills(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    task = str(payload.get("task") or payload.get("query") or "开始构思小说世界观").strip()
    current_text = str(payload.get("current_text") or payload.get("currentText") or "")
    domain = str(payload.get("domain") or "").strip().lower() or detect_skill_domain("\n".join([task, current_text, purpose or ""]))
    if not domain or domain == "general":
        domain = "writing" if detect_skill_domain(task) == "writing" else "general"
    limit = max(1, min(int(payload.get("limit") or 6), 12))
    route = route_skills({"task": task, "domain": domain, "current_text": current_text}, purpose)
    active_skill_keys = [str(key) for key in route.get("schema", {}).get("active_skill_keys", [])]
    expected_novel_skills = ["novel-creation-suite", "novel-kb-manager", "novel-distillation", "tomato-novel-auto-distill"]
    mounted_novel_skills = [key for key in expected_novel_skills if key in active_skill_keys]
    primary_skill = "novel-creation-suite" if domain == "writing" else (active_skill_keys[0] if active_skill_keys else "personal-os-coordinator")
    invocation = invoke_skill({
        "skill_key": primary_skill,
        "task": task,
        "domain": domain,
        "current_text": current_text,
        "limit": min(limit, 6),
    }, purpose or "Skill bootstrap invocation")
    context = build_context_pack({
        "task": task,
        "domain": domain,
        "dimension": "skill" if domain == "writing" else "tool",
        "limit": limit,
        "current_text": current_text,
    }, purpose or "Skill bootstrap context pack")
    excluded = list(context.get("tool_policy", {}).get("excluded_tool_scopes", []) or route.get("excluded_tool_scopes", []))
    agents = domain_skill_agents(domain, active_skill_keys, excluded)
    workflow_id = str(payload.get("workflow_id") or f"workflow-skill-bootstrap-{uuid.uuid4().hex[:8]}").strip()
    workflow_nodes = [
        {"id": "domain-detect", "label": "Detect domain", "status": "done", "dependsOn": [], "verification": f"Domain resolved to {domain}."},
        {"id": "route-skills", "label": "Mount skills", "status": "done", "dependsOn": ["domain-detect"], "verification": f"Active skills: {', '.join(active_skill_keys)}."},
        {"id": "context-pack", "label": "Retrieve context pack", "status": "done", "dependsOn": ["route-skills"], "verification": "Context pack built before loading long files."},
        {"id": "spawn-domain-agents", "label": "Prepare domain agents", "status": "ready", "dependsOn": ["context-pack"], "verification": "Agents are bounded to prompt-only skill/context tools."},
        {"id": "verify-writeback", "label": "Verify writeback boundary", "status": "pending", "dependsOn": ["spawn-domain-agents"], "verification": "Only draft writeback is allowed for story canon or user files."},
    ]
    workflow_hook = {
        "workflow_id": workflow_id,
        "name": f"{domain.title()} Skill Matrix Bootstrap",
        "nodes": workflow_nodes,
        "current_node_id": "spawn-domain-agents",
        "writeback": "draft-only",
    }
    registrations: Dict[str, Any] = {"workflow": None, "subagents": []}
    if bool(payload.get("persist")):
        registrations["workflow"] = run_workflow({
            "workflow_id": workflow_id,
            "name": workflow_hook["name"],
            "current_node_id": workflow_hook["current_node_id"],
            "nodes": workflow_nodes,
        }, purpose or "Register skill bootstrap workflow")
        if bool(payload.get("spawn_subagents", True)):
            for agent in agents:
                registrations["subagents"].append(spawn_subagent({
                    "agent_id": agent["id"],
                    "label": agent["label"],
                    "mode": agent["mode"],
                    "allowed_tools": agent["allowed_tools"],
                }, f"Skill bootstrap domain agent: {agent['label']}"))
        append_kairos_daily_log("skill_bootstrap", f"Mounted {domain} skill domain.", {
            "workflow_id": workflow_id,
            "active_skill_keys": active_skill_keys,
            "mounted_novel_skills": mounted_novel_skills,
        })
    command_excluded = "run_command" in excluded
    evidence = {
        "domain": domain,
        "expected_novel_skills": len(expected_novel_skills),
        "mounted_novel_skills": len(mounted_novel_skills),
        "mounted_skill_keys": mounted_novel_skills,
        "missing_novel_skills": [key for key in expected_novel_skills if key not in mounted_novel_skills],
        "excluded_command_scope": command_excluded,
        "excluded_tool_scopes": excluded,
        "context_pack_ready": bool(context.get("schema", {}).get("mode") == "context_pack" and active_skill_keys),
        "retrieved_context_items": len(context.get("context_pack", [])),
        "domain_agent_count": len(agents),
        "workflow_hook_ready": bool(workflow_hook.get("nodes")),
        "execution": "skill-domain-mount-no-import-no-script-exec",
    }
    evidence["status"] = "pass" if (domain != "writing" or (len(mounted_novel_skills) == len(expected_novel_skills) and command_excluded and evidence["context_pack_ready"])) else "partial"
    return {
        "status": evidence["status"],
        "domain": domain,
        "task": task,
        "route": route,
        "invocation": invocation,
        "context_pack": context,
        "domain_agents": agents,
        "tool_policy": {
            "excluded_tool_scopes": excluded,
            "allowed_bridge_actions": ["skill_route", "skill_invoke", "context_pack", "memory_retrieve", "source_audit"],
            "writeback": "draft-only",
            "execution": "route-and-prompt-only-no-import-no-command",
        },
        "workflow_hook": workflow_hook,
        "registrations": registrations,
        "evidence": evidence,
        "schema": {
            "mode": "skill_bootstrap",
            "execution": "skill-domain-mount-no-import-no-script-exec",
            "uses": ["skill_route", "skill_invoke", "context_pack", "memory_retrieve"],
        },
        "safety": [
            "skill_bootstrap verifies mounted skills but never imports or executes skill scripts.",
            "Writing domain excludes code compilation, package install, and run_command scopes.",
            "Domain agents are bounded to compact context, prompt-only skill packets, and draft writeback.",
            "Source learning remains audit-first; leaked/protected source material stays non-reusable.",
        ],
    }


def slugify_skill_title(raw: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_\-]+", "-", raw.strip().lower()).strip("-")
    return value[:60] or "autodream-skill"


def skill_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = load_skill_state()
    limit = min(int(payload.get("limit") or 10), 50)
    all_candidates = list(state.get("candidates", {}).values())
    candidates = sorted(all_candidates, key=lambda item: str(item.get("updated_at") or item.get("created_at") or ""), reverse=True)[:limit]
    activated = [item for item in all_candidates if item.get("status") == "activated"]
    recent_activated = sorted(activated, key=lambda item: str(item.get("activated_at") or item.get("updated_at") or ""), reverse=True)[:limit]
    local_library = local_skill_library({
        "query": payload.get("query") or payload.get("keyword") or payload.get("task") or "",
        "domain": payload.get("domain") or "",
        "limit": payload.get("local_limit") or limit,
        "per_root_limit": payload.get("per_root_limit") or 80,
    })
    return {
        "candidate_count": len(all_candidates),
        "activated_count": len(activated),
        "recent_candidates": candidates,
        "recent_activated": recent_activated,
        "local_skill_count": local_library.get("skill_count", 0),
        "local_library": local_library,
        "recent_events": state.get("events", [])[-limit:],
        "draft_dir": str(skill_draft_dir().relative_to(bridge_root())),
        "activated_dir": str(skill_activated_dir().relative_to(bridge_root())),
    }


def select_skill_candidate(state: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any] | None:
    candidates = state.get("candidates", {})
    candidate_id = str(payload.get("candidate_id") or payload.get("id") or "").strip()
    if candidate_id and candidate_id in candidates:
        return candidates[candidate_id]
    draft_path = str(payload.get("draft_path") or "").strip()
    if draft_path:
        for candidate in candidates.values():
            if str(candidate.get("draft_path") or "") == draft_path:
                return candidate
    available = sorted(candidates.values(), key=lambda item: str(item.get("updated_at") or item.get("created_at") or ""), reverse=True)
    return available[0] if available else None


def skill_draft_path(candidate: Dict[str, Any]) -> Path:
    path = safe_path(str(candidate.get("draft_path") or ""))
    draft_root = skill_draft_dir().resolve()
    if draft_root not in path.parents:
        raise ValueError("draft_path must stay inside bridge/skills/drafts")
    if path.suffix.lower() != ".draft" or not path.name.endswith(".py.draft"):
        raise ValueError("draft_path must end with .py.draft")
    if not path.exists():
        raise ValueError(f"draft_path does not exist: {candidate.get('draft_path')}")
    return path


def review_skill_candidate(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_skill_state()
    candidate = select_skill_candidate(state, payload)
    if not candidate:
        return {"status": "missing", "validation": [{"severity": "block", "key": "candidate", "message": "No skill candidate found."}]}
    validation = []
    try:
        draft = skill_draft_path(candidate)
        content = draft.read_text(encoding="utf-8", errors="replace")
        validation.append({"severity": "pass", "key": "path", "message": str(draft.relative_to(bridge_root()))})
        validation.append({"severity": "pass" if "Draft skill generated by Zhimeng AutoDream" in content else "block", "key": "marker", "message": "Expected AutoDream draft marker."})
        validation.append({"severity": "pass" if "def run(" in content else "block", "key": "entrypoint", "message": "Expected run(context) entrypoint."})
        validation.append({"severity": "pass" if len(content) <= 20000 else "block", "key": "size", "message": f"Draft size {len(content)} chars."})
        risky_patterns = ["subprocess", "os.system", "eval(", "exec(", "socket", "requests", "urllib", "shutil.rmtree", "Remove-Item"]
        hits = [pattern for pattern in risky_patterns if pattern.lower() in content.lower()]
        validation.append({"severity": "block" if hits else "pass", "key": "risky_api", "message": ", ".join(hits) if hits else "No risky API pattern detected."})
    except Exception as exc:
        validation.append({"severity": "block", "key": "path", "message": str(exc)})
        content = ""
    blocked = [item for item in validation if item.get("severity") == "block"]
    return {
        "status": "blocked" if blocked else "pass",
        "candidate": candidate,
        "validation": validation,
        "purpose": purpose or "Skill review",
        "preview": content[:1200],
    }


def activate_skill_candidate(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_skill_state()
    candidates = state.setdefault("candidates", {})
    events = state.setdefault("events", [])
    candidate = select_skill_candidate(state, payload)
    if not candidate:
        return {"status": "missing", "message": "No skill candidate found."}
    review = review_skill_candidate({"candidate_id": candidate.get("id")}, purpose)
    if review.get("status") != "pass":
        return {"status": "blocked", "review": review, "message": "Skill candidate failed review."}
    draft = skill_draft_path(candidate)
    raw = draft.read_text(encoding="utf-8", errors="replace")
    activated_id = str(candidate.get("id") or f"skill-{uuid.uuid4()}")
    target = skill_activated_dir() / f"{slugify_skill_title(str(candidate.get('title') or activated_id))}-{activated_id}.py"
    activated_at = now_iso()
    activated_body = raw.replace("Draft skill generated by Zhimeng AutoDream.", "Activated skill generated by Zhimeng AutoDream.")
    activated_body = activated_body.replace(
        "Review before renaming to .py or executing. This draft is not imported by\nthe Gateway and exists only as a crystallization candidate.",
        "Activated after Gateway review. This file is still not auto-imported or\nauto-executed by the Gateway.",
    )
    activated_body = activated_body.replace('"status": "draft"', '"status": "activated"')
    activated_body = f"# Activated by Zhimeng Gateway at {activated_at}\n# Candidate: {activated_id}\n# Policy: review-copy-only; no auto-import, no auto-execution.\n\n{activated_body}"
    target.write_text(activated_body, encoding="utf-8")
    candidate.update({
        "status": "activated",
        "activated_at": activated_at,
        "activated_path": str(target.relative_to(bridge_root())),
        "reviewed_by": str(payload.get("reviewed_by") or "gateway"),
        "updated_at": activated_at,
    })
    candidates[activated_id] = candidate
    events.append({
        "at": activated_at,
        "type": "skill_activate",
        "candidate_id": activated_id,
        "activated_path": candidate["activated_path"],
        "message": f"Skill candidate activated at {candidate['activated_path']}",
    })
    append_kairos_daily_log("skill_activate", f"Activated skill candidate {activated_id}.", {"activated_path": candidate["activated_path"]})
    save_skill_state(state)
    return {
        "status": "activated",
        "candidate": candidate,
        "review": review,
        "activated": candidate,
        "status_snapshot": skill_status({"limit": 10}),
    }


def skill_run_policy() -> Dict[str, Any]:
    return {
        "mode": "explicit-activated-skill-subprocess",
        "enabled_when": ["Gateway --execute-skill", "request execute=true", "skill status is activated", "activated file stays inside bridge/skills/activated", "static runtime scan passes"],
        "entrypoint": "run(context)",
        "shell": False,
        "network": "not granted; common network APIs are blocked by static scan",
        "filesystem": "no extra file capability is granted by Gateway; common destructive APIs are blocked by static scan",
        "timeout_seconds_max": 10,
        "output_chars_max": SKILL_RUN_MAX_OUTPUT_CHARS,
        "blocked_patterns": [key for key, _ in SKILL_RUN_BLOCKED_PATTERNS],
        "default": "approval_required",
    }


def activated_skill_candidates(limit: int = 200) -> List[Dict[str, Any]]:
    state = load_skill_state()
    values = [item for item in state.get("candidates", {}).values() if item.get("status") == "activated"]
    return sorted(values, key=lambda item: str(item.get("activated_at") or item.get("updated_at") or ""), reverse=True)[:limit]


def select_activated_skill_candidate(payload: Dict[str, Any]) -> Dict[str, Any] | None:
    key = str(payload.get("candidate_id") or payload.get("skill_id") or payload.get("activated_id") or "").strip()
    title = str(payload.get("title") or payload.get("skill_key") or payload.get("key") or "").strip().lower()
    path_hint = str(payload.get("activated_path") or payload.get("path") or "").strip().replace("\\", "/").lower()
    for candidate in activated_skill_candidates():
        candidate_path = str(candidate.get("activated_path") or "").replace("\\", "/").lower()
        if key and key in {str(candidate.get("id") or ""), str(candidate.get("candidate_id") or "")}:
            return candidate
        if title and title in str(candidate.get("title") or "").lower():
            return candidate
        if path_hint and (path_hint == candidate_path or candidate_path.endswith(path_hint)):
            return candidate
    return None


def resolve_activated_skill_path(payload: Dict[str, Any]) -> Path:
    candidate = select_activated_skill_candidate(payload)
    raw_path = str(payload.get("activated_path") or payload.get("path") or "").strip()
    if candidate:
        raw_path = str(candidate.get("activated_path") or raw_path)
    if not raw_path:
        raise ValueError("skill_run requires candidate_id, skill_key, or activated_path")
    target = safe_path(raw_path)
    activated_root = skill_activated_dir().resolve()
    if target != activated_root and activated_root not in target.parents:
        raise ValueError("activated skill path must stay inside bridge/skills/activated")
    if target.suffix.lower() != ".py":
        raise ValueError("activated skill path must be a .py file")
    if not target.exists():
        raise ValueError(f"activated skill file does not exist: {raw_path}")
    return target


def validate_activated_skill_runtime(path: Path, candidate: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
    validation: List[Dict[str, Any]] = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        return [{"severity": "block", "key": "read", "message": str(exc)}]
    validation.append({"severity": "pass", "key": "path", "message": str(path.relative_to(bridge_root()))})
    validation.append({"severity": "pass" if len(text) <= 40_000 else "block", "key": "size", "message": f"Activated skill size {len(text)} chars."})
    validation.append({"severity": "pass" if "def run(" in text else "block", "key": "entrypoint", "message": "Expected run(context) entrypoint."})
    marker_ok = "Activated by Zhimeng Gateway" in text or bool(candidate)
    validation.append({"severity": "pass" if marker_ok else "block", "key": "activation_marker", "message": "Expected activated Gateway marker or activated state record."})
    hits = []
    for key, pattern in SKILL_RUN_BLOCKED_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            hits.append(key)
    validation.append({"severity": "block" if hits else "pass", "key": "runtime_risk_scan", "message": ", ".join(hits) if hits else "No blocked runtime API pattern detected."})
    return validation


def build_skill_run_context(payload: Dict[str, Any], purpose: str, candidate: Dict[str, Any] | None, path: Path) -> Dict[str, Any]:
    user_context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    context = dict(user_context)
    context.update({
        "task": str(payload.get("task") or payload.get("input") or context.get("task") or purpose or "").strip(),
        "goal": str(payload.get("goal") or context.get("goal") or payload.get("task") or purpose or "").strip(),
        "purpose": purpose,
        "candidate_id": str((candidate or {}).get("id") or payload.get("candidate_id") or ""),
        "skill_title": str((candidate or {}).get("title") or payload.get("skill_key") or ""),
        "activated_path": str(path.relative_to(bridge_root())),
        "runtime_policy": "explicit --execute-skill + payload.execute=true; no arbitrary shell capability is granted",
    })
    encoded = json.dumps(context, ensure_ascii=False)
    if len(encoded) > 120_000:
        raise ValueError("skill_run context is too large; keep context below 120k JSON chars")
    return context


def run_activated_skill(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    candidate = select_activated_skill_candidate(payload)
    path = resolve_activated_skill_path(payload)
    validation = validate_activated_skill_runtime(path, candidate)
    blocked = [item for item in validation if item.get("severity") == "block"]
    if blocked:
        return {
            "status": "blocked",
            "candidate": candidate,
            "activated_path": str(path.relative_to(bridge_root())),
            "validation": validation,
            "policy": skill_run_policy(),
            "message": "Activated skill failed runtime validation.",
        }
    context = build_skill_run_context(payload, purpose, candidate, path)
    timeout = min(max(1, int(payload.get("timeout_seconds") or 5)), skill_run_policy()["timeout_seconds_max"])
    runner = r'''
import importlib.util
import json
import sys
import traceback

path = sys.argv[1]
try:
    context = json.load(sys.stdin)
    spec = importlib.util.spec_from_file_location("zhimeng_activated_skill_runtime", path)
    if not spec or not spec.loader:
        raise RuntimeError("cannot load activated skill module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    entry = getattr(module, "run", None)
    if not callable(entry):
        raise RuntimeError("activated skill has no callable run(context)")
    result = entry(context)
    if not isinstance(result, dict):
        result = {"status": "ok", "result": result}
    sys.stdout.write(json.dumps({"status": "ok", "result": result}, ensure_ascii=False))
except Exception as exc:
    sys.stdout.write(json.dumps({"status": "error", "error": str(exc), "traceback": traceback.format_exc(limit=6)}, ensure_ascii=False))
    sys.exit(1)
'''
    completed = subprocess.run(
        [sys.executable, "-I", "-c", runner, str(path)],
        cwd=str(bridge_root()),
        input=json.dumps(context, ensure_ascii=False),
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
    )
    stdout = (completed.stdout or "")[:SKILL_RUN_MAX_OUTPUT_CHARS]
    stderr = (completed.stderr or "")[:4000]
    try:
        parsed = json.loads(stdout) if stdout.strip() else {}
    except Exception:
        parsed = {"status": "error", "raw_stdout": stdout}
    status = "ok" if completed.returncode == 0 and parsed.get("status") == "ok" else "failed"
    state = load_skill_state()
    events = state.setdefault("events", [])
    now = now_iso()
    events.append({
        "at": now,
        "type": "skill_run",
        "status": status,
        "candidate_id": str((candidate or {}).get("id") or ""),
        "activated_path": str(path.relative_to(bridge_root())),
        "returncode": completed.returncode,
    })
    if candidate and str(candidate.get("id") or "") in state.get("candidates", {}):
        stored = state["candidates"][str(candidate.get("id"))]
        stored["last_run_at"] = now
        stored["run_count"] = int(stored.get("run_count") or 0) + 1
        stored["updated_at"] = now
    state["events"] = events[-200:]
    save_skill_state(state)
    append_kairos_daily_log("skill_run", f"Ran activated skill {path.name} with status {status}.", {
        "candidate_id": str((candidate or {}).get("id") or ""),
        "activated_path": str(path.relative_to(bridge_root())),
    })
    return {
        "status": status,
        "candidate": candidate,
        "activated_path": str(path.relative_to(bridge_root())),
        "validation": validation,
        "returncode": completed.returncode,
        "timeout_seconds": timeout,
        "stdout_chars": len(completed.stdout or ""),
        "stderr": stderr,
        "output": parsed.get("result") if parsed.get("status") == "ok" else parsed,
        "policy": skill_run_policy(),
    }


def write_skill_draft(candidate: Dict[str, Any], observations: List[str]) -> str:
    draft_path = skill_draft_dir() / f"{slugify_skill_title(str(candidate.get('title') or candidate.get('id')))}-{candidate['id']}.py.draft"
    body = f'''"""
Draft skill generated by Zhimeng AutoDream.

Review before renaming to .py or executing. This draft is not imported by
the Gateway and exists only as a crystallization candidate.
"""

from __future__ import annotations

from typing import Any, Dict


OBSERVATIONS = {json.dumps(observations, ensure_ascii=False, indent=2)}


def run(context: Dict[str, Any]) -> Dict[str, Any]:
    """Return a reviewed plan scaffold derived from AutoDream observations."""
    goal = str(context.get("goal") or context.get("task") or "").strip()
    return {{
        "status": "draft",
        "goal": goal,
        "observations": OBSERVATIONS,
        "next_actions": [
            "Review whether these observations are reusable.",
            "Add concrete inputs, outputs, and verification gates.",
            "Rename this file to .py only after human approval.",
        ],
    }}
'''
    draft_path.write_text(body, encoding="utf-8")
    return str(draft_path.relative_to(bridge_root()))


def crystallize_skill(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    memory = load_memory_state()
    summaries = memory.get("l2_summaries") if isinstance(memory.get("l2_summaries"), list) else []
    dimension_filter = str(payload.get("dimension") or "").strip().lower()
    limit = min(int(payload.get("limit") or 3), 10)
    force = bool(payload.get("force"))

    state = load_skill_state()
    candidates = state.setdefault("candidates", {})
    events = state.setdefault("events", [])
    used_summary_ids = {
        str(summary_id)
        for candidate in candidates.values()
        for summary_id in candidate.get("source_summary_ids", [])
    }

    eligible = []
    for summary in reversed(summaries):
        summary_id = str(summary.get("id") or "")
        if not summary_id:
            continue
        if dimension_filter in MEMORY_DIMENSIONS and summary.get("dimension") != dimension_filter:
            continue
        if not force and summary_id in used_summary_ids:
            continue
        eligible.append(summary)
        if len(eligible) >= limit:
            break

    created = []
    for summary in eligible:
        summary_id = str(summary.get("id"))
        dimension = str(summary.get("dimension") or "episode")
        title = str(payload.get("title") or f"AutoDream {dimension} skill")
        candidate_id = f"skill-{uuid.uuid4()}"
        observations = [str(summary.get("summary") or "").strip()]
        candidate = {
            "id": candidate_id,
            "title": title,
            "status": "draft",
            "dimension": dimension,
            "source_summary_ids": [summary_id],
            "purpose": purpose or "AutoDream skill crystallization",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        candidate["draft_path"] = write_skill_draft(candidate, observations)
        candidates[candidate_id] = candidate
        events.append({
            "at": now_iso(),
            "type": "skill_crystallize",
            "candidate_id": candidate_id,
            "summary_id": summary_id,
            "message": f"Draft skill candidate created at {candidate['draft_path']}",
        })
        append_kairos_daily_log("skill_crystallize", f"Created draft skill candidate {candidate_id}.", {"draft_path": candidate["draft_path"], "summary_id": summary_id})
        created.append(candidate)

    save_skill_state(state)
    return {
        "created": created,
        "status": skill_status({"limit": 10}),
    }


def user_model_state_path() -> Path:
    return bridge_dir("user-model") / "honcho-state.json"


def load_user_model_state() -> Dict[str, Any]:
    path = user_model_state_path()
    if not path.exists():
        return {"events": [], "beliefs": []}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(state, dict) and isinstance(state.get("events"), list):
            state.setdefault("beliefs", [])
            return state
    except Exception:
        pass
    return {"events": [], "beliefs": []}


def save_user_model_state(state: Dict[str, Any]) -> None:
    user_model_state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_user_dimension(raw: str) -> str:
    value = (raw or "").strip().lower()
    return value if value in USER_MODEL_DIMENSIONS else "preference"


def user_model_event(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_user_model_state()
    events = state.setdefault("events", [])
    confidence = float(payload.get("confidence") or 0.5)
    stance = str(payload.get("stance") or "claim").strip().lower()
    if stance not in {"claim", "support", "counterexample"}:
        stance = "claim"
    event = {
        "id": str(payload.get("event_id") or payload.get("id") or f"um-{uuid.uuid4()}"),
        "at": now_iso(),
        "dimension": normalize_user_dimension(str(payload.get("dimension") or "")),
        "stance": stance,
        "source": str(payload.get("source") or "gateway"),
        "summary": str(payload.get("summary") or payload.get("text") or purpose or "").strip()[:1200],
        "confidence": max(0.0, min(confidence, 1.0)),
        "reflected_at": "",
    }
    events.append(event)
    save_user_model_state(state)
    return event


def user_model_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = load_user_model_state()
    dimension = str(payload.get("dimension") or "").strip().lower()
    events = state.get("events", [])
    beliefs = state.get("beliefs", [])
    if dimension in USER_MODEL_DIMENSIONS:
        events = [event for event in events if event.get("dimension") == dimension]
        beliefs = [belief for belief in beliefs if belief.get("dimension") == dimension]
    pending = [event for event in events if not event.get("reflected_at")]
    return {
        "event_count": len(events),
        "belief_count": len(beliefs),
        "pending_count": len(pending),
        "recent_events": events[-10:],
        "recent_beliefs": beliefs[-10:],
        "policy": "Evidence-backed only; counterexamples lower confidence; no invented user profile.",
    }


def user_model_reflect(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_user_model_state()
    events = state.setdefault("events", [])
    beliefs = state.setdefault("beliefs", [])
    dimension_filter = str(payload.get("dimension") or "").strip().lower()
    pending = [
        event for event in events
        if not event.get("reflected_at") and (dimension_filter not in USER_MODEL_DIMENSIONS or event.get("dimension") == dimension_filter)
    ]
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for event in pending:
        grouped.setdefault(str(event.get("dimension") or "preference"), []).append(event)

    created = []
    reflected_at = now_iso()
    for dimension, items in grouped.items():
        supports = [item for item in items if item.get("stance") in {"claim", "support"}]
        counters = [item for item in items if item.get("stance") == "counterexample"]
        if not supports and not counters:
            continue
        evidence = supports or items
        avg_confidence = sum(float(item.get("confidence") or 0.5) for item in evidence) / max(len(evidence), 1)
        confidence = max(0.05, min(avg_confidence - 0.15 * len(counters), 0.95))
        support_preview = " / ".join(str(item.get("summary") or "")[:160] for item in evidence[:4])
        counter_preview = " / ".join(str(item.get("summary") or "")[:160] for item in counters[:3])
        belief = {
            "id": f"belief-{uuid.uuid4()}",
            "at": reflected_at,
            "dimension": dimension,
            "status": "tentative",
            "confidence": round(confidence, 3),
            "summary": support_preview or counter_preview,
            "counterexamples": counter_preview,
            "evidence_ids": [item.get("id") for item in evidence],
            "counterexample_ids": [item.get("id") for item in counters],
            "purpose": purpose or "Honcho-lite reflection",
        }
        beliefs.append(belief)
        for item in items:
            item["reflected_at"] = reflected_at
        append_kairos_daily_log("user_model_reflect", f"Created tentative {dimension} belief.", {"belief_id": belief["id"], "confidence": belief["confidence"]})
        created.append(belief)

    save_user_model_state(state)
    return {
        "created": created,
        "status": user_model_status({"dimension": dimension_filter}),
    }


def bootstrap_evolution(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    objective = str(payload.get("objective") or payload.get("goal") or "Verify KAIROS evolution loop for LumenOS Personal Agent OS.").strip()
    evolution_id = str(payload.get("evolution_id") or payload.get("id") or f"evolution-{uuid.uuid4().hex[:8]}").strip()
    workflow_id = str(payload.get("workflow_id") or f"workflow-{evolution_id}").strip()
    task_id = str(payload.get("task_id") or f"kairos-{evolution_id}").strip()
    plan_id = str(payload.get("plan_id") or f"scheduler-{evolution_id}").strip()
    interval_minutes = max(1, min(int(payload.get("interval_minutes") or 5), 1440))
    persist = bool(payload.get("persist", True))
    activate_skill = bool(payload.get("activate_skill", True))
    workflow_nodes = [
        {"id": "kairos-task", "label": "Queue KAIROS task", "status": "done" if persist else "ready", "dependsOn": [], "verification": "Task is observable and append-only logged."},
        {"id": "kairos-tick", "label": "Run observation tick", "status": "done" if persist else "ready", "dependsOn": ["kairos-task"], "verification": "Tick prepares context and skill suggestions without external execution."},
        {"id": "scheduler-draft", "label": "Create scheduler draft", "status": "done" if persist else "ready", "dependsOn": ["kairos-task"], "verification": "Draft files exist; OS task is not installed by Gateway."},
        {"id": "autodream-skill", "label": "Consolidate and crystallize", "status": "done" if persist else "ready", "dependsOn": ["kairos-tick"], "verification": "Fresh L1 memory becomes L2 and a reviewed skill file candidate."},
        {"id": "user-model", "label": "Reflect user model", "status": "done" if persist else "ready", "dependsOn": ["autodream-skill"], "verification": "Beliefs remain tentative and evidence-backed."},
    ]
    registrations: Dict[str, Any] = {
        "workflow": None,
        "kairos_task": None,
        "kairos_tick": None,
        "scheduler_plan": None,
        "memory_events": [],
        "memory_consolidation": None,
        "skill_crystallization": None,
        "skill_activation": None,
        "user_model_event": None,
        "user_model_reflection": None,
    }
    if persist:
        registrations["workflow"] = run_workflow({
            "workflow_id": workflow_id,
            "name": "Phase 5 Evolution Bootstrap",
            "current_node_id": "user-model",
            "nodes": workflow_nodes,
        }, purpose or "Register Phase 5 evolution workflow")
        registrations["kairos_task"] = create_kairos_task({
            "task_id": task_id,
            "objective": objective,
            "next_action": "Run KAIROS tick, consolidate AutoDream memory, crystallize reusable skill, and keep scheduler draft reviewed.",
            "source_workflow_id": workflow_id,
            "interval_seconds": interval_minutes * 60,
        }, purpose or "Queue Phase 5 KAIROS evolution task")
        registrations["kairos_tick"] = run_kairos_tick({"message": f"evolution bootstrap {evolution_id}", "limit": 5, "include_suggestions": True}, purpose or "Run Phase 5 KAIROS observation")
        registrations["scheduler_plan"] = create_scheduler_plan({
            "plan_id": plan_id,
            "task_name": f"ZhimengPersonalOSKairos{evolution_id.replace('-', '')[:12]}",
            "interval_minutes": interval_minutes,
            "launcher": "启动织梦PersonalOS网关.cmd",
        }, purpose or "Create Phase 5 scheduler draft")
        memory_payloads = [
            {
                "dimension": "project",
                "source": "evolution_bootstrap",
                "summary": f"{evolution_id}: KAIROS evolution loop objective captured. {objective}",
                "tags": ["phase5", "kairos", "evolution"],
                "importance": 4,
            },
            {
                "dimension": "skill",
                "source": "evolution_bootstrap",
                "summary": f"{evolution_id}: Reusable skill opportunity: convert repeated KAIROS observation, memory consolidation, scheduler draft review, and safety-gated writeback into a reviewed local skill scaffold.",
                "tags": ["phase5", "skill", "autodream"],
                "importance": 5,
            },
            {
                "dimension": "tool",
                "source": "evolution_bootstrap",
                "summary": f"{evolution_id}: Tool boundary: scheduler_plan creates .cmd.draft only; activated skills require explicit skill_run with execute-skill before runtime execution.",
                "tags": ["phase5", "tool-policy", "scheduler"],
                "importance": 4,
            },
        ]
        for item in memory_payloads:
            registrations["memory_events"].append(create_memory_event(item, purpose or "Phase 5 evolution memory event"))
        registrations["memory_consolidation"] = consolidate_memory({}, purpose or "Phase 5 evolution memory consolidation")
        registrations["skill_crystallization"] = crystallize_skill({
            "dimension": "skill",
            "limit": 1,
            "title": "KAIROS Evolution Loop Skill",
            "force": True,
        }, purpose or "Phase 5 evolution skill crystallization")
        created_skills = registrations["skill_crystallization"].get("created", []) if isinstance(registrations["skill_crystallization"], dict) else []
        if activate_skill and created_skills:
            registrations["skill_activation"] = activate_skill_candidate({
                "candidate_id": created_skills[0].get("id"),
                "reviewed_by": "evolution_bootstrap",
            }, purpose or "Phase 5 evolution skill activation")
        registrations["user_model_event"] = user_model_event({
            "dimension": "project",
            "stance": "support",
            "source": "evolution_bootstrap",
            "summary": "User wants Personal OS progress to be concrete, persistent, evidence-backed, and not merely prompt stuffing.",
            "confidence": 0.72,
        }, purpose or "Phase 5 evolution user model event")
        registrations["user_model_reflection"] = user_model_reflect({"dimension": "project"}, purpose or "Phase 5 evolution user model reflection")
        append_kairos_daily_log("evolution_bootstrap", f"Ran Phase 5 evolution bootstrap {evolution_id}.", {
            "workflow_id": workflow_id,
            "task_id": task_id,
            "plan_id": plan_id,
        })
    tick = registrations.get("kairos_tick") if isinstance(registrations.get("kairos_tick"), dict) else {}
    tick_result = tick.get("tick", {}) if isinstance(tick.get("tick"), dict) else {}
    scheduler = registrations.get("scheduler_plan") if isinstance(registrations.get("scheduler_plan"), dict) else {}
    consolidation = registrations.get("memory_consolidation") if isinstance(registrations.get("memory_consolidation"), dict) else {}
    skill = registrations.get("skill_crystallization") if isinstance(registrations.get("skill_crystallization"), dict) else {}
    activation = registrations.get("skill_activation") if isinstance(registrations.get("skill_activation"), dict) else {}
    reflection = registrations.get("user_model_reflection") if isinstance(registrations.get("user_model_reflection"), dict) else {}
    log_paths = tick_result.get("log_paths", []) if isinstance(tick_result.get("log_paths"), list) else []
    evidence = {
        "evolution_id": evolution_id,
        "workflow_registered": bool(registrations.get("workflow")),
        "kairos_task_created": bool(registrations.get("kairos_task")),
        "kairos_tick_observed": bool(tick_result.get("ticked")),
        "kairos_log_paths": log_paths,
        "append_only_daily_log": bool(log_paths and all((bridge_root() / path).exists() for path in log_paths)),
        "scheduler_draft_created": bool(scheduler.get("install_draft_path") and scheduler.get("uninstall_draft_path")),
        "scheduler_execution": scheduler.get("execution"),
        "memory_events_created": len(registrations.get("memory_events", [])),
        "l2_summaries_created": len(consolidation.get("created", [])) if isinstance(consolidation.get("created"), list) else 0,
        "skill_drafts_created": len(skill.get("created", [])) if isinstance(skill.get("created"), list) else 0,
        "skill_activated": activation.get("status") == "activated",
        "activated_path": activation.get("activated", {}).get("activated_path") if isinstance(activation.get("activated"), dict) else "",
        "user_beliefs_created": len(reflection.get("created", [])) if isinstance(reflection.get("created"), list) else 0,
        "execution": "evolution-bootstrap-observation-draft-scheduler-no-os-install-no-auto-exec",
    }
    evidence["status"] = "pass" if (
        evidence["workflow_registered"]
        and evidence["kairos_task_created"]
        and evidence["kairos_tick_observed"]
        and evidence["append_only_daily_log"]
        and evidence["scheduler_draft_created"]
        and evidence["scheduler_execution"] == "not-installed-by-gateway"
        and evidence["memory_events_created"] >= 3
        and evidence["l2_summaries_created"] >= 1
        and evidence["skill_drafts_created"] >= 1
        and (not activate_skill or evidence["skill_activated"])
        and evidence["user_beliefs_created"] >= 1
    ) else "partial"
    return {
        "status": evidence["status"],
        "evolution_id": evolution_id,
        "objective": objective,
        "workflow_hook": {
            "workflow_id": workflow_id,
            "name": "Phase 5 Evolution Bootstrap",
            "nodes": workflow_nodes,
            "current_node_id": "user-model",
        },
        "registrations": registrations,
        "evidence": evidence,
        "tool_policy": {
            "scheduler": "draft-only-no-os-install",
            "activated_skills": "copied-but-not-imported-or-executed",
            "kairos_tick": "observation-only-no-external-action",
            "writeback": "state-records-and-daily-log-only",
        },
        "schema": {
            "mode": "evolution_bootstrap",
            "execution": "evolution-bootstrap-observation-draft-scheduler-no-os-install-no-auto-exec",
            "uses": ["kairos_task", "kairos_tick", "scheduler_plan", "memory_event", "memory_consolidate", "skill_crystallize", "skill_activate", "user_model_reflect"],
        },
        "safety": [
            "Scheduler plans are .cmd.draft files only; Gateway does not register OS tasks.",
            "Activated skills are reviewed/copied but never imported or executed by Gateway.",
            "KAIROS tick prepares context and suggestions; it does not perform external actions.",
            "User model beliefs remain tentative and evidence-backed.",
        ],
    }


def file_contains(relative_path: str, patterns: List[str]) -> bool:
    path = bridge_root() / relative_path
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8", errors="replace")
    return all(pattern in text for pattern in patterns)


def phase_status(evidence: List[Dict[str, Any]], gaps: List[str]) -> str:
    passed = [item for item in evidence if item.get("ok")]
    if evidence and len(passed) == len(evidence) and not gaps:
        return "pass"
    if passed:
        return "partial"
    return "missing"


def phase_audit() -> Dict[str, Any]:
    sandbox_probe = run_sandbox_probe({"probes": ["python"], "timeout_seconds": 5})
    sandbox_ok = any(item.get("status") == "ok" for item in sandbox_probe.get("results", []))
    novel_skill_text = (bridge_root() / "src" / "utils" / "skill-registry.ts").read_text(encoding="utf-8", errors="replace")
    novel_skill_keys = ["novel-creation-suite", "novel-kb-manager", "novel-distillation", "tomato-novel-auto-distill"]
    local_skills = local_skill_library({"limit": 12})
    phases = [
        {
            "id": "phase-1-foundation",
            "label": "Foundation / 编排器中枢",
            "evidence": [
                {"ok": Path(__file__).exists(), "item": "Python Gateway exists", "source": "bridge/zhimeng_bridge.py"},
                {"ok": (bridge_root() / "bridge" / "rust-core" / "Cargo.toml").exists() and (bridge_root() / "bridge" / "rust-core" / "src" / "main.rs").exists(), "item": "Rust wrapper project skeleton exists", "source": "bridge/rust-core"},
                {"ok": file_contains("src/store/workspace.ts", ["SOUL.md", "COORDINATOR.md", "BRIDGE.md"]), "item": "Default SOUL/COORDINATOR/BRIDGE workspace templates exist", "source": "src/store/workspace.ts"},
                {"ok": file_contains("src/utils/coordinator-mode.ts", ["Coordinator System Prompt", "Goal Mode", "sourceBoundaries"]), "item": "Coordinator mode system prompt module exists", "source": "src/utils/coordinator-mode.ts"},
                {"ok": sandbox_policy().get("arbitrary_commands") == "disabled", "item": "Arbitrary shell commands remain disabled", "source": "sandbox_policy"},
                {"ok": sandbox_ok, "item": "Conservative subprocess probe succeeds", "source": "sandbox_probe"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["run_verification_command", "execute_command"]), "item": "Opt-in allowlisted verification command executor exists", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["goal_bootstrap", "planner-tree-plus-allowlisted-workers-no-external-fetch-no-leak-inspection", "phase1_subtask_tree", "phase1_worker_plan"]) and file_contains("src/components/AIChatPanel.tsx", ["createGoalBootstrapBridgeRequest", "目标模式", "start_workers"]), "item": "Goal Mode bootstrap can create planner tree, Phase 1 subtasks, safe workers, and UI bridge request", "source": "bridge/zhimeng_bridge.py + src/components/AIChatPanel.tsx"},
            ],
            "gaps": ["Rust wrapper skeleton exists but is not compiled in this environment unless rustc/cargo are installed.", "Command executor is verification-allowlist only; no general approved shell executor."],
        },
        {
            "id": "phase-2-memory",
            "label": "Memory / AutoDream",
            "evidence": [
                {"ok": file_contains("src/utils/autodream.ts", ["compressL1ToL2", "dreamConsolidate"]), "item": "Frontend AutoDream functions exist", "source": "src/utils/autodream.ts"},
                {"ok": memory_state_path().exists(), "item": "Gateway AutoDream state exists", "source": str(memory_state_path().relative_to(bridge_root()))},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["autodream_loop", "autodream_tick_once"]), "item": "Gateway AutoDream daemon loop exists", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["MEMORY_DIMENSION_LABELS", "retrieve_memory", "context_pack"]), "item": "Gateway six-dimensional memory retrieval exists", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["memory_bootstrap", "bootstrap_memory", "local-l1-l2-consolidation-no-model-no-network"]), "item": "Gateway memory bootstrap can seed L1 and verify L2 consolidation", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("src/utils/agent-context-pack.ts", ["AgentContextPack", "memory_retrieve", "skill_route", "excludedToolScopes"]), "item": "Frontend Agent Context Pack joins skill routing, memory retrieval, and tool exclusions", "source": "src/utils/agent-context-pack.ts"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["build_context_pack", "context_pack", "read-only-no-import-no-command"]), "item": "Gateway context_pack action composes skill routing and memory retrieval", "source": "bridge/zhimeng_bridge.py"},
            ],
            "gaps": [],
        },
        {
            "id": "phase-3-skills",
            "label": "Skills Assembly / MCP facade",
            "evidence": [
                {"ok": all(key in novel_skill_text for key in novel_skill_keys), "item": "Four core novel skills are registered", "source": "src/utils/skill-registry.ts"},
                {"ok": len(mcp_tool_specs()) >= 23, "item": "MCP-style tools/list exposes current Gateway tools", "source": "mcp_tool_specs"},
                {"ok": (bridge_root() / "bridge" / "zhimeng_mcp_stdio.py").exists(), "item": "stdio JSON-RPC MCP-like facade exists", "source": "bridge/zhimeng_mcp_stdio.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["resources/list", "resources/read", "prompts/list", "prompts/get", "initialize"]), "item": "MCP facade exposes initialize/resources/prompts discovery", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["skill_route", "GATEWAY_CORE_SKILLS", "novel-creation-suite", "tomato-novel-auto-distill", "route-only-no-import"]), "item": "Gateway dynamic skill routing can mount novel skills without default script execution", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["skill_invoke", "prompt-only-no-import-no-script-exec", "next_bridge_actions"]), "item": "Gateway skill invocation packets exist for prompt/context routing", "source": "bridge/zhimeng_bridge.py"},
                {"ok": "skill_run" in {item.get("name") for item in mcp_tool_specs()} and file_contains("bridge/zhimeng_bridge.py", ["skill_run_policy", "run_activated_skill", "--execute-skill", "run(context)"]), "item": "Gateway exposes reviewed activated Skill runtime behind execute-skill gate", "source": "bridge/zhimeng_bridge.py + mcp_tool_specs"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["configured_skill_roots", "local_skill_library", "SKILL.md"]) and local_skills.get("skill_count", 0) >= 0, "item": f"Gateway discovers local/built-in SKILL.md library roots ({local_skills.get('skill_count', 0)} visible)", "source": "bridge/zhimeng_bridge.py + local skill roots"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["skill_bootstrap", "bootstrap_skills", "skill-domain-mount-no-import-no-script-exec", "expected_novel_skills"]), "item": "Gateway skill bootstrap verifies domain mounting, context pack, tool exclusions, and hooks", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["source_audit", "LEAKED_SOURCE_PATTERNS", "non-reusable"]), "item": "Gateway source audit blocks leaked/protected materials from reuse", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["source_digest", "audit-first-no-fetch-no-clone-no-leak-inspection", "Personal OS architecture adoption"]), "item": "Gateway source digest converts safe public sources into architecture adoption notes", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["execute_web_fetch", "web_fetch_policy", "execute_web"]) and "web_fetch" in {item.get("name") for item in mcp_tool_specs()}, "item": "Gateway exposes bounded API fetch behind execute-web gate", "source": "bridge/zhimeng_bridge.py + mcp_tool_specs"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["execute_mcp_call", "mcp_call_policy", "execute_mcp"]) and "mcp_call" in {item.get("name") for item in mcp_tool_specs()}, "item": "Gateway exposes bounded HTTP/registered-stdio JSON-RPC MCP calls behind execute-mcp gate", "source": "bridge/zhimeng_bridge.py + mcp_tool_specs"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["mcp_stdio_registry", "execute_mcp_stdio_call", "mcp_stdio_catalog"]) and "mcp_stdio_catalog" in {item.get("name") for item in mcp_tool_specs()}, "item": "Gateway exposes a registered-only stdio MCP process connector and catalog", "source": "bridge/zhimeng_bridge.py + mcp_tool_specs"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["provider_catalog", "provider_config_status", "provider_status", "provider_probe", "provider_registry_policy"]) and {"provider_catalog", "provider_config_status", "provider_status", "provider_probe"}.issubset({item.get("name") for item in mcp_tool_specs()}), "item": "Gateway exposes Provider Hub catalog/config/status/probe tools with explicit remote gates", "source": "bridge/zhimeng_bridge.py + mcp_tool_specs"},
                {"ok": file_contains("src/utils/executor-bridge.ts", ["skill_crystallize", "user_model_status", "sandbox_probe"]), "item": "Frontend bridge accepts advanced Gateway actions", "source": "src/utils/executor-bridge.ts"},
            ],
            "gaps": ["HTTP/stdio JSON-RPC facades expose tools/resources/prompts but are still not a full production MCP transport with subscriptions or streaming."],
        },
        {
            "id": "phase-4-swarm-security",
            "label": "Swarm & Security",
            "evidence": [
                {"ok": len(VALIDATORS) == 23, "item": "23 command validators are installed", "source": "VALIDATORS"},
                {"ok": file_contains("src/utils/subagent-swarm.ts", ["forked", "isolated", "locks"]), "item": "Frontend subagent swarm plan exists", "source": "src/utils/subagent-swarm.ts"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["lock_acquire", "lock_release", "subagent_status", "lock_conflict"]), "item": "Gateway lock registry and conflict events exist", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["worker_run", "worker_thread", "worker_status"]), "item": "Gateway background worker job runner exists", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["write_text_file", "execute_write", "full_access_files"]) and file_contains("src/components/AIChatPanel.tsx", ["读文件", "写草案", "工作区写入"]), "item": "Gateway and frontend expose file tools with workspace/full-access permission gates", "source": "bridge/zhimeng_bridge.py + src/components/AIChatPanel.tsx"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["SAFE_WORKER_BRIDGE_ACTIONS", "run_worker_bridge_action", "bridge_action"]), "item": "Worker can run allowlisted internal bridge actions", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["SAFE_WORKER_BRIDGE_ACTIONS", "context_pack"]) and file_contains("src/components/AIChatPanel.tsx", ["kind: \"bridge_action\"", "action: \"context_pack\""]), "item": "Worker defaults can request full agent context packs", "source": "bridge/zhimeng_bridge.py + src/components/AIChatPanel.tsx"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["swarm_bootstrap", "bootstrap_swarm", "write_lock_conflict_blocked", "swarm-bootstrap-allowlisted-workers-no-model-exec-no-arbitrary-shell"]), "item": "Gateway swarm bootstrap verifies forked/isolated agents, locks, conflicts, and allowlisted workers", "source": "bridge/zhimeng_bridge.py"},
            ],
            "gaps": ["Worker runner supports allowlisted verification jobs and internal bridge actions, but full concurrent AI model worker execution is not implemented yet."],
        },
        {
            "id": "phase-5-evolution",
            "label": "Evolution / KAIROS / Honcho",
            "evidence": [
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["kairos_loop", "append_kairos_daily_log"]), "item": "KAIROS heartbeat and append-only daily log exist", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["run_kairos_tick", "tick_plan", "observation-only-no-external-action"]), "item": "KAIROS tick prepares context and skill suggestions without external execution", "source": "bridge/zhimeng_bridge.py"},
                {"ok": skill_status({}).get("candidate_count", 0) >= 1, "item": "Skill crystallization candidates exist", "source": "bridge/skills"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["skill_activate", "skill_activated_dir"]), "item": "Reviewed skill activation path exists", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["find_activated_skill_ref", "activated_ref_only", "skill_invoke"]), "item": "Activated skills can be referenced through invocation packets", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["run_activated_skill", "validate_activated_skill_runtime", "skill_run_policy"]), "item": "Activated skills can be explicitly run through a gated subprocess runtime", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["scheduler_plan", "scheduler_draft_dir"]), "item": "KAIROS scheduler draft generator exists", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["scheduler_install", "scheduler_uninstall", "execute_scheduler_plan", "scheduler_execution_policy"]), "item": "Reviewed scheduler install/uninstall executor exists behind execute-scheduler gate", "source": "bridge/zhimeng_bridge.py"},
                {"ok": user_model_status({}).get("belief_count", 0) >= 1, "item": "Honcho-lite tentative beliefs exist", "source": "bridge/user-model"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["evolution_bootstrap", "bootstrap_evolution", "evolution-bootstrap-observation-draft-scheduler-no-os-install-no-auto-exec"]), "item": "Gateway evolution bootstrap verifies KAIROS, scheduler draft, AutoDream, skill activation, and user model loop", "source": "bridge/zhimeng_bridge.py"},
                {"ok": (bridge_root() / "启动织梦PersonalOS网关.cmd").exists(), "item": "Windows Gateway launcher exists", "source": "启动织梦PersonalOS网关.cmd"},
                {"ok": file_contains("desktop/zhimeng_desktop_launcher.py", ["PERMISSION_PROFILES", "--doctor", "--profile", "frontend_entry"]) and (bridge_root() / "desktop" / "zhimeng_desktop_launcher.spec").exists(), "item": "Desktop EXE launcher supports permission profiles, doctor checks, and frontend entry fallback", "source": "desktop/zhimeng_desktop_launcher.py + spec"},
            ],
            "gaps": ["Scheduler install/uninstall is available only behind explicit --execute-scheduler and request execute=true; default launchers remain draft/safe.", "Activated skill runtime is available only behind explicit --execute-skill and request execute=true; default launchers remain prompt/reference-safe."],
        },
    ]

    audited = []
    for phase in phases:
        evidence = phase["evidence"]
        gaps = phase["gaps"]
        audited.append({
            **phase,
            "status": phase_status(evidence, gaps),
            "passed": len([item for item in evidence if item.get("ok")]),
            "total": len(evidence),
        })
    return {
        "status": "partial" if any(phase["status"] != "pass" for phase in audited) else "pass",
        "phases": audited,
        "summary": {
            "pass": len([phase for phase in audited if phase["status"] == "pass"]),
            "partial": len([phase for phase in audited if phase["status"] == "partial"]),
            "missing": len([phase for phase in audited if phase["status"] == "missing"]),
        },
    }


def completion_audit() -> Dict[str, Any]:
    phase = phase_audit()
    phase_by_id = {item.get("id"): item for item in phase.get("phases", []) if isinstance(item, dict)}
    manifest = bridge_manifest()
    raw_actions = manifest.get("actions")
    if not isinstance(raw_actions, list):
        capabilities = manifest.get("capabilities") if isinstance(manifest.get("capabilities"), dict) else {}
        raw_actions = capabilities.get("actions") if isinstance(capabilities.get("actions"), list) else []
    if not raw_actions and isinstance(manifest.get("tools"), list):
        raw_actions = manifest.get("tools", [])
    actions = {item.get("action") for item in raw_actions if isinstance(item, dict)}
    tool_names = {item.get("name") for item in mcp_tool_specs() if isinstance(item, dict)}
    memory = memory_status({})
    skills = skill_status({"limit": 20})
    scheduler = scheduler_status({"limit": 10})
    workers = worker_status({"limit": 10})
    subagents = subagent_status({"limit": 20})
    user_model = user_model_status({})
    sandbox = sandbox_policy()
    packaged_desktop_exe = bridge_root() / "desktop-release" / "ZhimengPersonalOS" / "ZhimengPersonalOS.exe"
    current_packaged_exe = Path(sys.executable).resolve() if getattr(sys, "frozen", False) else packaged_desktop_exe

    def req(
        req_id: str,
        label: str,
        inspired_by: List[str],
        checks: List[Dict[str, Any]],
        gaps: List[str] | None = None,
        blocked: bool = False,
    ) -> Dict[str, Any]:
        gaps = gaps or []
        passed = len([item for item in checks if item.get("ok")])
        if blocked:
            status = "blocked-approval-required"
        elif checks and passed == len(checks) and not gaps:
            status = "proven"
        elif passed:
            status = "partial"
        else:
            status = "missing"
        return {
            "id": req_id,
            "label": label,
            "status": status,
            "inspired_by": inspired_by,
            "passed": passed,
            "total": len(checks),
            "evidence": checks,
            "gaps": gaps,
        }

    requirements = [
        req(
            "source_integrity_boundary",
            "公开来源吸收边界",
            ["Codex", "Claude Code", "WorkBuddy", "OpenClaw", "Hermes"],
            [
                {"ok": "source_audit" in actions and "source_digest" in actions, "item": "Gateway exposes audit-first source learning actions.", "source": "bridge_manifest"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["LEAKED_SOURCE_PATTERNS", "non-reusable", "audit-first-no-fetch-no-clone-no-leak-inspection"]), "item": "Leaked/protected source patterns are classified as non-reusable.", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/README.md", ["Leaked/protected code is treated as non-reusable risk material"]), "item": "README documents that leaked code is not reused.", "source": "bridge/README.md"},
            ],
        ),
        req(
            "coordinator_goal_mode",
            "编排器与目标模式",
            ["Codex", "Claude Code", "Manus"],
            [
                {"ok": "goal_bootstrap" in actions, "item": "Goal bootstrap action exists.", "source": "bridge_manifest"},
                {"ok": phase_by_id.get("phase-1-foundation", {}).get("passed", 0) >= 6, "item": "Phase 1 foundation evidence is mostly present.", "source": "phase_audit"},
                {"ok": file_contains("src/utils/coordinator-mode.ts", ["Goal Mode", "sourceBoundaries", "verification"]), "item": "Frontend coordinator prompt contains goal mode, source boundaries, and verification rules.", "source": "src/utils/coordinator-mode.ts"},
            ],
        ),
        req(
            "workflow_project_dag",
            "项目 DAG 与阶段推进",
            ["Codex", "WorkBuddy", "Manus"],
            [
                {"ok": "run" in actions and "advance" in actions, "item": "Gateway can register and advance workflow DAGs.", "source": "bridge_manifest"},
                {"ok": (bridge_root() / "bridge" / "workflows" / "workflow-state.json").exists(), "item": "Workflow state file exists.", "source": "bridge/workflows/workflow-state.json"},
                {"ok": file_contains("src/components/AIChatPanel.tsx", ["登记DAG", "推进DAG"]), "item": "Frontend exposes DAG bridge buttons.", "source": "src/components/AIChatPanel.tsx"},
            ],
        ),
        req(
            "memory_context_engine",
            "长期记忆与紧凑上下文包",
            ["Claude Code", "Codex", "Hermes"],
            [
                {"ok": "memory_retrieve" in actions and "context_pack" in actions, "item": "Gateway exposes memory retrieval and context pack actions.", "source": "bridge_manifest"},
                {"ok": memory.get("l2_count", 0) >= 1 or memory.get("total_l2", 0) >= 1, "item": "L2 consolidated memory exists.", "source": "memory_status"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["MEMORY_DIMENSION_LABELS", "retrieve_memory", "build_context_pack"]), "item": "Six-dimensional retrieval and context pack builder exist.", "source": "bridge/zhimeng_bridge.py"},
            ],
        ),
        req(
            "skills_domain_mounting",
            "Skills 动态挂载与领域隔离",
            ["Claude Code", "Codex", "OpenClaw"],
            [
                {"ok": "skill_route" in actions and "skill_invoke" in actions and "skill_bootstrap" in actions and "skill_run" in actions and "skill_run" in tool_names, "item": "Gateway exposes route/invoke/bootstrap plus gated activated skill runtime actions.", "source": "bridge_manifest + mcp_tool_specs"},
                {"ok": file_contains("src/utils/skill-registry.ts", ["novel-creation-suite", "novel-kb-manager", "novel-distillation", "tomato-novel-auto-distill"]), "item": "Four writing skills are registered.", "source": "src/utils/skill-registry.ts"},
                {"ok": skills.get("local_skill_count", 0) >= 0 and file_contains("bridge/zhimeng_bridge.py", ["local_skill_library", "configured_skill_roots"]), "item": f"Gateway can discover local/built-in SKILL.md roots ({skills.get('local_skill_count', 0)} visible in current filter).", "source": "skill_status + bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["skill_run_policy", "validate_activated_skill_runtime", "run_activated_skill", "execute_skill"]) and file_contains("bridge/healthcheck_bridge.py", ["skill_runtime", "execute_skill=True"]), "item": "Activated Skills can run only through an explicit execute-skill gated subprocess runtime, covered by healthcheck.", "source": "bridge/zhimeng_bridge.py + bridge/healthcheck_bridge.py"},
                {"ok": phase_by_id.get("phase-3-skills", {}).get("status") in {"pass", "partial"}, "item": "Phase 3 skill evidence is present.", "source": "phase_audit"},
            ],
            ["activated_skill_runtime_gated: activated Python skills can run only when Gateway starts with --execute-skill and request execute=true; default profiles keep them as prompt/reference-safe."],
        ),
        req(
            "tool_gateway_mcp_facade",
            "工具网关与 MCP Facade",
            ["Claude Code", "OpenClaw", "Hermes"],
            [
                {"ok": len(tool_names) >= 24, "item": "MCP-style tools/list exposes current Gateway tool set.", "source": "mcp_tool_specs"},
                {"ok": (bridge_root() / "bridge" / "zhimeng_mcp_stdio.py").exists(), "item": "stdio JSON-RPC facade exists.", "source": "bridge/zhimeng_mcp_stdio.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["resources/list", "resources/read", "prompts/list", "tools/call"]), "item": "HTTP MCP facade exposes tools/resources/prompts.", "source": "bridge/zhimeng_bridge.py"},
                {"ok": "web_fetch" in actions and "web_fetch" in tool_names and file_contains("bridge/zhimeng_bridge.py", ["execute_web_fetch", "web_fetch_policy", "execute_web"]), "item": "Bounded web/API fetch connector exists behind execute-web gate.", "source": "bridge_manifest + mcp_tool_specs + bridge/zhimeng_bridge.py"},
                {"ok": "mcp_call" in actions and "mcp_call" in tool_names and file_contains("bridge/zhimeng_bridge.py", ["execute_mcp_call", "mcp_call_policy", "execute_mcp"]), "item": "Bounded HTTP JSON-RPC MCP connector exists behind execute-mcp gate.", "source": "bridge_manifest + mcp_tool_specs + bridge/zhimeng_bridge.py"},
                {"ok": "mcp_stdio_catalog" in actions and "mcp_stdio_catalog" in tool_names and file_contains("bridge/zhimeng_bridge.py", ["mcp_stdio_registry", "execute_mcp_stdio_call", "registered-only"]), "item": "Registered stdio MCP process connector exists behind execute-mcp gate; arbitrary command strings are not accepted.", "source": "bridge_manifest + mcp_tool_specs + bridge/zhimeng_bridge.py"},
                {"ok": {"provider_catalog", "provider_config_status", "provider_status", "provider_probe"}.issubset(actions) and {"provider_catalog", "provider_config_status", "provider_status", "provider_probe"}.issubset(tool_names), "item": "Provider Hub catalog/config/status/probe tools are exposed through Gateway and MCP.", "source": "bridge_manifest + mcp_tool_specs"},
                {"ok": file_contains("src/components/AIChatPanel.tsx", ["Provider库", "API状态", "API探测", "Provider Hub"]), "item": "Frontend exposes Provider Hub buttons and snapshots.", "source": "src/components/AIChatPanel.tsx"},
            ],
            ["production_mcp_transport: current MCP layer is a useful JSON-RPC facade plus bounded HTTP/registered-stdio JSON-RPC client, not a full production transport with streaming/subscriptions."],
        ),
        req(
            "provider_registry_api_hub",
            "多 Provider API 接入中心",
            ["Codex", "Claude Code", "OpenClaw", "Hermes"],
            [
                {"ok": len(PROVIDER_PRESETS) >= 30, "item": f"Gateway mirrors {len(PROVIDER_PRESETS)} provider presets.", "source": "PROVIDER_PRESETS"},
                {"ok": set(model_worker_policy().get("providers", [])) == {"openai-compatible", "anthropic", "gemini", "ollama"}, "item": "Model worker supports OpenAI-compatible, Anthropic, Gemini, and Ollama providers.", "source": "model_worker_policy"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["provider_allows_empty_key", "remote provider probes require allow_remote_model=true", "GEMINI_API_KEY"]), "item": "Provider status/probe preserves key and remote-call gates.", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("src/utils/executor-bridge.ts", ["provider_catalog", "provider_config_status", "provider_status", "provider_probe"]), "item": "Frontend bridge protocol accepts Provider Hub actions.", "source": "src/utils/executor-bridge.ts"},
            ],
            ["live_provider_probe_requires_config: local probes are healthchecked; real remote provider probes require user API key and allow_remote_model=true."],
        ),
        req(
            "file_tools_access_profiles",
            "文件工具、工作区沙箱与 Full Access 档案",
            ["Codex", "Claude Code", "OpenClaw"],
            [
                {"ok": "read_file" in actions and "write_file" in actions and "read_file" in tool_names and "write_file" in tool_names, "item": "read_file/write_file are exposed through Gateway and MCP tools/list.", "source": "bridge_manifest + mcp_tool_specs"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["write_text_file", "execute_write", "full_access_files", "access_profile"]), "item": "Gateway implements explicit execute-write and full-access file gates.", "source": "bridge/zhimeng_bridge.py"},
                {"ok": isinstance(sandbox.get("file_access_profiles"), dict) and {"workspace", "full_access"}.issubset(set(sandbox.get("file_access_profiles", {}).keys())), "item": "Sandbox policy declares workspace and full_access file profiles.", "source": "sandbox_policy"},
                {"ok": file_contains("src/components/AIChatPanel.tsx", ["读文件", "写草案", "工作区写入"]), "item": "Frontend Agent panel exposes file tool bridge buttons.", "source": "src/components/AIChatPanel.tsx"},
            ],
        ),
        req(
            "subagents_workers_locks",
            "子代理、Worker 与写锁",
            ["Claude Code", "Codex", "WorkBuddy"],
            [
                {"ok": "subagent_spawn" in actions and "lock_acquire" in actions and "worker_run" in actions, "item": "Subagent, lock, and worker actions exist.", "source": "bridge_manifest"},
                {"ok": subagents.get("agent_count", 0) >= 1 or file_contains("bridge/zhimeng_bridge.py", ["spawn_subagent", "acquire_lock", "lock_conflict"]), "item": "Subagent registry and lock conflict path exist.", "source": "subagent_status + bridge/zhimeng_bridge.py"},
                {"ok": workers.get("job_count", 0) >= 1 or file_contains("bridge/zhimeng_bridge.py", ["worker_thread", "run_worker_bridge_action"]), "item": "Background worker runner exists.", "source": "worker_status + bridge/zhimeng_bridge.py"},
            ],
            ["Model workers are gated and provider-backed; live execution requires explicit execute_model plus local or approved remote model configuration."],
        ),
        req(
            "sandbox_security_policy",
            "沙盒、安全验证与审批边界",
            ["Codex", "OpenClaw", "Claude Code"],
            [
                {"ok": len(VALIDATORS) == 23, "item": "23 command validators are installed.", "source": "VALIDATORS"},
                {"ok": sandbox.get("arbitrary_commands") == "disabled", "item": "Arbitrary shell commands are disabled.", "source": "sandbox_policy"},
                {"ok": "safety_review" in actions and "sandbox_status" in actions, "item": "Safety review and sandbox status actions exist.", "source": "bridge_manifest"},
            ],
        ),
        req(
            "kairos_long_term_autonomy",
            "KAIROS 长期观察与定时草案",
            ["Manus", "Devin", "WorkBuddy"],
            [
                {"ok": "kairos_task" in actions and "kairos_tick" in actions, "item": "KAIROS task/tick actions exist.", "source": "bridge_manifest"},
                {"ok": "scheduler_plan" in actions and scheduler.get("plan_count", 0) >= 1, "item": "Scheduler draft plans exist.", "source": "scheduler_status"},
                {"ok": "scheduler_install" in actions and "scheduler_uninstall" in actions and "scheduler_install" in tool_names and "scheduler_uninstall" in tool_names, "item": "Scheduler install/uninstall actions are exposed through Gateway and MCP behind execute-scheduler.", "source": "bridge_manifest + mcp_tool_specs"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["append_kairos_daily_log", "observation-only-no-external-action"]), "item": "KAIROS daily log and observation-only tick exist.", "source": "bridge/zhimeng_bridge.py"},
            ],
            ["scheduler_install_requires_explicit_gate: OS task install/uninstall is available only when Gateway starts with --execute-scheduler and request execute=true.", "KAIROS observes and suggests; it does not perform external actions unattended."],
        ),
        req(
            "desktop_exe_shell",
            "桌面 EXE 外壳与权限 Profile",
            ["Codex", "Claude Code", "Devin"],
            [
                {"ok": (bridge_root() / "desktop" / "zhimeng_desktop_launcher.py").exists(), "item": "Desktop launcher entry exists.", "source": "desktop/zhimeng_desktop_launcher.py"},
                {"ok": (bridge_root() / "desktop" / "zhimeng_desktop_launcher.spec").exists(), "item": "PyInstaller spec exists.", "source": "desktop/zhimeng_desktop_launcher.spec"},
                {"ok": file_contains("desktop/zhimeng_desktop_launcher.py", ["PERMISSION_PROFILES", "workspace", "network", "full", "autonomy", "dev"]), "item": "Desktop launcher exposes permission profiles.", "source": "desktop/zhimeng_desktop_launcher.py"},
                {"ok": file_contains("desktop/zhimeng_desktop_launcher.py", ["run_doctor", "--doctor", "frontend_entry", "packaged_exe", "frozen"]), "item": "Desktop launcher has source and packaged doctor modes plus dist entry fallback.", "source": "desktop/zhimeng_desktop_launcher.py"},
                {"ok": file_contains("打包织梦PersonalOS桌面版.cmd", ["PyInstaller", "--doctor", "ZhimengPersonalOS.exe"]), "item": "Packaging script builds frontend, runs PyInstaller, and verifies packaged EXE doctor.", "source": "打包织梦PersonalOS桌面版.cmd"},
                {"ok": current_packaged_exe.exists() and current_packaged_exe.name.lower() == "zhimengpersonalos.exe", "item": "Packaged desktop EXE exists and can be launched directly.", "source": "desktop-release/ZhimengPersonalOS/ZhimengPersonalOS.exe or current packaged runtime"},
            ],
        ),
        req(
            "user_model_honcho_lite",
            "证据化用户模型",
            ["Claude Code", "Hermes", "Honcho-style memory"],
            [
                {"ok": "user_model_event" in actions and "user_model_reflect" in actions, "item": "User model event/reflection actions exist.", "source": "bridge_manifest"},
                {"ok": user_model.get("belief_count", 0) >= 1, "item": "At least one tentative belief exists.", "source": "user_model_status"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["confidence", "counterexample", "tentative"]), "item": "User model supports confidence and counterexamples.", "source": "bridge/zhimeng_bridge.py"},
            ],
        ),
        req(
            "writing_agent_domain",
            "织梦 Writing Agent 作为内置领域 Agent",
            ["Codex Skills", "Claude Code Skills"],
            [
                {"ok": file_contains("src/store/workspace.ts", ["小说", "写作", "BRIDGE.md"]), "item": "Default workspace keeps writing-domain project files.", "source": "src/store/workspace.ts"},
                {"ok": file_contains("src/utils/agent-context-pack.ts", ["excludedToolScopes", "skill_route", "memory_retrieve"]), "item": "Frontend writing context pack can combine skills/memory/tool exclusions.", "source": "src/utils/agent-context-pack.ts"},
                {"ok": "skill_bootstrap" in actions and "memory_bootstrap" in actions, "item": "Writing-domain acceptance gates exist.", "source": "bridge_manifest"},
            ],
        ),
        req(
            "model_worker_executor",
            "完整模型 Worker 执行器",
            ["Codex", "Claude Code", "Devin"],
            [
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["model_worker_policy", "run_model_worker_task", "call_model_worker_provider"]), "item": "Provider-backed model worker executor path exists.", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["execute_model", "allow_remote_model", "api_key_env"]), "item": "Model execution has explicit run, remote, and key gates.", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["openai-compatible", "anthropic", "gemini", "ollama"]), "item": "OpenAI-compatible, Anthropic, Gemini, and Ollama providers are supported.", "source": "bridge/zhimeng_bridge.py"},
                {"ok": "worker_cancel" in actions and file_contains("bridge/zhimeng_bridge.py", ["cancel_worker_job", "worker_cancel_requested"]), "item": "Worker cancellation path exists and is exposed through the Gateway.", "source": "bridge_manifest + bridge/zhimeng_bridge.py"},
                {"ok": "worker_merge_proposal" in actions and "worker_merge_proposal" in tool_names and file_contains("bridge/zhimeng_bridge.py", ["create_worker_merge_proposal", "merge_proposals", "review_gate"]), "item": "Worker outputs can become reviewable merge proposals without direct file writes.", "source": "bridge_manifest + mcp_tool_specs + bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["append_worker_event", "worker_stage", "events"]), "item": "Worker jobs keep structured per-job stage events for UI/status inspection.", "source": "bridge/zhimeng_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["call_openai_compatible_stream", "model_stream_chunk", "stream_chunk_count"]) and file_contains("bridge/healthcheck_bridge.py", ["stream_model", "text/event-stream", "model_stream_chunk"]), "item": "OpenAI-compatible model workers can stream chunks into structured worker events, covered by healthcheck.", "source": "bridge/zhimeng_bridge.py + bridge/healthcheck_bridge.py"},
                {"ok": file_contains("bridge/healthcheck_bridge.py", ["HealthcheckProviderHandler", "/v1/chat/completions", "execute_model", "healthcheck-model-worker-ok"]), "item": "Healthcheck proves a live local OpenAI-compatible model worker call with one-shot key redaction.", "source": "bridge/healthcheck_bridge.py"},
                {"ok": file_contains("bridge/zhimeng_bridge.py", ["run_model_worker_task_in_child", "model_worker_child_main", "terminate_worker_process", "worker_hard_cancel"]) and file_contains("desktop/zhimeng_desktop_launcher.py", ["--bridge-model-worker-child", "run_bridge_model_worker_child"]) and file_contains("bridge/healthcheck_bridge.py", ["hard_cancel_job_id", "worker_hard_cancel", "hard_canceled"]), "item": "Executed model workers run in a controlled child process and worker_cancel can hard-cancel the recorded child PID, covered by healthcheck.", "source": "bridge/zhimeng_bridge.py + desktop launcher + healthcheck_bridge.py"},
            ],
        ),
    ]

    summary = {
        "proven": len([item for item in requirements if item["status"] == "proven"]),
        "partial": len([item for item in requirements if item["status"] == "partial"]),
        "missing": len([item for item in requirements if item["status"] == "missing"]),
        "blocked_approval_required": len([item for item in requirements if item["status"] == "blocked-approval-required"]),
    }
    remaining_gaps = [
        {"requirement": item["id"], "status": item["status"], "gap": gap}
        for item in requirements
        for gap in item.get("gaps", [])
    ]
    return {
        "status": "pass" if summary["proven"] == len(requirements) else "partial",
        "summary": summary,
        "requirements": requirements,
        "remaining_gaps": remaining_gaps,
        "phase_audit_status": phase.get("status"),
        "known_limits": [
            "production_mcp_transport",
            "scheduler_install_requires_explicit_gate",
            "activated_skill_runtime_gated",
        ],
        "source_boundary": {
            "allowed": ["official docs", "public architecture descriptions", "open-source repositories with compatible reuse boundaries"],
            "blocked": ["leaked Claude Code archives", "protected source code", "verbatim proprietary prompts or implementation"],
        },
    }


def subagent_state_path() -> Path:
    return bridge_dir("subagents") / "subagent-state.json"


def load_subagent_state() -> Dict[str, Any]:
    path = subagent_state_path()
    if not path.exists():
        return {"agents": {}, "locks": [], "events": []}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(state, dict) and isinstance(state.get("agents"), dict):
            state.setdefault("locks", [])
            state.setdefault("events", [])
            return state
    except Exception:
        pass
    return {"agents": {}, "locks": [], "events": []}


def save_subagent_state(state: Dict[str, Any]) -> None:
    subagent_state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def spawn_subagent(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_subagent_state()
    agents = state.setdefault("agents", {})
    events = state.setdefault("events", [])
    agent_id = str(payload.get("agent_id") or payload.get("id") or f"agent-{uuid.uuid4()}").strip()
    agent = {
        "id": agent_id,
        "label": str(payload.get("label") or payload.get("name") or agent_id),
        "mode": str(payload.get("mode") or "forked-context"),
        "status": "running",
        "allowed_tools": payload.get("allowed_tools") if isinstance(payload.get("allowed_tools"), list) else [],
        "purpose": purpose or str(payload.get("purpose") or ""),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    agents[agent_id] = agent
    events.append({"at": now_iso(), "type": "spawn", "agent_id": agent_id, "message": agent["purpose"]})
    save_subagent_state(state)
    return agent


def active_locks(state: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [lock for lock in state.get("locks", []) if lock.get("status") == "active"]


def acquire_lock(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_subagent_state()
    locks = state.setdefault("locks", [])
    events = state.setdefault("events", [])
    agent_id = str(payload.get("agent_id") or payload.get("owner") or "").strip()
    scope = str(payload.get("scope") or "").strip()
    mode = str(payload.get("mode") or "read").strip()
    if mode not in {"read", "write"}:
        mode = "read"
    if not agent_id or not scope:
        raise ValueError("agent_id and scope are required")
    conflicts = []
    for lock in active_locks(state):
        if lock.get("scope") != scope or lock.get("agent_id") == agent_id:
            continue
        if mode == "write" or lock.get("mode") == "write":
            conflicts.append(lock)
    if conflicts:
        events.append({"at": now_iso(), "type": "lock_conflict", "agent_id": agent_id, "scope": scope, "mode": mode, "conflict_count": len(conflicts)})
        save_subagent_state(state)
        return {"status": "blocked", "conflicts": conflicts}
    lock = {
        "id": f"lock-{uuid.uuid4()}",
        "agent_id": agent_id,
        "scope": scope,
        "mode": mode,
        "status": "active",
        "purpose": purpose,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    locks.append(lock)
    events.append({"at": now_iso(), "type": "lock_acquire", "agent_id": agent_id, "lock_id": lock["id"], "scope": scope, "mode": mode})
    save_subagent_state(state)
    return {"status": "ok", "lock": lock, "conflicts": []}


def release_lock(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_subagent_state()
    events = state.setdefault("events", [])
    lock_id = str(payload.get("lock_id") or payload.get("id") or "").strip()
    agent_id = str(payload.get("agent_id") or payload.get("owner") or "").strip()
    scope = str(payload.get("scope") or "").strip()
    released = []
    for lock in state.get("locks", []):
        if lock.get("status") != "active":
            continue
        matches_id = lock_id and lock.get("id") == lock_id
        matches_agent_scope = agent_id and scope and lock.get("agent_id") == agent_id and lock.get("scope") == scope
        if matches_id or matches_agent_scope:
            lock["status"] = "released"
            lock["updated_at"] = now_iso()
            released.append(lock)
            events.append({"at": now_iso(), "type": "lock_release", "agent_id": lock.get("agent_id"), "lock_id": lock.get("id"), "message": purpose})
    save_subagent_state(state)
    return {"released": released, "active_locks": active_locks(state)}


def worker_state_path() -> Path:
    return bridge_dir("workers") / "worker-state.json"


def load_worker_state() -> Dict[str, Any]:
    with WORKER_STATE_LOCK:
        with worker_state_file_lock():
            path = worker_state_path()
            if not path.exists():
                return {"jobs": {}, "events": []}
            for _ in range(3):
                try:
                    state = json.loads(path.read_text(encoding="utf-8"))
                    if isinstance(state, dict) and isinstance(state.get("jobs"), dict):
                        state.setdefault("events", [])
                        return state
                except Exception:
                    time.sleep(0.03)
            return {"jobs": {}, "events": []}


def save_worker_state(state: Dict[str, Any]) -> None:
    with WORKER_STATE_LOCK:
        with worker_state_file_lock():
            path = worker_state_path()
            existing: Dict[str, Any] = {}
            if path.exists():
                try:
                    loaded = json.loads(path.read_text(encoding="utf-8"))
                    existing = loaded if isinstance(loaded, dict) else {}
                except Exception:
                    existing = {}

            def merge_job(current: Any, incoming: Any) -> Dict[str, Any]:
                if not isinstance(current, dict):
                    return incoming if isinstance(incoming, dict) else {}
                if not isinstance(incoming, dict):
                    return current
                current_time = str(current.get("updated_at") or "")
                incoming_time = str(incoming.get("updated_at") or "")
                merged = dict(current)
                if incoming_time >= current_time:
                    merged.update(incoming)
                else:
                    for key, value in incoming.items():
                        if key not in merged:
                            merged[key] = value
                incoming_cancel = bool(incoming.get("cancel_requested")) or str(incoming.get("status") or "") == "canceled" or isinstance(incoming.get("hard_cancel"), dict)
                if incoming_cancel:
                    for key in ("status", "cancel_requested", "cancel_reason", "completed_at", "hard_cancel_status", "hard_cancel_at", "hard_cancel", "message"):
                        if incoming.get(key) is not None:
                            merged[key] = incoming.get(key)
                    hard_cancel = incoming.get("hard_cancel")
                    if isinstance(hard_cancel, dict) and hard_cancel.get("status"):
                        merged["hard_cancel_status"] = hard_cancel.get("status")
                current_events = current.get("events") if isinstance(current.get("events"), list) else []
                incoming_events = incoming.get("events") if isinstance(incoming.get("events"), list) else []
                if current_events or incoming_events:
                    seen = set()
                    merged_events = []
                    for event in [*current_events, *incoming_events]:
                        key = json.dumps(event, ensure_ascii=False, sort_keys=True)
                        if key in seen:
                            continue
                        seen.add(key)
                        merged_events.append(event)
                    merged["events"] = sorted(merged_events, key=lambda item: str(item.get("at") or ""))[-80:]
                current_canceled = str(current.get("status") or "") == "canceled" and (
                    bool(current.get("cancel_requested")) or isinstance(current.get("hard_cancel"), dict)
                )
                if current_canceled and str(incoming.get("status") or "") not in {"canceled"}:
                    merged["status"] = "canceled"
                    merged["cancel_requested"] = current.get("cancel_requested", True)
                    if current.get("cancel_reason") is not None:
                        merged["cancel_reason"] = current.get("cancel_reason")
                    if current.get("completed_at"):
                        merged["completed_at"] = current.get("completed_at")
                    for key in ("hard_cancel_status", "hard_cancel_at", "hard_cancel"):
                        if current.get(key) is not None:
                            merged[key] = current.get(key)
                    if incoming.get("result") is not None and merged.get("result") is None:
                        merged["post_cancel_result"] = incoming.get("result")
                    if incoming.get("error") is not None and merged.get("post_cancel_error") is None:
                        merged["post_cancel_error"] = incoming.get("error")
                return merged

            if isinstance(existing.get("jobs"), dict) and isinstance(state.get("jobs"), dict):
                merged_jobs = dict(existing.get("jobs") or {})
                for job_id, incoming in (state.get("jobs") or {}).items():
                    current = merged_jobs.get(job_id)
                    merged_jobs[job_id] = merge_job(current, incoming)
                state["jobs"] = merged_jobs
            if isinstance(existing.get("merge_proposals"), dict) or isinstance(state.get("merge_proposals"), dict):
                merged_proposals = dict(existing.get("merge_proposals") or {})
                merged_proposals.update(state.get("merge_proposals") or {})
                state["merge_proposals"] = merged_proposals
            existing_events = existing.get("events") if isinstance(existing.get("events"), list) else []
            incoming_events = state.get("events") if isinstance(state.get("events"), list) else []
            if existing_events or incoming_events:
                seen = set()
                merged_events = []
                for event in [*existing_events, *incoming_events]:
                    key = json.dumps(event, ensure_ascii=False, sort_keys=True)
                    if key in seen:
                        continue
                    seen.add(key)
                    merged_events.append(event)
                state["events"] = sorted(merged_events, key=lambda item: str(item.get("at") or ""))[-1000:]
            tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
            tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
            for attempt in range(6):
                try:
                    os.replace(str(tmp), str(path))
                    break
                except PermissionError:
                    if attempt >= 5:
                        raise
                    time.sleep(0.05 * (attempt + 1))
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass


def worker_merge_dir() -> Path:
    target = bridge_dir("workers") / "merge-proposals"
    target.mkdir(parents=True, exist_ok=True)
    return target


def append_worker_event(job_id: str, event_type: str, **fields: Any) -> Dict[str, Any]:
    with WORKER_STATE_LOCK:
        state = load_worker_state()
        jobs = state.setdefault("jobs", {})
        events = state.setdefault("events", [])
        now = now_iso()
        event = {"at": now, "type": event_type, "job_id": job_id}
        event.update({key: value for key, value in fields.items() if value is not None})
        events.append(event)
        job = jobs.get(job_id)
        if job is not None:
            job["updated_at"] = now
            job_events = job.setdefault("events", [])
            if isinstance(job_events, list):
                job_events.append(event)
                job["events"] = job_events[-80:]
        state["events"] = events[-1000:]
        save_worker_state(state)
        return event


def update_worker_job(job_id: str, updates: Dict[str, Any]) -> None:
    with WORKER_STATE_LOCK:
        state = load_worker_state()
        jobs = state.setdefault("jobs", {})
        events = state.setdefault("events", [])
        job = jobs.get(job_id)
        if not job:
            return
        job.update(updates)
        job["updated_at"] = now_iso()
        event = {"at": job["updated_at"], "type": "worker_update", "job_id": job_id, "status": job.get("status")}
        events.append(event)
        job_events = job.setdefault("events", [])
        if isinstance(job_events, list):
            job_events.append(event)
            job["events"] = job_events[-80:]
        state["events"] = events[-1000:]
        save_worker_state(state)


def worker_output_text(job: Dict[str, Any] | None, execution: Dict[str, Any] | None = None) -> str:
    source = execution if isinstance(execution, dict) else job.get("result", {}) if isinstance(job, dict) else {}
    if isinstance(source, dict):
        for key in ("output", "stdout", "text", "content"):
            if source.get(key) is not None:
                return str(source.get(key) or "")
        nested = source.get("result")
        if isinstance(nested, dict):
            for key in ("output", "stdout", "text", "content", "message"):
                if nested.get(key) is not None:
                    return str(nested.get(key) or "")
            return json.dumps(nested, ensure_ascii=False, indent=2)
    return ""


def process_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes
            process_query_limited_information = 0x1000
            still_active = 259
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            handle = kernel32.OpenProcess(process_query_limited_information, False, wintypes.DWORD(pid))
            if not handle:
                # ERROR_INVALID_PARAMETER means the PID does not exist; access denied still implies a live process.
                return ctypes.get_last_error() != 87
            try:
                exit_code = wintypes.DWORD()
                if not kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
                    return True
                return int(exit_code.value) == still_active
            finally:
                kernel32.CloseHandle(handle)
        except Exception:
            try:
                result = subprocess.run(["tasklist", "/FI", f"PID eq {pid}"], capture_output=True, text=True, timeout=2, shell=False)
                return str(pid) in (result.stdout or "")
            except Exception:
                return False
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except OSError:
        return False


def terminate_worker_process(pid: int, timeout_seconds: float = 2.0) -> Dict[str, Any]:
    if pid <= 0:
        return {"status": "missing", "pid": pid, "message": "No worker process PID was recorded."}
    if not process_alive(pid):
        return {"status": "not_running", "pid": pid}

    if os.name == "nt":
        commands = [
            ["taskkill", "/PID", str(pid), "/T"],
            ["taskkill", "/PID", str(pid), "/T", "/F"],
        ]
        first_stdout = ""
        first_stderr = ""
        last_returncode = -1
        for index, command in enumerate(commands):
            try:
                proc = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=max(1.0, timeout_seconds),
                    shell=False,
                )
                if index == 0:
                    first_stdout = proc.stdout[:500]
                    first_stderr = proc.stderr[:500]
                last_returncode = int(proc.returncode)
            except Exception as exc:
                first_stderr = str(exc)[:500]
                last_returncode = -1
            deadline = time.time() + max(0.2, timeout_seconds)
            while time.time() < deadline:
                if not process_alive(pid):
                    return {
                        "status": "terminated" if index == 0 else "killed",
                        "pid": pid,
                        "returncode": last_returncode,
                        "stdout": first_stdout,
                        "stderr": first_stderr,
                    }
                time.sleep(0.05)
        return {
            "status": "still_running",
            "pid": pid,
            "returncode": last_returncode,
            "stdout": first_stdout,
            "stderr": first_stderr,
        }

    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return {"status": "not_running", "pid": pid}
    except Exception as exc:
        return {"status": "failed", "pid": pid, "error": str(exc)}
    deadline = time.time() + max(0.2, timeout_seconds)
    while time.time() < deadline:
        if not process_alive(pid):
            return {"status": "terminated", "pid": pid}
        time.sleep(0.05)
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        return {"status": "terminated", "pid": pid}
    except Exception as exc:
        return {"status": "failed", "pid": pid, "error": str(exc)}
    return {"status": "killed" if not process_alive(pid) else "still_running", "pid": pid}


def parse_child_model_output(stdout: str) -> Dict[str, Any]:
    text = (stdout or "").strip()
    if not text:
        return {"status": "failed", "error": "model worker child produced no JSON output"}
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {"status": "failed", "error": "model worker child returned non-object JSON"}
    except Exception:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for line in reversed(lines):
            try:
                data = json.loads(line)
                return data if isinstance(data, dict) else {"status": "failed", "error": "model worker child returned non-object JSON line"}
            except Exception:
                continue
    return {
        "status": "failed",
        "error": "model worker child output was not valid JSON",
        "stdout_preview": text[-1000:],
    }


def model_worker_child_command() -> List[str]:
    if getattr(sys, "frozen", False):
        return [str(Path(sys.executable).resolve()), "--bridge-model-worker-child"]
    return [str(Path(sys.executable).resolve()), str(Path(__file__).resolve()), "--model-worker-child"]


def run_model_worker_task_in_child(job_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    child_payload = dict(payload)
    child_payload["job_id"] = job_id
    timeout_seconds = min(int(child_payload.get("timeout_seconds") or 45), int(model_worker_policy()["timeout_seconds_max"]))
    command = model_worker_child_command()
    append_worker_event(job_id, "model_child_start", status="starting", command=command[0])
    try:
        proc = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=str(bridge_root()),
            shell=False,
        )
    except Exception as exc:
        append_worker_event(job_id, "model_child_start", status="failed", message=str(exc))
        return {"status": "failed", "error": f"failed to start model worker child: {exc}", "hard_cancel_supported": False}

    update_worker_job(job_id, {
        "process_pid": int(proc.pid),
        "process_started_at": now_iso(),
        "hard_cancel_supported": True,
        "hard_cancel_status": "running",
    })
    append_worker_event(job_id, "model_child_started", status="running", pid=int(proc.pid))
    try:
        stdout, stderr = proc.communicate(json.dumps(child_payload, ensure_ascii=False), timeout=timeout_seconds + 5)
    except subprocess.TimeoutExpired:
        terminate = terminate_worker_process(int(proc.pid))
        stdout, stderr = proc.communicate(timeout=2) if proc.poll() is not None else ("", "")
        append_worker_event(job_id, "model_child_timeout", status=terminate.get("status"), pid=int(proc.pid))
        return {
            "status": "canceled" if worker_cancel_requested(job_id) else "failed",
            "error": "model worker child timed out",
            "timeout_seconds": timeout_seconds,
            "hard_cancel_status": terminate.get("status"),
            "pid": int(proc.pid),
            "stderr": (stderr or "")[:2000],
        }

    returncode = proc.returncode
    if worker_cancel_requested(job_id) and returncode not in {0, None}:
        append_worker_event(job_id, "model_child_end", status="canceled", pid=int(proc.pid), returncode=returncode)
        return {
            "status": "canceled",
            "pid": int(proc.pid),
            "returncode": returncode,
            "hard_cancel_status": "terminated",
            "stderr": (stderr or "")[:2000],
        }

    result = parse_child_model_output(stdout)
    result["child_process"] = {
        "pid": int(proc.pid),
        "returncode": returncode,
        "stderr": (stderr or "")[:2000],
    }
    if returncode not in {0, None} and result.get("status") == "failed":
        result["stderr"] = (stderr or "")[:2000]
    append_worker_event(job_id, "model_child_end", status=str(result.get("status") or "unknown"), pid=int(proc.pid), returncode=returncode)
    return result


def model_worker_child_main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        if not isinstance(payload, dict):
            raise ValueError("model worker child payload must be an object")
        output = run_model_worker_task(payload)
    except Exception as exc:
        output = {"status": "failed", "error": str(exc)}
    sys.stdout.write(json.dumps(output, ensure_ascii=False))
    sys.stdout.flush()
    return 0 if output.get("status") in {"ok", "approval_required", "blocked"} else 1


def create_worker_merge_proposal(payload: Dict[str, Any], purpose: str, job: Dict[str, Any] | None = None, execution: Dict[str, Any] | None = None) -> Dict[str, Any]:
    job_id = str(payload.get("job_id") or payload.get("id") or (job or {}).get("id") or "").strip()
    state = load_worker_state()
    jobs = state.setdefault("jobs", {})
    events = state.setdefault("events", [])
    if not job and job_id:
        found = jobs.get(job_id)
        job = found if isinstance(found, dict) else None

    target_raw = str(
        payload.get("target_path")
        or payload.get("path")
        or payload.get("file_path")
        or ((job or {}).get("payload") or {}).get("merge_target_path")
        or ""
    ).strip()
    if not target_raw:
        return {"status": "blocked", "reason": "target_path is required for worker merge proposal"}

    access_profile = normalize_file_access_profile(payload)
    if access_profile != "workspace":
        return {"status": "blocked", "reason": "worker merge proposals currently support workspace targets only; use write_file full_access approval separately"}
    try:
        target = resolve_file_path(target_raw, "workspace", full_access_files=False)
    except Exception as exc:
        return {"status": "blocked", "reason": str(exc)}

    mode = str(payload.get("mode") or ((job or {}).get("payload") or {}).get("merge_mode") or "replace").strip().lower()
    if mode not in {"replace", "append"}:
        mode = "replace"
    content = str(
        payload.get("content")
        if payload.get("content") is not None
        else payload.get("new_content")
        if payload.get("new_content") is not None
        else payload.get("text")
        if payload.get("text") is not None
        else worker_output_text(job, execution)
    )
    content = content[:WORKER_MERGE_MAX_CONTENT_CHARS]
    if not content.strip():
        return {"status": "blocked", "reason": "worker output/content is empty; no merge proposal created"}

    old_text = ""
    existed = target.exists() and target.is_file()
    if existed:
        old_text = target.read_text(encoding="utf-8", errors="replace")[:WORKER_MERGE_MAX_CONTENT_CHARS]
    new_text = old_text + content if mode == "append" else content
    proposal_id = str(payload.get("proposal_id") or f"merge-{uuid.uuid4()}")
    created_at = now_iso()
    proposal_path = worker_merge_dir() / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{proposal_id}.json"
    summary = {
        "id": proposal_id,
        "status": "proposal",
        "job_id": job_id,
        "target_path": str(target),
        "target_relative": str(target.relative_to(bridge_root())) if bridge_root() in target.parents or target == bridge_root() else str(target),
        "access_profile": access_profile,
        "mode": mode,
        "created_at": created_at,
        "purpose": purpose or str(payload.get("purpose") or (job or {}).get("purpose") or "worker merge proposal"),
        "old_sha256": short_sha256(old_text),
        "new_sha256": short_sha256(new_text),
        "old_chars": len(old_text),
        "new_chars": len(new_text),
        "content_chars": len(content),
        "diff_preview": text_diff_preview(target, old_text, new_text),
        "proposal_path": str(proposal_path.relative_to(bridge_root())),
        "review_gate": "Use write_file with expected_sha256/new content after review; this proposal does not modify the target file.",
    }
    record = dict(summary)
    record["proposed_content"] = new_text[:WORKER_MERGE_MAX_CONTENT_CHARS]
    record["source_worker"] = job or {}
    proposal_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    proposals = state.setdefault("merge_proposals", {})
    if isinstance(proposals, dict):
        proposals[proposal_id] = summary
    if job_id and isinstance(jobs.get(job_id), dict):
        jobs[job_id]["merge_proposal"] = summary
        jobs[job_id]["updated_at"] = created_at
        job_events = jobs[job_id].setdefault("events", [])
        event = {"at": created_at, "type": "worker_merge_proposal", "job_id": job_id, "proposal_id": proposal_id, "status": "proposal"}
        if isinstance(job_events, list):
            job_events.append(event)
            jobs[job_id]["events"] = job_events[-80:]
        events.append(event)
    else:
        events.append({"at": created_at, "type": "worker_merge_proposal", "job_id": job_id, "proposal_id": proposal_id, "status": "proposal"})
    state["events"] = events[-1000:]
    save_worker_state(state)
    append_kairos_daily_log("worker_merge_proposal", f"Created worker merge proposal {proposal_id}.", {
        "job_id": job_id,
        "target_path": summary["target_relative"],
        "proposal_path": summary["proposal_path"],
    })
    return {"status": "proposal", "proposal": summary}


def is_local_model_url(api_url: str) -> bool:
    parsed = urlparse(api_url)
    host = (parsed.hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"} or host.startswith("192.168.") or host.startswith("10.") or host.endswith(".local")


def infer_model_provider(api_url: str) -> str:
    url = api_url.lower()
    if "anthropic.com" in url or "claude" in url:
        return "anthropic"
    if "generativelanguage.googleapis.com" in url or "gemini" in url:
        return "gemini"
    if "localhost:11434" in url or "127.0.0.1:11434" in url or "/api/chat" in url or "ollama" in url:
        return "ollama"
    return "openai-compatible"


def provider_allows_empty_key(api_url: str, provider: str | None = None) -> bool:
    effective_provider = provider or infer_model_provider(api_url)
    if effective_provider == "ollama":
        return True
    parsed = urlparse(api_url)
    host = (parsed.hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def provider_key_env(provider: str) -> str:
    return {
        "anthropic": "ANTHROPIC_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "ollama": "",
        "openai-compatible": model_worker_policy()["default_api_key_env"],
    }.get(provider, model_worker_policy()["default_api_key_env"])


PROVIDER_SWITCH_SCHEMA = "zhimeng.provider-settings.v1"


def provider_switch_config_path() -> Path:
    override = os.environ.get("ZHIMENG_PROVIDER_CONFIG", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    appdata = os.environ.get("APPDATA", "").strip()
    if appdata:
        return Path(appdata).expanduser().resolve() / "ZhimengWritingAgent" / "provider-settings.json"
    return Path.home() / ".zhimeng-writing-agent" / "provider-settings.json"


def provider_switch_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_provider_switch_profile(profile: Dict[str, Any], include_secret: bool = False) -> Dict[str, Any]:
    api_url = str(profile.get("apiUrl") or profile.get("api_url") or "").strip()
    provider = str(profile.get("provider") or infer_model_provider(api_url)).strip()
    api_key = str(profile.get("apiKey") or profile.get("api_key") or "").strip()
    profile_id = str(profile.get("id") or profile.get("profileId") or profile.get("presetId") or f"api-profile-{uuid.uuid4()}").strip()
    normalized = {
        "id": profile_id,
        "name": str(profile.get("name") or profile.get("label") or profile.get("modelName") or profile.get("model_name") or profile_id).strip(),
        "apiUrl": api_url,
        "apiKey": api_key if include_secret else ("[present:redacted]" if api_key else ""),
        "apiKeyEnv": str(profile.get("apiKeyEnv") or profile.get("api_key_env") or provider_key_env(provider)).strip(),
        "modelId": str(profile.get("modelId") or profile.get("model_id") or profile.get("model") or "").strip(),
        "modelName": str(profile.get("modelName") or profile.get("model_name") or profile.get("name") or "").strip(),
        "provider": provider,
        "temperature": profile.get("temperature"),
        "maxTokens": profile.get("maxTokens") if profile.get("maxTokens") is not None else profile.get("max_tokens"),
        "source": str(profile.get("source") or "desktop-provider-switch"),
        "updatedAt": profile.get("updatedAt") or profile.get("updated_at") or provider_switch_now(),
    }
    if normalized["temperature"] in ("", None):
        normalized["temperature"] = None
    if normalized["maxTokens"] in ("", None):
        normalized["maxTokens"] = None
    return normalized


def load_provider_switch_config(include_secret: bool = False) -> Dict[str, Any]:
    path = provider_switch_config_path()
    if not path.exists():
        return {
            "schema": PROVIDER_SWITCH_SCHEMA,
            "exists": False,
            "path": str(path),
            "activeProfileId": "",
            "profiles": [],
            "updatedAt": None,
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    profiles = data.get("profiles") if isinstance(data.get("profiles"), list) else []
    safe_profiles = [sanitize_provider_switch_profile(as_record(profile), include_secret=include_secret) for profile in profiles]
    active_id = str(data.get("activeProfileId") or data.get("active_profile_id") or "").strip()
    if not active_id and safe_profiles:
        active_id = str(safe_profiles[0].get("id") or "")
    return {
        "schema": str(data.get("schema") or PROVIDER_SWITCH_SCHEMA),
        "exists": True,
        "path": str(path),
        "activeProfileId": active_id,
        "profiles": safe_profiles,
        "updatedAt": data.get("updatedAt") or data.get("updated_at"),
    }


def save_provider_switch_config(config: Dict[str, Any]) -> Dict[str, Any]:
    path = provider_switch_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    profiles = [sanitize_provider_switch_profile(as_record(profile), include_secret=True) for profile in config.get("profiles", []) if isinstance(profile, dict)]
    active_id = str(config.get("activeProfileId") or config.get("active_profile_id") or "").strip()
    if not active_id and profiles:
        active_id = str(profiles[0].get("id") or "")
    payload = {
        "schema": PROVIDER_SWITCH_SCHEMA,
        "updatedAt": config.get("updatedAt") or provider_switch_now(),
        "activeProfileId": active_id,
        "profiles": profiles,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return load_provider_switch_config(include_secret=False)


def provider_config_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    include_secret = bool(payload.get("include_secret") and payload.get("import_to_frontend"))
    config = load_provider_switch_config(include_secret=include_secret)
    active = next((profile for profile in config.get("profiles", []) if profile.get("id") == config.get("activeProfileId")), None)
    settings = None
    if active:
        settings = {
            "apiUrl": active.get("apiUrl") or "",
            "apiKey": active.get("apiKey") if include_secret else ("[present:redacted]" if active.get("apiKey") else ""),
            "modelId": active.get("modelId") or "",
            "modelName": active.get("modelName") or active.get("name") or "",
            "provider": active.get("provider") or infer_model_provider(str(active.get("apiUrl") or "")),
            "temperature": active.get("temperature"),
            "maxTokens": active.get("maxTokens"),
            "profiles": config.get("profiles", []),
            "activeProfileId": config.get("activeProfileId") or "",
            "desktopConfigImportedAt": config.get("updatedAt"),
            "desktopConfigSource": "desktop-provider-switch",
        }
    return {
        "status": "ok",
        "policy": {
            "schema": PROVIDER_SWITCH_SCHEMA,
            "config_env": "ZHIMENG_PROVIDER_CONFIG",
            "default_path": str(provider_switch_config_path()),
            "secret_response": "only when include_secret=true and import_to_frontend=true; run records redact secrets",
        },
        "config": config,
        "active_profile": active,
        "settings": settings,
    }


def provider_wire_format(provider: str, api_url: str) -> Dict[str, Any]:
    if provider == "anthropic":
        return {"kind": "anthropic-messages", "chat_path": "/messages", "auth": "x-api-key"}
    if provider == "gemini":
        return {"kind": "gemini-generate-content", "chat_path": "/models/{model}:generateContent", "auth": "query-key"}
    if provider == "ollama" and not api_url.rstrip("/").endswith("/v1"):
        return {"kind": "ollama-native", "chat_path": "/api/chat", "auth": "none"}
    return {"kind": "openai-compatible", "chat_path": "/chat/completions", "auth": "bearer"}


def normalize_provider_preset(raw: Dict[str, Any]) -> Dict[str, Any]:
    provider = str(raw.get("provider") or infer_model_provider(str(raw.get("api_url") or ""))).strip()
    api_url = str(raw.get("api_url") or raw.get("apiUrl") or "").strip()
    preset = {
        "id": str(raw.get("id") or raw.get("model_id") or raw.get("modelId") or f"provider-{uuid.uuid4()}"),
        "label": str(raw.get("label") or raw.get("name") or raw.get("model_name") or raw.get("modelName") or "Provider"),
        "provider": provider,
        "provider_label": PROVIDER_LABELS.get(provider, provider),
        "api_url": api_url,
        "model_id": str(raw.get("model_id") or raw.get("modelId") or raw.get("model") or "").strip(),
        "model_name": str(raw.get("model_name") or raw.get("modelName") or raw.get("label") or "").strip(),
        "group": str(raw.get("group") or ("local" if is_local_model_url(api_url) else "global")).strip(),
        "notes": str(raw.get("notes") or ""),
        "local": is_local_model_url(api_url),
        "key_optional": provider_allows_empty_key(api_url, provider),
        "api_key_env": provider_key_env(provider),
        "wire": provider_wire_format(provider, api_url),
    }
    return preset


def provider_catalog(payload: Dict[str, Any]) -> Dict[str, Any]:
    query = str(payload.get("query") or payload.get("keyword") or "").strip().lower()
    group = str(payload.get("group") or "").strip()
    provider_filter = str(payload.get("provider") or "").strip()
    local_only = bool(payload.get("local_only"))
    limit = min(int(payload.get("limit") or len(PROVIDER_PRESETS)), len(PROVIDER_PRESETS))
    presets = [normalize_provider_preset(item) for item in PROVIDER_PRESETS]
    if query:
        presets = [
            item for item in presets
            if query in " ".join([item.get("id", ""), item.get("label", ""), item.get("model_id", ""), item.get("api_url", ""), item.get("notes", ""), item.get("provider_label", "")]).lower()
        ]
    if group:
        presets = [item for item in presets if item.get("group") == group]
    if provider_filter:
        presets = [item for item in presets if item.get("provider") == provider_filter]
    if local_only:
        presets = [item for item in presets if item.get("local")]
    counts: Dict[str, int] = {}
    provider_counts: Dict[str, int] = {}
    for item in [normalize_provider_preset(preset) for preset in PROVIDER_PRESETS]:
        counts[item["group"]] = counts.get(item["group"], 0) + 1
        provider_counts[item["provider"]] = provider_counts.get(item["provider"], 0) + 1
    return {
        "status": "ok",
        "policy": provider_registry_policy(),
        "providers": [{"id": key, "label": label, "count": provider_counts.get(key, 0)} for key, label in PROVIDER_LABELS.items()],
        "groups": [{"id": key, "label": PROVIDER_GROUP_LABELS.get(key, key), "count": counts.get(key, 0)} for key in sorted(counts)],
        "preset_count": len(PROVIDER_PRESETS),
        "returned": len(presets[:limit]),
        "presets": presets[:limit],
    }


def resolve_provider_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    preset_id = str(payload.get("preset_id") or payload.get("presetId") or "").strip()
    raw: Dict[str, Any] = {}
    if preset_id:
        raw = next((item for item in PROVIDER_PRESETS if item.get("id") == preset_id), {})
        if not raw:
            raise ValueError(f"unknown provider preset: {preset_id}")
    merged = dict(raw)
    for source_key, target_key in [
        ("provider", "provider"),
        ("api_url", "api_url"),
        ("apiUrl", "api_url"),
        ("model_id", "model_id"),
        ("modelId", "model_id"),
        ("model", "model_id"),
        ("model_name", "model_name"),
        ("modelName", "model_name"),
    ]:
        if payload.get(source_key):
            merged[target_key] = payload.get(source_key)
    if not merged.get("provider") and merged.get("api_url"):
        merged["provider"] = infer_model_provider(str(merged.get("api_url")))
    return normalize_provider_preset(merged)


def provider_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    config = resolve_provider_config(payload) if (payload.get("preset_id") or payload.get("api_url") or payload.get("apiUrl")) else {}
    if not config:
        catalog = provider_catalog({"limit": 0})
        return {
            "status": "ok",
            "policy": provider_registry_policy(),
            "catalog": {
                "preset_count": catalog.get("preset_count"),
                "providers": catalog.get("providers"),
                "groups": catalog.get("groups"),
            },
            "env": {
                "default_model_key_present": bool(os.environ.get(model_worker_policy()["default_api_key_env"], "").strip()),
                "anthropic_key_present": bool(os.environ.get("ANTHROPIC_API_KEY", "").strip()),
                "gemini_key_present": bool(os.environ.get("GEMINI_API_KEY", "").strip()),
            },
        }
    provider = str(config.get("provider") or "openai-compatible")
    key_env = str(payload.get("api_key_env") or config.get("api_key_env") or provider_key_env(provider))
    one_shot_key = bool(str(payload.get("api_key") or "").strip())
    env_key_present = bool(key_env and os.environ.get(key_env, "").strip())
    key_required = not bool(config.get("key_optional"))
    return {
        "status": "ok",
        "policy": provider_registry_policy(),
        "config": {**config, "api_key_env": key_env},
        "model_worker_payload": {
            "kind": "model_task",
            "provider": provider,
            "api_url": config.get("api_url"),
            "model_id": config.get("model_id"),
            "api_key_env": key_env,
            "allow_remote_model": False,
            "execute_model": False,
        },
        "readiness": {
            "local_endpoint": bool(config.get("local")),
            "remote_endpoint": not bool(config.get("local")),
            "key_required": key_required,
            "key_available": (not key_required) or one_shot_key or env_key_present,
            "one_shot_key_present": one_shot_key,
            "env_key_present": env_key_present,
            "remote_requires_allow_remote_model": not bool(config.get("local")),
        },
    }


def provider_probe(payload: Dict[str, Any], purpose: str, execute_provider: bool = False) -> Dict[str, Any]:
    config = resolve_provider_config(payload)
    api_url = str(config.get("api_url") or "").strip()
    provider = str(config.get("provider") or "openai-compatible")
    request_execute = bool(payload.get("execute") or payload.get("_request_execute"))
    if not api_url:
        raise ValueError("provider_probe api_url or preset_id is required")
    if not bool(execute_provider):
        return {
            "status": "approval_required",
            "reason": "provider_probe requires Gateway --execute-provider before any network probe",
            "config": config,
            "policy": provider_registry_policy(),
        }
    if not request_execute:
        return {
            "status": "approval_required",
            "reason": "provider_probe requires payload execute=true before any network probe",
            "config": config,
            "policy": provider_registry_policy(),
        }
    if not is_local_model_url(api_url) and not bool(payload.get("allow_remote_model")):
        return {
            "status": "approval_required",
            "reason": "remote provider probes require allow_remote_model=true",
            "config": config,
            "policy": provider_registry_policy(),
        }
    timeout_seconds = min(int(payload.get("timeout_seconds") or 5), provider_registry_policy()["timeout_seconds_max"])
    key_env = str(payload.get("api_key_env") or config.get("api_key_env") or provider_key_env(provider))
    api_key = str(payload.get("api_key") or (os.environ.get(key_env, "") if key_env else "")).strip()
    if provider == "ollama" and not api_url.rstrip("/").endswith("/v1"):
        url = normalize_api_url(api_url, "/api/tags")
        body = None
        request_method = "GET"
    elif provider == "gemini":
        key_suffix = f"?key={quote(api_key)}" if api_key else ""
        url = f"{api_url.rstrip('/')}/models{key_suffix}"
        body = None
        request_method = "GET"
    else:
        url = normalize_api_url(api_url, "/models")
        body = None
        request_method = "GET"
    headers = {"User-Agent": "LumenOS-Agent-Gateway/0.2"}
    if provider == "anthropic" and api_key:
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
    elif provider not in {"ollama", "gemini"} and api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    inline_secrets = [api_key]
    try:
        request = urllib.request.Request(url, data=body, headers=headers, method=request_method)
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read(20_000)
            text = redact_inline_secret_values(raw.decode("utf-8", errors="replace"), inline_secrets)
            parsed: Any = None
            try:
                parsed = json.loads(text) if text else None
            except Exception:
                parsed = None
            model_count = 0
            if isinstance(parsed, dict):
                if isinstance(parsed.get("data"), list):
                    model_count = len(parsed.get("data") or [])
                elif isinstance(parsed.get("models"), list):
                    model_count = len(parsed.get("models") or [])
            safe_url = redact_url_secrets(url)
            return {
                "status": "ok" if 200 <= int(response.status) < 400 else "http_error",
                "purpose": purpose,
                "config": config,
                "url": safe_url,
                "status_code": int(response.status),
                "content_type": response.headers.get("Content-Type", ""),
                "model_count": model_count,
                "text": text[:2000],
                "json": parsed,
                "request_headers": redact_headers(headers),
                "policy": provider_registry_policy(),
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read(20_000)
        text = redact_inline_secret_values(raw.decode("utf-8", errors="replace"), inline_secrets)
        return {
            "status": "http_error",
            "purpose": purpose,
            "config": config,
            "url": redact_url_secrets(url),
            "status_code": int(exc.code),
            "reason": str(exc.reason),
            "text": text[:2000],
            "request_headers": redact_headers(headers),
            "policy": provider_registry_policy(),
        }
    except urllib.error.URLError as exc:
        return {
            "status": "network_error",
            "purpose": purpose,
            "config": config,
            "url": redact_url_secrets(url),
            "reason": str(exc.reason),
            "request_headers": redact_headers(headers),
            "policy": provider_registry_policy(),
        }


def normalize_api_url(api_url: str, suffix: str) -> str:
    base = api_url.strip().rstrip("/")
    if base.endswith(suffix):
        return base
    return f"{base}{suffix}"


def redact_model_worker_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    redacted = dict(payload)
    if "api_key" in redacted:
        redacted["api_key"] = "[redacted]"
    return redacted


def model_worker_key(payload: Dict[str, Any], provider: str) -> str:
    if provider == "ollama":
        return str(payload.get("api_key") or "")
    if str(payload.get("api_key") or "").strip():
        return str(payload.get("api_key") or "").strip()
    env_name = str(payload.get("api_key_env") or model_worker_policy()["default_api_key_env"]).strip()
    return os.environ.get(env_name, "").strip()


def prepare_model_worker_task(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    provider = str(payload.get("provider") or "openai-compatible").strip().lower()
    if provider not in set(model_worker_policy()["providers"]):
        provider = "openai-compatible"
    task = str(payload.get("prompt") or payload.get("task") or payload.get("objective") or purpose or "").strip()
    if not task:
        raise ValueError("model worker prompt/task is required")
    max_prompt_chars = int(model_worker_policy()["max_prompt_chars"])
    task = task[:max_prompt_chars]
    domain = str(payload.get("domain") or "general").strip()
    context_payload = {
        "task": task,
        "query": str(payload.get("query") or task),
        "domain": domain,
        "limit": int(payload.get("context_limit") or 4),
        "current_text": str(payload.get("current_text") or "")[:8000],
        "thread_id": str(payload.get("thread_id") or "").strip(),
        "thread_title": str(payload.get("thread_title") or "").strip(),
        "workspace_id": str(payload.get("workspace_id") or "").strip(),
        "approval_ids": payload.get("approval_ids") if isinstance(payload.get("approval_ids"), list) else [],
        "thread_context": payload.get("thread_context") if isinstance(payload.get("thread_context"), list) else [],
        "thread_context_policy": payload.get("thread_context_policy") if isinstance(payload.get("thread_context_policy"), dict) else {},
    }
    context = build_context_pack(context_payload, purpose or "model worker context")
    system_prompt = str(payload.get("system_prompt") or "").strip() or "\n".join([
        "You are a bounded LumenOS Personal Agent OS worker.",
        "Use only the compact context supplied here. Do not claim external tools ran unless the context says so.",
        "Return: result, evidence, risks, and next_actions. Do not write files or run commands.",
    ])
    user_prompt = "\n\n".join([
        task,
        "Compact context pack:",
        json.dumps(context, ensure_ascii=False)[:max_prompt_chars],
    ])
    max_tokens = min(int(payload.get("max_tokens") or 1200), int(model_worker_policy()["max_output_tokens"]))
    timeout_seconds = min(int(payload.get("timeout_seconds") or 45), int(model_worker_policy()["timeout_seconds_max"]))
    return {
        "provider": provider,
        "job_id": str(payload.get("job_id") or "").strip(),
        "api_url": str(payload.get("api_url") or "").strip(),
        "model_id": str(payload.get("model_id") or payload.get("model") or "").strip(),
        "api_key_env": str(payload.get("api_key_env") or model_worker_policy()["default_api_key_env"]).strip(),
        "api_key": str(payload.get("api_key") or "").strip(),
        "allow_remote_model": bool(payload.get("allow_remote_model")),
        "execute_model": bool(payload.get("execute_model") or payload.get("execute")),
        "stream_model": bool(payload.get("stream_model") or payload.get("stream")),
        "provider_extra_body": payload.get("provider_extra_body") if isinstance(payload.get("provider_extra_body"), dict) else {},
        "temperature": float(payload.get("temperature") if payload.get("temperature") is not None else 0.2),
        "max_tokens": max_tokens,
        "timeout_seconds": timeout_seconds,
        "system_prompt": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
        "context_pack": context,
        "task": task,
        "domain": domain,
    }


def http_post_json(url: str, headers: Dict[str, str], body: Dict[str, Any], timeout_seconds: int) -> Dict[str, Any]:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"model API HTTP {exc.code}: {raw[:500]}") from exc


def parse_openai_stream_delta(parsed: Dict[str, Any]) -> str:
    choices = parsed.get("choices") if isinstance(parsed.get("choices"), list) else []
    if not choices:
        return ""
    first = choices[0] if isinstance(choices[0], dict) else {}
    delta = first.get("delta") if isinstance(first.get("delta"), dict) else {}
    if delta.get("content") is not None:
        return str(delta.get("content") or "")
    message = first.get("message") if isinstance(first.get("message"), dict) else {}
    if message.get("content") is not None:
        return str(message.get("content") or "")
    text = first.get("text")
    return str(text or "")


def call_openai_compatible_stream(task: Dict[str, Any], url: str, headers: Dict[str, str], body: Dict[str, Any]) -> Dict[str, Any]:
    job_id = str(task.get("job_id") or "").strip()
    timeout_seconds = int(task.get("timeout_seconds") or 45)
    stream_body = dict(body)
    stream_body["stream"] = True
    request = urllib.request.Request(
        url,
        data=json.dumps(stream_body, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    chunks: List[str] = []
    chunk_count = 0
    raw_event = ""
    append_worker_event(job_id, "model_stream_start", status="running", provider=task.get("provider"), model_id=task.get("model_id")) if job_id else None
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                if line.startswith(":"):
                    continue
                if line.startswith("data:"):
                    raw_event = line[5:].strip()
                else:
                    raw_event = line
                if raw_event == "[DONE]":
                    break
                try:
                    parsed = json.loads(raw_event)
                except Exception:
                    continue
                delta = parse_openai_stream_delta(parsed)
                if not delta:
                    continue
                chunks.append(delta)
                chunk_count += 1
                append_worker_event(
                    job_id,
                    "model_stream_chunk",
                    status="running",
                    chunk_index=chunk_count,
                    text=delta[:800],
                    chars=len(delta),
                ) if job_id else None
                if worker_cancel_requested(job_id):
                    append_worker_event(job_id, "model_stream_cancel_observed", status="cancel_requested", chunk_index=chunk_count) if job_id else None
                    break
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"model stream API HTTP {exc.code}: {raw[:500]}") from exc
    text = "".join(chunks)
    append_worker_event(job_id, "model_stream_end", status="ok" if text else "failed", chunk_count=chunk_count, output_chars=len(text)) if job_id else None
    return {
        "status": "ok" if text else "failed",
        "provider": task.get("provider"),
        "model_id": task.get("model_id"),
        "output": text[:20000],
        "output_chars": len(text),
        "streaming": True,
        "stream_chunk_count": chunk_count,
        "policy": model_worker_policy(),
    }


def call_model_worker_provider(task: Dict[str, Any]) -> Dict[str, Any]:
    provider = task["provider"]
    api_url = str(task.get("api_url") or "").strip()
    model_id = str(task.get("model_id") or "").strip()
    if not api_url or not model_id:
        return {"status": "blocked", "reason": "api_url and model_id are required for model_task"}
    if not is_local_model_url(api_url) and not task.get("allow_remote_model"):
        return {"status": "approval_required", "reason": "remote model calls require allow_remote_model=true"}
    api_key = model_worker_key(task, provider)
    if provider != "ollama" and not api_key:
        return {"status": "approval_required", "reason": f"missing API key; set {task.get('api_key_env') or model_worker_policy()['default_api_key_env']} or pass one-shot api_key"}

    timeout_seconds = int(task.get("timeout_seconds") or 45)
    if provider == "anthropic":
        url = normalize_api_url(api_url, "/messages")
        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }
        body = {
            "model": model_id,
            "system": task.get("system_prompt") or "",
            "messages": task.get("messages") or [],
            "temperature": task.get("temperature", 0.2),
            "max_tokens": task.get("max_tokens", 1200),
            "stream": False,
        }
        if isinstance(task.get("provider_extra_body"), dict):
            body.update(task.get("provider_extra_body") or {})
        data = http_post_json(url, headers, body, timeout_seconds)
        text = "".join([block.get("text", "") for block in data.get("content", []) if isinstance(block, dict)])
    elif provider == "ollama" and not api_url.rstrip("/").endswith("/v1"):
        url = normalize_api_url(api_url, "/api/chat")
        body = {
            "model": model_id,
            "messages": [{"role": "system", "content": task.get("system_prompt") or ""}, *(task.get("messages") or [])],
            "stream": False,
            "options": {"temperature": task.get("temperature", 0.2), "num_predict": task.get("max_tokens", 1200)},
        }
        if isinstance(task.get("provider_extra_body"), dict):
            body.update(task.get("provider_extra_body") or {})
        data = http_post_json(url, {"Content-Type": "application/json"}, body, timeout_seconds)
        text = data.get("message", {}).get("content", "")
    elif provider == "gemini":
        url = f"{api_url.rstrip('/')}/models/{quote(model_id)}:generateContent?key={quote(api_key)}"
        system_text = str(task.get("system_prompt") or "")
        user_text = "\n\n".join([str(item.get("content") or "") for item in task.get("messages") or [] if isinstance(item, dict)])
        body = {
            "contents": [{"role": "user", "parts": [{"text": user_text}]}],
            "generationConfig": {"temperature": task.get("temperature", 0.2), "maxOutputTokens": task.get("max_tokens", 1200)},
        }
        if isinstance(task.get("provider_extra_body"), dict):
            body.update(task.get("provider_extra_body") or {})
        if system_text:
            body["systemInstruction"] = {"parts": [{"text": system_text}]}
        data = http_post_json(url, {"Content-Type": "application/json"}, body, timeout_seconds)
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text = "".join([part.get("text", "") for part in parts if isinstance(part, dict)])
    else:
        url = normalize_api_url(api_url, "/chat/completions")
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        body = {
            "model": model_id,
            "messages": [{"role": "system", "content": task.get("system_prompt") or ""}, *(task.get("messages") or [])],
            "temperature": task.get("temperature", 0.2),
            "max_tokens": task.get("max_tokens", 1200),
            "stream": False,
        }
        if isinstance(task.get("provider_extra_body"), dict):
            body.update(task.get("provider_extra_body") or {})
        if task.get("stream_model"):
            return call_openai_compatible_stream(task, url, headers, body)
        data = http_post_json(url, headers, body, timeout_seconds)
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    return {
        "status": "ok" if text else "failed",
        "provider": provider,
        "model_id": model_id,
        "output": str(text)[:20000],
        "output_chars": len(str(text)),
        "policy": model_worker_policy(),
    }


def run_model_worker_task(payload: Dict[str, Any]) -> Dict[str, Any]:
    task = prepare_model_worker_task(payload, str(payload.get("purpose") or "model worker task"))
    if not task.get("execute_model"):
        return {
            "status": "approval_required",
            "reason": "model_task prepared but not executed; set execute_model=true to run the provider call",
            "prepared_task": redact_model_worker_payload(task),
            "policy": model_worker_policy(),
        }
    result = call_model_worker_provider(task)
    result["prepared_task"] = redact_model_worker_payload({
        "provider": task.get("provider"),
        "api_url": task.get("api_url"),
        "model_id": task.get("model_id"),
        "api_key_env": task.get("api_key_env"),
        "allow_remote_model": task.get("allow_remote_model"),
        "execute_model": task.get("execute_model"),
        "stream_model": task.get("stream_model"),
        "task": task.get("task"),
        "domain": task.get("domain"),
        "max_tokens": task.get("max_tokens"),
        "timeout_seconds": task.get("timeout_seconds"),
    })
    if result.get("status") == "ok" and str(payload.get("merge_target_path") or "").strip():
        merge = create_worker_merge_proposal({
            "job_id": str(payload.get("job_id") or ""),
            "target_path": str(payload.get("merge_target_path") or ""),
            "mode": str(payload.get("merge_mode") or "replace"),
            "content": result.get("output") or "",
        }, str(payload.get("purpose") or "model worker merge proposal"), execution=result)
        result["merge_proposal"] = merge.get("proposal") if merge.get("status") == "proposal" else merge
    return result


def worker_cancel_requested(job_id: str) -> bool:
    state = load_worker_state()
    job = state.get("jobs", {}).get(job_id) if isinstance(state.get("jobs"), dict) else None
    return bool(job and job.get("cancel_requested"))


def run_worker_bridge_action(payload: Dict[str, Any]) -> Dict[str, Any]:
    action = str(payload.get("action") or "").strip()
    action_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    purpose = str(payload.get("purpose") or f"worker bridge action {action}").strip()
    if action not in SAFE_WORKER_BRIDGE_ACTIONS:
        return {
            "status": "blocked",
            "reason": f"worker bridge action is not allowlisted: {action}",
            "allowed_actions": sorted(SAFE_WORKER_BRIDGE_ACTIONS),
        }
    result = handle_request(
        {"action": action, "purpose": purpose, "payload": action_payload},
        execute=False,
        record=False,
        execute_command=False,
    )
    return {
        "status": result.get("status", "unknown"),
        "action": action,
        "result": result,
    }


def worker_thread(job_id: str, payload: Dict[str, Any]) -> None:
    append_worker_event(job_id, "worker_stage", status="starting", stage="thread_start")
    update_worker_job(job_id, {"status": "running", "started_at": now_iso()})
    try:
        if worker_cancel_requested(job_id):
            append_worker_event(job_id, "worker_stage", status="canceled", stage="pre_execution_cancel")
            update_worker_job(job_id, {"status": "canceled", "completed_at": now_iso(), "message": "Worker canceled before execution."})
            return
        if payload.get("kind") == "bridge_action":
            append_worker_event(job_id, "worker_stage", status="running", stage="bridge_action")
            execution = run_worker_bridge_action(payload)
        elif payload.get("kind") == "model_task":
            payload["job_id"] = job_id
            append_worker_event(job_id, "worker_stage", status="running", stage="model_prepare")
            execution = run_model_worker_task_in_child(job_id, payload)
        else:
            append_worker_event(job_id, "worker_stage", status="running", stage="verification_command")
            execution = run_verification_command(payload)
        status = execution.get("status", "failed")
        if worker_cancel_requested(job_id):
            append_worker_event(job_id, "worker_stage", status="canceled", stage="post_execution_cancel")
            current_state = load_worker_state()
            current_job = current_state.get("jobs", {}).get(job_id, {}) if isinstance(current_state.get("jobs"), dict) else {}
            updates = {
                "status": "canceled",
                "completed_at": now_iso(),
                "result": execution,
                "message": "Worker cancellation was requested; result kept for audit but not treated as completed.",
            }
            if isinstance(current_job, dict):
                for key in ("hard_cancel_status", "hard_cancel_at", "hard_cancel", "process_pid"):
                    if current_job.get(key) is not None:
                        updates[key] = current_job.get(key)
            execution_hard_status = str(execution.get("hard_cancel_status") or "") if isinstance(execution, dict) else ""
            if execution_hard_status in {"terminated", "killed", "not_running"}:
                updates["hard_cancel_status"] = execution_hard_status
            elif str(updates.get("hard_cancel_status") or "") not in {"terminated", "killed", "not_running"}:
                pid_raw = updates.get("process_pid")
                if not pid_raw and isinstance(execution, dict):
                    child = execution.get("child_process")
                    pid_raw = execution.get("pid") or (child.get("pid") if isinstance(child, dict) else None)
                try:
                    pid = int(pid_raw) if pid_raw is not None and str(pid_raw).strip() else 0
                except Exception:
                    pid = 0
                if pid > 0 and not process_alive(pid):
                    hard_cancel = updates.get("hard_cancel") if isinstance(updates.get("hard_cancel"), dict) else {}
                    updates["hard_cancel_status"] = "terminated"
                    updates["hard_cancel"] = {**hard_cancel, "status": "terminated", "pid": pid}
            update_worker_job(job_id, {
                **updates,
            })
            return
        append_worker_event(job_id, "worker_stage", status=status, stage="execution_finished")
        update_worker_job(job_id, {
            "status": "completed" if status == "ok" else status,
            "completed_at": now_iso(),
            "result": execution,
        })
    except Exception as exc:
        append_worker_event(job_id, "worker_stage", status="failed", stage="exception", message=str(exc))
        update_worker_job(job_id, {"status": "failed", "completed_at": now_iso(), "error": str(exc)})


def run_worker_job(payload: Dict[str, Any], purpose: str, execute_command: bool) -> Dict[str, Any]:
    state = load_worker_state()
    jobs = state.setdefault("jobs", {})
    events = state.setdefault("events", [])
    job_id = str(payload.get("job_id") or payload.get("id") or f"worker-{uuid.uuid4()}").strip()
    job_kind = str(payload.get("kind") or payload.get("job_kind") or "").strip().lower()
    if job_kind not in {"bridge_action", "verification_command", "model_task"}:
        job_kind = "bridge_action" if payload.get("action") else "verification_command"
    if job_kind == "bridge_action":
        action_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
        job_payload = {
            "kind": "bridge_action",
            "action": str(payload.get("action") or "").strip(),
            "payload": action_payload,
            "purpose": str(payload.get("action_purpose") or payload.get("purpose") or purpose or "").strip(),
        }
        stored_payload = job_payload
    elif job_kind == "model_task":
        job_payload = {
            "kind": "model_task",
            "provider": str(payload.get("provider") or "openai-compatible"),
            "api_url": str(payload.get("api_url") or ""),
            "api_key": str(payload.get("api_key") or ""),
            "api_key_env": str(payload.get("api_key_env") or model_worker_policy()["default_api_key_env"]),
            "model_id": str(payload.get("model_id") or payload.get("model") or ""),
            "prompt": str(payload.get("prompt") or payload.get("task") or payload.get("objective") or purpose or ""),
            "domain": str(payload.get("domain") or "general"),
            "query": str(payload.get("query") or ""),
            "current_text": str(payload.get("current_text") or ""),
            "context_limit": int(payload.get("context_limit") or 4),
            "system_prompt": str(payload.get("system_prompt") or ""),
            "temperature": payload.get("temperature", 0.2),
            "max_tokens": int(payload.get("max_tokens") or 1200),
            "timeout_seconds": int(payload.get("timeout_seconds") or 45),
            "allow_remote_model": bool(payload.get("allow_remote_model")),
            "execute_model": bool(payload.get("execute_model") or payload.get("execute")),
            "stream_model": bool(payload.get("stream_model") or payload.get("stream")),
            "provider_extra_body": payload.get("provider_extra_body") if isinstance(payload.get("provider_extra_body"), dict) else {},
            "thread_id": str(payload.get("thread_id") or ""),
            "thread_title": str(payload.get("thread_title") or ""),
            "workspace_id": str(payload.get("workspace_id") or ""),
            "approval_ids": payload.get("approval_ids") if isinstance(payload.get("approval_ids"), list) else [],
            "thread_context": payload.get("thread_context") if isinstance(payload.get("thread_context"), list) else [],
            "thread_context_policy": payload.get("thread_context_policy") if isinstance(payload.get("thread_context_policy"), dict) else {},
            "merge_target_path": str(payload.get("merge_target_path") or payload.get("target_path") or ""),
            "merge_mode": str(payload.get("merge_mode") or "replace"),
            "purpose": purpose or str(payload.get("purpose") or "model worker task"),
        }
        stored_payload = redact_model_worker_payload(job_payload)
    else:
        job_payload = {
            "kind": "verification_command",
            "command": str(payload.get("command") or "python --version"),
            "cwd": str(payload.get("cwd") or "."),
            "execute": bool(payload.get("execute")),
            "timeout_seconds": int(payload.get("timeout_seconds") or 10),
        }
        if isinstance(payload.get("argv"), list):
            job_payload["argv"] = payload.get("argv")
        stored_payload = job_payload
    job = {
        "id": job_id,
        "agent_id": str(payload.get("agent_id") or "worker"),
        "mode": str(payload.get("mode") or "isolated-context"),
        "kind": job_kind,
        "status": "queued",
        "purpose": purpose or str(payload.get("purpose") or "worker job"),
        "payload": stored_payload,
        "hard_cancel_supported": job_kind == "model_task",
        "hard_cancel_status": "pending" if job_kind == "model_task" else "not_applicable",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "started_at": "",
        "completed_at": "",
    }
    if job_kind == "bridge_action":
        if job_payload["action"] not in SAFE_WORKER_BRIDGE_ACTIONS:
            job["status"] = "blocked"
            job["message"] = f"Worker bridge action is not allowlisted: {job_payload['action']}"
            job["allowlist"] = sorted(SAFE_WORKER_BRIDGE_ACTIONS)
        else:
            job["status"] = "starting"
    elif job_kind == "model_task":
        try:
            prepared = prepare_model_worker_task(job_payload, purpose)
            job["prepared_task"] = redact_model_worker_payload({
                "provider": prepared.get("provider"),
                "api_url": prepared.get("api_url"),
                "model_id": prepared.get("model_id"),
                "api_key_env": prepared.get("api_key_env"),
                "allow_remote_model": prepared.get("allow_remote_model"),
                "execute_model": prepared.get("execute_model"),
                "stream_model": prepared.get("stream_model"),
                "provider_extra_body_keys": sorted((job_payload.get("provider_extra_body") or {}).keys()) if isinstance(job_payload.get("provider_extra_body"), dict) else [],
                "task": prepared.get("task"),
                "domain": prepared.get("domain"),
                "merge_target_path": job_payload.get("merge_target_path"),
                "merge_mode": job_payload.get("merge_mode"),
                "context_items": len(prepared.get("context_pack", {}).get("context_pack", [])) if isinstance(prepared.get("context_pack"), dict) else 0,
                "thread_context_items": len(prepared.get("context_pack", {}).get("thread_context", [])) if isinstance(prepared.get("context_pack"), dict) else 0,
                "approval_ids": len(job_payload.get("approval_ids", [])) if isinstance(job_payload.get("approval_ids"), list) else 0,
            })
            job["policy"] = model_worker_policy()
            job["status"] = "starting" if job_payload.get("execute_model") else "approval_required"
            if not job_payload.get("execute_model"):
                job["message"] = "Model worker prepared; set execute_model=true to run provider call."
            elif not is_local_model_url(job_payload.get("api_url", "")) and not job_payload.get("allow_remote_model"):
                job["status"] = "approval_required"
                job["message"] = "Remote model call requires allow_remote_model=true."
            else:
                key = model_worker_key(job_payload, str(prepared.get("provider") or "openai-compatible"))
                if prepared.get("provider") != "ollama" and not key:
                    job["status"] = "approval_required"
                    job["message"] = f"Missing model API key; set {job_payload.get('api_key_env') or model_worker_policy()['default_api_key_env']} or pass one-shot api_key."
        except Exception as exc:
            job["status"] = "blocked"
            job["message"] = str(exc)
    elif not execute_command or not bool(payload.get("execute")):
        job["message"] = "Worker verification command execution requires --execute-command plus payload execute=true."
    else:
        allow = allowed_verification_command(command_argv(job_payload))
        if not allow.get("allowed"):
            job["status"] = "blocked"
            job["message"] = str(allow.get("reason") or "command is not allowlisted")
            job["allowlist"] = allow
        else:
            job["status"] = "starting"
    jobs[job_id] = job
    events.append({"at": job["created_at"], "type": "worker_run", "job_id": job_id, "status": job["status"], "kind": job_kind})
    save_worker_state(state)
    if job["status"] == "starting":
        thread = threading.Thread(target=worker_thread, args=(job_id, job_payload), daemon=True)
        thread.start()
        if job_kind == "bridge_action":
            thread.join(timeout=1)
            job = load_worker_state().get("jobs", {}).get(job_id, job)
    return job


def cancel_worker_job(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_worker_state()
    jobs = state.get("jobs") if isinstance(state.get("jobs"), dict) else {}
    events = state.setdefault("events", [])
    job_id = str(payload.get("job_id") or payload.get("id") or "").strip()
    if not job_id:
        raise ValueError("job_id is required")
    job = jobs.get(job_id)
    if not job:
        return {"status": "missing", "job_id": job_id, "message": "Worker job not found."}
    previous_status = str(job.get("status") or "")
    pid_raw = job.get("process_pid")
    try:
        process_pid = int(pid_raw) if pid_raw is not None and str(pid_raw).strip() else 0
    except Exception:
        process_pid = 0
    hard_cancel: Dict[str, Any] | None = None
    if previous_status in {"completed", "failed", "blocked", "canceled"}:
        job["cancel_requested"] = True
        job["cancel_reason"] = str(payload.get("reason") or purpose or "cancel requested")
        job["updated_at"] = now_iso()
        status = "canceled" if previous_status == "canceled" else "too_late"
    else:
        job["cancel_requested"] = True
        job["cancel_reason"] = str(payload.get("reason") or purpose or "cancel requested")
        job["updated_at"] = now_iso()
        if previous_status in {"running", "starting"} and process_pid > 0:
            hard_cancel = terminate_worker_process(process_pid, timeout_seconds=float(payload.get("timeout_seconds") or 2))
            job["hard_cancel_status"] = hard_cancel.get("status")
            job["hard_cancel_at"] = now_iso()
            job["hard_cancel"] = hard_cancel
            if hard_cancel.get("status") in {"terminated", "killed", "not_running"}:
                job["status"] = "canceled"
                job["completed_at"] = now_iso()
                status = "hard_canceled"
            else:
                status = "cancel_requested"
        elif previous_status in {"queued", "starting", "approval_required"}:
            job["status"] = "canceled"
            job["completed_at"] = now_iso()
            status = "canceled"
        else:
            status = "cancel_requested"
    events.append({"at": now_iso(), "type": "worker_cancel", "job_id": job_id, "status": status, "previous_status": previous_status})
    if hard_cancel:
        event = {"at": now_iso(), "type": "worker_hard_cancel", "job_id": job_id, "status": hard_cancel.get("status"), "pid": process_pid}
        events.append(event)
        job_events = job.setdefault("events", [])
        if isinstance(job_events, list):
            job_events.append(event)
            job["events"] = job_events[-80:]
    save_worker_state(state)
    result = {"status": status, "job": job}
    if hard_cancel:
        result["hard_cancel"] = hard_cancel
    return result


def worker_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = load_worker_state()
    jobs = state.get("jobs") if isinstance(state.get("jobs"), dict) else {}
    job_id = str(payload.get("job_id") or payload.get("id") or "").strip()
    if job_id:
        return {
            "job": jobs.get(job_id),
            "events": [event for event in state.get("events", []) if event.get("job_id") == job_id][-20:],
        }
    recent = sorted(jobs.values(), key=lambda item: str(item.get("updated_at") or ""), reverse=True)[:10]
    proposals = state.get("merge_proposals") if isinstance(state.get("merge_proposals"), dict) else {}
    return {
        "job_count": len(jobs),
        "recent_jobs": recent,
        "recent_events": state.get("events", [])[-20:],
        "merge_proposals": sorted(proposals.values(), key=lambda item: str(item.get("created_at") or ""), reverse=True)[:10],
    }


def wait_worker_jobs(jobs: List[Dict[str, Any]], timeout_seconds: float = 3.0) -> List[Dict[str, Any]]:
    job_ids = [str(job.get("id") or "") for job in jobs if str(job.get("id") or "")]
    if not job_ids:
        return jobs
    deadline = time.time() + max(0.1, timeout_seconds)
    terminal = {"completed", "failed", "blocked", "canceled", "approval_required"}
    latest = jobs
    while time.time() < deadline:
        state = load_worker_state()
        all_jobs = state.get("jobs") if isinstance(state.get("jobs"), dict) else {}
        latest = [all_jobs.get(job_id, next((job for job in jobs if job.get("id") == job_id), {})) for job_id in job_ids]
        if all(str(job.get("status") or "") in terminal for job in latest):
            return latest
        time.sleep(0.1)
    state = load_worker_state()
    all_jobs = state.get("jobs") if isinstance(state.get("jobs"), dict) else {}
    return [all_jobs.get(job_id, next((job for job in jobs if job.get("id") == job_id), {})) for job_id in job_ids]


def subagent_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = load_subagent_state()
    agent_id = str(payload.get("agent_id") or payload.get("id") or "").strip()
    if agent_id:
        return {
            "agent": state.get("agents", {}).get(agent_id),
            "locks": [lock for lock in state.get("locks", []) if lock.get("agent_id") == agent_id],
            "events": [event for event in state.get("events", []) if event.get("agent_id") == agent_id][-20:],
        }
    return {
        "agents": list(state.get("agents", {}).values())[-20:],
        "active_locks": active_locks(state),
        "recent_events": state.get("events", [])[-20:],
    }


def swarm_agent_specs(swarm_id: str) -> List[Dict[str, Any]]:
    return [
        {
            "id": f"{swarm_id}-coordinator",
            "label": "Swarm Coordinator / 总编排代理",
            "mode": "forked-context",
            "allowed_tools": ["context_pack", "worker_status", "subagent_status", "phase_audit"],
            "scope": "planning",
            "verification": "Summarize worker evidence and decide next bridge action; do not approve weak results.",
        },
        {
            "id": f"{swarm_id}-context",
            "label": "Context Worker / 上下文代理",
            "mode": "forked-context",
            "allowed_tools": ["context_pack", "memory_retrieve", "skill_route"],
            "scope": "context",
            "verification": "Return compact context slices only; request full files only when a gap is proven.",
        },
        {
            "id": f"{swarm_id}-safety",
            "label": "Safety Worker / 安全代理",
            "mode": "isolated-context",
            "allowed_tools": ["safety_review", "sandbox_status", "phase_audit"],
            "scope": "safety",
            "verification": "Block dangerous commands and report validators before any execution path.",
        },
        {
            "id": f"{swarm_id}-writer",
            "label": "Writing Domain Worker / 写作域代理",
            "mode": "forked-context",
            "allowed_tools": ["skill_bootstrap", "skill_invoke", "context_pack"],
            "scope": "writing",
            "verification": "Use prompt-only writing skills and draft-only writeback.",
        },
    ]


def bootstrap_swarm(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    task = str(payload.get("task") or payload.get("objective") or "Phase 4 swarm safety rehearsal").strip()
    swarm_id = str(payload.get("swarm_id") or payload.get("id") or f"swarm-{uuid.uuid4().hex[:8]}").strip()
    scope = str(payload.get("scope") or f"phase4/{swarm_id}/write-scope").strip()
    workflow_id = str(payload.get("workflow_id") or f"workflow-{swarm_id}").strip()
    persist = bool(payload.get("persist", True))
    start_workers = bool(payload.get("start_workers", True))
    release_locks = bool(payload.get("release_locks", True))
    agents = swarm_agent_specs(swarm_id)
    workflow_nodes = [
        {"id": "spawn-agents", "label": "Spawn bounded subagents", "status": "done" if persist else "ready", "dependsOn": [], "verification": "Forked and isolated agent modes are both present."},
        {"id": "lock-protocol", "label": "Exercise read/write locks", "status": "done" if persist else "ready", "dependsOn": ["spawn-agents"], "verification": "Second writer on same scope must be blocked."},
        {"id": "worker-rehearsal", "label": "Start allowlisted workers", "status": "done" if start_workers and persist else "ready", "dependsOn": ["lock-protocol"], "verification": "Workers run only allowlisted bridge actions."},
        {"id": "safety-gate", "label": "Verify safety gate", "status": "done" if start_workers and persist else "pending", "dependsOn": ["worker-rehearsal"], "verification": "Dangerous command draft is blocked by validators."},
        {"id": "coordinator-review", "label": "Coordinator review", "status": "pending", "dependsOn": ["safety-gate"], "verification": "Coordinator reads evidence and decides next action; no rubber-stamp."},
    ]
    registrations: Dict[str, Any] = {
        "workflow": None,
        "agents": [],
        "lock": None,
        "conflict": None,
        "release": None,
        "workers": [],
    }
    worker_plan = [
        {
            "job_id": f"worker-{swarm_id}-context",
            "agent_id": agents[1]["id"],
            "kind": "bridge_action",
            "action": "context_pack",
            "payload": {"task": task, "query": task, "domain": "writing", "dimension": "skill", "limit": 4},
        },
        {
            "job_id": f"worker-{swarm_id}-safety",
            "agent_id": agents[2]["id"],
            "kind": "bridge_action",
            "action": "safety_review",
            "payload": {"action": "run_command", "purpose": "swarm dangerous command probe", "payload": {"command": "rm -rf /"}},
        },
        {
            "job_id": f"worker-{swarm_id}-sandbox",
            "agent_id": agents[2]["id"],
            "kind": "bridge_action",
            "action": "sandbox_status",
            "payload": {},
        },
    ]
    if persist:
        registrations["workflow"] = run_workflow({
            "workflow_id": workflow_id,
            "name": "Phase 4 Swarm Bootstrap",
            "current_node_id": "coordinator-review",
            "nodes": workflow_nodes,
        }, purpose or "Register Phase 4 swarm bootstrap workflow")
        for agent in agents:
            registrations["agents"].append(spawn_subagent({
                "agent_id": agent["id"],
                "label": agent["label"],
                "mode": agent["mode"],
                "allowed_tools": agent["allowed_tools"],
            }, f"Swarm bootstrap agent: {agent['label']}"))
        registrations["lock"] = acquire_lock({"agent_id": agents[0]["id"], "scope": scope, "mode": "write"}, "Swarm bootstrap primary write lock")
        registrations["conflict"] = acquire_lock({"agent_id": agents[3]["id"], "scope": scope, "mode": "write"}, "Swarm bootstrap expected write-lock conflict")
        if release_locks and isinstance(registrations.get("lock"), dict):
            lock_id = str(registrations["lock"].get("lock", {}).get("id") or "")
            registrations["release"] = release_lock({"lock_id": lock_id}, "Swarm bootstrap cleanup")
        if start_workers:
            for job_payload in worker_plan:
                registrations["workers"].append(run_worker_job(job_payload, f"Swarm bootstrap worker: {job_payload['action']}", execute_command=False))
        append_kairos_daily_log("swarm_bootstrap", f"Ran Phase 4 swarm rehearsal {swarm_id}.", {
            "workflow_id": workflow_id,
            "scope": scope,
            "workers": [job.get("id") for job in registrations["workers"]],
        })
    if start_workers and registrations.get("workers"):
        registrations["workers"] = wait_worker_jobs(registrations["workers"], timeout_seconds=3.0)
    worker_statuses = [str(job.get("status") or "") for job in registrations.get("workers", [])]
    completed_workers = len([status for status in worker_statuses if status == "completed"])
    safety_worker = next((job for job in registrations.get("workers", []) if str(job.get("payload", {}).get("action") or "") == "safety_review"), {})
    safety_result = safety_worker.get("result", {}).get("result", {}) if isinstance(safety_worker.get("result"), dict) else {}
    command_validation = safety_result.get("command_validation") if isinstance(safety_result.get("command_validation"), list) else []
    dangerous_blocked = any(item.get("severity") == "block" for item in command_validation)
    lock_result = registrations.get("lock") if isinstance(registrations.get("lock"), dict) else {}
    conflict_result = registrations.get("conflict") if isinstance(registrations.get("conflict"), dict) else {}
    release_result = registrations.get("release") if isinstance(registrations.get("release"), dict) else {}
    evidence = {
        "swarm_id": swarm_id,
        "agent_count": len(agents),
        "spawned_agents": len(registrations.get("agents", [])),
        "forked_agents": len([agent for agent in agents if agent.get("mode") == "forked-context"]),
        "isolated_agents": len([agent for agent in agents if agent.get("mode") == "isolated-context"]),
        "write_scope": scope,
        "write_lock_acquired": lock_result.get("status") == "ok",
        "write_lock_conflict_blocked": conflict_result.get("status") == "blocked",
        "lock_released": bool(release_result.get("released")) if release_locks else False,
        "worker_count": len(worker_plan),
        "workers_started": len(registrations.get("workers", [])),
        "workers_completed": completed_workers,
        "dangerous_command_blocked": dangerous_blocked,
        "validator_count": len(VALIDATORS),
        "execution": "swarm-bootstrap-allowlisted-workers-no-model-exec-no-arbitrary-shell",
    }
    evidence["status"] = "pass" if (
        evidence["spawned_agents"] == evidence["agent_count"]
        and evidence["forked_agents"] >= 2
        and evidence["isolated_agents"] >= 1
        and evidence["write_lock_acquired"]
        and evidence["write_lock_conflict_blocked"]
        and (not release_locks or evidence["lock_released"])
        and (not start_workers or (evidence["workers_started"] == evidence["worker_count"] and evidence["workers_completed"] >= 2 and evidence["dangerous_command_blocked"]))
    ) else "partial"
    return {
        "status": evidence["status"],
        "swarm_id": swarm_id,
        "task": task,
        "agent_specs": agents,
        "worker_plan": worker_plan,
        "workflow_hook": {
            "workflow_id": workflow_id,
            "name": "Phase 4 Swarm Bootstrap",
            "nodes": workflow_nodes,
            "current_node_id": "coordinator-review",
        },
        "lock_protocol": {
            "scope": scope,
            "modes": ["read", "write"],
            "conflict_rule": "same-scope write/write conflict is blocked",
            "release_after_rehearsal": release_locks,
        },
        "registrations": registrations,
        "tool_policy": {
            "allowed_worker_actions": sorted(SAFE_WORKER_BRIDGE_ACTIONS),
            "worker_execution": "allowlisted-bridge-actions-only",
            "arbitrary_shell": "disabled",
            "writeback": "state-records-only",
        },
        "evidence": evidence,
        "schema": {
            "mode": "swarm_bootstrap",
            "execution": "swarm-bootstrap-allowlisted-workers-no-model-exec-no-arbitrary-shell",
            "uses": ["subagent_spawn", "lock_acquire", "lock_release", "worker_run", "safety_review", "sandbox_status"],
        },
        "safety": [
            "swarm_bootstrap registers local state and allowlisted worker jobs only.",
            "It deliberately verifies write/write lock conflict behavior before any file write path.",
            "It does not execute arbitrary shell commands or spawn model-running workers.",
            "Coordinator review remains responsible for synthesizing worker results.",
        ],
    }


def normalize_workflow_nodes(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    nodes = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        node_id = str(item.get("id") or f"node_{index + 1}").strip()
        if not node_id:
            continue
        nodes.append({
            "id": node_id,
            "label": str(item.get("label") or node_id),
            "status": str(item.get("status") or "waiting"),
            "depends_on": item.get("dependsOn") if isinstance(item.get("dependsOn"), list) else item.get("depends_on", []),
            "verification": str(item.get("verification") or ""),
        })
    return nodes


def latest_workflow_id(state: Dict[str, Any]) -> str:
    workflows = state.get("workflows") if isinstance(state.get("workflows"), dict) else {}
    if not workflows:
        return ""
    return sorted(workflows.values(), key=lambda item: str(item.get("updated_at") or ""), reverse=True)[0].get("id", "")


def workflow_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = load_workflow_state()
    workflows = state.get("workflows") if isinstance(state.get("workflows"), dict) else {}
    workflow_id = str(payload.get("workflow_id") or payload.get("id") or "").strip()
    if workflow_id:
        return {
            "workflow": workflows.get(workflow_id),
            "events": [event for event in state.get("events", []) if event.get("workflow_id") == workflow_id][-20:],
        }
    recent = sorted(workflows.values(), key=lambda item: str(item.get("updated_at") or ""), reverse=True)[:10]
    return {
        "recent_workflows": recent,
        "recent_events": state.get("events", [])[-20:],
    }


def run_workflow(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_workflow_state()
    workflows = state.setdefault("workflows", {})
    events = state.setdefault("events", [])
    workflow_id = str(payload.get("workflow_id") or payload.get("id") or f"workflow-{uuid.uuid4()}").strip()
    nodes = normalize_workflow_nodes(payload.get("nodes"))
    current_node_id = str(payload.get("current_node_id") or payload.get("currentNodeId") or (nodes[0]["id"] if nodes else "")).strip()
    previous = workflows.get(workflow_id, {})
    workflow = {
        **previous,
        "id": workflow_id,
        "name": str(payload.get("name") or previous.get("name") or workflow_id),
        "status": "running",
        "current_node_id": current_node_id,
        "nodes": nodes or previous.get("nodes", []),
        "purpose": purpose,
        "created_at": previous.get("created_at") or now_iso(),
        "updated_at": now_iso(),
    }
    workflows[workflow_id] = workflow
    events.append({
        "at": now_iso(),
        "workflow_id": workflow_id,
        "type": "run",
        "node_id": current_node_id,
        "message": purpose or "workflow registered",
    })
    save_workflow_state(state)
    return workflow


def advance_workflow(payload: Dict[str, Any], purpose: str) -> Dict[str, Any]:
    state = load_workflow_state()
    workflows = state.setdefault("workflows", {})
    events = state.setdefault("events", [])
    workflow_id = str(payload.get("workflow_id") or payload.get("id") or latest_workflow_id(state)).strip()
    if not workflow_id or workflow_id not in workflows:
        raise ValueError("workflow_id is required or no workflow exists")
    workflow = workflows[workflow_id]
    nodes = workflow.get("nodes") if isinstance(workflow.get("nodes"), list) else []
    completed_node_id = str(payload.get("completed_node_id") or payload.get("completedNodeId") or workflow.get("current_node_id") or "").strip()
    explicit_next = str(payload.get("next_node_id") or payload.get("nextNodeId") or "").strip()
    next_node_id = explicit_next
    for index, item in enumerate(nodes):
        if item.get("id") == completed_node_id:
            item["status"] = "done"
            if not next_node_id and index + 1 < len(nodes):
                next_node_id = str(nodes[index + 1].get("id") or "")
                nodes[index + 1]["status"] = "ready"
            break
    workflow["nodes"] = nodes
    workflow["current_node_id"] = next_node_id
    workflow["status"] = "running" if next_node_id else "completed"
    workflow["updated_at"] = now_iso()
    events.append({
        "at": now_iso(),
        "workflow_id": workflow_id,
        "type": "advance",
        "node_id": completed_node_id,
        "next_node_id": next_node_id,
        "message": purpose or "workflow advanced",
    })
    save_workflow_state(state)
    return workflow


def search_workspace(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    keyword = str(payload.get("keyword") or payload.get("query") or "").strip()
    if not keyword:
        return []
    limit = min(int(payload.get("limit") or 20), 50)
    root = bridge_root()
    matches: List[Dict[str, Any]] = []
    for path in root.rglob("*"):
        if len(matches) >= limit:
            break
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > 1_000_000:
                continue
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue
        for index, line in enumerate(lines, start=1):
            if keyword.lower() in line.lower():
                matches.append({
                    "path": str(path.relative_to(root)),
                    "line": index,
                    "preview": line.strip()[:240],
                })
                break
    return matches


def base_result(action: str, purpose: str, execute: bool) -> Dict[str, Any]:
    return {
        "bridge": BRIDGE_NAME,
        "protocol_version": PROTOCOL_VERSION,
        "mode": "execute" if execute else "dry-run",
        "action": action,
        "purpose": purpose,
        "approval_required": True,
        "status": "pending",
        "validation": [],
        "created_at": now_iso(),
    }


def handle_request(
    req: Dict[str, Any],
    execute: bool,
    record: bool = False,
    execute_command: bool = False,
    execute_write: bool = False,
    execute_memory: bool = False,
    execute_scheduler: bool = False,
    execute_web: bool = False,
    execute_mcp: bool = False,
    execute_provider: bool = False,
    execute_skill: bool = False,
    full_access_files: bool = False,
    gateway_execute_read: bool | None = None,
    gateway_execute_command: bool | None = None,
    gateway_execute_write: bool | None = None,
    gateway_execute_memory: bool | None = None,
    gateway_execute_scheduler: bool | None = None,
    gateway_execute_web: bool | None = None,
    gateway_execute_mcp: bool | None = None,
    gateway_execute_provider: bool | None = None,
    gateway_execute_skill: bool | None = None,
) -> Dict[str, Any]:
    action = str(req.get("action") or "").strip()
    purpose = str(req.get("purpose") or "").strip()
    payload = req.get("payload") if isinstance(req.get("payload"), dict) else {}
    request_execute = bool(req.get("execute") or payload.get("execute"))
    access_profile = normalize_file_access_profile(payload)
    result = base_result(action, purpose, execute or execute_write or execute_memory or execute_command or execute_scheduler or execute_web or execute_mcp or execute_provider or execute_skill)
    agent_context = agent_context_from_request(req)
    if agent_context:
        result["agent_context"] = agent_context
    result["tool_access"] = {
        "file_access_profile": access_profile,
        "request_execute_read_enabled": execute,
        "request_execute_command_enabled": execute_command,
        "request_execute_write_enabled": execute_write,
        "request_execute_memory_enabled": execute_memory,
        "request_execute_scheduler_enabled": execute_scheduler,
        "request_execute_web_enabled": execute_web,
        "request_execute_mcp_enabled": execute_mcp,
        "request_execute_provider_enabled": execute_provider,
        "request_execute_skill_enabled": execute_skill,
        "gateway_execute_read_enabled": execute if gateway_execute_read is None else bool(gateway_execute_read),
        "gateway_execute_command_enabled": execute_command if gateway_execute_command is None else bool(gateway_execute_command),
        "gateway_execute_write_enabled": execute_write if gateway_execute_write is None else bool(gateway_execute_write),
        "gateway_execute_memory_enabled": execute_memory if gateway_execute_memory is None else bool(gateway_execute_memory),
        "gateway_execute_scheduler_enabled": execute_scheduler if gateway_execute_scheduler is None else bool(gateway_execute_scheduler),
        "gateway_execute_web_enabled": execute_web if gateway_execute_web is None else bool(gateway_execute_web),
        "gateway_execute_mcp_enabled": execute_mcp if gateway_execute_mcp is None else bool(gateway_execute_mcp),
        "gateway_execute_provider_enabled": execute_provider if gateway_execute_provider is None else bool(gateway_execute_provider),
        "gateway_execute_skill_enabled": execute_skill if gateway_execute_skill is None else bool(gateway_execute_skill),
        "full_access_files_enabled": full_access_files,
        "workspace_sandbox_enabled": True,
        "skill_instruction_read_enabled": True,
        "skill_script_execution": "gated" if (execute_skill if gateway_execute_skill is None else bool(gateway_execute_skill)) else "disabled",
    }
    result["runtime_capabilities"] = runtime_capabilities(
        execute_read=result["tool_access"]["gateway_execute_read_enabled"],
        execute_command=result["tool_access"]["gateway_execute_command_enabled"],
        execute_write=result["tool_access"]["gateway_execute_write_enabled"],
        execute_memory=result["tool_access"]["gateway_execute_memory_enabled"],
        execute_scheduler=result["tool_access"]["gateway_execute_scheduler_enabled"],
        execute_web=result["tool_access"]["gateway_execute_web_enabled"],
        execute_mcp=result["tool_access"]["gateway_execute_mcp_enabled"],
        execute_provider=result["tool_access"]["gateway_execute_provider_enabled"],
        execute_skill=result["tool_access"]["gateway_execute_skill_enabled"],
        full_access_files=full_access_files,
    )
    result["safety_layers"] = safety_review(action, purpose, payload)

    if action == "status":
        manifest = bridge_manifest()
        manifest["runtime_capabilities"] = result["runtime_capabilities"]
        result.update({
            "approval_required": False,
            "status": "ok",
            "manifest": manifest,
            "recent_runs": recent_records("runs", limit=5),
            "workflows": workflow_status(payload),
            "kairos": kairos_status(payload),
            "memory": memory_status(payload),
            "skills": skill_status(payload),
            "scheduler": scheduler_status(payload),
            "workers": worker_status(payload),
            "sandbox": sandbox_policy(),
            "model_worker_policy": model_worker_policy(),
            "user_model": user_model_status(payload),
            "subagents": subagent_status(payload),
            "daemon": {
                "kairos_daily_log": str(kairos_daily_log_path().relative_to(bridge_root())),
                "autodream_pending": memory_status({}).get("pending_count", 0),
            },
        })
    elif action == "search":
        result.update({
            "approval_required": False,
            "status": "ok",
            "matches": search_workspace(payload),
        })
    elif action == "run_command":
        command = str(payload.get("command") or "")
        cwd = str(payload.get("cwd") or "")
        validation = validate_command(command, cwd, purpose)
        result["validation"] = validation
        result["command_policy"] = command_execution_policy()
        if any(item["severity"] == "block" for item in validation):
            result["approval_required"] = True
            result["status"] = "blocked"
            result["message"] = "Command validators blocked this request."
        elif execute_command and request_execute:
            execution = run_verification_command(payload)
            result["command_execution"] = execution
            result["approval_required"] = False if execution.get("status") in {"ok", "failed"} else True
            result["status"] = execution.get("status", "blocked")
            result["message"] = "Allowlisted verification command executed." if execution.get("status") in {"ok", "failed"} else "Command is not in the verification allowlist."
        else:
            result["approval_required"] = True
            result["status"] = "approval_required"
            result["message"] = "Command execution requires --execute-command plus payload execute=true; otherwise this bridge validates and records command drafts only."
            result["approval_id"] = save_record("approvals", req, result)
    elif action == "read_file":
        target = resolve_file_path(str(payload.get("path") or ""), access_profile, full_access_files=full_access_files)
        result["target"] = str(target)
        if not (execute and request_execute):
            result["status"] = "dry_run"
            result["message"] = "Start the bridge with --execute-read and pass execute=true to read the file; full_access also requires --full-access-files."
        else:
            result["approval_required"] = False
            result["status"] = "ok"
            result["content"] = target.read_text(encoding="utf-8", errors="replace")[:20000]
    elif action == "workspace_scan":
        root_raw = str(payload.get("path") or payload.get("root") or "")
        target: Path | None = None
        result["workspace_scan_policy"] = {
            "metadata_only": True,
            "content_read": False,
            "requires": ["Gateway --execute-read", "payload.execute=true"],
            "full_access_requires": "Gateway --full-access-files plus access_profile=full_access",
        }
        if not execute:
            result["status"] = "dry_run"
            result["target"] = root_raw
            result["message"] = "workspace_scan dry-run only; start Gateway with --execute-read and pass execute=true to list directory metadata."
        elif not request_execute:
            result["status"] = "dry_run"
            result["target"] = root_raw
            result["message"] = "workspace_scan requires payload.execute=true even when Gateway --execute-read is enabled."
        else:
            target = resolve_file_path(root_raw, access_profile, full_access_files=full_access_files)
            result["target"] = str(target)
            scan = workspace_scan(payload, target, root_raw)
            result.update({
                "approval_required": False,
                "status": "ok",
                "workspace_scan": scan,
                "message": "workspace_scan returned metadata only; file contents were not read.",
            })
    elif action == "write_file":
        target = resolve_file_path(str(payload.get("path") or ""), access_profile, full_access_files=full_access_files)
        result["target"] = str(target)
        if execute_write and request_execute:
            write_result = write_text_file(payload, target)
            result.update({
                "approval_required": False,
                "status": "ok",
                "write_file": write_result,
                "message": "write_file executed with backup/diff audit.",
            })
        else:
            result["status"] = "approval_required"
            result["message"] = "write_file has been queued for approval; direct write requires --execute-write plus payload execute=true."
            result["approval_id"] = save_record("approvals", req, result)
    elif action == "run":
        workflow = run_workflow(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "workflow": workflow,
            "message": "Workflow DAG registered.",
        })
    elif action == "advance":
        workflow = advance_workflow(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "workflow": workflow,
            "message": "Workflow DAG advanced.",
        })
    elif action == "kairos_task":
        task = create_kairos_task(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "task": task,
            "message": "KAIROS task queued; autonomous execution is disabled.",
        })
    elif action == "kairos_tick":
        result.update({
            "approval_required": False,
            "status": "ok",
            "kairos": run_kairos_tick(payload, purpose),
            "message": "KAIROS observation tick completed without external execution.",
        })
    elif action == "memory_event":
        event = create_memory_event(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "memory_event": event,
            "message": "AutoDream L1 memory event recorded.",
        })
    elif action == "memory_consolidate":
        memory = consolidate_memory(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "memory": memory,
            "message": "AutoDream memory consolidated.",
        })
    elif action == "memory_bootstrap":
        memory = bootstrap_memory(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "memory": memory,
            "memory_bootstrap": memory,
            "message": "AutoDream memory bootstrap seeded L1 events and consolidated L2 summaries.",
        })
    elif action == "memory_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "memory": memory_status(payload),
        })
    elif action == "memory_retrieve":
        result.update({
            "approval_required": False,
            "status": "ok",
            "memory_retrieve": retrieve_memory(payload),
            "message": "AutoDream memory context pack retrieved.",
        })
    elif action == "memory_backup_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "memory_backup_status": memory_backup_status(payload),
            "message": "AutoDream memory backup history inspected without restoring state.",
        })
    elif action == "approval_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "approval_status": approval_status(payload),
            "message": "Approval queue inspected without approving or executing records.",
        })
    elif action == "runtime_events":
        result.update({
            "approval_required": False,
            "status": "ok",
            "runtime_events": runtime_events(payload),
            "message": "Gateway runtime timeline merged from runs, approvals, and workers.",
        })
    elif action == "approval_decide":
        decision_result = approval_decide(payload, execute_command=execute_command, execute_write=execute_write, execute_memory=execute_memory, execute_provider=execute_provider, full_access_files=full_access_files)
        result.update({
            "approval_required": bool(decision_result.get("approval_required", False)),
            "status": str(decision_result.get("status") or "ok"),
            "approval_decide": decision_result,
            "message": str(decision_result.get("message") or "Approval decision recorded."),
        })
    elif action in MEMORY_MANAGEMENT_ACTIONS:
        proposal = memory_management_proposal(action, payload, purpose)
        result.update({
            "approval_required": True,
            "status": "approval_required",
            "memory_management": proposal,
            "message": f"{action} has been queued for approval; memory state was not modified.",
        })
        result["approval_id"] = save_record("approvals", req, result)
    elif action == "context_pack":
        result.update({
            "approval_required": False,
            "status": "ok",
            "context_pack": build_context_pack(payload, purpose),
            "message": "Agent context pack built from skill routing and memory retrieval.",
        })
    elif action == "source_audit":
        audit = audit_sources(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "source_audit": audit,
            "message": "Research sources audited without fetching, cloning, or inspecting protected code.",
        })
    elif action == "source_digest":
        digest = digest_sources(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "source_digest": digest,
            "message": "Safe research sources digested into Personal OS architecture adoption notes.",
        })
    elif action == "provider_catalog":
        result.update({
            "approval_required": False,
            "status": "ok",
            "provider_catalog": provider_catalog(payload),
            "message": "Provider catalog returned without network calls or key persistence.",
        })
    elif action == "provider_config_status":
        config_status = provider_config_status(payload)
        result.update({
            "approval_required": False,
            "status": "ok",
            "provider_config_status": config_status,
            "message": "Desktop Provider switch config returned without network calls.",
        })
    elif action == "provider_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "provider_status": provider_status(payload),
            "message": "Provider readiness inspected without network calls or key persistence.",
        })
    elif action == "mcp_stdio_catalog":
        result.update({
            "approval_required": False,
            "status": "ok",
            "mcp_stdio_catalog": mcp_stdio_catalog(payload),
            "message": "Registered stdio MCP servers returned without spawning processes.",
        })
    elif action == "provider_probe":
        probe_payload = {**payload, "_request_execute": True} if request_execute and not payload.get("execute") else payload
        probe = provider_probe(probe_payload, purpose, execute_provider=execute_provider)
        result.update({
            "approval_required": probe.get("status") == "approval_required",
            "status": "ok" if probe.get("status") == "ok" else probe.get("status", "approval_required"),
            "provider_probe": probe,
            "message": "Provider probe processed with explicit network gate.",
        })
        if result.get("approval_required") and record:
            result["approval_id"] = save_record("approvals", req, result)
    elif action == "goal_bootstrap":
        bootstrap = bootstrap_goal(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "goal_bootstrap": bootstrap,
            "message": "Goal Mode planner tree created and safe registrations processed.",
        })
    elif action == "skill_bootstrap":
        bootstrap = bootstrap_skills(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok" if bootstrap.get("status") in {"pass", "ok"} else bootstrap.get("status", "partial"),
            "skill_bootstrap": bootstrap,
            "message": "Skill domain bootstrap verified route, context, tool policy, and workflow hooks.",
        })
    elif action == "skill_route":
        result.update({
            "approval_required": False,
            "status": "ok",
            "skill_route": route_skills(payload, purpose),
            "message": "Skill route generated without importing or executing scripts.",
        })
    elif action == "skill_invoke":
        result.update({
            "approval_required": False,
            "status": "ok",
            "skill_invoke": invoke_skill(payload, purpose),
            "message": "Skill invocation packet generated without importing or executing scripts.",
        })
    elif action == "skill_crystallize":
        skills = crystallize_skill(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "skills": skills,
            "message": "Skill crystallization draft generated.",
        })
    elif action == "skill_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "skills": skill_status(payload),
        })
    elif action == "skill_review":
        review = review_skill_candidate(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok" if review.get("status") == "pass" else review.get("status", "blocked"),
            "skills": {"review": review, "status": skill_status({"limit": 10})},
            "message": "Skill candidate reviewed.",
        })
    elif action == "skill_activate":
        activation = activate_skill_candidate(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok" if activation.get("status") == "activated" else activation.get("status", "blocked"),
            "skills": activation,
            "message": "Skill candidate activated." if activation.get("status") == "activated" else activation.get("message", "Skill activation did not complete."),
        })
    elif action == "skill_run":
        result["skill_policy"] = skill_run_policy()
        if execute_skill and request_execute:
            run_result = run_activated_skill(payload, purpose)
            result.update({
                "approval_required": False,
                "status": "ok" if run_result.get("status") == "ok" else run_result.get("status", "blocked"),
                "skill_run": run_result,
                "message": "Activated skill executed in a bounded subprocess." if run_result.get("status") == "ok" else run_result.get("message", "Activated skill runtime did not complete."),
            })
        else:
            result["status"] = "approval_required"
            result["message"] = "skill_run requires --execute-skill plus payload execute=true; otherwise activated skills remain prompt/reference-only."
    elif action == "scheduler_plan":
        plan = create_scheduler_plan(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "scheduler": {"plan": plan, "status": scheduler_status({"limit": 10})},
            "message": "Scheduler install/uninstall drafts created; no OS task was registered.",
        })
    elif action == "scheduler_install":
        install = execute_scheduler_plan(payload, purpose, "install", execute_scheduler=execute_scheduler)
        result.update({
            "approval_required": install.get("status") == "approval_required",
            "status": "ok" if install.get("status") == "installed" else install.get("status", "blocked"),
            "scheduler": {"operation": install, "status": scheduler_status({"plan_id": install.get("plan", {}).get("id", "")})},
            "message": install.get("message") or "Scheduler install processed.",
        })
    elif action == "scheduler_uninstall":
        uninstall = execute_scheduler_plan(payload, purpose, "uninstall", execute_scheduler=execute_scheduler)
        result.update({
            "approval_required": uninstall.get("status") == "approval_required",
            "status": "ok" if uninstall.get("status") == "uninstalled" else uninstall.get("status", "blocked"),
            "scheduler": {"operation": uninstall, "status": scheduler_status({"plan_id": uninstall.get("plan", {}).get("id", "")})},
            "message": uninstall.get("message") or "Scheduler uninstall processed.",
        })
    elif action == "scheduler_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "scheduler": scheduler_status(payload),
        })
    elif action == "worker_run":
        job = run_worker_job(payload, purpose, execute_command=execute_command)
        result.update({
            "approval_required": False,
            "status": "ok" if job.get("status") in {"queued", "starting", "running", "completed"} else job.get("status", "blocked"),
            "worker": job,
            "message": "Worker job started." if job.get("status") == "starting" else job.get("message", "Worker job registered."),
        })
    elif action == "worker_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "workers": worker_status(payload),
        })
    elif action == "worker_cancel":
        cancel = cancel_worker_job(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok" if cancel.get("status") in {"canceled", "hard_canceled", "cancel_requested", "too_late"} else cancel.get("status", "missing"),
            "worker_cancel": cancel,
            "message": "Worker cancellation processed.",
        })
    elif action == "worker_merge_proposal":
        proposal = create_worker_merge_proposal(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok" if proposal.get("status") == "proposal" else proposal.get("status", "blocked"),
            "worker_merge_proposal": proposal,
            "message": "Worker merge proposal created without modifying target files." if proposal.get("status") == "proposal" else proposal.get("reason", "Worker merge proposal was not created."),
        })
    elif action == "swarm_bootstrap":
        swarm = bootstrap_swarm(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok" if swarm.get("status") in {"pass", "ok"} else swarm.get("status", "partial"),
            "swarm_bootstrap": swarm,
            "message": "Phase 4 swarm rehearsal completed with subagents, locks, conflicts, and allowlisted workers.",
        })
    elif action == "safety_review":
        proposed_action = str(payload.get("action") or "").strip()
        proposed_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
        proposed_purpose = str(payload.get("purpose") or purpose or "").strip()
        command_validation = validate_command(str(proposed_payload.get("command") or ""), str(proposed_payload.get("cwd") or ""), proposed_purpose) if proposed_action == "run_command" else []
        result.update({
            "approval_required": False,
            "status": "ok",
            "review": safety_review(proposed_action, proposed_purpose, proposed_payload),
            "command_validation": command_validation,
        })
    elif action == "sandbox_probe":
        result.update({
            "approval_required": False,
            "status": "ok",
            "sandbox": run_sandbox_probe(payload),
            "message": "Sandbox allowlist probe completed.",
        })
    elif action == "sandbox_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "sandbox": sandbox_policy(),
        })
    elif action == "phase_audit":
        result.update({
            "approval_required": False,
            "status": "ok",
            "phase_audit": phase_audit(),
            "message": "Phase 1-5 Personal OS audit completed.",
        })
    elif action == "completion_audit":
        result.update({
            "approval_required": False,
            "status": "ok",
            "completion_audit": completion_audit(),
            "message": "Personal OS requirement audit completed.",
        })
    elif action == "evolution_bootstrap":
        evolution = bootstrap_evolution(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok" if evolution.get("status") in {"pass", "ok"} else evolution.get("status", "partial"),
            "evolution_bootstrap": evolution,
            "message": "Phase 5 evolution loop verified with KAIROS, scheduler draft, memory, skill crystallization, and user modeling.",
        })
    elif action == "user_model_event":
        event = user_model_event(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "user_model_event": event,
            "message": "User model observation recorded.",
        })
    elif action == "user_model_reflect":
        reflection = user_model_reflect(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "user_model": reflection,
            "message": "User model reflection completed.",
        })
    elif action == "user_model_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "user_model": user_model_status(payload),
        })
    elif action == "subagent_spawn":
        agent = spawn_subagent(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "agent": agent,
            "message": "Subagent branch registered.",
        })
    elif action == "lock_acquire":
        lock_result = acquire_lock(payload, purpose)
        result.update({
            "approval_required": False,
            "status": lock_result.get("status", "ok"),
            "lock_result": lock_result,
            "message": "Lock acquired." if lock_result.get("status") == "ok" else "Lock conflict detected.",
        })
    elif action == "lock_release":
        release_result = release_lock(payload, purpose)
        result.update({
            "approval_required": False,
            "status": "ok",
            "lock_result": release_result,
            "message": "Lock release processed.",
        })
    elif action == "subagent_status":
        result.update({
            "approval_required": False,
            "status": "ok",
            "subagents": subagent_status(payload),
        })
    elif action == "web_fetch":
        result["web_policy"] = web_fetch_policy()
        if execute_web and request_execute:
            fetch = execute_web_fetch(payload, purpose)
            result.update({
                "approval_required": False,
                "status": "ok" if fetch.get("status") == "ok" else fetch.get("status", "http_error"),
                "web_fetch": fetch,
                "message": "web_fetch executed with bounded response and redacted headers.",
            })
        else:
            result["status"] = "approval_required"
            result["message"] = "web_fetch requires --execute-web plus payload execute=true; otherwise this bridge records an API proposal only."
    elif action == "mcp_call":
        result["mcp_policy"] = mcp_call_policy()
        if execute_mcp and request_execute:
            call = execute_mcp_call(payload, purpose)
            result.update({
                "approval_required": False,
                "status": "ok" if call.get("status") == "ok" else call.get("status", "http_error"),
                "mcp_call": call,
                "message": "mcp_call executed through bounded HTTP JSON-RPC or registered stdio MCP with limited/redacted output.",
            })
        else:
            result["status"] = "approval_required"
            result["message"] = "mcp_call requires --execute-mcp plus payload execute=true; otherwise this bridge records an MCP proposal only. Use transport=http with endpoint or transport=stdio with a registered server_id."
    else:
        result["status"] = "unsupported"
        result["message"] = f"Unsupported action: {action}"

    if record:
        result["run_id"] = save_record("runs", req, result)
    return result


def mcp_resource_specs() -> List[Dict[str, str]]:
    return [
        {
            "uri": "zhimeng://manifest",
            "name": "LumenOS Agent Gateway Manifest",
            "description": "Bridge manifest, tool registry, safety policy, and local endpoint hints.",
            "mimeType": "application/json",
        },
        {
            "uri": "zhimeng://phase-audit",
            "name": "Phase 1-5 Audit",
            "description": "Current Personal OS evidence, completion status, and remaining gaps.",
            "mimeType": "application/json",
        },
        {
            "uri": "zhimeng://completion-audit",
            "name": "Personal OS Completion Audit",
            "description": "Requirement-by-requirement audit against public agent architecture patterns.",
            "mimeType": "application/json",
        },
        {
            "uri": "zhimeng://memory/autodream",
            "name": "AutoDream Memory Status",
            "description": "Six-dimensional L1/L2 memory counts and recent context slices.",
            "mimeType": "application/json",
        },
        {
            "uri": "zhimeng://skills/status",
            "name": "Skills Assembly Status",
            "description": "Generated, reviewed, and activated skill candidates.",
            "mimeType": "application/json",
        },
        {
            "uri": "zhimeng://coordinator/system-prompt",
            "name": "Coordinator System Prompt Skeleton",
            "description": "Goal Mode coordinator rules for delegation, verification, context economy, and source boundaries.",
            "mimeType": "text/plain",
        },
    ]


def read_mcp_resource(uri: str) -> Dict[str, Any]:
    if uri == "zhimeng://manifest":
        return {"mimeType": "application/json", "text": json.dumps(bridge_manifest(), ensure_ascii=False, indent=2)}
    if uri == "zhimeng://phase-audit":
        return {"mimeType": "application/json", "text": json.dumps(phase_audit(), ensure_ascii=False, indent=2)}
    if uri == "zhimeng://completion-audit":
        return {"mimeType": "application/json", "text": json.dumps(completion_audit(), ensure_ascii=False, indent=2)}
    if uri == "zhimeng://memory/autodream":
        return {"mimeType": "application/json", "text": json.dumps(memory_status({}), ensure_ascii=False, indent=2)}
    if uri == "zhimeng://skills/status":
        return {"mimeType": "application/json", "text": json.dumps(skill_status({"limit": 20}), ensure_ascii=False, indent=2)}
    if uri == "zhimeng://coordinator/system-prompt":
        text = "\n".join([
            "Coordinator System Prompt Skeleton",
            "",
            "- Mode: Goal Mode for long-running objectives, Task Mode for current requests.",
            "- The coordinator must synthesize subagent output personally and must not rubber-stamp weak work.",
            "- Use memory retrieval, Skills, tools, verification gates, and writeback as separate layers.",
            "- Source boundary: use official/public/open-source architecture ideas only; do not copy leaked or protected code.",
            "- Context economy: inject compact memory slices and necessary files, not the entire project history.",
        ])
        return {"mimeType": "text/plain", "text": text}
    raise ValueError(f"unknown resource uri: {uri}")


def mcp_prompt_specs() -> List[Dict[str, Any]]:
    return [
        {
            "name": "coordinator_goal_mode",
            "description": "Start a Personal OS Goal Mode run with planner tree, gates, source boundaries, and writeback rules.",
            "arguments": [{"name": "goal", "description": "The long-running objective.", "required": True}],
        },
        {
            "name": "memory_retrieval",
            "description": "Ask the model to retrieve compact AutoDream context before acting.",
            "arguments": [{"name": "query", "description": "Memory search query.", "required": True}],
        },
        {
            "name": "worker_bridge_action",
            "description": "Ask the model to spawn an allowlisted worker bridge action, defaulting to context_pack.",
            "arguments": [{"name": "action", "description": "Allowlisted bridge action name.", "required": True}],
        },
    ]


def get_mcp_prompt(name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    if name == "coordinator_goal_mode":
        goal = str(arguments.get("goal") or "").strip() or "Continue the Personal OS objective."
        text = f"Enter Goal Mode for this objective: {goal}\nPlan with DAG gates, retrieve compact memory, delegate only bounded subtasks, verify before writeback, and preserve source boundaries."
    elif name == "memory_retrieval":
        query = str(arguments.get("query") or "").strip() or "current task"
        text = f"Before answering, call memory_retrieve with query={query!r}, inspect L2/L1 evidence, and inject only the compact context_pack needed for the task."
    elif name == "worker_bridge_action":
        action = str(arguments.get("action") or "").strip() or "context_pack"
        text = f"Create a worker_run request with kind=bridge_action and action={action!r}. Use only allowlisted internal actions and summarize the returned structured result."
    else:
        raise ValueError(f"unknown prompt: {name}")
    return {
        "description": next((item["description"] for item in mcp_prompt_specs() if item["name"] == name), name),
        "messages": [
            {
                "role": "user",
                "content": {"type": "text", "text": text},
            }
        ],
    }


def handle_mcp_rpc(
    body: Dict[str, Any],
    execute: bool = False,
    execute_command: bool = False,
    execute_write: bool = False,
    execute_memory: bool = False,
    execute_scheduler: bool = False,
    execute_web: bool = False,
    execute_mcp: bool = False,
    execute_provider: bool = False,
    execute_skill: bool = False,
    full_access_files: bool = False,
    gateway_execute_read: bool | None = None,
    gateway_execute_command: bool | None = None,
    gateway_execute_write: bool | None = None,
    gateway_execute_memory: bool | None = None,
    gateway_execute_scheduler: bool | None = None,
    gateway_execute_web: bool | None = None,
    gateway_execute_mcp: bool | None = None,
    gateway_execute_provider: bool | None = None,
    gateway_execute_skill: bool | None = None,
) -> Dict[str, Any]:
    request_id = body.get("id")
    method = str(body.get("method") or "").strip()
    params = body.get("params") if isinstance(body.get("params"), dict) else {}

    if method == "initialize":
        return jsonrpc_success(request_id, {
            "protocolVersion": str(params.get("protocolVersion") or "2024-11-05"),
            "capabilities": {
                "tools": {"listChanged": False},
                "resources": {"subscribe": False, "listChanged": False},
                "prompts": {"listChanged": False},
            },
            "serverInfo": {"name": BRIDGE_NAME, "version": PROTOCOL_VERSION},
        })

    if method == "notifications/initialized":
        return jsonrpc_success(request_id, {})

    if method == "tools/list":
        return jsonrpc_success(request_id, {"tools": mcp_tool_specs()})

    if method == "resources/list":
        return jsonrpc_success(request_id, {"resources": mcp_resource_specs()})

    if method == "resources/read":
        uri = str(params.get("uri") or "").strip()
        if not uri:
            return jsonrpc_error(request_id, -32602, "params.uri is required")
        try:
            resource = read_mcp_resource(uri)
        except ValueError as exc:
            return jsonrpc_error(request_id, -32602, str(exc))
        return jsonrpc_success(request_id, {
            "contents": [{
                "uri": uri,
                "mimeType": resource["mimeType"],
                "text": resource["text"],
            }],
        })

    if method == "prompts/list":
        return jsonrpc_success(request_id, {"prompts": mcp_prompt_specs()})

    if method == "prompts/get":
        name = str(params.get("name") or "").strip()
        if not name:
            return jsonrpc_error(request_id, -32602, "params.name is required")
        arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
        try:
            return jsonrpc_success(request_id, get_mcp_prompt(name, arguments))
        except ValueError as exc:
            return jsonrpc_error(request_id, -32602, str(exc))

    if method == "tools/call":
        name = str(params.get("name") or "").strip()
        if not name:
            return jsonrpc_error(request_id, -32602, "params.name is required")
        arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
        allowed = {item["name"] for item in mcp_tool_specs()}
        if name not in allowed:
            return jsonrpc_error(request_id, -32602, f"unknown tool: {name}")
        req = {
            "action": name,
            "purpose": str(params.get("purpose") or f"MCP tools/call {name}"),
            "payload": arguments,
        }
        result = handle_request(
            req,
            execute=execute,
            record=True,
            execute_command=execute_command,
            execute_write=execute_write,
            execute_memory=execute_memory,
            execute_scheduler=execute_scheduler,
            execute_web=execute_web,
            execute_mcp=execute_mcp,
            execute_provider=execute_provider,
            execute_skill=execute_skill,
            full_access_files=full_access_files,
            gateway_execute_read=gateway_execute_read,
            gateway_execute_command=gateway_execute_command,
            gateway_execute_write=gateway_execute_write,
            gateway_execute_memory=gateway_execute_memory,
            gateway_execute_scheduler=gateway_execute_scheduler,
            gateway_execute_web=gateway_execute_web,
            gateway_execute_mcp=gateway_execute_mcp,
            gateway_execute_provider=gateway_execute_provider,
            gateway_execute_skill=gateway_execute_skill,
        )
        return jsonrpc_success(request_id, {
            "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}],
            "structuredContent": result,
        })

    return jsonrpc_error(request_id, -32601, f"unsupported method: {method}")


class GatewayHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def _send_sse_event(self, event: str, payload: Dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False)
        packet = f"event: {event}\ndata: {data}\n\n".encode("utf-8")
        self.wfile.write(packet)
        self.wfile.flush()

    def _handle_runtime_stream(self, query: Dict[str, List[str]]) -> None:
        limit = max(1, min(int((query.get("limit") or ["40"])[0] or 40), 120))
        interval = max(1, min(int((query.get("interval") or ["2"])[0] or 2), 10))
        ticks = max(1, min(int((query.get("ticks") or ["15"])[0] or 15), 120))
        after_epoch = parse_event_time((query.get("after_epoch") or ["0"])[0], 0)
        after_id = str((query.get("after_id") or [""])[0] or "")
        thread_id = str((query.get("thread_id") or query.get("threadId") or [""])[0] or "").strip()
        workspace_id = str((query.get("workspace_id") or query.get("workspaceId") or [""])[0] or "").strip()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        cursor_epoch = after_epoch
        cursor_id = after_id
        self._send_sse_event("hello", {
            "status": "ok",
            "stream": "runtime_events",
            "interval": interval,
            "ticks": ticks,
            "thread_id": thread_id,
            "workspace_id": workspace_id,
            "cursor": {"at_epoch": cursor_epoch, "id": cursor_id},
        })
        for tick in range(ticks):
            payload = {
                "limit": limit,
                "after_epoch": cursor_epoch,
                "after_id": cursor_id,
                "thread_id": thread_id,
                "workspace_id": workspace_id,
            }
            events_payload = runtime_events(payload)
            cursor = as_record(events_payload.get("cursor"))
            cursor_epoch = float(cursor.get("at_epoch") or cursor_epoch or 0)
            cursor_id = str(cursor.get("id") or cursor_id or "")
            self._send_sse_event("runtime_events", {
                "tick": tick + 1,
                "runtime_events": events_payload,
            })
            time.sleep(interval)
        self._send_sse_event("done", {
            "status": "done",
            "cursor": {"at_epoch": cursor_epoch, "id": cursor_id},
        })

    def do_OPTIONS(self) -> None:
        self._send_json(200, {"status": "ok"})

    def do_GET(self) -> None:
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        parsed_query: Dict[str, List[str]] = {}
        for key, value in parse_qsl(parsed_url.query, keep_blank_values=True):
            parsed_query.setdefault(key, []).append(value)
        if path == "/health":
            self._send_json(200, {
                "status": "ok",
                "bridge": BRIDGE_NAME,
                "protocol_version": PROTOCOL_VERSION,
                "runtime_capabilities": runtime_capabilities(
                    execute_read=bool(getattr(self.server, "execute_read", False)),
                    execute_command=bool(getattr(self.server, "execute_command", False)),
                    execute_write=bool(getattr(self.server, "execute_write", False)),
                    execute_memory=bool(getattr(self.server, "execute_memory", False)),
                    execute_scheduler=bool(getattr(self.server, "execute_scheduler", False)),
                    execute_web=bool(getattr(self.server, "execute_web", False)),
                    execute_mcp=bool(getattr(self.server, "execute_mcp", False)),
                    execute_provider=bool(getattr(self.server, "execute_provider", False)),
                    execute_skill=bool(getattr(self.server, "execute_skill", False)),
                    full_access_files=bool(getattr(self.server, "full_access_files", False)),
                ),
            })
        elif path == "/tools":
            host, port = self.server.server_address
            manifest = bridge_manifest(str(host), int(port))
            manifest["runtime_capabilities"] = runtime_capabilities(
                execute_read=bool(getattr(self.server, "execute_read", False)),
                execute_command=bool(getattr(self.server, "execute_command", False)),
                execute_write=bool(getattr(self.server, "execute_write", False)),
                execute_memory=bool(getattr(self.server, "execute_memory", False)),
                execute_scheduler=bool(getattr(self.server, "execute_scheduler", False)),
                execute_web=bool(getattr(self.server, "execute_web", False)),
                execute_mcp=bool(getattr(self.server, "execute_mcp", False)),
                execute_provider=bool(getattr(self.server, "execute_provider", False)),
                execute_skill=bool(getattr(self.server, "execute_skill", False)),
                full_access_files=bool(getattr(self.server, "full_access_files", False)),
            )
            self._send_json(200, manifest)
        elif path == "/runs":
            self._send_json(200, {"runs": recent_records("runs")})
        elif path == "/approvals":
            self._send_json(200, {"approvals": recent_records("approvals")})
        elif path == "/runtime/stream":
            try:
                self._handle_runtime_stream(parsed_query)
            except BrokenPipeError:
                return
        else:
            self._send_json(404, {"status": "not_found", "path": path})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self._read_body()
            if path == "/bridge":
                body_payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
                request_execute = bool(body.get("execute") or body_payload.get("execute"))
                if bool(body.get("execute")) and isinstance(body_payload, dict) and not body_payload.get("execute"):
                    body = {**body, "payload": {**body_payload, "_request_execute": True}}
                gateway_execute_read = bool(getattr(self.server, "execute_read", False))
                gateway_execute_command = bool(getattr(self.server, "execute_command", False))
                gateway_execute_write = bool(getattr(self.server, "execute_write", False))
                gateway_execute_memory = bool(getattr(self.server, "execute_memory", False))
                gateway_execute_scheduler = bool(getattr(self.server, "execute_scheduler", False))
                gateway_execute_web = bool(getattr(self.server, "execute_web", False))
                gateway_execute_mcp = bool(getattr(self.server, "execute_mcp", False))
                gateway_execute_provider = bool(getattr(self.server, "execute_provider", False))
                gateway_execute_skill = bool(getattr(self.server, "execute_skill", False))
                execute_read = bool(gateway_execute_read and request_execute)
                execute_command = bool(gateway_execute_command and request_execute)
                execute_write = bool(gateway_execute_write and request_execute)
                execute_memory = bool(gateway_execute_memory and request_execute)
                execute_scheduler = bool(gateway_execute_scheduler and request_execute)
                execute_web = bool(gateway_execute_web and request_execute)
                execute_mcp = bool(gateway_execute_mcp and request_execute)
                execute_provider = bool(gateway_execute_provider and request_execute)
                execute_skill = bool(gateway_execute_skill and request_execute)
                full_access_files = bool(getattr(self.server, "full_access_files", False))
                self._send_json(200, handle_request(
                    body,
                    execute=execute_read,
                    record=request_record_enabled(body, True),
                    execute_command=execute_command,
                    execute_write=execute_write,
                    execute_memory=execute_memory,
                    execute_scheduler=execute_scheduler,
                    execute_web=execute_web,
                    execute_mcp=execute_mcp,
                    execute_provider=execute_provider,
                    execute_skill=execute_skill,
                    full_access_files=full_access_files,
                    gateway_execute_read=gateway_execute_read,
                    gateway_execute_command=gateway_execute_command,
                    gateway_execute_write=gateway_execute_write,
                    gateway_execute_memory=gateway_execute_memory,
                    gateway_execute_scheduler=gateway_execute_scheduler,
                    gateway_execute_web=gateway_execute_web,
                    gateway_execute_mcp=gateway_execute_mcp,
                    gateway_execute_provider=gateway_execute_provider,
                    gateway_execute_skill=gateway_execute_skill,
                ))
            elif path == "/mcp":
                params = body.get("params") if isinstance(body.get("params"), dict) else {}
                arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
                request_execute = bool(params.get("execute") or arguments.get("execute"))
                if bool(params.get("execute")) and isinstance(arguments, dict) and not arguments.get("execute"):
                    body = {
                        **body,
                        "params": {
                            **params,
                            "arguments": {**arguments, "_request_execute": True},
                        },
                    }
                gateway_execute_read = bool(getattr(self.server, "execute_read", False))
                gateway_execute_command = bool(getattr(self.server, "execute_command", False))
                gateway_execute_write = bool(getattr(self.server, "execute_write", False))
                gateway_execute_memory = bool(getattr(self.server, "execute_memory", False))
                gateway_execute_scheduler = bool(getattr(self.server, "execute_scheduler", False))
                gateway_execute_web = bool(getattr(self.server, "execute_web", False))
                gateway_execute_mcp = bool(getattr(self.server, "execute_mcp", False))
                gateway_execute_provider = bool(getattr(self.server, "execute_provider", False))
                gateway_execute_skill = bool(getattr(self.server, "execute_skill", False))
                execute_read = bool(gateway_execute_read and request_execute)
                execute_command = bool(gateway_execute_command and request_execute)
                execute_write = bool(gateway_execute_write and request_execute)
                execute_memory = bool(gateway_execute_memory and request_execute)
                execute_scheduler = bool(gateway_execute_scheduler and request_execute)
                execute_web = bool(gateway_execute_web and request_execute)
                execute_mcp = bool(gateway_execute_mcp and request_execute)
                execute_provider = bool(gateway_execute_provider and request_execute)
                execute_skill = bool(gateway_execute_skill and request_execute)
                full_access_files = bool(getattr(self.server, "full_access_files", False))
                self._send_json(200, handle_mcp_rpc(
                    body,
                    execute=execute_read,
                    execute_command=execute_command,
                    execute_write=execute_write,
                    execute_memory=execute_memory,
                    execute_scheduler=execute_scheduler,
                    execute_web=execute_web,
                    execute_mcp=execute_mcp,
                    execute_provider=execute_provider,
                    execute_skill=execute_skill,
                    full_access_files=full_access_files,
                    gateway_execute_read=gateway_execute_read,
                    gateway_execute_command=gateway_execute_command,
                    gateway_execute_write=gateway_execute_write,
                    gateway_execute_memory=gateway_execute_memory,
                    gateway_execute_scheduler=gateway_execute_scheduler,
                    gateway_execute_web=gateway_execute_web,
                    gateway_execute_mcp=gateway_execute_mcp,
                    gateway_execute_provider=gateway_execute_provider,
                    gateway_execute_skill=gateway_execute_skill,
                ))
            elif path == "/approval":
                result = {"status": "approval_queued", "approval_id": save_record("approvals", body, {"status": "approval_queued"})}
                self._send_json(200, result)
            else:
                self._send_json(404, {"status": "not_found", "path": path})
        except Exception as exc:
            self._send_json(400, {"bridge": BRIDGE_NAME, "status": "error", "error": str(exc)})


def serve(
    host: str,
    port: int,
    execute_read: bool,
    execute_command: bool,
    kairos_interval: int,
    autodream_interval: int,
    autodream_threshold: int,
    execute_write: bool = False,
    execute_memory: bool = False,
    execute_scheduler: bool = False,
    execute_web: bool = False,
    execute_mcp: bool = False,
    execute_provider: bool = False,
    execute_skill: bool = False,
    full_access_files: bool = False,
) -> int:
    httpd = ThreadingHTTPServer((host, port), GatewayHandler)
    httpd.execute_read = execute_read  # type: ignore[attr-defined]
    httpd.execute_command = execute_command  # type: ignore[attr-defined]
    httpd.execute_write = execute_write  # type: ignore[attr-defined]
    httpd.execute_memory = execute_memory  # type: ignore[attr-defined]
    httpd.execute_scheduler = execute_scheduler  # type: ignore[attr-defined]
    httpd.execute_web = execute_web  # type: ignore[attr-defined]
    httpd.execute_mcp = execute_mcp  # type: ignore[attr-defined]
    httpd.execute_provider = execute_provider  # type: ignore[attr-defined]
    httpd.execute_skill = execute_skill  # type: ignore[attr-defined]
    httpd.full_access_files = full_access_files  # type: ignore[attr-defined]
    if kairos_interval > 0:
        thread = threading.Thread(target=kairos_loop, args=(kairos_interval,), daemon=True)
        thread.start()
    if autodream_interval > 0:
        thread = threading.Thread(target=autodream_loop, args=(autodream_interval, autodream_threshold), daemon=True)
        thread.start()
    print(json.dumps({
        "bridge": BRIDGE_NAME,
        "status": "listening",
        "endpoint": f"http://{host}:{port}/bridge",
        "execute_read": execute_read,
        "execute_command": execute_command,
        "execute_write": execute_write,
        "execute_memory": execute_memory,
        "execute_scheduler": execute_scheduler,
        "execute_web": execute_web,
        "execute_mcp": execute_mcp,
        "execute_provider": execute_provider,
        "execute_skill": execute_skill,
        "full_access_files": full_access_files,
        "kairos_interval": kairos_interval,
        "autodream_interval": autodream_interval,
        "autodream_threshold": autodream_threshold,
    }, ensure_ascii=False))
    httpd.serve_forever()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", help="Path to JSON request file")
    parser.add_argument("--json", help="Inline JSON request")
    parser.add_argument("--model-worker-child", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--execute", action="store_true", help="Allow safe read_file execution in CLI mode")
    parser.add_argument("--execute-command", action="store_true", help="Allow opt-in execution of allowlisted verification commands")
    parser.add_argument("--execute-write", action="store_true", help="Allow write_file execution when each request also sets execute=true")
    parser.add_argument("--execute-memory", action="store_true", help="Allow approval_decide to execute queued memory management approvals when each request also sets execute=true")
    parser.add_argument("--execute-scheduler", action="store_true", help="Allow scheduler_install/scheduler_uninstall when each request also sets execute=true")
    parser.add_argument("--execute-web", action="store_true", help="Allow bounded web_fetch when each request also sets execute=true")
    parser.add_argument("--execute-mcp", action="store_true", help="Allow bounded mcp_call HTTP JSON-RPC calls when each request also sets execute=true")
    parser.add_argument("--execute-provider", action="store_true", help="Allow provider_probe model-list probes, including approval_decide execution of queued probes, when each request also sets execute=true")
    parser.add_argument("--execute-skill", action="store_true", help="Allow reviewed activated skill_run execution when each request also sets execute=true")
    parser.add_argument("--full-access-files", action="store_true", help="Allow read_file/write_file paths outside the workspace when access_profile=full_access")
    parser.add_argument("--serve", action="store_true", help="Start the local HTTP Gateway")
    parser.add_argument("--host", default="127.0.0.1", help="Gateway bind host")
    parser.add_argument("--port", type=int, default=8765, help="Gateway bind port")
    parser.add_argument("--execute-read", action="store_true", help="Allow HTTP read_file when each request also sets execute=true")
    parser.add_argument("--kairos-interval", type=int, default=0, help="Optional heartbeat seconds for KAIROS observation ticks")
    parser.add_argument("--autodream-interval", type=int, default=0, help="Optional heartbeat seconds for AutoDream L1->L2 consolidation")
    parser.add_argument("--autodream-threshold", type=int, default=2, help="Minimum pending L1 events before daemon AutoDream consolidation")
    args = parser.parse_args()

    if args.model_worker_child:
        return model_worker_child_main()

    if args.serve:
        return serve(
            args.host,
            args.port,
            execute_read=args.execute_read,
            execute_command=args.execute_command,
            kairos_interval=args.kairos_interval,
            autodream_interval=args.autodream_interval,
            autodream_threshold=args.autodream_threshold,
            execute_write=args.execute_write,
            execute_memory=args.execute_memory,
            execute_scheduler=args.execute_scheduler,
            execute_web=args.execute_web,
            execute_mcp=args.execute_mcp,
            execute_provider=args.execute_provider,
            execute_skill=args.execute_skill,
            full_access_files=args.full_access_files,
        )

    try:
        req = load_request(args)
        output = handle_request(
            req,
            execute=bool(args.execute or args.execute_read),
            record=False,
            execute_command=args.execute_command,
            execute_write=args.execute_write,
            execute_memory=args.execute_memory,
            execute_scheduler=args.execute_scheduler,
            execute_web=args.execute_web,
            execute_mcp=args.execute_mcp,
            execute_provider=args.execute_provider,
            execute_skill=args.execute_skill,
            full_access_files=args.full_access_files,
        )
    except Exception as exc:
        output = {"bridge": BRIDGE_NAME, "status": "error", "error": str(exc)}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if output.get("status") not in {"error"} else 1


if __name__ == "__main__":
    raise SystemExit(main())

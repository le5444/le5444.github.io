#!/usr/bin/env python3
"""
Local Provider switch tool for 织梦写作台 / Zhimeng Writing Agent.

It writes a small desktop config file that the Gateway can expose through
provider_config_status. API keys are stored only on this machine and are
redacted from normal command output.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "zhimeng.provider-settings.v1"


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def import_bridge() -> Any:
    bridge_path = project_root() / "bridge" / "zhimeng_bridge.py"
    spec = importlib.util.spec_from_file_location("zhimeng_bridge_provider_switch", bridge_path)
    if not spec or not spec.loader:
        raise RuntimeError(f"Cannot import Gateway provider registry from {bridge_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def config_path(args: argparse.Namespace | None = None) -> Path:
    override = getattr(args, "config", None) or os.environ.get("ZHIMENG_PROVIDER_CONFIG", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    appdata = os.environ.get("APPDATA", "").strip()
    if appdata:
        return Path(appdata).expanduser().resolve() / "ZhimengWritingAgent" / "provider-settings.json"
    return Path.home() / ".zhimeng-writing-agent" / "provider-settings.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def redacted(value: str) -> str:
    return "[present:redacted]" if value else ""


def read_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"schema": SCHEMA, "updatedAt": None, "activeProfileId": "", "profiles": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    profiles = data.get("profiles") if isinstance(data.get("profiles"), list) else []
    return {
        "schema": data.get("schema") or SCHEMA,
        "updatedAt": data.get("updatedAt"),
        "activeProfileId": data.get("activeProfileId") or "",
        "profiles": [profile for profile in profiles if isinstance(profile, dict)],
    }


def write_config(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
      "schema": SCHEMA,
      "updatedAt": now_iso(),
      "activeProfileId": data.get("activeProfileId") or "",
      "profiles": data.get("profiles") or [],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def provider_key_env(provider: str) -> str:
    if provider == "anthropic":
        return "ANTHROPIC_API_KEY"
    if provider == "gemini":
        return "GEMINI_API_KEY"
    if provider == "ollama":
        return ""
    return "ZHIMENG_MODEL_API_KEY"


def infer_provider(api_url: str) -> str:
    url = api_url.lower()
    if "anthropic.com" in url or "claude" in url:
        return "anthropic"
    if "generativelanguage.googleapis.com" in url or "gemini" in url:
        return "gemini"
    if "localhost:11434" in url or "127.0.0.1:11434" in url or "ollama" in url:
        return "ollama"
    return "openai-compatible"


def normalized_profile(raw: dict[str, Any], api_key: str | None = None) -> dict[str, Any]:
    api_url = str(raw.get("apiUrl") or raw.get("api_url") or "").strip()
    provider = str(raw.get("provider") or infer_provider(api_url)).strip()
    model_id = str(raw.get("modelId") or raw.get("model_id") or raw.get("model") or "").strip()
    model_name = str(raw.get("modelName") or raw.get("model_name") or raw.get("label") or model_id).strip()
    profile_id = str(raw.get("id") or raw.get("profileId") or raw.get("presetId") or f"api-profile-{provider}-{model_id or 'model'}").strip()
    key = api_key if api_key is not None else str(raw.get("apiKey") or raw.get("api_key") or "").strip()
    return {
        "id": profile_id,
        "name": str(raw.get("name") or raw.get("label") or model_name or profile_id).strip(),
        "apiUrl": api_url,
        "apiKey": key,
        "apiKeyEnv": str(raw.get("apiKeyEnv") or raw.get("api_key_env") or provider_key_env(provider)).strip(),
        "modelId": model_id,
        "modelName": model_name,
        "provider": provider,
        "temperature": raw.get("temperature"),
        "maxTokens": raw.get("maxTokens") if raw.get("maxTokens") is not None else raw.get("max_tokens"),
        "source": str(raw.get("source") or "desktop-provider-switch"),
        "updatedAt": now_iso(),
    }


def safe_profile(profile: dict[str, Any]) -> dict[str, Any]:
    return {**profile, "apiKey": redacted(str(profile.get("apiKey") or ""))}


def provider_catalog() -> list[dict[str, Any]]:
    bridge = import_bridge()
    return bridge.provider_catalog({"limit": 200}).get("presets", [])


def cmd_list(args: argparse.Namespace) -> int:
    presets = provider_catalog()
    query = (args.query or "").strip().lower()
    group = (args.group or "").strip()
    if query:
        presets = [
            preset for preset in presets
            if query in " ".join([
                str(preset.get("id") or ""),
                str(preset.get("label") or ""),
                str(preset.get("model_id") or ""),
                str(preset.get("api_url") or ""),
                str(preset.get("notes") or ""),
            ]).lower()
        ]
    if group:
        presets = [preset for preset in presets if str(preset.get("group") or "") == group]
    for preset in presets[: args.limit]:
        key = "key可选" if preset.get("key_optional") else f"key环境:{preset.get('api_key_env') or '手动'}"
        print(f"{preset.get('id')}\t{preset.get('label')}\t{preset.get('provider')}\t{preset.get('api_url')}\t{preset.get('model_id')}\t{key}")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    path = config_path(args)
    data = read_config(path)
    safe = {
        **data,
        "path": str(path),
        "profiles": [safe_profile(profile) for profile in data.get("profiles", [])],
    }
    print(json.dumps(safe, ensure_ascii=False, indent=2))
    return 0


def build_profile_from_args(args: argparse.Namespace) -> dict[str, Any]:
    raw: dict[str, Any]
    if args.preset:
        bridge = import_bridge()
        raw = bridge.resolve_provider_config({"preset_id": args.preset})
        raw = {
            "id": args.profile_id or raw.get("id"),
            "name": args.name or raw.get("label"),
            "apiUrl": args.api_url or raw.get("api_url"),
            "modelId": args.model_id or raw.get("model_id"),
            "modelName": args.model_name or raw.get("model_name"),
            "provider": args.provider or raw.get("provider"),
            "apiKeyEnv": args.api_key_env or raw.get("api_key_env"),
            "temperature": args.temperature,
            "maxTokens": args.max_tokens,
        }
    else:
        raw = {
            "id": args.profile_id,
            "name": args.name,
            "apiUrl": args.api_url,
            "modelId": args.model_id,
            "modelName": args.model_name,
            "provider": args.provider,
            "apiKeyEnv": args.api_key_env,
            "temperature": args.temperature,
            "maxTokens": args.max_tokens,
        }
    api_key = args.api_key
    if args.api_key_env and not api_key:
        api_key = os.environ.get(args.api_key_env, "")
    profile = normalized_profile(raw, api_key=api_key)
    if not profile["apiUrl"] or not profile["modelId"]:
        raise RuntimeError("apiUrl/modelId are required. Use --preset or provide --api-url and --model-id.")
    return profile


def cmd_apply(args: argparse.Namespace) -> int:
    path = config_path(args)
    data = read_config(path)
    profile = build_profile_from_args(args)
    profiles = data.get("profiles", [])
    profiles = [item for item in profiles if item.get("id") != profile["id"]]
    profiles.insert(0, profile)
    data["profiles"] = profiles[:60]
    data["activeProfileId"] = profile["id"]
    write_config(path, data)
    print(json.dumps({
        "status": "ok",
        "path": str(path),
        "activeProfileId": profile["id"],
        "activeProfile": safe_profile(profile),
        "message": "已写入本机模型配置；重启/刷新织梦写作台后可自动导入，或通过 Gateway provider_config_status 读取。",
    }, ensure_ascii=False, indent=2))
    return 0


def cmd_export_env(args: argparse.Namespace) -> int:
    data = read_config(config_path(args))
    active_id = data.get("activeProfileId")
    active = next((profile for profile in data.get("profiles", []) if profile.get("id") == active_id), None)
    if not active:
        raise RuntimeError("No active Provider profile. Run apply first.")
    env_name = str(active.get("apiKeyEnv") or provider_key_env(str(active.get("provider") or ""))).strip()
    api_key = str(active.get("apiKey") or "").strip()
    if not env_name or not api_key:
        raise RuntimeError("Active profile has no API key/env pair to export.")
    if args.shell == "powershell":
        print(f"$env:{env_name}={json.dumps(api_key)}")
    else:
        print(f"set {env_name}={api_key}")
    return 0


def active_profile(data: dict[str, Any]) -> dict[str, Any] | None:
    active_id = data.get("activeProfileId")
    profiles = data.get("profiles", [])
    return next((profile for profile in profiles if profile.get("id") == active_id), profiles[0] if profiles else None)


def probe_models_from_result(probe: dict[str, Any]) -> list[dict[str, Any]]:
    parsed = probe.get("json")
    if not isinstance(parsed, dict):
        return []
    raw_items = parsed.get("data") if isinstance(parsed.get("data"), list) else parsed.get("models")
    if not isinstance(raw_items, list):
        return []
    models: list[dict[str, Any]] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id") or item.get("name") or item.get("model") or f"model-{index + 1}").strip()
        if not model_id:
            continue
        models.append({
            "id": model_id,
            "displayName": str(item.get("display_name") or item.get("name") or model_id).strip(),
            "ownedBy": str(item.get("owned_by") or item.get("owner") or item.get("provider") or "provider").strip(),
            "type": str(item.get("type") or item.get("object") or "model").strip(),
        })
    return models


def build_probe_profile(args: argparse.Namespace) -> dict[str, Any]:
    has_inline = bool(args.preset or args.api_url or args.model_id or args.provider)
    if has_inline:
        return build_profile_from_args(args)
    profile = active_profile(read_config(config_path(args)))
    if not profile:
        raise RuntimeError("No active Provider profile. Run apply first, or pass --preset/--api-url.")
    return normalized_profile(profile)


def cmd_probe(args: argparse.Namespace) -> int:
    profile = build_probe_profile(args)
    bridge = import_bridge()
    payload = {
        "provider": profile.get("provider"),
        "api_url": profile.get("apiUrl"),
        "model_id": profile.get("modelId"),
        "api_key": args.api_key if args.api_key is not None else profile.get("apiKey", ""),
        "api_key_env": args.api_key_env or profile.get("apiKeyEnv") or provider_key_env(str(profile.get("provider") or "")),
        "execute": True,
        "allow_remote_model": bool(args.allow_remote),
        "timeout_seconds": args.timeout_seconds,
    }
    probe = bridge.provider_probe(payload, "Provider switch model probe", execute_provider=True)
    models = probe_models_from_result(probe)
    print(json.dumps({
        "status": probe.get("status"),
        "reason": probe.get("reason"),
        "url": probe.get("url"),
        "statusCode": probe.get("status_code"),
        "modelCount": probe.get("model_count", len(models)),
        "models": models,
        "config": {
            "provider": profile.get("provider"),
            "apiUrl": profile.get("apiUrl"),
            "modelId": profile.get("modelId"),
            "apiKey": redacted(str(payload.get("api_key") or "")),
            "apiKeyEnv": payload.get("api_key_env"),
            "remoteAllowed": bool(args.allow_remote),
        },
        "message": "模型列表探测完成。" if probe.get("status") == "ok" else "模型列表探测未执行或失败；查看 status/reason。",
    }, ensure_ascii=False, indent=2))
    return 0


def cmd_chat_smoke(args: argparse.Namespace) -> int:
    profile = build_probe_profile(args)
    bridge = import_bridge()
    prompt = (args.prompt or "请用一句中文回复：织梦 Provider 配置可用。").strip()
    payload = {
        "provider": profile.get("provider"),
        "api_url": profile.get("apiUrl"),
        "model_id": profile.get("modelId"),
        "api_key": args.api_key if args.api_key is not None else profile.get("apiKey", ""),
        "api_key_env": args.api_key_env or profile.get("apiKeyEnv") or provider_key_env(str(profile.get("provider") or "")),
        "execute_model": True,
        "allow_remote_model": bool(args.allow_remote),
        "stream_model": bool(args.stream),
        "timeout_seconds": args.timeout_seconds,
        "max_tokens": args.max_tokens or 240,
        "temperature": args.temperature if args.temperature is not None else 0.2,
        "domain": "general",
        "purpose": "Provider switch chat smoke",
        "system_prompt": "你是织梦写作台 Provider 配置冒烟助手。只回答连接测试结果。",
        "task": prompt,
    }
    result = bridge.run_model_worker_task(payload)
    output = str(result.get("output") or "")
    print(json.dumps({
        "status": result.get("status"),
        "reason": result.get("reason"),
        "output": output[:1200],
        "outputChars": result.get("output_chars", len(output)),
        "config": {
            "provider": profile.get("provider"),
            "apiUrl": profile.get("apiUrl"),
            "modelId": profile.get("modelId"),
            "apiKey": redacted(str(payload.get("api_key") or "")),
            "apiKeyEnv": payload.get("api_key_env"),
            "remoteAllowed": bool(args.allow_remote),
            "stream": bool(args.stream),
        },
        "preparedTask": result.get("prepared_task"),
        "message": "聊天冒烟完成。" if result.get("status") == "ok" else "聊天冒烟未执行或失败；查看 status/reason。",
    }, ensure_ascii=False, indent=2))
    return 0


def add_apply_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", help="override provider config path")
    parser.add_argument("--preset", help="preset id from Gateway provider_catalog")
    parser.add_argument("--profile-id", help="local profile id")
    parser.add_argument("--name", help="profile display name")
    parser.add_argument("--provider", choices=["openai-compatible", "anthropic", "gemini", "ollama"], help="provider type")
    parser.add_argument("--api-url", help="API base URL")
    parser.add_argument("--model-id", help="model id")
    parser.add_argument("--model-name", help="model display name")
    parser.add_argument("--api-key", help="one-machine API key saved in local desktop config")
    parser.add_argument("--api-key-env", help="environment variable name for Gateway/model workers")
    parser.add_argument("--temperature", type=float, help="default temperature")
    parser.add_argument("--max-tokens", type=int, help="default max tokens")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="织梦写作台 Provider 配置工具")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="list Provider presets")
    p_list.add_argument("--query", help="filter text")
    p_list.add_argument("--group", choices=["official", "china", "router", "global", "local"], help="preset group")
    p_list.add_argument("--limit", type=int, default=80)

    p_status = sub.add_parser("status", help="show local Provider switch config")
    p_status.add_argument("--config", help="override provider config path")

    p_apply = sub.add_parser("apply", help="apply a Provider preset or manual config")
    add_apply_args(p_apply)

    p_probe = sub.add_parser("probe", help="probe /models using active profile or inline config")
    add_apply_args(p_probe)
    p_probe.add_argument("--allow-remote", action="store_true", help="allow remote provider model-list probe")
    p_probe.add_argument("--timeout-seconds", type=int, default=8)

    p_chat = sub.add_parser("chat-smoke", help="send one minimal chat request with the active Provider profile")
    add_apply_args(p_chat)
    p_chat.add_argument("--prompt", default="请用一句中文回复：织梦 Provider 配置可用。")
    p_chat.add_argument("--allow-remote", action="store_true", help="allow remote provider chat smoke")
    p_chat.add_argument("--stream", action="store_true", help="use streaming mode when supported")
    p_chat.add_argument("--timeout-seconds", type=int, default=12)

    p_export = sub.add_parser("export-env", help="print env command for active profile key")
    p_export.add_argument("--config", help="override provider config path")
    p_export.add_argument("--shell", choices=["powershell", "cmd"], default="powershell")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        if args.command == "list":
            return cmd_list(args)
        if args.command == "status":
            return cmd_status(args)
        if args.command == "apply":
            return cmd_apply(args)
        if args.command == "probe":
            return cmd_probe(args)
        if args.command == "chat-smoke":
            return cmd_chat_smoke(args)
        if args.command == "export-env":
            return cmd_export_env(args)
        raise RuntimeError(f"Unsupported command: {args.command}")
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

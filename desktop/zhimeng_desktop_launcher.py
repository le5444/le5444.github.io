#!/usr/bin/env python3
"""
Windows desktop launcher for Zhimeng Personal OS.

The EXE built from this file starts the local Gateway, serves the built
frontend from dist/, and opens the editor in the user's browser.
"""

from __future__ import annotations

import argparse
import functools
import importlib.util
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


HOST = "127.0.0.1"
GATEWAY_PORT = 8765
UI_PORT = 5173
TRUTHY = {"1", "true", "yes", "on"}

PERMISSION_PROFILES: dict[str, dict[str, Any]] = {
    "safe": {
        "label": "Safe read-only",
        "description": "Read workspace context and run memory/KAIROS observation loops; no direct writes, provider probes, network tools, scheduler, full-access files, or command execution.",
        "gateway": {"execute_read": True, "execute_write": False, "execute_command": False, "execute_scheduler": False, "execute_web": False, "execute_mcp": False, "execute_provider": False, "execute_skill": False, "full_access_files": False},
    },
    "workspace": {
        "label": "Workspace tools",
        "description": "Default desktop mode: workspace read/write tools plus Provider model-list probes and memory/KAIROS observation; web/MCP connectors and full filesystem access stay off.",
        "gateway": {"execute_read": True, "execute_write": True, "execute_command": False, "execute_scheduler": False, "execute_web": False, "execute_mcp": False, "execute_provider": True, "execute_skill": False, "full_access_files": False},
    },
    "network": {
        "label": "Workspace + network connectors",
        "description": "Workspace tools plus Provider model-list probes, gated web_fetch, and HTTP/registered-stdio MCP calls. Remote probes still need per-request approval flags.",
        "gateway": {"execute_read": True, "execute_write": True, "execute_command": False, "execute_scheduler": False, "execute_web": True, "execute_mcp": True, "execute_provider": True, "execute_skill": False, "full_access_files": False},
    },
    "full": {
        "label": "Full filesystem profile",
        "description": "Network profile plus full_access file paths. Dangerous shell remains disabled; file writes still require request execute=true.",
        "gateway": {"execute_read": True, "execute_write": True, "execute_command": False, "execute_scheduler": False, "execute_web": True, "execute_mcp": True, "execute_provider": True, "execute_skill": False, "full_access_files": True},
    },
    "autonomy": {
        "label": "Autonomy profile",
        "description": "Workspace tools plus Provider model-list probes and scheduler permission for reviewed KAIROS plans. Full filesystem and arbitrary shell remain off.",
        "gateway": {"execute_read": True, "execute_write": True, "execute_command": False, "execute_scheduler": True, "execute_web": False, "execute_mcp": False, "execute_provider": True, "execute_skill": False, "full_access_files": False},
    },
    "dev": {
        "label": "Developer verification profile",
        "description": "Workspace tools plus Provider model-list probes, allowlisted verification commands, and reviewed activated Skill runtime. Arbitrary shell remains disabled.",
        "gateway": {"execute_read": True, "execute_write": True, "execute_command": True, "execute_scheduler": False, "execute_web": False, "execute_mcp": False, "execute_provider": True, "execute_skill": True, "full_access_files": False},
    },
}


def app_root() -> Path:
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        candidates = [
            Path(getattr(sys, "_MEIPASS", exe_dir)).resolve(),
            exe_dir,
            exe_dir / "_internal",
        ]
        for candidate in candidates:
            if (candidate / "bridge" / "zhimeng_bridge.py").exists() and (candidate / "dist").exists():
                return candidate
        return candidates[0]
    return Path(__file__).resolve().parents[1]


def port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex((host, port)) == 0


def find_port(host: str, preferred: int) -> int:
    if not port_open(host, preferred):
        return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def http_ok(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=1.5) as response:
            return 200 <= int(response.status) < 300
    except Exception:
        return False


class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        return


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in TRUTHY


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def resolve_permission_profile(profile: str | None) -> dict[str, Any]:
    profile_name = (profile or os.environ.get("ZHIMENG_DESKTOP_PROFILE") or "workspace").strip().lower()
    if profile_name not in PERMISSION_PROFILES:
        raise RuntimeError(f"Unknown desktop permission profile: {profile_name}. Choose one of: {', '.join(sorted(PERMISSION_PROFILES))}")
    selected = PERMISSION_PROFILES[profile_name]
    gateway = dict(selected["gateway"])
    overrides = {
        "execute_read": ("ZHIMENG_EXECUTE_READ", gateway["execute_read"]),
        "execute_write": ("ZHIMENG_EXECUTE_WRITE", gateway["execute_write"]),
        "execute_command": ("ZHIMENG_EXECUTE_COMMAND", gateway["execute_command"]),
        "execute_scheduler": ("ZHIMENG_EXECUTE_SCHEDULER", gateway["execute_scheduler"]),
        "execute_web": ("ZHIMENG_EXECUTE_WEB", gateway["execute_web"]),
        "execute_mcp": ("ZHIMENG_EXECUTE_MCP", gateway["execute_mcp"]),
        "execute_provider": ("ZHIMENG_EXECUTE_PROVIDER", gateway["execute_provider"]),
        "execute_skill": ("ZHIMENG_EXECUTE_SKILL", gateway["execute_skill"]),
        "full_access_files": ("ZHIMENG_FULL_ACCESS_FILES", gateway["full_access_files"]),
    }
    for key, (env_name, default) in overrides.items():
        gateway[key] = env_bool(env_name, bool(default))
    gateway.update({
        "kairos_interval": env_int("ZHIMENG_KAIROS_INTERVAL", 60),
        "autodream_interval": env_int("ZHIMENG_AUTODREAM_INTERVAL", 300),
        "autodream_threshold": env_int("ZHIMENG_AUTODREAM_THRESHOLD", 2),
    })
    return {
        "profile": profile_name,
        "label": selected["label"],
        "description": selected["description"],
        "gateway": gateway,
    }


def frontend_entry(root: Path) -> str:
    dist_dir = root / "dist"
    for name in ["baimeng-editor.html", "index.html"]:
        if (dist_dir / name).exists():
            return name
    raise RuntimeError("dist entry not found. Run npm run build before packaging.")


def import_bridge(root: Path) -> Any:
    bridge_path = root / "bridge" / "zhimeng_bridge.py"
    spec = importlib.util.spec_from_file_location("zhimeng_bridge_desktop", bridge_path)
    if not spec or not spec.loader:
        raise RuntimeError(f"Cannot import Gateway from {bridge_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def start_gateway(root: Path, permission: dict[str, Any], gateway_port: int) -> dict[str, Any]:
    health_url = f"http://{HOST}:{gateway_port}/health"
    if http_ok(health_url):
        return {"status": "already-running", "endpoint": f"http://{HOST}:{gateway_port}/bridge", "profile": permission["profile"], "permissions": permission["gateway"]}
    if port_open(HOST, gateway_port):
        raise RuntimeError(f"Port {gateway_port} is occupied but Gateway health check failed.")
    bridge = import_bridge(root)
    gateway = permission["gateway"]
    thread = threading.Thread(
        target=bridge.serve,
        kwargs={
            "host": HOST,
            "port": gateway_port,
            "execute_read": bool(gateway["execute_read"]),
            "execute_command": bool(gateway["execute_command"]),
            "kairos_interval": int(gateway["kairos_interval"]),
            "autodream_interval": int(gateway["autodream_interval"]),
            "autodream_threshold": int(gateway["autodream_threshold"]),
            "execute_write": bool(gateway["execute_write"]),
            "execute_scheduler": bool(gateway["execute_scheduler"]),
            "execute_web": bool(gateway["execute_web"]),
            "execute_mcp": bool(gateway["execute_mcp"]),
            "execute_provider": bool(gateway["execute_provider"]),
            "execute_skill": bool(gateway["execute_skill"]),
            "full_access_files": bool(gateway["full_access_files"]),
        },
        daemon=True,
    )
    thread.start()
    for _ in range(30):
        if http_ok(health_url):
            return {"status": "started", "endpoint": f"http://{HOST}:{gateway_port}/bridge", "profile": permission["profile"], "permissions": gateway}
        time.sleep(0.2)
    raise RuntimeError("Gateway did not become healthy in time.")


def run_bridge_model_worker_child(root: Path) -> int:
    bridge = import_bridge(root)
    return int(bridge.model_worker_child_main())


def start_frontend(root: Path, ui_port: int) -> dict[str, Any]:
    dist_dir = root / "dist"
    entry = frontend_entry(root)
    port = find_port(HOST, ui_port)
    handler = functools.partial(QuietStaticHandler, directory=str(dist_dir))
    httpd = ThreadingHTTPServer((HOST, port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return {
        "status": "started",
        "url": f"http://{HOST}:{port}/{entry}",
        "entry": entry,
        "port": port,
    }


def run_doctor(root: Path, permission: dict[str, Any]) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    packaged = bool(getattr(sys, "frozen", False))
    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    check("root", root.exists(), str(root))
    check("bridge", (root / "bridge" / "zhimeng_bridge.py").exists(), str(root / "bridge" / "zhimeng_bridge.py"))
    check("dist", (root / "dist").exists(), str(root / "dist"))
    try:
        entry = frontend_entry(root)
        check("frontend_entry", True, entry)
    except Exception as exc:
        check("frontend_entry", False, str(exc))
    if packaged:
        check("packaged_exe", True, str(Path(sys.executable).resolve()))
    else:
        check("pyinstaller_spec", (root / "desktop" / "zhimeng_desktop_launcher.spec").exists(), str(root / "desktop" / "zhimeng_desktop_launcher.spec"))
        check("package_script", (root / "打包织梦PersonalOS桌面版.cmd").exists(), str(root / "打包织梦PersonalOS桌面版.cmd"))
    try:
        import_bridge(root)
        check("gateway_import", True, "bridge imported")
    except Exception as exc:
        check("gateway_import", False, str(exc))
    return {
        "status": "ok" if all(item["ok"] for item in checks) else "needs_attention",
        "root": str(root),
        "permission_profile": permission,
        "checks": checks,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Zhimeng Personal OS desktop launcher")
    parser.add_argument("--profile", choices=sorted(PERMISSION_PROFILES), help="desktop permission profile")
    parser.add_argument("--list-profiles", action="store_true", help="print available permission profiles and exit")
    parser.add_argument("--doctor", action="store_true", help="verify packaged assets and Gateway import without starting services")
    parser.add_argument("--bridge-model-worker-child", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--no-open", action="store_true", help="start services without opening the browser")
    parser.add_argument("--gateway-port", type=int, default=env_int("ZHIMENG_GATEWAY_PORT", GATEWAY_PORT), help="Gateway port")
    parser.add_argument("--ui-port", type=int, default=env_int("ZHIMENG_UI_PORT", UI_PORT), help="frontend preferred port")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    root = app_root()
    if args.bridge_model_worker_child:
        return run_bridge_model_worker_child(root)
    if args.list_profiles:
        print(json.dumps(PERMISSION_PROFILES, ensure_ascii=False, indent=2))
        return 0
    try:
        permission = resolve_permission_profile(args.profile)
        if args.doctor:
            report = run_doctor(root, permission)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0 if report["status"] == "ok" else 1
        gateway = start_gateway(root, permission, int(args.gateway_port))
        frontend = start_frontend(root, int(args.ui_port))
        summary = {
            "app": "Zhimeng Personal OS",
            "root": str(root),
            "permission_profile": permission,
            "gateway": gateway,
            "frontend": frontend,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if not args.no_open:
            webbrowser.open(frontend["url"])
        print("Zhimeng Personal OS is running. Close this window to stop the desktop launcher.")
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        return 0
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False, indent=2))
        if sys.stdin.isatty():
            input("Press Enter to exit...")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

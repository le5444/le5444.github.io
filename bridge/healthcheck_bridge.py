#!/usr/bin/env python3
"""
Healthcheck for the Zhimeng Personal OS Gateway.

Default mode imports zhimeng_bridge.py directly and exercises the same handlers
used by HTTP/MCP. Pass --url http://127.0.0.1:8765 to check a running Gateway.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import threading
import subprocess
import sys
import time
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, List

import zhimeng_bridge as bridge


SUBPROCESS_ENV = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8:replace"}


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def http_json(url: str, method: str = "GET", payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    data = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


class HealthcheckWebHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        body = json.dumps({"status": "ok", "bridge": bridge.BRIDGE_NAME, "path": self.path}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class HealthcheckMcpHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            request = json.loads(raw or "{}")
        except Exception:
            request = {}
        method = request.get("method")
        if method == "tools/list":
            payload = {"jsonrpc": "2.0", "id": request.get("id"), "result": {"tools": [{"name": "healthcheck.echo", "inputSchema": {"type": "object"}}]}}
        elif method == "resources/list":
            payload = {"jsonrpc": "2.0", "id": request.get("id"), "result": {"resources": []}}
        else:
            payload = {"jsonrpc": "2.0", "id": request.get("id"), "error": {"code": -32601, "message": f"unsupported healthcheck method: {method}"}}
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class HealthcheckProviderHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/v1/models":
            payload = {"object": "list", "data": [{"id": "healthcheck-model", "object": "model"}]}
            status = 200
        else:
            payload = {"error": f"unknown path: {self.path}"}
            status = 404
        self._send_json(status, payload)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            request = json.loads(raw or "{}")
        except Exception:
            request = {}
        if self.path.rstrip("/") == "/v1/chat/completions":
            messages = request.get("messages", [])
            user_text = ""
            if isinstance(messages, list):
                for message in reversed(messages):
                    if isinstance(message, dict) and message.get("role") == "user":
                        user_text = str(message.get("content") or "")
                        break
            if request.get("stream"):
                chunks = ["healthcheck-", "model-", f"worker-ok chars={len(user_text)}"]
                delay = 0.0
                try:
                    delay = min(max(float(request.get("healthcheck_delay_seconds") or 0), 0.0), 5.0)
                except Exception:
                    delay = 0.0
                chunk_repeat = 1
                try:
                    chunk_repeat = min(max(int(request.get("healthcheck_chunk_repeat") or 1), 1), 200)
                except Exception:
                    chunk_repeat = 1
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.end_headers()
                for chunk in chunks * chunk_repeat:
                    if delay:
                        time.sleep(delay)
                    payload = {
                        "id": "chatcmpl-healthcheck-stream",
                        "object": "chat.completion.chunk",
                        "model": request.get("model") or "healthcheck-model",
                        "choices": [{"index": 0, "delta": {"content": chunk}, "finish_reason": None}],
                    }
                    try:
                        self.wfile.write(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8"))
                    except (BrokenPipeError, ConnectionResetError):
                        return
                try:
                    self.wfile.write(b"data: [DONE]\n\n")
                except (BrokenPipeError, ConnectionResetError):
                    return
                return
            payload = {
                "id": "chatcmpl-healthcheck",
                "object": "chat.completion",
                "model": request.get("model") or "healthcheck-model",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": f"healthcheck-model-worker-ok chars={len(user_text)}",
                    },
                    "finish_reason": "stop",
                }],
            }
            self._send_json(200, payload)
        else:
            self._send_json(404, {"error": f"unknown path: {self.path}"})


def start_healthcheck_web_server() -> tuple[ThreadingHTTPServer, str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), HealthcheckWebHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    host, port = httpd.server_address
    return httpd, f"http://{host}:{port}/health"


def start_healthcheck_mcp_server() -> tuple[ThreadingHTTPServer, str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), HealthcheckMcpHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    host, port = httpd.server_address
    return httpd, f"http://{host}:{port}/mcp"


def start_healthcheck_provider_server() -> tuple[ThreadingHTTPServer, str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), HealthcheckProviderHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    host, port = httpd.server_address
    return httpd, f"http://{host}:{port}/v1"


def direct_bridge_request(
    action: str,
    payload: Dict[str, Any] | None = None,
    purpose: str = "healthcheck",
    execute_read: bool = False,
    execute_command: bool = False,
    execute_write: bool = False,
    execute_memory: bool = False,
    execute_scheduler: bool = False,
    execute_web: bool = False,
    execute_mcp: bool = False,
    execute_provider: bool = False,
    execute_skill: bool = False,
    full_access_files: bool = False,
    record: bool = False,
) -> Dict[str, Any]:
    return bridge.handle_request(
        {"action": action, "purpose": purpose, "payload": payload or {}},
        execute=execute_read,
        record=record,
        execute_command=execute_command,
        execute_write=execute_write,
        execute_memory=execute_memory,
        execute_scheduler=execute_scheduler,
        execute_web=execute_web,
        execute_mcp=execute_mcp,
        execute_provider=execute_provider,
        execute_skill=execute_skill,
        full_access_files=full_access_files,
    )


def run_direct_checks() -> List[Dict[str, Any]]:
    marker = f"health-{uuid.uuid4().hex[:8]}"
    checks: List[Dict[str, Any]] = []

    def add(name: str, fn: Callable[[], Dict[str, Any]]) -> None:
        result = fn()
        try:
            if len(json.dumps(result, ensure_ascii=False)) > 20000:
                result = {"summary": "large result truncated", "keys": sorted(result.keys()) if isinstance(result, dict) else []}
        except Exception:
            pass
        checks.append({"name": name, "status": "ok", "result": result})

    add("status", lambda: direct_bridge_request("status", {"workflow_id": marker}))

    def mcp_tools() -> Dict[str, Any]:
        init = bridge.handle_mcp_rpc({"jsonrpc": "2.0", "id": "init", "method": "initialize", "params": {"protocolVersion": "2024-11-05"}}, execute=False)
        assert_true(init.get("result", {}).get("capabilities", {}).get("tools") is not None, "MCP initialize should expose tools capability")
        result = bridge.handle_mcp_rpc({"jsonrpc": "2.0", "id": "tools", "method": "tools/list", "params": {}}, execute=False)
        tools = result.get("result", {}).get("tools", [])
        assert_true(len(tools) >= 25, "MCP facade should expose the core tool set")
        tool_names = {item.get("name") for item in tools if isinstance(item, dict)}
        assert_true({"scheduler_install", "scheduler_uninstall"}.issubset(tool_names), "MCP facade should expose scheduler install/uninstall tools")
        assert_true("skill_run" in tool_names, "MCP facade should expose gated activated skill runtime")
        assert_true("web_fetch" in tool_names, "MCP facade should expose bounded web_fetch tool")
        assert_true("mcp_call" in tool_names, "MCP facade should expose bounded mcp_call tool")
        assert_true("mcp_stdio_catalog" in tool_names, "MCP facade should expose stdio MCP catalog tool")
        assert_true({"provider_catalog", "provider_status", "provider_probe"}.issubset(tool_names), "MCP facade should expose provider registry tools")
        resources = bridge.handle_mcp_rpc({"jsonrpc": "2.0", "id": "resources", "method": "resources/list", "params": {}}, execute=False)
        resource_list = resources.get("result", {}).get("resources", [])
        assert_true(len(resource_list) >= 5, "MCP facade should expose resources/list")
        read = bridge.handle_mcp_rpc({"jsonrpc": "2.0", "id": "read", "method": "resources/read", "params": {"uri": "zhimeng://manifest"}}, execute=False)
        assert_true(bool(read.get("result", {}).get("contents", [])), "MCP resources/read should return content")
        completion_read = bridge.handle_mcp_rpc({"jsonrpc": "2.0", "id": "read-completion", "method": "resources/read", "params": {"uri": "zhimeng://completion-audit"}}, execute=False)
        assert_true(bool(completion_read.get("result", {}).get("contents", [])), "MCP completion audit resource should return content")
        prompts = bridge.handle_mcp_rpc({"jsonrpc": "2.0", "id": "prompts", "method": "prompts/list", "params": {}}, execute=False)
        prompt_list = prompts.get("result", {}).get("prompts", [])
        assert_true(len(prompt_list) >= 3, "MCP facade should expose prompts/list")
        prompt = bridge.handle_mcp_rpc({"jsonrpc": "2.0", "id": "prompt", "method": "prompts/get", "params": {"name": "memory_retrieval", "arguments": {"query": marker}}}, execute=False)
        assert_true(bool(prompt.get("result", {}).get("messages", [])), "MCP prompts/get should return messages")
        return {"tool_count": len(tools), "resource_count": len(resource_list), "prompt_count": len(prompt_list)}

    add("mcp_tools", mcp_tools)

    def mcp_stdio() -> Dict[str, Any]:
        request = {"jsonrpc": "2.0", "id": "tools", "method": "tools/list", "params": {}}
        completed = subprocess.run(
            [sys.executable, "zhimeng_mcp_stdio.py", "--once"],
            cwd=str(Path(__file__).resolve().parent),
            input=json.dumps(request, ensure_ascii=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=SUBPROCESS_ENV,
            timeout=10,
            shell=False,
        )
        assert_true(completed.returncode == 0, "stdio MCP facade should exit 0")
        result = json.loads(completed.stdout)
        tools = result.get("result", {}).get("tools", [])
        assert_true(len(tools) >= 25, "stdio MCP facade should expose tools/list")
        return {"tool_count": len(tools)}

    add("mcp_stdio", mcp_stdio)

    def safety() -> Dict[str, Any]:
        result = direct_bridge_request("safety_review", {
            "action": "run_command",
            "purpose": "danger probe",
            "payload": {"command": "rm -rf /"},
        })
        blocked = [item for item in result.get("command_validation", []) if item.get("severity") == "block"]
        assert_true(bool(blocked), "dangerous command should be blocked")
        return {"blocked": [item.get("key") for item in blocked]}

    add("safety_review", safety)

    def source_audit() -> Dict[str, Any]:
        result = direct_bridge_request("source_audit", {
            "sources": [
                {"label": "OpenAI Codex official docs", "url": "https://developers.openai.com/codex/"},
                {"label": "dnakov/claude-code leaked archive", "url": "https://github.com/dnakov/claude-code"},
            ],
        })
        audit = result.get("source_audit", {})
        sources = audit.get("sources", [])
        official = next((item for item in sources if item.get("label") == "OpenAI Codex official docs"), {})
        leaked = next((item for item in sources if "dnakov" in str(item.get("label", "")).lower()), {})
        assert_true(result.get("status") == "ok", "source_audit should succeed")
        assert_true(official.get("source_kind") == "official", "official Codex docs should be classified as official")
        assert_true(leaked.get("source_kind") == "leaked-risk", "known leaked Claude Code archive should be classified as leaked-risk")
        assert_true(leaked.get("reuse_policy") == "non-reusable", "leaked-risk source should be non-reusable")
        assert_true("copy code" in leaked.get("blocked_uses", []), "leaked-risk source should block code copying")
        return {"total": audit.get("summary", {}).get("total"), "non_reusable": audit.get("summary", {}).get("non_reusable")}

    add("source_audit", source_audit)

    def source_digest() -> Dict[str, Any]:
        result = direct_bridge_request("source_digest", {"persist": True})
        envelope = result.get("source_digest", {})
        digest = envelope.get("digest", {})
        assert_true(result.get("status") == "ok", "source_digest should succeed")
        assert_true(digest.get("safe_source_count", 0) >= 5, "source_digest should keep official/open-source sources")
        assert_true(digest.get("blocked_source_count", 0) >= 1, "source_digest should preserve blocked leaked sources")
        assert_true(len(digest.get("patterns", [])) >= 8, "source_digest should produce architecture patterns")
        assert_true(len(digest.get("layers", [])) >= 6, "source_digest should produce Personal OS layers")
        assert_true(bool(digest.get("state_path")), "source_digest should persist research state by default")
        return {"safe": digest.get("safe_source_count"), "blocked": digest.get("blocked_source_count"), "patterns": len(digest.get("patterns", [])), "layers": len(digest.get("layers", []))}

    add("source_digest", source_digest)

    def goal_bootstrap() -> Dict[str, Any]:
        result = direct_bridge_request("goal_bootstrap", {
            "goal_id": f"goal-{marker}",
            "goal": "Build Zhimeng Personal OS from safe public agent architecture patterns.",
            "persist": True,
            "spawn_subagents": True,
            "start_workers": True,
            "kairos": True,
        })
        bootstrap = result.get("goal_bootstrap", {})
        planner = bootstrap.get("planner", {})
        registrations = planner.get("registrations", {})
        phase1_tree = planner.get("phase1_subtask_tree", {})
        source_boundary = planner.get("source_boundary", {})
        assert_true(result.get("status") == "ok", "goal_bootstrap should succeed")
        assert_true(len(planner.get("phases", [])) == 5, "goal_bootstrap should produce five phases")
        assert_true(len(phase1_tree.get("nodes", [])) >= 5, "goal_bootstrap should produce detailed Phase 1 subtasks")
        assert_true(len(planner.get("workflow_nodes", [])) >= 6, "goal_bootstrap should include source gate plus phase nodes")
        assert_true(len(planner.get("subagent_specs", [])) >= 6, "goal_bootstrap should propose bounded subagents")
        assert_true(len(planner.get("worker_plan", [])) >= 5, "goal_bootstrap should propose safe Phase 1 worker jobs")
        assert_true(source_boundary.get("blocked_source_count", 0) >= 1, "goal_bootstrap should preserve leaked/protected source boundary")
        assert_true(bool(registrations.get("workflow")), "goal_bootstrap should register workflow when persist=true")
        workers = registrations.get("workers", [])
        assert_true(len(workers) >= 5, "goal_bootstrap should start allowlisted workers when start_workers=true")
        assert_true(all(item.get("status") in {"starting", "running", "completed"} for item in workers), "goal_bootstrap workers should start without blocking")
        assert_true(bool(registrations.get("kairos_task")), "goal_bootstrap should queue KAIROS task when kairos=true")
        assert_true(bool(planner.get("state_path")), "goal_bootstrap should persist bootstrap state")
        return {
            "phases": len(planner.get("phases", [])),
            "phase1_subtasks": len(phase1_tree.get("nodes", [])),
            "workflow_nodes": len(planner.get("workflow_nodes", [])),
            "subagents": len(planner.get("subagent_specs", [])),
            "workers": len(workers),
            "blocked_sources": source_boundary.get("blocked_source_count"),
            "workflow_id": registrations.get("workflow", {}).get("id") if isinstance(registrations.get("workflow"), dict) else "",
        }

    add("goal_bootstrap", goal_bootstrap)

    def verification_command() -> Dict[str, Any]:
        dry = direct_bridge_request("run_command", {
            "command": "python --version",
            "execute": True,
            "timeout_seconds": 5,
        })
        assert_true(dry.get("status") == "approval_required", "run_command should not execute without execute_command opt-in")
        result = direct_bridge_request("run_command", {
            "command": "python --version",
            "execute": True,
            "timeout_seconds": 5,
        }, execute_command=True)
        execution = result.get("command_execution", {})
        assert_true(result.get("status") == "ok", "allowlisted verification command should execute")
        assert_true(execution.get("returncode") == 0, "allowlisted verification command should return 0")
        blocked = direct_bridge_request("run_command", {
            "command": "python -c print(123)",
            "execute": True,
        }, execute_command=True)
        assert_true(blocked.get("status") == "blocked", "non-allowlisted command should remain blocked")
        return {"dry_status": dry.get("status"), "executed": execution.get("argv"), "blocked": blocked.get("message")}

    add("verification_command", verification_command)

    def file_tools() -> Dict[str, Any]:
        runtime = bridge.runtime_capabilities(
            execute_read=True,
            execute_command=True,
            execute_write=True,
            execute_scheduler=True,
            execute_provider=True,
            execute_skill=True,
            full_access_files=True,
        )
        matrix = runtime.get("tool_matrix", [])
        matrix_actions = {item.get("action") for item in matrix if isinstance(item, dict)}
        assert_true({"read_file", "workspace_scan", "write_file", "run_command", "skill_route", "skill_invoke", "skill_run", "scheduler_install", "web_fetch", "mcp_call", "mcp_stdio_catalog", "provider_catalog"}.issubset(matrix_actions), "runtime capabilities should expose the agent tool matrix")
        assert_true("execute-skill" in str(runtime.get("capability_summary", {}).get("skills", "")), "runtime summary should expose gated activated skill runtime")
        assert_true("presets" in str(runtime.get("capability_summary", {}).get("provider_hub", "")), "runtime summary should expose Provider Hub")
        assert_true("registered" in str(runtime.get("capability_summary", {}).get("mcp_stdio", "")), "runtime summary should expose registered stdio MCP connectors")
        rel_path = f"bridge/healthcheck-write/{marker}.txt"
        content = f"{marker} workspace write tool check\n"
        dry_write = direct_bridge_request("write_file", {
            "path": rel_path,
            "content": content,
            "execute": True,
            "access_profile": "workspace",
        }, "healthcheck write approval draft")
        assert_true(dry_write.get("status") == "approval_required", "write_file should require execute_write before direct writes")
        executed = direct_bridge_request("write_file", {
            "path": rel_path,
            "content": content,
            "execute": True,
            "access_profile": "workspace",
        }, "healthcheck workspace write", execute_write=True)
        assert_true(executed.get("status") == "ok", "write_file should execute inside workspace when execute_write is enabled")
        assert_true(executed.get("write_file", {}).get("created") is True, "write_file should create the healthcheck file")
        read = direct_bridge_request("read_file", {
            "path": rel_path,
            "execute": True,
            "access_profile": "workspace",
        }, "healthcheck workspace read", execute_read=True)
        assert_true(read.get("status") == "ok" and content.strip() in read.get("content", ""), "read_file should read back workspace write")
        dry_scan = direct_bridge_request("workspace_scan", {
            "path": "bridge",
            "execute": True,
            "access_profile": "workspace",
            "limit": 5,
            "max_depth": 1,
        }, "healthcheck workspace scan dry-run")
        assert_true(dry_scan.get("status") == "dry_run", "workspace_scan should dry-run without execute_read")
        scan = direct_bridge_request("workspace_scan", {
            "path": "bridge",
            "execute": True,
            "access_profile": "workspace",
            "limit": 8,
            "max_depth": 1,
        }, "healthcheck workspace scan", execute_read=True)
        items = scan.get("workspace_scan", {}).get("items", [])
        assert_true(scan.get("status") == "ok", "workspace_scan should execute when execute_read is enabled")
        assert_true(isinstance(items, list), "workspace_scan should return an items list")
        assert_true(all("content" not in item for item in items if isinstance(item, dict)), "workspace_scan items must not include file content")
        try:
            blocked_full = direct_bridge_request("read_file", {
                "path": str(Path.home() / "zhimeng-full-access-probe.txt"),
                "execute": True,
                "access_profile": "full_access",
            }, "healthcheck full access blocked", execute_read=True)
        except ValueError as exc:
            blocked_full = {"status": "blocked", "error": str(exc)}
        assert_true("full_access" in json.dumps(blocked_full, ensure_ascii=False), "full_access should require explicit full_access_files")
        try:
            blocked_full_scan = direct_bridge_request("workspace_scan", {
                "path": str(Path.home()),
                "execute": True,
                "access_profile": "full_access",
                "limit": 5,
                "max_depth": 0,
            }, "healthcheck full access scan blocked", execute_read=True)
        except ValueError as exc:
            blocked_full_scan = {"status": "blocked", "error": str(exc)}
        assert_true("full_access" in json.dumps(blocked_full_scan, ensure_ascii=False), "full_access workspace_scan should require explicit full_access_files")
        return {
            "path": rel_path,
            "dry_status": dry_write.get("status"),
            "write_status": executed.get("status"),
            "read_status": read.get("status"),
            "scan_status": scan.get("status"),
            "scan_items": len(items),
            "new_sha256": executed.get("write_file", {}).get("new_sha256"),
            "tool_matrix": sorted(matrix_actions),
        }

    add("file_tools", file_tools)

    def skill_runtime() -> Dict[str, Any]:
        status = direct_bridge_request("skill_status", {"limit": 10}, "healthcheck skill status")
        activated = status.get("skills", {}).get("recent_activated", [])
        if not activated:
            created = direct_bridge_request("skill_crystallize", {"dimension": "tool", "limit": 1, "force": True}, "healthcheck create runtime skill")
            candidate = (created.get("skills", {}).get("created") or [{}])[0]
            activation = direct_bridge_request("skill_activate", {"candidate_id": candidate.get("id"), "reviewed_by": "healthcheck"}, "healthcheck activate runtime skill")
            activated_candidate = activation.get("skills", {}).get("activated", {})
        else:
            activated_candidate = activated[0]
        candidate_id = str(activated_candidate.get("id") or "")
        activated_path = str(activated_candidate.get("activated_path") or "")
        assert_true(candidate_id or activated_path, "healthcheck should have an activated skill candidate")
        dry = direct_bridge_request("skill_run", {
            "candidate_id": candidate_id,
            "activated_path": activated_path,
            "task": marker,
            "execute": True,
            "timeout_seconds": 5,
        }, "healthcheck skill runtime dry")
        assert_true(dry.get("status") == "approval_required", "skill_run should require execute_skill before runtime execution")
        executed = direct_bridge_request("skill_run", {
            "candidate_id": candidate_id,
            "activated_path": activated_path,
            "task": marker,
            "execute": True,
            "timeout_seconds": 5,
        }, "healthcheck skill runtime execute", execute_skill=True)
        run = executed.get("skill_run", {})
        output = run.get("output", {}) if isinstance(run.get("output"), dict) else {}
        assert_true(executed.get("status") == "ok", "skill_run should execute with execute_skill and execute=true")
        assert_true(run.get("returncode") == 0, "skill_run subprocess should return 0")
        assert_true(output.get("goal") == marker or output.get("status") in {"activated", "ok"}, "skill_run should return structured skill output")
        return {
            "dry_status": dry.get("status"),
            "run_status": run.get("status"),
            "returncode": run.get("returncode"),
            "candidate_id": candidate_id,
            "activated_path": activated_path,
        }

    add("skill_runtime", skill_runtime)

    def web_fetch() -> Dict[str, Any]:
        httpd, url = start_healthcheck_web_server()
        try:
            dry = direct_bridge_request("web_fetch", {
                "url": url,
                "execute": True,
                "allow_private_network": True,
                "timeout_seconds": 5,
            }, "healthcheck web fetch dry-run")
            assert_true(dry.get("status") == "approval_required", "web_fetch should not execute without execute_web opt-in")
            blocked_private = None
            try:
                blocked_private = direct_bridge_request("web_fetch", {
                    "url": url,
                    "execute": True,
                    "timeout_seconds": 5,
                }, "healthcheck private network block", execute_web=True)
            except ValueError as exc:
                blocked_private = {"status": "blocked", "error": str(exc)}
            assert_true("private" in json.dumps(blocked_private, ensure_ascii=False).lower(), "web_fetch should require allow_private_network for localhost/private hosts")
            executed = direct_bridge_request("web_fetch", {
                "url": url,
                "execute": True,
                "allow_private_network": True,
                "timeout_seconds": 5,
                "max_chars": 2000,
            }, "healthcheck local web fetch", execute_web=True)
            fetch = executed.get("web_fetch", {})
            assert_true(executed.get("status") == "ok", "web_fetch should execute when execute_web and execute=true are set")
            assert_true(fetch.get("status_code") == 200, "web_fetch local health should return HTTP 200")
            assert_true("Zhimeng Personal OS Bridge" in fetch.get("text", ""), "web_fetch should return bounded response text")
            return {"dry_status": dry.get("status"), "executed_status": executed.get("status"), "status_code": fetch.get("status_code"), "truncated": fetch.get("truncated")}
        finally:
            httpd.shutdown()

    add("web_fetch", web_fetch)

    def mcp_call() -> Dict[str, Any]:
        httpd, endpoint = start_healthcheck_mcp_server()
        try:
            dry = direct_bridge_request("mcp_call", {
                "endpoint": endpoint,
                "method": "tools/list",
                "execute": True,
                "allow_private_network": True,
                "timeout_seconds": 5,
            }, "healthcheck mcp call dry-run")
            assert_true(dry.get("status") == "approval_required", "mcp_call should not execute without execute_mcp opt-in")
            blocked_private = None
            try:
                blocked_private = direct_bridge_request("mcp_call", {
                    "endpoint": endpoint,
                    "method": "tools/list",
                    "execute": True,
                    "timeout_seconds": 5,
                }, "healthcheck mcp private network block", execute_mcp=True)
            except ValueError as exc:
                blocked_private = {"status": "blocked", "error": str(exc)}
            assert_true("private" in json.dumps(blocked_private, ensure_ascii=False).lower(), "mcp_call should require allow_private_network for localhost/private hosts")
            executed = direct_bridge_request("mcp_call", {
                "endpoint": endpoint,
                "method": "tools/list",
                "params": {},
                "execute": True,
                "allow_private_network": True,
                "timeout_seconds": 5,
                "max_chars": 2000,
            }, "healthcheck local mcp call", execute_mcp=True)
            call = executed.get("mcp_call", {})
            response = call.get("jsonrpc_response", {})
            tools = response.get("result", {}).get("tools", []) if isinstance(response, dict) else []
            assert_true(executed.get("status") == "ok", "mcp_call should execute when execute_mcp and execute=true are set")
            assert_true(call.get("status_code") == 200, "mcp_call local endpoint should return HTTP 200")
            assert_true(any(item.get("name") == "healthcheck.echo" for item in tools if isinstance(item, dict)), "mcp_call should parse JSON-RPC tools/list response")
            return {"dry_status": dry.get("status"), "executed_status": executed.get("status"), "status_code": call.get("status_code"), "tool_count": len(tools)}
        finally:
            httpd.shutdown()

    add("mcp_call", mcp_call)

    def mcp_stdio_connector() -> Dict[str, Any]:
        catalog_result = direct_bridge_request("mcp_stdio_catalog", {})
        catalog = catalog_result.get("mcp_stdio_catalog", {})
        servers = catalog.get("servers", [])
        assert_true(catalog_result.get("status") == "ok", "mcp_stdio_catalog should succeed")
        assert_true(any(item.get("server_id") == "zhimeng-local" for item in servers if isinstance(item, dict)), "stdio catalog should include zhimeng-local")

        dry = direct_bridge_request("mcp_call", {
            "transport": "stdio",
            "server_id": "zhimeng-local",
            "method": "tools/list",
            "params": {},
            "execute": True,
            "timeout_seconds": 10,
        }, "healthcheck stdio mcp dry-run")
        assert_true(dry.get("status") == "approval_required", "stdio mcp_call should not execute without execute_mcp opt-in")

        unknown_blocked = None
        try:
            unknown_blocked = direct_bridge_request("mcp_call", {
                "transport": "stdio",
                "server_id": "unknown-local",
                "method": "tools/list",
                "params": {},
                "execute": True,
                "timeout_seconds": 10,
            }, "healthcheck stdio unknown block", execute_mcp=True)
        except ValueError as exc:
            unknown_blocked = {"status": "blocked", "error": str(exc)}
        assert_true("unknown" in json.dumps(unknown_blocked, ensure_ascii=False).lower(), "unknown stdio MCP server_id should be blocked")

        executed = direct_bridge_request("mcp_call", {
            "transport": "stdio",
            "server_id": "zhimeng-local",
            "method": "tools/list",
            "params": {},
            "execute": True,
            "timeout_seconds": 10,
            "max_chars": 12000,
        }, "healthcheck stdio mcp connector", execute_mcp=True)
        call = executed.get("mcp_call", {})
        response = call.get("jsonrpc_response", {})
        tools = response.get("result", {}).get("tools", []) if isinstance(response, dict) else []
        assert_true(executed.get("status") == "ok", "registered stdio mcp_call should execute with execute_mcp")
        assert_true(call.get("transport") == "stdio", "stdio mcp_call should report transport=stdio")
        assert_true(any(item.get("name") == "status" for item in tools if isinstance(item, dict)), "stdio mcp_call should return Gateway tools/list")
        return {
            "catalog_servers": [item.get("server_id") for item in servers if isinstance(item, dict)],
            "dry_status": dry.get("status"),
            "executed_status": executed.get("status"),
            "transport": call.get("transport"),
            "tool_count": len(tools),
        }

    add("mcp_stdio_connector", mcp_stdio_connector)

    def provider_registry() -> Dict[str, Any]:
        catalog_result = direct_bridge_request("provider_catalog", {"limit": 80})
        catalog = catalog_result.get("provider_catalog", {})
        assert_true(catalog_result.get("status") == "ok", "provider_catalog should succeed")
        assert_true(catalog.get("preset_count", 0) >= 30, "provider_catalog should expose the preset mirror")
        provider_ids = {item.get("id") for item in catalog.get("providers", []) if isinstance(item, dict)}
        assert_true({"openai-compatible", "anthropic", "gemini", "ollama"}.issubset(provider_ids), "provider_catalog should cover all frontend provider types")
        preset_ids = {item.get("id") for item in catalog.get("presets", []) if isinstance(item, dict)}
        assert_true("ollama-qwen" in preset_ids, "provider_catalog should include local Ollama preset")

        local_status_result = direct_bridge_request("provider_status", {"preset_id": "ollama-qwen"})
        local_status = local_status_result.get("provider_status", {})
        local_readiness = local_status.get("readiness", {})
        assert_true(local_status_result.get("status") == "ok", "provider_status local preset should succeed")
        assert_true(local_readiness.get("local_endpoint") is True, "Ollama status should be local")
        assert_true(local_readiness.get("key_required") is False, "Ollama status should not require an API key")

        remote_status_result = direct_bridge_request("provider_status", {"preset_id": "openai-gpt-4o-mini"})
        remote_status = remote_status_result.get("provider_status", {})
        remote_readiness = remote_status.get("readiness", {})
        assert_true(remote_status_result.get("status") == "ok", "provider_status remote preset should succeed")
        assert_true(remote_readiness.get("remote_endpoint") is True, "OpenAI preset should be remote")
        assert_true(remote_readiness.get("key_required") is True, "Remote provider should require a key")
        assert_true(remote_readiness.get("remote_requires_allow_remote_model") is True, "Remote provider should require allow_remote_model")

        dry_probe = direct_bridge_request("provider_probe", {"preset_id": "ollama-qwen"})
        assert_true(dry_probe.get("status") == "approval_required", "provider_probe should require payload.execute=true")
        blocked_remote = direct_bridge_request("provider_probe", {"preset_id": "openai-gpt-4o-mini", "execute": True})
        assert_true(blocked_remote.get("status") == "approval_required", "provider_probe should require execute_provider before any probe")
        blocked_remote_with_gate = direct_bridge_request("provider_probe", {"preset_id": "openai-gpt-4o-mini", "execute": True}, execute_provider=True)
        assert_true(blocked_remote_with_gate.get("status") == "approval_required", "provider_probe should block remote probes without allow_remote_model")

        httpd, api_url = start_healthcheck_provider_server()
        try:
            local_probe = direct_bridge_request("provider_probe", {
                "provider": "openai-compatible",
                "api_url": api_url,
                "model_id": "healthcheck-model",
                "execute": True,
                "timeout_seconds": 5,
            }, execute_provider=True)
            probe = local_probe.get("provider_probe", {})
            assert_true(local_probe.get("status") == "ok", "provider_probe should execute against local provider endpoint")
            assert_true(probe.get("status_code") == 200, "provider_probe local endpoint should return HTTP 200")
            assert_true(probe.get("model_count") == 1, "provider_probe should count local models")

            queued_probe = direct_bridge_request("provider_probe", {
                "provider": "openai-compatible",
                "api_url": api_url,
                "model_id": "healthcheck-model",
                "timeout_seconds": 5,
            }, "healthcheck provider probe approval queue", record=True)
            assert_true(queued_probe.get("status") == "approval_required", "provider_probe should queue an approval when execute=false")
            queued_probe_id = str(queued_probe.get("approval_id") or "")
            assert_true(bool(queued_probe_id), "provider_probe approval should return an approval_id")
            dry_decision = direct_bridge_request("approval_decide", {
                "approval_id": queued_probe_id,
                "decision": "execute",
                "reason": "healthcheck dry provider probe approval",
            }, "healthcheck provider probe approval dry")
            assert_true(dry_decision.get("status") == "approval_required", "provider_probe approval execution should require execute_provider")
            executed_decision = direct_bridge_request("approval_decide", {
                "approval_id": queued_probe_id,
                "decision": "execute",
                "reason": "healthcheck execute provider probe approval",
            }, "healthcheck provider probe approval execute", execute_provider=True)
            provider_execution = executed_decision.get("approval_decide", {}).get("provider_probe", {})
            assert_true(executed_decision.get("status") == "ok", "provider_probe approval should execute with execute_provider")
            assert_true(provider_execution.get("model_count") == 1, "executed provider_probe approval should count local models")
        finally:
            httpd.shutdown()

        return {
            "preset_count": catalog.get("preset_count"),
            "providers": sorted(provider_ids),
            "local_key_required": local_readiness.get("key_required"),
            "remote_requires_allow": remote_readiness.get("remote_requires_allow_remote_model"),
            "local_probe_models": probe.get("model_count"),
            "approval_probe_models": provider_execution.get("model_count"),
        }

    add("provider_registry", provider_registry)

    def sandbox() -> Dict[str, Any]:
        result = direct_bridge_request("sandbox_probe", {"probes": ["python"], "timeout_seconds": 5})
        assert_true(result.get("status") == "ok", "sandbox_probe should succeed")
        probes = result.get("sandbox", {}).get("results", [])
        assert_true(any(item.get("status") == "ok" for item in probes), "python sandbox probe should return ok")
        status = direct_bridge_request("sandbox_status", {})
        assert_true(status.get("sandbox", {}).get("arbitrary_commands") == "disabled", "arbitrary commands should remain disabled")
        return {"probes": probes, "mode": status.get("sandbox", {}).get("mode")}

    add("sandbox_probe", sandbox)

    def rust_core() -> Dict[str, Any]:
        root = Path(__file__).resolve().parents[1]
        manifest = root / "bridge" / "rust-core" / "Cargo.toml"
        main_rs = root / "bridge" / "rust-core" / "src" / "main.rs"
        assert_true(manifest.exists(), "Rust wrapper Cargo.toml should exist")
        assert_true(main_rs.exists(), "Rust wrapper main.rs should exist")
        cargo = shutil.which("cargo")
        if not cargo:
            return {"status": "toolchain_missing", "manifest": str(manifest.relative_to(root))}
        completed = subprocess.run(
            [cargo, "metadata", "--manifest-path", str(manifest), "--no-deps", "--format-version", "1"],
            cwd=str(root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
            shell=False,
        )
        assert_true(completed.returncode == 0, "cargo metadata should pass when cargo is installed")
        return {"status": "metadata_ok", "manifest": str(manifest.relative_to(root))}

    add("rust_core", rust_core)

    def desktop_launcher() -> Dict[str, Any]:
        root = Path(__file__).resolve().parents[1]
        launcher = root / "desktop" / "zhimeng_desktop_launcher.py"
        spec = root / "desktop" / "zhimeng_desktop_launcher.spec"
        package_cmd = root / "打包织梦PersonalOS桌面版.cmd"
        assert_true(launcher.exists(), "desktop launcher should exist")
        assert_true(spec.exists(), "PyInstaller spec should exist")
        assert_true(package_cmd.exists(), "desktop packaging command should exist")

        profiles = subprocess.run(
            [sys.executable, str(launcher), "--list-profiles"],
            cwd=str(root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=SUBPROCESS_ENV,
            timeout=10,
            shell=False,
        )
        assert_true(profiles.returncode == 0, "desktop launcher should list permission profiles")
        profile_data = json.loads(profiles.stdout)
        assert_true({"safe", "workspace", "network", "full", "autonomy", "dev"}.issubset(set(profile_data)), "desktop launcher should expose all expected permission profiles")

        doctor = subprocess.run(
            [sys.executable, str(launcher), "--doctor", "--profile", "network"],
            cwd=str(root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=SUBPROCESS_ENV,
            timeout=15,
            shell=False,
        )
        assert_true(doctor.returncode == 0, "desktop launcher doctor should pass")
        report = json.loads(doctor.stdout)
        checks = report.get("checks", [])
        assert_true(report.get("status") == "ok", "desktop doctor should report ok")
        assert_true(all(item.get("ok") for item in checks if isinstance(item, dict)), "desktop doctor checks should all pass")
        permission = report.get("permission_profile", {})
        gateway = permission.get("gateway", {}) if isinstance(permission, dict) else {}
        assert_true(gateway.get("execute_web") is True and gateway.get("execute_mcp") is True, "network profile should enable web and MCP connectors")

        text = package_cmd.read_text(encoding="utf-8", errors="replace")
        assert_true("--doctor" in text and "--profile network" in text, "packaging script should run packaged doctor and document profiles")
        return {
            "profiles": sorted(profile_data),
            "doctor_status": report.get("status"),
            "entry": next((item.get("detail") for item in checks if isinstance(item, dict) and item.get("name") == "frontend_entry"), ""),
            "network_profile": {"execute_web": gateway.get("execute_web"), "execute_mcp": gateway.get("execute_mcp")},
        }

    add("desktop_launcher", desktop_launcher)

    def phase_audit() -> Dict[str, Any]:
        result = direct_bridge_request("phase_audit", {})
        audit = result.get("phase_audit", {})
        phases = audit.get("phases", [])
        assert_true(result.get("status") == "ok", "phase_audit should succeed")
        assert_true(audit.get("status") in {"pass", "partial"}, "phase_audit should report overall status")
        assert_true(len(phases) == 5, "phase_audit should report five phases")
        assert_true(any(phase.get("gaps") for phase in phases), "phase_audit should preserve known implementation gaps")
        return {"overall": audit.get("status"), "summary": audit.get("summary")}

    add("phase_audit", phase_audit)

    def completion_audit() -> Dict[str, Any]:
        result = direct_bridge_request("completion_audit", {})
        audit = result.get("completion_audit", {})
        requirements = audit.get("requirements", [])
        known_limits = set(audit.get("known_limits", []))
        assert_true(result.get("status") == "ok", "completion_audit should succeed")
        assert_true(audit.get("status") == "partial", "completion_audit should report partial until production gaps are closed")
        assert_true(len(requirements) >= 10, "completion_audit should report a broad requirement matrix")
        assert_true("model_worker_executor_live_unverified" not in known_limits, "completion_audit should no longer report live model worker verification gap")
        remaining_gaps = [str(item.get("gap") or "") for item in audit.get("remaining_gaps", []) if isinstance(item, dict)]
        assert_true(not any("model_worker_hard_cancel" in gap for gap in remaining_gaps), "completion_audit should no longer report model worker hard-cancel gap")
        assert_true("production_mcp_transport" in known_limits, "completion_audit should preserve production MCP transport gap")
        assert_true("scheduler_install_requires_explicit_gate" in known_limits, "completion_audit should preserve scheduler execution gate")
        assert_true(any(item.get("id") == "source_integrity_boundary" and item.get("status") == "proven" for item in requirements), "completion_audit should prove source integrity boundary")
        assert_true(any(item.get("id") == "model_worker_executor" and item.get("status") == "proven" for item in requirements), "completion_audit should prove model worker executor")
        return {"overall": audit.get("status"), "summary": audit.get("summary"), "known_limits": sorted(known_limits)}

    add("completion_audit", completion_audit)

    def user_model() -> Dict[str, Any]:
        claim = direct_bridge_request("user_model_event", {
            "dimension": "preference",
            "stance": "claim",
            "source": "healthcheck",
            "summary": "User prefers agent work to be evidence-backed and not merely prompt stuffing.",
            "confidence": 0.7,
        })
        assert_true(claim.get("status") == "ok", "user_model_event claim should succeed")
        counter = direct_bridge_request("user_model_event", {
            "dimension": "preference",
            "stance": "counterexample",
            "source": "healthcheck",
            "summary": "User may still accept lightweight summaries when implementation is already verified.",
            "confidence": 0.4,
        })
        assert_true(counter.get("status") == "ok", "user_model_event counterexample should succeed")
        reflection = direct_bridge_request("user_model_reflect", {"dimension": "preference"}, "healthcheck honcho reflection")
        assert_true(reflection.get("status") == "ok", "user_model_reflect should succeed")
        created = reflection.get("user_model", {}).get("created", [])
        assert_true(bool(created), "user_model_reflect should create a tentative belief")
        status = direct_bridge_request("user_model_status", {"dimension": "preference"})
        assert_true(status.get("status") == "ok", "user_model_status should succeed")
        return {"created": len(created), "belief_count": status.get("user_model", {}).get("belief_count")}

    add("user_model", user_model)

    def memory() -> Dict[str, Any]:
        event = direct_bridge_request("memory_event", {
            "dimension": "tool",
            "source": "healthcheck",
            "summary": f"{marker} verified Gateway memory_event.",
            "tags": ["healthcheck", "gateway"],
            "importance": 3,
        })
        assert_true(event.get("status") == "ok", "memory_event should succeed")
        tick = bridge.autodream_tick_once(threshold=1)
        status = direct_bridge_request("memory_status", {"dimension": "tool"})
        assert_true(status.get("status") == "ok", "memory_status should succeed")
        retrieved = direct_bridge_request("memory_retrieve", {"query": marker, "dimension": "tool", "limit": 3})
        assert_true(retrieved.get("status") == "ok", "memory_retrieve should succeed")
        context_pack = retrieved.get("memory_retrieve", {}).get("context_pack", [])
        assert_true(bool(context_pack), "memory_retrieve should return a compact context pack")
        bootstrap = direct_bridge_request("memory_bootstrap", {
            "goal": f"{marker} Personal OS memory bootstrap",
            "query": marker,
            "limit": 6,
        })
        memory_bootstrap = bootstrap.get("memory_bootstrap", {})
        evidence = memory_bootstrap.get("evidence", {})
        assert_true(bootstrap.get("status") == "ok", "memory_bootstrap should succeed")
        assert_true(evidence.get("seeded_l1_events", 0) >= 5, "memory_bootstrap should seed L1 events")
        assert_true(evidence.get("created_l2_summaries", 0) >= 1, "memory_bootstrap should create L2 summaries")
        assert_true(evidence.get("retrieved_context_pack", 0) >= 1, "memory_bootstrap should retrieve context pack evidence")
        managed_id = f"mem-{marker}-approval-exec"
        managed = direct_bridge_request("memory_event", {
            "event_id": managed_id,
            "dimension": "tool",
            "source": "healthcheck",
            "summary": f"{marker} memory approval before.",
            "tags": ["healthcheck", "memory-approval"],
            "importance": 2,
        }, "healthcheck memory approval seed")
        assert_true(managed.get("status") == "ok", "memory approval seed event should succeed")
        approval = direct_bridge_request("memory_update", {
            "target_id": managed_id,
            "target_kind": "L1",
            "dimension": "tool",
            "patch": {
                "summary": f"{marker} memory approval after.",
                "tags": ["healthcheck", "memory-approval", "executed"],
                "importance": 4,
            },
            "reason": "healthcheck memory approval execution",
        }, "healthcheck memory approval queue")
        assert_true(approval.get("status") == "approval_required", "memory_update should queue an approval")
        approval_id = str(approval.get("approval_id") or "")
        dry_decision = direct_bridge_request("approval_decide", {
            "approval_id": approval_id,
            "decision": "execute",
            "reason": "healthcheck dry memory approval execution",
        }, "healthcheck memory approval dry")
        assert_true(dry_decision.get("status") == "approval_required", "memory approval execution should require execute_memory")
        executed_decision = direct_bridge_request("approval_decide", {
            "approval_id": approval_id,
            "decision": "execute",
            "reason": "healthcheck execute memory approval",
        }, "healthcheck memory approval execute", execute_memory=True)
        memory_execution = executed_decision.get("approval_decide", {}).get("memory_management", {})
        assert_true(executed_decision.get("status") == "ok", "memory approval execution should succeed with execute_memory")
        assert_true(memory_execution.get("operation") == "updated", "memory approval should update the target record")
        assert_true(bool(memory_execution.get("backup_path")), "memory approval should create an AutoDream backup")
        updated = bridge.find_memory_record(bridge.load_memory_state(), managed_id, "L1")
        assert_true(updated.get("record", {}).get("summary") == f"{marker} memory approval after.", "memory approval should persist the patched summary")
        backup_status = direct_bridge_request("memory_backup_status", {"limit": 5}, "healthcheck memory backup status")
        backups = backup_status.get("memory_backup_status", {}).get("backups", [])
        assert_true(backup_status.get("status") == "ok", "memory_backup_status should succeed")
        assert_true(bool(backups), "memory_backup_status should list at least one backup after memory approval execution")
        restore_backup_name = str(backups[0].get("name") or "")
        restore_approval = direct_bridge_request("memory_restore", {
            "backup_name": restore_backup_name,
            "reason": "healthcheck memory restore approval draft only",
        }, "healthcheck memory restore queue")
        assert_true(restore_approval.get("status") == "approval_required", "memory_restore should queue an approval")
        restore_proposal = restore_approval.get("memory_management", {})
        assert_true(restore_proposal.get("target_kind") == "state", "memory_restore proposal should target AutoDream state")
        assert_true(restore_proposal.get("backup_name") == restore_backup_name, "memory_restore proposal should include the selected backup name")
        return {
            "autodream": tick.get("status"),
            "pending": status.get("memory", {}).get("pending_count"),
            "retrieved": len(context_pack),
            "bootstrap_l1": evidence.get("seeded_l1_events"),
            "bootstrap_l2": evidence.get("created_l2_summaries"),
            "approval_dry": dry_decision.get("status"),
            "approval_execute": memory_execution.get("operation"),
            "approval_backup": memory_execution.get("backup_path"),
            "backup_count": backup_status.get("memory_backup_status", {}).get("count"),
            "restore_approval": restore_approval.get("status"),
        }

    add("memory_autodream", memory)

    def skill_router() -> Dict[str, Any]:
        result = direct_bridge_request("skill_route", {
            "task": "开始构思小说世界观",
            "domain": "writing",
            "current_text": "需要长篇网文的世界观、人物状态、伏笔和黄金三章。",
        }, "healthcheck writing skill route")
        assert_true(result.get("status") == "ok", "skill_route should succeed")
        route = result.get("skill_route", {})
        active_keys = {item.get("key") for item in route.get("active_core_skills", [])}
        expected = {"novel-creation-suite", "novel-kb-manager", "novel-distillation", "tomato-novel-auto-distill"}
        assert_true(expected.issubset(active_keys), "skill_route should activate the four core novel skills for writing")
        assert_true("run_command" in route.get("excluded_tool_scopes", []), "writing route should exclude command execution scope")
        assert_true("route-only" in route.get("schema", {}).get("execution", ""), "skill_route should be route-only")
        local_library = route.get("local_library", {})
        assert_true(isinstance(local_library.get("roots", []), list), "skill_route should report local/built-in skill roots")
        return {
            "domain": route.get("domain"),
            "active": sorted(active_keys),
            "local_skills": local_library.get("skill_count"),
            "local_roots": len(local_library.get("roots", [])),
            "excluded_tool_scopes": route.get("excluded_tool_scopes", []),
            "execution": route.get("schema", {}).get("execution"),
        }

    add("skill_router", skill_router)

    def skill_bootstrap() -> Dict[str, Any]:
        result = direct_bridge_request("skill_bootstrap", {
            "task": "开始构思小说世界观",
            "domain": "writing",
            "current_text": "需要长篇网文的世界观、人物状态、伏笔和黄金三章。",
            "persist": True,
            "spawn_subagents": True,
        }, "healthcheck skill bootstrap")
        bootstrap = result.get("skill_bootstrap", {})
        evidence = bootstrap.get("evidence", {})
        assert_true(result.get("status") == "ok", "skill_bootstrap should succeed")
        assert_true(bootstrap.get("domain") == "writing", "skill_bootstrap should resolve writing domain")
        assert_true(evidence.get("mounted_novel_skills", 0) >= 4, "skill_bootstrap should mount the four core novel skills")
        assert_true(evidence.get("excluded_command_scope") is True, "skill_bootstrap should exclude run_command")
        assert_true(evidence.get("context_pack_ready") is True, "skill_bootstrap should prepare a context pack")
        assert_true(evidence.get("domain_agent_count", 0) >= 4, "skill_bootstrap should prepare bounded writing domain agents")
        assert_true(evidence.get("execution") == "skill-domain-mount-no-import-no-script-exec", "skill_bootstrap should remain prompt-only")
        registrations = bootstrap.get("registrations", {})
        assert_true(bool(registrations.get("workflow")), "skill_bootstrap should register workflow when persist=true")
        assert_true(len(registrations.get("subagents", [])) >= 4, "skill_bootstrap should register subagents when spawn_subagents=true")
        return {
            "domain": bootstrap.get("domain"),
            "mounted": evidence.get("mounted_novel_skills"),
            "expected": evidence.get("expected_novel_skills"),
            "excluded": evidence.get("excluded_tool_scopes"),
            "agents": evidence.get("domain_agent_count"),
            "context_items": evidence.get("retrieved_context_items"),
            "workflow_id": bootstrap.get("workflow_hook", {}).get("workflow_id"),
        }

    add("skill_bootstrap", skill_bootstrap)

    def skill_invoker() -> Dict[str, Any]:
        result = direct_bridge_request("skill_invoke", {
            "skill_key": "novel-creation-suite",
            "task": "开始构思小说世界观",
            "domain": "writing",
            "current_text": "需要安全调用小说全链路创作套件，但不能执行任何脚本。",
        }, "healthcheck skill invocation")
        assert_true(result.get("status") == "ok", "skill_invoke should succeed")
        invoke = result.get("skill_invoke", {})
        assert_true(invoke.get("schema", {}).get("execution") == "prompt-only-no-import-no-script-exec", "skill_invoke should remain prompt-only")
        assert_true(invoke.get("schema", {}).get("skill_key") == "novel-creation-suite", "skill_invoke should select requested core skill")
        assert_true(bool(invoke.get("invocation_prompt")), "skill_invoke should return an invocation prompt")
        assert_true(any(item.get("action") == "context_pack" for item in invoke.get("next_bridge_actions", [])), "skill_invoke should suggest context_pack next")
        return {
            "skill": invoke.get("schema", {}).get("skill_key"),
            "execution": invoke.get("schema", {}).get("execution"),
            "context_items": len(invoke.get("context_pack", [])),
        }

    add("skill_invoker", skill_invoker)

    def agent_context_pack() -> Dict[str, Any]:
        result = direct_bridge_request("context_pack", {
            "task": "开始构思小说世界观",
            "domain": "writing",
            "dimension": "skill",
            "limit": 4,
            "current_text": "需要自动挂载小说技能、检索紧凑记忆包，并隔离命令执行。",
        }, "healthcheck agent context pack")
        assert_true(result.get("status") == "ok", "context_pack should succeed")
        pack = result.get("context_pack", {})
        active = set(pack.get("active_skill_keys", []))
        assert_true("novel-creation-suite" in active, "context_pack should include novel-creation-suite")
        assert_true("memory_retrieve" in pack.get("schema", {}).get("uses", []), "context_pack should use memory_retrieve")
        assert_true("skill_route" in pack.get("schema", {}).get("uses", []), "context_pack should use skill_route")
        assert_true("run_command" in pack.get("tool_policy", {}).get("excluded_tool_scopes", []), "writing context_pack should exclude run_command")
        return {
            "domain": pack.get("task", {}).get("domain"),
            "active_skill_keys": sorted(active),
            "context_items": len(pack.get("context_pack", [])),
            "excluded": pack.get("tool_policy", {}).get("excluded_tool_scopes", []),
        }

    add("agent_context_pack", agent_context_pack)

    def skill_crystallizer() -> Dict[str, Any]:
        result = direct_bridge_request("skill_crystallize", {"dimension": "tool", "limit": 1}, "healthcheck skill crystallization")
        assert_true(result.get("status") == "ok", "skill_crystallize should succeed")
        created = result.get("skills", {}).get("created", [])
        assert_true(bool(created), "skill_crystallize should create at least one draft from fresh L2 memory")
        draft_path = created[0].get("draft_path")
        assert_true(bool(draft_path), "skill candidate should include draft_path")
        candidate_id = created[0].get("id")
        review = direct_bridge_request("skill_review", {"candidate_id": candidate_id}, "healthcheck skill review")
        assert_true(review.get("status") == "ok", "skill_review should pass for generated draft")
        activation = direct_bridge_request("skill_activate", {"candidate_id": candidate_id, "reviewed_by": "healthcheck"}, "healthcheck skill activation")
        assert_true(activation.get("status") == "ok", "skill_activate should activate reviewed draft")
        activated_path = activation.get("skills", {}).get("activated", {}).get("activated_path")
        assert_true(bool(activated_path), "activated skill should include activated_path")
        status = direct_bridge_request("skill_status", {"limit": 3})
        assert_true(status.get("status") == "ok", "skill_status should succeed")
        local_library = status.get("skills", {}).get("local_library", {})
        assert_true(isinstance(local_library.get("roots", []), list), "skill_status should include local/built-in skill roots")
        return {
            "created": len(created),
            "draft_path": draft_path,
            "activated_path": activated_path,
            "candidate_count": status.get("skills", {}).get("candidate_count"),
            "activated_count": status.get("skills", {}).get("activated_count"),
            "local_skill_count": status.get("skills", {}).get("local_skill_count"),
        }

    add("skill_crystallizer", skill_crystallizer)

    def workflow() -> Dict[str, Any]:
        workflow_id = f"workflow-{marker}"
        run = direct_bridge_request("run", {
            "workflow_id": workflow_id,
            "name": "Healthcheck DAG",
            "current_node_id": "start",
            "nodes": [
                {"id": "start", "label": "Start", "status": "ready", "dependsOn": [], "verification": "started"},
                {"id": "finish", "label": "Finish", "status": "waiting", "dependsOn": ["start"], "verification": "finished"},
            ],
        })
        assert_true(run.get("status") == "ok", "workflow run should succeed")
        advance = direct_bridge_request("advance", {"workflow_id": workflow_id, "completed_node_id": "start"})
        assert_true(advance.get("workflow", {}).get("current_node_id") == "finish", "workflow should advance to finish")
        return {"workflow_id": workflow_id, "current_node": advance.get("workflow", {}).get("current_node_id")}

    add("workflow_dag", workflow)

    def kairos() -> Dict[str, Any]:
        task_id = f"kairos-{marker}"
        task = direct_bridge_request("kairos_task", {
            "task_id": task_id,
            "objective": "Healthcheck KAIROS observation",
            "next_action": "Verify heartbeat logging",
            "interval_seconds": 3600,
        })
        assert_true(task.get("status") == "ok", "kairos_task should succeed")
        tick = direct_bridge_request("kairos_tick", {"message": "healthcheck heartbeat", "limit": 3})
        kairos = tick.get("kairos", {})
        tick_result = kairos.get("tick", {})
        suggestions = kairos.get("suggestions", [])
        assert_true(bool(tick_result.get("ticked")), "kairos_tick should observe queued tasks")
        assert_true(bool(suggestions), "kairos_tick should prepare suggestions")
        assert_true(kairos.get("execution") == "observation-only-no-external-action", "kairos_tick should remain observation-only")
        return {"task_id": task_id, "ticked": len(tick_result.get("ticked", [])), "suggestions": len(suggestions), "logs": tick_result.get("log_paths", [])}

    add("kairos_daemon", kairos)

    def scheduler() -> Dict[str, Any]:
        plan_id = f"scheduler-{marker}"
        result = direct_bridge_request("scheduler_plan", {
            "plan_id": plan_id,
            "task_name": f"ZhimengHealth{marker}",
            "interval_minutes": 5,
        }, "healthcheck scheduler draft")
        assert_true(result.get("status") == "ok", "scheduler_plan should succeed")
        plan = result.get("scheduler", {}).get("plan", {})
        assert_true(bool(plan.get("install_draft_path")), "scheduler plan should include install draft")
        assert_true(bool(plan.get("uninstall_draft_path")), "scheduler plan should include uninstall draft")
        assert_true(plan.get("execution") == "not-installed-by-gateway", "scheduler plan should remain draft-only")
        install_dry = direct_bridge_request("scheduler_install", {"plan_id": plan_id, "execute": True}, "healthcheck scheduler install dry")
        assert_true(install_dry.get("status") == "approval_required", "scheduler_install should require execute_scheduler before OS install")
        install_op = install_dry.get("scheduler", {}).get("operation", {})
        assert_true("schtasks" in install_op.get("argv", []), "scheduler_install dry run should expose schtasks argv")
        uninstall_dry = direct_bridge_request("scheduler_uninstall", {"plan_id": plan_id, "execute": True}, "healthcheck scheduler uninstall dry")
        assert_true(uninstall_dry.get("status") == "approval_required", "scheduler_uninstall should require execute_scheduler before OS uninstall")
        status = direct_bridge_request("scheduler_status", {"plan_id": plan_id})
        assert_true(status.get("status") == "ok", "scheduler_status should succeed")
        return {"plan_id": plan_id, "install_draft_path": plan.get("install_draft_path"), "install_dry": install_dry.get("status"), "uninstall_dry": uninstall_dry.get("status")}

    add("scheduler_draft", scheduler)

    def evolution_bootstrap() -> Dict[str, Any]:
        result = direct_bridge_request("evolution_bootstrap", {
            "objective": f"{marker} verify Phase 5 KAIROS evolution loop",
            "workflow_id": f"workflow-evolution-{marker}",
            "task_id": f"kairos-evolution-{marker}",
            "plan_id": f"scheduler-evolution-{marker}",
            "interval_minutes": 5,
            "activate_skill": True,
            "persist": True,
        }, "healthcheck evolution bootstrap")
        evolution = result.get("evolution_bootstrap", {})
        evidence = evolution.get("evidence", {})
        assert_true(result.get("status") == "ok", "evolution_bootstrap should succeed")
        assert_true(evidence.get("workflow_registered") is True, "evolution_bootstrap should register workflow")
        assert_true(evidence.get("kairos_task_created") is True, "evolution_bootstrap should create KAIROS task")
        assert_true(evidence.get("kairos_tick_observed") is True, "evolution_bootstrap should tick KAIROS")
        assert_true(evidence.get("append_only_daily_log") is True, "evolution_bootstrap should append daily log")
        assert_true(evidence.get("scheduler_draft_created") is True, "evolution_bootstrap should create scheduler draft")
        assert_true(evidence.get("scheduler_execution") == "not-installed-by-gateway", "evolution scheduler should remain draft-only")
        assert_true(evidence.get("memory_events_created", 0) >= 3, "evolution_bootstrap should seed memory events")
        assert_true(evidence.get("l2_summaries_created", 0) >= 1, "evolution_bootstrap should consolidate L2 memory")
        assert_true(evidence.get("skill_drafts_created", 0) >= 1, "evolution_bootstrap should crystallize a skill draft")
        assert_true(evidence.get("skill_activated") is True, "evolution_bootstrap should activate reviewed skill copy")
        assert_true(evidence.get("user_beliefs_created", 0) >= 1, "evolution_bootstrap should reflect user model")
        assert_true(evidence.get("execution") == "evolution-bootstrap-observation-draft-scheduler-no-os-install-no-auto-exec", "evolution_bootstrap should stay no-auto-exec")
        return {
            "evolution_id": evolution.get("evolution_id"),
            "workflow_id": evolution.get("workflow_hook", {}).get("workflow_id"),
            "scheduler": evidence.get("scheduler_execution"),
            "skill_drafts": evidence.get("skill_drafts_created"),
            "activated_path": evidence.get("activated_path"),
            "beliefs": evidence.get("user_beliefs_created"),
        }

    add("evolution_bootstrap", evolution_bootstrap)

    def worker() -> Dict[str, Any]:
        job_id = f"worker-{marker}"
        run = direct_bridge_request("worker_run", {
            "job_id": job_id,
            "agent_id": "health-worker",
            "command": "python --version",
            "execute": True,
            "timeout_seconds": 5,
        }, "healthcheck worker job", execute_command=True)
        assert_true(run.get("status") == "ok", "worker_run should register/start a job")
        job = run.get("worker", {})
        assert_true(job.get("status") in {"starting", "running", "completed"}, "worker job should start")
        status = {}
        for _ in range(20):
            status = direct_bridge_request("worker_status", {"job_id": job_id})
            current = status.get("workers", {}).get("job") or {}
            if current.get("status") in {"completed", "failed", "blocked"}:
                break
            time.sleep(0.1)
        current = status.get("workers", {}).get("job") or {}
        assert_true(current.get("status") == "completed", "worker job should complete")
        assert_true(current.get("result", {}).get("returncode") == 0, "worker command should return 0")
        action_job_id = f"worker-action-{marker}"
        action_run = direct_bridge_request("worker_run", {
            "job_id": action_job_id,
            "agent_id": "health-context-worker",
            "kind": "bridge_action",
            "action": "context_pack",
            "payload": {"task": "开始构思小说世界观", "domain": "writing", "dimension": "skill", "limit": 3},
        }, "healthcheck internal action worker")
        assert_true(action_run.get("status") == "ok", "internal action worker_run should register/start a job")
        action_status = {}
        for _ in range(20):
            action_status = direct_bridge_request("worker_status", {"job_id": action_job_id})
            action_current = action_status.get("workers", {}).get("job") or {}
            if action_current.get("status") in {"completed", "failed", "blocked"}:
                break
            time.sleep(0.1)
        action_current = action_status.get("workers", {}).get("job") or {}
        assert_true(action_current.get("status") == "completed", "internal action worker should complete")
        context_result = action_current.get("result", {}).get("result", {}).get("context_pack", {})
        context_pack = context_result.get("context_pack", [])
        active_skill_keys = context_result.get("active_skill_keys", [])
        assert_true("novel-creation-suite" in active_skill_keys, "internal action worker should return routed novel skills")
        assert_true(bool(context_pack), "internal action worker should return a compact context_pack")
        return {
            "job_id": job_id,
            "status": current.get("status"),
            "output": (current.get("result", {}).get("stdout") or current.get("result", {}).get("stderr") or "").strip(),
            "action_job_id": action_job_id,
            "action_context": len(context_pack),
            "action_skills": active_skill_keys,
        }

    add("worker_job", worker)

    def model_worker() -> Dict[str, Any]:
        job_id = f"model-worker-{marker}"
        live_job_id = f"model-worker-live-{marker}"
        stream_job_id = f"model-worker-stream-{marker}"
        hard_cancel_job_id = f"model-worker-hard-cancel-{marker}"
        result = direct_bridge_request("worker_run", {
            "job_id": job_id,
            "agent_id": "healthcheck-model-worker",
            "kind": "model_task",
            "provider": "ollama",
            "api_url": "http://127.0.0.1:11434",
            "model_id": "healthcheck-model",
            "prompt": f"{marker} prepare a bounded model worker task.",
            "domain": "general",
            "context_limit": 2,
            "execute_model": False,
        }, "healthcheck model worker prepare")
        worker = result.get("worker", {})
        assert_true(result.get("status") == "approval_required", "model_task without execute_model should require approval")
        assert_true(worker.get("kind") == "model_task", "model worker job should be kind=model_task")
        assert_true(worker.get("status") == "approval_required", "model worker job should stop at approval gate")
        assert_true(bool(worker.get("prepared_task")), "model worker should prepare a compact task packet")
        payload = worker.get("payload", {})
        assert_true(payload.get("api_key", "") in {"", "[redacted]"}, "model worker state should not persist raw api key")
        status = direct_bridge_request("worker_status", {"job_id": job_id})
        assert_true(status.get("status") == "ok", "worker_status should read model worker job")
        cancel = direct_bridge_request("worker_cancel", {"job_id": job_id, "reason": "healthcheck cancel"})
        assert_true(cancel.get("status") == "ok", "worker_cancel should process model worker job")
        assert_true(cancel.get("worker_cancel", {}).get("status") == "canceled", "worker_cancel should mark prepared model worker canceled")

        httpd, api_url = start_healthcheck_provider_server()
        try:
            live_run = direct_bridge_request("worker_run", {
                "job_id": live_job_id,
                "agent_id": "healthcheck-live-model-worker",
                "kind": "model_task",
                "provider": "openai-compatible",
                "api_url": api_url,
                "api_key": "healthcheck-one-shot-key",
                "model_id": "healthcheck-model",
                "prompt": f"{marker} execute a bounded local model worker task.",
                "domain": "general",
                "context_limit": 2,
                "execute_model": True,
                "timeout_seconds": 10,
                "max_tokens": 64,
                "merge_target_path": f"bridge/agent-files/healthcheck-merge-{marker}.md",
                "merge_mode": "replace",
            }, "healthcheck live model worker")
            assert_true(live_run.get("status") == "ok", "live model worker should register/start")
            live_worker = live_run.get("worker", {})
            assert_true(live_worker.get("status") in {"starting", "running", "completed"}, "live model worker should start")
            live_status = {}
            for _ in range(40):
                live_status = direct_bridge_request("worker_status", {"job_id": live_job_id})
                current = live_status.get("workers", {}).get("job") or {}
                if current.get("status") in {"completed", "failed", "blocked", "approval_required"}:
                    break
                time.sleep(0.1)
            current = live_status.get("workers", {}).get("job") or {}
            execution = current.get("result", {})
            assert_true(current.get("status") == "completed", "live model worker should complete")
            assert_true(execution.get("status") == "ok", "live model worker provider call should return ok")
            assert_true("healthcheck-model-worker-ok" in str(execution.get("output") or ""), "live model worker should return fake provider output")
            assert_true(current.get("payload", {}).get("api_key") == "[redacted]", "live model worker state should redact one-shot API key")
            merge = execution.get("merge_proposal") or {}
            assert_true(bool(merge.get("proposal_path")), "live model worker should create a merge proposal when merge_target_path is provided")
            assert_true(merge.get("review_gate", "").startswith("Use write_file"), "merge proposal should preserve write_file review gate")
            target_path = bridge.bridge_root() / f"bridge/agent-files/healthcheck-merge-{marker}.md"
            assert_true(not target_path.exists(), "merge proposal must not directly write the target file")
            events = current.get("events") or []
            assert_true(any(item.get("type") == "worker_stage" for item in events), "worker job should keep structured stage events")
            manual_merge = direct_bridge_request("worker_merge_proposal", {
                "job_id": live_job_id,
                "target_path": f"bridge/agent-files/healthcheck-manual-merge-{marker}.md",
                "mode": "append",
            }, "healthcheck manual worker merge proposal")
            assert_true(manual_merge.get("status") == "ok", "worker_merge_proposal action should create a reviewable proposal")
            assert_true(manual_merge.get("worker_merge_proposal", {}).get("proposal", {}).get("mode") == "append", "manual merge proposal should preserve mode")

            stream_run = direct_bridge_request("worker_run", {
                "job_id": stream_job_id,
                "agent_id": "healthcheck-stream-model-worker",
                "kind": "model_task",
                "provider": "openai-compatible",
                "api_url": api_url,
                "api_key": "healthcheck-one-shot-key",
                "model_id": "healthcheck-model",
                "prompt": f"{marker} stream a bounded local model worker task.",
                "domain": "general",
                "context_limit": 2,
                "execute_model": True,
                "stream_model": True,
                "timeout_seconds": 10,
                "max_tokens": 64,
            }, "healthcheck streaming model worker")
            assert_true(stream_run.get("status") == "ok", "streaming model worker should register/start")
            stream_status = {}
            for _ in range(40):
                stream_status = direct_bridge_request("worker_status", {"job_id": stream_job_id})
                stream_current = stream_status.get("workers", {}).get("job") or {}
                if stream_current.get("status") in {"completed", "failed", "blocked", "approval_required"}:
                    break
                time.sleep(0.1)
            stream_current = stream_status.get("workers", {}).get("job") or {}
            stream_execution = stream_current.get("result", {})
            stream_events = stream_current.get("events") or []
            assert_true(stream_current.get("status") == "completed", "streaming model worker should complete")
            assert_true(stream_execution.get("streaming") is True, "streaming model worker result should mark streaming=true")
            assert_true(stream_execution.get("stream_chunk_count", 0) >= 2, "streaming model worker should count chunks")
            assert_true(any(item.get("type") == "model_stream_chunk" for item in stream_events), "streaming model worker should record chunk events")
            assert_true("healthcheck-model-worker-ok" in str(stream_execution.get("output") or ""), "streaming model worker should reconstruct output")

            hard_run = direct_bridge_request("worker_run", {
                "job_id": hard_cancel_job_id,
                "agent_id": "healthcheck-hard-cancel-model-worker",
                "kind": "model_task",
                "provider": "openai-compatible",
                "api_url": api_url,
                "api_key": "healthcheck-one-shot-key",
                "model_id": "healthcheck-model",
                "prompt": f"{marker} run a cancelable slow streaming model worker task.",
                "domain": "general",
                "context_limit": 2,
                "execute_model": True,
                "stream_model": True,
                "timeout_seconds": 20,
                "max_tokens": 64,
                "provider_extra_body": {
                    "healthcheck_delay_seconds": 0.25,
                    "healthcheck_chunk_repeat": 40,
                },
            }, "healthcheck hard cancel model worker")
            assert_true(hard_run.get("status") == "ok", "hard-cancel model worker should register/start")
            hard_current = {}
            for _ in range(40):
                hard_status = direct_bridge_request("worker_status", {"job_id": hard_cancel_job_id})
                hard_current = hard_status.get("workers", {}).get("job") or {}
                if hard_current.get("process_pid"):
                    break
                time.sleep(0.05)
            assert_true(bool(hard_current.get("process_pid")), "hard-cancel model worker should record child process pid")
            hard_cancel = direct_bridge_request("worker_cancel", {"job_id": hard_cancel_job_id, "reason": "healthcheck hard cancel", "timeout_seconds": 1})
            assert_true(hard_cancel.get("status") == "ok", "worker_cancel should process hard-cancel model worker")
            hard_cancel_result = hard_cancel.get("worker_cancel", {})
            assert_true(hard_cancel_result.get("status") in {"hard_canceled", "canceled", "cancel_requested"}, "worker_cancel should mark or request hard cancel")
            for _ in range(40):
                hard_status = direct_bridge_request("worker_status", {"job_id": hard_cancel_job_id})
                hard_current = hard_status.get("workers", {}).get("job") or {}
                if hard_current.get("status") == "canceled":
                    break
                time.sleep(0.1)
            hard_events = hard_current.get("events") or []
            assert_true(hard_current.get("status") == "canceled", "hard-cancel model worker should end as canceled")
            assert_true(hard_current.get("hard_cancel_status") in {"terminated", "killed", "not_running"}, "hard-cancel model worker should record process termination status")
            assert_true(any(item.get("type") == "worker_hard_cancel" for item in hard_events), "hard-cancel model worker should record worker_hard_cancel event")
        finally:
            httpd.shutdown()

        return {
            "job_id": job_id,
            "status": cancel.get("worker_cancel", {}).get("status"),
            "provider": worker.get("prepared_task", {}).get("provider"),
            "live_job_id": live_job_id,
            "live_status": current.get("status"),
            "live_output": (execution.get("output") or "")[:120],
            "merge_proposal": (execution.get("merge_proposal") or {}).get("proposal_path"),
            "stream_job_id": stream_job_id,
            "stream_chunks": stream_execution.get("stream_chunk_count", 0),
            "hard_cancel_job_id": hard_cancel_job_id,
            "hard_cancel_status": hard_current.get("hard_cancel_status"),
        }

    add("model_worker_prepare", model_worker)

    def swarm_bootstrap() -> Dict[str, Any]:
        result = direct_bridge_request("swarm_bootstrap", {
            "task": "Healthcheck Phase 4 swarm rehearsal",
            "scope": f"healthcheck/scope/{marker}",
            "workflow_id": f"workflow-swarm-{marker}",
            "persist": True,
            "start_workers": True,
            "release_locks": True,
        }, "healthcheck swarm bootstrap")
        swarm = result.get("swarm_bootstrap", {})
        evidence = swarm.get("evidence", {})
        assert_true(result.get("status") == "ok", "swarm_bootstrap should succeed")
        assert_true(evidence.get("spawned_agents", 0) >= 4, "swarm_bootstrap should spawn bounded agents")
        assert_true(evidence.get("forked_agents", 0) >= 2, "swarm_bootstrap should include forked agents")
        assert_true(evidence.get("isolated_agents", 0) >= 1, "swarm_bootstrap should include isolated agents")
        assert_true(evidence.get("write_lock_acquired") is True, "swarm_bootstrap should acquire a write lock")
        assert_true(evidence.get("write_lock_conflict_blocked") is True, "swarm_bootstrap should block same-scope write conflict")
        assert_true(evidence.get("lock_released") is True, "swarm_bootstrap should release rehearsal lock")
        assert_true(evidence.get("workers_started", 0) >= 3, "swarm_bootstrap should start allowlisted workers")
        assert_true(evidence.get("workers_completed", 0) >= 2, "swarm_bootstrap workers should complete")
        assert_true(evidence.get("dangerous_command_blocked") is True, "swarm_bootstrap should prove dangerous command blocking")
        assert_true(evidence.get("execution") == "swarm-bootstrap-allowlisted-workers-no-model-exec-no-arbitrary-shell", "swarm_bootstrap should remain allowlisted")
        return {
            "swarm_id": swarm.get("swarm_id"),
            "agents": evidence.get("spawned_agents"),
            "workers": f"{evidence.get('workers_completed')}/{evidence.get('worker_count')}",
            "conflict_blocked": evidence.get("write_lock_conflict_blocked"),
            "dangerous_blocked": evidence.get("dangerous_command_blocked"),
            "workflow_id": swarm.get("workflow_hook", {}).get("workflow_id"),
        }

    add("swarm_bootstrap", swarm_bootstrap)

    def subagent() -> Dict[str, Any]:
        agent_id = f"agent-{marker}"
        contender_id = f"agent-contender-{marker}"
        scope = f"healthcheck/{marker}"
        spawn = direct_bridge_request("subagent_spawn", {"agent_id": agent_id, "label": "Health Agent", "mode": "isolated-context"})
        assert_true(spawn.get("status") == "ok", "subagent_spawn should succeed")
        contender = direct_bridge_request("subagent_spawn", {"agent_id": contender_id, "label": "Health Contender", "mode": "forked-context"})
        assert_true(contender.get("status") == "ok", "second subagent_spawn should succeed")
        lock = direct_bridge_request("lock_acquire", {"agent_id": agent_id, "scope": scope, "mode": "write"})
        assert_true(lock.get("status") == "ok", "lock_acquire should succeed")
        lock_id = lock.get("lock_result", {}).get("lock", {}).get("id")
        conflict = direct_bridge_request("lock_acquire", {"agent_id": contender_id, "scope": scope, "mode": "write"})
        assert_true(conflict.get("status") == "blocked", "second write lock should be blocked while first is active")
        assert_true(bool(conflict.get("lock_result", {}).get("conflicts")), "blocked lock should report conflicts")
        release = direct_bridge_request("lock_release", {"lock_id": lock_id, "agent_id": agent_id})
        assert_true(release.get("status") == "ok", "lock_release should succeed")
        retry = direct_bridge_request("lock_acquire", {"agent_id": contender_id, "scope": scope, "mode": "write"})
        assert_true(retry.get("status") == "ok", "second write lock should succeed after release")
        retry_lock_id = retry.get("lock_result", {}).get("lock", {}).get("id")
        cleanup = direct_bridge_request("lock_release", {"lock_id": retry_lock_id, "agent_id": contender_id})
        assert_true(cleanup.get("status") == "ok", "retry lock cleanup should succeed")
        return {"agent_id": agent_id, "contender_id": contender_id, "lock_id": lock_id, "retry_lock_id": retry_lock_id, "conflicts": len(conflict.get("lock_result", {}).get("conflicts", []))}

    add("subagent_locks", subagent)
    return checks


def run_http_checks(base_url: str) -> List[Dict[str, Any]]:
    base = base_url.rstrip("/")
    marker = f"health-{uuid.uuid4().hex[:8]}"
    checks: List[Dict[str, Any]] = []

    health = http_json(f"{base}/health")
    assert_true(health.get("status") == "ok", "GET /health should be ok")
    checks.append({"name": "http_health", "status": "ok", "result": health})

    tools = http_json(f"{base}/tools")
    assert_true(len(tools.get("tools", [])) >= 25, "GET /tools should expose core tool set")
    checks.append({"name": "http_tools", "status": "ok", "result": {"tool_count": len(tools.get("tools", []))}})

    status = http_json(f"{base}/bridge", "POST", {"action": "status", "purpose": "healthcheck", "payload": {"workflow_id": marker}})
    assert_true(status.get("status") == "ok", "POST /bridge status should be ok")
    checks.append({"name": "http_bridge_status", "status": "ok", "result": {"run_id": status.get("run_id")}})

    mcp = http_json(f"{base}/mcp", "POST", {"jsonrpc": "2.0", "id": "tools", "method": "tools/list", "params": {}})
    assert_true(len(mcp.get("result", {}).get("tools", [])) >= 25, "POST /mcp tools/list should expose tools")
    checks.append({"name": "http_mcp_tools", "status": "ok", "result": {"tool_count": len(mcp.get("result", {}).get("tools", []))}})

    resource = http_json(f"{base}/mcp", "POST", {"jsonrpc": "2.0", "id": "resource", "method": "resources/read", "params": {"uri": "zhimeng://manifest"}})
    assert_true(bool(resource.get("result", {}).get("contents", [])), "POST /mcp resources/read should return content")
    checks.append({"name": "http_mcp_resource", "status": "ok", "result": {"uri": "zhimeng://manifest"}})

    audit = http_json(f"{base}/bridge", "POST", {"action": "phase_audit", "purpose": "healthcheck phase audit", "payload": {}})
    phases = audit.get("phase_audit", {}).get("phases", [])
    assert_true(audit.get("status") == "ok", "POST /bridge phase_audit should be ok")
    assert_true(len(phases) == 5, "HTTP phase_audit should report five phases")
    checks.append({"name": "http_phase_audit", "status": "ok", "result": {"overall": audit.get("phase_audit", {}).get("status")}})

    completion = http_json(f"{base}/bridge", "POST", {"action": "completion_audit", "purpose": "healthcheck completion audit", "payload": {}})
    completion_audit = completion.get("completion_audit", {})
    known_limits = set(completion_audit.get("known_limits", []))
    assert_true(completion.get("status") == "ok", "POST /bridge completion_audit should be ok")
    assert_true(completion_audit.get("status") == "partial", "HTTP completion_audit should report honest partial status")
    assert_true("model_worker_executor_live_unverified" not in known_limits, "HTTP completion_audit should no longer report live model worker gap")
    remaining_gaps = [str(item.get("gap") or "") for item in completion_audit.get("remaining_gaps", []) if isinstance(item, dict)]
    assert_true(not any("model_worker_hard_cancel" in gap for gap in remaining_gaps), "HTTP completion_audit should no longer report model worker hard-cancel gap")
    checks.append({"name": "http_completion_audit", "status": "ok", "result": {"overall": completion_audit.get("status"), "known_limits": sorted(known_limits)}})
    return checks


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", help="Optional running Gateway base URL, e.g. http://127.0.0.1:8765")
    args = parser.parse_args()

    try:
        checks = run_http_checks(args.url) if args.url else run_direct_checks()
        output = {"status": "ok", "checks": checks}
    except Exception as exc:
        output = {"status": "error", "error": str(exc)}
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 1

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

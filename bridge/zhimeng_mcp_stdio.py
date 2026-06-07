#!/usr/bin/env python3
"""
Line-delimited JSON-RPC stdio facade for Zhimeng Personal OS Bridge.

This is intentionally small: each input line is one JSON-RPC request and each
output line is one JSON-RPC response. It reuses zhimeng_bridge.handle_mcp_rpc
so HTTP and stdio share the same tool registry and safety path.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict

import zhimeng_bridge as bridge


def response_for(body: Dict[str, Any], execute_read: bool, execute_command: bool, execute_write: bool, execute_scheduler: bool, execute_web: bool, execute_mcp: bool, execute_skill: bool, full_access_files: bool) -> Dict[str, Any]:
    params = body.get("params") if isinstance(body.get("params"), dict) else {}
    arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
    request_execute = bool(params.get("execute") or arguments.get("execute"))
    allow_read = bool(execute_read and request_execute)
    allow_command = bool(execute_command and request_execute)
    allow_write = bool(execute_write and request_execute)
    allow_scheduler = bool(execute_scheduler and request_execute)
    allow_web = bool(execute_web and request_execute)
    allow_mcp = bool(execute_mcp and request_execute)
    allow_skill = bool(execute_skill and request_execute)
    return bridge.handle_mcp_rpc(
        body,
        execute=allow_read,
        execute_command=allow_command,
        execute_write=allow_write,
        execute_scheduler=allow_scheduler,
        execute_web=allow_web,
        execute_mcp=allow_mcp,
        execute_skill=allow_skill,
        full_access_files=full_access_files,
        gateway_execute_read=execute_read,
        gateway_execute_command=execute_command,
        gateway_execute_write=execute_write,
        gateway_execute_scheduler=execute_scheduler,
        gateway_execute_web=execute_web,
        gateway_execute_mcp=execute_mcp,
        gateway_execute_skill=execute_skill,
    )


def write_response(payload: Dict[str, Any], pretty: bool) -> None:
    text = json.dumps(payload, ensure_ascii=False, indent=2 if pretty else None)
    sys.stdout.write(text + "\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Read one JSON request from stdin and exit")
    parser.add_argument("--execute-read", action="store_true", help="Allow read_file when params.execute=true")
    parser.add_argument("--execute-command", action="store_true", help="Allow allowlisted run_command when params.execute=true")
    parser.add_argument("--execute-write", action="store_true", help="Allow write_file when params.execute=true")
    parser.add_argument("--execute-scheduler", action="store_true", help="Allow scheduler install/uninstall when params.execute=true")
    parser.add_argument("--execute-web", action="store_true", help="Allow bounded web_fetch when params.execute=true")
    parser.add_argument("--execute-mcp", action="store_true", help="Allow bounded mcp_call HTTP JSON-RPC calls when params.execute=true")
    parser.add_argument("--execute-skill", action="store_true", help="Allow reviewed activated skill_run when params.execute=true")
    parser.add_argument("--full-access-files", action="store_true", help="Allow full_access file paths outside the workspace")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print one-shot responses")
    args = parser.parse_args()

    if args.once:
        raw = sys.stdin.read().strip()
        if not raw:
            write_response(bridge.jsonrpc_error(None, -32600, "empty stdin"), args.pretty)
            return 1
        try:
            body = json.loads(raw)
            write_response(response_for(body, args.execute_read, args.execute_command, args.execute_write, args.execute_scheduler, args.execute_web, args.execute_mcp, args.execute_skill, args.full_access_files), args.pretty)
            return 0
        except Exception as exc:
            write_response(bridge.jsonrpc_error(None, -32603, str(exc)), args.pretty)
            return 1

    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            body = json.loads(raw)
            write_response(response_for(body, args.execute_read, args.execute_command, args.execute_write, args.execute_scheduler, args.execute_web, args.execute_mcp, args.execute_skill, args.full_access_files), args.pretty)
        except Exception as exc:
            write_response(bridge.jsonrpc_error(None, -32603, str(exc)), args.pretty)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

import importlib.util
import tempfile
from pathlib import Path


def load_bridge():
    module_path = Path(__file__).resolve().parents[1] / "bridge" / "zhimeng_bridge.py"
    spec = importlib.util.spec_from_file_location("zhimeng_bridge_verify", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load zhimeng_bridge.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_true(condition, label):
    if not condition:
        raise AssertionError(label)


bridge = load_bridge()
tmp_root = Path(tempfile.mkdtemp(prefix="zhimeng-gateway-command-approval-"))
original_bridge_root = bridge.BRIDGE_ROOT if hasattr(bridge, "BRIDGE_ROOT") else None
bridge.BRIDGE_ROOT = tmp_root
try:
    queued = bridge.handle_request(
        {
            "action": "run_command",
            "purpose": "验证 Node 环境",
            "payload": {"command": "node --version", "cwd": "."},
        },
        execute=False,
        execute_command=False,
        gateway_execute_command=True,
    )
    assert_equal(queued["status"], "approval_required", "run_command queues approval")
    assert_true(queued.get("approval_id"), "run_command returns approval id")
    approval_path = bridge.approval_record_path(queued["approval_id"])
    assert_true(approval_path.exists(), "approval record exists")

    blocked_without_gate = bridge.handle_request(
        {
            "action": "approval_decide",
            "purpose": "执行命令审批",
            "payload": {
                "approval_id": queued["approval_id"],
                "decision": "execute",
                "execute": True,
            },
        },
        execute=True,
        execute_command=False,
        gateway_execute_command=False,
    )
    assert_equal(blocked_without_gate["approval_decide"]["status"], "approval_required", "approval_decide requires execute-command gate")

    executed = bridge.handle_request(
        {
            "action": "approval_decide",
            "purpose": "执行命令审批",
            "payload": {
                "approval_id": queued["approval_id"],
                "decision": "execute",
                "execute": True,
            },
        },
        execute=True,
        execute_command=True,
        gateway_execute_command=True,
    )
    decision = executed["approval_decide"]
    assert_equal(decision["status"], "ok", "approval_decide executes allowlisted command")
    command_result = decision["run_command"]
    assert_equal(command_result["status"], "ok", "command execution status")
    assert_equal(command_result["argv"], ["node", "--version"], "command argv")
    assert_equal(command_result["allowlist"]["pattern"], "node --version", "allowlist pattern")
    assert_true("validation" in command_result, "command validation preserved")
    stored = bridge.load_approval_record(queued["approval_id"])
    assert_equal(stored["decision"]["status"], "executed", "stored decision status")
    assert_equal(stored["decision"]["action"], "run_command", "stored decision action")

    already_decided = bridge.handle_request(
        {
            "action": "approval_decide",
            "purpose": "重复执行命令审批",
            "payload": {
                "approval_id": queued["approval_id"],
                "decision": "execute",
                "execute": True,
            },
        },
        execute=True,
        execute_command=True,
        gateway_execute_command=True,
    )
    assert_equal(already_decided["approval_decide"]["status"], "already_decided", "command approval cannot be executed twice")

    dangerous = bridge.handle_request(
        {
            "action": "run_command",
            "purpose": "危险命令",
            "payload": {"command": "git reset --hard", "cwd": "."},
        },
        execute=False,
        execute_command=False,
        gateway_execute_command=True,
    )
    assert_equal(dangerous["status"], "blocked", "dangerous command remains blocked before approval")
    assert_true(not dangerous.get("approval_id"), "blocked dangerous command is not queued")
finally:
    if original_bridge_root is not None:
        bridge.BRIDGE_ROOT = original_bridge_root

print("gateway-command-approval ok")

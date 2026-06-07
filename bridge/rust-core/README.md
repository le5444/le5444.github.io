# Zhimeng Rust Core Wrapper

Minimal Rust wrapper for the Zhimeng Personal OS Python Gateway.

The wrapper does not replace the Python Gateway yet. It provides a small, auditable
entrypoint for future Rust/Python hybrid work:

```powershell
cargo run --manifest-path bridge/rust-core/Cargo.toml -- health
cargo run --manifest-path bridge/rust-core/Cargo.toml -- serve --port 8765
cargo run --manifest-path bridge/rust-core/Cargo.toml -- stdio --once
```

Environment:

- `ZHIMENG_ROOT`: project root. Defaults to the current directory.
- `ZHIMENG_PYTHON`: Python executable. Defaults to `python`.

This wrapper uses only the Rust standard library and delegates actual Gateway
logic to `bridge/zhimeng_bridge.py`, `bridge/healthcheck_bridge.py`, and
`bridge/zhimeng_mcp_stdio.py`.

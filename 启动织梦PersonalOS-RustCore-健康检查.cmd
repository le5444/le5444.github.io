@echo off
cd /d "%~dp0"
cargo run --manifest-path bridge\rust-core\Cargo.toml -- health
pause

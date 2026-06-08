@echo off
cd /d "%~dp0"
echo Starting Zhimeng Personal OS Gateway with workspace file tools, verification commands, provider probes, bounded API fetch, and bounded MCP calls...
python bridge\zhimeng_bridge.py --serve --execute-read --execute-write --execute-command --execute-web --execute-provider --execute-mcp --kairos-interval 60 --autodream-interval 300 --autodream-threshold 2
pause

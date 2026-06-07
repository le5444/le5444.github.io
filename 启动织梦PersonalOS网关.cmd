@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting Zhimeng Personal OS Gateway...
echo Endpoint: http://127.0.0.1:8765/bridge
echo.
python bridge\zhimeng_bridge.py --serve --port 8765 --execute-read --execute-write --kairos-interval 60 --autodream-interval 300 --autodream-threshold 2
pause

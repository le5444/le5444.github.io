@echo off
cd /d "%~dp0"
python bridge\zhimeng_bridge.py --serve --port 8765 --execute-read --execute-write --execute-command --kairos-interval 60 --autodream-interval 300 --autodream-threshold 2
pause

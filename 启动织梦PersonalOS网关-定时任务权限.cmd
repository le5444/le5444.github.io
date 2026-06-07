@echo off
cd /d "%~dp0"
echo Starting Zhimeng Personal OS Gateway with scheduler install/uninstall permission...
echo.
echo This enables scheduler_install / scheduler_uninstall only when a request also sets execute=true.
echo File tools remain workspace-scoped unless you use the full-access launcher.
echo.
python bridge\zhimeng_bridge.py --serve --execute-read --execute-write --execute-scheduler --kairos-interval 60 --autodream-interval 300 --autodream-threshold 2
pause

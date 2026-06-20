@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 织梦写作台 Provider 配置工具
echo.
echo 常用命令:
echo   python desktop\zhimeng_provider_switch.py list --group router
echo   python desktop\zhimeng_provider_switch.py apply --preset codex2api-codex --api-key sk-...
echo   python desktop\zhimeng_provider_switch.py probe --allow-remote
echo   python desktop\zhimeng_provider_switch.py probe
echo   python desktop\zhimeng_provider_switch.py status
echo.
python desktop\zhimeng_provider_switch.py status
echo.
pause

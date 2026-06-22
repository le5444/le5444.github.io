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
echo   python desktop\zhimeng_provider_switch.py chat-smoke
echo   python desktop\zhimeng_provider_switch.py chat-smoke --allow-remote
echo   python desktop\zhimeng_provider_switch.py export-env --shell powershell
echo   python desktop\zhimeng_provider_switch.py status
echo.
echo 提示: 远程模型列表和远程聊天冒烟需要显式 --allow-remote; 输出会打码 API key。
echo.
python desktop\zhimeng_provider_switch.py status
echo.
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "APP_EXE=%~dp0desktop-release\ZhimengPersonalOS\ZhimengPersonalOS.exe"
echo Full profile: workspace tools + network/MCP + full_access file paths.
echo File writes still require an explicit execute=true request.
if exist "%APP_EXE%" (
  "%APP_EXE%" --profile full
) else (
  python desktop\zhimeng_desktop_launcher.py --profile full
)
pause

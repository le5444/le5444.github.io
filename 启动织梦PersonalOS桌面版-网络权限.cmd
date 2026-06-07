@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "APP_EXE=%~dp0desktop-release\ZhimengPersonalOS\ZhimengPersonalOS.exe"
if exist "%APP_EXE%" (
  "%APP_EXE%" --profile network
) else (
  python desktop\zhimeng_desktop_launcher.py --profile network
)
pause

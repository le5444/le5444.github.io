@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "APP_EXE=%~dp0desktop-release\ZhimengPersonalOS\ZhimengPersonalOS.exe"
echo Autonomy profile: workspace tools + reviewed scheduler install/uninstall gate.
echo KAIROS still observes and proposes; external actions need explicit approval gates.
if exist "%APP_EXE%" (
  "%APP_EXE%" --profile autonomy
) else (
  python desktop\zhimeng_desktop_launcher.py --profile autonomy
)
pause

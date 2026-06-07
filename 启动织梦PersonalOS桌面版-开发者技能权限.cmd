@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "APP_EXE=%~dp0desktop-release\ZhimengPersonalOS\ZhimengPersonalOS.exe"
echo Dev profile: workspace tools + allowlisted verification commands + activated Skill runtime.
echo Arbitrary shell remains disabled.
if exist "%APP_EXE%" (
  "%APP_EXE%" --profile dev
) else (
  python desktop\zhimeng_desktop_launcher.py --profile dev
)
pause

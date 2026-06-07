@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "APP_EXE=%~dp0desktop-release\ZhimengPersonalOS\ZhimengPersonalOS.exe"
if exist "%APP_EXE%" (
  for %%P in (workspace network full autonomy dev) do (
    echo [doctor] %%P
    "%APP_EXE%" --doctor --profile %%P
    if errorlevel 1 (
      echo Doctor failed for profile %%P.
      pause
      exit /b 1
    )
  )
) else (
  python desktop\zhimeng_desktop_launcher.py --doctor --profile workspace
)
pause

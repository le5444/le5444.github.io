@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo [1/3] Building frontend...
call npm run build
if errorlevel 1 (
  echo Frontend build failed.
  pause
  exit /b 1
)

echo [2/3] Checking PyInstaller...
python -c "import PyInstaller" >nul 2>nul
if errorlevel 1 (
  echo PyInstaller is not installed.
  echo Install it first:
  echo   python -m pip install pyinstaller
  pause
  exit /b 1
)

echo [3/3] Packaging desktop app...
python -m PyInstaller --clean --noconfirm --distpath "desktop-release" --workpath "desktop-build" "desktop\zhimeng_desktop_launcher.spec"
if errorlevel 1 (
  echo Packaging failed.
  pause
  exit /b 1
)

echo [check] Running packaged desktop doctors...
for %%P in (workspace network full autonomy dev) do (
  echo [doctor] %%P
  "%CD%\desktop-release\ZhimengPersonalOS\ZhimengPersonalOS.exe" --doctor --profile %%P
  if errorlevel 1 (
    echo Packaged desktop doctor failed for profile %%P.
    pause
    exit /b 1
  )
)

echo.
echo Done:
echo   %CD%\desktop-release\ZhimengPersonalOS\ZhimengPersonalOS.exe
echo.
echo Permission profiles:
echo   ZhimengPersonalOS.exe --profile workspace
echo   ZhimengPersonalOS.exe --profile network
echo   ZhimengPersonalOS.exe --profile full
echo   ZhimengPersonalOS.exe --profile autonomy
echo   ZhimengPersonalOS.exe --profile dev
pause

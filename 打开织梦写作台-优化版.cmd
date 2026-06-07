@echo off
set "APP_DIR=C:\Users\30865\Desktop\novel-writing-skills-guide-3\dist"
set "PORT=8139"
cd /d "%APP_DIR%"
where python >nul 2>nul
if errorlevel 1 (
  start "" "%APP_DIR%\index.html"
  exit /b
)
start "Novelsmith local server" /min python -m http.server %PORT% --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/index.html"
exit /b

@echo off
title Remotion Studio - Guess The Fake Information
cd /d "%~dp0"

rem Ensure node/npx work when launched by double-click (Explorer PATH can differ)
set "PATH=C:\Program Files\nodejs;%PATH%"

where npx.cmd >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js was not found.
  echo  Install Node from https://nodejs.org then try again.
  pause
  exit /b 1
)

rem HEALTHY studio = something actually LISTENING on port 3000 - just open the browser.
netstat -ano | findstr /C:":3000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo  Studio is already running - opening http://localhost:3000
  start "" "http://localhost:3000"
  exit /b 0
)

rem No healthy server. Kill any STALE/HUNG studio processes (node alive but not
rem listening = the "preview works but Render does nothing" ghost state) so the
rem fresh studio can bind the SAME port - then an old tab reconnects with F5.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'studio' -and $_.CommandLine -match 'remotion|npm-cli' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
echo  Starting Remotion Studio - Guess The Fake Information
echo  Browser: http://localhost:3000   (always this address - F5 reconnects old tabs)
echo  Keep this window open while you work. Close it to stop the studio.
echo.

call npx.cmd remotion studio --port 3000

echo.
echo  Studio stopped.
pause

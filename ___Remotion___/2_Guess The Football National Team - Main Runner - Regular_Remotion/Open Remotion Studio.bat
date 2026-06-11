@echo off
title Remotion Studio - Guess The Football National Team
cd /d "%~dp0"

rem Ensure npm works when launched by double-click (Explorer PATH can differ)
set "PATH=C:\Program Files\nodejs;%PATH%"

echo.
echo   Remotion Studio - Guess The Football National Team
echo   --------------------------------------------------
echo   Browser: http://localhost:3000
echo   Keep this window open while you work. Close it to stop the studio.
echo.

call npm.cmd run studio

echo.
echo   Studio stopped.
pause

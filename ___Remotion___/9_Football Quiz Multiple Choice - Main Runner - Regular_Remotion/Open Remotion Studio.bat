@echo off
title Remotion Studio - Football Quiz Multiple Choice
cd /d "%~dp0"

rem Ensure npm works when launched by double-click (Explorer PATH can differ)
set "PATH=C:\Program Files\nodejs;%PATH%"

echo.
echo   Remotion Studio - Football Quiz Multiple Choice (A/B/C)
echo   --------------------------------------------------------
echo   Browser: http://localhost:3000
echo   Keep this window open while you work. Close it to stop the studio.
echo.

call npm.cmd run studio

echo.
echo   Studio stopped.
pause
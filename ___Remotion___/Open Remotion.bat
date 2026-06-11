@echo off
title Remotion Studio - ALL Projects
set "PATH=C:\Program Files\nodejs;%PATH%"

rem One Studio that lists EVERY project's composition. We run from a runner folder so it
rem reuses that runner's installed Remotion + remotion.config.ts (the @shared alias and the
rem shared public folder), pointed at the aggregator entry that registers all compositions.
cd /d "%~dp02_Guess The Football National Team - Main Runner - Regular_Remotion"

echo.
echo   Remotion Studio - ALL Projects
echo   ------------------------------
echo   Lists every quiz's composition under "Compositions".
echo   Browser: http://localhost:3000
echo   Keep this window open while you work. Close it to stop the studio.
echo.

call npx.cmd remotion studio "..\_studio\index.tsx"

echo.
echo   Studio stopped.
pause

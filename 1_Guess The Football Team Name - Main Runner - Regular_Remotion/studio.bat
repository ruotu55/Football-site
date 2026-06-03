@echo off
rem Live Remotion preview (scrub the timeline, no rendering).
rem IMPORTANT: keep run_site.bat running too -- Studio loads images/crests from it (port 8888).
setlocal
cd /d "%~dp0remotion"
echo.
echo ============================================================
echo   Remotion Studio - live preview (no rendering)
echo   Keep run_site.bat running in another window (for images).
echo   When it says "Server ready", open:  http://localhost:3000
echo ============================================================
echo.
call npx remotion studio src/index.ts
pause

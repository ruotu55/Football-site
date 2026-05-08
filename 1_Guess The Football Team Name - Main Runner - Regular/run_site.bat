@echo off
rem Run (no browser, PowerShell): & "C:\Users\Rom\Desktop\‏‏תיקיה חדשה\Football Channel\Main Runner - Lineups - Regular\run_site.bat" --no-browser
setlocal
set "HERE=%~dp0"
set "PY=%LocalAppData%\Programs\Python\Python312\python.exe"
if exist "%PY%" goto :run
set "PY=%LocalAppData%\Programs\Python\Python313\python.exe"
if exist "%PY%" goto :run
set "PY=%LocalAppData%\Programs\Python\Python311\python.exe"
if exist "%PY%" goto :run

echo.
echo Could not find Python at %%LocalAppData%%\Programs\Python\Python312 ^(or 313/311^).
echo Install: winget install Python.Python.3.12
echo Or turn OFF "App execution aliases" for python.exe ^(Settings - Apps - Advanced app settings^).
echo.
exit /b 1

:run
rem Listen on all interfaces so other PCs on the LAN can open the site (override with: --host 127.0.0.1)
"%PY%" "%HERE%run_site.py" --host 0.0.0.0 %*
exit /b %ERRORLEVEL%

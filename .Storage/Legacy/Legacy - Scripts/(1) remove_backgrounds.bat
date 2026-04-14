@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PY_SCRIPT=%SCRIPT_DIR%(1) remove_backgrounds.py"

set "PYTHON_EXE=py -3"

where py >nul 2>nul
if errorlevel 1 (
    set "PYTHON_EXE=python"
)

echo Running background removal...
echo.
%PYTHON_EXE% -c "import PIL, rembg" >nul 2>nul
if errorlevel 1 (
    echo Installing required packages for this script...
    %PYTHON_EXE% -m pip install --user pillow rembg onnxruntime
    if errorlevel 1 (
        echo.
        echo Failed to install dependencies.
        echo Try manually: py -3 -m pip install --user pillow rembg onnxruntime
        echo.
        pause
        exit /b 1
    )
)

%PYTHON_EXE% "%PY_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
    echo Script finished with error code: %EXIT_CODE%
) else (
    echo Script finished successfully.
)
pause
exit /b %EXIT_CODE%

@echo off
rem ==============================================================================
rem PhishGuard — 1-Click Launcher for Windows
rem Starts backend server and guides browser extension setup.
rem ==============================================================================

setlocal enabledelayedexpansion
title PhishGuard Security Intelligence Engine

cd /d "%~dp0"
set "ROOT_DIR=%cd%"
set "BACKEND_DIR=%ROOT_DIR%\backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"

cls
echo ===================================================================
echo.
echo     PhishGuard - Zero-Day Security Intelligence Engine
echo     Real-Time Heuristic Browser Protection Pipeline
echo.
echo ===================================================================
echo.

rem 1. Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found in your PATH.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"') do set PY_VER=%%i
echo [*] Detected Python %PY_VER%

rem 2. Check virtual environment
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo [!] Initializing dedicated virtual environment in backend\.venv...
    python -m venv "%VENV_DIR%"
    echo [*] Virtual environment created.
)

set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "VENV_PIP=%VENV_DIR%\Scripts\pip.exe"
set "REQ_FILE=%BACKEND_DIR%\requirements.txt"
set "DEPS_FLAG=%VENV_DIR%\.deps_installed"

if not exist "%DEPS_FLAG%" (
    echo [!] Installing required packages (Flask, Waitress, NumPy, Pillow)...
    "%VENV_PIP%" install -r "%REQ_FILE%" --quiet
    echo installed > "%DEPS_FLAG%"
    echo [*] Dependencies successfully installed.
) else (
    echo [*] Dependencies already verified.
)

echo.
echo ===================================================================
echo               BROWSER EXTENSION QUICK START GUIDE
echo ===================================================================
echo Follow these 2 simple steps to load the extension in Chrome/Edge/Brave:
echo.
echo   1. Open your browser and go to:  chrome://extensions (or edge://extensions)
echo   2. Toggle ON "Developer mode" in the top right corner.
echo   3. Click "Load unpacked" and select this folder:
echo      %ROOT_DIR%\extension
echo.
echo ===================================================================
echo [*] Starting PhishGuard Backend on http://127.0.0.1:8000 ...
echo     (Press Ctrl+C anytime to stop the server)
echo ===================================================================
echo.

"%VENV_PY%" "%BACKEND_DIR%\run.py" --host 127.0.0.1 --port 8000
pause

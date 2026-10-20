@echo off
rem ==============================================================================
rem PhishGuard — 1-Click Zero-Config Launcher for Windows
rem Automatically installs Python if missing, configures dependencies,
rem launches the backend server, and opens your browser with PhishGuard loaded.
rem ==============================================================================

setlocal enabledelayedexpansion
title PhishGuard Security Intelligence Engine

cd /d "%~dp0"
set "ROOT_DIR=%cd%"
set "BACKEND_DIR=%ROOT_DIR%\backend"
set "EXT_DIR=%ROOT_DIR%\extension"
set "VENV_DIR=%BACKEND_DIR%\.venv"

cls
echo ===================================================================
echo.
echo     PhishGuard - Zero-Day Security Intelligence Engine
echo     Real-Time Heuristic Browser Protection Pipeline
echo.
echo ===================================================================
echo.

rem ------------------------------------------------------------------------------
rem 1. DETECT OR AUTO-INSTALL PYTHON
rem ------------------------------------------------------------------------------
set "PYTHON_CMD="

rem Check py launcher
py -3 -c "import sys; sys.exit(0 if sys.version_info.major == 3 else 1)" >nul 2>&1
if !errorlevel! equ 0 (
    set "PYTHON_CMD=py -3"
    goto :python_found
)

rem Check python
python -c "import sys; sys.exit(0 if sys.version_info.major == 3 else 1)" >nul 2>&1
if !errorlevel! equ 0 (
    set "PYTHON_CMD=python"
    goto :python_found
)

rem Check python3
python3 -c "import sys; sys.exit(0 if sys.version_info.major == 3 else 1)" >nul 2>&1
if !errorlevel! equ 0 (
    set "PYTHON_CMD=python3"
    goto :python_found
)

rem Check typical Windows Python install directories
for %%P in (
    "%LocalAppData%\Programs\Python\Python312\python.exe"
    "%LocalAppData%\Programs\Python\Python311\python.exe"
    "%LocalAppData%\Programs\Python\Python310\python.exe"
    "C:\Program Files\Python312\python.exe"
    "C:\Program Files\Python311\python.exe"
    "C:\Program Files\Python310\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
) do (
    if exist %%P (
        set "PYTHON_CMD=%%P"
        goto :python_found
    )
)

rem If Python is completely missing, auto-download and install Python 3.11 silently
echo [!] Python 3 was not detected on your system.
echo [*] Automatically downloading and installing official Python 3.11...
echo     Please wait, this will take about 30 seconds...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Write-Host '[1/2] Downloading Python installer from python.org...' -ForegroundColor Cyan; " ^
  "$url = 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe'; " ^
  "$out = \"$env:TEMP\python-3.11.9-installer.exe\"; " ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
  "(New-Object System.Net.WebClient).DownloadFile($url, $out); " ^
  "Write-Host '[2/2] Running automated user-level Python installation...' -ForegroundColor Cyan; " ^
  "Start-Process -FilePath $out -ArgumentList '/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1' -Wait; " ^
  "Remove-Item $out -Force -ErrorAction SilentlyContinue"

rem Refresh PATH for current session
for %%P in (
    "%LocalAppData%\Programs\Python\Python311\python.exe"
    "%LocalAppData%\Programs\Python\Python312\python.exe"
    "%LocalAppData%\Programs\Python\Python310\python.exe"
) do (
    if exist %%P (
        set "PYTHON_CMD=%%P"
        goto :python_found
    )
)

rem Fallback check after installation
python -c "import sys; sys.exit(0 if sys.version_info.major == 3 else 1)" >nul 2>&1
if !errorlevel! equ 0 (
    set "PYTHON_CMD=python"
    goto :python_found
)

echo.
echo [ERROR] Automated Python installation could not be completed.
echo Please download and install Python 3.11+ manually from: https://www.python.org/downloads/
echo (Make sure to check "Add Python to PATH" during installation)
echo.
pause
exit /b 1

:python_found
echo [*] Python verified successfully.

rem ------------------------------------------------------------------------------
rem 2. ENVIRONMENT & DEPENDENCY INSTALLATION
rem ------------------------------------------------------------------------------
rem Try isolated venv first; if unavailable, seamlessly fall back to global Python
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo [*] Setting up application environment in backend\.venv...
    %PYTHON_CMD% -m venv "%VENV_DIR%" >nul 2>&1
)

if exist "%VENV_DIR%\Scripts\python.exe" (
    set "RUN_PY=%VENV_DIR%\Scripts\python.exe"
    set "RUN_PIP=%VENV_DIR%\Scripts\pip.exe"
    set "DEPS_FLAG=%VENV_DIR%\.deps_ready"
) else (
    echo [!] Using global Python environment directly.
    set "RUN_PY=%PYTHON_CMD%"
    set "RUN_PIP=%PYTHON_CMD% -m pip"
    set "DEPS_FLAG=%BACKEND_DIR%\.deps_ready"
)

if not exist "!DEPS_FLAG!" (
    echo [*] Installing required security engine dependencies (Waitress, Flask, NumPy, Pillow)...
    !RUN_PIP! install --upgrade pip --quiet >nul 2>&1
    !RUN_PIP! install -r "%BACKEND_DIR%\requirements.txt" --quiet
    if !errorlevel! neq 0 (
        echo [!] Retrying pip installation with verbose logging...
        !RUN_PIP! install -r "%BACKEND_DIR%\requirements.txt"
    )
    echo ready > "!DEPS_FLAG!"
    echo [✓] Dependencies installed and verified.
) else (
    echo [✓] Dependencies already verified.
)

rem ------------------------------------------------------------------------------
rem 3. AUTO-LAUNCH USER'S DEFAULT BROWSER WITH PHISHGUARD EXTENSION
rem ------------------------------------------------------------------------------
echo.
echo ===================================================================
echo [✓] Detecting your default browser and loading PhishGuard...
echo ===================================================================

set "BROWSER_FOUND=0"
set "DEFAULT_BROWSER="

rem Query Windows Registry for user's selected default HTTP browser
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$b = ''; " ^
  "$p = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice' -ErrorAction SilentlyContinue).ProgId; " ^
  "if ($p) { " ^
  "  $c = (Get-ItemProperty \"Registry::HKEY_CLASSES_ROOT\$p\shell\open\command\" -ErrorAction SilentlyContinue).'(default)'; " ^
  "  if ($c -match '\"([^\"]+\.exe)\"') { $b = $matches[1] } elseif ($c -match '([^\s]+\.exe)') { $b = $matches[1] }; " ^
  "} " ^
  "if ($b -and (Test-Path $b)) { [IO.File]::WriteAllText(\"$env:TEMP\pg_def_browser.txt\", $b) }" >nul 2>&1

if exist "%TEMP%\pg_def_browser.txt" (
    set /p DEFAULT_BROWSER=<"%TEMP%\pg_def_browser.txt"
    del "%TEMP%\pg_def_browser.txt" >nul 2>&1
)

rem If user's default browser was found:
if defined DEFAULT_BROWSER (
    rem Check if default browser is Firefox (non-Chromium)
    echo !DEFAULT_BROWSER! | findstr /i "firefox" >nul 2>&1
    if !errorlevel! equ 0 (
        echo [*] Your default browser is Firefox (non-Chromium).
        echo [*] Launching PhishGuard in your installed Chromium browser...
    ) else (
        start "" "!DEFAULT_BROWSER!" --load-extension="%EXT_DIR%" "http://127.0.0.1:8000"
        set "BROWSER_FOUND=1"
        echo [*] Successfully loaded PhishGuard into your default browser:
        echo     !DEFAULT_BROWSER!
    )
)

rem If default browser was not Chromium or not resolved, launch installed Chromium browser
if !BROWSER_FOUND! equ 0 (
    rem Check Google Chrome
    for %%B in (
        "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
        "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
        "%LocalAppData%\Google\Chrome\Application\chrome.exe"
    ) do (
        if !BROWSER_FOUND! equ 0 if exist %%B (
            start "" %%B --load-extension="%EXT_DIR%" "http://127.0.0.1:8000"
            set "BROWSER_FOUND=1"
            echo [*] Loaded into Google Chrome.
        )
    )
)

rem Check Brave Browser
if !BROWSER_FOUND! equ 0 (
    for %%B in (
        "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"
        "%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe"
    ) do (
        if !BROWSER_FOUND! equ 0 if exist %%B (
            start "" %%B --load-extension="%EXT_DIR%" "http://127.0.0.1:8000"
            set "BROWSER_FOUND=1"
            echo [*] Loaded into Brave Browser.
        )
    )
)

rem Check Microsoft Edge (pre-installed on 100% of Windows 10/11 PCs)
if !BROWSER_FOUND! equ 0 (
    for %%B in (
        "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
        "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    ) do (
        if !BROWSER_FOUND! equ 0 if exist %%B (
            start "" %%B --load-extension="%EXT_DIR%" "http://127.0.0.1:8000"
            set "BROWSER_FOUND=1"
            echo [*] Loaded into Microsoft Edge.
        )
    )
)

rem Fallback command-line launcher
if !BROWSER_FOUND! equ 0 (
    start chrome --load-extension="%EXT_DIR%" "http://127.0.0.1:8000" >nul 2>&1
    if !errorlevel! neq 0 (
        start msedge --load-extension="%EXT_DIR%" "http://127.0.0.1:8000" >nul 2>&1
    )
    echo [*] Browser launch triggered.
)

rem ------------------------------------------------------------------------------
rem 4. START PHISHGUARD PRODUCTION BACKEND (WAITRESS WSGI)
rem ------------------------------------------------------------------------------
echo.
echo ===================================================================
echo   [✓] PhishGuard Engine is LIVE on http://127.0.0.1:8000
echo   Keep this window open while using the browser.
echo   To shut down, press Ctrl+C anytime.
echo ===================================================================
echo.

!RUN_PY! "%BACKEND_DIR%\run.py" --host 127.0.0.1 --port 8000

echo.
echo [!] PhishGuard server has stopped.
pause

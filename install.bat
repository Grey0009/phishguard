@echo off
setlocal
cd /d "%~dp0"
title PhishGuard 1-Click Installer

echo.
echo ===================================================================
echo     PhishGuard - 1-Click Installer ^& Background Setup
echo ===================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_windows.ps1"

if %errorlevel% neq 0 (
    echo.
    echo ===================================================================
    echo [!] Installation encountered an issue (Exit code: %errorlevel%).
    echo ===================================================================
    pause
)
exit /b %errorlevel%

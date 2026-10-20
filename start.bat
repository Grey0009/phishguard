@echo off
setlocal
cd /d "%~dp0"
title PhishGuard Security Intelligence Engine

echo.
echo ===================================================================
echo     PhishGuard - Zero-Day Security Intelligence Engine
echo     Launching 1-Click Automated Environment Setup...
echo ===================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_windows.ps1"

if %errorlevel% neq 0 (
    echo.
    echo ===================================================================
    echo [!] PhishGuard closed with exit code %errorlevel%.
    echo ===================================================================
    pause
)
exit /b %errorlevel%

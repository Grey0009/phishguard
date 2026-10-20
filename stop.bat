@echo off
setlocal
cd /d "%~dp0"
title Stop PhishGuard

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_windows.ps1"
exit /b %errorlevel%

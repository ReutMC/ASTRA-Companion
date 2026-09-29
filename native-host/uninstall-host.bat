@echo off
rem ASTRA native host uninstaller — thin wrapper around install-host.ps1 -Uninstall
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-host.ps1" -Uninstall
pause

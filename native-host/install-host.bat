@echo off
rem ASTRA native host installer (Chrome + Edge) — thin wrapper around install-host.ps1
rem Usage: install-host.bat [-ExtensionId <ID>] [-HostDir <DIR>] [-ChromeOnly] [-EdgeOnly]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-host.ps1" %*
pause

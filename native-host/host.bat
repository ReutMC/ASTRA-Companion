@echo off
chcp 65001 >nul
rem ASTRA Native Messaging Host launcher — Chrome/Edge spawn this file.
rem It locates Node.js (>= 22 required for the global WebSocket API) and runs host.js.

set "NODE_EXE="

where node >nul 2>nul
if %errorlevel%==0 set "NODE_EXE=node"

if not defined NODE_EXE (
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
)

if not defined NODE_EXE (
  echo {"error":"Node.js 22+ is required for the ASTRA native host","hint":"Install Node.js from https://nodejs.org and restart Chrome."}
  exit /b 1
)

"%NODE_EXE%" "%~dp0host.js" %*

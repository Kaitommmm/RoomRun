@echo off
setlocal
cd /d "%~dp0"
set "RR_NODE=node"
if exist "%ProgramFiles%\nodejs\node.exe" set "RR_NODE=%ProgramFiles%\nodejs\node.exe"
"%RR_NODE%" "%~dp0server\local.mjs"
if errorlevel 1 pause


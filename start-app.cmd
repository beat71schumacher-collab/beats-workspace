@echo off
cd /d "%~dp0"
set "NODE=%LOCALAPPDATA%\Programs\nodejs26\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" server.js
pause

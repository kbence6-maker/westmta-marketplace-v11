@echo off
cd /d "%~dp0"
call npm install
node index.js
pause

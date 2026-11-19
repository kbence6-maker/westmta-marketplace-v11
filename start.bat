@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Fuggosegek telepitese...
  call npm install
)
node index.js
pause

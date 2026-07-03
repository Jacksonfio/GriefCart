@echo off
cd /d "%~dp0"
call npm install --no-optional
if %errorlevel% neq 0 (
  echo npm install failed with error %errorlevel%
  pause
)
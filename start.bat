@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 serve.py %*
) else (
  python serve.py %*
)
rem keep the window open only if something went wrong
if errorlevel 1 pause

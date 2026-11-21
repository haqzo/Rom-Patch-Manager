@echo off
chcp 65001 >nul
rem Rom-Patch-Manager 1.1.4 offline package launcher
set "APP=%~dp0app"
set "PY="
where python >nul 2>nul && set "PY=python"
if "%PY%"=="" where py >nul 2>nul && set "PY=py -3"
if "%PY%"=="" if exist "C:\Users\AUSU\AppData\Local\Programs\Python\Python314\python.exe" set "PY=C:\Users\AUSU\AppData\Local\Programs\Python\Python314\python.exe"
if not exist "%APP%\index.html" (
  echo [ERROR] app folder not found: %APP%
  pause
  exit /b 1
)
if "%PY%"=="" (
  echo [ERROR] Python 3 not found. Install it from https://www.python.org/downloads/ and run this again.
  pause
  exit /b 1
)
start "" /min %PY% -m http.server 8769 --directory "%APP%"
timeout /t 2 >nul
start "" "http://127.0.0.1:8769/"
exit /b 0

@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Assignment Dashboard - Offline Update Repair
cd /d "%~dp0"

set "PYTHON_CMD="
set "PYTHON_ARGS=-B"

if exist "%~dp0python\python.exe" goto use_embedded_python
goto find_py_launcher

:use_embedded_python
set "PYTHON_CMD=%~dp0python\python.exe"
goto python_ready

:find_py_launcher
where py >nul 2>nul
if errorlevel 1 goto find_python_cmd
set "PYTHON_CMD=py"
set "PYTHON_ARGS=-3 -B"
goto python_ready

:find_python_cmd
where python >nul 2>nul
if errorlevel 1 goto python_missing
set "PYTHON_CMD=python"
goto python_ready

:python_ready
echo ============================================
echo    Assignment Dashboard Offline Repair
echo ============================================
echo.
if not exist "py\repair_update.py" goto script_missing
"%PYTHON_CMD%" %PYTHON_ARGS% py\repair_update.py %*
exit /b %ERRORLEVEL%

:script_missing
echo [ERROR] py\repair_update.py was not found in:
echo %CD%
echo.
pause
exit /b 1

:python_missing
echo [ERROR] Python was not found.
echo Please install Python 3.10+ or reinstall Assignment Dashboard.
echo.
pause
exit /b 1

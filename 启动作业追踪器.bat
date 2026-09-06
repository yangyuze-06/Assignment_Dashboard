@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Assignment_Dashboard
cd /d "%~dp0"

set "PORT=18765"
set "PYTHON_CMD="
set "PYTHON_ARGS=-B -u"

if exist "%~dp0python\python.exe" goto use_embedded_python
goto find_py_launcher

:use_embedded_python
set "PYTHON_CMD=%~dp0python\python.exe"
goto python_ready

:find_py_launcher
where py >nul 2>nul
if errorlevel 1 goto find_python_cmd
set "PYTHON_CMD=py"
set "PYTHON_ARGS=-3 -B -u"
goto python_ready

:find_python_cmd
where python >nul 2>nul
if errorlevel 1 goto python_missing
set "PYTHON_CMD=python"
goto python_ready

:python_ready
echo ============================================
echo    Assignment_Dashboard
echo    URL: http://localhost:%PORT%
echo ============================================
echo.

if not exist "py\server.py" goto server_missing
if /I "%~1"=="--check" goto check_ok

set /a restarts=0

:loop
echo Starting server with: %PYTHON_CMD% %PYTHON_ARGS%
echo Press Ctrl+C to stop.
echo.
"%PYTHON_CMD%" %PYTHON_ARGS% py\server.py
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" goto normal_exit

set /a restarts+=1
echo.
echo ============================================
echo Server exited. Exit code: %EXIT_CODE%
echo Restarting in 5 seconds... Attempt %restarts%
echo Press Ctrl+C to quit completely.
echo ============================================
timeout /t 5 /nobreak >nul
if %restarts% GEQ 3 goto offer_repair
goto loop

:offer_repair
echo.
echo ============================================
echo Server failed to start several times.
echo If you have an update package, use the offline repair tool.
echo ============================================
echo.
if not exist "repair_update.bat" goto repair_missing
choice /C YN /M "Open offline update repair tool now"
if errorlevel 2 goto loop
call "repair_update.bat"
exit /b %ERRORLEVEL%

:normal_exit
echo.
echo ============================================
echo Server is already running or stopped normally.
echo Open: http://localhost:%PORT%
echo No restart is needed.
echo ============================================
echo.
pause
exit /b 0

:check_ok
echo Startup script check OK.
exit /b 0

:server_missing
echo [ERROR] py\server.py was not found in:
echo %CD%
echo.
pause
exit /b 1

:python_missing
echo [ERROR] Python was not found.
echo Install Python 3.8+ or put embedded Python in .\python\python.exe
echo.
pause
exit /b 1

:repair_missing
echo [WARN] repair_update.bat was not found.
echo Please ask the administrator for a full installer or repair package.
echo.
pause
goto loop

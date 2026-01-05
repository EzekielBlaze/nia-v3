@echo off
REM Request admin rights immediately
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrator privileges...
    goto UACPrompt
) else (
    goto gotAdmin
)

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"

REM Now we have admin - start the service
echo.
echo ========================================
echo STARTING NIA DAEMON SERVICE
echo ========================================
echo.

sc.exe query niaservice.exe >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] NIA service is not installed!
    echo.
    echo To install, run: node install-service.js
    echo.
    pause
    exit /b 1
)

echo Checking service status...
sc.exe query niaservice.exe | findstr "RUNNING" >nul
if %errorlevel% equ 0 (
    echo [OK] Service is already running!
) else (
    echo Starting service...
    sc.exe start niaservice.exe
    if %errorlevel% equ 0 (
        echo [OK] Service started successfully!
    ) else (
        echo [ERROR] Failed to start service
        echo Error code: %errorlevel%
        pause
        exit /b 1
    )
)

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo SERVICE IS RUNNING
echo ========================================
echo.
echo You can now start the web server:
echo   run: start-web-only.bat
echo.
pause

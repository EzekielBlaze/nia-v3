@echo off
echo ========================================
echo STARTING WIDGET (DIRECT METHOD)
echo ========================================
echo.

echo Checking if electron is installed...
if not exist "node_modules\electron\dist\electron.exe" (
    echo [ERROR] Electron not found!
    echo Installing electron...
    npm install electron
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install electron!
        pause
        exit /b 1
    )
)

echo Starting widget with electron.exe directly...
echo.

"node_modules\electron\dist\electron.exe" widget-main.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Widget failed to start!
    echo Error code: %errorlevel%
    echo.
    echo Troubleshooting:
    echo   1. Run: troubleshoot-electron.bat
    echo   2. Check widget-main.js exists
    echo   3. Check daemon is running: sc.exe query niaservice.exe
    echo.
    pause
)

@echo off
title NIA Web Server

echo.
echo ========================================
echo NIA WEB SERVER
echo ========================================
echo.

REM Check if daemon is responding
echo Checking daemon connection...
node -e "const c=require('./ipc-client');new c().send('status').then(()=>console.log('OK')).catch(()=>process.exit(1))" 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [WARN] Daemon not responding!
    echo.
    echo Please make sure daemon is running:
    echo   Option 1: Run start-service-admin.bat
    echo   Option 2: Run node daemon.js
    echo.
    echo Continue anyway? (Press Ctrl+C to cancel)
    pause
)

echo.
echo Starting web server...
echo.
echo ========================================
echo SERVER READY
echo ========================================
echo.
echo   URL: http://localhost:3000/nia-ui.html
echo.
echo   Browser opening automatically...
echo.
echo   Press Ctrl+C to stop
echo.
echo ========================================
echo.

node nia-server.js

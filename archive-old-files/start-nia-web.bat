@echo off
echo ========================================
echo STARTING NIA WEB INTERFACE
echo ========================================
echo.

echo [1/4] Killing any existing web server...
taskkill /F /FI "WINDOWTITLE eq NIA*" /IM node.exe 2>nul
timeout /t 1 /nobreak >nul

echo [2/4] Checking if daemon is running...
node -e "const IPCClient = require('./ipc-client'); const c = new IPCClient(); c.send('status').then(r => console.log('OK')).catch(() => process.exit(1));" 2>nul
if %errorlevel% neq 0 (
    echo [WARN] Daemon not responding!
    echo.
    echo Please start the daemon first:
    echo   1. Run: node daemon.js
    echo   2. OR run: sc.exe start niaservice.exe
    echo.
    echo Continue anyway? Press any key or Ctrl+C to cancel...
    pause >nul
)

echo [3/4] Checking for required files...
if not exist "nia-server.js" (
    echo [ERROR] nia-server.js not found!
    echo Please copy it to the NIA directory.
    pause
    exit /b 1
)

if not exist "widget-chat.html" (
    echo [WARN] widget-chat.html not found - web interface may not load
)

echo [4/4] Starting web server...
echo.
echo ========================================
echo NIA WEB UI
echo ========================================
echo.
echo Server will start at: http://localhost:3000
echo Browser should open automatically.
echo.
echo Available pages:
echo   • Chat: http://localhost:3000/widget-chat.html
echo   • Widget: http://localhost:3000/widget.html
echo.
echo To stop: Press Ctrl+C
echo.
echo ========================================
echo.

node nia-server.js

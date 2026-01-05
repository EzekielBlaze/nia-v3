@echo off
echo ========================================
echo STARTING DEBUG SERVER
echo ========================================
echo.

echo [1] Stopping any existing Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo Done.
echo.

echo [2] Starting daemon...
start "NIA Daemon" cmd /c "title NIA Daemon && node daemon.js"
timeout /t 3 /nobreak >nul
echo.

echo [3] Starting debug web server on port 3000...
echo.
echo Watch this console for debug output!
echo Browser will open automatically.
echo.
echo ========================================
echo.

node nia-server-debug.js

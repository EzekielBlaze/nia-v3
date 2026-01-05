@echo off
echo ========================================
echo NIA COMPLETE FIX
echo ========================================
echo.

echo This will:
echo   1. Add missing updated_at column
echo   2. Restart daemon
echo   3. Restart web server with live stats
echo.

pause

echo.
echo [1/4] Adding missing column...
node add-updated-at.js

if %errorlevel% neq 0 (
    echo [ERROR] Failed to add column
    pause
    exit /b 1
)

echo.
echo [2/4] Killing old web server...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [3/4] Restarting daemon (requires admin)...
powershell -Command "Start-Process sc.exe -ArgumentList 'stop','niaservice.exe' -Verb RunAs -Wait" 2>nul
timeout /t 3 /nobreak >nul
powershell -Command "Start-Process sc.exe -ArgumentList 'start','niaservice.exe' -Verb RunAs -Wait" 2>nul
timeout /t 3 /nobreak >nul

echo.
echo [4/4] Starting web UI with live stats...
echo.
echo ========================================
echo NIA WEB UI (LIVE STATS ENABLED)
echo ========================================
echo.
echo Stats will auto-update every 5 seconds!
echo.
echo Server will open at: http://localhost:3000
echo.

start-nia-web-fixed.bat

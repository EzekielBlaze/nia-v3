@echo off
echo ========================================
echo QUICK MEMORY CHECK
echo ========================================
echo.

echo [1] Checking if daemon is running...
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo ✅ Node.js is running
) else (
    echo ❌ Node.js is NOT running!
    echo    Start daemon first: START-NIA.bat
    pause
    exit /b 1
)
echo.

echo [2] Running comprehensive diagnostic...
echo.

node diagnose-memory-full.js

pause

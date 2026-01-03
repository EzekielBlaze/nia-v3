@echo off
echo ========================================
echo NIA COMPLETE DATABASE SETUP
echo ========================================
echo.

echo This will:
echo   1. Stop the daemon
echo   2. Run complete database setup (finds schema automatically)
echo   3. Restart the daemon
echo.

pause

echo.
echo [1/3] Stopping daemon (requires admin)...
powershell -Command "Start-Process sc.exe -ArgumentList 'stop','niaservice.exe' -Verb RunAs -Wait"
timeout /t 5 /nobreak >nul

echo.
echo [2/3] Running database setup...
echo.

node setup-database.js

if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo SETUP FAILED!
    echo ========================================
    echo.
    echo Check the error above.
    echo.
    pause
    exit /b 1
)

echo.
echo [3/3] Starting daemon (requires admin)...
powershell -Command "Start-Process sc.exe -ArgumentList 'start','niaservice.exe' -Verb RunAs -Wait"
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo SETUP COMPLETE!
echo ========================================
echo.
echo Database is ready!
echo.
echo Next steps:
echo   1. Start web UI: start-nia-web.bat
echo   2. Test: Click "Process Beliefs" - should work!
echo.
pause

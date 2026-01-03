@echo off
echo ========================================
echo NIA SAFE DATABASE MIGRATION
echo ========================================
echo.

echo This migration:
echo   - Processes schema statements one at a time
echo   - Continues even if some statements fail
echo   - Adds missing columns to existing tables
echo   - Reports what succeeded and what failed
echo.

pause

echo.
echo [1/3] Stopping daemon (requires admin)...
powershell -Command "Start-Process sc.exe -ArgumentList 'stop','niaservice.exe' -Verb RunAs -Wait" 2>nul
timeout /t 5 /nobreak >nul

echo.
echo [2/3] Running safe migration...
echo.

node safe-migrate.js

if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo MIGRATION FAILED!
    ========================================
    echo.
    echo Check the errors above.
    echo.
    pause
    exit /b 1
)

echo.
echo [3/3] Starting daemon (requires admin)...
powershell -Command "Start-Process sc.exe -ArgumentList 'start','niaservice.exe' -Verb RunAs -Wait" 2>nul
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo MIGRATION COMPLETE!
echo ========================================
echo.
echo Check the output above to see what worked.
echo Some errors are normal (foreign key constraints, etc.)
echo.
echo Next steps:
echo   1. Start web UI: start-nia-web-fixed.bat
echo   2. Test: Click "Process Beliefs"
echo.
pause

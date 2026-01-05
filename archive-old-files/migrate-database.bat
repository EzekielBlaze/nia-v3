@echo off
echo ========================================
echo NIA DATABASE MIGRATION - COMPLETE
echo ========================================
echo.

echo This will:
echo   1. Add cognitive autonomy tables
echo   2. Fix beliefs table (add missing columns)
echo.

pause

echo.
echo [1/2] Adding cognitive autonomy tables...
echo.

node migrate-cognitive-tables.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Cognitive tables migration failed!
    pause
    exit /b 1
)

echo.
echo [2/2] Fixing beliefs table...
echo.

node migrate-beliefs-table.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Beliefs table migration failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo MIGRATION SUCCESSFUL!
echo ========================================
echo.
echo Your database is now fully updated:
echo   - Cognitive autonomy tables added
echo   - Beliefs table has all required columns
echo.
echo Next steps:
echo   1. Restart daemon: sc.exe stop niaservice.exe ^&^& sc.exe start niaservice.exe
echo   2. Restart web UI: start-nia-web.bat
echo   3. Test: Click "Process Beliefs" - should work!
echo.
pause

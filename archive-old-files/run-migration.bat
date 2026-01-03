@echo off
echo ========================================
echo NIA DATABASE MIGRATION
echo Adding Cognitive Autonomy Tables
echo ========================================
echo.

echo This will add the following tables to your database:
echo   - cognitive_state (energy tracking)
echo   - extraction_queue (queued extractions)
echo   - cognitive_events (audit trail)
echo.

pause

echo.
echo Running migration...
echo.

node migrate-cognitive-tables.js

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo MIGRATION SUCCESSFUL!
    echo ========================================
    echo.
    echo Your database now has cognitive autonomy tables.
    echo Restart the daemon for changes to take effect:
    echo   sc.exe stop niaservice.exe
    echo   sc.exe start niaservice.exe
    echo.
    echo Then restart the web UI:
    echo   start-nia-web.bat
    echo.
) else (
    echo.
    echo ========================================
    echo MIGRATION FAILED!
    echo ========================================
    echo.
    echo Check the error above.
    echo.
)

pause

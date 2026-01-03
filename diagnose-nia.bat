@echo off
echo ========================================
echo NIA SYSTEM DIAGNOSTIC
echo ========================================
echo.

echo [1] Checking running processes...
echo.
tasklist | findstr /I "node electron widget nia"
if %errorlevel% equ 0 (
    echo [FOUND] Processes are running
) else (
    echo [INFO] No NIA processes found
)
echo.

echo [2] Checking daemon service...
echo.
sc.exe query niaservice.exe
echo.

echo [3] Checking critical files...
echo.
if exist "ipc-client.js" (
    echo [OK] ipc-client.js found
) else (
    echo [ERROR] ipc-client.js MISSING!
)

if exist "widget-main.js" (
    echo [OK] widget-main.js found
) else (
    echo [ERROR] widget-main.js MISSING!
)

if exist "widget-chat.html" (
    echo [OK] widget-chat.html found
) else (
    echo [ERROR] widget-chat.html MISSING!
)

if exist "daemon.js" (
    echo [OK] daemon.js found
) else (
    echo [ERROR] daemon.js MISSING!
)

if exist "cognitive-state.js" (
    echo [OK] cognitive-state.js found
) else (
    echo [WARN] cognitive-state.js missing (autonomy system)
)

if exist "extraction-gatekeeper.js" (
    echo [OK] extraction-gatekeeper.js found
) else (
    echo [WARN] extraction-gatekeeper.js missing (autonomy system)
)

if exist "autonomous-extraction-manager.js" (
    echo [OK] autonomous-extraction-manager.js found
) else (
    echo [WARN] autonomous-extraction-manager.js missing (autonomy system)
)

echo.
echo [4] Checking database...
echo.
if exist "data\nia.db" (
    echo [OK] nia.db found
) else (
    echo [WARN] nia.db missing (will be created on first run)
)

echo.
echo [5] Checking node_modules...
echo.
if exist "node_modules" (
    echo [OK] node_modules found
) else (
    echo [ERROR] node_modules MISSING - run: npm install
)

echo.
echo ========================================
echo DIAGNOSTIC COMPLETE
echo ========================================
echo.
echo Next steps:
echo   - If processes running: kill-all-nia.bat
echo   - If files missing: copy them from downloads
echo   - If node_modules missing: npm install
echo   - Then: node start-widget.js
echo.
pause

@echo off
echo ========================================
echo COMPLETE NIA RESTART
echo ========================================
echo.

echo [1] Stopping Windows service...
net stop niaservice 2>nul
if %errorlevel% equ 0 (
    echo ✅ Service stopped
) else (
    echo ⚠️  Service was not running
)
timeout /t 2 /nobreak >nul
echo.

echo [2] Killing any remaining node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.

echo [3] Verifying memory modules location...
if exist "core\memory\daemon\index.js" (
    echo ✅ Memory modules found in correct location
) else (
    echo ❌ Memory modules NOT found!
    echo    Installing now...
    xcopy Downloads\outputs\core\memory\daemon core\memory\daemon\ /E /I /Y
)
echo.

echo [4] Starting daemon fresh...
echo.
echo ========================================
echo STARTING DAEMON
echo ========================================
echo.
echo Watch for these lines:
echo   ✅ Memory system modules loaded
echo   ✅ Memory system ready
echo   ✅ API handlers registered
echo.
echo ========================================
echo.

START-NIA.bat

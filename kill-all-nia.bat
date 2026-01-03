@echo off
echo ========================================
echo KILLING ALL NODE AND ELECTRON PROCESSES
echo ========================================
echo.

echo Killing Node.js processes...
taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node.js processes killed
) else (
    echo [INFO] No Node.js processes found
)

echo.
echo Killing Electron processes...
taskkill /F /IM electron.exe 2>nul
if %errorlevel% equ 0 (
    echo [OK] Electron processes killed
) else (
    echo [INFO] No Electron processes found
)

echo.
echo Killing any widget processes...
taskkill /F /IM widget.exe 2>nul
taskkill /F /IM widget-main.exe 2>nul

echo.
echo Waiting for processes to fully terminate...
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo ALL PROCESSES KILLED
echo ========================================
echo.
echo You can now start fresh:
echo   1. node start-daemon.js
echo   2. node start-widget.js
echo.
pause

@echo off
echo ========================================
echo STARTING NIA (Daemon + Widget)
echo ========================================
echo.

echo [1/3] Checking if daemon service is running...
sc.exe query niaservice.exe | findstr "RUNNING" >nul
if %errorlevel% equ 0 (
    echo [OK] Daemon already running
) else (
    echo [INFO] Starting daemon service...
    sc.exe start niaservice.exe
    if %errorlevel% equ 0 (
        echo [OK] Daemon started
    ) else (
        echo [WARN] Failed to start service - trying elevated...
        powershell -Command "Start-Process sc.exe -ArgumentList 'start','niaservice.exe' -Verb RunAs -Wait"
    )
    timeout /t 3 /nobreak >nul
)

echo.
echo [2/3] Waiting for daemon to initialize...
timeout /t 2 /nobreak >nul

echo.
echo [3/3] Starting widget...
start /B node start-widget.js

echo.
echo ========================================
echo NIA STARTED
echo ========================================
echo.
echo Widget should appear on your desktop!
echo Check the system tray for the NIA icon.
echo.
pause

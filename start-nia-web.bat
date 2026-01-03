@echo off
echo ========================================
echo STARTING NIA WEB INTERFACE
echo ========================================
echo.

echo [1/3] Killing any existing Node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/3] Checking daemon service...
sc.exe query niaservice.exe | findstr "RUNNING" >nul
if %errorlevel% equ 0 (
    echo [OK] Daemon is running
) else (
    echo [INFO] Starting daemon service...
    sc.exe start niaservice.exe
    if %errorlevel% neq 0 (
        echo [WARN] Service start may require admin
        powershell -Command "Start-Process sc.exe -ArgumentList 'start','niaservice.exe' -Verb RunAs -Wait"
    )
    timeout /t 3 /nobreak >nul
)

echo.
echo [3/3] Starting web server...
echo.
echo ========================================
echo NIA WEB UI
echo ========================================
echo.
echo Server will open at: http://localhost:3000
echo Browser should open automatically.
echo.
echo To stop: Press Ctrl+C OR run kill-nia-web.bat
echo.

node nia-server.js

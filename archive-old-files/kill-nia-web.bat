@echo off
echo ========================================
echo STOPPING NIA WEB SERVER
echo ========================================
echo.

echo Killing all Node.js processes...
taskkill /F /IM node.exe 2>nul

if %errorlevel% equ 0 (
    echo ✓ Node processes stopped
) else (
    echo No Node processes were running
)

echo.
echo Web server stopped.
echo.
pause

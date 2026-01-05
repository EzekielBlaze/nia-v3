@echo off
echo ========================================
echo TESTING WEB SERVER ONLY
echo ========================================
echo.

echo Checking if nia-server.js exists...
if not exist "nia-server.js" (
    echo [ERROR] nia-server.js not found!
    echo.
    echo Please copy it:
    echo   copy Downloads\outputs\nia-server.js .
    echo.
    pause
    exit /b 1
)
echo [OK] nia-server.js found
echo.

echo Checking if nia-ui.html exists...
if not exist "nia-ui.html" (
    echo [WARN] nia-ui.html not found!
    echo Server will still start but may show 404
)
echo.

echo Checking if Node.js works...
node --version
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    pause
    exit /b 1
)
echo.

echo Starting web server...
echo If you see errors below, that's the problem!
echo.
echo ========================================
echo.

node nia-server.js

pause

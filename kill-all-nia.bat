@echo off
echo.
echo ============================================
echo   KILLING ALL NIA PROCESSES
echo ============================================
echo.

echo Stopping NIA service if running...
net stop niaservice 2>nul
if %errorlevel%==0 (
    echo   Service stopped
) else (
    echo   Service not running or not installed
)

echo.
echo Killing all node.exe processes...
taskkill /F /IM node.exe 2>nul
if %errorlevel%==0 (
    echo   Node processes killed
) else (
    echo   No node processes found
)

echo.
echo Killing any electron processes...
taskkill /F /IM electron.exe 2>nul

echo.
echo Checking port 19700...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :19700 ^| findstr LISTENING') do (
    echo   Found process on port 19700: PID %%a
    taskkill /F /PID %%a 2>nul
    echo   Killed PID %%a
)

echo.
echo Checking port 3000 (web server)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo   Found process on port 3000: PID %%a
    taskkill /F /PID %%a 2>nul
    echo   Killed PID %%a
)

echo.
echo ============================================
echo   DONE - All NIA processes killed
echo ============================================
echo.
echo You can now start fresh with: node daemon.js
echo.
pause

@echo off
setlocal

:: Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title NIA Shutdown [Administrator]
echo.
echo ================================================================
echo                  STOPPING ALL NIA SERVICES
echo ================================================================
echo.

echo Stopping NiaService...
net stop NiaService >nul 2>&1

echo Stopping Qdrant...
taskkill /F /IM qdrant.exe >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq NIA-Qdrant*" >nul 2>&1

echo Stopping Python embedders...
taskkill /F /FI "WINDOWTITLE eq NIA-MemEmbed*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq NIA-BeliefEmbed*" >nul 2>&1

echo Stopping Initiative Engine...
taskkill /F /FI "WINDOWTITLE eq NIA-Initiative*" >nul 2>&1

echo Stopping Daemon...
taskkill /F /FI "WINDOWTITLE eq NIA-Daemon*" >nul 2>&1

echo Stopping Web Server...
taskkill /F /FI "WINDOWTITLE eq NIA-WebServer*" >nul 2>&1

echo Stopping Launcher window...
taskkill /F /FI "WINDOWTITLE eq NIA Launcher*" >nul 2>&1

echo Freeing ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :6333 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5001 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5002 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :19700 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a >nul 2>&1

echo.
echo All NIA services stopped!
echo.
timeout /t 2 /nobreak >nul
exit

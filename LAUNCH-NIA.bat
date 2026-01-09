@echo off
setlocal

:: Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title NIA Launcher [Administrator]
echo.
echo ========================================
echo     NIA CHROMAFLUX - FULL LAUNCH
echo         [Administrator Mode]
echo ========================================
echo.

set NIA_DIR=N:\Nia V3
set QDRANT_DIR=C:\qdrant
set EMBEDDER_DIR=%NIA_DIR%\core\embedders

echo [1/8] Killing ALL NIA processes...
:: Kill by window title
taskkill /F /FI "WINDOWTITLE eq NIA-*" >nul 2>&1
:: Kill qdrant
taskkill /F /IM qdrant.exe >nul 2>&1
echo       Process kill requested

echo [2/8] Force-killing processes on NIA ports...
:: Port 19700 - Daemon IPC
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :19700 ^| findstr LISTENING 2^>nul') do (
    echo       Killing PID %%a on port 19700
    taskkill /F /PID %%a >nul 2>&1
)
:: Port 6333 - Qdrant
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :6333 ^| findstr LISTENING 2^>nul') do (
    echo       Killing PID %%a on port 6333
    taskkill /F /PID %%a >nul 2>&1
)
:: Port 5001 - Memory Embedder
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5001 ^| findstr LISTENING 2^>nul') do (
    echo       Killing PID %%a on port 5001
    taskkill /F /PID %%a >nul 2>&1
)
:: Port 5002 - Belief Embedder
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5002 ^| findstr LISTENING 2^>nul') do (
    echo       Killing PID %%a on port 5002
    taskkill /F /PID %%a >nul 2>&1
)
:: Port 3000 - Web Server
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo       Killing PID %%a on port 3000
    taskkill /F /PID %%a >nul 2>&1
)
echo       All ports cleared

echo [3/8] Waiting for processes to terminate...
timeout /t 2 /nobreak >nul
echo       Done

echo [4/8] Starting Qdrant...
if exist "%QDRANT_DIR%\qdrant.exe" (
    start "NIA-Qdrant" /min cmd /c "cd /d %QDRANT_DIR% && qdrant.exe"
    echo       OK - port 6333
) else (
    echo       SKIP - not found
)
timeout /t 2 /nobreak >nul

echo [5/8] Starting Embedders...
cd /d "%NIA_DIR%"
if exist "core\embedders\memory-embedder-service.py" (
    start "NIA-MemEmbed" /min cmd /c "cd /d %NIA_DIR%\core\embedders && python memory-embedder-service.py"
    echo       Memory Embedder - port 5001
) else if exist "memory-embedder-service.py" (
    start "NIA-MemEmbed" /min cmd /c "cd /d %NIA_DIR% && python memory-embedder-service.py"
    echo       Memory Embedder - port 5001 (root)
) else (
    echo       Memory Embedder - SKIP
)
if exist "core\embedders\belief-embedder-service.py" (
    start "NIA-BeliefEmbed" /min cmd /c "cd /d %NIA_DIR%\core\embedders && python belief-embedder-service.py"
    echo       Belief Embedder - port 5002
) else if exist "belief-embedder-service.py" (
    start "NIA-BeliefEmbed" /min cmd /c "cd /d %NIA_DIR% && python belief-embedder-service.py"
    echo       Belief Embedder - port 5002 (root)
) else (
    echo       Belief Embedder - SKIP
)

echo       Waiting for embedders to load models...
:WAIT_EMBEDDERS
timeout /t 2 /nobreak >nul
curl -s http://localhost:5001/health >nul 2>&1
if %errorlevel% neq 0 (
    echo       Waiting for Memory Embedder...
    goto WAIT_EMBEDDERS
)
curl -s http://localhost:5002/health >nul 2>&1
if %errorlevel% neq 0 (
    echo       Waiting for Belief Embedder...
    goto WAIT_EMBEDDERS
)
echo       Embedders ready!
:EMBEDDERS_DONE

echo [6/8] Starting Daemon (direct)...
cd /d "%NIA_DIR%"
start "NIA-Daemon" cmd /k "cd /d %NIA_DIR% && node daemon.js"
echo       OK - port 19700
timeout /t 3 /nobreak >nul

echo [7/8] Starting Initiative Engine...
cd /d "%NIA_DIR%"
start "NIA-Initiative" /min cmd /k "cd /d %NIA_DIR% && node initiative-engine.js"
echo       OK - running in background

echo [8/8] Starting Web Server...
cd /d "%NIA_DIR%"
start "NIA-WebServer" cmd /k "cd /d %NIA_DIR% && node nia-server.js"
echo       OK - port 3000
timeout /t 2 /nobreak >nul

:: Verify services
echo.
echo Verifying services...
curl -s http://localhost:6333/collections >nul 2>&1
if %errorlevel%==0 ( echo   [OK] Qdrant ) else ( echo   [!!] Qdrant )
curl -s http://localhost:5001/health >nul 2>&1
if %errorlevel%==0 ( echo   [OK] Memory Embedder ) else ( echo   [!!] Memory Embedder )
curl -s http://localhost:5002/health >nul 2>&1
if %errorlevel%==0 ( echo   [OK] Belief Embedder ) else ( echo   [!!] Belief Embedder )
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel%==0 ( echo   [OK] Web Server ) else ( echo   [!!] Web Server )

:: Browser is auto-opened by nia-server.js

echo.
echo ========================================
echo          ALL SERVICES STARTED
echo ========================================
echo.
echo   Qdrant:          localhost:6333
echo   Memory Embedder: localhost:5001
echo   Belief Embedder: localhost:5002
echo   Daemon:          localhost:19700 (direct)
echo   Initiative:      running (checks every 2 min)
echo   Web UI:          localhost:3000
echo.
echo   Windows open:
echo     NIA-Daemon    - main daemon (keep open)
echo     NIA-WebServer - web server (keep open)
echo     NIA-Qdrant, NIA-MemEmbed, NIA-BeliefEmbed, NIA-Initiative (minimized)
echo.
pause

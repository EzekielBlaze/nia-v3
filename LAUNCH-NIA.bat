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

echo [1/8] Stopping NiaService...
net stop NiaService >nul 2>&1
echo       Service stop requested

echo [2/8] Killing ALL NIA processes...
:: Kill by window title
taskkill /F /FI "WINDOWTITLE eq NIA-*" >nul 2>&1
:: Kill qdrant
taskkill /F /IM qdrant.exe >nul 2>&1
:: Kill any node processes that might be ours
taskkill /F /FI "IMAGENAME eq node.exe" /FI "WINDOWTITLE eq NIA-*" >nul 2>&1
echo       Process kill requested

echo [3/8] Force-killing processes on NIA ports...
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

echo [4/8] Waiting for processes to fully terminate...
timeout /t 3 /nobreak >nul
echo       Done waiting

echo [5/8] Starting Qdrant FIRST...
if exist "%QDRANT_DIR%\qdrant.exe" (
    start "NIA-Qdrant" cmd /k "cd /d %QDRANT_DIR% && qdrant.exe"
    echo       OK - port 6333
) else (
    echo       SKIP - not found at %QDRANT_DIR%
)
timeout /t 3 /nobreak >nul

echo [6/8] Starting Embedders BEFORE Daemon...
if exist "%EMBEDDER_DIR%\memory-embedder-service.py" (
    start "NIA-MemEmbed" cmd /k "cd /d %EMBEDDER_DIR% && python memory-embedder-service.py"
    echo       Memory Embedder - port 5001
) else (
    echo       Memory Embedder - SKIP (not found at %EMBEDDER_DIR%)
)
if exist "%EMBEDDER_DIR%\belief-embedder-service.py" (
    start "NIA-BeliefEmbed" cmd /k "cd /d %EMBEDDER_DIR% && python belief-embedder-service.py"
    echo       Belief Embedder - port 5002
) else (
    echo       Belief Embedder - SKIP (not found at %EMBEDDER_DIR%)
)
echo       Waiting for embedders to initialize...
timeout /t 8 /nobreak >nul

:: Verify embedders are actually running before continuing
echo       Verifying services...
curl -s http://localhost:6333/collections >nul 2>&1
if %errorlevel%==0 (
    echo       Qdrant: ONLINE
) else (
    echo       Qdrant: OFFLINE
)
curl -s http://localhost:5001/health >nul 2>&1
if %errorlevel%==0 (
    echo       Memory Embedder: ONLINE
) else (
    echo       Memory Embedder: OFFLINE - check window
)
curl -s http://localhost:5002/health >nul 2>&1
if %errorlevel%==0 (
    echo       Belief Embedder: ONLINE
) else (
    echo       Belief Embedder: OFFLINE - check window
)

echo [7/8] Starting NiaService (Daemon) NOW...
net start NiaService >nul 2>&1
:: Wait and verify
timeout /t 3 /nobreak >nul
sc query NiaService | findstr "RUNNING" >nul 2>&1
if %errorlevel%==0 (
    echo       OK - NiaService running on port 19700
) else (
    echo       WARN - Service may not have started, check services.msc
)

echo [8/8] Starting Web Server...
cd /d "%NIA_DIR%"
start "NIA-WebServer" cmd /k "node nia-server.js"
echo       OK - port 3000
timeout /t 2 /nobreak >nul

:: Open browser
start http://localhost:3000

echo.
echo ========================================
echo          ALL SERVICES STARTED
echo ========================================
echo.
echo   Qdrant:          localhost:6333
echo   Memory Embedder: localhost:5001
echo   Belief Embedder: localhost:5002
echo   NiaService:      localhost:19700
echo   Web UI:          localhost:3000
echo.
echo   Logs: %NIA_DIR%\data\logs\
echo.
echo   Check daemon log for:
echo     "Embedder: available"
echo     "Semantic search: enabled"
echo.
pause

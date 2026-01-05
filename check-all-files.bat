@echo off
echo ========================================
echo MEMORY SYSTEM FILE CHECK
echo ========================================
echo.

set MISSING=0

echo Checking daemon integrators...
if not exist "core\memory\daemon\session-manager.js" (echo ❌ MISSING: session-manager.js & set MISSING=1) else (echo ✅ session-manager.js)
if not exist "core\memory\daemon\memory-integrator.js" (echo ❌ MISSING: memory-integrator.js & set MISSING=1) else (echo ✅ memory-integrator.js)
if not exist "core\memory\daemon\belief-integrator.js" (echo ❌ MISSING: belief-integrator.js & set MISSING=1) else (echo ✅ belief-integrator.js)
if not exist "core\memory\daemon\index.js" (echo ❌ MISSING: daemon/index.js & set MISSING=1) else (echo ✅ daemon/index.js)
echo.

echo Checking temporal modules...
if not exist "core\memory\temporal\session-tracker.js" (echo ❌ MISSING: session-tracker.js & set MISSING=1) else (echo ✅ session-tracker.js)
if not exist "core\memory\temporal\index.js" (echo ❌ MISSING: temporal/index.js & set MISSING=1) else (echo ✅ temporal/index.js)
echo.

echo Checking recall modules...
if not exist "core\memory\recall\memory-store.js" (echo ❌ MISSING: memory-store.js & set MISSING=1) else (echo ✅ memory-store.js)
if not exist "core\memory\recall\index.js" (echo ❌ MISSING: recall/index.js & set MISSING=1) else (echo ✅ recall/index.js)
echo.

echo Checking API files...
if not exist "api\api-commit-memory.js" (echo ❌ MISSING: api-commit-memory.js & set MISSING=1) else (echo ✅ api-commit-memory.js)
if not exist "api\index.js" (echo ❌ MISSING: api/index.js & set MISSING=1) else (echo ✅ api/index.js)
echo.

echo ========================================
if %MISSING%==1 (
    echo ❌ SOME FILES ARE MISSING!
    echo.
    echo Run this to copy all files:
    echo   xcopy Downloads\outputs\core\memory core\memory\ /E /I /Y
    echo   xcopy Downloads\outputs\api api\ /E /I /Y
) else (
    echo ✅ ALL FILES PRESENT!
)
echo ========================================
echo.

pause

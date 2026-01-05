@echo off
echo ========================================
echo MEMORY MODULE LOCATION DIAGNOSTIC
echo ========================================
echo.

echo Checking where memory integrator files are located...
echo.

echo ----------------------------------------
echo WRONG LOCATION (daemon folder):
echo ----------------------------------------
echo.
if exist "daemon\belief-integrator.js" (
    echo ❌ FOUND: daemon\belief-integrator.js
) else (
    echo ✅ NOT FOUND: daemon\belief-integrator.js
)

if exist "daemon\memory-integrator.js" (
    echo ❌ FOUND: daemon\memory-integrator.js
) else (
    echo ✅ NOT FOUND: daemon\memory-integrator.js
)

if exist "daemon\session-manager.js" (
    echo ❌ FOUND: daemon\session-manager.js
) else (
    echo ✅ NOT FOUND: daemon\session-manager.js
)

echo.
echo ----------------------------------------
echo CORRECT LOCATION (core\memory\daemon):
echo ----------------------------------------
echo.

if exist "core\memory\daemon\belief-integrator.js" (
    echo ✅ FOUND: core\memory\daemon\belief-integrator.js
) else (
    echo ❌ NOT FOUND: core\memory\daemon\belief-integrator.js
)

if exist "core\memory\daemon\memory-integrator.js" (
    echo ✅ FOUND: core\memory\daemon\memory-integrator.js
) else (
    echo ❌ NOT FOUND: core\memory\daemon\memory-integrator.js
)

if exist "core\memory\daemon\session-manager.js" (
    echo ✅ FOUND: core\memory\daemon\session-manager.js
) else (
    echo ❌ NOT FOUND: core\memory\daemon\session-manager.js
)

if exist "core\memory\daemon\index.js" (
    echo ✅ FOUND: core\memory\daemon\index.js
) else (
    echo ❌ NOT FOUND: core\memory\daemon\index.js
)

echo.
echo ========================================
echo.

echo If you see ❌ in the CORRECT LOCATION section,
echo run: fix-memory-location.bat
echo.

pause

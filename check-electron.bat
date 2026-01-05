@echo off
echo ========================================
echo CHECKING ELECTRON INSTALLATION
echo ========================================
echo.

echo [1] Checking if electron is installed...
if exist "node_modules\electron" (
    echo [OK] Electron found
    echo.
    echo Version info:
    node -e "console.log('Electron:', require('electron/package.json').version)"
    echo.
) else (
    echo [ERROR] Electron NOT found!
    echo.
    echo Installing electron...
    echo.
    npm install electron
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install electron!
        pause
        exit /b 1
    )
    echo [OK] Electron installed
)

echo.
echo [2] Checking if all required modules exist...
if exist "node_modules" (
    echo [OK] node_modules exists
) else (
    echo [ERROR] node_modules missing!
    echo Run: npm install
    pause
    exit /b 1
)

echo.
echo [3] Testing electron can be loaded...
node -e "try { const e = require('electron'); console.log('[OK] Electron loads successfully'); } catch(err) { console.log('[ERROR]', err.message); process.exit(1); }"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Electron cannot be loaded!
    echo.
    echo Trying to reinstall electron...
    npm uninstall electron
    npm install electron
)

echo.
echo ========================================
echo ELECTRON CHECK COMPLETE
echo ========================================
echo.
pause

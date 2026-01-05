@echo off
echo ========================================
echo ELECTRON TROUBLESHOOTING
echo ========================================
echo.

echo [TEST 1] Checking Node.js version...
node --version
echo.

echo [TEST 2] Checking npm version...
npm --version
echo.

echo [TEST 3] Checking if node_modules exists...
if exist "node_modules" (
    echo [OK] node_modules found
) else (
    echo [ERROR] node_modules NOT found!
    echo.
    echo Would you like to run npm install? (Y/N)
    choice /C YN /N
    if errorlevel 2 goto skip_install
    npm install
    :skip_install
)
echo.

echo [TEST 4] Checking if electron is in node_modules...
if exist "node_modules\electron" (
    echo [OK] Electron directory found
    dir "node_modules\electron" | find "package.json"
) else (
    echo [ERROR] Electron directory NOT found!
    echo.
    echo Installing electron now...
    npm install electron
)
echo.

echo [TEST 5] Testing electron require...
node -e "try { const electron = require('electron'); console.log('[OK] Electron require works'); console.log('Path:', electron); } catch(err) { console.log('[ERROR] Cannot require electron'); console.log(err.message); }"
echo.

echo [TEST 6] Checking electron executable...
if exist "node_modules\electron\dist\electron.exe" (
    echo [OK] electron.exe found
    "node_modules\electron\dist\electron.exe" --version
) else (
    echo [WARN] electron.exe not found in expected location
)
echo.

echo [TEST 7] Testing widget-main.js syntax...
node -c widget-main.js
if %errorlevel% equ 0 (
    echo [OK] widget-main.js syntax is valid
) else (
    echo [ERROR] widget-main.js has syntax errors!
)
echo.

echo [TEST 8] Checking if widget-main.js exists...
if exist "widget-main.js" (
    echo [OK] widget-main.js found
    findstr "require('electron')" widget-main.js >nul
    if %errorlevel% equ 0 (
        echo [OK] widget-main.js imports electron
    ) else (
        echo [ERROR] widget-main.js doesn't import electron!
    )
) else (
    echo [ERROR] widget-main.js NOT found!
)
echo.

echo ========================================
echo DIAGNOSTICS COMPLETE
echo ========================================
echo.
echo If electron is missing, run:
echo   npm install electron
echo.
echo If electron is corrupted, run:
echo   npm uninstall electron
echo   npm install electron
echo.
echo Then try:
echo   node start-widget.js
echo.
pause

@echo off
echo ========================================
echo COMPLETE MEMORY SYSTEM INSTALL
echo ========================================
echo.
echo This will copy ALL memory system files fresh.
echo.

pause

echo.
echo [1/3] Copying core memory modules...
xcopy Downloads\outputs\core\memory core\memory\ /E /I /Y

echo.
echo [2/3] Copying API files...
xcopy Downloads\outputs\api api\ /E /I /Y

echo.
echo [3/3] Copying daemon...
copy Downloads\outputs\daemon-FIXED.js daemon.js /Y

echo.
echo ========================================
echo INSTALLATION COMPLETE!
echo ========================================
echo.
echo Now restart NIA:
echo   1. Ctrl+C in both daemon and server windows
echo   2. Run START-NIA.bat
echo.

pause

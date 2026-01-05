@echo off
echo ========================================
echo FIXING MEMORY MODULE LOCATIONS
echo ========================================
echo.

echo The memory integrator files are in the WRONG location!
echo.
echo Current (wrong): N:\Nia V3\daemon\
echo Correct: N:\Nia V3\core\memory\daemon\
echo.
echo This script will copy the correct files from Downloads.
echo.

pause

echo.
echo [1/2] Creating target directory...
if not exist "core\memory\daemon" (
    mkdir core\memory\daemon
    echo Created: core\memory\daemon\
) else (
    echo Directory already exists.
)
echo.

echo [2/2] Copying files from Downloads...
echo.

xcopy Downloads\outputs\core\memory\daemon core\memory\daemon\ /E /I /Y

echo.
echo ========================================
echo DONE!
echo ========================================
echo.
echo Files installed to: core\memory\daemon\
echo.
echo Old files in daemon\ folder can be deleted if you want.
echo (They're the Windows service files - leave niaservice.* alone!)
echo.
echo Now restart NIA and memory system should work!
echo.

pause

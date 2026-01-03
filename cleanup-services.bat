@echo off
echo ========================================
echo NIA SERVICE CLEANUP
echo ========================================
echo.
echo This will remove all NIA-related Windows services
echo and ensure only ONE service exists.
echo.
pause

echo.
echo [1] Searching for NIA services...
echo.

sc.exe query type= service state= all | findstr /I "nia" >nul
if %errorlevel% equ 0 (
    echo Found NIA-related services:
    sc.exe query type= service state= all | findstr /I "nia"
    echo.
) else (
    echo No NIA services found.
    echo.
    goto :check_install
)

echo.
echo [2] Stopping all NIA services...
echo.

REM Try common service names
sc.exe stop niaservice.exe 2>nul
sc.exe stop niaservice 2>nul
sc.exe stop nia-daemon 2>nul
sc.exe stop nia 2>nul
sc.exe stop NIA 2>nul

timeout /t 3 /nobreak >nul

echo.
echo [3] Removing duplicate services (requires admin)...
echo.

REM This will prompt for elevation
powershell -Command "Start-Process cmd -ArgumentList '/c sc.exe delete niaservice 2^>nul & sc.exe delete nia-daemon 2^>nul & sc.exe delete nia 2^>nul & sc.exe delete NIA 2^>nul & pause' -Verb RunAs"

timeout /t 3 /nobreak >nul

:check_install
echo.
echo [4] Checking current services...
echo.

sc.exe query niaservice.exe 2>nul
if %errorlevel% equ 0 (
    echo [OK] niaservice.exe exists
    goto :end
)

echo [INFO] No service found. Would you like to install it?
echo.
choice /C YN /M "Install niaservice.exe"
if %errorlevel% equ 1 (
    echo.
    echo Installing service...
    node install-service.js
)

:end
echo.
echo ========================================
echo CLEANUP COMPLETE
echo ========================================
echo.
echo Current NIA services:
sc.exe query type= service state= all | findstr /I "nia"
echo.
echo You should see ONLY:
echo   SERVICE_NAME: niaservice.exe
echo.
echo If you see duplicates, run this script again.
echo.
pause

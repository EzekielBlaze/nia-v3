@echo off
echo ========================================
echo DELETING ALL NIA SHORTCUTS
echo ========================================
echo.

echo Deleting Desktop shortcuts...
del "%USERPROFILE%\Desktop\NIA Widget.lnk" 2>nul
del "%USERPROFILE%\Desktop\NIA Daemon.lnk" 2>nul
del "%USERPROFILE%\Desktop\NIA Tray.lnk" 2>nul
del "%USERPROFILE%\Desktop\Start NIA.lnk" 2>nul
del "%USERPROFILE%\Desktop\NIA.lnk" 2>nul

echo Deleting Start Menu shortcuts...
rd /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\NIA" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\NIA*.lnk" 2>nul

echo Deleting Startup shortcuts...
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NIA*.lnk" 2>nul

echo.
echo ========================================
echo ALL SHORTCUTS DELETED
echo ========================================
echo.
echo Old shortcuts removed.
echo Use the new batch files to start NIA:
echo   - start-all.bat (starts daemon + widget)
echo   - start-daemon-only.bat (daemon only)
echo   - start-widget-only.bat (widget only)
echo.
pause

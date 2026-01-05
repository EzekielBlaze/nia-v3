@echo off
echo ========================================
echo DRY RUN TEST
echo ========================================
echo.
echo This will ONLY show what would happen.
echo It will NOT move any files.
echo It will NOT launch any programs.
echo.
pause

node dry-run-cleanup.js

echo.
echo ========================================
echo.
echo That was just a preview!
echo Nothing was actually changed.
echo.
pause

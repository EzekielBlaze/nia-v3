@echo off
echo ========================================
echo NIA SAFE CLEANUP
echo ========================================
echo.

echo This will:
echo   1. Analyze which files are old/unused
echo   2. Show you what will be archived
echo   3. Ask for confirmation
echo   4. MOVE files to archive-old-files\ (not delete!)
echo.

pause

echo.
echo [1/2] Analyzing files...
echo.

node analyze-cleanup.js

echo.
echo ========================================
echo.
echo Review the files above.
echo.
echo Files will be MOVED to archive-old-files\
echo (You can restore them anytime!)
echo.
echo Continue with cleanup?
echo.

pause

echo.
echo [2/2] Executing cleanup...
echo.

node execute-cleanup.js

echo.
echo ========================================
echo CLEANUP COMPLETE!
echo ========================================
echo.
echo Old files moved to: archive-old-files\
echo.
echo To restore files: node archive-old-files\restore-files.js
echo.
pause

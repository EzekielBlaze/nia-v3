@echo off
echo ========================================
echo NIA SAFE CLEANUP v2
echo ========================================
echo.

echo This cleanup is CONSERVATIVE:
echo   - Only archives KNOWN junk files
echo   - Keeps anything unrecognized (safe!)
echo   - MOVES to archive-old-files\ (not delete!)
echo   - You can restore anytime
echo.

pause

echo.
echo ========================================
echo [1/2] ANALYZING FILES...
echo ========================================
echo.

node analyze-cleanup-safe.js

echo.
echo ========================================
echo.
echo Review the files above carefully!
echo.
echo ✅ Green files = KEEPING (essential)
echo 📦 Files to archive = OLD/UNUSED
echo.
echo Files will be MOVED to archive-old-files\
echo (NOT deleted - you can restore them!)
echo.
echo Continue with cleanup?
echo.

pause

echo.
echo ========================================
echo [2/2] EXECUTING CLEANUP...
echo ========================================
echo.

node execute-cleanup-safe.js

echo.
echo ========================================
echo DONE!
echo ========================================
echo.
echo Old files are in: archive-old-files\
echo.
echo To restore a file:
echo   1. Go to archive-old-files\
echo   2. Move the file back to root
echo.
pause

@echo off
REM ============================================================================
REM Check what actually got installed (FIXED FOR SPACES IN PATH)
REM ============================================================================

echo.
echo Checking NIA database installation...
echo Path: N:\Nia V3\data\nia.db
echo.

echo [1/3] Checking new tables...
echo.
sqlite3 "N:\Nia V3\data\nia.db" "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%%session%%' OR name LIKE '%%memory%%' OR name LIKE '%%belief%%' OR name LIKE '%%correction%%' OR name LIKE '%%clarification%%' OR name LIKE '%%conversation%%') ORDER BY name;"

echo.
echo [2/3] Checking beliefs table columns...
echo.
sqlite3 "N:\Nia V3\data\nia.db" "PRAGMA table_info(beliefs);"

echo.
echo [3/3] Quick counts...
echo.
sqlite3 "N:\Nia V3\data\nia.db" "SELECT 'daemon_sessions' as table_name, COUNT(*) as rows FROM daemon_sessions UNION ALL SELECT 'conversation_sessions', COUNT(*) FROM conversation_sessions UNION ALL SELECT 'conversation_turns', COUNT(*) FROM conversation_turns UNION ALL SELECT 'memory_commits', COUNT(*) FROM memory_commits UNION ALL SELECT 'belief_relationships', COUNT(*) FROM belief_relationships;"

echo.
echo.
echo If you see errors about "no such table: conversation_turns", run add-turns-table.bat
echo.
pause

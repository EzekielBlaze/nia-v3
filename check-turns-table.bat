@echo off
echo Checking for conversation_turns table specifically...
echo.

sqlite3 "N:\Nia V3\data\nia.db" "SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_turns';"

echo.
echo If you see "conversation_turns" above, the table exists!
echo If blank, we need to create it.
echo.

echo Checking conversation_turns structure...
sqlite3 "N:\Nia V3\data\nia.db" "PRAGMA table_info(conversation_turns);" 2>nul

echo.
pause

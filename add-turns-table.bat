@echo off
echo Adding conversation_turns table...
echo.

sqlite3 "N:\Nia V3\data\nia.db" < add-conversation-turns.sql

echo.
echo Verifying...
sqlite3 "N:\Nia V3\data\nia.db" "SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_turns';"

echo.
if errorlevel 1 (
    echo ERROR: Failed to create table
) else (
    echo SUCCESS: conversation_turns table created!
)

echo.
pause

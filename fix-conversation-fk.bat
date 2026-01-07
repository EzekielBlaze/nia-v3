@echo off
echo Fixing conversation_turns FK constraint...
cd /d "N:\Nia V3"
node fix-conversation-fk.js
pause

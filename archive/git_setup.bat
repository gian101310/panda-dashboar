@echo off
set PATH=%PATH%;C:\Program Files\Git\cmd
cd /d "%~dp0"
git init
git remote add origin https://github.com/gian101310/assistant-server.git
echo SETUP_COMPLETE
pause

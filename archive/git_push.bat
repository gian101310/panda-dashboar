@echo off
set PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%
cd /d "%~dp0"
echo === PULLING REMOTE HISTORY ===
git pull origin main --allow-unrelated-histories --no-edit
echo === PUSHING ===
git push -u origin main
echo === DONE ===
pause

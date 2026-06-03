@echo off
set PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%
cd /d "%~dp0"
echo === NPM INSTALL ===
call npm install
echo === GIT ADD ===
git add -A
echo === GIT COMMIT ===
git commit -m "consolidate: unified repo - engine + dashboard + MT4/MT5 + docs"
echo === GIT PUSH ===
git push -u origin main
echo === ALL DONE ===
pause

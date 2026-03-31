@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js
git commit -m "fix: clean dashboard no duplicate functions"
git push origin main
echo DONE
pause

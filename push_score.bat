@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js
git commit -m "fix: scoreLabel signed values STRONG=+4to+6 WEAK=-4to-6 NEUTRAL=-3to+3"
git push origin main
echo PUSHED
pause

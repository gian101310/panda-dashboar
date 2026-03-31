@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js pages\api\spikes.js
git commit -m "feat: matchup labels and spike history"
git push
echo PUSHED
pause

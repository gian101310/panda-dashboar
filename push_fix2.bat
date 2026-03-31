@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\api\data.js pages\dashboard.js pages\api\spikes.js
git commit -m "fix: data.js returns all TF fields for matchup labels"
git push origin main
echo PUSHED
pause

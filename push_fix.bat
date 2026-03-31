@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js pages\api\spikes.js
git commit -m "fix: matchup labels STRONG/WEAK/NEUTRAL correct rules + spike banner 20min only"
git push origin main
echo PUSHED
pause

@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages\dashboard.js
git commit -m "Complete OverviewTab - stats, AI briefing, currency flow, momentum bar, tiered signals, trackers, strongest highlight"
git push origin main
echo DONE
pause

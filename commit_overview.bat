@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages\dashboard.js
git commit -m "Add OVERVIEW tab - market pulse, session tracker, AI briefing, currency flow, tiered pairs"
git push origin main
echo DONE
pause

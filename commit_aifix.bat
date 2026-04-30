@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages\dashboard.js
git commit -m "Fix AI Insight panel: compact bullet format, 2-line default, collapsible expand, no wall of text"
git push origin main
echo DONE
pause

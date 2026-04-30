@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages\dashboard.js package.json package-lock.json
git commit -m "OverviewTab v2: Dark Matter design - recharts sparklines, lucide icons, SVG timeline/gauge, signal cards, AI panel, tracker summary, pair modal"
git push origin main
echo DONE
pause

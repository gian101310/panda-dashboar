@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages\dashboard.js
git commit -m "Fix Overview: bigger cards, actual gap scores with direction, STRONGEST shows +/- and BUY/SELL, wider grids, glow shadows, no sparklines"
git push origin main
echo DONE
pause

@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js pages\api\open-trades.js
git commit -m "feat: open trades panel + journal fixes"
git push origin main
echo DONE

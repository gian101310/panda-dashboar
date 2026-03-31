@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js pages\api\data.js
git commit -m "feat: box H4 H1 trend on pair cards and setups tab"
git push origin main
echo DONE

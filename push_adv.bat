@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js
git commit -m "feat: ADV score warning badge on all tabs + modal"
git push origin main
echo DONE

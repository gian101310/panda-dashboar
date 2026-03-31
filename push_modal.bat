@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js
git commit -m "feat: clickable pair card modal with full detail view"
git push origin main
echo DONE

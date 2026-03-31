@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js
git commit -m "fix: inject modal render at dashboard root"
git push origin main
echo DONE

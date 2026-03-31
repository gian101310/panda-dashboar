@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js
git commit -m "fix: timeAgo NaN spike banner + brighter tab text"
git push origin main
echo DONE

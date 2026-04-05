@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/dashboard.js
git commit -m "Panels tab: default to VALID signals only, cleaner view"
git push
echo DONE

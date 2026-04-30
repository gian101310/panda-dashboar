@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages\dashboard.js
git commit -m "Fix Overview: AI only on click, card clicks open real PairCardModal with full data, remove custom modal"
git push origin main
echo DONE
pause

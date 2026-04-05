@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/dashboard.js
git commit -m "Fix market session: clean dot indicators, bigger text, no broken HTML entities"
git push
echo DONE

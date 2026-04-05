@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/dashboard.js
git commit -m "Panels: show ONLY valid pairs, sorted A-Z, no dimmed invalid cards"
git push
echo DONE

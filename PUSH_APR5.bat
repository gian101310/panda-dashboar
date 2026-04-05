@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/dashboard.js
git commit -m "FL-ST rename, LIVE tab removed, spike clean, SIGNALS rebuilt, gap chart all-pairs"
git push
echo DONE

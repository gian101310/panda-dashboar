@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "Stale agent warning, CHANGELOG update"
git push origin main
echo PUSH DONE

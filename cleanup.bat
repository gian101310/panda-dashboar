@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "cleanup: remove debug endpoint and temp build scripts"
git push origin main
pause

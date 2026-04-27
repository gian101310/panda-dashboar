@echo off
cd /d C:\Users\Admin\panda-dashboard
del /q push_cleanup.bat
git add -A
git commit -m "remove cleanup bat"
git push origin main

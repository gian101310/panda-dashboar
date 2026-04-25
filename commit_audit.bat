@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "audit: post-refactor cleanup - zero TBG in dashboard codebase"
git push origin main
pause

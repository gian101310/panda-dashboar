@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "fix: remove confidence_score reference from tracker dashboard query"
git push origin main

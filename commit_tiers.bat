@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/api/admin/pf-approve.js
git commit -m "fix: align tier feature keys with TAB_FEATURE, add panda_ai to pro+elite tiers"
git push origin main
pause

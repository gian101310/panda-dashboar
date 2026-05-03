@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/api/pf-signup.js
git commit -m "fix: starter signup sets 5-day expires_at on panda_users"
git push origin main

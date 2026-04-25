@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/api/pattern-agent.js
git commit -m "fix: pattern-agent add order to trades query, expose fetch_errors in response"
git push origin main
pause

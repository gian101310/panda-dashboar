@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/api/pattern-agent.js
git commit -m "fix: pattern-agent surface fetch errors, guard delete before trade query fails"
git push origin main
pause

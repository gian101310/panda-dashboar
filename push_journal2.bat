@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\api\journal.js
git commit -m "fix: journal API filter from Jan 2026 by default"
git push origin main
echo DONE

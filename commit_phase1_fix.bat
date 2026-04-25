@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/api/signal-tracker.js
git commit -m "fix: Phase 1 data integrity - remove TBG requirement from BB signal tracking and snapshots"
git push origin main
pause

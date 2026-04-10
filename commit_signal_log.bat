@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "Add Signal Log tab + signal_snapshots table - logs all 21 pairs every engine cycle with valid/invalid flags, filters by date/bias/symbol/validity"
git push origin main

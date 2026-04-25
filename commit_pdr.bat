@echo off
cd C:\Users\Admin\panda-dashboard
git add -A
git commit -m "feat: PDR tracking — pdr_cache table, pdr on signal_tracker open, pdr.js per-symbol cache"
git push origin main
echo Done.
pause

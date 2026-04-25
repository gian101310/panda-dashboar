@echo off
cd C:\Users\Admin\panda-dashboard
git add -A
git commit -m "feat: logging patch — session on signal_results, gap_delta on snapshots, session names unified"
git push origin main
echo Done.
pause

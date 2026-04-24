@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "PDR badges, spike throttle, auto-heal engine, watchdog bat, TABLE PDR column"
git push origin main
echo PUSH DONE

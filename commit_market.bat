@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "Add market on/off toggle - engine skip + dashboard LIVE/CLOSED indicator"
git push origin main
echo PUSH DONE

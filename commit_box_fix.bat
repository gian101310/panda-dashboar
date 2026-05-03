@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/api/signal-tracker.js
git commit -m "fix: add box_h1_trend, box_h4_trend to signal-tracker dashboard select - all 1662 prior records have null box data due to missing fields in query"
git push origin main

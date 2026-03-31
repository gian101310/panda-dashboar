@echo off
cd /d C:\Users\Admin\panda-dashboard
echo Committing fixed dashboard.js...
git add -f pages\dashboard.js pages\api\data.js pages\api\spikes.js
git commit -m "fix build duplicate stateColor spike banner limit 10"
git push origin main
echo.
echo DONE
pause

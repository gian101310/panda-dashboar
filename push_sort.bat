@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js
git commit -m "fix: setups tab sort alphabetical"
git push origin main
echo DONE

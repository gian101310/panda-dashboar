@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js
git commit -m "feat: box confirm badge + ATR on panels setups valid pairs"
git push origin main
echo DONE

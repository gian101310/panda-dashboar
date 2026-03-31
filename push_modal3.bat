@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js
git commit -m "fix: modal inside JSX fragment before closing tag"
git push origin main
echo DONE

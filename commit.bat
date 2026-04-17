@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "Analytics: remove 30-day limit, add pair + date filters, raise limit to 2000"
git push origin main

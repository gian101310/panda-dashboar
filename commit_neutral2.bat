@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "Enforce NEUTRAL vs NEUTRAL as invalid across all dashboard views"
git push origin main
echo PUSH DONE

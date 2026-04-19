@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "Add Twelve Data price capture to signal tracker (15-min intervals)"
git push origin main
echo PUSH DONE

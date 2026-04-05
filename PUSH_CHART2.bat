@echo off
cd C:\Users\Admin\panda-dashboard
git add -A
git commit -m "fix: ChartTab srcdoc iframe bypasses X-Frame-Options"
git push origin main
echo DONE

@echo off
cd C:\Users\Admin\panda-dashboard
git add -A
git commit -m "fix: ChartTab srcdoc built via array join no template literal crash"
git push origin main
echo DONE

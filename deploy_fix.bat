@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "fix: ChartTab crash - React.useState to useState, improve iframe sandbox"
git push origin main

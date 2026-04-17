@echo off
cd /d C:\Users\Admin\panda-dashboard
del push3.bat 2>nul
git add -A
git commit -m "fix: correct flow - sign up first then message bot for credentials"
git push origin main

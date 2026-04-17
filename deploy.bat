@echo off
cd /d C:\Users\Admin\panda-dashboard
del patch_pricing3.py 2>nul
del push3.bat 2>nul
del push_final.bat 2>nul
npx next build
if %errorlevel% neq 0 (
  echo BUILD FAILED
  exit /b 1
)
git add -A
git commit -m "feat: deep link flow - one click password delivery via Telegram"
git push origin main

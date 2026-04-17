@echo off
cd /d C:\Users\Admin\panda-dashboard
npx next build
if %errorlevel% neq 0 (
  echo BUILD FAILED
  pause
  exit /b 1
)
git add -A
git commit -m "feat: add telegram-webhook API route on Vercel"
git push origin main
echo DONE

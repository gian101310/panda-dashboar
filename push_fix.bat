@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "fix: batch insert ai_memory to avoid Vercel timeout"
git push origin main

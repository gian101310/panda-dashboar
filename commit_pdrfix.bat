@echo off
cd C:\Users\Admin\panda-dashboard
git add -A
git commit -m "fix: pdr_cache schema corrected + batch delay 1.5s->10s (rate limit fix)"
git push origin main
echo Done.
pause

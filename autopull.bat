@echo off
REM Panda Engine auto-pull (Windows) — register with Task Scheduler (see SETUP_AUTOPULL.md).
REM Pulls latest origin/main ONLY if safe: no local edits, fast-forward only.
cd /d C:\Users\Admin\panda-dashboard
git diff --quiet 2>nul || exit /b 0
git diff --cached --quiet 2>nul || exit /b 0
git fetch origin 2>nul
git merge --ff-only origin/main 2>nul
exit /b 0

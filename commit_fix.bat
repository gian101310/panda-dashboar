@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "Fix signal-log API - use shared supabase client instead of env vars"
git push origin main

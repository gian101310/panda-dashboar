@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/api/pdr.js pages/dashboard.js
git commit -m "feat: PDR Supabase cache (15min TTL), confidence+historical merge with CONFLICT flag (A5 complete)"
git push origin main
pause

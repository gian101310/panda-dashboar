@echo off
cd /d C:\Users\Admin\panda-dashboard
git add lib/supabase.js pages/api/data.js pages/api/signal-analytics.js pages/api/signal-log.js pages/api/strength-history.js pages/api/signal-tracker.js pages/api/pdr.js
git commit -m "security: move service_role key to env var, auth gates on all public API routes, engine secret for tracker POST"
git push origin main
pause

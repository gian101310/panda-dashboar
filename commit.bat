@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "SaaS integration: /=landing /login=auth /pricing=funnel, updated tiers, all auth redirects"
git push origin main

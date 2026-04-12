@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "feat: add confidence scoring with global propagation (60-100 scale, ELITE/HIGH/MOD tiers)"
git push origin main

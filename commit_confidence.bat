@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "fix: remove confidence threshold - always show score for all pairs (5 tiers: ELITE/HIGH/MOD/LOW/WEAK)"
git push origin main

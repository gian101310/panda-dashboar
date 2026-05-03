@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/api/pdr.js pages/api/signal-tracker.js
git commit -m "fix: PDR strong = clean candle (retracement <= 50%%), drop ATR ratio requirement + box fields in tracker select"
git push origin main

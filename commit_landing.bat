@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages\index.js
git commit -m "Landing page rebuild: Dark Matter cinematic design - orbital ring, live ticker, scroll reveals, features grid, pricing, testimonials"
git push origin main
echo DONE
pause

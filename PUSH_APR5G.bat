@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/dashboard.js pages/admin/index.js
git commit -m "Granular per-tab access control: all tabs + heatmap + spike banner in admin"
git push
echo DONE

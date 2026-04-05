@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/dashboard.js pages/admin/index.js styles/globals.css
git commit -m "Lighter dark theme, auto-fit grid for uniform panel layout, CSS vars in admin"
git push
echo DONE

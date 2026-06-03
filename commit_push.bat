@echo off
set PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%

echo === PANDA ENGINE (Consolidated Repo) ===
cd /d "C:\Users\Admin\Documents\Claude\Projects\Panda Engine"
git add -A
git commit -m "update: %date% %time%"
git push origin main

echo === DONE ===
pause

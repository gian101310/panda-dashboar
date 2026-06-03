@echo off
set PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%
cd /d "%~dp0"
echo === RESOLVING CONFLICTS (keeping our new versions) ===
git checkout --ours lib/supabase.js
git checkout --ours next.config.js
git checkout --ours package.json
git checkout --ours pages/_app.js
git checkout --ours pages/api/data.js
git checkout --ours pages/api/login.js
git checkout --ours pages/api/logout.js
git checkout --ours pages/dashboard.js
git checkout --ours pages/index.js
git checkout --ours styles/globals.css
git add -A
echo === COMMITTING MERGE ===
git commit -m "merge: preserve old history, consolidate all repos into unified structure"
echo === PUSHING ===
git push -u origin main
echo === DONE ===
pause

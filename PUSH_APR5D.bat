@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/dashboard.js
git commit -m "Fix: SignalFlashcard as proper React component, no more hooks-in-IIFE crash"
git push
echo DONE

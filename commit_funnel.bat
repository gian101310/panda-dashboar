@echo off
cd /d C:\Users\Admin\panda-dashboard
git add pages/funnel.js pages/api/public-signals.js
git commit -m "feat: conversion funnel rewrite with live proof section + public signals API"
git push origin main
pause

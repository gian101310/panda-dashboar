@echo off
title PANDA DASHBOARD — GIT PUSH
color 0B

cd /d C:\Users\Admin\panda-dashboard

echo.
echo  =============================================
echo    PANDA DASHBOARD — PUSH TO VERCEL
echo  =============================================
echo.

REM Show what files changed
echo  CHANGED FILES:
echo  -------------
git status --short
echo.

REM Ask for commit message
set /p msg= Enter commit message (or press ENTER for "update dashboard"): 

REM Use default message if blank
if "%msg%"=="" set msg=update dashboard

echo.
echo  Checking for duplicate functions...
py -3.11 check_dupes.py
echo.

REM Confirm before pushing
set /p confirm= Push with message "%msg%"? (Y/N): 
if /i not "%confirm%"=="Y" (
    echo  Cancelled.
    pause
    exit
)

echo.
echo  Adding all files...
git add -A

echo  Committing...
git commit -m "%msg%"

echo  Pushing to GitHub...
git push origin main

echo.
echo  =============================================
echo   DONE! Vercel is building now (~60 seconds)
echo   URL: https://panda-dashboard.vercel.app
echo  =============================================
echo.
pause

@echo off
REM Double-click this file. Click YES on the Windows admin (UAC) prompt.
REM It stops the watchdog / auto-pull tasks from flashing a terminal every 5 minutes.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"C:\Users\Admin\Documents\Claude\Projects\Panda Engine\fix_popups.ps1\"'"

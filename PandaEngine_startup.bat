@echo off
cd /d "C:\Users\Admin\Documents\Claude\Projects\Panda Engine"
py -3.11 -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload --reload-dir "C:\Users\Admin\Documents\Claude\Projects\Panda Engine"

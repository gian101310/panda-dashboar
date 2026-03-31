@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -f PANDA_ENGINE_MASTER_CONTEXT.md
git commit -m "docs: master context file"
git push origin main
echo DONE

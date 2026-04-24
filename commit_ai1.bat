@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "AI refinements: memoryIndex, getEdgeMemory, getMaturity, agent logging, computed timestamp"
git push origin main
echo PUSH DONE

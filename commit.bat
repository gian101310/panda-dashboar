@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit --amend -m "Add Panda AI tab: chatbot + market insights + trade review with guardrails"
git push origin main --force

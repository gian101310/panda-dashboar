@echo off
cd /d C:\Users\Admin\panda-dashboard
git add lib/auth.js pages/api/logout.js pages/api/ai-chat.js pages/api/ai-memory.js pages/api/telegram-webhook.js pages/api/pattern-agent.js
git commit -m "fix: Phase 2 security - session expiry, logout revoke, ai-chat auth gate, ai-memory write guard, tg webhook secret, pattern-agent strategy field"
git push origin main
pause

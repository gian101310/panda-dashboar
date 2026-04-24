> # PANDA ENGINE — CHANGELOG
>
> Claude updates this at the end of every session. Most recent entries first. Keep only last 15 sessions.

---

## Apr 25, 2026 — Phase 2 Security & Stability Fixes (2 commits)

**Fix 1: lib/auth.js — `expires_at` enforced in `validateSession()`**
- Expired users with active session cookies can no longer bypass expiry
- Auto-disables account + revokes all sessions on expiry detection (same as login.js)

**Fix 2: api/logout.js — DB session revoked on logout**
- `panda_sessions.is_revoked = true` set on logout, not just cookie cleared
- Captured session tokens are now invalidated immediately on logout

**Fix 3: api/ai-chat.js — Auth gate + isAdmin from session cookie**
- Endpoint was fully unauthenticated — any external actor could call it
- `userId` from `req.body` removed — admin role now derived from validated session only
- Closes admin knowledge spoofing vector

**Fix 4: api/ai-memory.js — validateSession on POST and DELETE**
- Write and delete operations on agent memories now require valid session
- GET remains open (read-only, used on dashboard mount)

**Fix 5: api/telegram-webhook.js — TG_WEBHOOK_SECRET header validation**
- `X-Telegram-Bot-Api-Secret-Token` header checked on every incoming request
- Blocks mass account creation from non-Telegram POST requests
- Requires TG_WEBHOOK_SECRET in Vercel env vars + webhook re-registered ✅

**Fix 6: api/pattern-agent.js — strategy: 'BB' added to pair memories**
- alpha_pair, leak_pair, overtraded_weak memories were missing strategy field
- Without it, memoryIndex keyed them as `unknown_pair_X` — invisible to edge badges
- Now correctly indexed as `BB_pair_NZDCAD` etc.

**Fix 7: app.py — CORS, login alert URL, PREV_GAP pre-load**
- CORS: added pandaengine.app + www.pandaengine.app, removed duplicate origin
- Login alert URL fixed: panda-dashboard.vercel.app → pandaengine.app
- PREV_GAP pre-loaded from dashboard table on first cycle — eliminates phantom BB signals after every engine restart

**Commits:** e50bc49 (dashboard), 737efb2 (engine)
**Engine restart required** for app.py changes to take effect.

---

## Apr 25, 2026 — Phase 1 Data Integrity Fixes (2 commits)

**Fix 1: signal-tracker.js —** `isValidSignal()` **TBG gate removed**

- BB strategy does NOT require TBG confirmation — only gap &gt;= 5 + BUY/SELL bias
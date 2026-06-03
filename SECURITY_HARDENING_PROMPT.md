# Panda Engine — Security Hardening (from Code Audit)

A read-only code audit was completed on the Panda Engine project. No files were modified. This session implements the critical and high-priority fixes identified. **Read the panda-engine skill FIRST before touching any file.**

---

## CONTEXT

**What was found:**

1. **CRITICAL — Hardcoded secrets in tracked files.** Live Supabase service key, OpenAI API key, Telegram bot tokens, and ENGINE_SECRET are hardcoded in:
   - `app.py` (config block ~lines 49-72)
   - Multiple Next.js API routes: `login.js`, `notify-telegram.js`, `pf-signup.js`, `pf-log-event.js`, `telegram-webhook.js`, `admin/pf-approve.js`
   - Files in `archive/` folder (old backups contain secrets too)

2. **HIGH — Unauthenticated agent routes.** These API routes accept POST requests and write to `ai_memory` / analytics tables with NO auth check:
   - `pages/api/signal-agent.js`
   - `pages/api/journal-agent.js`
   - `pages/api/pattern-agent.js`

3. **HIGH — Telegram token scattered across 6+ routes.** Each route hardcodes its own bot token instead of using a shared helper.

4. **MEDIUM — package-lock.json not tracked.** `.gitignore` excludes it, so Vercel installs can drift.

5. **MEDIUM — `pages/api/admin-brain.js` uses `supabase` but doesn't import it** — likely runtime-breaking.

6. **LOW — `pages/api/admin/index.js` appears to be a React page misplaced in the API folder.**

---

## TASK ORDER (do these sequentially, confirm each before moving to next)

### Task 1: Centralize Telegram helper
- Create `lib/telegram.js` that exports a `sendTelegramMessage(chatId, text)` function
- It should read `TELEGRAM_TOKEN` from `process.env.TELEGRAM_TOKEN`
- Then update ALL routes that hardcode the Telegram token to import from `lib/telegram.js` instead
- Routes to check: `login.js`, `notify-telegram.js`, `pf-signup.js`, `pf-log-event.js`, `telegram-webhook.js`, `admin/pf-approve.js`, `signal-tracker.js`
- **DO NOT change any business logic** — only replace the hardcoded token + fetch call with the shared helper

### Task 2: Remove hardcoded secrets from app.py
- In `app.py` config block (~lines 49-72), replace all hardcoded values with `os.environ.get()` calls
- Keys to externalize: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `ENGINE_SECRET`, `TWELVEDATA_API_KEY`
- Add a `.env.example` file in `ctrader_trend_scanner/` listing all required env vars (no values)
- Verify app.py already imports `os` and uses `python-dotenv` or add it
- **DO NOT touch lines ~421-536 (locked scoring logic)**

### Task 3: Auth-gate the agent routes
- Add `ENGINE_SECRET` header check to: `signal-agent.js`, `journal-agent.js`, `pattern-agent.js`
- Use the same pattern that `signal-tracker.js` already uses for its POST auth (dual: session cookie OR ENGINE_SECRET header)
- Return 401 if neither auth method passes

### Task 4: Fix admin-brain.js import
- Check if `pages/api/admin-brain.js` is missing the supabase import
- If yes, add `import { supabase } from '../../lib/supabase'`
- Verify the route works by reading the full file

### Task 5: Track package-lock.json
- Remove `package-lock.json` from `.gitignore`
- Confirm the lockfile exists in `C:\Users\Admin\panda-dashboard\`
- If it doesn't exist, run `npm install` to generate it

### Task 6: Inspect misplaced admin/index.js
- Read `pages/api/admin/index.js` fully
- If it's a React page (has JSX/component export), it's misplaced — report what it contains so I can decide what to do
- If it's a valid API route, leave it alone

---

## RULES
- Follow the 7-step dev workflow from memory (read first, chunked writes, check_dupes, build, bat commit, changelog, re-upload)
- Do NOT rewrite dashboard.js
- Do NOT modify scoring logic in app.py
- Do NOT touch archive/ files (secret scrubbing from git history is a separate task)
- Show me the exact changes for each task before writing them
- After all tasks: run `npx next build` to verify nothing breaks

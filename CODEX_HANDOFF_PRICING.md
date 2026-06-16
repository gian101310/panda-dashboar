# Codex Handoff — Pricing & Signup Flow (June 17, 2026)

## What Was Done

### Pricing Page Restructured (`pages/pricing.js`)
- Renamed FREE → STARTER tier
- Three tiers: STARTER ($0), PRO ($29/mo), ELITE ($79/mo)
- Signup modal collects: email, username, @telegram (optional)
- POST to `/api/pf-signup` with `{ email, username, telegram, tier }`
- Deep link button "GET MY PASSWORD" opens `t.me/Panda_new_user_alert_bot?start=<token>`

### Three Telegram Bots — Strict Separation

| Bot | Username | Token Env Var | Purpose |
|-----|----------|---------------|---------|
| **New signup bot** | `@Panda_new_user_alert_bot` | `PF_BOT_TOKEN` | Handles new user signups, sends payment links, admin alerts for new signups |
| **Approve bot** | `@panda_engine_alerts_bot` | `PF_APPROVE_BOT_TOKEN` | Sends credentials after admin approval, payment link resends, approval admin alerts |
| **Spike alert bot** | `@Panda_Gap_Spike_alert_bot` | `TELEGRAM_BOT_TOKEN` | Engine gap/spike alerts (unchanged) |

### Webhook Setup
- Webhook registered for `@Panda_new_user_alert_bot` → `https://pandaengine.app/api/telegram-webhook`
- `TG_WEBHOOK_SECRET` removed from Vercel (was causing 403s)
- Old bot (`@Panda_Gap_Spike_alert_bot`) webhook deleted — it was incorrectly receiving signup requests

### Signup Flow (Starter — Free)
1. User signs up on `/pricing` → auto-approved → `pf-signup.js` creates account with `status: 'AUTO'`
2. User clicks "GET MY PASSWORD" → opens `@Panda_new_user_alert_bot`
3. `telegram-webhook.js` finds token, sees `pending_password` → sends credentials instantly
4. Admin gets notification via `@Panda_new_user_alert_bot`

### Signup Flow (PRO/ELITE — Paid)
1. User signs up on `/pricing` → `pf-signup.js` creates request with `status: 'PENDING'`
2. User clicks "GET MY PASSWORD" → opens `@Panda_new_user_alert_bot`
3. `telegram-webhook.js` finds token, sees PENDING → saves `telegram_chat_id` + sends payment link
4. Admin gets "USER ON TELEGRAM" notification via `@Panda_new_user_alert_bot`
5. Admin approves on `/admin/pf-approvals` → `pf-approve.js` generates password
6. If `telegram_chat_id` exists → auto-sends credentials via `@panda_engine_alerts_bot`

### Files Modified
- `pages/pricing.js` — Tier restructure, deep links updated to new bot
- `pages/funnel.js` — Deep links updated to new bot
- `pages/pending.js` — Links kept on old bot (`@panda_engine_alerts_bot`) for existing users
- `pages/api/pf-signup.js` — Accepts telegram field, unified starter features
- `pages/api/telegram-webhook.js` — Payment links enabled, uses `PF_BOT_TOKEN` (new bot)
- `pages/api/admin/pf-approve.js` — Two bot functions: `pfSendApproveBot` (old bot) + `pfSendTelegram` (new bot)
- `pages/api/waitlist.js` — NEW: saves waitlist emails to `pf_waitlist` table

### Supabase Changes
- Created `pf_waitlist` table (id, created_at, email UNIQUE)
- Added `telegram_chat_id` text column to `pf_signup_requests`

### Vercel Env Vars (current state)
- `PF_BOT_TOKEN` = new signup bot token (`@Panda_new_user_alert_bot`)
- `PF_APPROVE_BOT_TOKEN` = approve bot token (`@panda_engine_alerts_bot`)
- `PF_ADMIN_CHAT` = admin chat ID for notifications
- `TG_WEBHOOK_SECRET` = **DELETED** (was blocking webhook)

### Tier Feature Access (canonical, in pf-approve.js)
```javascript
const PF_TIER_FEATURES = {
  starter: ['signals','calculator'],
  pro:     ['signals','calculator','panels','table','setups','panda_ai','calendar','cot'],
  elite:   ['signals','calculator','panels','table','setups','panda_ai','calendar','cot','overview','signal_log','valid_pairs','alerts','spike_log','journal','chart','gap_chart','analytics','heatmap','mt4_indicators','bias_indicators']
};
```

### Payment Links (placeholder — same Ziina URL, blank amount)
```javascript
const PAYMENT_LINKS = {
  pro:   'https://pay.ziina.com/PandaEngine/SrakUhZyl?source=app',
  elite: 'https://pay.ziina.com/PandaEngine/SrakUhZyl?source=app',
};
```
**TODO:** Create 2 separate Ziina links with preset amounts once pricing is finalized.

## What's Left / Known Issues
- Payment links use same placeholder URL — need separate links per tier
- `@panda_engine_alerts_bot` has NO webhook registered — it's used for outbound DMs only (via API), not inbound commands
- Prices updated: STARTER free 1-week trial, PRO $99/mo ($3,499 lifetime), ELITE $699/mo ($4,999 lifetime)
- Login URL in approval DM updated to `pandaengine.app/login` (was `panda-dashboard.vercel.app`)

## DO NOT TOUCH
- `vercel.json` — deploy guardrail
- `package.json` / `package-lock.json` — causes outage if deleted
- `PF_TIER_FEATURES` — canonical source of truth for feature access
- Scoring logic in `app.py` lines 327–436

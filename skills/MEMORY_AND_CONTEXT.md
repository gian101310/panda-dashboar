# MEMORY & CONTEXT — Persistent State

## User Preferences
- Boss-G: solo founder/operator, full-stack, Python/FastAPI + Next.js + Supabase + Vercel
- Expects Claude as senior collaborator, not architect — all decisions are his
- Prefers: code-first answers, no hand-holding, skip preamble
- Uses: Cowork mode, Desktop Commander, Supabase MCP, Vercel MCP
- Bash sandbox may be unavailable — fall back to Desktop Commander

## Locked Items Registry
- `app.py` lines ~421–536: LOCKED FOREVER (core scoring)
- Security layer (validates_session, isAdmin, webhook secret): Locked since Apr 25
- dashboard.js: Never rewrite wholesale

## Decisions Already Made
- Check memory files before contradicting past decisions
- Do not re-propose rejected approaches
- Do not contradict confirmed decisions unless Boss-G changes them
- If context is missing, ask one precise question — don't guess

## Revision Tracking
- Track what has already been revised in the current session
- Track files already checked — don't re-read unnecessarily
- Track which changes were approved vs. proposed

## Domain Constants
- FLAT = unresolved (not a third result type)
- Maturity: Proven ≥50, Developing 20-49
- Sessions: ASIAN 22:00-05:59 UTC / LONDON 06:00-13:59 / NEW_YORK 14:00-21:59
- ai_memory keying: strategy-based (BB/INTRA), NOT symbol-based
- Telegram: single group, per-user AI = dashboard-only (Pro/Elite)

## External API Constraints
- See CODING_RULES.md for rate limits, auth patterns, and Supabase gotchas.
- Vercel: auto-deploys on push to main.
- Supabase: 31 tables — verify existence before migrations.

# PANDA ENGINE — CHANGELOG

> Claude updates this at the end of every session.
> Most recent entries first. Keep only last 15 sessions.

---

## Apr 18, 2026 — Analytics Tab: All-Time Data + Filters
- Removed hardcoded 30-day window from `signal-analytics.js` — now fetches all-time by default
- Added pair filter dropdown (ALL_PAIRS) to SignalAnalytics component
- Added date range filters (from/to) with clear button
- Raised API limit from 500 to 2000 rows
- API accepts `symbol`, `from`, `to` query params
- Files changed: `pages/api/signal-analytics.js`, `pages/dashboard.js`
- Commit: `fff930f`

## Apr 18, 2026 — Merge Calendar + COT into Research Tab
- Merged CALENDAR and COT REPORT tabs into single RESEARCH tab with subtab toggle (Calendar | COT)
- Created `ResearchTab` component with inline subtab state
- Updated TABS array: 13 tabs → 12 tabs (removed CALENDAR + COT REPORT, added RESEARCH)
- Updated TAB_FEATURE mapping: merged both keys into `'RESEARCH': 'calendar'`
- Updated COT fetch trigger to fire on RESEARCH tab
- Removed inline COT REPORT render block from ternary chain
- Files affected: `dashboard.js` (2459 lines, was 2447)
- Build: ✅ passed | Dupes: ✅ none

## Apr 6, 2026 — Chart Tab Fix + Skill + Project Setup
- Fixed ChartTab crash: `React.useState` → `useState` (lines 1438-1439)
- Improved TradingView iframe sandbox (`allow-popups allow-popups-to-escape-sandbox`)
- Built complete `SKILL.md` (327 lines) with file map, component index, playbooks
- Created Claude Project "Panda Engine" with full instructions
- Uploaded SKILL.md as project knowledge
- Created this CHANGELOG.md
- Commit: `b772f93`
- dashboard.js: 2052 lines (unchanged)

## Apr 5, 2026 — Chart Tab + PairCardModal Cleanup
- Restored clean PairCardModal (removed tabs/chart inside modal)
- Added standalone CHART tab: pair selector, TF switcher (M15/H1/H4/D1), TradingView iframe 600px, Dubai timezone
- Commit: `60a64c4`
- dashboard.js: 2052 lines

## Apr 2, 2026 — TBG + Signals + Access Control (Major Build)
- TBG integration: SuperTrend + FollowLine badge on pair cards
- Built `TBG_MultiExporter` cBot for cTrader
- Built SIGNALS tab (clean BUY/SELL labels)
- Per-user tab access control (`feature_access` TEXT[] column)
- 5-minute scheduler in app.py
- Created `PANDA_ENGINE.bat` and `PUSH.bat` scripts
- Supabase RLS fixes across all 19 tables
- Vercel URL renamed to `panda-dashboard.vercel.app`
- Created 7-page PDF user guide

---

## PENDING / NEXT UP
- VPS migration (Hyonix HS-2, $12/mo — decision made, not yet purchased)
- Signal tab YouTube redesign (Bloomberg-style, motion, live indicators)
- Landing/funnel pages (Free/Pro/Elite tiers)
- Mobile layout optimization
- PWA publishing

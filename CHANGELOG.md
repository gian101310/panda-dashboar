> # PANDA ENGINE — CHANGELOG

> Claude updates this at the end of every session. Most recent entries first. Keep only last 15 sessions.

---

## Apr 24, 2026 — Major Build Session (AI Refinements + PDR + Engine Hardening)

**AI Memory Foundation (dashboard.js)**

- memoryIndex with strategy-based keying (gap_tbg, gap_only, tbg_only, general)
- getEdgeMemory() with audit-validated lookup: gap+tbg → gap → overall
- getMaturity() helper: proven &gt;=50, developing 20-49
- Edge badges: PROVEN_EDGE (green), DEAD_ZONE (red) with dual win rate + sample size
- Memory + PDR fetched once on mount

**PDR Strength Feature (Twelve Data D1 OHLC)**

- New: pages/api/pdr.js (130 lines)
- PdrBadge component on PANELS + TABLE
- 21 credits/day, 15-minute cache

**RIDE IT Bias Alignment Fix**

- getMomentumAction() checks trend1h vs bias direction
- COUNTER label (orange) when momentum opposes bias

**Tab Merge: SPIKE LOG + SIGNAL LOG → LOGS (13 → 12 tabs)**

**Spike Throttle: gap &gt;= 7 + 4-hour cooldown per pair**

**Auto-Heal: 3 consecutive stale cycles → Telegram alert + sys.exit(1) + watchdog bat**

**Agent Improvements: computed timestamp, stale warning, run summary logging**

**Commits:** f34367d, 6e7cba1, f0d04a3 **dashboard.js:** \~2,755 lines | [**app.py**](http://app.py)**:** \~1,676 lines

---
# Hermes Phase 1 — Query Results (run by Claude on 2026-05-28 ~08:40 UTC)

Settings: limit=100 for gap history, all 21 pairs, wait for approval before inserting learnings, full report with tables.

---

## 1. get_dashboard_snapshot() — 21 rows

| Symbol | Gap | Bias | Execution | Confidence | Hard Invalid |
|--------|-----|------|-----------|------------|--------------|
| AUDCAD | -1 | INVALID | NONE | INVALID | false |
| AUDJPY | -2 | INVALID | NONE | INVALID | false |
| AUDNZD | -10 | SELL | MARKET | HIGH | false |
| AUDUSD | -9 | SELL | MARKET | MEDIUM | false |
| CADJPY | 0 | HARD_INVALID | NONE | INVALID | true |
| EURAUD | 7 | BUY | PULLBACK | LOW | false |
| EURCAD | 0 | HARD_INVALID | NONE | INVALID | true |
| EURGBP | 0 | HARD_INVALID | NONE | INVALID | true |
| EURJPY | 0 | HARD_INVALID | NONE | INVALID | true |
| EURNZD | -3 | INVALID | NONE | INVALID | false |
| EURUSD | -2 | INVALID | NONE | INVALID | false |
| GBPAUD | 1 | INVALID | NONE | INVALID | false |
| GBPCAD | 0 | HARD_INVALID | NONE | INVALID | true |
| GBPJPY | 0 | HARD_INVALID | NONE | INVALID | true |
| GBPNZD | -9 | SELL | MARKET | MEDIUM | false |
| GBPUSD | -8 | SELL | PULLBACK | MEDIUM | false |
| NZDCAD | 9 | BUY | MARKET | MEDIUM | false |
| NZDJPY | 8 | BUY | PULLBACK | MEDIUM | false |
| NZDUSD | 1 | INVALID | NONE | INVALID | false |
| USDCAD | 8 | BUY | PULLBACK | MEDIUM | false |
| USDJPY | 7 | BUY | PULLBACK | LOW | false |

Active signals: AUDNZD SELL(-10), AUDUSD SELL(-9), EURAUD BUY(7), GBPNZD SELL(-9), GBPUSD SELL(-8), NZDCAD BUY(9), NZDJPY BUY(8), USDCAD BUY(8), USDJPY BUY(7). Hard invalid: CADJPY, EURCAD, EURGBP, EURJPY, GBPCAD, GBPJPY.

---

## 2. get_signal_results_summary()

| Strategy | Status | Count |
|----------|--------|-------|
| BB | DONE | 2408 |
| BB | PENDING | 1 |
| INTRA | DONE | 77 |

Total signals: 2,486 (BB: 2,409, INTRA: 77)

---

## 3. get_engine_heartbeat() — last 5

| ID | Cycle Type | Pairs | Signals Pushed | Duration | Created At (UTC) |
|----|-----------|-------|----------------|----------|-----------------|
| 1665 | gap_cycle | 21 | 9 | 0.00s | 2026-05-28 08:40:17 |
| 1664 | gap_cycle | 21 | 9 | 0.00s | 2026-05-28 08:35:24 |
| 1663 | gap_cycle | 21 | 9 | 0.00s | 2026-05-28 08:31:00 |
| 1662 | gap_cycle | 21 | 9 | 0.00s | 2026-05-28 08:25:22 |
| 1661 | gap_cycle | 21 | 10 | 0.00s | 2026-05-28 08:20:32 |

Engine healthy — 5-min cycles, all 21 pairs processed, 9-10 signals pushed per cycle.

---

## 4. get_ea_executions() — last 5

| Symbol | Strategy | Direction | Fill Price | Profit Pips | Profit $ | Close Reason | Open → Close |
|--------|----------|-----------|-----------|-------------|----------|-------------|-------------|
| EURJPY | BB | BUY | 185.576 | -58.0 | -$3.63 | SL_HIT | May 27 10:11 → May 28 06:56 |
| GBPJPY | BB | BUY | 214.674 | -61.4 | -$3.85 | SL_HIT | May 25 22:56 → May 28 00:15 |
| EURAUD | PULLBACK | BUY | 1.63009 | -29.3 | -$2.09 | SL_HIT | May 27 13:05 → May 28 00:02 |
| NZDUSD | IM | SELL | 0.58309 | -62.7 | -$6.27 | SL_HIT | May 18 02:41 → May 27 15:18 |
| NZDUSD | BB | SELL | 0.58309 | -62.7 | -$6.27 | SL_HIT | May 18 02:41 → May 27 15:18 |

All 5 recent EA trades closed by SL_HIT (losses). Total: -$22.11 across 5 trades.

---

## 5. get_hermes_learnings()

| ID | Category | Subject | Finding | Status |
|----|----------|---------|---------|--------|
| 2 | test | connectivity-check | test insert from Hermes | active |
| 1 | system_test | hermes_setup | SECURITY DEFINER functions verified working | active |

---

## 6. Gap History — Aggregate Stats (all 21 pairs, ~1,445-1,447 rows each)

| Symbol | Rows | Avg Gap | Min | Max | StdDev |
|--------|------|---------|-----|-----|--------|
| AUDCAD | 1445 | 2.20 | -5 | 10 | 3.68 |
| AUDJPY | 1445 | 0.67 | -5 | 8 | 2.40 |
| AUDNZD | 1446 | -0.08 | -10 | 10 | 5.04 |
| AUDUSD | 1447 | -0.35 | -10 | 8 | 3.15 |
| CADJPY | 1447 | -0.73 | -6 | 3 | 1.44 |
| EURAUD | 1447 | 0.71 | -5 | 8 | 2.19 |
| EURCAD | 1447 | 2.85 | 0 | 9 | 3.39 |
| EURGBP | 1447 | 0.06 | -6 | 7 | 2.53 |
| EURJPY | 1446 | 1.25 | 0 | 8 | 2.68 |
| EURNZD | 1447 | 0.76 | -7 | 8 | 3.48 |
| EURUSD | 1446 | 0.06 | -5 | 7 | 1.65 |
| GBPAUD | 1447 | 0.42 | -5 | 3 | 0.94 |
| GBPCAD | 1446 | 3.05 | -5 | 10 | 4.26 |
| GBPJPY | 1447 | 2.31 | -5 | 8 | 3.34 |
| GBPNZD | 1447 | 1.15 | -10 | 9 | 5.48 |
| GBPUSD | 1447 | 0.38 | -10 | 8 | 3.45 |
| NZDCAD | 1447 | 2.14 | -6 | 9 | 3.78 |
| NZDJPY | 1447 | 1.32 | -6 | 10 | 3.51 |
| NZDUSD | 1446 | -0.51 | -9 | 5 | 2.72 |
| USDCAD | 1447 | 2.29 | 0 | 8 | 3.17 |
| USDJPY | 1447 | 0.78 | 0 | 8 | 2.17 |

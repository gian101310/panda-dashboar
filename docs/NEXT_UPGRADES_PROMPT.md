# Panda Engine — Next Upgrades Prompt

Copy-paste this into a new Claude chat. Attach the relevant files mentioned below.

---

## CONTEXT

You are continuing work on **Panda Engine**, a modular AI-augmented forex intelligence platform. This is NOT a beginner bot — treat it as a junior prop-desk research system.

### What was just completed (DO NOT REBUILD):
- **EA write-back system** — fully built and deployed:
  - `ea_executions` table in Supabase (project: `jxkelchxitwuilpbrwxk`)
  - `pages/api/ea-result.js` in panda-dashboard (POST endpoint, Bearer auth via EA_API_KEY)
  - `PandaEngine_EA_MT5_v2.10_writeback.mq5` — OnTradeTransaction detects closed positions, sends JSON to API
- **Architecture assessment** — `ARCHITECTURE_ASSESSMENT.md` covers full system classification, risks, and roadmap

### System architecture (4 pillars):
```
Signal Intelligence      → app.py (gap scoring, badges, confluence, PL zones, box trends, momentum)
Execution Intelligence   → signal_tracker (mock) + MT5 EA (live) → ea_executions (write-back NOW ACTIVE)
Performance Intelligence → Signal Agent + Journal Agent + Pattern Agent → ai_memory
Memory Intelligence      → ai_memory (28 records), cross-agent pattern matching, Panda AI reasoning
```

### Key stats:
- 21 forex pairs, 4 strategies (BB, INTRA, PULLBACK, INTRA MASTER)
- signal_tracker: ~3,989 mock trades with price snapshots
- signal_results: ~1,822 records
- ai_memory: only 28 records (STALE — agents last ran Apr 19)
- ea_executions: new table, will populate as live trades close

---

## UPGRADE QUEUE — BUILD THESE IN ORDER

### 1. Re-run Stale Agents (HIGH PRIORITY)
The 3 AI agents haven't run since April 19. ai_memory has only 28 records vs thousands of available data points. The memory layer is starved.

**What to do:**
- Hit the Signal Agent endpoint: `POST /api/signal-agent` — analyzes signal_results by strategy, gap level, PL confirmation, momentum, session, box trend
- Hit the Journal Agent endpoint: `POST /api/journal-agent` — analyzes manual_trades for pair performance, session, hold duration, direction
- Hit the Pattern Agent endpoint: `POST /api/pattern-agent` — cross-references Signal + Journal findings

**Files:** `pages/api/signal-agent.js`, `pages/api/journal-agent.js`, `pages/api/pattern-agent.js`

**Validation:** After running, query `ai_memory` table — should have significantly more than 28 records. Check factor ownership is clean (each agent only writes its own factors).

**IMPORTANT:** Read `AI_BUILD_PLAN.md` before touching any agent code. Agents use MIN_SAMPLE=20 before creating memories.

---

### 2. Execution Quality Agent (NEW AGENT)
Once ea_executions has data, build a new agent that compares mock vs live performance.

**Metrics to compute:**
| Metric | Comparison |
|--------|-----------|
| mock_entry vs live_entry | signal_tracker.entry_price vs ea_executions.fill_price |
| mock_exit vs live_exit | tracker close data vs ea_executions.close_price |
| execution_delta_rr | (live RR - mock RR) / mock RR |
| slippage_pips | Per pair, per session, per time-of-day |
| spread_degradation | Spread at signal time vs spread at fill |
| execution_fidelity_score | Composite 0-100 |

**Create:** `pages/api/execution-agent.js` following the same pattern as signal-agent.js (factor ownership, MIN_SAMPLE=20, writes to ai_memory with its own factor prefix).

**Why:** Edge is identified (91% BB+PL confirmed). Next risk isn't wrong signal — it's correct signal, poor execution.

---

### 3. Confidence Calibration
Validate whether the confidence score actually predicts outcomes.

**What to do:**
- Pull all closed signal_tracker records that have a confidence score
- Bucket by confidence decile (0-10, 10-20, ... 90-100)
- For each bucket: calculate win rate, avg pips, avg hold time
- Check monotonicity: does higher confidence = higher win rate?

**Output:** Write results to ai_memory with factor = "confidence_calibration". If confidence is NOT monotonic, flag which deciles break the pattern.

**Why:** If confidence 80 wins less than confidence 50, the scoring formula needs recalibration before trusting it for position sizing.

---

### 4. File-Age Check in EA
The EA currently reads `panda_score_SYMBOL.txt` regardless of how old the file is. A 30-minute-old file can still trigger trades.

**What to do in the .mq5 file:**
- After `FileOpen()` in `ReadPandaSignal()`, add: `FileGetInteger(handle, FILE_MODIFY_DATE)`
- Compare to `TimeCurrent()` — skip if file is older than 5 minutes (300 seconds)
- Log: `[PANDA] Signal file too old (X min), skipping`

**File:** `PandaEngine_EA_MT5_v2.10_writeback.mq5` (in Panda Engine project folder)

---

### 5. Engine Heartbeat
If the 5-min engine cycle fails silently, nothing alerts. Trades execute on stale data.

**What to do:**
- In `app.py`, after `run_gap_once()` completes, write a heartbeat timestamp to Supabase (new `engine_heartbeat` table or a row in `dashboard`)
- Create a simple check: if no heartbeat in 10 minutes, send Telegram alert
- Can be a new endpoint `/api/engine-health` that the dashboard polls, or a Supabase edge function

---

### 6. Signal-to-Execution Latency Tracking
Build a timestamp chain: signal valid → file written → EA reads → EA fills.

**What to do:**
- app.py already writes files — add `write_time` to the score file
- EA already reads files — log the read time
- EA already reports fills — `open_time` is in ea_executions
- Compute: `signal_to_fill_latency = ea_executions.open_time - score_file.write_time`
- Store in ea_executions as a new column or in a separate latency table

---

## FILES TO ATTACH

For whoever picks this up, attach or have access to:
1. `pages/api/signal-agent.js`
2. `pages/api/journal-agent.js`
3. `pages/api/pattern-agent.js`
4. `pages/api/ea-result.js`
5. `PandaEngine_EA_MT5_v2.10_writeback.mq5`
6. `ARCHITECTURE_ASSESSMENT.md`
7. `AI_BUILD_PLAN.md` (if it exists in panda-dashboard or ctrader_trend_scanner)

## RULES
- DO NOT touch `extract_panda_score` or `compute_scores_all_pairs` in app.py — these are LOCKED
- DO NOT add new indicators or signals — edge is identified, focus on execution fidelity
- All Supabase queries: use `.limit()` to avoid the 1000-row default cap
- Test agents with actual data counts before and after
- Follow the existing code style: inline styles, Share Tech Mono / Orbitron / Rajdhani fonts, same color palette
- Security: all API routes use Bearer token auth or cookie session — no open endpoints

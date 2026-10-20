# Spike Alerts Telegram Group Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every alert sent to the dedicated Spike Alerts Telegram group durable, deduplicated, consolidated, and accurately observable.

**Architecture:** Introduce a Supabase-backed alert outbox as the source of truth for idempotency, cooldowns, attempts, and confirmed delivery. Keep detection in `app.py`, but convert each detector into a candidate producer; a single dispatcher consolidates candidates per pair, writes idempotent outbox rows, groups eligible pairs into one immediate Telegram message per cycle, and records Telegram's response. Momentum-only observations stay in the phase digest. Phase digests use the same delivery primitive while retaining their separate two-hour/change gate.

## Review rulings (2026-10-20)

- A Telegram timeout or a process death during `sendMessage` leaves an ambiguous result. The HTTP Bot API has no caller-supplied idempotency key. Mark the row `uncertain` and require inspection; do not promise exactly-once delivery or blindly retry it.
- An atomic compare-and-set changes a due row from `pending` to `sending` before network I/O. A 90-second lease moves to `uncertain` after a crash, so the row is visible and never silently stuck.
- A normal five-minute cycle sends at most one combined immediate group message. Split only if Telegram's message-length limit requires it. Momentum-only candidates do not trigger a standalone post.
- Time-sensitive gap and early-entry alerts expire after four minutes; structure and Gold events have longer lifetimes. Retry only explicit Telegram rejections that may succeed later, and honor `retry_after`.
- The phase digest excludes symbols queued for an immediate alert in that cycle and reads its last successful send from durable storage. Its copy describes observed conditions rather than issuing entry commands.
- Keep the existing `PREV_GAP`/`gap_deltas` ordering and all locked scoring/strategy rules unchanged.

**Tech Stack:** Python 3.11, `unittest`, `requests`, Supabase/Postgres, Telegram Bot API, Next.js 14 build verification.

**Spec:** `docs/specs/spike-alert-group-reliability.md`

## Implementation record (Windows, 2026-10-20)

The schema was applied to the existing Supabase project and verified with service-role access and RLS checks. The implementation uses focused Python tests in `tests/test_signal_alert*.py`; the task checkboxes below remain the original planning outline rather than a deployment checklist. Production activation requires the managed engine restart, followed by heartbeat and outbox observation. The Spike Log remains an observation log; `signal_alert_outbox` is the delivery record.

## Global Constraints

- Never modify `extract_panda_score()` or `compute_scores_all_pairs()`.
- Never change BB or INTRA entry/exit logic, thresholds, windows, or TBG requirements.
- Never modify or remove `vercel.json` `ignoreCommand`.
- Never start `app.py` from a terminal; Windows starts it only through `START_PANDA.bat`.
- Use the shared Supabase client already initialized in `app.py`; do not expose credentials.
- Before every push run `python3.11 check_dupes.py` on Mac and `npx next build`.
- Commit one independently reviewable feature at a time using kebab-case messages.
- Preserve the unrelated untracked `panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay-Personal-Advanced/` directory.

## Review Focus

- Telegram returns HTTP 200 with JSON `ok: false`: retain a failed attempt and do not mark delivered.
- The process stops after Telegram accepts a message but before the database update: the expired `sending` lease must become `uncertain`; it cannot be safely auto-retried through the HTTP Bot API.
- Two scheduler paths enqueue the same pair/type close together: the database uniqueness constraint must admit only one row.
- A pair recovers from stale or hard-invalid input: seed state without generating momentum, early-entry, or gap-zone noise on the first valid cycle.
- One pair qualifies for structure, gap-zone, early-entry, and momentum simultaneously: emit one prioritized, non-contradictory message.

---

### Task 1: Durable alert outbox schema

**Files:**
- Create: `migrations/20261020_signal_alert_outbox.sql`
- Create: `tests/signalAlertOutboxSql.test.mjs`

**Interfaces:**
- Consumes: Existing Supabase project `jxkelchxitwuilpbrwxk` and service-role writes from `app.py`.
- Produces: `signal_alert_outbox` with `id`, `idempotency_key`, `alert_type`, `symbol`, `bias`, `cycle_at`, `payload`, `status`, `attempt_count`, `next_attempt_at`, `expires_at`, `lease_expires_at`, `last_error`, `telegram_message_id`, `created_at`, and `sent_at`.

- [ ] **Step 1: Write the failing schema contract test**

Create a source-contract test asserting that the migration defines the columns above, a unique constraint on `idempotency_key`, status validation for `pending/sending/sent/failed/uncertain/expired`, an index supporting pending retries, RLS enabled, and no anonymous policies.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/signalAlertOutboxSql.test.mjs`
Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add the migration**

Create `public.signal_alert_outbox` with server defaults, JSONB payload, the unique idempotency key, retry index, RLS enabled, and service-role-only access through the existing server client.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/signalAlertOutboxSql.test.mjs`
Expected: PASS.

- [ ] **Step 5: Apply and verify the migration**

Apply through the Supabase migration tool, then list the table schema and verify the unique constraint, retry index, and RLS state. Do not insert production test alerts.

- [ ] **Step 6: Commit**

```bash
git add migrations/20261020_signal_alert_outbox.sql tests/signalAlertOutboxSql.test.mjs
git commit -m "add-signal-alert-outbox"
```

### Task 2: Pure candidate consolidation and recovery gating

**Files:**
- Create: `lib/signal_alerts.py`
- Create: `tests/test_signal_alerts.py`
- Modify: `app.py:198-203`
- Modify: `app.py:1654-1770`

**Interfaces:**
- Consumes: Candidate dictionaries with `alert_type`, `symbol`, `gap`, `bias`, `momentum`, `priority`, `details`, and `cycle_at`.
- Produces: `mark_input_state(symbol: str, valid: bool) -> bool`, `consolidate_candidates(candidates: list[dict]) -> list[dict]`, and `build_idempotency_key(candidate: dict) -> str`.

- [ ] **Step 1: Write failing recovery-gate tests**

Test that a first valid observation returns false after boot, stale input, or hard-invalid input; the second consecutive valid observation returns true; and later valid observations remain eligible.

- [ ] **Step 2: Write failing consolidation tests**

Test that four same-cycle candidates for one symbol become one candidate, structure outranks gap-zone/early/momentum, evidence from lower priorities remains available, candidates for different symbols remain separate, and generated idempotency keys are stable.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `python3.11 -m unittest tests.test_signal_alerts -v`
Expected: FAIL because `lib.signal_alerts` does not exist.

- [ ] **Step 4: Implement the pure helper module**

Implement the three interfaces without importing `app.py`, Supabase, or `requests`. Use priority order `structure > gap_zone > early_entry > momentum`; use UTC five-minute cycle time, symbol, and primary alert type in the idempotency key.

- [ ] **Step 5: Integrate validity tracking surgically**

Mark stale/missing and hard-invalid symbols invalid. Require `mark_input_state(..., True)` before creating momentum-derived candidates. Do not alter scoring, momentum classification, BB, INTRA, or the gap thresholds.

- [ ] **Step 6: Run tests**

Run: `python3.11 -m unittest tests.test_signal_alerts -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/signal_alerts.py tests/test_signal_alerts.py app.py
git commit -m "suppress-recovery-spike-alerts"
```

### Task 3: Outbox repository and confirmed Telegram delivery

**Files:**
- Create: `lib/signal_alert_outbox.py`
- Create: `tests/test_signal_alert_outbox.py`
- Modify: `app.py:3299-3510`

**Interfaces:**
- Consumes: Existing Supabase client, Telegram token/chat ID, consolidated candidate, and injectable HTTP sender.
- Produces: `enqueue_alert(supabase, candidate: dict) -> dict | None`, `claim_pending_alerts(supabase, limit: int = 20) -> list[dict]`, `send_signal_message(token: str, chat_id: str, text: str, post=requests.post) -> DeliveryResult`, and `record_delivery(supabase, row: dict, result: DeliveryResult) -> None`.

- [ ] **Step 1: Write failing enqueue/idempotency tests**

Using a fake Supabase client, assert duplicate idempotency keys resolve to the existing row, a restart does not create a second row, and database errors do not claim an alert was sent.

- [ ] **Step 2: Write failing Telegram response tests**

Assert success requires HTTP 200, JSON `ok: true`, and `result.message_id`; HTTP errors, `ok: false`, invalid JSON, timeout, and connection exceptions all return failure with a bounded error string.

- [ ] **Step 3: Write failing retry-state tests**

Assert failure increments `attempt_count`, records `last_error`, and schedules bounded backoff; success sets `status=sent`, `sent_at`, and `telegram_message_id`; attempts reaching the configured maximum become `failed`.

- [ ] **Step 4: Run tests to verify they fail**

Run: `python3.11 -m unittest tests.test_signal_alert_outbox -v`
Expected: FAIL because the repository module does not exist.

- [ ] **Step 5: Implement the outbox repository and sender**

Use insert-on-unique semantics for enqueue, atomically claim only due `pending` rows, and use retry delays of 30, 120, and 300 seconds with a maximum of four total attempts. The outbox records a pending candidate before network I/O; only the `sent` state and message ID require confirmed Telegram success. Leave ambiguous sends `uncertain`.

- [ ] **Step 6: Route existing Signal-group senders through the delivery primitive**

Replace direct Signal-group `requests.post` calls in momentum, gap-zone, early-entry, structure, phase-digest, and Gold paths. Preserve main-group, login-group, and engine-health routing unchanged.

- [ ] **Step 7: Run tests**

Run: `python3.11 -m unittest tests.test_signal_alert_outbox -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/signal_alert_outbox.py tests/test_signal_alert_outbox.py app.py
git commit -m "add-reliable-signal-alert-delivery"
```

### Task 4: One coherent immediate message per pair

**Files:**
- Create: `tests/test_signal_alert_messages.py`
- Modify: `app.py:1703-1770`
- Modify: `app.py:2022-2065`
- Modify: `app.py:3299-3510`

**Interfaces:**
- Consumes: `consolidate_candidates()` and `enqueue_alert()` from Tasks 2 and 3.
- Produces: `build_consolidated_signal_text(candidate: dict, now: datetime) -> str` and `dispatch_signal_candidates(candidates: list[dict], cycle_at: datetime) -> list[dict]`.

- [ ] **Step 1: Write failing message tests**

Assert one pair produces one message, the primary reason is displayed first, supporting evidence is present once, HTML-sensitive values are escaped, the message stays below Telegram's 4,000-character limit, and no message contains contradictory action phrases.

- [ ] **Step 2: Write failing cycle-dispatch tests**

Assert same-cycle overlap emits one outbox row per symbol, different symbols share one Telegram post, and one symbol can alert again only after a genuinely new idempotency window and the applicable persisted cooldown.

- [ ] **Step 3: Run tests to verify they fail**

Run: `python3.11 -m unittest tests.test_signal_alert_messages -v`
Expected: FAIL because the consolidated builder/dispatcher does not exist.

- [ ] **Step 4: Convert detectors to candidate producers**

Momentum, gap-zone, early-entry, and structure detection append candidates rather than sending immediately. Gold remains a distinct symbol candidate. Momentum-only observations wait for the digest. Replace imperative wording with observed state plus setup status derived from existing fields; do not introduce new trading rules.

- [ ] **Step 5: Consolidate and dispatch after pair processing**

Call the dispatcher once per engine cycle after all pair candidates are collected. Persist cooldown through successful/outbox state rather than module-only dictionaries.

- [ ] **Step 6: Run tests**

Run: `python3.11 -m unittest tests.test_signal_alert_messages -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/test_signal_alert_messages.py app.py
git commit -m "consolidate-spike-group-alerts"
```

### Task 5: Phase digest deconfliction and operational visibility

**Files:**
- Create: `tests/test_phase_digest_alerts.py`
- Modify: `app.py:2099-2235`
- Modify: `app.py:4297-4365`

**Interfaces:**
- Consumes: Sent immediate-alert symbols from the current cycle and the Task 3 delivery primitive.
- Produces: `build_phase_digest(rows: list[dict], excluded_symbols: set[str]) -> tuple[str, str] | None` and retry processing on every scheduler minute.

- [ ] **Step 1: Write failing digest tests**

Assert immediate-alert symbols are excluded, unchanged content remains suppressed, the two-hour minimum is enforced from persisted sent state, and a failed digest remains retryable without advancing the successful-send timestamp.

- [ ] **Step 2: Write failing retry-loop tests**

Assert the scheduler processes due pending rows even when no new gap cycle runs and that one failed alert cannot block unrelated pending alerts.

- [ ] **Step 3: Run tests to verify they fail**

Run: `python3.11 -m unittest tests.test_phase_digest_alerts -v`
Expected: FAIL until digest construction and retry processing are separated from direct sending.

- [ ] **Step 4: Implement digest deconfliction**

Build the digest from non-alerted symbols, enqueue it through the outbox, and update the digest signature/timestamp only after confirmed delivery.

- [ ] **Step 5: Add pending retry processing to the scheduler**

Process a bounded batch once per scheduler minute through `run_scheduler_step`; keep `ENGINE_LOCK` behavior and all existing market-hours gates intact.

- [ ] **Step 6: Run tests**

Run: `python3.11 -m unittest tests.test_phase_digest_alerts -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/test_phase_digest_alerts.py app.py
git commit -m "deconflict-spike-group-digest"
```

### Task 6: Full verification, documentation, push, and Windows handoff

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: Verified commits on `main` for the Windows checkout to pull.

- [ ] **Step 1: Run focused Python tests**

Run: `python3.11 -m unittest tests.test_signal_alerts tests.test_signal_alert_outbox tests.test_signal_alert_messages tests.test_phase_digest_alerts -v`
Expected: PASS.

- [ ] **Step 2: Run existing engine regression tests**

Run: `python3.11 -m unittest tests.test_snapshot_layout tests.test_news_results tests.test_news_speeches tests.test_mt4_file_parse -v`
Expected: PASS.

- [ ] **Step 3: Run the mandatory duplicate check**

Run: `python3.11 check_dupes.py`
Expected: PASS with no duplicate component/function findings.

- [ ] **Step 4: Run the mandatory production build**

Run: `npx next build`
Expected: successful Next.js production build.

- [ ] **Step 5: Update the changelog**

Document the durable outbox, confirmed delivery state, restart-safe deduplication, recovery suppression, consolidation, tests, and the required Windows restart.

- [ ] **Step 6: Review protected files and locked code**

Run `git diff --check`, inspect `git diff --stat`, confirm `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not deleted, and confirm the locked scoring functions and strategy definitions have no diff.

- [ ] **Step 7: Commit the changelog**

```bash
git add CHANGELOG.md
git commit -m "document-spike-alert-reliability"
```

- [ ] **Step 8: Pull and push**

Run `git pull origin main`, resolve only verified non-overlapping changes, rerun Steps 1-6 if HEAD changes, then run `git push origin main`. Never force-push.

- [ ] **Step 9: Verify Vercel**

Confirm the deployment belongs to `gian101310/panda-dashboar`, takes longer than 20 seconds, and reaches `READY`.

- [ ] **Step 10: Windows handoff**

On the Windows Panda Engine checkout, run `git pull origin main`, inspect the migration/application status, run `py -3.11 check_dupes.py` and the focused unit tests, then restart only by double-clicking `START_PANDA.bat` or invoking it from CMD. Never launch `app.py` directly.

- [ ] **Step 11: Production observation**

For the first live session, verify outbox rows transition `pending -> sent`, Telegram message IDs are recorded, no same-cycle pair duplicates appear, and recovery from a deliberately observed stale/invalid condition seeds silently. Do not manufacture a trading alert in production.

# Spike Alerts Telegram Group Reliability Specification

## Objective

Make the dedicated Spike Alerts Telegram group (`SIGNAL_BOT_TOKEN` / `SIGNAL_CHAT_ID`) dependable, quiet, and auditable without changing Panda scoring or the locked BB/INTRA strategy definitions.

## In scope

- Momentum spike, early-entry, gap-zone, Panda Lines FLIP/BOS, phase-digest, and Panda Gold messages routed to `SIGNAL_*`.
- Accurate delivery state and retry behavior.
- Deduplication that survives engine restarts.
- Suppression of alerts caused by stale, missing, or newly recovered source data.
- Consolidation of overlapping same-cycle pair alerts into one coherent message.
- Automated tests, deployment checks, and a Windows engine restart handoff.

## Required behavior

1. An alert is marked delivered only after Telegram returns HTTP 200 with `ok: true` and a message ID.
2. Transient failures remain pending and retry with bounded exponential backoff; permanent failures retain the error for inspection.
3. Deduplication and cooldown state survive process restarts and cannot be bypassed by two engine cycles running close together.
4. The first valid sample after stale, missing, or hard-invalid data seeds state silently. Momentum-derived alerts require two consecutive valid cycles.
5. Alerts for the same pair in one engine cycle are consolidated. Priority is: structure change, confirmed gap zone, early entry, momentum watch. Lower-priority evidence may enrich the message but must not produce contradictory instructions.
6. Phase digests remain summaries, do not repeat immediate alerts sent during the same cycle, and remain limited to one changed digest every two hours.
7. Telegram message copy reports observed state and setup status. It must not issue conflicting commands such as `ENTER NOW` and `WAIT FOR PULLBACK` for the same pair.
8. The locked functions `extract_panda_score()` and `compute_scores_all_pairs()` and all BB/INTRA thresholds and exit rules remain untouched.
9. The engine is never started from a terminal. Windows activation happens only through `START_PANDA.bat`.

## Success criteria

- No duplicate delivery for the same idempotency key, including after restart.
- No recovery/reset spike when a pair returns from invalid or stale input.
- One immediate Telegram message per pair per engine cycle.
- Failed Telegram attempts are visible and retryable; successful rows contain the Telegram message ID.
- Existing dashboard, scoring, gap history, BB, INTRA, structure detection, and Gold generation continue to behave as before.

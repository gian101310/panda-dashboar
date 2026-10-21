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
5. Alerts for the same pair in one engine cycle are consolidated. Priority is: structure change, confirmed gap zone, early entry, momentum watch. Related pairs share one immediate group message per cycle (split only for Telegram's length limit). Momentum-only observations go to the phase digest. Lower-priority evidence may enrich the message but must not produce contradictory instructions.
6. Phase digests remain summaries, exclude symbols already queued for an immediate alert in the same cycle, and remain limited to one changed digest every two hours.
7. Telegram message copy reports observed state and setup status. It must not issue conflicting commands such as `ENTER NOW` and `WAIT FOR PULLBACK` for the same pair.
8. The locked functions `extract_panda_score()` and `compute_scores_all_pairs()` and all BB/INTRA thresholds and exit rules remain untouched.
9. Retry only a confirmed rejection that can succeed later. An HTTP timeout or process death after a send is an uncertain delivery; retain it for inspection instead of automatically sending a possible duplicate. Honor Telegram's `retry_after` when present. Expire time-sensitive alerts rather than sending an obsolete setup.
10. Pending sends are claimed atomically, with a lease so a crashed worker cannot leave a row marked `sending` forever. A recovered lease enters `uncertain` for inspection.
11. The engine is never started from a terminal. Windows activation happens only through the existing managed restart script.
12. Recovery uses distinct five-minute cycle marks, so the hourly scheduler cannot count one data sample twice. Every pending send is checked against current market hours and relevant dashboard, Panda Lines, or Gold state before Telegram is called.
13. `spike_events` is an observation log with a persisted four-hour per-symbol cooldown. New momentum-only observations leave its legacy `notified` field false because they no longer trigger a standalone post; they appear in the phase digest instead. Historical `notified` values are not reliable delivery receipts. Confirmed Signal-group delivery is recorded in `signal_alert_outbox`.
14. A failed or expired digest may be queued again in a later 15-minute window. A confirmed digest still requires both changed content and a two-hour interval.
15. `GAP SURGE` means the current valid gap magnitude increased by at least three points in the same direction from the immediately previous engine score. A flat or weakening score is not a surge, regardless of its older 30-minute history change. The message displays both scores and their magnitude difference; a smaller move crossing the valid threshold is `GAP CROSSOVER`.

## Success criteria

- No duplicate candidate for the same idempotency key, including after restart. Confirmed sends are never resent; ambiguous sends are surfaced as uncertain because the Telegram Bot API does not provide a client idempotency key.
- No recovery/reset spike when a pair returns from invalid or stale input.
- At most one immediate Telegram message per engine cycle for normal message lengths, with all eligible pairs consolidated.
- Failed Telegram attempts are visible and retryable; successful rows contain the Telegram message ID.
- Existing dashboard, scoring, gap history, BB, INTRA, structure detection, and Gold generation continue to behave as before.

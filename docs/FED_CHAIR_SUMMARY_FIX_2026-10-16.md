# Fed-chair speech summaries

## Cause

The live FF calendar lists `Fed Chairman Warsh Speaks` at
`2026-10-15T23:30:00-04:00` (October 16, 07:30 Dubai), impact High, with empty
forecast/previous and no actual field. The result branch required actual, and
the PPI official-data fallback intentionally handles only PPI. Thus no speech
summary could be generated even while the engine was active.

## Change

`news_speeches.py` recognizes USD Fed-chair speech events. Starting 15 minutes
after scheduled time it uses the existing OpenAI account to research actual
remarks. Official Fed/IMF material is preferred; AP/Reuters reporting is allowed
and linked. Only URLs present in a completed web-search response on these allowed
domains can be published. Response-reported publication dates and the exact
event timestamp are checked. Dates are model-extracted, not independent metadata
verification; this remains an AI summary of linked reporting, not a transcript.
No rate decision, numeric actual, currency direction or trade is invented.

The search API cannot use JSON mode. A separate JSON-formatting request handles
prose research when needed, retaining the original cited-URL allowlist.
Tracking parameters are normalized for citation matching. Pending research is
cached for 30 minutes; ready reports for 24 hours. This is limited to Fed-chair
speeches, not a general transcript service for all speakers/releases.

`check_news_alerts` sends either one pending notice or the sourced report to the
existing MAIN Telegram destination. It retries failures, stores successful message
IDs under separate SPEECH_PENDING and SPEECH keys in existing ignored delivery
state, and stops summary catch-up after 24 hours. Pending does not suppress a later
ready summary. A scheduled start passing is not proof the event finished.

The desktop tool inherited a different, quoted OPENAI_API_KEY from the file key.
It received HTTP 401; the canonical `.env` key authenticated successfully.
Speech research uses PANDA_NEWS_SPEECH_API_KEY if explicitly set, otherwise the
canonical `.env` OPENAI_API_KEY, then the engine fallback. No keys are logged,
copied, committed or changed. Existing other AI paths are untouched.

## Validation

- Thirteen speech tests cover recognition, citation/date/event checks, JSON
  formatting, caching, pending-to-ready delivery, failure retry and restart
  suppression. Ten PPI tests remain passing.
- Live OpenAI research using the file key returned a ready summary with two AP
  links for today's Bangkok remarks. This validates research, not Telegram delivery.
- Use the supported hidden RESTART_ENGINE.ps1 to load code. Confirm a new listener
  creation time and a persisted SPEECH delivery message ID before claiming delivery.
- Mac indicator handoff is separate: see
  `panda-indicators/2026-10-16/panda-trade-plan/MAC_HANDOFF.md`.

# Changelog

## 2026-07-17 (BASE/QUOTE XTF rows ported to MT4/MT5/cTrader overlays)

- Ported the TradingView currency-extremes display enhancement into the MT4, MT5, and cTrader Dashboard Overlays (Personal and Licensed share each platform's core, so all six editions gain it). Two compact rows directly below the SCORE (gap) row — `BASE XTF` and `QUOTE XTF` — list every D1/H4/H1 currency score with absolute value ≥ 4 in D1→H4→H1 order with signed values (e.g. `GBP: H4 +5 · H1 +4`, `JPY: D1 -6`, `GBP: NONE`), formatted from the feed's existing `base_score_tf`/`quote_score_tf` fields. Display-only: no scoring, bias, box, Panda Lines, BOS, signal, alert, licensing, or feed/API changes; account/device approval flow untouched.
- Rebuilt both cTrader editions on the Mac with zero errors/warnings and refreshed the cTrader `dist/` `.algo` files and SHA256SUMS. MT4/MT5 `.ex4`/`.ex5` binaries in `dist/` still correspond to the previous source and need a Windows MetaEditor recompile (overlay indicators only; feed EAs unchanged). Public Licensed downloads intentionally untouched pending the staged Windows verify sequence.
- Extended the MetaTrader and cTrader source-contract tests with BASE XTF/QUOTE XTF formatter and panel-row assertions (212/212 passing) and documented the new rows in both platform READMEs.

## 2026-07-17 (TradingView XTF BOS personal overlay)

- Added the separate private Pine v6 `Panda Engine Personal TV XTF BOS` indicator. It keeps the verified personal scoring, Boxes, Panda Lines, flips, and confirmed BOS, then gates a visible READY state through the user-selected H1/H4 Box and emits one final BUY or SELL trigger only when matching confirmed BOS occurs.
- Kept the non-selected Box informational (`ALIGNED`, `RANGING`, `COUNTER`, or `UNKNOWN`), added compact XTF/signal panel rows and event-only BUY/SELL markers, and introduced the two explicit final trigger alert events without connecting them to Panda Engine, Telegram, APIs, licensing, or trading execution.

## 2026-07-17 (TradingView personal overlay)

- Added the private Pine v6 `Panda Engine Personal TV` overlay with the exact 21-pair non-CHF structural currency scoring contract, three offset Panda Boxes, H1/H4 Box structure, SuperTrend/BB Follow Line status and confirmed flips, pivot BOS, four stable alert events, and a compact corner-selectable panel.
- Kept the TradingView edition completely local to TradingView market data with no licensing, token, dashboard API, Supabase, or Windows engine dependency; the locked Python scoring functions remain untouched.
- Bounded the 21 OANDA H1 dynamic requests and main calculation history to 1,800 bars after a real TradingView runtime smoke test exposed the heavier initial history window, and added a transparent spacer so the bottom-left BOS row remains visible above the TradingView watermark.
- Added deterministic reference/source-contract tests and installation/status/alert documentation. The final private script compiled, ran without a chart runtime error, displayed live on USDJPY H1, and was saved in TradingView as `Panda Engine Personal TV`.

## 2026-07-17 (Windows indicator session)

- Fixed cTrader, MT4, and MT5 Licensed clients to extract the automatic device token from the API's nested `device_activation.token` response instead of treating `device_activation` as a string. Added regression assertions, rebuilt both cTrader editions and all eight MT4/MT5 overlay/feed binaries with zero errors and zero warnings, and refreshed private `dist/` checksums. Public downloads remain unchanged until the replacement Licensed builds pass a Windows restart smoke test; device enforcement remains OFF.
- Discovered the MT4/MT5 Dashboard Overlay could never sync: MetaTrader prohibits `WebRequest()` inside custom indicators (error 4014/4060), which the Core mapped to a permanent `ALLOW WEBREQUEST` banner. cTrader unaffected.
- Split fetch from display: new `PandaDashboardFeed{MT4,MT5}-{Personal,Licensed}` expert advisors (same Core, one per terminal, no trading) refresh the shared common-files snapshot; indicators now display from cache only via an `MQL_PROGRAM_TYPE` guard and show `ATTACH FEED EA` when the feed is absent.
- Rebuilt the MT4/MT5 panel UI: new `PanelCorner` input (4 corners), opaque top-down layout replacing the off-screen lower-corner background math, fixed XTF/footer overlap, per-program object prefixes plus init-time sweep of stale objects from prior sessions.
- Packaged MT4/MT5 Licensed downloads as zips (overlay + feed EA + INSTALL instructions) in `public/downloads/`, updated `lib/indicatorProducts.mjs` paths and install notes, refreshed legacy raw binaries and `dist/` (8 artifacts, zero-warning compile logs, SHA256SUMS).
- Extended overlay source-contract tests (feed EA boundaries, program-type guard, corner enum) and updated the download redirect test; smoke-tested Personal LIVE on MT4 IC Markets Global.
- Added `docs/CODEX_MAC_HANDOFF_2026-07-17.md`.

## 2026-07-16 (Mac verification session)

- Audited the repo after the Codex security cleanup: confirmed `c9253cc` at HEAD, clean tree in sync with origin, production READY, and no Hermes or Guardian references remaining outside the intentionally preserved risk-gate libraries and removal-assertion tests.
- Verified all six device-ready overlay sources are complete and consistent: Personal editions authenticate only via the `x-panda-operator-token` input parameter, Licensed editions read the account number automatically and carry device ID/token logic in the shared cores, and no secrets are embedded in any indicator source.
- Verified the three public Licensed downloads byte-match their `dist` artifacts and SHA256SUMS entries, and that no Personal binaries or tokens are publicly exposed.
- Confirmed `indicator_device_enforcement` is `OFF` for cTrader, MT4, and MT5, and that the Supabase security advisor reports only intentional deny-all RLS notices.
- Re-verified 197/197 JavaScript tests and `check_dupes.py` on Mac.
- Refreshed `CLAUDE.md` (post-cleanup verified state, remaining priorities, Mac-vs-Windows workflow) and added `docs/SKILL_PANDA_ENGINE.md` as the committed skill source for re-upload in Claude Settings, so remote and home sessions load identical context.

## 2026-07-16

- Moved safety-job scheduling to secured GitHub Actions after Vercel rejected the five-minute cron on the current plan; route authentication remains fail-closed with a shared rotated secret.
- Added OFF/SHADOW/ENFORCED per-platform licensing modes with throttled, credential-free dry-run telemetry and admin would-block counters; production remains OFF for cTrader, MT4, and MT5.
- Added a service-role-only engine heartbeat monitor with one-time 15-minute stall alerts, repeat suppression, and recovery notifications through an authenticated five-minute Vercel Cron.
- Added report-only weekly edge revalidation with an admin manual endpoint, authenticated Vercel Cron, fresh `ai_memory` output, and one-time Telegram decay alerting.
- Retired the obsolete BB gap-7 91%/0% claims from Panda AI and public portfolio copy; fresh sampled results now override historical notes.
- Added an **Approved Accounts** tab and exact counter to Panda approvals, with a compact account history and guarded approval revocation.
- Kept indicator download totals visible while collapsing detailed download activity by default behind a Show/Hide control and bounded scroll area.

## 2026-07-15

- Replaced the error-prone Personal token generate/copy/rotate sequence with one verified **Generate, Activate & Copy** action and retained admin-only encrypted recovery.
- Added account-bound Licensed device management for cTrader, MT4, and MT5: automatic per-installation credentials, admin device limits from 1 to 100, device revoke/reset, and platform enforcement switches.
- Restored all three dashboard overlays to Pricing admin and the public home/pricing pages with editable price, HTTPS payment link, tracked Licensed download, and activation-request actions.
- Applied the production device-licensing migration with all enforcement switches OFF; current compiled downloads remain account-only until replacement Windows binaries pass compilation and smoke testing.
- Added public, tracked downloads for the compiled Licensed cTrader, MT4, and MT5 Panda Dashboard Overlays; Personal artifacts remain private.
- Added platform-aware public activation requests using the runtime trading account number, with product/platform duplicate protection and Telegram admin alerts.
- Added authenticated Indicator Licensing admin totals and recent download activity per overlay.
- Added AES-256-GCM recovery for the current Personal overlay token, admin-only reveal/copy, 60-second browser-memory clearing, and metadata-only rotation history.
- Existing hash-only Personal tokens remain valid and require one intentional rotation before encrypted recovery becomes available.
- Deployed and verified the cross-platform overlay distribution flow on `pandaengine.app`; the production build reached READY in 27 seconds and all three tracked downloads recorded successfully.

## 2026-07-14

- Added the Panda Dashboard Overlay for cTrader in personal-token and account-licensed editions.
- Added the authenticated cTrader dashboard feed, shared snapshot cache, and account-license checks.
- Added admin controls for cTrader account approvals and personal overlay token rotation.
- Added secure in-browser generation and clipboard copying for personal cTrader tokens before rotation.
- Fixed cTrader overlay initialization by using platform-valid LocalStorage keys.
- Added the service-role-only feed settings table and cTrader license fields.
- Added Panda Dashboard Overlay Personal and account-licensed editions for MT4 and MT5.
- Added fixed Panda Engine MT4/MT5 feed routes with separate platform product approvals and shared Personal token authentication.
- Added terminal-wide one-minute snapshot caching, movable/minimizable panels, compiled release artifacts, checksums, and operator handoff documentation.

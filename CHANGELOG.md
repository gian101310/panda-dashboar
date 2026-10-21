# Changelog

## 2026-10-21 (Accurate gap surge alerts)

- The Signal group's `GAP SURGE` alert now requires an actual same-direction
  increase of at least three gap points since the previous engine cycle.
  Crossing into a valid gap without that jump remains `GAP CROSSOVER`.
- Gap-change messages show the previous and current scores plus the change in
  magnitude. Flat or weakening scores no longer produce surge alerts from an
  older 30-minute history change. Core scoring and BB/INTRA rules are unchanged.

## 2026-10-20 (Quieter, durable Spike Alerts group)

- Added a service-role-only Signal alert outbox with durable idempotency keys,
  confirmed Telegram message IDs, bounded retries, expiry, and visible uncertain
  delivery state. Telegram flood-control `retry_after` is honored.
- Consolidated overlapping pair events and grouped eligible pairs into one
  immediate message per engine cycle. Momentum-only observations remain in the
  two-hour phase digest; the digest excludes pairs already queued immediately.
- Seeded MT4/Panda Lines state for two valid cycles after boot or invalid input
  to avoid recovery spikes. The outbox retries pending rows every scheduler
  minute. Scoring and BB/INTRA rules are unchanged.
- Added focused tests for recovery, consolidation, confirmed delivery, retries,
  uncertainty, and the engine candidate path. Windows engine restart and live
  delivery observation are required after deployment.
- Retries recheck current market hours and source state before sending. Recovery
  counts distinct five-minute cycles; failed digests can be retried in a later
  window, and Spike Log observations keep a persisted four-hour cooldown.

## 2026-10-20 (Trade Plan v1.3 Dashboard collapse parity)

- Matched the embedded v1.3 Dashboard panel to the standalone Panda Dashboard
  Overlay: 260px expanded width, 210px compact width, symbol/status/toggle header,
  identical row order, and a single score/bias/status line when minimized.
- Fixed the minus button so the full Dashboard rows and Trade Plan switch are
  hidden while compact, then restored when expanded.
- Added source regression coverage for dashboard dimensions, visibility, compact
  content, header structure, and row format. Native cTrader compilation remains
  a Windows handoff check because this Mac session has no .NET SDK.

## 2026-10-20 (Compact Trade Plan dashboards)

- Gave Dashboard and Trade Plan independent root controls in both v1.2 and
  v1.3. Switching views now replaces the draggable child instead of asking one
  shared Mac layout tree to shrink around hidden full-width controls.
- Dashboard uses a clean 190px base-width root; Trade Plan retains the configured
  width. Both roots keep their own heading, shrink button, and view switch.
- Added layout regression coverage; both `.algo` packages compile and publish
  successfully on macOS.

## 2026-10-20 (Private Trade Plan v1.3 distribution)

- Added an admin-only `.algo` download backed by private Storage, plus a
  preselected manual license action on the Indicator License page.
- Removed Trade Plan v1.3 from the public request catalog; clients receive the
  file directly and the operator licenses their cTrader account manually.

## 2026-10-17 (Trade Plan fixed-size runtime crash)

- Fixed the live `Can't set volume when type is FixedSize` exception: update the
  risk/reward Type descriptor instead of its forbidden generic volume setter.
- Added an SDK regression that reproduces the exact exception and validates the
  corrected production helper; initialization and restore errors now log clearly.
- Confirmed the reloaded USDCAD panel contains Entry/SL/TP1 and native RR pip/lot
  values. Screenshot/coordinate capture remains unavailable, so drag is unverified.

## 2026-10-17 (Visible draggable plan levels)

- Added explicit short Entry/SL/TP1 handles over native risk/reward shading in
  Limit and Stop modes, with always-visible prices, pip distances and TP1 R.
- Either line endpoint updates the panel and native drawing. Last-rendered
  values prevent unchanged companion objects from undoing a drag.
- 118 offline assertions and clean C# build; live chart interaction unverified.

## 2026-10-17 (Stop risk/reward drawing and panel drag sync)

- Selecting Stop reveals/fits the native risk/reward drawing. Missing eligible
  breakout references show a clearly marked manual Stop draft once bias is ready;
  valid manual price edits or Apply are required before a draft can submit.
- Native Entry/SL/TP drags synchronize panel fields even through temporarily
  invalid geometry. Validation blocks invalid execution while preserving edits.
- 111 offline assertions and clean C# release build. Live chart drag verification
  remains unavailable: the cTrader control connector returns HTTP 404.

## 2026-10-17 (Trade Plan explicit execution panel)

- Added Limit / Stop / Market selection and editable lots, default 0.01. Stop
  planning uses breakout references; Market uses live quotes and the existing SL/TP rules.
- Explicit Place order attaches SL/TP1, validates fresh bias/quotes/broker limits,
  requests native trading permission on click only, and prevents duplicate plan
  submissions. Automatic planning never trades; successful submission pauses auto.
- 100 offline assertions and clean release compile. No broker orders submitted
  in verification; live execution and Mac presentation remain unconfirmed.

## 2026-10-17 (Trade Plan dominant scoring and invalidation diagnostics)

- Corrected the planner's inherited net-vote aggregation to retain positive and
  negative components separately. It now follows the confirmed dominant-side rule,
  preserving raw extreme conflicts and strongest-component ties.
- Added per-currency timeframe splits and specific HARD_INVALID reasons to the
  panel, with an optional diagnostics toggle. A USD -4 / CAD +3 regression remains
  valid with gap -7 instead of being flattened into a neutral matchup.
- Engine scoring and original indicators are unchanged. Live cTrader confirmation
  remains blocked by the control connection returning HTTP 404.

## 2026-10-17 (Automatic Panda Trade Plan and appearance controls)

- Excluded previous-year references from suggested entries, targets and optional
  guide bounds. Existing unedited plans recalculate with day/week/month and Box refs.
- Enabled automatic creation/retry/refresh by default, while preserving manual
  edits and retained invalid plans. Clear pauses automatic recreation until Resume.
- Added grouped reference, distance, TP-minimum/SL-divisor, line-thickness/opacity,
  label-size and panel scale/width/opacity/position controls. Panel defaults to 80%.
- Kept the engine and original indicators unchanged; updated the Mac handoff.

## 2026-10-16 (Dominant timeframe score display)

- Corrected split score parsing for base/quote and ADV timeframe fields:
  `+3/-1` displays +3, not the former summed +2. Equal opposing magnitudes
  remain zero. This aligns Telegram scorecards and dashboard data with the
  dominant-component rule confirmed by Boss-G.
- Preserved raw lines and the locked gap/conflict/BB/INTRA logic. AUD -5 minus
  CAD +3 remains gap -8; the misleading CAD display cell is corrected.
- Added regression coverage and retained the same-time 21-pair audit evidence.

## 2026-10-16 (Fed-chair post-event summaries)

- Added a separate speech-summary path for high-impact USD Fed-chair speeches;
  speeches do not need a numeric actual value. Source-linked reporting is checked
  from 15 minutes after the event, with 30-minute search retries and 24-hour catch-up.
- Send one pending notice when remarks are unavailable, retry failed Telegram sends,
  and persist separate pending/summary delivery marks across restarts.
- Use this engine's configured file key for speech research rather than an unrelated
  inherited desktop key. Locked scoring and strategy functions are unchanged.

## 2026-10-16 (Panda Trade Plan for cTrader)

- Added a separate visual pullback planner using personal cTrader Panda scoring,
  previous day/week/month/year levels and Panda Box entry references. It displays
  editable entry/SL/TP levels and risk metrics without placing orders.
- Default retention is manual clear only. Bias changes flag invalid plans while
  preserving prices; optional expiry/deletion settings remain available.
- Uses native cTrader risk/reward drawings with short optional target guides,
  a draggable/minimizable panel, Fit plan, and a 50-pip minimum suggested TP1.
- Suggested SL derives from TP distance: <100 /2, <200 /3, <300 /4, >=300 /5.
- Includes isolated plan-rule tests, the compiled `.algo`, and installation notes.

## 2026-10-15 (PPI result delivery)

- Recover missing US headline/core PPI actuals from the dated official BLS release
  hosted by the Department of Labor. Validate the embargo date and exact total/core
  series before comparing with calendar forecasts; include the source in Telegram.
- Retry failed result deliveries, persist successful Telegram message IDs across
  engine restarts, and allow 24-hour catch-up. Other news still requires actuals
  from its feed; this fallback specifically covers US PPI.
- Engine PDF dependencies: `py -3.11 -m pip install -r requirements-news.txt`.

## 2026-07-25 (Dashboard left-sidebar navigation)

- Redesigned dashboard.js navigation: the 14 tabs (plus admin ENGINE) moved from
  the horizontal scrolling bar into a persistent vertical left sidebar with icons
  and active-state highlighting, so every tab is visible at once.
- Desktop: sticky sidebar beside a flex main column. Mobile (<768px): sidebar
  becomes a drawer that slides in from a new ☰ header button, with a tap-to-close
  backdrop; picking a tab auto-closes it.
- Panels/Table filter+search+sort controls kept as a slim bar above content.
- Purely presentational/layout change — no scoring, data, tab logic, or feature
  gating touched. Build + 218/218 JS tests + check_dupes all green.

## 2026-07-19 (cTrader XTF BOS Panda Lines compatibility)

- Corrected the private cTrader XTF/BOS source to use the same proven legacy
  cTrader Panda Lines calculation: simple ATR(10), prior-closed-bar SuperTrend
  switching, and retained Follow-Line direction on flat values. All four output
  buffers now use discontinuous plotting with bridge points at colour flips,
  preventing incorrect line connections. XTF scoring, boxes, BOS, triggers,
  panel, licensing, APIs, and trading behaviour remain untouched.
- Added a regression source contract for the legacy Panda Lines renderer. The
  source requires a Windows/cTrader rebuild before a replacement `.algo` can be
  distributed; the existing `dist` binary intentionally remains unchanged.

## 2026-07-18 (cTrader Panda XTF BOS personal indicator)

- Added `panda-indicators/2026-07-18/ctrader-panda-xtf-bos/`: a brand-new private cTrader indicator (`Panda Engine Personal XTF BOS`) porting the TradingView XTF BOS script's full local calculation — 21-pair H1 day/week/month Panda Boxes drawn on chart, the 7-currency vote scoring with strongest/conflict/HARD_INVALID/gap/bias contract (thresholds 5 and 4), SuperTrend(10, 3) + BB(21, 1.0)/SMA-TR(5) Follow Line with confirmed PL flips, swing-pivot one-shot BOS with active levels, the H1/H4 Box-gated BUY/SELL triggers, and the full 13-row draggable panel including BASE/QUOTE XTF.
- Sandbox: `AccessRights.None`, broker market data only, no network, no credentials, no licensing, no trading, personal-only distribution. Compiled zero-error/zero-warning via dotnet; `.algo` + SHA256SUMS in the new `dist/`. Documented broker-feed/UTC-boundary differences vs the OANDA-based TV original; alerts not ported in v1.
- Added `tests/ctraderXtfBosSource.test.mjs` source contracts (216/216 passing). Existing overlays, engine, APIs, and licensing untouched. MT4/MT5 ports are the agreed next step after chart verification.

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

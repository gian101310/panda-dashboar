# Changelog

## 2026-07-16

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

# Changelog

## 2026-07-15

- Added public, tracked downloads for the compiled Licensed cTrader, MT4, and MT5 Panda Dashboard Overlays; Personal artifacts remain private.
- Added platform-aware public activation requests using the runtime trading account number, with product/platform duplicate protection and Telegram admin alerts.
- Added authenticated Indicator Licensing admin totals and recent download activity per overlay.
- Added AES-256-GCM recovery for the current Personal overlay token, admin-only reveal/copy, 60-second browser-memory clearing, and metadata-only rotation history.
- Existing hash-only Personal tokens remain valid and require one intentional rotation before encrypted recovery becomes available.

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

# Panda Dashboard Overlay for MT4 and MT5

This release displays live Panda Engine dashboard values on the active MetaTrader chart without reproducing the scoring engine or placing trades.

Each platform has two fixed editions:

- `PandaDashboardOverlayMT4-Personal.ex4`
- `PandaDashboardOverlayMT4-Licensed.ex4`
- `PandaDashboardOverlayMT5-Personal.ex5`
- `PandaDashboardOverlayMT5-Licensed.ex5`

The panel shows Score, Bias, Box H4, Box H1, Panda Lines, XTF, dashboard update time, and connection state. It starts in the bottom-left, can be moved by dragging its header, and can be minimized.

## Installation

1. In MetaTrader choose **File → Open Data Folder**.
2. For MT4, copy the selected `.ex4` file from `dist/` into `MQL4/Indicators`.
3. For MT5, copy the selected `.ex5` file from `dist/` into `MQL5/Indicators`.
4. Return to MetaTrader, right-click **Navigator → Indicators**, and choose **Refresh**. Restart the terminal if the new indicator is not listed.
5. Open **Tools → Options → Expert Advisors**.
6. Enable **Allow WebRequest for listed URL** and add exactly `https://pandaengine.app`.
7. Attach the indicator to a supported forex chart.

## Personal editions

Personal MT4, MT5, and cTrader use the same operator token.

In Panda Engine Admin open **Indicator Licensing → Personal Overlay Token**:

1. Click **Generate, Activate & Copy**.
2. Wait for the verified success state.
3. Paste it into the MetaTrader indicator's **Operator Token** input.
4. Later, use **Reveal & Copy Active Token** instead of remembering or rotating it.

Rotating another token invalidates the previous token on every Personal platform. Panda Engine stores the authorization hash plus an encrypted admin-recovery copy; the plaintext is never logged and the browser display clears after 60 seconds.

## Licensed editions

Licensed indicators have no editable account or token input. MT4 reads `AccountNumber()` and MT5 reads `ACCOUNT_LOGIN` directly from the running terminal.

Create the customer in Panda Engine Admin with:

- MT4 product: `Panda MT4 Dashboard Overlay`
- MT5 product: `Panda MT5 Dashboard Overlay`
- the numeric trading account number
- payment confirmed
- status `APPROVED`

Broker name and server name are not required. MT4 and MT5 approvals are separate; an MT4 approval does not authorize the MT5 endpoint.

The device-ready Licensed sources automatically create a random installation ID in `FILE_COMMON`, request a one-time device token after account approval, and persist it per platform/account. Customers never receive or paste a device token. Admin can set each license to 1–100 devices and revoke/reset installations. Keep platform device enforcement OFF until its replacement `.ex4` or `.ex5` has been compiled and smoke-tested on Windows.

## Status guide

- `CONNECTING` — waiting for the initial snapshot.
- `LIVE` — the cached Panda snapshot is current.
- `STALE` — the last valid snapshot is older than the server freshness limit.
- `AUTH REQUIRED` — Personal edition has no token.
- `AUTH ERROR` — Personal token does not match the active Panda Engine token.
- `LICENSE REQUIRED` — no matching approved account license exists.
- `PAYMENT PENDING` — the account is approved but payment is not confirmed.
- `PENDING`, `DISABLED`, or `EXPIRED` — the corresponding server-side license state.
- `ALLOW WEBREQUEST` — add `https://pandaengine.app` to the terminal WebRequest allow-list.
- `SYNC ERROR` — the feed could not be read and no previous valid snapshot exists.
- `UNSUPPORTED SYMBOL` — the chart cannot be mapped to a live Panda pair.

## Lightweight behavior

The indicator timer updates UI state once per second, but network refreshes are capped at once every 60 seconds. All instances in the same terminal share a credential-scoped common-file snapshot and a terminal global-variable request lock. Attaching the indicator to many charts therefore does not produce one request per chart.

Failed requests are also throttled for 60 seconds. Temporary network failures retain the last valid snapshot until it becomes stale. Authorization failures clear protected data.

## Feed contract

- MT4 endpoint: `https://pandaengine.app/api/mt4-overlay`
- MT5 endpoint: `https://pandaengine.app/api/mt5-overlay`
- Personal header: `x-panda-operator-token`
- Licensed header: `x-panda-account-number`
- Licensed device headers: `x-panda-device-id`, then `x-panda-device-token` after automatic activation
- Schema version: `1`

No token, Supabase credential, service key, or engine secret is embedded in the sources or compiled packages.

## Build verification

The four binaries in `dist/` were compiled with the installed platform MetaEditor. The matching compile logs report zero errors and zero warnings. Verify release integrity from `dist/` with:

```bash
shasum -a 256 -c SHA256SUMS
```

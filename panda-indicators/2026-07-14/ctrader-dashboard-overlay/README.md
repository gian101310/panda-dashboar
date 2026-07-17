# Panda Dashboard Overlay for cTrader

This folder contains two lightweight, informational cTrader indicators that display Panda Engine dashboard data for the chart symbol:

- score (dashboard gap)
- bias
- Box H4 and Box H1 trends
- Panda Lines state
- XTF base/quote timeframes

The panel refreshes the shared feed at most once every 60 seconds, remains idle in `Calculate`, starts in the bottom-left corner, can be dragged, remembers its location, and can be minimized.

## Editions

### Personal

Build `PandaDashboardOverlay-Personal/PandaDashboardOverlay-Personal/PandaDashboardOverlay.Personal.csproj`. Enter the operator token in the indicator parameter after attaching it to a chart. The token is sent only in the HTTPS request header and is not embedded in the source.

In **Admin → Indicator Licensing → Personal overlay token**, use **Generate, Activate & Copy** once, then paste the copied value into the indicator. The server verifies the saved hash before reporting success and stores an encrypted admin-recovery copy. Later, use **Reveal & Copy Active Token** instead of rotating or remembering it. Rotating still invalidates the previous token on every Personal platform.

### Licensed

Build `PandaDashboardOverlay-Licensed/PandaDashboardOverlay-Licensed/PandaDashboardOverlay.Licensed.csproj`. It reads `Account.Number` directly from cTrader and has no editable account or license-key parameter.

Approve an account in **Admin → Indicator Licensing** with:

- platform: `CTRADER`
- product: `Panda cTrader Dashboard Overlay`
- the customer's numeric cTrader trading account number
- status: `APPROVED`

Broker identity is not required. License states such as pending, disabled, and expired are returned by the feed without exposing dashboard data.

The device-ready Licensed source creates a random installation ID and saves the one-time server-issued device credential in cTrader device-scoped local storage. The administrator controls the license limit from 1 to 100 and can revoke or reset installations without sending tokens to customers. The replacement build in `dist/` parses `device_activation.token`; device enforcement must remain OFF until that Licensed build is published and passes a Windows first-activation plus restart smoke test.

## Build and install on cTrader Mac

1. Open cTrader and go to **Algo**.
2. Add the desired nested project from this folder, or install the matching prebuilt file from `dist/`.
3. Build the project in cTrader.
4. Export the compiled indicator as an `.algo` file if you need a distributable package.
5. Attach it to any supported forex chart. The licensed edition uses the active account automatically; the personal edition asks for the operator token.

The two projects intentionally have separate entry classes so the commercial edition cannot be switched into token mode by changing a parameter.

## Feed contract

- endpoint: `https://pandaengine.app/api/ctrader-overlay`
- personal header: `x-panda-operator-token`
- licensed header: `x-panda-account-number`
- licensed device headers: `x-panda-device-id`, then `x-panda-device-token` after automatic activation
- schema version: `1`
- stale threshold: supplied by `max_age_seconds` (currently 10 minutes)

No Supabase key, engine secret, token, or other credential is embedded in either source edition.

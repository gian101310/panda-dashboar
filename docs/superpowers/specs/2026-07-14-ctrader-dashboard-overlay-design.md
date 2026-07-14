# cTrader Dashboard Overlay Design

**Date:** 2026-07-14

**Status:** Approved for implementation planning

**Owner:** Boss-G

## Objective

Build a lightweight cTrader Mac chart indicator that displays authoritative Panda Engine dashboard data for the active chart symbol. The indicator must display the score, bias, Box H4/H1 state, Panda Lines confirmation, and extreme-timeframe (XTF) values without reproducing or modifying the locked scoring engine.

Two editions will be produced from one codebase:

1. A personal operator edition authenticated by a rotatable private token.
2. A commercial edition licensed to one numeric cTrader account number and controlled by dashboard admin approval.

## Non-goals and locked constraints

- Do not modify `extract_panda_score()` or `compute_scores_all_pairs()` in `app.py`.
- Do not calculate a second score or bias inside cTrader.
- Do not alter BB or INTRA entry/exit rules.
- Do not expose Supabase credentials, `ENGINE_SECRET`, service keys, or dashboard session cookies.
- Do not connect the indicator directly to Supabase.
- Do not start `app.py` from a terminal.
- The overlay is informational and must not place, modify, or close trades.

## User experience

### Default expanded panel

The selected visual design is the expanded card (layout C). It appears in the bottom-left corner by default and contains:

- Normalized chart symbol and `PANDA` label.
- Prominent signed score/gap.
- BUY, SELL, WAIT, or INVALID bias.
- Box H4 and H1 direction.
- Panda Lines confirmation status.
- XTF base- and quote-currency readings.
- Last successful dashboard update time.
- Connection state: LIVE, STALE, ERROR, or LICENSE REQUIRED.

The target footprint is approximately 260 by 140 cTrader logical pixels. Exact dimensions may expand slightly for readable XTF content but must remain proportional and avoid covering unnecessary candles.

### Movement and minimization

- Dragging the header moves the panel within the chart bounds.
- The initial anchor is bottom-left with a small inset.
- A minimize control collapses the panel to one line containing symbol, score, bias, and status.
- Restoring returns to the expanded panel at its prior position.
- Position and collapsed state are persisted locally when supported by cTrader storage. If persistent storage is unavailable in the target cTrader Mac API, state persists for the lifetime of the indicator instance and the limitation is documented.

### Visual rules

- BUY uses `#00ff9f`.
- SELL uses `#ff4d6d`.
- WAIT/unknown uses a neutral grey.
- Warnings and stale state use `#ffd166`.
- The panel uses static controls only: no animation, canvas rendering, or continuous chart calculations.
- Missing values render as an em dash and never imply confirmation.

## Data contract

Create a purpose-built read-only endpoint for the cTrader overlay. It returns one snapshot containing all supported dashboard pairs so attached chart instances can share one fetch.

Each pair record contains only:

```json
{
  "symbol": "EURUSD",
  "gap": 8.0,
  "bias": "BUY",
  "hard_invalid": false,
  "box_h4_trend": "UPTREND",
  "box_h1_trend": "UPTREND",
  "pl_zone": "ABOVE",
  "pl_bias": "BUY",
  "pl_g1_valid": true,
  "base_currency": "EUR",
  "base_score_tf": "D1:+5",
  "quote_currency": "USD",
  "quote_score_tf": "H1:-3",
  "updated_at": "2026-07-14T10:32:00Z"
}
```

The response also includes a server timestamp, schema version, and a maximum-age value. No user records, strategy internals, thresholds, formulas, Supabase identifiers, or unrelated dashboard fields are returned.

Bias is read from the dashboard row. The indicator does not derive BUY or SELL from the gap. If bias is missing, contradictory, or the row is hard-invalid, the UI uses INVALID/unknown rather than guessing.

## Symbol normalization

The indicator maps common broker symbol variants to the 21 canonical six-character Panda symbols. Examples include `EURUSD.c`, `mEURUSD`, and `EURUSD-ECN` mapping to `EURUSD` when exactly one supported pair token can be identified.

Normalization fails closed:

- A symbol containing no supported pair displays `UNSUPPORTED SYMBOL`.
- An ambiguous symbol is not mapped.
- Normalization never substitutes a different pair.

## Shared lightweight client

The cTrader assembly uses a static fetch coordinator shared by all instances in the same process:

- Fetch the all-pairs snapshot no more than once every 60 seconds.
- Coalesce concurrent refreshes into one in-flight request.
- Cache the last valid snapshot by canonical symbol.
- Notify attached instances when new data arrives.
- Perform no HTTP work in `Calculate()`.
- Render only when the current symbol data or visible status changes.

If cTrader isolates static state between instances, server caching still protects Supabase, but the client must log that shared-process caching is unavailable. This behavior will be verified on cTrader Mac before release.

## Personal operator edition

The personal edition has a private token parameter. It sends the token only over HTTPS in a request header. The token must not be committed, logged, included in screenshots, or embedded in source-controlled artifacts.

A dedicated admin-only setting manages this token:

- The initial token is newly generated for this feed; `ENGINE_SECRET` is not reused.
- The admin enters or replaces the token in a password-style field.
- The API stores only a cryptographic hash and rotation timestamp.
- Saving a replacement invalidates the previous token immediately.
- The plaintext token is entered manually in the personal indicator settings.
- The admin API never returns the plaintext token or its hash.

## Commercial licensed edition

The commercial edition reads the numeric cTrader `Account.Number` directly from the runtime. The account number is not an editable indicator parameter.

The existing indicator-license workflow is extended without breaking existing MT4 products:

- Add a cTrader dashboard-overlay product.
- Record platform as `CTRADER` and the numeric trading account number.
- Preserve existing MT4 account records and labels.
- Admin can approve, reject, expire, or revoke a request.
- Only an active `APPROVED` record for the cTrader overlay product authorizes data.
- Unknown, pending, rejected, expired, or revoked accounts receive status metadata but no pair data.

Account-number licensing is a commercial deterrent, not cryptographic proof of device identity. The compiled commercial package will not expose source, but the API must also use HTTPS, strict input validation, rate limiting, request logging without secrets, and generic denial responses. No claim of unbreakable DRM will be made.

## Dashboard admin changes

Extend the current indicator-license administration rather than create a separate licensing application.

The admin interface provides:

- Product/platform filters including the cTrader overlay.
- Numeric cTrader account number.
- Status, request date, approval date, and expiry date.
- Approve, reject, revoke, and expire actions.
- A separate operator-token rotation section visible only to an authenticated admin.
- Token presence and last-rotated timestamp, never the token or hash.

All authorization decisions use the server-side authenticated admin session. No admin flag is accepted from a request body.

## API security and performance

- Use the shared server Supabase client from `lib/supabase`.
- Personal requests authenticate with the dedicated operator token.
- Commercial requests validate a numeric account number against an approved license.
- Reject malformed symbols, oversized headers, unsupported methods, and invalid account numbers.
- Return minimal JSON with explicit cache headers that do not permit shared public caching of authenticated responses.
- Maintain a short server-side dashboard snapshot cache to avoid one database query per request.
- Apply per-credential and per-IP rate limits with conservative burst allowance for cTrader restarts.
- Compare token hashes using constant-time comparison.
- Never log raw tokens.

## Freshness and failure behavior

- Refresh interval: 60 seconds.
- Dashboard engine cadence remains unchanged.
- A successful response updates values and the LIVE timestamp.
- Temporary network errors retain the last valid data.
- Data older than the response maximum-age becomes STALE and is visibly marked.
- Authentication failure clears protected values and shows AUTH ERROR or LICENSE REQUIRED.
- Unsupported symbols show no Panda values.
- Parsing/schema errors retain the last valid snapshot only until it becomes stale; they never create default trading values.

## Packaging

Produce two cTrader `.algo` packages:

- `PandaDashboardOverlay-Personal.algo`
- `PandaDashboardOverlay-Licensed.algo`

The editions share parsing, caching, normalization, and UI code. Authentication is selected at build time so commercial users cannot switch to personal-token mode through a parameter.

No token or secret is included in either committed package. Release notes describe cTrader Mac installation, adding the indicator to charts, moving/minimizing the panel, personal token entry, and commercial approval states.

## Testing and acceptance criteria

### Server and admin

- Unauthenticated requests return no pair data.
- A valid personal token returns only the allowlisted contract.
- Rotating the token invalidates the previous token.
- Approved cTrader accounts receive data.
- Pending, rejected, expired, revoked, and unknown accounts receive no data.
- MT4 indicator-license records continue to work unchanged.
- Admin actions require a valid admin session.
- API rate limiting and cache behavior are verified.

### Indicator core

- Canonical and suffixed/prefixed broker symbols normalize correctly.
- Unsupported and ambiguous symbols fail closed.
- JSON parsing handles missing, null, malformed, and future unknown fields.
- One refresh is shared across simultaneous chart instances where the cTrader runtime permits it.
- No network request occurs from `Calculate()`.
- Last valid data survives a temporary outage and transitions to STALE at the defined age.

### Panel

- Expanded layout contains every requested field.
- Default position is bottom-left.
- Dragging remains within chart bounds.
- Minimize and restore preserve position.
- BUY, SELL, WAIT, INVALID, stale, and license states are visually distinct.
- The panel remains readable on common cTrader Mac scaling settings.

### Release verification

- Compile and attach both editions in cTrader Mac.
- Attach to all 21 supported charts and verify request coalescing, memory use, and UI responsiveness.
- Run `py -3.11 check_dupes.py` when available; on macOS use the repository-supported Python 3.11 invocation.
- Run the complete automated test suite.
- Run `npx next build` successfully.
- Confirm `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not deleted or staged for deletion.
- Push only to `gian101310/panda-dashboar` on `main` after approval and successful verification.
- Verify the Vercel deployment reaches READY and has a build duration greater than 20 seconds.

## Delivery sequence

1. Extend the license schema and admin workflow while preserving MT4 behavior.
2. Add the authenticated minimal cTrader feed and tests.
3. Implement and test shared cTrader data/normalization components.
4. Implement the draggable, minimizable layout C panel.
5. Build the personal and licensed packages.
6. Verify both packages on cTrader Mac and complete repository/deployment checks.

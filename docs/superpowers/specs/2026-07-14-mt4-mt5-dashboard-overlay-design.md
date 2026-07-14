# MT4 and MT5 Dashboard Overlay Design

**Date:** 2026-07-14

**Status:** Approved for implementation planning

**Owner:** Boss-G

## Objective

Build lightweight MetaTrader 4 and MetaTrader 5 chart indicators that display the authoritative Panda Engine dashboard snapshot for the active chart symbol. Each platform has a Personal edition authenticated by the existing operator token and a Licensed edition authorized by the terminal's numeric trading account number.

The four deliverables are:

1. Panda Dashboard Overlay MT4 Personal.
2. Panda Dashboard Overlay MT4 Licensed.
3. Panda Dashboard Overlay MT5 Personal.
4. Panda Dashboard Overlay MT5 Licensed.

MT4 and MT5 commercial approvals are separate products in Panda Engine Admin. The Personal editions share the same rotatable operator token already used by the cTrader Personal edition.

## Locked constraints and non-goals

- Do not modify `extract_panda_score()` or `compute_scores_all_pairs()` in `app.py`.
- Do not calculate score, bias, Box, Panda Lines, or XTF state inside MetaTrader.
- Do not alter BB or INTRA strategy definitions.
- Do not connect MetaTrader directly to Supabase.
- Do not embed the operator token, Supabase keys, `ENGINE_SECRET`, or other secrets in source or compiled packages.
- Do not accept an editable account-number parameter in either Licensed edition.
- Do not place, modify, or close trades. The overlays are informational only.
- Preserve the existing cTrader endpoint, products, packages, and authorization behavior.

## Edition boundaries

Each platform has separate Personal and Licensed entry files backed by a shared platform core.

### Personal editions

- Expose an `Operator Token` input.
- Send the trimmed token only in the HTTPS `x-panda-operator-token` request header.
- Use the same active operator token as cTrader Personal.
- Display `AUTH REQUIRED` when the input is empty and `AUTH ERROR` when the server rejects it.
- Never log or persist the plaintext token in Panda-managed cache files.

### Licensed editions

- Read the login from `AccountNumber()` on MT4 and `AccountInfoInteger(ACCOUNT_LOGIN)` on MT5.
- Send the numeric login only in the HTTPS `x-panda-account-number` request header.
- Contain no Personal-mode switch and no token parameter.
- Require an `APPROVED`, paid-confirmed license for the exact platform product.
- Do not require or transmit a broker name or server name.

## Panda Engine products and admin wiring

Add two admin-only products without changing existing product codes:

- `mt4_dashboard_overlay` — Panda MT4 Dashboard Overlay — platform `MT4`.
- `mt5_dashboard_overlay` — Panda MT5 Dashboard Overlay — platform `MT5`.

Extend platform normalization to accept `MT4`, `MT5`, and `CTRADER`. Admin-created MT4 and MT5 overlay licenses store the normalized numeric account in both the compatibility account field and `trading_account_number`. Product/platform combinations must agree; a license for the MT4 product cannot authorize the MT5 endpoint and vice versa.

The existing states remain authoritative:

- `PENDING` denies protected data.
- `APPROVED` plus payment confirmation permits protected data.
- `DISABLED`, `EXPIRED`, unknown, or otherwise unapproved records deny protected data.

All create, approve, edit, disable, expire, and delete operations remain gated by the authenticated server-side admin session.

## API architecture

Add two fixed server-side routes:

- `GET /api/mt4-overlay`
- `GET /api/mt5-overlay`

Both use a shared MetaTrader overlay handler factory. The route supplies its product code to the factory; the client never submits or selects the product code.

Authentication is mutually exclusive:

- `x-panda-operator-token` selects Personal authorization and validates the shared operator-token hash.
- `x-panda-account-number` selects Licensed authorization and validates the route's fixed product code.
- Sending both credentials is rejected.
- Sending neither credential is rejected.

Authorized responses use the existing cTrader overlay schema version 1 and the same sanitized pair allowlist. No strategy formulas, thresholds, user records, database identifiers, or unrelated dashboard fields are returned. Denied requests return status metadata without pair rows.

The routes use the shared Supabase client and a short dashboard snapshot cache. Token hashes are compared in constant time. Raw tokens are never logged. Account values accept only 3 to 20 digits.

## Symbol normalization

The MT4 and MT5 clients identify exactly one supported six-letter Panda pair inside the broker symbol. This supports examples such as `EURUSD`, `EURUSD.a`, `mEURUSD`, and `EURUSD-ECN`.

Normalization fails closed:

- Unsupported symbols show `UNSUPPORTED SYMBOL` and no Panda values.
- Symbols containing more than one supported pair token are treated as ambiguous.
- No fallback pair is substituted.

## Lightweight shared terminal feed

The indicators use `WebRequest` over HTTPS. Installation instructions require adding `https://pandaengine.app` to MetaTrader's allowed WebRequest URLs.

All instances in one terminal share a credential-scoped cache and request lock:

- Refresh the all-pairs snapshot no more than once every 60 seconds.
- Use a terminal global-variable lock to ensure only one chart performs the refresh.
- Write only the authorized snapshot JSON and cache metadata to the terminal common-files area.
- Never write the operator token into a cache filename or cache contents.
- Other chart instances read the latest snapshot from the shared cache.
- Release an abandoned request lock after a bounded timeout.
- Perform no HTTP work on market-tick calculation paths.

The cache key separates platform and authorization identity. Personal cache identity is derived from a non-reversible local digest of the token. Licensed cache identity is derived from the numeric login. The digest is used only for cache separation; server authorization remains authoritative.

## Panel behavior

The default expanded panel is anchored to the chart's bottom-left corner with a small inset. It displays:

- Canonical symbol and PANDA label.
- Signed Score.
- Bias.
- Box H4.
- Box H1.
- Panda Lines state.
- XTF base and quote readings.
- Dashboard update time and connection status.

The panel uses lightweight chart objects rather than custom bitmap rendering. It is approximately 260 by 170 logical pixels, with proportional typography and no animation. BUY uses `#00ff9f`, SELL uses `#ff4d6d`, warnings use `#ffd166`, and neutral values use grey/white.

Dragging the panel header moves the complete panel. Position is stored using terminal global variables scoped to platform, edition, chart, and symbol. A minimize control collapses it to symbol, Score, Bias, and status while preserving the expanded position.

## Freshness and errors

- Initial state is `CONNECTING`.
- Successful data displays `LIVE`.
- Data older than the server's `max_age_seconds` displays `STALE`.
- Temporary network or parsing errors retain the last valid snapshot until it becomes stale.
- Authorization failure clears protected values and displays the returned authorization state.
- WebRequest permission failure displays `ALLOW WEBREQUEST`.
- Unsupported symbols display no Panda values.
- Missing or null fields display an em dash and never imply confirmation.

Failed refreshes are also throttled to avoid one request per timer tick. A retry can occur at the next 60-second interval.

## Source and release layout

Create a dated source tree under `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/` containing:

- Shared MT4 include/core and two `.mq4` entry files.
- Shared MT5 include/core and two `.mq5` entry files.
- `dist/` for compiled `.ex4` and `.ex5` outputs.
- SHA-256 checksums for every compiled package.
- A README with install, WebRequest, Personal token, Licensed approval, movement, minimization, and troubleshooting instructions.

Compiled commercial outputs are the customer-facing artifacts. Source remains in the private repository for maintenance and reproducible builds.

## Compilation

Compile with the installed MetaTrader 4 and MetaTrader 5 MetaEditor environments. Treat any compiler error as release-blocking. Record compiler logs beside the release sources or in `dist/` and verify the expected `.ex4` and `.ex5` outputs exist and are non-empty.

If either local compiler cannot produce a verified binary, do not substitute an old binary or rename a source file. Report that platform as blocked and provide the exact MetaEditor compile command and source path needed on the Windows production workstation.

## Testing and acceptance criteria

### Server and admin

- MT4 and MT5 products appear in the admin product selector with correct platform metadata.
- Platform normalization preserves MT4, MT5, and cTrader behavior.
- Valid Personal tokens authorize both MetaTrader endpoints.
- Token rotation invalidates the old token on both endpoints.
- An approved MT4 license authorizes only `/api/mt4-overlay`.
- An approved MT5 license authorizes only `/api/mt5-overlay`.
- Pending, disabled, expired, unpaid, unknown, malformed, or cross-platform accounts receive no pair data.
- The cTrader endpoint and existing licenses continue to pass regression tests.

### MQL contracts

- Personal sources expose only the operator-token credential input.
- Licensed sources contain no token input and use the runtime login.
- Both platforms use HTTPS and the correct fixed endpoint.
- No source or distribution contains an operator token, Supabase key, or engine secret.
- Canonical, prefixed, and suffixed symbols normalize correctly; unsupported or ambiguous symbols fail closed.
- Timer refresh, shared cache, failed-request throttling, stale transitions, and authorization clearing are covered by executable or source-contract tests.
- All requested panel labels and bottom-left defaults are present.

### Release and deployment

- Compile all four binaries with zero compiler errors.
- Verify SHA-256 checksums.
- Run the repository test suite relevant to licensing, feeds, admin controls, and package contracts.
- Run `/opt/homebrew/bin/python3.11 check_dupes.py` successfully on macOS.
- Run `npx next build` successfully.
- Confirm `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not staged for deletion.
- Commit with kebab-case messages and push only `main` to `gian101310/panda-dashboar`.
- Verify the Vercel deployment reaches READY and its build duration exceeds 20 seconds.

## Handoff requirements

Update the project handoff with:

- The four artifact paths and checksums.
- The exact two product codes and fixed API routes.
- How Personal token generation, copy-before-rotate, and rotation work across all three platforms.
- How to create and approve MT4 and MT5 account licenses without broker information.
- MetaTrader WebRequest allow-list instructions.
- How shared caching keeps one terminal lightweight across many charts.
- The reusable rule for future indicators: separate Personal and Licensed entry points, fixed server-side product identity, shared sanitized feed core, no embedded secrets, runtime account binding, test-first package contracts, and verified compiled outputs.

## Delivery sequence

1. Add failing product, platform, authorization-isolation, and MQL contract tests.
2. Extend the product registry and admin platform handling.
3. Add the shared MetaTrader handler and fixed MT4/MT5 routes.
4. Implement the MT4 Personal and Licensed indicators.
5. Implement the MT5 Personal and Licensed indicators.
6. Compile all four release binaries and generate checksums.
7. Update README, CHANGELOG, and handoff documentation.
8. Run full verification, commit, push `main`, and verify Vercel READY.

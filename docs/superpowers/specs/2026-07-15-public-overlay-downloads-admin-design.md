# Public Overlay Downloads and Admin Telemetry Design

**Date:** 2026-07-15

**Status:** Approved for implementation

**Scope:** Panda Dashboard public indicator downloads, activation requests, admin download telemetry, and recoverable active Personal token

## Goal

Let any visitor download the compiled Licensed Panda Dashboard Overlay for cTrader, MT4, or MT5, then request account-number activation. Give the administrator a per-indicator download counter and recent download activity. Make the one active Personal overlay token recoverable and copyable later without storing readable plaintext in Supabase or retaining usable copies of inactive tokens.

## Guardrails

- Publish only the compiled Licensed overlay files. Personal editions, source packages, Supabase credentials, `ENGINE_SECRET`, and other secrets remain private.
- Preserve account-number authorization. A downloaded Licensed indicator remains inactive until its platform/account/product license is approved.
- Keep the existing cTrader, MT4, and MT5 feed contracts and scoring data unchanged.
- Do not modify `extract_panda_score()`, `compute_scores_all_pairs()`, BB strategy rules, INTRA strategy rules, or `vercel.json`'s deploy guardrail.
- Use the shared Supabase client for every new API route.
- Require a validated admin session for counters, recent activity, token status, token reveal, and token rotation history.
- Never write a raw token to application logs, analytics events, source control, static assets, or browser storage.

## Alternatives Considered

### 1. Tracked public downloads plus encrypted active-token recovery — selected

Website download buttons call a small public allowlisted API. The API records the selected product and redirects to its static compiled file. The admin API aggregates those events. The current Personal token is hashed for feed authorization and separately encrypted for admin-only recovery.

This matches the public-download requirement, reuses the existing account approval system, and provides useful counters without exposing Personal builds.

### 2. Direct static links plus external web analytics

This is simpler but produces less trustworthy per-product counts, depends on analytics configuration outside the repository, and cannot provide a focused admin activity view.

### 3. Request-gated or signed downloads

This gives tighter distribution control but conflicts with the approved requirement that anyone can download the Licensed files before requesting activation. It also adds expiring links and customer support complexity without improving account-number enforcement.

## Product Catalog and Public Files

The indicator product catalog will explicitly mark the three dashboard overlays as public-download products while retaining their admin/licensing identity:

- `ctrader_dashboard_overlay` → cTrader `.algo`
- `mt4_dashboard_overlay` → MT4 `.ex4`
- `mt5_dashboard_overlay` → MT5 `.ex5`

Each product will define a platform, public filename, download path, and activation-request capability. A dedicated exported public-download list will prevent unrelated legacy products or Personal editions from appearing accidentally.

The compiled Licensed artifacts will be copied into `public/downloads/` with stable, platform-specific names. Source files and Personal artifacts will not be copied there.

## Public Download Experience

The public landing page will add a compact Panda Dashboard Overlay section with one card per platform. Each card shows:

- platform and compatible file type;
- **Download Licensed** action;
- **Request Activation** action;
- a short explanation that the file is free to download but requires account approval;
- the MetaTrader WebRequest requirement where applicable.

The existing indicator request modal will become platform-aware. The chosen product determines the platform and account label; the server does not trust a client-supplied platform when it can derive it from the product catalog.

Required request fields are customer name, at least one contact method, product, and a numeric trading account number. The success state explains that the request is pending and that the already-installed indicator will activate after approval.

## Activation Request Data Flow

1. The visitor selects a platform and downloads the Licensed file.
2. The visitor submits the matching activation request.
3. The request API validates the product against the requestable catalog, derives the platform, normalizes the account number, and rejects malformed or duplicate requests.
4. Supabase receives a `PENDING` `indicator_licenses` row with `product_code`, `platform`, and `trading_account_number`. The legacy `mt4_account_id` field is populated where needed for backward compatibility.
5. Telegram alerts the operator with the correct platform, account number, product, and admin-license link.
6. The operator opens Admin → Indicator Licensing, confirms payment when applicable, and approves the license.
7. The Licensed indicator authorizes against its runtime account number during its next synchronization.

Duplicate detection will be product-, platform-, and account-aware for overlay licenses. Existing legacy-product behavior remains compatible.

## Download Tracking

### Public route

`GET /api/indicator-download?product=<product_code>` will:

1. accept only catalog entries marked for public download;
2. record a download event containing product code, platform, and server timestamp;
3. redirect to the allowlisted static file;
4. still deliver the file if telemetry insertion fails.

The event contains no token, trading account number, contact details, or raw IP address. Counts represent download-button activations, not unique customers. Direct access to a known static file can bypass counting, so the admin UI will label the metric **downloads recorded** rather than claiming unique users.

### Storage

A migration will create `indicator_download_events` with:

- generated ID;
- `product_code`;
- `platform`;
- `downloaded_at` timestamp.

RLS will be enabled with no anonymous or authenticated table policy. Public inserts occur only through the server-side download route using the shared service client. Admin reads occur only through an authenticated admin API.

### Admin display

Admin → Indicator Licensing will show one summary card per public overlay with total recorded downloads. A compact recent-activity table will show platform, indicator, and timestamp for the latest events. No visitor identity or IP information is collected or displayed.

## Recoverable Active Personal Token

### Storage model

The active Personal token keeps its existing SHA-256 hash for constant-time feed authorization. On rotation, the server will also encrypt the token with AES-256-GCM using a dedicated server-only `INDICATOR_TOKEN_ENCRYPTION_KEY` environment variable. Supabase stores only ciphertext, IV, authentication tag, and non-secret rotation metadata.

The encryption key must never be exposed to the client or stored in the repository. The implementation will validate its format and fail token rotation safely if secure encryption is unavailable.

### Admin behavior

- Normal status loading returns only configured/recoverable state and rotation metadata.
- **Reveal & Copy Active Token** requires a fresh admin-authorized API call.
- The reveal response uses `Cache-Control: private, no-store` and returns the token only to the authenticated admin.
- The browser holds the revealed value only in component memory, clears it after a short interval, and never writes it to local storage.
- Rotating a token immediately invalidates the previous token on cTrader, MT4, and MT5.

Existing hash-only rows cannot be decrypted. They continue authorizing Personal indicators, but the admin UI will show that one rotation is required to enable future recovery.

### Rotation log

A rotation audit table will store rotation time, administrator identity, and status metadata. It will not retain old token plaintext or decryptable old token values. The admin can review when rotations happened, while only the current working token remains recoverable.

## Error Handling

- Unknown or non-public product codes return `404` without revealing filesystem paths.
- Download telemetry failures do not block the requested download.
- Missing or malformed account numbers return a platform-specific validation message.
- Duplicate requests return the existing pending/approved state instead of creating conflicting rows.
- Missing encryption configuration prevents rotation and reveal with an admin-visible configuration error; it never falls back to plaintext storage.
- Authentication failures return a generic admin-only denial and never include token material.
- Decryption/authentication failures return a generic recovery error and preserve the stored hash.

## Testing

Automated coverage will verify:

- only the three Licensed overlay products are public downloads;
- Personal and legacy private artifacts never appear in the public catalog;
- the download route rejects unknown products, records valid events, redirects correctly, and still redirects when telemetry fails;
- the admin telemetry route rejects non-admins and returns per-product totals plus recent activity;
- public requests derive the correct platform and store normalized trading account numbers;
- duplicate detection works independently for cTrader, MT4, and MT5 products;
- Telegram request messages use the correct platform/account label;
- token encryption/decryption round trips with an injected test key;
- token status responses never expose hashes, ciphertext, keys, or plaintext;
- token reveal is admin-only and no-store;
- rotation history contains metadata but no token value;
- legacy hash-only settings remain authorized and report recovery unavailable;
- landing-page cards link through the tracked route and retain responsive layout.

Repository verification will also run `check_dupes.py`, the focused Node tests, and `npx next build` before commit and push. Production verification will confirm a Vercel `READY` deployment with a build duration greater than 20 seconds and exercise the public download redirect without exposing secrets.

## Delivery Boundaries

This change includes public Licensed downloads, activation-request wiring, Telegram request labeling, download telemetry, admin display, encrypted recovery of the current active Personal token, rotation audit metadata, migrations, tests, documentation, commit, push, and deployment verification.

It does not add online payment processing, automatic payment confirmation, customer accounts, unique-person analytics, broker detection, Personal-edition downloads, or recovery of already-rotated tokens.

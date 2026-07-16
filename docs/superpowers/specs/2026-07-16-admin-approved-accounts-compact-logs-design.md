# Admin Approved Accounts and Compact Indicator Logs

## Goal

Keep approved Panda Engine accounts visible after approval and prevent indicator download activity from consuming most of the license-admin screen.

## Approved accounts

`/admin/pf-approvals` will add an `APPROVED ACCOUNTS` tab. The existing admin-only approvals API will return approved `panda_users` records and an exact approved-account count. The tab will show username, tier, role, active state, device allowance, and account creation time. An admin can revoke approval from this tab with the existing approval toggle action; after refresh, the account moves back to `PENDING USERS`.

The tab counter uses the exact database count instead of the number of visible rows. The API will return the newest 500 approved accounts for the on-screen history, which keeps the response bounded while covering the current account volume. The empty state will clearly state when there are no approved accounts.

## Compact indicator activity

`/admin/license` will continue to show the per-indicator download totals because those counters are useful at a glance. The detailed `RECENT DOWNLOAD ACTIVITY` table will be collapsed by default. A `SHOW ACTIVITY` / `HIDE ACTIVITY` button will toggle it.

When expanded, the existing recent events remain limited and will sit inside a fixed-height vertically scrollable container. This prevents additional download rows from lengthening the whole page.

## Data and security

No database migration is required. The approvals API continues to require an authenticated admin session and selects only operational account fields. Passwords, hashes, sessions, IP addresses, and device fingerprints are not returned by the approved-account query.

## Verification

Automated tests will verify the approved-account query, exact counter, new tab, revoke action, collapsed-by-default activity state, toggle labels, and bounded scroll container. The normal Panda duplicate check and Next.js production build must pass before deployment.


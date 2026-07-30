# Admin Approved Accounts and Compact Indicator Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve an admin-visible history and exact count of approved accounts while keeping detailed indicator download activity compact.

**Architecture:** Extend the existing authenticated `pf-approve` GET response with approved users and an exact count, then render a fourth approvals tab using the page's existing inline-style patterns. Keep indicator download totals visible in `pages/admin/license.js`, but gate the detailed recent-events table behind local UI state and a bounded scroll container.

**Tech Stack:** Next.js 14 pages router, React 18 hooks, Supabase JavaScript client, Node.js built-in test runner.

## Global Constraints

- Do not modify locked scoring functions or trading strategy definitions.
- Keep all admin data routes protected by server-side session and role validation.
- Do not return passwords, password hashes, sessions, IP addresses, or device fingerprints in approved-account data.
- Keep the approved-account response bounded to 500 rows while returning an exact database count.
- Keep detailed indicator download activity collapsed by default.

---

### Task 1: Add failing admin UI contract tests

**Files:**
- Create: `tests/pfApprovalsAdminUi.test.mjs`
- Modify: `tests/indicatorLicenseAdminUi.test.mjs`

**Interfaces:**
- Consumes: `pages/api/admin/pf-approve.js`, `pages/admin/pf-approvals.js`, and `pages/admin/license.js` as source files.
- Produces: Regression contracts for approved-account data/UI and compact download activity.

- [ ] **Step 1: Write the failing approved-account tests**

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

test('approval API returns a bounded approved-account list and exact count', () => {
  const api = fs.readFileSync('pages/api/admin/pf-approve.js', 'utf8');
  assert.match(api, /approvedUsers/);
  assert.match(api, /eq\('pf_approved', true\)/);
  assert.match(api, /count: 'exact'/);
  assert.match(api, /limit\(500\)/);
  assert.match(api, /approved_users: approvedUsers \|\| \[\]/);
  assert.match(api, /approved_users: approvedCount \|\| 0/);
});

test('approvals page shows approved accounts with a counter and revoke action', () => {
  const page = fs.readFileSync('pages/admin/pf-approvals.js', 'utf8');
  assert.match(page, /pfApprovedUsers/);
  assert.match(page, /APPROVED ACCOUNTS/);
  assert.match(page, /pfCounts\.approved_users/);
  assert.match(page, /pfTab === 'approved'/);
  assert.match(page, /REVOKE/);
  assert.match(page, /MAX DEVICES/);
});
```

- [ ] **Step 2: Write the failing compact-activity assertions**

Append to the existing license-admin UI test:

```js
assert.match(admin, /showDownloadActivity/);
assert.match(admin, /SHOW ACTIVITY/);
assert.match(admin, /HIDE ACTIVITY/);
assert.match(admin, /maxHeight: 320/);
assert.match(admin, /overflowY: 'auto'/);
```

- [ ] **Step 3: Run tests and verify the expected failures**

Run: `node --test tests/pfApprovalsAdminUi.test.mjs tests/indicatorLicenseAdminUi.test.mjs`

Expected: failures for missing `approvedUsers`, `APPROVED ACCOUNTS`, and `showDownloadActivity` behavior.

---

### Task 2: Return and render approved accounts

**Files:**
- Modify: `pages/api/admin/pf-approve.js`
- Modify: `pages/admin/pf-approvals.js`
- Test: `tests/pfApprovalsAdminUi.test.mjs`

**Interfaces:**
- Consumes: existing `pfRequireAdmin`, `panda_users`, and `toggle_user_approved` action.
- Produces: GET fields `approved_users: Array<Account>`, `counts.approved_users: number`; UI tab key `approved`.

- [ ] **Step 1: Extend the authenticated GET response**

Add an approved user query selecting only:

```js
const { data: approvedUsers, count: approvedCount } = await supabase
  .from('panda_users')
  .select('id, username, role, pf_tier, pf_approved, created_at, is_active, max_devices', { count: 'exact' })
  .eq('pf_approved', true)
  .order('created_at', { ascending: false })
  .limit(500);
```

Return it with:

```js
approved_users: approvedUsers || [],
counts: { approved_users: approvedCount || 0 },
```

- [ ] **Step 2: Add approved-account state and loading**

Add:

```js
const [pfApprovedUsers, setPfApprovedUsers] = useState([]);
const [pfCounts, setPfCounts] = useState({ approved_users: 0 });
```

Populate both from `pfLoad()` and add the tab label:

```js
{ k: 'approved', label: `APPROVED ACCOUNTS (${pfCounts.approved_users})` },
```

- [ ] **Step 3: Render the compact approved-account table**

Render the `approved` tab with columns for account, tier, role, status, maximum devices, created time, and action. Use `pfToggleApproved(u.id)` for a red `REVOKE` button so the account returns to the pending list after refresh.

- [ ] **Step 4: Run the focused approved-account test**

Run: `node --test tests/pfApprovalsAdminUi.test.mjs`

Expected: 2 tests pass.

---

### Task 3: Collapse detailed indicator download activity

**Files:**
- Modify: `pages/admin/license.js`
- Test: `tests/indicatorLicenseAdminUi.test.mjs`

**Interfaces:**
- Consumes: existing `downloadStats.totals` and `downloadStats.recent`.
- Produces: local boolean state `showDownloadActivity`, a Show/Hide button, and a 320px scroll container.

- [ ] **Step 1: Add collapsed-by-default state**

Add:

```js
const [showDownloadActivity, setShowDownloadActivity] = useState(false);
```

- [ ] **Step 2: Add the activity toggle and bounded log**

Keep download total cards visible. Replace the unconditional recent activity table with a header button whose label is `SHOW ACTIVITY` or `HIDE ACTIVITY`. Render the table only when expanded and wrap it in:

```js
style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}
```

- [ ] **Step 3: Run the focused indicator-admin test**

Run: `node --test tests/indicatorLicenseAdminUi.test.mjs`

Expected: all license-admin UI tests pass.

---

### Task 4: Verify, document, publish, and verify deployment

**Files:**
- Modify: `CHANGELOG.md`
- Verify: `package.json`, `package-lock.json`, `vercel.json`, `next.config.js`

**Interfaces:**
- Consumes: completed code and regression tests.
- Produces: one deployment commit on `main` and a verified Vercel deployment.

- [ ] **Step 1: Update the changelog**

Add a dated entry stating that admin approvals now retain an approved-account counter/history and indicator download activity is collapsible with a bounded scroll area.

- [ ] **Step 2: Run focused and full Node tests**

Run:

```bash
node --test tests/pfApprovalsAdminUi.test.mjs tests/indicatorLicenseAdminUi.test.mjs
node --test tests/*.test.mjs
```

Expected: zero failed tests.

- [ ] **Step 3: Run mandatory project checks**

Run:

```bash
python3 check_dupes.py
npx next build
```

Expected: duplicate check exits successfully and Next.js production build exits 0.

- [ ] **Step 4: Confirm protected build files are not deleted**

Run: `git status --short && git diff --name-status HEAD`

Expected: `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not marked deleted.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add pages/api/admin/pf-approve.js pages/admin/pf-approvals.js pages/admin/license.js tests/pfApprovalsAdminUi.test.mjs tests/indicatorLicenseAdminUi.test.mjs CHANGELOG.md docs/superpowers/plans/2026-07-16-admin-approved-accounts-compact-logs.md
git commit -m "add-approved-account-admin-history"
git push origin main
```

Expected: push succeeds without force and triggers the `panda-dashboard` Vercel project.

- [ ] **Step 6: Verify production deployment**

Check the latest production deployment for `pandaengine.app` and confirm it reaches `READY` after a normal build duration greater than 20 seconds.

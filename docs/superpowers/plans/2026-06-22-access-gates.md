# Access Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Site Off, per-page ON/OFF, global bypass, and user bypass controls consistently hide disabled pages—including login—while allowing approved bypasses.

**Architecture:** Centralize precedence in a pure function in `lib/pageVisibility.mjs`. The shared Next.js app shell obtains the current user, maintenance setting, and public page settings, then selects one of the existing maintenance, coming-soon, or page render paths from that function.

**Tech Stack:** Next.js 14 Pages Router, React 18, Node built-in test runner.

## Global Constraints

- Work only in `C:\Users\Admin\Documents\Claude\Projects\Panda Engine` on `main`, with explicit Boss-G consent.
- Do not modify `app.py` scoring, strategy thresholds, `computeConfidence`, `MOMENTUM_GUIDE`, `biasFromGap`, or `vercel.json`.
- Preserve unrelated restored workspace changes and stage only files named in each commit.
- Leave indicator licensing out of this change.

---

### Task 1: Test and implement the shared access-gate decision

**Files:**
- Modify: `lib/pageVisibility.mjs`
- Modify: `tests/pageVisibility.test.mjs`

**Interfaces:**
- Produces: `getPageAccessDecision({ isAdmin, hasMaintenanceBypass, maintenanceEnabled, pageKey, visibility })` returning `'allow' | 'maintenance' | 'coming_soon'`.

- [ ] **Step 1: Write the failing test**

```js
import { getPageAccessDecision } from '../lib/pageVisibility.mjs';

test('maintenance blocks login unless the user has a bypass', () => {
  assert.equal(getPageAccessDecision({ maintenanceEnabled: true, pageKey: 'login' }), 'maintenance');
  assert.equal(getPageAccessDecision({ maintenanceEnabled: true, pageKey: 'login', hasMaintenanceBypass: true }), 'allow');
});

test('page controls apply only when global bypass is off', () => {
  assert.equal(getPageAccessDecision({ pageKey: 'login', visibility: { login: false, bypass_enabled: false } }), 'coming_soon');
  assert.equal(getPageAccessDecision({ pageKey: 'login', visibility: { login: false, bypass_enabled: true } }), 'allow');
});
```

- [ ] **Step 2: Run the test before implementation**

Run: `node --test tests/pageVisibility.test.mjs`

Expected: failure because `getPageAccessDecision` is not exported.

- [ ] **Step 3: Add the minimal helper**

```js
export function getPageAccessDecision({
  isAdmin = false,
  hasMaintenanceBypass = false,
  maintenanceEnabled = false,
  pageKey = null,
  visibility = null,
} = {}) {
  if (isAdmin || hasMaintenanceBypass) return 'allow';
  if (maintenanceEnabled) return 'maintenance';
  if (!pageKey) return 'allow';
  const pageVisibility = normalizePageVisibility(visibility);
  if (pageVisibility.bypass_enabled || pageVisibility[pageKey] !== false) return 'allow';
  return 'coming_soon';
}
```

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/pageVisibility.test.mjs`

Expected: all page-visibility tests pass.

- [ ] **Step 5: Commit only the helper and tests**

```bash
git add lib/pageVisibility.mjs tests/pageVisibility.test.mjs
git commit -m "fix-access-gate-precedence"
```

### Task 2: Make the app shell enforce the shared decision, including login

**Files:**
- Modify: `pages/_app.js`
- Test: `tests/pageVisibility.test.mjs`

**Interfaces:**
- Consumes: `getPageAccessDecision` from `lib/pageVisibility.mjs`.
- Produces: maintenance or coming-soon render for the returned non-allow decision.

- [ ] **Step 1: Add an administrator precedence test**

```js
test('administrators bypass maintenance and disabled public pages', () => {
  assert.equal(getPageAccessDecision({
    isAdmin: true,
    maintenanceEnabled: true,
    pageKey: 'login',
    visibility: { login: false, bypass_enabled: false },
  }), 'allow');
});
```

- [ ] **Step 2: Run the focused test before implementation**

Run: `node --test tests/pageVisibility.test.mjs`

Expected: failure until the administrator branch exists in the helper.

- [ ] **Step 3: Replace independent shell gate state with one decision**

```js
const [accessDecision, setAccessDecision] = useState('checking');
// Fetch /api/me, /api/maintenance, and page visibility; then:
setAccessDecision(getPageAccessDecision({
  isAdmin,
  hasMaintenanceBypass,
  maintenanceEnabled,
  pageKey: ROUTE_TO_PAGE_KEY[router.pathname],
  visibility,
}));
```

Render `null` only for `checking`, `<MaintenanceScreen />` for `maintenance`, and `<ComingSoonScreen />` for `coming_soon`. Do not exempt `/login`.

- [ ] **Step 4: Run tests and the production build**

Run: `node --test tests/pageVisibility.test.mjs && npx next build`

Expected: both commands exit 0.

- [ ] **Step 5: Commit only the shell change**

```bash
git add pages/_app.js
git commit -m "fix-maintenance-login-gate"
```

### Task 3: Align the dashboard Pages panel with enforced behavior

**Files:**
- Modify: `pages/dashboard.js`
- Modify: `tests/pageVisibility.test.mjs`

**Interfaces:**
- Consumes: existing `pageVis` state and `/api/page-visibility`.
- Produces: accurate global-bypass copy and switches for every mapped public route.

- [ ] **Step 1: Add a route-map test**

```js
test('maps every dashboard-controlled public route', () => {
  assert.equal(ROUTE_TO_PAGE_KEY['/guardian'], 'guardian');
  assert.equal(ROUTE_TO_PAGE_KEY['/stream'], 'stream');
});
```

- [ ] **Step 2: Run the test before UI changes**

Run: `node --test tests/pageVisibility.test.mjs`

Expected: passing result; it documents the existing map before the UI change.

- [ ] **Step 3: Extend the Pages-panel array and correct global-bypass guidance**

```js
{ key: 'guardian', label: '🛡️ GUARDIAN', route: '/guardian' },
{ key: 'stream', label: '📡 STREAM', route: '/stream' },
```

Use copy equivalent to: `BYPASS ON — All controlled pages are open. Individual switches are saved but take effect only when bypass is OFF.`

- [ ] **Step 4: Run all required verification**

Run: `node --test tests/pageVisibility.test.mjs && py -3.11 check_dupes.py && npx next build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit only the Pages-panel correction**

```bash
git add pages/dashboard.js tests/pageVisibility.test.mjs
git commit -m "fix-page-visibility-controls"
```

## Plan Self-Review

- Spec coverage: Tasks 1 and 2 enforce every stated precedence rule; Task 3 corrects the controls users operate.
- Placeholder scan: no deferred implementation markers or unspecified tests.
- Interface consistency: every consuming task uses the exact `getPageAccessDecision` signature declared in Task 1.


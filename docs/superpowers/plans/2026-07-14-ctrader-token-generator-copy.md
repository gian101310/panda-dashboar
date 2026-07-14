# cTrader Token Generator and Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure client-side generation and clipboard copying to the existing cTrader personal-token admin card.

**Architecture:** A focused pure helper creates 32 cryptographically random bytes and hex-encodes them into a 64-character token. The admin page calls that helper, copies only the current in-memory field value, and retains the existing separate rotation request and hash-only server storage.

**Tech Stack:** Next.js 14 pages, React hooks, browser Web Crypto and Clipboard APIs, Node test runner.

## Global Constraints

- Random bytes must come from `globalThis.crypto.getRandomValues`; `Math.random` is prohibited.
- Generation and copying occur only in the browser.
- Rotation remains a separate explicit action and clears the plaintext after success.
- No token may be written to source, logs, local storage, database plaintext columns, or API responses.
- Do not modify the locked scoring engine, strategy definitions, or cTrader feed contract.
- Work directly on the project-mandated `main` branch; do not create a worktree or feature branch.

---

### Task 1: Secure token generator

**Files:**
- Create: `lib/indicatorTokenGenerator.mjs`
- Create: `tests/indicatorTokenGenerator.test.mjs`

**Interfaces:**
- Consumes: a source with `getRandomValues(Uint8Array): Uint8Array`, defaulting to `globalThis.crypto`.
- Produces: `generateIndicatorToken(cryptoSource?): string`, returning 64 lowercase hexadecimal characters.

- [ ] **Step 1: Write the failing generator tests**

Create tests that inject a deterministic source which fills the 32-byte array with values `0` through `31`, assert the exact 64-character hexadecimal result, and assert that a missing `getRandomValues` source throws `Secure random generator unavailable`.

- [ ] **Step 2: Run the generator test and verify RED**

Run: `node --test tests/indicatorTokenGenerator.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/indicatorTokenGenerator.mjs`.

- [ ] **Step 3: Implement the minimal generator**

Create `generateIndicatorToken` with this behavior:

```js
export function generateIndicatorToken(cryptoSource = globalThis.crypto) {
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') {
    throw new Error('Secure random generator unavailable');
  }
  const bytes = new Uint8Array(32);
  cryptoSource.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run the generator test and verify GREEN**

Run: `node --test tests/indicatorTokenGenerator.test.mjs`

Expected: 2 tests pass, 0 fail.

### Task 2: Generate and copy controls

**Files:**
- Modify: `pages/admin/license.js`
- Modify: `tests/indicatorTokenGenerator.test.mjs`

**Interfaces:**
- Consumes: `generateIndicatorToken()` from Task 1 and `navigator.clipboard.writeText(string)`.
- Produces: `GENERATE TOKEN` and `COPY TOKEN` controls in the existing cTrader personal-token form; successful copying changes the copy label to `COPIED` temporarily.

- [ ] **Step 1: Add a failing page contract test**

Read `pages/admin/license.js` as text and assert that it imports/calls `generateIndicatorToken`, calls `navigator.clipboard.writeText(newToken)`, renders `GENERATE TOKEN` and `COPY TOKEN`, and disables copying when `newToken` is empty.

- [ ] **Step 2: Run the page contract test and verify RED**

Run: `node --test tests/indicatorTokenGenerator.test.mjs`

Expected: FAIL because the admin page does not yet contain the generator or clipboard controls.

- [ ] **Step 3: Implement the minimal admin interaction**

Import the helper, add `copyStatus` state, and add these handlers:

```js
function generateOperatorToken() {
  try {
    setNewToken(generateIndicatorToken());
    setCopyStatus('COPY TOKEN');
    setError('');
  } catch {
    setError('Secure token generation is unavailable in this browser');
  }
}

async function copyOperatorToken() {
  if (!newToken) return;
  try {
    await navigator.clipboard.writeText(newToken);
    setCopyStatus('COPIED');
    setTimeout(() => setCopyStatus('COPY TOKEN'), 1800);
  } catch {
    setError('Could not copy token. Select and copy it manually.');
  }
}
```

Render both controls as `type="button"` so neither submits the rotation form. Disable the copy control when the field is empty. Reset the copy label when the field changes and after a successful rotation.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test tests/indicatorTokenGenerator.test.mjs tests/indicatorFeedAdmin.test.mjs tests/ctraderOverlayApi.test.mjs`

Expected: all focused tests pass.

### Task 3: Verification and deployment

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: completed helper and admin UI.
- Produces: verified production deployment from `main`.

- [ ] **Step 1: Add a changelog entry**

Record that the Indicator Licensing admin can securely generate and copy personal cTrader tokens before rotation.

- [ ] **Step 2: Run mandatory verification**

Run:

```bash
/opt/homebrew/bin/python3.11 check_dupes.py
node --test tests/indicatorTokenGenerator.test.mjs tests/indicatorFeedAdmin.test.mjs tests/ctraderOverlayApi.test.mjs tests/ctraderOverlay.test.mjs tests/ctraderOverlaySource.test.mjs
npx next build
```

Expected: duplicate check passes, focused tests have zero failures, and the Next.js production build completes successfully.

- [ ] **Step 3: Commit and push**

Stage only the helper, tests, admin page, changelog, and this plan. Commit with `add-ctrader-token-generator-copy`, then push `origin main` without force.

- [ ] **Step 4: Verify production**

Wait for the matching `panda-dashboard` Vercel production deployment to reach `READY` with a build duration greater than 20 seconds, then confirm the admin route remains protected without a session.

# Funded Challenge Guardian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Panda Engine account guardian for the FundedNext phase-one challenge that monitors drawdown, blocks unsafe automation, finds engine-only A setups, plots PB orders, and allows INTRA execution only behind hard risk gates.

**Architecture:** cTrader MCP is local-only, so a local agent must run beside cTrader and write account snapshots to Supabase. Vercel dashboard pages read Supabase snapshots and never call `127.0.0.1`. Execution stays disabled by default and can only run when account guardian status is `GREEN`.

**Tech Stack:** Node.js scripts, Next.js pages/API routes, Supabase shared client, cTrader MCP HTTP endpoint, existing Panda dashboard data, existing `lib/engineSetups.mjs`.

---

## Current Account Baseline

From screenshots and read-only cTrader MCP pull on 2026-06-11:

- Balance: `$48,060.21`
- Equity: `$47,568.17`
- Total challenge P/L: `-$1,939.79`
- Floating P/L: about `-$492`
- Daily loss used: `$592.46`
- Daily remaining room: `$1,907.54`
- Maximum loss remaining room: `$2,572.13`
- Profit target: `$4,000`
- Open positions: `5`
- Open positions without SL: `3`
- Pending orders: `2`

Guardian default status must be `RED` while any open position has no SL.

---

## File Structure

- Create `lib/accountGuardian.mjs`: pure risk calculations, status classifier, execution gates.
- Create `tests/accountGuardian.test.mjs`: TDD coverage for drawdown, missing SL blocker, sizing caps, and execution gate decisions.
- Create `tools/account-guardian-agent.mjs`: local read-only cTrader MCP poller that writes sanitized snapshots to Supabase.
- Create `pages/api/account-guardian.js`: authenticated dashboard API that reads latest Supabase snapshot.
- Create `pages/account-guardian.js`: dashboard page for drawdown, open risk, rule status, and recovery mode.
- Modify `pages/dashboard.js`: add an admin/header button to the account guardian page.
- Modify `tools/plot-engine-pb.mjs`: refuse plotting if guardian status is not `GREEN` unless `--dry-run`.
- Later only after explicit Boss-G approval: create `tools/engine-execution-agent.mjs` with execution disabled by default.

---

### Task 1: Account Guardian Pure Risk Module

**Files:**
- Create: `lib/accountGuardian.mjs`
- Test: `tests/accountGuardian.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyGuardianStatus,
  computeChallengeRisk,
} from '../lib/accountGuardian.mjs';

test('computeChallengeRisk calculates daily and max loss buffers', () => {
  const risk = computeChallengeRisk({
    balance: 48060.21,
    equity: 47568.17,
    dailyLossLimit: 2500,
    dailyLossUsed: 592.46,
    maxLossLimit: 5000,
    maxLossUsed: 2427.87,
    profitTarget: 4000,
  });

  assert.equal(risk.dailyRemaining, 1907.54);
  assert.equal(risk.maxLossRemaining, 2572.13);
  assert.equal(risk.toProfitTarget, 4000);
  assert.equal(risk.equityDrawdownPct, 4.86);
});

test('classifyGuardianStatus is RED when any position has no stop loss', () => {
  const status = classifyGuardianStatus({
    risk: { dailyRemaining: 1907.54, maxLossRemaining: 2572.13 },
    positions: [
      { id: 1, symbolName: 'AUDJPY', netProfit: -399.43, stopLoss: null },
      { id: 2, symbolName: 'AUDUSD', netProfit: -4.2, stopLoss: 0.70981 },
    ],
    pendingOrders: [],
  });

  assert.equal(status.state, 'RED');
  assert.ok(status.blockers.includes('OPEN_POSITION_WITHOUT_SL'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/accountGuardian.test.mjs`

Expected: FAIL because `lib/accountGuardian.mjs` does not exist.

- [ ] **Step 3: Implement minimal module**

Implement exported functions:

```js
function money(n) { return Math.round(Number(n || 0) * 100) / 100; }

export function computeChallengeRisk(input) {
  const dailyRemaining = money(input.dailyLossLimit - input.dailyLossUsed);
  const maxLossRemaining = money(input.maxLossLimit - input.maxLossUsed);
  const startingBalance = 50000;
  return {
    balance: money(input.balance),
    equity: money(input.equity),
    dailyRemaining,
    maxLossRemaining,
    toProfitTarget: money(input.profitTarget),
    equityDrawdownPct: money(((startingBalance - input.equity) / startingBalance) * 100),
  };
}

export function classifyGuardianStatus({ risk, positions, pendingOrders }) {
  const blockers = [];
  if ((positions || []).some(p => p.stopLoss == null)) blockers.push('OPEN_POSITION_WITHOUT_SL');
  if (risk.dailyRemaining < 1000) blockers.push('DAILY_BUFFER_UNDER_1000');
  if (risk.maxLossRemaining < 1500) blockers.push('MAX_LOSS_BUFFER_UNDER_1500');
  return {
    state: blockers.length ? 'RED' : 'GREEN',
    blockers,
    openPositions: (positions || []).length,
    pendingOrders: (pendingOrders || []).length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/accountGuardian.test.mjs`

Expected: PASS.

---

### Task 2: Supabase Snapshot Schema

**Files:**
- Create: `supabase/account_guardian_snapshots.sql`

- [ ] **Step 1: Add migration file**

```sql
create table if not exists account_guardian_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  balance numeric,
  equity numeric,
  net_profit numeric,
  daily_loss_limit numeric,
  daily_loss_used numeric,
  daily_remaining numeric,
  max_loss_limit numeric,
  max_loss_used numeric,
  max_loss_remaining numeric,
  profit_target numeric,
  open_positions jsonb not null default '[]'::jsonb,
  pending_orders jsonb not null default '[]'::jsonb,
  guardian_state text not null,
  blockers jsonb not null default '[]'::jsonb
);

create index if not exists account_guardian_snapshots_created_idx
on account_guardian_snapshots (created_at desc);
```

- [ ] **Step 2: Apply migration manually in Supabase SQL editor**

Do not assume the table exists. Verify it appears before writing the local agent.

---

### Task 3: Local Account Guardian Agent

**Files:**
- Create: `tools/account-guardian-agent.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write local script**

The script must:

- load `.env`
- call cTrader MCP read-only tools: `get_balance`, `get_positions`, `get_pending_orders`
- use `computeChallengeRisk` and `classifyGuardianStatus`
- insert one row into `account_guardian_snapshots`
- never call trade tools

- [ ] **Step 2: Add package script**

```json
"account:guardian": "node tools/account-guardian-agent.mjs"
```

- [ ] **Step 3: Run locally**

Run: `npm run account:guardian`

Expected: prints `guardian_state=RED` while missing SL positions exist.

---

### Task 4: Dashboard API

**Files:**
- Create: `pages/api/account-guardian.js`

- [ ] **Step 1: Write authenticated API**

Use `validateSession` from `../../lib/auth` and `supabase` from `../../lib/supabase`. Select the newest row from `account_guardian_snapshots`. Return `401` without session.

- [ ] **Step 2: Test auth behavior**

Run: `npx next build`

Expected: build passes. Browser call without session returns `401`.

---

### Task 5: Account Guardian Page

**Files:**
- Create: `pages/account-guardian.js`
- Modify: `pages/dashboard.js`

- [ ] **Step 1: Create page**

Render:

- Guardian state: `RED`, `YELLOW`, `GREEN`
- Daily remaining
- Max loss remaining
- Equity
- Floating P/L
- open positions table
- missing SL blockers
- pending orders table
- current mode: `RECOVERY`, `NORMAL`, or `LOCKED`

- [ ] **Step 2: Add dashboard button**

Add an admin/VIP-visible header button labeled `GUARDIAN` linking to `/account-guardian`.

- [ ] **Step 3: Build**

Run: `npx next build`

Expected: build passes.

---

### Task 6: Execution Policy

**Files:**
- Modify: `tools/plot-engine-pb.mjs`
- Later create: `tools/engine-execution-agent.mjs`

- [ ] **Step 1: Add guardian gate to plotter**

Before plotting, read the newest guardian snapshot. If `guardian_state !== "GREEN"` and not `--dry-run`, print blockers and exit non-zero.

- [ ] **Step 2: Define execution policy, disabled by default**

Execution is allowed only when all are true:

- guardian state is `GREEN`
- no open position lacks SL
- daily remaining >= `$1,500`
- max loss remaining >= `$2,000`
- total open risk <= `$500`
- no correlated duplicate exposure
- signal is engine-valid
- `INTRA` only during 22:00-23:59 UTC
- `INTRA` requires gap >= 9 and PL confirmed
- `BB` uses pending PB limit order only, not market execution

Do not enable live order placement until Boss-G explicitly confirms.

---

## Strategy Recommendation

Use `RECOVERY MODE` until the account is back near `$49,000+` equity and every open position has SL:

- No market orders.
- No new trades while any open trade lacks SL.
- Prioritize reducing unmanaged risk before chasing profit target.
- Use BB only as pending pullback limit orders at engine PB entries.
- Use INTRA only in the engine window with gap >= 9 and PL confirmation.
- Hold window: 4-12 hours only when the gap remains valid and drawdown gates remain green.
- Hard stop automation if daily remaining falls under `$1,500` or max-loss remaining under `$2,000`.

This is an engineering risk policy for the challenge, not a guarantee of profitability.

---

## Verification

Run before any push:

```powershell
node --test tests/accountGuardian.test.mjs
node --test tests/engineSetups.test.mjs
py -3.11 check_dupes.py
npx next build
git status --short
```

Confirm load-bearing files are not staged for deletion:

- `package.json`
- `package-lock.json`
- `vercel.json`
- `next.config.js`

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const removedGuardianFiles = [
  'pages/guardian.js',
  'pages/account-guardian.js',
  'pages/api/account-guardian.js',
  'pages/api/guardian-execute.js',
  'pages/api/run-command.js',
  'pages/api/watchdog.js',
  'tools/account-guardian-agent.mjs',
  'tools/autonomous-loop.mjs',
  'guardian-watchdog.bat',
  'supabase/account_guardian_snapshots.sql',
];

const removedHermesFiles = [
  'HERMES_HANDOFF.md',
  'HERMES_INSTRUCTIONS.md',
  'HERMES_PHASE1_DATA.md',
  'docs/HERMES_AGENT_HANDOFF_PROMPT.md',
  'docs/HERMES_KNOWLEDGE_PACK.md',
];

test('unused Guardian runtime and Hermes handoff files are removed', () => {
  for (const file of [...removedGuardianFiles, ...removedHermesFiles]) {
    assert.equal(existsSync(file), false, `${file} must be removed`);
  }
});

test('active application surfaces no longer advertise Guardian or Hermes', () => {
  const dashboard = readFileSync('pages/dashboard.js', 'utf8');
  const visibility = readFileSync('lib/pageVisibility.mjs', 'utf8');
  const packageJson = readFileSync('package.json', 'utf8');
  const app = readFileSync('app.py', 'utf8');

  assert.doesNotMatch(dashboard, /\/guardian/);
  assert.doesNotMatch(visibility, /guardian/);
  assert.doesNotMatch(packageJson, /account:guardian|auto:loop/);
  assert.doesNotMatch(app, /HERMES FEED|\/api\/hermes\/feed|HERMES_SECRET/);
});

test('execution risk gates remain available after removing the Guardian product', () => {
  assert.equal(existsSync('lib/accountGuardian.mjs'), true);
  assert.equal(existsSync('lib/tradeExecutor.mjs'), true);
  assert.match(readFileSync('tools/execute-engine-pb.mjs', 'utf8'), /accountGuardian\.mjs/);
});

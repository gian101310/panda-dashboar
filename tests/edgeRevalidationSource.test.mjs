import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI prompt and public portfolio do not present retired 91/0 claims as current', async () => {
  const [aiChat, portfolio] = await Promise.all([
    readFile(new URL('../pages/api/ai-chat.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/portfolio.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(aiChat, /BB gap 7 \+ Panda Lines confirmed: 91% win rate/);
  assert.doesNotMatch(portfolio, /identified a 91% win rate/);
  assert.doesNotMatch(portfolio, /91% win rate on a specific setup/);
  assert.match(aiChat, /weekly_edge_revalidation/);
});

test('weekly cron is configured without modifying the repository guardrail', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.ignoreCommand, '[ ! -f lib/accountGuardian.mjs ]');
  assert.ok(config.crons.some((cron) => cron.path === '/api/cron/edge-revalidation' && cron.schedule === '0 2 * * 1'));
});

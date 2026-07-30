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

test('weekly edge job uses the secured GitHub scheduler without modifying the repository guardrail', async () => {
  const [config, workflow] = await Promise.all([
    readFile(new URL('../vercel.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../.github/workflows/panda-safety-monitor.yml', import.meta.url), 'utf8'),
  ]);
  assert.equal(config.ignoreCommand, '[ ! -f lib/accountGuardian.mjs ]');
  assert.equal(config.crons, undefined);
  assert.match(workflow, /cron: ['"]0 2 \* \* 1['"]/);
  assert.match(workflow, /\/api\/cron\/edge-revalidation/);
  assert.match(workflow, /secrets\.PANDA_CRON_SECRET/);
});

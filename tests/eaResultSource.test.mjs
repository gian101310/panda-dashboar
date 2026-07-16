import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('EA result uses shared Supabase and one atomic ticket upsert', async () => {
  const source = await readFile(new URL('../pages/api/ea-result.js', import.meta.url), 'utf8');

  assert.match(source, /import \{ supabase \} from '\.\.\/\.\.\/lib\/supabase'/);
  assert.doesNotMatch(source, /createClient/);
  assert.doesNotMatch(source, /\.eq\('ticket', String\(ticket\)\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(source, /\.upsert\([\s\S]*\{ onConflict: 'ticket' \}\)/);
  assert.match(source, /\.select\('id'\)[\s\S]*\.single\(\)/);
});

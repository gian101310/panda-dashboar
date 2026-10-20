import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = 'panda-indicators/2026-10-16/panda-trade-plan';
const dashboard = readFileSync(`${root}/PandaTradePlan.Dashboard.cs`, 'utf8');
const host = readFileSync(`${root}/PandaTradePlan.cs`, 'utf8');
const rules = readFileSync(`${root}/PanelLayoutRules.cs`, 'utf8');

test('v1.3 dashboard matches Panda overlay expanded and compact dimensions', () => {
  assert.match(rules, /return minimized\?210:260;/);
  assert.match(host, /_dashboardRoot\.Width=PanelLayoutRules\.DashboardWidth\(_minimized\)/);
  assert.match(dashboard, /Width=PanelLayoutRules\.DashboardWidth\(_minimized\)/);
});

test('v1.3 minimize hides rows and shows one compact score line', () => {
  assert.match(host, /_dashboardBody\.IsVisible=PanelLayoutRules\.ShowDashboardBody\(_minimized\)/);
  assert.match(host, /_dashboardCompact\.IsVisible=PanelLayoutRules\.ShowDashboardCompact\(_minimized\)/);
  assert.match(dashboard, /_dashboardCompact\.Text=score\+"  "\+SafeDashboard\(pair\?\.Bias\)\+"  "\+status/);
});

test('v1.3 dashboard uses the Panda overlay header and row format', () => {
  assert.match(dashboard, /new Grid\(1,3\)\{Margin=7\}/);
  assert.match(dashboard, /_chartPair\+" · PANDA"/);
  for (const row of ['SCORE', 'BASE XTF', 'QUOTE XTF', 'BIAS', 'BOX H4', 'BOX H1', 'PANDA LINES', 'XTF']) {
    assert.match(dashboard, new RegExp(`AddDashboardRow\\("${row}"`));
  }
});

const sites = ['https://pandaengine.app', 'https://www.pandaengine.app'];
const count = document.getElementById('count');
const status = document.getElementById('status');
const pairs = document.getElementById('pairs');
const empty = document.getElementById('empty');
const refresh = document.getElementById('refresh');
const dashboard = document.getElementById('dashboard');

function ageLabel(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return { text: 'Time unavailable', stale: true };
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  return { text: minutes < 1 ? 'Just updated' : `${minutes} min ago`, stale: minutes > 15 };
}

function detail(label, value) {
  const line = document.createElement('div');
  line.className = 'detail';
  const heading = document.createElement('span');
  heading.className = 'detail-label';
  heading.textContent = label;
  const content = document.createElement('span');
  content.className = 'detail-value';
  content.textContent = value;
  line.append(heading, content);
  return line;
}

function shortBox(value) {
  return { UPTREND: 'UP', DOWNTREND: 'DOWN', RANGING: 'RANGE', UNKNOWN: '—' }[value] || '—';
}

function showMessage(message, login = false) {
  pairs.replaceChildren();
  count.textContent = '—';
  status.textContent = login ? 'Sign in required' : 'Unable to load';
  empty.replaceChildren(document.createTextNode(message));
  if (login) {
    const link = document.createElement('a');
    link.href = 'https://pandaengine.app/login';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open Panda login ↗';
    empty.append(document.createElement('br'), link);
  }
  empty.hidden = false;
}

async function findSessions() {
  const sessions = [];
  for (const site of sites) {
    const cookie = await chrome.cookies.get({ url: site, name: 'panda_session' });
    if (cookie?.value) sessions.push({ site, token: cookie.value });
  }
  return sessions;
}

async function loadPairs() {
  refresh.disabled = true;
  status.textContent = 'Refreshing…';
  let stage = 'reading Chrome session';
  try {
    const sessions = await findSessions();
    if (!sessions.length) return showMessage('Sign in to Panda Engine in Chrome, then press refresh.', true);
    let response;
    for (const session of sessions) {
      stage = `requesting pairs from ${new URL(session.site).hostname}`;
      response = await fetch(`${session.site}/api/extension-valid-pairs`, {
        headers: { Authorization: `Bearer ${session.token}` },
        cache: 'no-store',
        credentials: 'omit',
      });
      if (response.status !== 401) {
        dashboard.href = `${session.site}/dashboard`;
        break;
      }
    }
    if (response.status === 401) return showMessage('Your Panda session has expired. Sign in again, then refresh.', true);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    stage = 'reading pair response';
    const result = await response.json();
    if (!Array.isArray(result.pairs)) throw new Error('Invalid pair response');

    pairs.replaceChildren();
    empty.hidden = true;
    count.textContent = String(result.pairs.length);
    status.textContent = 'Live valid pairs · gap ≥ 5';
    if (!result.pairs.length) {
      empty.textContent = 'No valid pairs in the current Panda data.';
      empty.hidden = false;
      return;
    }
    for (const pair of result.pairs) {
      const gap = Number(pair.gap);
      const bias = gap >= 5 ? 'BUY' : 'SELL';
      const age = ageLabel(pair.updated_at);
      const card = document.createElement('article');
      card.className = `pair${age.stale ? ' stale' : ''}`;
      card.style.setProperty('--tone', Math.abs(gap) < 7 ? '#ffd166' : bias === 'BUY' ? '#00ff9f' : '#ff4d6d');
      const top = document.createElement('div');
      top.className = 'pair-top';
      const symbol = document.createElement('span');
      symbol.className = 'symbol';
      symbol.textContent = pair.symbol;
      const score = document.createElement('span');
      score.className = 'gap';
      score.textContent = `${gap > 0 ? '+' : ''}${gap}`;
      top.append(symbol, score);
      const bottom = document.createElement('div');
      bottom.className = 'pair-bottom';
      const direction = document.createElement('span');
      direction.className = 'bias';
      direction.textContent = bias;
      const timestamp = document.createElement('span');
      timestamp.className = 'age';
      timestamp.textContent = age.stale ? `STALE · ${age.text}` : age.text;
      bottom.append(direction, timestamp);
      const details = document.createElement('div');
      details.className = 'details';
      details.append(
        detail('BOX', `H1 ${shortBox(pair.box_h1)} · H4 ${shortBox(pair.box_h4)}`),
        detail('XTF', pair.xtf || 'NONE'),
        detail('PL', `${pair.pl_status || 'UNVERIFIED'} · ${pair.pl_verdict || 'N/A'}`),
      );
      card.append(top, bottom, details);
      pairs.append(card);
    }
  } catch (error) {
    showMessage(`Load failed while ${stage}: ${error?.message || 'Unknown error'}`);
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener('click', loadPairs);
loadPairs();
setInterval(loadPairs, 5 * 60_000);

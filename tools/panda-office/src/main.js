import { createPixelOffice } from './pixelOffice.js';
import './style.css';

const roles = [
  { id: 'ceo', name: 'Mr. Slate', title: 'CEO · Cave Chief', desk: 'command', short: 'MS', color: '#efc572', skin: '#e7b48b', hair: '#5e403b', clothes: '#587795' },
  { id: 'scoring', name: 'Barney', title: 'Scoring Staff', desk: 'scoring', short: 'BA', color: '#89e7a9', skin: '#f0c699', hair: '#b68d4b', clothes: '#846ab6' },
  { id: 'snapshot', name: 'Wilma', title: 'Snapshot Manager', desk: 'snapshot', short: 'WI', color: '#9de5ff', skin: '#f3c69d', hair: '#e67c54', clothes: '#eee3d3' },
  { id: 'alerts', name: 'Betty', title: 'Alerts Manager', desk: 'alerts', short: 'BE', color: '#ffab89', skin: '#ecc09c', hair: '#3c2c31', clothes: '#8ac4d8' },
  { id: 'telegram', name: 'Pebbles', title: 'Telegram Staff', desk: 'telegram', short: 'PE', color: '#b9a3ff', skin: '#f3c398', hair: '#e98356', clothes: '#70c1b3' },
  { id: 'checker', name: 'Gazoo', title: 'Send Check Staff', desk: 'checker', short: 'GA', color: '#e1f89f', skin: '#a7dc8b', hair: '#6baf60', clothes: '#91cd71' },
  { id: 'licensing', name: 'Fred', title: 'Licensing Manager', desk: 'licensing', short: 'FR', color: '#ffc879', skin: '#e9ae82', hair: '#282733', clothes: '#e78c5a' },
  { id: 'lines', name: 'Bamm-Bamm', title: 'Panda Lines Staff', desk: 'lines', short: 'BB', color: '#f0a1c1', skin: '#f4c99f', hair: '#e7e2ca', clothes: '#b285ad' },
  { id: 'previous', name: 'Dino', title: 'Previous Day Staff', desk: 'previous', short: 'DI', color: '#eaa1ef', skin: '#d888c7', hair: '#b867af', clothes: '#d888c7', dinosaur: true },
];
const statusColors = { ready: '#78e9ad', working: '#90d8ff', warning: '#ffd071', unavailable: '#9b9bab', idle: '#aeb6bd', visual: '#d7a8f2' };
const app = document.getElementById('app');
app.innerHTML = `<header class="topbar"><div class="brand"><div class="mark">P</div><div><strong>PANDA CAVE HQ</strong><small>Live process map</small></div></div><div class="top-actions"><span class="chip"><i class="dot" id="connection-dot"></i><b id="connection-label">Connecting</b></span><span class="chip local">LOCAL · READ ONLY</span><button class="view-btn active" id="overview">Overview</button><button class="view-btn" id="focus">Focus room</button></div></header><main class="layout"><section class="stage" id="stage"><div class="stage-heading"><h1>The Panda Cave</h1><p>Stone Age crew. Live Panda evidence. Select a character to inspect their desk.</p></div><div class="office-wrap"><div class="office-art" id="office-art"><img src="/stone-age-hq.png" alt="Pixel art Stone Age headquarters with eight work rooms around a central cave" draggable="false"><canvas id="office-canvas" width="768" height="512" aria-label="Animated characters moving between Panda work rooms"></canvas><div class="room-badges" id="room-badges"></div></div></div><div class="stage-bottom"><div class="hint">Characters walk on ambient routes · <strong>Live status comes from Panda</strong></div></div><div class="scene-status" id="scene-status">Loading live status…</div></section><aside class="sidebar"><div class="side-head"><h2>Cave crew</h2><p id="updated">Waiting for live sources</p></div><div class="side-body"><div class="section-title">Characters <em id="worker-count">09</em></div><div class="worker-list" id="worker-list"></div><div class="detail" id="detail"></div><div class="section-title">Activity feed <em id="event-count">0</em></div><div class="events" id="events"></div></div><div class="footer">Viewer only · No commands or AI calls · <b>127.0.0.1</b></div></aside></main>`;

let state = { agents: [], events: [] };
let selected = 'ceo';
const sourceRoles = roles.filter((role) => role.id !== 'ceo');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const time = (value) => { if (!value) return 'No event'; const date = new Date(value); return Number.isNaN(+date) ? 'Unknown' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const statusColor = (status) => statusColors[status] || statusColors.unavailable;
const office = createPixelOffice({ canvas: document.getElementById('office-canvas'), art: document.getElementById('office-art'), roles, onSelect: select });

function records() {
  const observed = new Map((state.agents || []).map((agent) => [agent.id, agent]));
  const connected = sourceRoles.filter((role) => observed.get(role.id)?.status !== 'unavailable' && observed.has(role.id)).length;
  return roles.map((role) => role.id === 'ceo' ? {
    id: 'ceo', label: 'Mr. Slate', status: 'visual',
    activity: `${connected}/${sourceRoles.length} Panda sources connected`, at: state.updatedAt,
    source: 'Office overview', detail: 'Visual coordinator only. No autonomous CEO agent or command authority is connected.',
  } : observed.get(role.id) || {
    id: role.id, label: role.name, status: 'unavailable', activity: 'Connecting to live source', at: null, source: 'Waiting', detail: '',
  });
}
function renderHUD() {
  const people = records();
  document.getElementById('worker-list').innerHTML = people.map((agent) => {
    const role = roles.find((item) => item.id === agent.id);
    return `<button class="worker ${selected === agent.id ? 'selected' : ''}" data-id="${role.id}" style="--accent:${role.color};--status:${statusColor(agent.status)}"><span class="worker-icon">${role.short}</span><span class="worker-main"><strong>${escapeHtml(role.name)}</strong><small>${escapeHtml(role.title)} · ${escapeHtml(agent.activity)}</small></span><span class="status">${escapeHtml(agent.status)}</span></button>`;
  }).join('');
  const agent = people.find((item) => item.id === selected) || people[0];
  const role = roles.find((item) => item.id === agent.id);
  document.getElementById('detail').style.setProperty('--status', statusColor(agent.status));
  document.getElementById('detail').innerHTML = `<div class="detail-top"><div><strong class="detail-title">${escapeHtml(role.name)}</strong><span class="detail-role">${escapeHtml(role.title)}</span></div><span class="detail-status">${escapeHtml(agent.status)}</span></div><p>${escapeHtml(agent.activity)}</p><div class="detail-meta">Last evidence: <strong>${escapeHtml(time(agent.at))}</strong><br>Source: <strong>${escapeHtml(agent.source)}</strong></div><div class="detail-note">${escapeHtml(agent.detail || 'Read-only observation')}</div>`;
  document.getElementById('events').innerHTML = state.events?.length ? state.events.map((event) => `<div class="event" style="--event-color:${event.kind === 'warning' ? '#ffd071' : event.kind === 'success' ? '#78e9ad' : '#9dbdff'}"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(time(event.at))} · ${escapeHtml(event.source)}</span></div>`).join('') : '<div class="empty">No verified events available yet.</div>';
  document.getElementById('event-count').textContent = String(state.events?.length || 0);
  document.getElementById('worker-count').textContent = String(roles.length).padStart(2, '0');
  document.getElementById('updated').textContent = state.updatedAt ? `Updated ${time(state.updatedAt)} · 15 second refresh` : 'Connecting to live sources';
  const connected = sourceRoles.filter((item) => people.find((person) => person.id === item.id)?.status !== 'unavailable').length;
  document.getElementById('scene-status').textContent = `${connected}/${sourceRoles.length} live sources connected`;
  document.getElementById('connection-label').textContent = connected ? 'Live observer' : 'Sources unavailable';
  document.getElementById('connection-dot').className = `dot ${connected ? '' : 'unavailable'}`;
  document.querySelectorAll('.worker').forEach((button) => button.addEventListener('click', () => select(button.dataset.id)));
  office.setRecords(people);
}
function select(id) {
  if (!roles.some((role) => role.id === id)) return;
  selected = id;
  office.select(id);
  renderHUD();
}
document.getElementById('overview').addEventListener('click', () => {
  office.setView('overview');
  document.getElementById('overview').classList.add('active');
  document.getElementById('focus').classList.remove('active');
});
document.getElementById('focus').addEventListener('click', () => {
  office.setView('focus');
  document.getElementById('focus').classList.add('active');
  document.getElementById('overview').classList.remove('active');
});
async function refresh() {
  try {
    const response = await fetch('/api/office', { cache: 'no-store' });
    if (!response.ok) throw new Error('Observer unavailable');
    state = await response.json();
    renderHUD();
  } catch {
    document.getElementById('connection-label').textContent = 'Observer disconnected';
    document.getElementById('connection-dot').className = 'dot unavailable';
    document.getElementById('scene-status').textContent = 'Observer disconnected';
    office.setRecords([]);
  }
}
renderHUD();
refresh();
setInterval(refresh, 15000);

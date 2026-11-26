// Character motion is ambient. Only the supplied records determine live status.
const stations = {
  scoring: { seat: [130, 124], stand: [157, 133], door: [218, 173], roam: [322, 224], badge: [18, 8], bounds: [0, 0, 255, 170] },
  snapshot: { seat: [386, 124], stand: [415, 132], door: [386, 175], roam: [402, 214], badge: [35, 8], bounds: [256, 0, 256, 170] },
  alerts: { seat: [642, 124], stand: [615, 132], door: [554, 173], roam: [455, 224], badge: [72, 8], bounds: [512, 0, 256, 170] },
  telegram: { seat: [121, 289], stand: [153, 289], door: [211, 268], roam: [313, 267], badge: [3, 38], bounds: [0, 170, 210, 190] },
  licensing: { seat: [646, 289], stand: [612, 289], door: [557, 268], roam: [454, 268], badge: [75, 38], bounds: [558, 170, 210, 190] },
  checker: { seat: [127, 451], stand: [157, 432], door: [224, 359], roam: [326, 318], badge: [6, 75], bounds: [0, 360, 255, 152] },
  lines: { seat: [384, 451], stand: [412, 430], door: [384, 358], roam: [398, 318], badge: [37, 75], bounds: [256, 360, 256, 152] },
  previous: { seat: [640, 451], stand: [613, 431], door: [545, 358], roam: [452, 318], badge: [70, 75], bounds: [512, 360, 256, 152] },
  command: { seat: [383, 272], stand: [382, 272], door: [342, 245], roam: [428, 266], badge: [39, 44], bounds: [215, 170, 338, 190] },
};
const statusColors = { ready: '#73edaf', working: '#97dcff', warning: '#ffd073', unavailable: '#aeb0bf', idle: '#b7c1c9', visual: '#d7a8f2' };
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const lerp = (a, b, t) => a + (b - a) * t;

function motion(role, index, seconds) {
  const station = stations[role.desk];
  if (motionQuery.matches) return { x: station.seat[0], y: station.seat[1], walking: false, seated: role.id !== 'ceo' };
  const cycle = 31;
  const phase = ((seconds + index * 3.8) % cycle + cycle) % cycle;
  const drift = index % 2 ? 19 : -19;
  const away = role.id === 'ceo' ? [station.roam[0], station.roam[1]] : [station.roam[0] + drift, station.roam[1] + (index % 3 - 1) * 13];
  const points = role.id === 'ceo' ? [
    [0, station.seat], [4, station.seat], [10, station.door], [16, away], [21, [370, 310]], [26, station.door], [31, station.seat],
  ] : [
    [0, station.seat], [5, station.seat], [7, station.stand], [11, station.door], [15, away], [19, away], [23, station.door], [27, station.stand], [29, station.seat], [31, station.seat],
  ];
  let left = points[0], right = points[1];
  for (let i = 1; i < points.length; i++) if (phase <= points[i][0]) { left = points[i - 1]; right = points[i]; break; }
  const t = right[0] === left[0] ? 0 : (phase - left[0]) / (right[0] - left[0]);
  return {
    x: lerp(left[1][0], right[1][0], t), y: lerp(left[1][1], right[1][1], t),
    walking: left[1][0] !== right[1][0] || left[1][1] !== right[1][1],
    seated: role.id !== 'ceo' && (phase < 5 || phase >= 29),
  };
}

function block(ctx, color, x, y, w, h) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function drawCharacter(ctx, role, position, seconds, status, selected) {
  const walk = position.walking ? Math.sin(seconds * 12 + role.name.length) : 0;
  const bob = position.walking ? Math.abs(walk) * 1.5 : Math.sin(seconds * 2 + role.name.length) * .35;
  const blink = Math.sin(seconds * .85 + role.name.length * 1.7) > .988;
  const scale = position.seated ? 1.55 : 1.8;
  ctx.save();
  ctx.translate(Math.round(position.x), Math.round(position.y - bob));
  ctx.scale(scale, scale);
  // The feet anchor the character to the stone floor, even while walking.
  ctx.fillStyle = '#25122b88'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 3.1, 0, 0, Math.PI * 2); ctx.fill();
  if (position.seated) { block(ctx, '#5e4d6c', -11, -17, 22, 18); block(ctx, '#a591ab', -9, -16, 18, 3); }
  if (selected) { ctx.strokeStyle = '#fff3a1'; ctx.lineWidth = 1.5; ctx.strokeRect(-14, -36, 28, 39); }
  if (role.dinosaur) {
    block(ctx, '#8c4e87', -10, -19, 19, 15);
    block(ctx, role.clothes, -11, -21, 22, 14);
    block(ctx, '#f0b6d8', -12, -27, 22, 13);
    block(ctx, role.skin, -8, -31, 17, 13);
    block(ctx, '#ad6ca7', 4, -19, 11, 5);
    block(ctx, '#f8cee5', 11, -16, 5, 2);
    block(ctx, '#df9ac7', -7, -35, 6, 5);
    block(ctx, '#df9ac7', 3, -35, 6, 5);
    block(ctx, '#402b44', -3, -28, 2, blink ? 1 : 3);
    block(ctx, '#402b44', 6, -28, 2, blink ? 1 : 3);
    block(ctx, '#f7d1e8', -10, -2 + walk, 7, 3);
    block(ctx, '#f7d1e8', 4, -2 - walk, 7, 3);
  } else {
    const leg = position.seated ? 0 : walk * 2;
    block(ctx, '#342d3c', -8, -9 + leg, 6, 10 - Math.max(0, leg));
    block(ctx, '#342d3c', 3, -9 - leg, 6, 10 + Math.min(0, leg));
    block(ctx, '#2b2636', -9, 0 + leg, 8, 3);
    block(ctx, '#2b2636', 2, 0 - leg, 8, 3);
    block(ctx, role.clothes, -10, -22, 20, 16);
    block(ctx, '#ffffff33', -7, -20, 4, 9);
    block(ctx, role.skin, -13, -20 + walk * 2, 4, 11);
    block(ctx, role.skin, 10, -20 - walk * 2, 4, 11);
    block(ctx, role.skin, -10, -34, 20, 15);
    block(ctx, role.hair, -11, -36, 22, 7);
    block(ctx, role.hair, -11, -33, 4, 10);
    block(ctx, role.hair, 8, -33, 4, 9);
    if (role.id === 'ceo') { block(ctx, '#ded5c6', -12, -35, 24, 3); block(ctx, '#b9a88c', -7, -39, 14, 4); block(ctx, '#e9ca79', -1, -19, 3, 8); }
    if (role.id === 'checker') { block(ctx, '#6fa853', -11, -38, 22, 5); block(ctx, '#badf78', -5, -42, 10, 5); block(ctx, '#80b971', -2, -45, 4, 3); }
    if (role.id === 'scoring') { block(ctx, '#302b39', -5, -17, 5, 4); block(ctx, '#302b39', 4, -14, 4, 4); }
    if (role.id === 'licensing') { block(ctx, '#3b2d38', -5, -20, 5, 4); block(ctx, '#3b2d38', 3, -14, 4, 5); block(ctx, '#30303d', 2, -39, 8, 5); }
    if (role.id === 'snapshot') { block(ctx, '#e87855', 7, -39, 7, 8); block(ctx, '#f7ede9', -2, -18, 4, 4); block(ctx, '#f7ede9', 3, -18, 4, 4); }
    if (role.id === 'alerts') { block(ctx, '#81b9d6', 7, -37, 7, 5); block(ctx, '#34405c', -8, -19, 4, 3); }
    if (role.id === 'telegram') { block(ctx, '#e58a58', 5, -39, 9, 7); block(ctx, '#88c5b1', -8, -18, 16, 3); }
    if (role.id === 'lines') { block(ctx, '#3b2938', -5, -19, 4, 3); block(ctx, '#3b2938', 4, -14, 4, 3); block(ctx, '#f1e8ce', 6, -38, 3, 9); block(ctx, '#f1e8ce', 2, -41, 11, 3); }
    block(ctx, '#302738', -5, -28, 2, blink ? 1 : 3);
    block(ctx, '#302738', 4, -28, 2, blink ? 1 : 3);
    block(ctx, '#a9625d', -1, -23, 3, 1);
  }
  ctx.restore();
  if (selected) {
    ctx.font = 'bold 12px monospace';
    const width = Math.ceil(ctx.measureText(role.name).width) + 14;
    block(ctx, '#21162ce8', position.x - width / 2, position.y - 79, width, 19);
    ctx.fillStyle = '#fff2dc'; ctx.textAlign = 'center'; ctx.fillText(role.name, position.x, position.y - 65);
  }
  ctx.fillStyle = statusColors[status] || statusColors.unavailable;
  ctx.fillRect(Math.round(position.x + 15), Math.round(position.y - 66), 6, 6);
}

export function createPixelOffice({ canvas, art, roles, onSelect }) {
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = false;
  const badges = document.getElementById('room-badges');
  let selected = 'ceo';
  let view = 'overview';
  let records = new Map();
  let positions = new Map();
  badges.innerHTML = roles.map((role) => {
    const station = stations[role.desk];
    return `<button class="room-badge" data-id="${role.id}" style="left:${station.badge[0]}%;top:${station.badge[1]}%;--accent:${role.color}">${role.name}<span></span></button>`;
  }).join('');
  badges.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => onSelect(button.dataset.id)));
  function updateFocus() {
    const role = roles.find((item) => item.id === selected);
    const { seat } = stations[role.desk];
    art.classList.toggle('focused', view === 'focus');
    if (view === 'focus') {
      art.style.transformOrigin = `${seat[0] / 768 * 100}% ${seat[1] / 512 * 100}%`;
      art.style.transform = `translate(${(384 - seat[0]) / 768 * 100}%, ${(256 - seat[1]) / 512 * 100}%) scale(1.55)`;
    } else art.style.transform = '';
  }
  function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const seconds = now / 1000;
    const people = roles.map((role, index) => {
      const position = motion(role, index, seconds);
      positions.set(role.id, position);
      return { role, position };
    }).sort((a, b) => a.position.y - b.position.y);
    people.forEach(({ role, position }) => drawCharacter(ctx, role, position, seconds, records.get(role.id)?.status, selected === role.id));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 768;
    const y = (event.clientY - rect.top) / rect.height * 512;
    const near = roles.find((role) => { const point = positions.get(role.id); return point && Math.abs(x - point.x) < 25 && Math.abs(y - point.y + 25) < 38; });
    if (near) return onSelect(near.id);
    const room = roles.find((role) => { const [left, top, width, height] = stations[role.desk].bounds; return x >= left && x < left + width && y >= top && y < top + height; });
    if (room) onSelect(room.id);
  });
  return {
    setRecords(people) {
      records = new Map(people.map((person) => [person.id, person]));
      badges.querySelectorAll('button').forEach((button) => {
        const status = records.get(button.dataset.id)?.status || 'unavailable';
        button.style.setProperty('--status', statusColors[status] || statusColors.unavailable);
      });
    },
    select(id) {
      selected = id;
      badges.querySelectorAll('button').forEach((button) => button.classList.toggle('selected', button.dataset.id === id));
      updateFocus();
    },
    setView(next) { view = next; updateFocus(); },
  };
}

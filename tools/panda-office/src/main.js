import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import './style.css';

const roles = [
  { id: 'scoring', name: 'Scoring', short: 'SC', color: '#00ff9f', x: -9, z: -4.8, skin: '#bf8762', hair: '#172027', coat: '#1c5960' },
  { id: 'snapshot', name: 'Snapshot', short: 'SN', color: '#54d7ff', x: -3, z: -4.8, skin: '#d5a582', hair: '#2a1d1b', coat: '#3d647f' },
  { id: 'alerts', name: 'Alerts', short: 'AL', color: '#ffba66', x: 3, z: -4.8, skin: '#a96c4f', hair: '#1c1619', coat: '#713e4d' },
  { id: 'telegram', name: 'Telegram', short: 'TG', color: '#73aaff', x: 9, z: -4.8, skin: '#dfb494', hair: '#482b25', coat: '#285b78' },
  { id: 'checker', name: 'Send Check', short: 'CK', color: '#ffcb69', x: -9, z: 4.1, skin: '#bf8762', hair: '#172027', coat: '#665536' },
  { id: 'licensing', name: 'Licensing', short: 'LC', color: '#bc9aff', x: -3, z: 4.1, skin: '#a97559', hair: '#1a1e26', coat: '#524477' },
  { id: 'lines', name: 'Panda Lines', short: 'PL', color: '#84ee9c', x: 3, z: 4.1, skin: '#d2a27d', hair: '#40302b', coat: '#35634b' },
  { id: 'previous', name: 'Previous Day', short: 'PD', color: '#e7cc83', x: 9, z: 4.1, skin: '#c89275', hair: '#2c2628', coat: '#6e6142' },
];
const statusColors = { ready: '#00ff9f', working: '#58d8ff', warning: '#ffcb69', unavailable: '#738b90', idle: '#8ba5a8' };
const app = document.getElementById('app');
app.innerHTML = `<header class="topbar"><div class="brand"><div class="mark">P</div><div><strong>PANDA ENGINE</strong><small>Live process office</small></div></div><div class="top-actions"><span class="chip"><i class="dot" id="connection-dot"></i><b id="connection-label">Connecting</b></span><span class="chip">LOCAL · READ ONLY</span><button class="view-btn active" id="overview">Overview</button><button class="view-btn" id="street">Walk in</button></div></header><main class="layout"><section class="stage" id="stage"><div class="stage-heading"><span>Operations room / Windows host</span><h1>THE PANDA FLOOR</h1><p>Every status is tied to a Panda source. Choose a character to inspect the latest evidence.</p></div><div class="stage-bottom"><div class="hint"><strong>Drag</strong> orbit &nbsp;·&nbsp; <strong>Scroll</strong> zoom &nbsp;·&nbsp; <strong>Click</strong> inspect</div></div><div class="scene-status" id="scene-status">Loading live status…</div></section><aside class="sidebar"><div class="side-head"><h2>Operations</h2><p id="updated">Waiting for live sources</p></div><div class="side-body"><div class="section-title">Process workers <em id="worker-count">08</em></div><div class="worker-list" id="worker-list"></div><div class="detail" id="detail"></div><div class="section-title">Activity feed <em id="event-count">0</em></div><div class="events" id="events"></div></div><div class="footer">Viewer only · No commands or AI calls · <b>127.0.0.1</b></div></aside></main>`;

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.62;
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#071115');
scene.fog = new THREE.FogExp2('#071115', 0.017);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
camera.position.set(17, 17, 23);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 6;
controls.maxDistance = 58;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

const ambient = new THREE.HemisphereLight('#c9f9ff', '#18303b', 2.15); scene.add(ambient);
const sun = new THREE.DirectionalLight('#c5f7ec', 3.1); sun.position.set(-11, 22, 12); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -25; sun.shadow.camera.right = 25; sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25; sun.shadow.bias = -0.0002; scene.add(sun);
const warm = new THREE.PointLight('#ffb279', 55, 25, 2); warm.position.set(9, 6, -3); scene.add(warm);
const blue = new THREE.PointLight('#29cfff', 70, 26, 2); blue.position.set(-8, 5, 4); scene.add(blue);

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: .53, metalness: .16, ...opts });
const floorMat = mat('#24393f', { roughness: .83 });
const darkMetal = mat('#23343b', { metalness: .62, roughness: .3 });
const edgeMat = mat('#51dace', { emissive: '#009a8f', emissiveIntensity: .8, metalness: .42 });
function box(parent, w, h, d, material, x, y, z, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function sphere(parent, r, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent, r1, r2, h, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 12), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
}
function labelTexture(text, foreground = '#e8faf7', background = '#0c2026') {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = background; context.beginPath(); context.roundRect(4, 4, 504, 120, 20); context.fill();
  context.strokeStyle = '#42b7b3'; context.lineWidth = 5; context.stroke();
  context.fillStyle = foreground; context.font = 'bold 43px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text.toUpperCase(), 256, 65, 470);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function sign(parent, text, x, y, z, scale = 3.1) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale / 4), new THREE.MeshBasicMaterial({ map: labelTexture(text), transparent: true, side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}

// A game-like miniature city block surrounds the local operations room.
box(scene, 110, .25, 110, mat('#0b191d', { roughness: .96 }), 0, -.34, 0, false);
for (let i = 0; i < 22; i++) {
  const x = (i * 17.7 % 94) - 47;
  const z = -25 - (i % 4) * 11;
  const h = 7 + (i * 9 % 17);
  box(scene, 4.5 + i % 3, h, 5.5, mat(i % 3 === 0 ? '#18343c' : '#122930', { roughness: .75 }), x, h / 2 - .15, z, false);
  if (i % 2 === 0) for (let j = 0; j < 3; j++) box(scene, 2.6, .18, .07, mat('#54bdc0', { emissive: '#1e747b', emissiveIntensity: .75 }), x, 2.5 + j * 2.4, z + 2.79, false);
}
box(scene, 29, .32, 21.5, floorMat, 0, 0, 0);
box(scene, 30.3, .16, 22.8, darkMetal, 0, -.23, 0);
for (const x of [-14.5, 14.5]) box(scene, .10, .08, 21.5, edgeMat, x, .07, 0, false);
for (const z of [-10.75, 10.75]) box(scene, 29, .08, .1, edgeMat, 0, .07, z, false);
const glass = mat('#8ed5d5', { transparent: true, opacity: .15, roughness: .12, metalness: .18, depthWrite: false, side: THREE.DoubleSide });
const frontWall = new THREE.Group(); scene.add(frontWall);
for (const z of [-10.55, 10.55]) {
  const parent = z > 0 ? frontWall : scene;
  box(parent, 29, 3.45, .04, glass, 0, 1.72, z, false);
  box(parent, 29, .11, .13, darkMetal, 0, 3.48, z, false);
  for (let x = -14.5; x <= 14.5; x += 4.85) box(parent, .08, 3.4, .1, darkMetal, x, 1.7, z, false);
}
for (const x of [-14.45, 14.45]) {
  box(scene, .04, 3.45, 21, glass, x, 1.72, 0, false);
  box(scene, .13, .11, 21, darkMetal, x, 3.48, 0, false);
  for (let z = -10.5; z <= 10.5; z += 4.2) box(scene, .1, 3.4, .08, darkMetal, x, 1.7, z, false);
}
// Illuminated ceiling rails and floor lanes frame the room without hiding avatars.
for (const x of [-11.7, -5.8, 0, 5.8, 11.7]) {
  box(scene, .055, .025, 18.4, mat('#3cc8c0', { emissive: '#0d655f', emissiveIntensity: 1 }), x, .17, 0, false);
  box(scene, .06, .07, 19.1, edgeMat, x, 3.56, 0, false);
}
const wallSign = sign(scene, 'PANDA ENGINE · OPERATIONS', 0, 5.2, -10.8, 9.2); wallSign.material.depthTest = false;

function makeAvatar(role) {
  const root = new THREE.Group(); root.userData.agentId = role.id; scene.add(root);
  const skin = mat(role.skin, { roughness: .8 });
  const hair = mat(role.hair, { roughness: .95 });
  const clothes = mat(role.coat, { roughness: .82 });
  const trousers = mat('#15262c', { roughness: .9 });
  const shoe = mat('#0c1518', { roughness: .85 });
  const eye = mat('#111a1e');
  const body = new THREE.Group(); root.add(body);
  box(body, .76, 1.0, .44, clothes, 0, 1.37, 0);
  box(body, .2, .48, .48, mat('#f5f0e4'), 0, 1.36, .02);
  cylinder(body, .17, .18, .26, skin, 0, 1.99, 0);
  sphere(body, .36, skin, 0, 2.27, .035, .92, 1.07, .82);
  sphere(body, .37, hair, 0, 2.55, -.015, .99, .48, .91);
  sphere(body, .10, hair, -.28, 2.42, .02, .9, 1.4, 1);
  sphere(body, .10, hair, .28, 2.42, .02, .9, 1.4, 1);
  sphere(body, .025, eye, -.12, 2.3, .29); sphere(body, .025, eye, .12, 2.3, .29);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .43, 1.82, 0); body.add(arm);
    box(arm, .25, .62, .27, clothes, 0, -.27, .04);
    sphere(arm, .12, skin, 0, -.66, .10); arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .21, .91, 0); body.add(leg);
    box(leg, .27, .68, .29, trousers, 0, -.34, 0);
    box(leg, .3, .19, .49, shoe, 0, -.72, .12); legs.push(leg);
  }
  const badge = new THREE.Group(); root.add(badge);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.61, .035, 6, 32), new THREE.MeshBasicMaterial({ color: role.color })); ring.rotation.x = -Math.PI / 2; ring.position.y = .025; badge.add(ring);
  const board = sign(root, role.name, 0, 3.35, 0, 2.35); board.material.depthTest = false;
  root.traverse((child) => { if (child.isMesh) child.userData.agentId = role.id; });
  return { root, body, arms, legs, ring, board, status: 'unavailable', role, arriving: true, elapsed: 0 };
}

function makeStation(role) {
  const group = new THREE.Group(); group.position.set(role.x, 0, role.z); scene.add(group);
  const wood = mat('#294046', { roughness: .55 });
  const glow = mat(role.color, { emissive: role.color, emissiveIntensity: .4 });
  box(group, 4.25, .16, 1.65, wood, 0, 1.08, 1.03);
  box(group, 4.1, .035, 1.5, darkMetal, 0, 1.18, 1.03);
  for (const x of [-1.9, 1.9]) for (const z of [.38, 1.66]) box(group, .13, 1.05, .12, darkMetal, x, .54, z);
  box(group, 2.75, .13, .07, glow, 0, 1.03, 1.85, false);
  box(group, 1.28, .8, .12, darkMetal, 0, 1.83, .73);
  box(group, 1.13, .65, .02, mat('#12313a', { emissive: role.color, emissiveIntensity: .25 }), 0, 1.83, .81, false);
  box(group, .08, .35, .08, darkMetal, 0, 1.25, .73);
  box(group, 1.15, .05, .48, mat('#0e1a1e'), 0, 1.22, 1.46);
  box(group, .92, .95, .16, mat('#213941'), 0, 1.0, -1.07);
  box(group, .72, .12, .7, mat('#29474d'), 0, .55, -1.0);
  cylinder(group, .1, .1, .5, darkMetal, 0, .33, -1.0);
  cylinder(group, .39, .39, .06, darkMetal, 0, .08, -1.0);
  const light = new THREE.PointLight(role.color, 3.2, 3.7, 2); light.position.set(0, 2.2, .85); group.add(light);
  return group;
}

const avatars = new Map();
roles.forEach((role, index) => {
  makeStation(role);
  const avatar = makeAvatar(role); avatar.root.position.set(-13.6, 0, 8.9 + (index % 3) * .25); avatars.set(role.id, avatar);
});

const modelFiles = [
  'The_Corporate_High-Flier.glb', 'The_Female_Executive.glb', 'The_Cyberpunk_Hacker.glb',
  'Businesswoman.glb', 'The_Corporate_High-Flier.glb', 'The_Female_Executive.glb', 'The_Cyberpunk_Hacker.glb', 'The_Female_Executive.glb',
];
const loader = new GLTFLoader();
Promise.all([...new Set(modelFiles)].map(async (file) => [file, await loader.loadAsync(`/models/${file}`)]))
  .then((entries) => {
    const models = new Map(entries);
    roles.forEach((role, index) => {
      const avatar = avatars.get(role.id);
      const gltf = models.get(modelFiles[index]);
      const model = cloneSkeleton(gltf.scene);
      const bounds = new THREE.Box3().setFromObject(model);
      const height = bounds.getSize(new THREE.Vector3()).y;
      if (!height) return;
      model.scale.setScalar(2.55 / height);
      model.updateMatrixWorld(true);
      model.position.y -= new THREE.Box3().setFromObject(model).min.y;
      model.traverse((child) => {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; child.userData.agentId = role.id; }
      });
      avatar.root.remove(avatar.body);
      avatar.root.add(model);
      avatar.model = model;
      avatar.mixer = new THREE.AnimationMixer(model);
      avatar.actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, avatar.mixer.clipAction(clip)]));
      avatar.activeAction = null;
      avatar.arriving = true;
      avatar.root.position.set(-13.6, 0, 8.9 + (index % 3) * .25);
      avatar.elapsed = 0;
    });
  }).catch(() => { document.getElementById('scene-status').textContent = 'Character assets unavailable'; });

function playAction(avatar, name) {
  const next = avatar.actions?.[name];
  if (!next || avatar.activeAction === next) return;
  next.reset().fadeIn(.24).play();
  avatar.activeAction?.fadeOut(.24);
  avatar.activeAction = next;
}

let state = { agents: roles.map((r) => ({ id: r.id, label: r.name, status: 'unavailable', activity: 'Connecting to live source', at: null, source: 'Waiting', detail: '' })), events: [] };
let selected = 'scoring';
let view = 'overview';
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function time(value) { if (!value) return 'No event'; const date = new Date(value); return Number.isNaN(+date) ? 'Unknown' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function statusColor(status) { return statusColors[status] || statusColors.unavailable; }
function renderHUD() {
  document.getElementById('worker-list').innerHTML = state.agents.map((a) => {
    const role = roles.find((r) => r.id === a.id); return `<button class="worker ${selected === a.id ? 'selected' : ''}" data-id="${a.id}" style="--accent:${role.color};--status:${statusColor(a.status)}"><span class="worker-icon">${role.short}</span><span class="worker-main"><strong>${escapeHtml(a.label)}</strong><small>${escapeHtml(a.activity)}</small></span><span class="status">${escapeHtml(a.status)}</span></button>`;
  }).join('');
  const a = state.agents.find((item) => item.id === selected) || state.agents[0];
  document.getElementById('detail').style.setProperty('--status', statusColor(a.status));
  document.getElementById('detail').innerHTML = `<div class="detail-top"><strong class="detail-title">${escapeHtml(a.label)}</strong><span class="detail-status">${escapeHtml(a.status)}</span></div><p>${escapeHtml(a.activity)}</p><div class="detail-meta">Last evidence: <strong>${escapeHtml(time(a.at))}</strong><br>Source: <strong>${escapeHtml(a.source)}</strong></div><div class="detail-note">${escapeHtml(a.detail || 'Read-only observation')}</div>`;
  document.getElementById('events').innerHTML = state.events.length ? state.events.map((e) => `<div class="event" style="--event-color:${e.kind === 'warning' ? '#ffcb69' : e.kind === 'success' ? '#00ff9f' : '#59d7ff'}"><strong>${escapeHtml(e.title)}</strong><span>${escapeHtml(time(e.at))} · ${escapeHtml(e.source)}</span></div>`).join('') : '<div class="empty">No verified events available yet.</div>';
  document.getElementById('event-count').textContent = String(state.events.length);
  document.getElementById('worker-count').textContent = String(roles.length).padStart(2, '0');
  document.getElementById('updated').textContent = state.updatedAt ? `Updated ${time(state.updatedAt)} · 15 second refresh` : 'Connecting to live sources';
  document.getElementById('scene-status').textContent = `${state.agents.filter((a) => a.status !== 'unavailable').length}/${roles.length} sources connected`;
  const allDown = state.agents.every((a) => a.status === 'unavailable');
  document.getElementById('connection-label').textContent = allDown ? 'Sources unavailable' : 'Live observer';
  document.getElementById('connection-dot').className = `dot ${allDown ? 'unavailable' : ''}`;
  document.querySelectorAll('.worker').forEach((button) => button.addEventListener('click', () => select(button.dataset.id)));
}
function select(id) {
  if (!avatars.has(id)) return;
  selected = id; renderHUD();
  const role = roles.find((r) => r.id === id);
  controls.target.set(role.x, 1.5, role.z);
  camera.position.set(role.x + 5, 5.5, role.z + 8.2);
  controls.update();
  frontWall.visible = false;
  document.getElementById('overview').classList.remove('active');
  document.getElementById('street').classList.remove('active');
}
function setView(mode) {
  view = mode;
  document.getElementById('overview').classList.toggle('active', mode === 'overview');
  document.getElementById('street').classList.toggle('active', mode === 'street');
  frontWall.visible = mode === 'overview';
  if (mode === 'street') { camera.position.set(1, 4.8, 17.2); controls.target.set(0, 1.7, 0); }
  else { camera.position.set(17, 17, 23); controls.target.set(0, 1.2, 0); }
  controls.update();
}
document.getElementById('overview').addEventListener('click', () => setView('overview'));
document.getElementById('street').addEventListener('click', () => setView('street'));
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (event) => { downAt = [event.clientX, event.clientY]; });
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 6) return;
  const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(scene.children, true).find((item) => item.object.userData.agentId);
  if (hit) select(hit.object.userData.agentId);
});

async function refresh() {
  try {
    const response = await fetch('/api/office', { cache: 'no-store' });
    if (!response.ok) throw new Error('Observer unavailable');
    state = await response.json(); renderHUD();
    for (const record of state.agents) {
      const avatar = avatars.get(record.id); if (!avatar) continue;
      if (record.at && record.at !== avatar.lastEvidenceAt && record.status === 'ready' && Date.now() - new Date(record.at).getTime() < 45000) {
        avatar.emoteUntil = performance.now() + 2600;
      }
      avatar.lastEvidenceAt = record.at;
      avatar.status = record.status;
      avatar.ring.material.color.set(statusColor(record.status));
    }
  } catch {
    document.getElementById('connection-label').textContent = 'Observer disconnected';
    document.getElementById('connection-dot').className = 'dot unavailable';
    document.getElementById('scene-status').textContent = 'Observer disconnected';
  }
}
renderHUD(); refresh(); setInterval(refresh, 15000);

const clock = new THREE.Clock();
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05);
  for (const avatar of avatars.values()) {
    avatar.elapsed += dt;
    const { role, root, arms, legs, body } = avatar;
    const target = new THREE.Vector3(role.x, 0, role.z - 1.18);
    const dist = root.position.distanceTo(target);
    if (avatar.arriving && dist > .04 && !reducedMotion) {
      if (avatar.model) playAction(avatar, 'Walk');
      const step = Math.min(dist, dt * 3.2); const direction = target.clone().sub(root.position).normalize(); root.position.addScaledVector(direction, step);
      root.rotation.y = Math.atan2(direction.x, direction.z);
      if (!avatar.model) {
        const gait = Math.sin(avatar.elapsed * 11) * .55;
        legs[0].rotation.x = gait; legs[1].rotation.x = -gait;
        arms[0].rotation.x = -gait * .55; arms[1].rotation.x = gait * .55;
        body.position.y = Math.abs(Math.sin(avatar.elapsed * 11)) * .055;
      }
    } else {
      avatar.arriving = false; root.position.copy(target);
      root.rotation.y = THREE.MathUtils.damp(root.rotation.y, 0, 4, dt);
      if (avatar.model) {
        const action = avatar.emoteUntil > performance.now() ? 'Wave' :
          avatar.status === 'working' ? 'Texting' :
          avatar.status === 'warning' ? 'Look around' : 'Sit idle (chair)';
        playAction(avatar, action);
      }
      else {
        legs[0].rotation.x = THREE.MathUtils.damp(legs[0].rotation.x, -.65, 5, dt);
        legs[1].rotation.x = THREE.MathUtils.damp(legs[1].rotation.x, -.65, 5, dt);
        const typing = avatar.status === 'working';
        const pulse = reducedMotion ? 0 : Math.sin(avatar.elapsed * (typing ? 17 : 2.5));
        arms[0].rotation.x = -.82 + (typing ? pulse * .15 : 0);
        arms[1].rotation.x = -.82 - (typing ? pulse * .15 : 0);
        body.position.y = reducedMotion ? -.15 : -.15 + Math.sin(avatar.elapsed * 2.5) * .014;
        body.rotation.z = reducedMotion ? 0 : Math.sin(avatar.elapsed * 1.6) * .012;
      }
    }
    avatar.mixer?.update(dt);
    avatar.board.quaternion.copy(camera.quaternion);
    const pulse = avatar.status === 'working' && !reducedMotion ? .5 + .5 * Math.sin(avatar.elapsed * 7) : .8;
    avatar.ring.material.opacity = pulse; avatar.ring.material.transparent = true;
  }
  controls.update(); renderer.render(scene, camera);
}
frame();

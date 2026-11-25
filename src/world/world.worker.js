// Runs the world: every module Claude wrote, plus the drawing of the canvas.
// It lives in a Web Worker so that generated code has no page, no network and
// no camera access of its own, and so that a loop that never ends freezes only
// this thread (the page notices the missing pongs and replaces it).
//
// The page feeds it video frames, other players' state and this player's
// input; it sends back this player's state, the shared state (if host),
// which camera features the modules need, and errors.
import { WORLD, SEATS } from './primitives.js';

const post = self.postMessage.bind(self);
const listen = self.addEventListener.bind(self);
const raf = self.requestAnimationFrame?.bind(self);
const timer = self.setInterval.bind(self);

for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches',
  'Worker', 'SharedWorker', 'BroadcastChannel', 'WebTransport', 'RTCPeerConnection', 'postMessage',
  'addEventListener', 'removeEventListener', 'onmessage', 'close', 'navigator', 'location', 'open']) {
  for (let o = Object.getPrototypeOf(self); o; o = Object.getPrototypeOf(o)) {
    try { delete o[name]; } catch { /* non-configurable */ }
  }
  try { delete self[name]; } catch { /* non-configurable */ }
  try { Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false }); } catch { /* not present */ }
}

const { W, H } = WORLD;
const MAX_VARS = 8_000; // characters of JSON
const MAX_SHARED = 30_000;

let g = null;
let meId = null;
let hostId = null;
let version = 0;
let shared = {};
const players = new Map(); // id -> player, in join order
let list = [];
const modules = new Map(); // name -> {name, code, hooks, layer, dead}
let sorted = [];
const frames = new Map(); // id -> ImageBitmap
const cutouts = new Map();
const rects = new Map(); // id -> {x, y, w, h, crop, matrix}
const keys = Object.create(null);
let pressedNow = Object.create(null);
const pointer = { x: W / 2, y: H / 2, down: false };

const KEY_ALIASES = { space: ' ', spacebar: ' ', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', enter: 'Enter' };
const normKey = (k) => {
  if (typeof k !== 'string') return '';
  if (k === ' ') return ' ';
  const s = k.trim();
  return KEY_ALIASES[s.toLowerCase()] ?? (s.length === 1 ? s.toLowerCase() : s);
};

// ---- what modules see ---------------------------------------------------

const ctx = {
  W, H, t: 0, dt: 0,
  get players() { return list; },
  player: (id) => players.get(id) ?? null,
  get me() { return players.get(meId) ?? null; },
  get isHost() { return meId != null && meId === hostId; },
  get shared() { return shared; },
  key: (k) => !!keys[normKey(k)],
  pressed: (k) => !!pressedNow[normKey(k)],
  pointer,
  drawVideo,
  videoRect: (p) => { const r = p && rects.get(p.id); return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null; },
  toWorld,
};

function drawVideo(g2, p, x, y, w, h, opts = {}) {
  if (!p || !g2) return null;
  const src = (opts.cutout && cutouts.get(p.id)) || frames.get(p.id);
  const sa = src ? src.width / src.height : 4 / 3;
  w = Number(w) || 320;
  h = Number(h) || w / sa;
  const da = w / h;
  // Crop the source to fill the box (centred), as fractions of the picture.
  const crop = sa > da ? { x: (1 - da / sa) / 2, y: 0, w: da / sa, h: 1 } : { x: 0, y: (1 - sa / da) / 2, w: 1, h: sa / da };
  const r = { x: x - w / 2, y: y - h / 2, w, h, crop, matrix: g2.getTransform() };
  rects.set(p.id, r);
  if (!src) {
    if (!opts.cutout) {
      g2.fillStyle = '#1d1d24';
      g2.fillRect(r.x, r.y, w, h);
      g2.fillStyle = '#8a8a99';
      g2.font = `600 ${Math.round(Math.min(w, h) * 0.4)}px system-ui, sans-serif`;
      g2.textAlign = 'center';
      g2.textBaseline = 'middle';
      g2.fillText((p.name || '?')[0].toUpperCase(), x, y);
    }
    return r;
  }
  // Everyone is shown mirrored, the way people expect to see themselves, and
  // landmark coordinates arrive already flipped to match.
  g2.save();
  g2.translate(r.x + w, r.y);
  g2.scale(-1, 1);
  g2.drawImage(src, crop.x * src.width, crop.y * src.height, crop.w * src.width, crop.h * src.height, 0, 0, w, h);
  g2.restore();
  return r;
}

function toWorld(p, pt) {
  if (!p || !pt) return { x: 0, y: 0 };
  const r = rects.get(p.id);
  if (!r) return { x: p.x, y: p.y };
  const lx = r.x + ((pt.x - r.crop.x) / r.crop.w) * r.w;
  const ly = r.y + ((pt.y - r.crop.y) / r.crop.h) * r.h;
  const m = r.matrix;
  return { x: m.a * lx + m.c * ly + m.e, y: m.b * lx + m.d * ly + m.f };
}

// ---- modules ------------------------------------------------------------

function fail(m, err) {
  if (m) m.dead = true;
  post({ type: 'error', version, module: m?.name ?? null, message: String(err?.message ?? err) });
}

function instantiate(name, code) {
  const m = { name, code, hooks: {}, layer: 0, dead: false };
  try {
    const hooks = new Function('ctx', `"use strict";\n${code}`)(ctx);
    if (!hooks || typeof hooks !== 'object') throw new Error('did not return an object of hooks');
    m.hooks = hooks;
    m.layer = Number(hooks.layer) || 0;
  } catch (err) { fail(m, err); }
  return m;
}

function setProgram(next) {
  version = next.version;
  for (const name of [...modules.keys()]) if (!(name in next.modules)) modules.delete(name);
  for (const [name, code] of Object.entries(next.modules)) {
    if (modules.get(name)?.code !== code) modules.set(name, instantiate(name, code));
  }
  sorted = [...modules.values()].sort((a, b) => a.layer - b.layer || (a.name < b.name ? -1 : 1));
  const needs = new Set();
  for (const m of sorted) if (!m.dead && Array.isArray(m.hooks.needs)) for (const n of m.hooks.needs) needs.add(String(n));
  if (!needs.has('cutout')) { for (const b of cutouts.values()) b.close(); cutouts.clear(); }
  post({ type: 'needs', needs: [...needs] });
}

function run(hook, ...args) {
  for (const m of sorted) {
    const fn = m.hooks[hook];
    if (m.dead || typeof fn !== 'function') continue;
    try { fn(...args); } catch (err) { fail(m, err); }
  }
}

// ---- players ------------------------------------------------------------

function setRoster(m) {
  hostId = m.hostId;
  const ids = new Set(m.players.map((p) => p.id));
  for (const id of [...players.keys()]) {
    if (ids.has(id)) continue;
    players.delete(id);
    frames.get(id)?.close(); frames.delete(id);
    cutouts.get(id)?.close(); cutouts.delete(id);
    rects.delete(id);
  }
  for (const { id, name, slot } of m.players) {
    let p = players.get(id);
    if (!p) {
      const [x, y] = SEATS[slot % SEATS.length];
      p = { id, name, x, y, scale: 1, vars: {}, hands: [], face: null, pose: null, hasVideo: false };
      players.set(id, p);
    }
    p.name = name;
  }
  list = m.players.map((p) => players.get(p.id));
}

function applyState(p, s, snap) {
  if (!s || typeof s !== 'object') return;
  for (const k of ['x', 'y', 'scale']) if (!Number.isFinite(s[k])) return;
  if (snap || !p.target) { p.x = s.x; p.y = s.y; p.scale = s.scale; }
  p.target = { x: s.x, y: s.y, scale: s.scale };
  p.vars = s.vars && typeof s.vars === 'object' ? s.vars : {};
  p.hands = Array.isArray(s.hands) ? s.hands : [];
  p.face = s.face ?? null;
  p.pose = s.pose ?? null;
  p.hasVideo = !!s.hasVideo;
}

// ---- the frame ----------------------------------------------------------

const now = () => performance.now();
const t0 = now();
let last = now();
let lastPublish = 0;
let lastSharedJson = '';

function tick() {
  const t = now();
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  ctx.t = (t - t0) / 1000;
  ctx.dt = dt;
  const me = players.get(meId);

  // Ease the others towards their latest reported positions.
  const k = 1 - Math.exp(-dt * 18);
  for (const p of list) {
    if (p === me || !p.target) continue;
    p.x += (p.target.x - p.x) * k;
    p.y += (p.target.y - p.y) * k;
    p.scale += (p.target.scale - p.scale) * k;
  }

  if (me) {
    run('control', ctx, me, dt);
    if (!Number.isFinite(me.x)) me.x = W / 2;
    if (!Number.isFinite(me.y)) me.y = H / 2;
    if (!Number.isFinite(me.scale)) me.scale = 1;
    me.x = Math.max(-2000, Math.min(W + 2000, me.x));
    me.y = Math.max(-2000, Math.min(H + 2000, me.y));
    me.scale = Math.max(0.05, Math.min(10, me.scale));
    if (!me.vars || typeof me.vars !== 'object') me.vars = {};
  }
  if (ctx.isHost) {
    run('simulate', ctx, dt);
    if (!shared || typeof shared !== 'object') shared = {};
  }

  if (g) {
    g.reset();
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    for (const m of sorted) {
      const fn = m.hooks.draw;
      if (m.dead || typeof fn !== 'function') continue;
      g.save();
      try { fn(ctx, g); } catch (err) { fail(m, err); }
      g.restore();
    }
  }
  pressedNow = Object.create(null);

  if (t - lastPublish >= 33) {
    lastPublish = t;
    publish(me);
  }
}

function publish(me) {
  if (me) {
    let vars = '{}';
    try { vars = JSON.stringify(me.vars) ?? '{}'; } catch { vars = null; }
    if (vars == null || vars.length > MAX_VARS) { fail(null, 'me.vars must be a small plain JSON object'); me.vars = {}; vars = '{}'; }
    post({ type: 'me', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, scale: Math.round(me.scale * 1000) / 1000, vars });
  }
  if (ctx.isHost) {
    let json = null;
    try { json = JSON.stringify(shared); } catch { /* cyclic */ }
    if (json == null || json.length > MAX_SHARED) { fail(null, 'ctx.shared must be a plain JSON object under 30 KB'); shared = {}; json = '{}'; }
    if (json !== lastSharedJson) { lastSharedJson = json; post({ type: 'shared', json }); }
  }
}

let lastTick = 0;
function loop() { lastTick = now(); tick(); raf(loop); }
if (raf) raf(loop);
// rAF stops in a hidden tab; keep the world (and the host's simulate) alive.
timer(() => { if (now() - lastTick > 100) { lastTick = now(); tick(); } }, raf ? 50 : 16);

// ---- messages from the page --------------------------------------------

listen('message', (ev) => {
  const m = ev.data;
  if (!m || typeof m !== 'object') return;
  switch (m.type) {
    case 'ping': post({ type: 'pong' }); break;
    case 'init':
      meId = m.meId;
      g = m.canvas.getContext('2d');
      break;
    case 'roster': setRoster(m); break;
    case 'seed': { const me = players.get(meId); if (me && m.s) applyState(me, m.s, true); break; }
    case 'program': setProgram(m); break;
    case 'state': { const p = players.get(m.id); if (p && m.id !== meId) applyState(p, m.s, false); break; }
    case 'shared': if (!ctx.isHost || m.force) { shared = m.s && typeof m.s === 'object' ? m.s : {}; } break;
    case 'frame': {
      const map = m.cutout ? cutouts : frames;
      map.get(m.id)?.close();
      if (players.has(m.id) && m.bitmap) map.set(m.id, m.bitmap); else { map.delete(m.id); m.bitmap?.close(); }
      break;
    }
    case 'percept': {
      const me = players.get(meId);
      if (me) { me.hands = m.hands ?? []; me.face = m.face ?? null; me.pose = m.pose ?? null; me.hasVideo = !!m.hasVideo; }
      break;
    }
    case 'key': {
      const k = normKey(m.key);
      if (m.down) { if (!keys[k]) pressedNow[k] = true; keys[k] = true; } else delete keys[k];
      break;
    }
    case 'keysclear': for (const k of Object.keys(keys)) delete keys[k]; break;
    case 'pointer': pointer.x = m.x; pointer.y = m.y; pointer.down = !!m.down; break;
  }
});

post({ type: 'ready' });

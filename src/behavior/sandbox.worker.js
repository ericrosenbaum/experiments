import { matchFilter } from './filter.js';

// Sandbox for one behavior program. Runs in a dedicated Web Worker, so the
// program has no DOM, no page state, and (below) no network or storage. It
// can only talk to the world through the primitive functions defined here,
// which turn into validated messages the host executes.

const post = self.postMessage.bind(self);
const listen = self.addEventListener.bind(self);

// Remove capabilities a behavior program has no business using.
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches',
  'Worker', 'SharedWorker', 'BroadcastChannel', 'WebTransport', 'RTCPeerConnection', 'postMessage',
  'addEventListener', 'removeEventListener', 'onmessage', 'close', 'navigator', 'location', 'open']) {
  // Delete from the prototype chain too, so Object.getPrototypeOf(self).fetch can't sneak back in.
  for (let o = Object.getPrototypeOf(self); o; o = Object.getPrototypeOf(o)) {
    try { delete o[name]; } catch { /* non-configurable */ }
  }
  try { Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false }); } catch { /* not present */ }
}

const handlers = { start: [], key: [], keyup: [], hold: [], touch: [], message: [], clone: [] };
const heldKeys = new Set();
const pending = new Map();
let nextQuery = 1;
let stopped = false;
let cloned = false;
// Start handlers run once, right after the program loads. One registered after
// that (a forever inside an onStart, an onStart inside a key handler) starts
// straight away instead, or it would never run.
let started = false;
const atStart = (run) => { if (started) run(); else handlers.start.push(run); };
// Clicking a stack of blocks runs it once: its top block's id -> how to run it.
// The traced code calls __hat(ID) just before each top-level event registers.
const byHat = new Map();
let currentHat = null;
const scriptOf = (run) => { if (currentHat != null) byHat.set(currentHat, run); currentHat = null; };

const cmd = (name, ...args) => { if (!stopped) post({ type: 'cmd', name, args: clone(args) }); };
const query = (name, ...args) => new Promise((resolve) => {
  if (stopped) return;
  const id = nextQuery++;
  pending.set(id, resolve);
  post({ type: 'query', id, name, args: clone(args) });
});
// Only plain data crosses the boundary.
function clone(v) { return JSON.parse(JSON.stringify(v ?? null)); }

function safe(fn, label) {
  return async (...a) => {
    try { await fn(...a); } catch (err) { post({ type: 'error', message: `${label}: ${err?.message ?? err}` }); }
  };
}
const normKey = (k) => {
  if (typeof k !== 'string') return '';
  if (k === ' ') return ' ';
  const s = k.trim();
  const map = { space: ' ', spacebar: ' ', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', enter: 'Enter' };
  return map[s.toLowerCase()] ?? (s.length === 1 ? s.toLowerCase() : s);
};
const sleep = (s) => new Promise((r) => setTimeout(r, Math.max(0, Number(s) || 0) * 1000));

const ref = (r) => r;

// Tracing (calls added by trace.js): which statements are running right now,
// plus any that started and finished since the last report. Reported to the
// host at most every 50ms so the blocks view can light them up.
const live = new Map();
const seen = new Set();
let traceTimer = null;
const flushTrace = () => {
  traceTimer = null;
  if (stopped) return;
  post({ type: 'trace', live: [...live.keys()], seen: [...seen] });
  seen.clear();
};
const traced = () => { traceTimer ??= setTimeout(flushTrace, 50); };

const api = {
  onStart: (fn) => { const run = safe(fn, 'start'); atStart(run); scriptOf(run); },
  onKey: (key, fn) => { const run = safe(fn, `key ${key}`); handlers.key.push({ key: normKey(key), fn: run }); scriptOf(run); },
  onKeyUp: (key, fn) => { const run = safe(fn, `key up ${key}`); handlers.keyup.push({ key: normKey(key), fn: run }); scriptOf(run); },
  whileKey: (key, fn) => { const run = safe(fn, `hold ${key}`); handlers.hold.push({ key: normKey(key), fn: run, busy: false }); scriptOf(run); },
  onTouch: (filter, fn) => {
    if (typeof filter === 'function') { fn = filter; filter = null; }
    handlers.touch.push({ filter: ref(filter), fn: safe(fn, 'touch'), busy: false });
    // clicked, it runs as if it bumped into nothing in particular
    scriptOf(() => safe(fn, 'touch')({ name: 'nothing (the blocks were clicked)', kind: 'none', color: null, id: null }));
  },
  onMessage: (name, fn) => { const run = safe(fn, `message ${name}`); handlers.message.push({ name: String(name), fn: run }); scriptOf(run); },
  onClone: (fn) => { const run = safe(fn, 'clone'); handlers.clone.push(run); scriptOf(run); },
  forever: (fn) => {
    const run = safe(fn, 'forever');
    scriptOf(run); // clicking runs one time around
    atStart(async () => { while (!stopped) { await run(); await sleep(1 / 30); } });
  },
  every: (seconds, fn) => {
    const run = safe(fn, 'every');
    scriptOf(run);
    atStart(async () => { while (!stopped) { await sleep(Math.max(0.05, seconds)); await run(); } });
  },

  drive: (speed = 7) => cmd('drive', Number(speed)),
  steer: (rate = 60) => cmd('steer', Number(rate)),
  rise: (speed = 5) => cmd('rise', Number(speed)),
  speedUp: (amount = 3) => cmd('speedUp', Number(amount)),
  slowDown: (amount = 3) => cmd('slowDown', Number(amount)),
  stop: () => cmd('stop'),
  jump: (power = 5) => cmd('jump', Number(power)),
  push: (direction = 'forward', power = 5) => cmd('push', String(direction), Number(power)),
  move: (distance = 5, speed = 7) => query('move', Number(distance), Number(speed)),
  turn: (degrees = 90) => query('turn', Number(degrees)),
  goTo: (target, speed = 7) => query('goTo', ref(target), Number(speed)),
  face: (target) => query('face', ref(target)),
  teleport: (target) => query('teleport', ref(target)),
  part: (name) => ({
    spin: (speed = 180) => cmd('partSpin', String(name), Number(speed)),
    turnTo: (degrees = 45) => query('partTurnTo', String(name), Number(degrees)),
    wiggle: (times = 3) => query('partWiggle', String(name), Number(times)),
    color: (color) => cmd('partColor', String(name), String(color)),
  }),
  color: (color) => cmd('color', String(color)),
  spawn: (options = {}) => cmd('spawn', options && typeof options === 'object' ? options : { color: String(options) }),
  play: (sound) => cmd('play', String(sound)),
  say: (text, seconds = 2) => cmd('say', String(text), Number(seconds)),
  broadcast: (name) => cmd('broadcast', String(name)),
  clone: (what = null, where = null) => query('clone', ref(what), ref(where)),
  explode: (power = 5) => cmd('explode', Number(power)),
  remove: () => cmd('remove'),
  gravity: (amount = 1) => cmd('gravity', Number(amount)),
  wait: (seconds = 1) => sleep(seconds),
  look: (distance = 20) => query('look', Number(distance)),
  nearest: (filter = null) => query('nearest', ref(filter)),
  touching: (filter = null) => query('touching', ref(filter)),
  position: () => query('position'),
  see: (labels = []) => query('see', (Array.isArray(labels) ? labels : [labels]).map(String)),
  thing: (id) => ({ __ref: 'thing', id: String(id) }),
  place: (x, z) => ({ __ref: 'place', x: Number(x), z: Number(z) }),
  isClone: () => cloned,
  is: (thing, filter) => matchFilter(filter, thing),
  random: (min = 1, max = 10) => Math.floor(min + Math.random() * (max - min + 1)),
  __hat: (id) => { currentHat = id; },
  __def: (id, fn) => { if (typeof fn === 'function') byHat.set(id, safe(fn, 'define')); },
  __on: (id) => { live.set(id, (live.get(id) ?? 0) + 1); seen.add(id); traced(); },
  __off: (id) => { const n = (live.get(id) ?? 1) - 1; if (n > 0) live.set(id, n); else live.delete(id); traced(); },
  log: (...v) => cmd('log', v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
};

listen('message', async (ev) => {
  const m = ev.data;
  switch (m.type) {
    case 'load': {
      cloned = !!m.isClone;
      let program;
      try {
        const AsyncFunction = (async () => {}).constructor;
        program = new AsyncFunction(...Object.keys(api), '"use strict";\n' + m.code);
      } catch (err) {
        post({ type: 'error', message: `This program has a typo: ${err.message}`, fatal: true });
        return;
      }
      try {
        await program(...Object.values(api));
      } catch (err) {
        post({ type: 'error', message: err?.message ?? String(err), fatal: true });
        return;
      }
      // Tell the host what we listen for, so it only sends relevant events.
      post({
        type: 'ready',
        touchFilters: handlers.touch.map((h) => h.filter),
        keys: [...new Set([...handlers.key, ...handlers.keyup, ...handlers.hold].map((h) => h.key))],
      });
      started = true;
      handlers.start.forEach((fn) => fn());
      if (cloned) handlers.clone.forEach((fn) => fn());
      break;
    }
    case 'reply': {
      const r = pending.get(m.id);
      pending.delete(m.id);
      r?.(m.value);
      break;
    }
    case 'key':
      heldKeys.add(m.key);
      handlers.key.filter((h) => h.key === m.key).forEach((h) => h.fn());
      break;
    case 'keyup':
      heldKeys.delete(m.key);
      handlers.keyup.filter((h) => h.key === m.key).forEach((h) => h.fn());
      break;
    case 'tick': // ~30 Hz while any key is held
      for (const h of handlers.hold) {
        if (heldKeys.has(h.key) && !h.busy) { h.busy = true; h.fn().finally(() => { h.busy = false; }); }
      }
      break;
    case 'touch':
      for (const i of m.matches) {
        const h = handlers.touch[i];
        if (h && !h.busy) { h.busy = true; h.fn(m.thing).finally(() => { h.busy = false; }); }
      }
      break;
    case 'message': handlers.message.filter((h) => h.name === m.name).forEach((h) => h.fn()); break;
    case 'run': { // a stack of blocks was clicked
      const run = byHat.get(m.at);
      post({ type: 'ran', at: m.at, ok: !!run });
      run?.();
      break;
    }
    case 'ping': post({ type: 'pong', t: m.t }); break;
    case 'stop':
      stopped = true;
      for (const r of pending.values()) r(null);
      pending.clear();
      break;
  }
});

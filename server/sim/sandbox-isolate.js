// A sandbox that is a security boundary: each one is a V8 isolate
// (isolated-vm) with its own heap limit and no Node globals at all. The same
// sandbox code as the page's Web Worker runs inside it; `self.postMessage`
// and `self.addEventListener` are wired through isolate references, and
// setTimeout is implemented here since an isolate has no timers of its own.
// Picked with SANDBOX=isolate (see sandbox-node.js).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ivm from 'isolated-vm';
import { Sandbox } from '../../src/behavior/sandbox-host.js';

const MEMORY_MB = 64;
const CALL_TIMEOUT_MS = 200; // one synchronous slice of a program; loops that never await trip this

// The sandbox and the filter it imports, as one plain script (no module loader inside an isolate).
const SOURCE = (() => {
  const dir = new URL('../../src/behavior/', import.meta.url);
  const filter = readFileSync(fileURLToPath(new URL('filter.js', dir)), 'utf8').replace(/^export\s+/gm, '');
  const worker = readFileSync(fileURLToPath(new URL('sandbox.worker.js', dir)), 'utf8').replace(/^import .*$/m, '');
  return `${filter}\n${worker}`;
})();

export function isolateSandbox(opts = {}) {
  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_MB });
  const context = isolate.createContextSync();
  const jail = context.global;
  let onMessage = () => {};
  let dead = false;
  const timers = new Set();

  jail.setSync('global', jail.derefInto());
  // What the sandbox code expects: self.postMessage out, self.addEventListener('message') in.
  jail.setSync('__post', new ivm.Callback((json) => { if (!dead) onMessage(JSON.parse(json)); }));
  // Timers: the isolate asks the host to call back after a delay. Each callback is one timed slice.
  jail.setSync('__setTimeout', new ivm.Callback((id, ms) => {
    if (dead) return;
    const t = setTimeout(() => {
      timers.delete(t);
      if (dead) return;
      try { fire.applySync(undefined, [id], { timeout: CALL_TIMEOUT_MS * 5 }); } catch (err) { stuck(err); }
    }, Math.max(0, ms));
    timers.add(t);
  }));
  context.evalSync(`
    const __listeners = [];
    const __timers = new Map();
    let __nextTimer = 1;
    globalThis.self = {
      postMessage: (m) => __post(JSON.stringify(m)),
      addEventListener: (type, fn) => { if (type === 'message') __listeners.push(fn); },
    };
    globalThis.setTimeout = (fn, ms, ...args) => { const id = __nextTimer++; __timers.set(id, () => fn(...args)); __setTimeout(id, Number(ms) || 0); return id; };
    globalThis.clearTimeout = (id) => { __timers.delete(id); };
    globalThis.performance = { now: () => Date.now() };
    globalThis.__fire = (id) => { const fn = __timers.get(id); __timers.delete(id); fn?.(); };
    globalThis.__receive = (json) => { const ev = { data: JSON.parse(json) }; for (const fn of __listeners) fn(ev); };
  `);
  context.evalSync(SOURCE, { timeout: CALL_TIMEOUT_MS * 5 });
  const fire = context.global.getSync('__fire', { reference: true });
  const receive = context.global.getSync('__receive', { reference: true });

  // A slice that ran too long, or the heap limit: the sandbox is gone.
  const stuck = (err) => queueMicrotask(() => sandbox.terminate(`got stuck — ${/timed? ?out/i.test(err.message) ? 'a loop never paused. Try adding wait() inside it.' : err.message}`));

  const terminate = () => {
    if (dead) return;
    dead = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    try { isolate.dispose(); } catch { /* already disposed */ }
  };

  const sandbox = new Sandbox({
    post: (m) => {
      if (dead) return;
      try { receive.applySync(undefined, [JSON.stringify(m)], { timeout: CALL_TIMEOUT_MS }); } catch (err) { stuck(err); }
    },
    onMessage: (fn) => { onMessage = fn; },
    terminate,
  }, opts);
  return sandbox;
}

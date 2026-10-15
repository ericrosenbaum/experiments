// Where behavior programs run. A Sandbox is one thread (a Web Worker in the
// page, a worker thread or a V8 isolate on the sim server) that can hold
// several programs, each with an id. The Runtime talks to a sandbox through
// the four calls below and never knows which kind it is.
//
// Messages in and out carry `program` (see sandbox.worker.js); `ping`/`pong`
// are for the whole thread, since a stuck loop blocks everything in it.

export class Sandbox {
  // transport: {post(msg), onMessage(fn), terminate()}
  // shared: false means the one program in it owns it (terminate when it stops)
  constructor(transport, { shared = false, label = 'sandbox' } = {}) {
    this.t = transport;
    this.shared = shared;
    this.label = label;
    this.handlers = new Map(); // program id -> (msg) => void
    this.lastPong = now();
    this.dead = false;
    this.onDead = null; // (reason) => void, set by the Runtime
    transport.onMessage((m) => this._receive(m));
  }

  get size() { return this.handlers.size; }

  attach(id, handler) { this.handlers.set(id, handler); }
  detach(id) { this.handlers.delete(id); }

  load(id, code, isClone) { this.send(id, { type: 'load', code, isClone: !!isClone }); }

  send(id, msg) {
    if (this.dead) return;
    try { this.t.post({ ...msg, program: id }); } catch { /* gone */ }
  }

  ping() {
    if (this.dead) return;
    try { this.t.post({ type: 'ping', t: now() }); } catch { /* gone */ }
  }

  terminate(reason) {
    if (this.dead) return;
    this.dead = true;
    try { this.t.terminate(); } catch { /* already gone */ }
    const handlers = [...this.handlers.entries()];
    this.handlers.clear();
    for (const [, h] of handlers) h({ type: 'dead', reason });
    this.onDead?.(reason);
  }

  _receive(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'pong') { this.lastPong = now(); return; }
    if (m.program == null) { // a thread-level error: every program hears it
      for (const h of this.handlers.values()) h(m);
      return;
    }
    this.handlers.get(m.program)?.(m);
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// The page: one Web Worker per sandbox.
export function browserSandbox(opts = {}) {
  const w = new Worker(new URL('./sandbox.worker.js', import.meta.url), { type: 'module' });
  return new Sandbox({
    post: (m) => w.postMessage(m),
    onMessage: (fn) => {
      w.onmessage = (ev) => fn(ev.data);
      w.onerror = (ev) => { ev.preventDefault?.(); fn({ type: 'error', message: ev.message ?? 'worker error', fatal: true }); };
    },
    terminate: () => w.terminate(),
  }, opts);
}

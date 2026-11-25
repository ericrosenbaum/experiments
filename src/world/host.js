// The page's side of the world worker: owns the canvas element, starts the
// worker, remembers enough to rebuild it, and replaces it if it stops answering.
import { WORLD } from './primitives.js';

const PING_MS = 1000;
const STUCK_MS = 3500;

export class WorldHost {
  // on: {me(state), shared(json), needs(list), error({version, module, message})}
  constructor(container, on) {
    this.container = container;
    this.on = on;
    this.meId = null;
    this.roster = null;
    this.program = null;
    this.good = null; // the last program that ran for a while without trouble
    this.suspect = null; // the program to blame if the worker stops answering
    this.shared = {};
    this.meState = null;
    this.reported = new Set();
    this.worker = null;
    this.canvas = null;
    setInterval(() => this._watch(), PING_MS);
  }

  start(meId) {
    this.meId = meId;
    this._spawn();
  }

  _spawn() {
    this.worker?.terminate();
    this.canvas?.remove();
    const canvas = document.createElement('canvas');
    canvas.width = WORLD.W;
    canvas.height = WORLD.H;
    canvas.id = 'world';
    this.container.prepend(canvas);
    this.canvas = canvas;
    const off = canvas.transferControlToOffscreen();
    const w = new Worker(new URL('./world.worker.js', import.meta.url), { type: 'module' });
    this.worker = w;
    this.lastPong = performance.now();
    this.answered = false;
    w.onmessage = (ev) => this._receive(w, ev.data);
    w.onerror = (ev) => { ev.preventDefault?.(); this._report({ version: this.program?.version, module: null, message: ev.message ?? 'worker error' }); };
    w.postMessage({ type: 'init', canvas: off, meId: this.meId }, [off]);
    if (this.roster) w.postMessage(this.roster);
    if (this.meState) w.postMessage({ type: 'seed', s: this.meState });
    w.postMessage({ type: 'shared', s: this.shared, force: true });
    if (this.program) w.postMessage({ type: 'program', ...this.program });
    this.onCanvas?.(canvas);
  }

  _receive(w, m) {
    if (w !== this.worker) return;
    this.answered = true;
    switch (m.type) {
      case 'pong': this.lastPong = performance.now(); break;
      case 'me': this.meState = { x: m.x, y: m.y, scale: m.scale, vars: JSON.parse(m.vars) }; this.on.me(this.meState); break;
      case 'shared': this.shared = JSON.parse(m.json); this.on.shared(m.json); break;
      case 'needs': this.on.needs(m.needs); break;
      case 'error': this._report(m); break;
    }
  }

  _report(m) {
    const key = `${m.version}:${m.module}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.on.error(m);
  }

  _watch() {
    const w = this.worker;
    if (!w) return;
    const now = performance.now();
    // If this page itself stalled (loading camera tracking can block it for
    // seconds), the pongs are waiting unread: that is not the worker's fault.
    const stalled = now - (this.watchedAt ?? now) > 1.5 * PING_MS;
    this.watchedAt = now;
    if (stalled) { this.lastPong = now; w.postMessage({ type: 'ping' }); return; }
    if (this.answered && now - this.lastPong > STUCK_MS) {
      // A loop that never ends. Tell the server, then come back up on the
      // last program known to behave so the call carries on meanwhile.
      // The culprit is the last program handed over while the worker was still
      // answering; anything sent since then is queued behind the loop, unrun.
      const stuck = this.suspect;
      this._report({ version: stuck?.version, module: null, message: 'the world froze: a loop never finished' });
      if (this.program === stuck) {
        const safe = this.good && this.good !== stuck ? this.good.modules : {};
        this.program = this.suspect = { version: stuck?.version ?? 0, modules: safe };
      }
      this._spawn();
      return;
    }
    if (this.program && now - this.programAt > 5000 && now - this.lastPong < 2 * PING_MS) this.good = this.program;
    w.postMessage({ type: 'ping' });
  }

  send(m, transfer) { this.worker?.postMessage(m, transfer ?? []); }

  setRoster(players, hostId) {
    this.roster = { type: 'roster', players, hostId };
    this.send(this.roster);
  }

  setProgram(program) {
    this.program = program;
    this.programAt = performance.now();
    if (!this.worker || !this.answered || this.programAt - this.lastPong < 1.5 * PING_MS) this.suspect = program;
    this.send({ type: 'program', ...program });
  }

  setShared(s, force = false) {
    this.shared = s;
    this.send({ type: 'shared', s, force });
  }
}

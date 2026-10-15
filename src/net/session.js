// A session in a shared room: the same calls the single-player LocalSession
// answers, sent to the sim server instead, and the server's messages turned
// into changes to the mirror world and the UI.
import { WORLDS_BY_ID } from '../world/worlds.js';
import { syntaxError } from '../behavior/generate.js';
import { Mirror } from './mirror.js';
import { decodeSnapshot } from './codec.js';

const DRAG_HZ = 20;
const ID_KEY = 'brick-behaviors.player';
const NAME_KEY = 'brick-behaviors.name';
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* blocked */ } },
};

export function simUrl(room) {
  const base = import.meta.env?.VITE_SIM_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const u = new URL(base, location.href);
  u.searchParams.set('room', room);
  return u.href;
}

export class NetSession {
  constructor({ app, world, room, name }) {
    Object.assign(this, { app, world, room });
    this.mode = 'net';
    this.mirror = new Mirror(world);
    this.me = { id: store.get(ID_KEY), name: name ?? store.get(NAME_KEY) ?? '', color: '#ffd400' };
    this.players = [];
    this.selections = new Map(); // player id -> actor key
    this.lists = new Map(); // actor key -> behaviors (objects the UI may hang state on)
    this.traces = new Map(); // behavior id -> {live, lastSeen}
    this.heldKeys = new Set();
    this.worldId = null;
    this.connected = false;
    this.ws = null;
    this.retry = 1000;
    this.drags = null;
    this.closed = false;
  }

  get preset() { return WORLDS_BY_ID[this.worldId] ?? WORLDS_BY_ID.playground; }

  // ---- the socket -----------------------------------------------------------

  start(worldId) {
    this.wantWorld = worldId;
    this._connect();
  }

  _connect() {
    if (this.closed) return;
    const ws = new WebSocket(simUrl(this.room));
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      this._send({ type: 'hello', room: this.room, name: this.me.name || undefined, playerId: this.me.id || undefined, world: this.wantWorld || undefined });
    };
    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        const snap = decodeSnapshot(ev.data);
        if (snap) this.mirror.applySnapshot(snap, performance.now());
        return;
      }
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this[`on_${m.type}`]?.(m);
    };
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      this.ws = null;
      for (const k of [...this.heldKeys]) this.heldKeys.delete(k);
      if (this.closed || this.full) return;
      this.app.onConnection(was ? 'lost' : 'failed', this.retry);
      setTimeout(() => this._connect(), this.retry);
      this.retry = Math.min(30_000, this.retry * 2);
    };
    ws.onerror = () => {};
  }

  _send(m) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  // ---- messages from the room -----------------------------------------------

  on_welcome(m) {
    this.connected = true;
    this.me = { id: m.playerId, name: m.name, color: m.color };
    store.set(ID_KEY, m.playerId);
    store.set(NAME_KEY, m.name);
    this._world(m.manifest);
    this.app.onConnection('open');
  }
  on_full(m) {
    this.full = true;
    this.app.onConnection(m.rooms ? 'noRooms' : 'full', m.max);
  }
  on_world(m) { this._world(m.manifest); }
  _world(manifest) {
    this.worldId = manifest.world;
    this.mirror.load(manifest, performance.now());
    this.lists.clear();
    this.traces.clear();
    for (const [key, list] of Object.entries(manifest.behaviors)) this.lists.set(key, list);
    this._players(manifest.players);
    this.app.onWorldLoaded();
  }
  on_players(m) { this._players(m.players); }
  _players(list) {
    this.players = list;
    this.selections = new Map(list.map((p) => [p.id, p.selection]));
    this.app.onPlayers();
  }
  on_selected(m) {
    this.selections.set(m.playerId, m.key);
    const p = this.players.find((x) => x.id === m.playerId);
    if (p) p.selection = m.key;
    this.app.onSelected(m.playerId, m.key);
  }
  on_lockDenied(m) {
    const h = this.players.find((p) => p.id === m.holder);
    this.app.onLockDenied(m.key, h?.name ?? 'Someone');
  }
  on_add(m) { for (const d of m.entities) this.mirror.add(d); this.app.onThingsChanged(); }
  on_remove(m) {
    const gone = new Set(m.ids.map((id) => this.world.entities.get(id)?.thingId).filter(Boolean));
    this.mirror.remove(m.ids);
    for (const key of gone) if (!this.world.actor(key).alive) this.app.onActorRemoved(this.world.actor(key));
    this.app.onThingsChanged();
  }
  on_behaviors(m) {
    const old = this.lists.get(m.key) ?? [];
    const merged = m.list.map((nb) => {
      const ob = old.find((b) => b.id === nb.id);
      if (!ob) return nb;
      const changed = ob.code !== nb.code;
      Object.assign(ob, nb);
      if (changed) { ob.draft = null; ob.changedAt = performance.now(); }
      return ob;
    });
    this.lists.set(m.key, merged);
    this.app.onBehaviorsChanged(m.key);
  }
  on_made(m) { this.app.onMade(m.key, m.what); }
  on_log(m) { this.app.log(m.text, m.level); }
  on_say(m) { const a = this.world.actor(m.key); if (a.alive) this.app.say(a, m.text, m.seconds); }
  on_sound(m) { this.app.audio.play(m.name, m.pos ? { x: m.pos[0], y: m.pos[1], z: m.pos[2] } : null); }
  on_color(m) { this.mirror.color(m.key, m.color, m.part); }
  on_pen(m) { this.mirror.pen(m); }
  on_gravity(m) { this.world.setGravity(m.scale); }
  on_ran(m) {
    const b = this._behavior(m.id);
    if (b) this.app.onScriptRan(b, m.at, m.ok, m.off);
  }
  on_trace(m) {
    let t = this.traces.get(m.id);
    if (!t) this.traces.set(m.id, t = { live: new Set(), lastSeen: new Map() });
    const now = performance.now();
    t.live = new Set(m.live);
    for (const id of [...m.live, ...m.seen]) t.lastSeen.set(id, now);
  }
  on_chat(m) { this.app.chat?.receiveFrom(m); }
  async on_seeRequest(m) {
    const a = this.world.actor(m.key);
    let label = 'none';
    try {
      const image = a.alive ? this.app.snapshot(a) : null;
      if (image) {
        this.app.showSeen(a, image, null);
        const r = await fetch('./api/see', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, labels: m.labels, looker: a.describe().name }),
        });
        const out = await r.json();
        if (!r.ok) throw new Error(out.error ?? `HTTP ${r.status}`);
        label = m.labels.includes(out.label) ? out.label : 'none';
        this.app.log(`👀 ${a.describe().name} sees ${out.seen} → ${out.label}`);
        this.app.showSeen(a, image, label);
      }
    } catch (err) {
      this.app.log(`👀 ${a.describe().name} couldn't look (${err.message}), so it saw "none".`, 'error');
    }
    this._send({ type: 'seeReply', id: m.id, label });
  }

  _behavior(id) { for (const list of this.lists.values()) for (const b of list) if (b.id === id) return b; return null; }

  // ---- what the page does ---------------------------------------------------

  loadWorld(id) { this._send({ type: 'world', id }); }
  reset() { this._send({ type: 'reset' }); }

  select(actor) { this._send({ type: 'select', key: actor?.key ?? null }); }
  holderOf(key) {
    if (!key || key === 'world') return null;
    for (const p of this.players) if (p.selection === key && p.id !== this.me.id) return p;
    return null;
  }
  canEdit(actor) { return !actor || !this.holderOf(actor.key); }

  keyDown(key) { if (this.heldKeys.has(key)) return; this.heldKeys.add(key); this._send({ type: 'key', key, down: true }); }
  keyUp(key) { if (!this.heldKeys.delete(key)) return; this._send({ type: 'key', key, down: false }); }

  addModel(defId, pose) { this._send({ type: 'addModel', defId, pose: { x: pose.x, z: pose.z, yaw: pose.yaw ?? 0 } }); }
  clone(actor) { this._send({ type: 'clone', key: actor.key }); }
  remove(actor) { this._send({ type: 'remove', key: actor.key }); }
  turn(actor) { this._send({ type: 'turn', key: actor.key, degrees: 45 }); }
  respawn(actor) { this._send({ type: 'respawn', key: actor.key }); }

  dragStart(d) {
    this.mirror.hold(d.base.map((b) => b.body));
    this._send({ type: 'dragStart', key: d.actor.key });
    this.dragTimer = setInterval(() => this._sendDrag(d), 1000 / DRAG_HZ);
  }
  drag() {}
  _sendDrag(d) { this._send({ type: 'drag', key: d.actor.key, delta: d.delta.toArray(), yaw: d.yaw }); }
  dragEnd(d) {
    clearInterval(this.dragTimer);
    this._send({ type: 'dragEnd', key: d.actor.key, delta: d.delta.toArray(), yaw: d.yaw, moved: d.moved });
    this.mirror.drop(d.base.map((b) => b.body)); // stays put here until the server places it
  }

  behaviorsOf(key) {
    if (!this.lists.has(key)) this.lists.set(key, []);
    return this.lists.get(key);
  }
  behaviorMap() { return this.lists; }
  _behaviorMsg(b) {
    return { text: b.text, html: b.html, code: b.code, summary: b.summary, title: b.title, notes: b.notes, source: b.source, keys: b.keys ?? null, unknown: b.unknown ?? [] };
  }
  teach(actor, b) {
    const err = syntaxError(b.code);
    if (err) throw new Error(`That code has a typo: ${err}`);
    this._send({ type: 'teach', key: actor.key, behavior: this._behaviorMsg(b) });
    return null;
  }
  change(actor, b, res) { this._send({ type: 'change', key: actor.key, id: b.id, behavior: this._behaviorMsg(res) }); }
  setEnabled(actor, b, on) { b.enabled = on; this._send({ type: 'behavior', key: actor.key, id: b.id, op: on ? 'enable' : 'disable' }); }
  deleteBehavior(actor, b) {
    const list = this.behaviorsOf(actor.key);
    const i = list.indexOf(b);
    if (i >= 0) list.splice(i, 1); // gone here at once; the server's list follows
    this._send({ type: 'behavior', key: actor.key, id: b.id, op: 'delete' });
  }
  editCode(actor, b, code) {
    const err = syntaxError(code);
    if (err) throw new Error(`That code has a typo: ${err}`);
    b.draft = null;
    this._send({ type: 'behavior', key: actor.key, id: b.id, op: 'edit', code });
  }
  runScript(actor, b, at) { this._send({ type: 'run', key: actor.key, id: b.id, at }); return true; }
  traceOf(actor, b) { return b.running ? this.traces.get(b.id) ?? null : null; }
  running() { const out = []; for (const [key, list] of this.lists) for (const b of list) if (b.enabled) out.push(`${key}:${b.running ? 'ok' : 'loading'}`); return out; }

  chat(phrases) { this._send({ type: 'chat', phrases }); }
  rename(name) { name = String(name).trim().slice(0, 24); if (!name) return; store.set(NAME_KEY, name); this._send({ type: 'rename', name }); }
  exportState() { return { added: [], moved: [], deleted: [], behaviors: this.lists }; }

  update() { this.mirror.update(performance.now()); }
  close() { this.closed = true; this.ws?.close(); }
}


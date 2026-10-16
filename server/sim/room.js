// A room: one world, stepped here and nowhere else, the programs taught to
// the things in it, and the players looking at it. Players send intents
// (select, keys, drags, teach...), the room applies them through the same
// Stage and Runtime the single-player page uses, and sends back snapshots of
// where everything is plus events for what the snapshot can't carry.
import * as THREE from 'three';
import { World } from '../../src/world/world.js';
import { Runtime } from '../../src/behavior/runtime.js';
import { Stage } from '../../src/stage.js';
import { WORLDS_BY_ID } from '../../src/world/worlds.js';
import { LIBRARY_BY_ID } from '../../src/world/library.js';
import { OBJECTS_BY_ID } from '../../src/world/objects.js';
import { describeEntity, describeBehavior } from '../../src/net/entities.js';
import { quantize, sameQuant, encodeSnapshot } from '../../src/net/codec.js';
import { dragBase, holdDrag } from '../../src/world/drag.js';
import { validateMessage } from '../../src/chat/symbols.js';
import { validate } from './protocol.js';

export const PLAYER_COLORS = ['#e4572e', '#2e86de', '#f4b400', '#2a9d3a', '#8d4fc0', '#f28ec3'];
const NAMES = ['Fox', 'Owl', 'Bear', 'Otter', 'Hare', 'Frog', 'Lynx', 'Crow', 'Mole', 'Wren'];
export const MAX_PLAYERS = 6;
const SNAP_MS = 50;
const FULL_MS = 2000;
const MSGS_PER_SEC = 60;
const SEE_TIMEOUT = 8000;
const MAX_ADDED_PER_PLAYER = 12; // models from the library
const MAX_BEHAVIORS_PER_PLAYER = 40;

const now = () => performance.now();

export class Room {
  // makeSandbox(opts) -> Sandbox; onEmpty(room) when the last player left and the idle time passed
  constructor({ id, RAPIER, makeSandbox, worldId = 'playground', log = () => {}, onEmpty = null, idleMs = 10 * 60 * 1000 }) {
    this.id = id;
    this.log = log;
    this.makeSandbox = makeSandbox;
    this.onEmpty = onEmpty;
    this.idleMs = idleMs;
    this.players = new Map(); // id -> Player
    this.locks = new Map(); // actor key -> player id
    this.sandboxes = new Map(); // owner ('room' or a player id) -> Sandbox
    this.drags = new Map(); // player id -> {actor, pivot, base, delta, yaw}
    this.bids = new Map(); // body -> body id
    this.byBid = new Map(); // body id -> body
    this.nextBid = 1;
    this.lastSent = new Map(); // bid -> quantized transform
    this.pending = { adds: [], removes: [], dirty: new Set() };
    this.quiet = true; // while a world is being built: no add/remove events, a fresh manifest instead
    this.groundColor = null;
    this.seeRequests = new Map(); // id -> resolve
    this.nextSee = 1;
    this.stats = { bytes: 0, stepMs: 0, steps: 0, dropped: 0 };
    this.created = now();

    this.world = new World(RAPIER, new THREE.Scene());
    this.world.onEntityAdded = (e) => this._entityAdded(e);
    this.world.onEntityRemoved = (e) => this._entityRemoved(e);
    this.events = new RoomEvents(this);
    this.runtime = new Runtime({ world: this.world, audio: this.events.audio, ui: this.events, sandboxFor: (p) => this._sandboxFor(p) });
    this.stage = new Stage({ world: this.world, runtime: this.runtime, ui: this.events, view: null });
    this.loadWorld(WORLDS_BY_ID[worldId] ? worldId : 'playground');

    this.lastTick = now();
    this.lastSnap = now();
    this.lastFull = now();
    this.timer = setInterval(() => this._tick(), 16);
    this.minute = setInterval(() => this._report(), 60_000);
    this._armIdle();
  }

  // ---- lifecycle ------------------------------------------------------------

  dispose() {
    clearInterval(this.timer);
    clearInterval(this.minute);
    clearTimeout(this.idleTimer);
    for (const r of this.seeRequests.values()) r('none');
    this.seeRequests.clear();
    this.runtime.dispose();
    for (const s of this.sandboxes.values()) s.terminate();
    this.sandboxes.clear();
    try { this.world.physics.free(); } catch { /* already freed */ }
    this.disposed = true;
  }

  _armIdle() {
    clearTimeout(this.idleTimer);
    if (this.players.size) return;
    this.idleTimer = setTimeout(() => { if (!this.players.size) this.onEmpty?.(this); }, this.idleMs);
  }

  loadWorld(id) {
    this.quiet = true;
    this.stage.load(id);
  }

  // ---- players --------------------------------------------------------------

  // socket: {send(data), close()}; hello: the validated hello message
  join(socket, hello) {
    if (this.players.size >= MAX_PLAYERS) {
      socket.send(JSON.stringify({ type: 'full', max: MAX_PLAYERS }));
      socket.close();
      return null;
    }
    const used = new Set([...this.players.values()].map((p) => p.color));
    const id = hello.playerId && !this.players.has(hello.playerId) ? hello.playerId : `p${Math.random().toString(36).slice(2, 8)}`;
    const name = (hello.name ?? '').trim() || `${NAMES[this.players.size % NAMES.length]} ${this.players.size + 1}`;
    const player = {
      id, name, socket, color: PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[this.players.size % PLAYER_COLORS.length],
      selection: null, joined: now(), msgs: [], added: 0, taught: 0,
    };
    this.players.set(id, player);
    clearTimeout(this.idleTimer);
    this.send(player, { type: 'welcome', playerId: id, name, color: player.color, manifest: this.manifest() });
    this.broadcast({ type: 'players', players: this.playerList() });
    this.events.log(`👋 ${name} is here`);
    this.log(`room ${this.id}: ${name} joined (${this.players.size} players)`);
    return player;
  }

  leave(player) {
    if (!this.players.has(player.id)) return;
    this.players.delete(player.id);
    this._endDrag(player, null);
    this._select(player, null);
    this.runtime.dropListener(player.id);
    // Their programs keep running, in the room's own sandbox now (they start over).
    const s = this.sandboxes.get(player.id);
    for (const p of [...this.runtime.programs]) {
      if (p.owner !== player.id) continue;
      const { actor, behavior, isClone } = p;
      p.stop();
      if (behavior.enabled && actor.alive) this.runtime.start(actor, behavior, { owner: null, isClone });
    }
    if (s) { this.sandboxes.delete(player.id); s.terminate(); }
    for (const [id, r] of [...this.seeRequests]) if (r.player === player.id) { this.seeRequests.delete(id); r.resolve('none'); }
    this.broadcast({ type: 'players', players: this.playerList() });
    this.events.log(`👋 ${player.name} left`);
    this.log(`room ${this.id}: ${player.name} left (${this.players.size} players)`);
    this._armIdle();
  }

  playerList() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, selection: p.selection }));
  }

  send(player, msg) {
    try {
      const data = msg instanceof ArrayBuffer ? msg : JSON.stringify(msg);
      this.stats.bytes += typeof data === 'string' ? data.length : data.byteLength;
      player.socket.send(data);
    } catch { /* socket gone; the server will call leave */ }
  }

  broadcast(msg, { except = null, to = null } = {}) {
    for (const p of this.players.values()) {
      if (p === except) continue;
      if (to && !to(p)) continue;
      this.send(p, msg);
    }
  }

  // The players looking at an actor (its lock holder, or everyone with the World selected).
  _watching(key) { return (p) => p.selection === key; }

  // ---- locks ----------------------------------------------------------------

  holder(key) { return this.locks.get(key) ?? null; }
  owns(player, key) { return key === 'world' || this.locks.get(key) === player.id; }

  _select(player, key) {
    const prev = player.selection;
    if (prev && prev !== 'world' && this.locks.get(prev) === player.id) this.locks.delete(prev);
    if (key && key !== 'world') {
      const other = this.locks.get(key);
      if (other && other !== player.id) {
        player.selection = null;
        this.runtime.setKeyTarget(null, player.id);
        this.send(player, { type: 'lockDenied', key, holder: other });
        this.broadcast({ type: 'selected', playerId: player.id, key: null });
        return false;
      }
      if (!this.world.actor(key).alive) key = null;
      else this.locks.set(key, player.id);
    }
    player.selection = key;
    this.runtime.setKeyTarget(key ? this.world.actor(key) : null, player.id);
    this.broadcast({ type: 'selected', playerId: player.id, key });
    return true;
  }

  // ---- messages from a player -----------------------------------------------

  handle(player, raw) {
    const t = now();
    player.msgs = player.msgs.filter((x) => t - x < 1000);
    if (player.msgs.length >= MSGS_PER_SEC) { this.stats.dropped++; return; }
    player.msgs.push(t);
    const m = validate(raw);
    if (!m) { this.stats.dropped++; return; }
    const fn = this[`on_${m.type}`];
    if (!fn) return;
    try { fn.call(this, player, m); } catch (err) {
      this.send(player, { type: 'log', text: `${err.message}`, level: 'error' });
    }
  }

  _actor(player, key, { needLock = true } = {}) {
    const a = this.world.actor(key);
    if (!a.alive) return null;
    if (needLock && !this.owns(player, key)) {
      const h = this.players.get(this.holder(key));
      throw new Error(h ? `${h.name} is using ${a.name} right now.` : `Select ${a.name} first.`);
    }
    return a;
  }

  on_select(player, m) { this._select(player, m.key); }

  on_key(player, m) {
    if (!player.selection) return;
    if (m.down) this.runtime.keyDown(m.key, player.id); else this.runtime.keyUp(m.key, player.id);
  }

  on_dragStart(player, m) {
    const a = this._actor(player, m.key);
    if (!a || a.isWorld || a.fixed) return; // a fixed thing (a playing field) can't be dragged
    this._endDrag(player, null);
    this.drags.set(player.id, { actor: a, pivot: a.position, base: dragBase(a), delta: new THREE.Vector3(), yaw: 0 });
  }
  on_drag(player, m) {
    const d = this.drags.get(player.id);
    if (!d || d.actor.key !== m.key) return;
    d.delta.set(...m.delta);
    d.yaw = m.yaw;
  }
  on_dragEnd(player, m) {
    const d = this.drags.get(player.id);
    if (!d || d.actor.key !== m.key) return;
    d.delta.set(...m.delta);
    d.yaw = m.yaw;
    this._endDrag(player, m.moved || !!m.yaw);
  }
  // apply: true applies the move for real, false puts it back, null means whatever it looks like
  _endDrag(player, apply) {
    const d = this.drags.get(player.id);
    if (!d) return;
    this.drags.delete(player.id);
    if (!d.actor.alive) return;
    holdDrag({ ...d, delta: new THREE.Vector3(), yaw: 0 }, 0); // back where it started
    const moved = apply ?? (d.delta.length() > 0.2 || !!d.yaw);
    if (moved) this.stage.endDrag(d.actor, d.delta, d.yaw, d.pivot);
  }

  on_turn(player, m) { const a = this._actor(player, m.key); if (a) this.stage.turn(a, m.degrees); }
  on_respawn(player, m) { const a = this._actor(player, m.key); if (a) this.stage.respawn(a); }
  on_clone(player, m) {
    const a = this._actor(player, m.key);
    if (!a || a.isWorld) return;
    const copy = this.stage.cloneActor(a, null);
    this._flush(); // the copy's add goes out before the reply that names it
    if (copy) this.send(player, { type: 'made', key: copy.key, what: 'copy' });
  }
  on_remove(player, m) {
    const a = this._actor(player, m.key);
    if (!a || a.isWorld) return;
    this.stage.removeActor(a, { forever: true });
    this.events.log(`🗑 ${player.name} removed ${a.name}`);
  }
  on_addModel(player, m) {
    if (!LIBRARY_BY_ID[m.defId] && !OBJECTS_BY_ID[m.defId]) return;
    if (player.added >= MAX_ADDED_PER_PLAYER) throw new Error(`That's ${MAX_ADDED_PER_PLAYER} models from you already. Delete some first.`);
    player.added++;
    const a = this.stage.addModel(m.defId, m.pose);
    this._flush();
    this.send(player, { type: 'made', key: a.key, what: 'model' });
  }

  on_teach(player, m) {
    const a = this._actor(player, m.key);
    if (!a) return;
    if (player.taught >= MAX_BEHAVIORS_PER_PLAYER) throw new Error(`That's ${MAX_BEHAVIORS_PER_PLAYER} behaviors from you already.`);
    player.taught++;
    this.stage.teach(a, { ...m.behavior, by: player.id });
  }
  on_change(player, m) {
    const a = this._actor(player, m.key);
    const b = a && this.stage.behaviorsOf(a.key).find((x) => x.id === m.id);
    if (!b) return;
    this.stage.changeBehavior(a, b, { ...m.behavior, by: player.id });
  }
  on_behavior(player, m) {
    const a = this._actor(player, m.key);
    const b = a && this.stage.behaviorsOf(a.key).find((x) => x.id === m.id);
    if (!b) return;
    switch (m.op) {
      case 'enable': this.stage.setEnabled(a, b, true); break;
      case 'disable': this.stage.setEnabled(a, b, false); break;
      case 'delete': this.stage.deleteBehavior(a, b); break;
      case 'edit': if (m.code != null) this.stage.editCode(a, b, m.code, player.id); break;
    }
  }
  on_run(player, m) {
    const a = this._actor(player, m.key);
    const b = a && this.stage.behaviorsOf(a.key).find((x) => x.id === m.id);
    if (!b) return;
    const p = this.stage.programOf(a, b);
    if (!p) { this.send(player, { type: 'ran', id: b.id, at: m.at, ok: false, off: true }); return; }
    p.runScript(m.at);
  }

  on_reset(player) {
    this.quiet = true;
    this.stage.reset();
    this.events.log(`⟲ ${player.name} reset the world`);
  }
  on_world(player, m) {
    if (!WORLDS_BY_ID[m.id] || m.id === this.stage.worldId) return;
    this.loadWorld(m.id);
    this.events.log(`${WORLDS_BY_ID[m.id].emoji} ${player.name} switched to ${WORLDS_BY_ID[m.id].name}`);
  }

  // Brick Talk: only symbol ids ever cross; the words stay on the sender's page.
  on_chat(player, m) {
    if (!validateMessage(m.phrases).ok) return;
    this.broadcast({ type: 'chat', from: player.id, name: player.name, phrases: m.phrases, key: player.selection });
  }

  on_seeReply(player, m) {
    const r = this.seeRequests.get(m.id);
    if (!r || r.player !== player.id) return;
    this.seeRequests.delete(m.id);
    r.resolve(m.label);
  }

  on_pong() {}

  on_rename(player, m) {
    const was = player.name;
    player.name = m.name;
    this.broadcast({ type: 'players', players: this.playerList() });
    this.events.log(`✏️ ${was} is now ${player.name}`);
  }

  // Ask a player's page to look through a thing's eyes.
  see(actor, labels) {
    const holder = this.players.get(this.holder(actor.key));
    const player = holder ?? [...this.players.values()][0];
    if (!player) return Promise.resolve('none');
    const id = this.nextSee++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { if (this.seeRequests.delete(id)) resolve('none'); }, SEE_TIMEOUT);
      this.seeRequests.set(id, { player: player.id, resolve: (label) => { clearTimeout(timer); resolve(label); } });
      this.send(player, { type: 'seeRequest', id, key: actor.key, labels });
    });
  }

  // ---- sandboxes ------------------------------------------------------------

  _sandboxFor(program) {
    const owner = program.owner && this.players.has(program.owner) ? program.owner : 'room';
    let s = this.sandboxes.get(owner);
    if (!s || s.dead) {
      s = this.makeSandbox({ shared: true, label: `${this.id}/${owner}` });
      s.onDead = () => { if (this.sandboxes.get(owner) === s) this.sandboxes.delete(owner); };
      this.sandboxes.set(owner, s);
    }
    return s;
  }

  // ---- the world over the wire ----------------------------------------------

  _entityAdded(e) {
    const bids = e.bodies.map(({ body }) => {
      let bid = this.nextBid;
      while (this.byBid.has(bid) || bid === 0) bid = (bid % 65535) + 1;
      this.nextBid = (bid % 65535) + 1;
      this.bids.set(body, bid);
      this.byBid.set(bid, body);
      return bid;
    });
    e.bids = bids;
    if (!this.quiet) this.pending.adds.push(describeEntity(e, bids));
  }
  _entityRemoved(e) {
    for (const bid of e.bids ?? []) {
      const body = this.byBid.get(bid);
      this.byBid.delete(bid);
      this.lastSent.delete(bid);
      if (body) this.bids.delete(body);
    }
    if (!this.quiet) this.pending.removes.push(e.id);
    for (const [pid, d] of this.drags) if (d.actor.has(e)) this.drags.delete(pid);
  }

  manifest() {
    const entities = [];
    for (const e of this.world.entities.values()) if (e.kind !== 'ground' && e.bids) entities.push(describeEntity(e, e.bids));
    const behaviors = {};
    for (const [key, list] of this.stage.state.behaviors) if (list.length) behaviors[key] = list.map(describeBehavior);
    const pens = [...(this.world.pens?.values() ?? [])].map((p) => ({ key: p.key, down: p.down, color: p.color, size: p.size }));
    return {
      world: this.stage.worldId, gravity: this.world.gravityScale, groundColor: this.groundColor,
      entities, behaviors, players: this.playerList(), pens, t: now(),
    };
  }

  // The world was rebuilt (loaded, Reset): everyone gets it fresh.
  _rebuilt() {
    this.quiet = false;
    this.pending.adds = [];
    this.pending.removes = [];
    this.pending.dirty.clear();
    this.lastSent.clear();
    this.groundColor = null;
    for (const p of this.players.values()) {
      if (p.selection && p.selection !== 'world' && !this.world.actor(p.selection).alive) this._select(p, null);
    }
    this.drags.clear();
    this.broadcast({ type: 'world', manifest: this.manifest() });
  }

  _actorRemoved(actor) {
    for (const p of this.players.values()) if (p.selection === actor.key) this._select(p, null);
    this.pending.dirty.add(actor.key);
  }

  _tick() {
    if (this.disposed) return;
    const t = now();
    const dt = Math.min(0.1, (t - this.lastTick) / 1000);
    this.lastTick = t;
    for (const d of this.drags.values()) if (d.actor.alive) holdDrag(d);
    const t0 = now();
    this.world.step(dt);
    this.stats.stepMs += now() - t0;
    this.stats.steps++;
    this._flush();
    if (t - this.lastSnap >= SNAP_MS) {
      const full = t - this.lastFull >= FULL_MS;
      this.lastSnap = t;
      if (full) this.lastFull = t;
      this._snapshot(full);
    }
  }

  // Events that piled up this tick: added and removed things, changed behavior lists.
  _flush() {
    const p = this.pending;
    if (p.removes.length) { this.broadcast({ type: 'remove', ids: p.removes }); p.removes = []; }
    if (p.adds.length) { this.broadcast({ type: 'add', entities: p.adds }); p.adds = []; }
    for (const key of p.dirty) {
      const list = this.stage.state.behaviors.get(key) ?? [];
      this.broadcast({ type: 'behaviors', key, list: list.map(describeBehavior) });
    }
    p.dirty.clear();
  }

  _snapshot(full) {
    if (!this.players.size) return;
    const bodies = [];
    for (const [bid, body] of this.byBid) {
      if (!full && body.isSleeping()) continue;
      const qv = quantize(body.translation(), body.rotation());
      if (!full && sameQuant(qv, this.lastSent.get(bid))) continue;
      this.lastSent.set(bid, qv);
      bodies.push([bid, qv]);
    }
    if (!bodies.length && !full) return;
    this.broadcast(encodeSnapshot({ t: now(), full, bodies }));
  }

  _report() {
    let awake = 0;
    for (const body of this.byBid.values()) if (!body.isSleeping()) awake++;
    const s = this.stats;
    this.log(`room ${this.id}: ${this.players.size} players, ${this.byBid.size} bodies (${awake} awake), ${(s.bytes / 60 / 1024).toFixed(1)} KB/s, step ${(s.stepMs / Math.max(1, s.steps)).toFixed(2)} ms, ${this.runtime.programs.size} programs, ${s.dropped} dropped`);
    this.stats = { bytes: 0, stepMs: 0, steps: 0, dropped: 0 };
  }
}

// Where the Runtime's and Stage's side effects go: to the players, as messages.
class RoomEvents {
  constructor(room) {
    this.room = room;
    this.audio = { play: (name, pos) => room.broadcast({ type: 'sound', name, pos: pos ? [pos.x, pos.y, pos.z] : null }) };
  }
  log(text, level = 'info') { this.room.broadcast({ type: 'log', text: String(text).slice(0, 400), level }); }
  say(actor, text, seconds) { this.room.broadcast({ type: 'say', key: actor.key, text, seconds }); }
  onShow(actor, text) { this.room.broadcast({ type: 'show', key: actor.key, text }); }
  onProgramsChanged(program) { if (program) this.room.pending.dirty.add(program.actor.key); }
  onBehaviorsChanged(actor) { this.room.pending.dirty.add(actor.key); }
  onScriptRan(b, at, ok) { this.room.broadcast({ type: 'ran', id: b.id, at, ok }); }
  onTrace(program, m) {
    const key = program.actor.key;
    this.room.broadcast({ type: 'trace', key, id: program.behavior.id, live: m.live, seen: m.seen }, { to: this.room._watching(key) });
  }
  onColor(actor, color, part) {
    if (actor.isWorld) this.room.groundColor = color;
    this.room.broadcast({ type: 'color', key: actor.key, color, part });
  }
  onPen(key, pen) { this.room.broadcast(key ? { type: 'pen', key, down: pen.down, color: pen.color, size: pen.size } : { type: 'pen', key: null }); }
  onGravity(scale) { this.room.broadcast({ type: 'gravity', scale }); }
  onActorAdded(actor) { this.room.pending.dirty.add(actor.key); }
  onActorRemoved(actor) { this.room._actorRemoved(actor); }
  onWorldRebuilt() { this.room._rebuilt(); }
  see(actor, labels) { return this.room.see(actor, labels); }
}

// Host side of the sandbox: owns one Worker per running behavior, validates
// every command it sends, and turns primitives into physics on the thing the
// program belongs to (an Actor: a model, an assembly, one brick, or the World).
import * as THREE from 'three';
import { COLORS, SOUNDS, HOST_COMMANDS, HOST_QUERIES } from './primitives.js';
import { SIZES, BRICK_H, material, colorHex } from '../world/bricks.js';
import { matchFilter } from './filter.js';
import { instrument } from './trace.js';

export { matchFilter };

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));
const wrap180 = (a) => ((a + 540) % 360) - 180;
const MAX_SPEED = 50; // studs a second, for drive, speedUp, move and goTo
const TURN_RATE = 360; // degrees a second for turn() and face(); they ease in at the end
const MAX_SPAWNED_PER_ACTOR = 60;
// What the World can't do, and how to say so.
const NOT_FOR_WORLD = new Set(['drive', 'speedUp', 'slowDown', 'steer', 'rise', 'jump', 'push', 'partSpin', 'partColor', 'explode', 'see', 'remove', 'move', 'turn', 'goTo', 'face', 'teleport', 'partTurnTo', 'partWiggle', 'look']);

export class Runtime {
  constructor({ world, audio, ui }) {
    this.world = world;
    this.audio = audio;
    this.ui = ui;
    this.stage = null; // set by the Stage (clone, remove)
    this.programs = new Set();
    this.heldKeys = new Set();
    this.keyTarget = null; // only the selected actor hears keys
    this.contacts = new Map(); // entity -> Map(otherColliderKey -> info)
    world.onCollision = (a, b, started) => this._collision(a, b, started);
    world.beforeStep = (dt) => this._tick(dt);
    this._tickTimer = setInterval(() => this._keyTick(), 33);
    this._watchdog = setInterval(() => this._ping(), 1000);
  }

  // ---- program lifecycle ----------------------------------------------------

  start(actor, behavior, opts = {}) {
    const p = new Program(this, actor, behavior, opts);
    this.programs.add(p);
    p.start();
    return p;
  }

  stopAll(actor) {
    for (const p of [...this.programs]) if (!actor || p.actor === actor) p.stop();
    if (actor) this.resetControls(actor);
    else for (const a of this.world.actors.values()) this.resetControls(a);
  }

  resetControls(actor) {
    const c = actor.control;
    c.drive = 0; c.steer = 0; c.rise = 0;
    for (const part of actor.model?.parts.values() ?? []) part.spin = 0;
  }

  // ---- input ----------------------------------------------------------------

  setKeyTarget(actor) {
    if (actor === this.keyTarget) return;
    for (const k of [...this.heldKeys]) this.keyUp(k); // let go of keys held for the old target
    this.keyTarget = actor;
  }
  _hearsKeys(p) { return this.keyTarget && p.actor === this.keyTarget; }

  keyDown(key) {
    if (this.heldKeys.has(key)) return;
    this.heldKeys.add(key);
    for (const p of this.programs) if (this._hearsKeys(p)) p.send({ type: 'key', key }, key);
  }
  keyUp(key) {
    if (!this.heldKeys.delete(key)) return;
    for (const p of this.programs) if (this._hearsKeys(p)) p.send({ type: 'keyup', key }, key);
  }
  broadcast(name) {
    for (const p of this.programs) p.send({ type: 'message', name });
  }
  _keyTick() {
    if (!this.heldKeys.size) return;
    for (const p of this.programs) if (this._hearsKeys(p)) p.send({ type: 'tick' });
  }
  _ping() { for (const p of this.programs) p.ping(); }

  // ---- physics hooks --------------------------------------------------------

  _collision(a, b, started) {
    for (const [self, other] of [[a, b], [b, a]]) {
      if (!this.contacts.has(self.entity)) this.contacts.set(self.entity, new Map());
      const map = this.contacts.get(self.entity);
      const key = `${other.entity.id}|${other.part ?? ''}|${other.color}`;
      if (!started) { map.delete(key); continue; }
      map.set(key, other);
      if (!this.programs.size) continue;
      const desc = { ...other.entity.describe(), color: other.color };
      for (const p of this.programs) {
        if (p.actor.has(self.entity) && !p.actor.has(other.entity)) p.touched(desc);
      }
    }
  }

  _tick(dt) {
    for (const p of this.programs) p.tickTasks(dt);
  }

  // ---- shared helpers used by Program ---------------------------------------

  // A thing("id") reference, a kind/color/name filter, or 'me' -> an Actor.
  resolveActor(self, what) {
    if (what == null || what === 'me' || what === 'myself' || what === 'self') return self;
    if (typeof what === 'object' && what.__ref === 'thing') {
      const a = this.world.actor(what.id);
      return a.alive ? a : null;
    }
    if (typeof what === 'string') {
      if (this.world.byThing.has(what) || this.world.entities.has(what)) return this.world.actor(what);
      const n = this.nearest(self, what);
      return n ? this.world.actor(n.entity.thingId) : null;
    }
    return null;
  }

  resolveTarget(self, target) {
    const w = this.world;
    if (target && typeof target === 'object') {
      if (target.__ref === 'place') return { pos: new THREE.Vector3(clamp(target.x, -100, 100), 0, clamp(target.z, -100, 100)), radius: 1.5 };
      if (target.__ref === 'thing') {
        const c = w.thingCenter(target.id);
        return c ? { pos: c, radius: 4 } : null;
      }
    }
    if (typeof target === 'string') {
      const thingCenter = w.thingCenter(target);
      if (thingCenter) return { pos: thingCenter, radius: 4 };
      const n = this.nearest(self, target);
      return n ? { pos: n.pos, radius: 4 } : null;
    }
    return null;
  }

  nearest(self, filter) {
    let best = null;
    const here = self.position;
    for (const [thingId, e] of this.world.things()) {
      if (thingId === self.key || self.has(e)) continue;
      if (e.owner === self && e.kind === 'brick' && filter == null) continue; // ignore own fresh spawns by default
      if (!matchFilter(filter, e.describe())) continue;
      const pos = this.world.thingCenter(thingId);
      const d = pos.clone().setY(0).distanceTo(here.clone().setY(0));
      if (!best || d < best.distance) best = { entity: e, pos, distance: d };
    }
    return best;
  }

  angleTo(self, pos) {
    const here = self.position;
    const want = Math.atan2(pos.x - here.x, pos.z - here.z) / DEG;
    return wrap180(want - self.heading());
  }
}

// One running behavior (one worker).
class Program {
  constructor(rt, actor, behavior, { isClone = false } = {}) {
    this.rt = rt;
    this.actor = actor;
    this.behavior = behavior;
    this.isClone = isClone;
    this.worker = null;
    this.keys = new Set();
    this.touchFilters = [];
    this.tasks = [];
    this.lastPong = performance.now();
    this.touchCooldown = new Map();
    this.spawnTimes = [];
    this.cloneTimes = [];
    this.live = new Set(); // statements running now (block ids, see trace.js)
    this.lastSeen = new Map(); // block id -> when it last ran
  }

  get label() { return `${this.actor.name} · ${this.behavior.title ?? 'behavior'}`; }
  get world() { return this.rt.world; }

  start() {
    this.worker = new Worker(new URL('./sandbox.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => this._onMessage(ev.data);
    this.worker.onerror = (ev) => { ev.preventDefault?.(); this._error(ev.message ?? 'worker error', true); };
    this.worker.postMessage({ type: 'load', code: instrument(this.behavior.code), isClone: this.isClone });
    this.lastPong = performance.now();
  }

  stop(reason) {
    if (!this.worker) return;
    try { this.worker.postMessage({ type: 'stop' }); } catch { /* gone */ }
    this.worker.terminate();
    this.worker = null;
    for (const t of this.tasks) t.finish?.();
    this.tasks = [];
    this.rt.programs.delete(this);
    this.behavior.running = false;
    if (reason) this.rt.ui.log(`${this.label}: ${reason}`, 'error');
    this.rt.ui.onProgramsChanged?.();
  }

  send(msg, key) {
    if (!this.worker) return;
    if (key !== undefined && !this.keys.has(key)) return;
    if (msg.type === 'tick' && !this.keys.size) return;
    this.worker.postMessage(msg);
  }

  ping() {
    if (!this.worker) return;
    if (performance.now() - this.lastPong > 3500) {
      this.stop('got stuck — a loop never paused. Try adding wait() inside it.');
      return;
    }
    this.worker.postMessage({ type: 'ping', t: performance.now() });
  }

  touched(desc) {
    if (!this.worker || !this.touchFilters.length) return;
    const now = performance.now();
    const k = desc.id;
    if (now - (this.touchCooldown.get(k) ?? 0) < 400) return;
    const matches = [];
    this.touchFilters.forEach((f, i) => { if (matchFilter(f, desc)) matches.push(i); });
    if (!matches.length) return;
    this.touchCooldown.set(k, now);
    this.worker.postMessage({ type: 'touch', thing: desc, matches });
  }

  _error(message, fatal) {
    this.rt.ui.log(`${this.label}: ${message}`, 'error');
    if (fatal) this.stop();
  }

  _onMessage(m) {
    switch (m.type) {
      case 'ready':
        this.keys = new Set(m.keys);
        this.touchFilters = m.touchFilters;
        this.behavior.running = true;
        this.rt.ui.onProgramsChanged?.();
        break;
      case 'pong': this.lastPong = performance.now(); break;
      case 'ran': this.rt.ui.onScriptRan?.(this.behavior, m.at, m.ok); break;
      case 'trace': {
        const ids = (a) => (Array.isArray(a) ? a.slice(0, 500).filter(Number.isInteger) : []);
        const now = performance.now();
        this.live = new Set(ids(m.live));
        for (const id of [...this.live, ...ids(m.seen)]) this.lastSeen.set(id, now);
        break;
      }
      case 'error': this._error(m.message, m.fatal); break;
      case 'cmd':
        if (!HOST_COMMANDS.has(m.name)) return this._error(`unknown command ${m.name}`);
        if (!this.actor.alive) return;
        try { this._check(m.name); this[`cmd_${m.name}`](...(m.args ?? [])); } catch (err) { this._error(`${m.name}: ${err.message}`); }
        break;
      case 'query': {
        if (!HOST_QUERIES.has(m.name) || !this.actor.alive) return this._reply(m.id, null);
        let result;
        try { this._check(m.name); result = this[`q_${m.name}`](...(m.args ?? [])); } catch (err) { this._error(`${m.name}: ${err.message}`); result = null; }
        Promise.resolve(result).then((v) => this._reply(m.id, v ?? null));
        break;
      }
    }
  }

  _check(name) {
    if (this.actor.isWorld && NOT_FOR_WORLD.has(name)) {
      throw new Error("the World stays put. Teach a thing in the world to do that, or use clone() and spawn() from here.");
    }
    if (name === 'gravity' && !this.actor.isWorld) {
      throw new Error('only the World can change gravity. Click the ground to teach the World.');
    }
  }

  _reply(id, value) { this.worker?.postMessage({ type: 'reply', id, value }); }

  // Run one stack of blocks once (it was clicked): the program fires that
  // script's handler as if its event happened. at: the top block's id.
  runScript(at) { this.worker?.postMessage({ type: 'run', at }); }

  // A task runs every physics step until update() returns true.
  _task(update, timeout, onEnd) {
    return new Promise((resolve) => {
      let t = 0;
      const task = {
        update: (dt) => { t += dt; return update(dt, t) || t > timeout; },
        finish: () => { onEnd?.(); resolve(true); },
      };
      this.tasks.push(task);
    });
  }

  tickTasks(dt) {
    if (!this.tasks.length) return;
    if (!this.actor.alive) { for (const t of this.tasks) t.finish(); this.tasks = []; return; }
    const done = [];
    for (const t of this.tasks) if (t.update(dt)) done.push(t);
    for (const t of done) { this.tasks.splice(this.tasks.indexOf(t), 1); t.finish(); }
  }

  _part(name) {
    const e = this.actor.model;
    if (!e || !e.parts.size) throw new Error(`${this.actor.name} has no parts that move.`);
    const n = String(name).toLowerCase().trim();
    if (e.parts.has(n)) return e.parts.get(n);
    for (const [k, p] of e.parts) if (k.includes(n) || n.includes(k)) return p;
    // "arm" -> first part containing "arm"; "wheels" handled by caller
    for (const [k, p] of e.parts) if (n.split(' ').some((w) => w.length > 2 && k.includes(w))) return p;
    throw new Error(`${e.name} has no part called "${name}". Parts: ${[...e.parts.keys()].join(', ')}`);
  }

  get control() { return this.actor.control; }

  // ---- commands -------------------------------------------------------------

  cmd_drive(speed) { this.control.drive = clamp(speed, -MAX_SPEED, MAX_SPEED); }
  // Like a toy car's gas and reverse: speeding up adds forward speed, and
  // slowing down takes it away, past 0 into backing up.
  cmd_speedUp(amount) {
    const c = this.control;
    c.drive = clamp(c.drive + clamp(amount, 0, MAX_SPEED), -MAX_SPEED, MAX_SPEED);
  }
  cmd_slowDown(amount) {
    const c = this.control;
    c.drive = clamp(c.drive - clamp(amount, 0, MAX_SPEED), -MAX_SPEED, MAX_SPEED);
  }
  cmd_steer(rate) { this.control.steer = clamp(rate, -360, 360); }
  cmd_rise(speed) { this.control.rise = clamp(speed, -20, 20); }
  cmd_stop() {
    for (const t of this.tasks) t.finish();
    this.tasks = [];
    this.rt.resetControls(this.actor);
  }
  cmd_jump(power) {
    const a = this.actor;
    const dyn = a.bodies().find(({ body }) => body.isDynamic());
    if (!dyn || Math.abs(dyn.body.linvel().y) > 2) return; // can't, or already in the air
    const v = 5 + clamp(power, 1, 10) * 1.6;
    a.kick({ x: 0, y: v, z: 0 });
    this.rt.audio.play('boing', a.position);
  }
  cmd_push(direction, power) {
    const a = this.actor;
    const f = a.forward();
    const left = new THREE.Vector3(0, 1, 0).cross(f);
    const dirs = { forward: f, backward: f.clone().negate(), back: f.clone().negate(), left, right: left.clone().negate(), up: new THREE.Vector3(0, 1, 0), down: new THREE.Vector3(0, -1, 0) };
    const d = dirs[String(direction).toLowerCase()] ?? f;
    a.kick(d.multiplyScalar(clamp(power, 1, 10) * 2.5));
  }
  cmd_partSpin(name, speed) {
    const n = String(name).toLowerCase();
    if (n.includes('wheel')) {
      this.control.drive = clamp(speed / 30, -MAX_SPEED, MAX_SPEED);
      return;
    }
    const p = this._part(name);
    if (p.def.kind !== 'hinge') return;
    p.spin = clamp(speed, -1080, 1080);
    if (!p.spin) this._settleHinge(p);
  }
  _settleHinge(p) {
    // after spinning, come back to the nearest pose inside the limits
    const [lo, hi] = p.def.limits ?? [-180, 180];
    p.angle = clamp(0, lo, hi);
    const s = p.def.sign ?? 1;
    p.joint.setLimits(Math.min(lo * s, hi * s) * DEG, Math.max(lo * s, hi * s) * DEG);
  }
  _recolorBody(body, c, onlyFrom) {
    for (let i = 0; i < body.numColliders(); i++) {
      const info = this.world.colliderInfo.get(body.collider(i).handle);
      if (info && (onlyFrom == null || info.color === onlyFrom)) info.color = c;
    }
  }
  cmd_partColor(name, color) {
    const p = this._part(name);
    const c = this._color(color);
    p.object3d.traverse((o) => { if (o.isMesh && o.material?.color && !o.userData.keepColor) o.material = material(c); });
    this._recolorBody(p.body, c);
  }
  cmd_color(color) {
    const a = this.actor;
    const c = this._color(color);
    if (a.isWorld) {
      const hex = '#' + colorHex(c).toString(16).padStart(6, '0');
      const base = new THREE.Color(hex);
      this.world.setGroundLook({ base: `#${base.clone().multiplyScalar(0.85).getHexString()}`, stud: hex, edge: `#${base.clone().multiplyScalar(0.65).getHexString()}` });
      return;
    }
    const e = a.model;
    if (e) {
      const original = colorHex(e.def.color);
      e.bodies[0].object3d.traverse((o) => {
        if (o.isMesh && (o.userData.origColor ?? o.material.color.getHex()) === original) {
          o.userData.origColor = original;
          o.material = material(c);
        }
      });
      e.color = c;
      this._recolorBody(e.chassis, c, e.def.color);
      return;
    }
    for (const m of a.members) {
      for (const { body, object3d } of m.bodies) {
        object3d.traverse((o) => { if (o.isMesh && o.material?.color && !o.material.wireframe) o.material = material(c); });
        this._recolorBody(body, c);
      }
      m.color = c;
    }
  }
  _color(c) {
    const s = String(c).toLowerCase().replace(/\s+/g, '');
    if (s in COLORS) return s;
    if (s === 'grey') return 'gray';
    if (s === 'random' || s === 'rainbow') { const k = Object.keys(COLORS); return k[Math.floor(Math.random() * k.length)]; }
    throw new Error(`I don't know the color "${c}"`);
  }
  cmd_spawn(opts) {
    const now = performance.now();
    this.spawnTimes = this.spawnTimes.filter((t) => now - t < 1000);
    if (this.spawnTimes.length >= 8) return; // at most 8 bricks a second
    this.spawnTimes.push(now);
    const a = this.actor, w = this.world;
    opts = opts ?? {};
    const color = opts.color ? this._color(opts.color) : Object.keys(COLORS)[Math.floor(Math.random() * 10)];
    const size = SIZES[opts.size] ? opts.size : '2x2';
    const f = a.forward();
    let pos;
    if (opts.from) {
      const p = this._part(opts.from);
      const bucket = p.def.bricks?.find((b) => b.bucket);
      const local = bucket ? new THREE.Vector3(...bucket.at).add(new THREE.Vector3(0, 1.2, 0)) : new THREE.Vector3(0, 1.5, 0);
      const r = p.body.rotation(), t = p.body.translation();
      pos = local.applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
    } else if (opts.at && typeof opts.at === 'object' && opts.at.__ref === 'place') {
      pos = new THREE.Vector3(clamp(opts.at.x, -100, 100), 8, clamp(opts.at.z, -100, 100));
    } else if (a.isWorld) {
      // the World drops bricks from the sky somewhere near the middle
      pos = new THREE.Vector3((Math.random() - 0.5) * 30, 12, (Math.random() - 0.5) * 30);
    } else {
      const at = String(opts.at ?? 'front');
      const top = a.bounds().max.y;
      if (at === 'top' || at === 'here') pos = a.position.setY(top + 1.5);
      else if (at === 'back') pos = a.position.add(f.clone().multiplyScalar(-(a.halfLength() + 2))).add(new THREE.Vector3(0, 1, 0));
      else pos = a.frontPoint(1.6).add(new THREE.Vector3(0, 0.6, 0));
    }
    const lv = a.isWorld ? { x: 0, y: 0, z: 0 } : (a.bodies().find(({ body }) => body.isDynamic())?.body.linvel() ?? { x: 0, y: 0, z: 0 });
    const launch = clamp(opts.launch ?? 0, 0, 40);
    // Thrown bricks get a little lift so they arc in normal gravity; with
    // less gravity they fly flatter, and in space they shoot off level.
    const lift = launch * 0.45 * Math.max(0, w.gravityScale);
    const linvel = { x: lv.x + f.x * launch, y: lv.y + lift, z: lv.z + f.z * launch };
    const flower = String(opts.shape ?? '').toLowerCase() === 'flower';
    const brick = flower
      ? w.addFlower({ color, x: pos.x, y: Math.max(pos.y, 0.95), z: pos.z, yaw: a.heading(), owner: a, linvel })
      : w.addBrick({ size, color, x: pos.x, y: Math.max(pos.y, BRICK_H / 2 + 0.05), z: pos.z, yaw: a.heading(), owner: a, linvel, name: `${color} brick` });
    a.spawned = (a.spawned ?? []).filter((b) => !b.removed);
    a.spawned.push(brick);
    while (a.spawned.length > MAX_SPAWNED_PER_ACTOR) w.remove(a.spawned.shift());
    this.rt.audio.play('pop', pos);
  }
  cmd_play(sound) {
    const s = String(sound).toLowerCase();
    if (!SOUNDS.includes(s)) throw new Error(`no sound called "${sound}"`);
    this.rt.audio.play(s, this.actor.isWorld ? null : this.actor.position);
  }
  cmd_say(text, seconds) {
    // the World's banner has room for a sentence or two; bubbles stay short
    this.rt.ui.say(this.actor, String(text).slice(0, this.actor.isWorld ? 160 : 80), clamp(seconds, 0.5, 10));
  }
  cmd_broadcast(name) { this.rt.broadcast(String(name).slice(0, 40)); }
  cmd_explode(power) {
    const a = this.actor, w = this.world;
    const center = a.bounds().getCenter(new THREE.Vector3());
    const replaced = w.explode(a.members, { center, power: clamp(power || 5, 1, 10) });
    this.rt.audio.play('boom', center);
    // finish this message first: removing stops this very program
    if (replaced) setTimeout(() => this.rt.stage?.removeActor(this.actor), 0);
  }
  cmd_remove() {
    // finish this message first: removing stops this very program
    setTimeout(() => this.rt.stage?.removeActor(this.actor), 0);
  }
  cmd_gravity(amount) { this.world.setGravity(clamp(amount, -2, 3)); }
  cmd_log(text) { this.rt.ui.log(`${this.label}: ${String(text).slice(0, 200)}`); }

  // ---- queries (things that take time, and sensing) -------------------------

  q_move(distance, speed) {
    const a = this.actor;
    const dist = clamp(distance, -200, 200);
    const sp = Math.abs(clamp(speed, 0.5, MAX_SPEED)) * Math.sign(dist || 1);
    const start = a.position.setY(0);
    a.control.drive = sp;
    return this._task(() => a.position.setY(0).distanceTo(start) >= Math.abs(dist), Math.abs(dist) / Math.abs(sp) * 3 + 2,
      () => { a.control.drive = 0; });
  }

  q_turn(degrees) {
    const a = this.actor;
    const total = clamp(degrees, -3600, 3600);
    let turned = 0;
    let last = a.heading();
    const rate = TURN_RATE;
    return this._task(() => {
      const h = a.heading();
      turned += wrap180(h - last);
      last = h;
      const remaining = total - turned;
      if (Math.abs(remaining) < 2) return true;
      a.control.steer = Math.sign(remaining) * Math.min(rate, Math.max(25, Math.abs(remaining) * 5));
      return false;
    }, Math.abs(total) / 40 + 2, () => { a.control.steer = 0; });
  }

  q_face(target) {
    const a = this.actor;
    const tgt = this.rt.resolveTarget(a, target);
    if (!tgt) return false;
    return this._task(() => {
      const ang = this.rt.angleTo(a, tgt.pos);
      if (Math.abs(ang) < 3) return true;
      a.control.steer = Math.sign(ang) * Math.min(TURN_RATE, Math.max(25, Math.abs(ang) * 5));
      return false;
    }, 5, () => { a.control.steer = 0; });
  }

  q_goTo(target, speed) {
    const a = this.actor;
    const sp = clamp(speed, 0.5, MAX_SPEED);
    if (!this.rt.resolveTarget(a, target)) return false;
    const reach = a.halfLength();
    return this._task(() => {
      const tgt = this.rt.resolveTarget(a, target); // things can move
      if (!tgt) return true;
      const d = tgt.pos.clone().setY(0).distanceTo(a.position.setY(0));
      if (d < tgt.radius + reach) return true;
      const ang = this.rt.angleTo(a, tgt.pos);
      a.control.steer = clamp(ang * 5, -TURN_RATE, TURN_RATE);
      a.control.drive = sp * Math.max(0, Math.cos(ang * DEG)) * (Math.abs(ang) > 60 ? 0.2 : 1);
      return false;
    }, 30, () => { a.control.drive = 0; a.control.steer = 0; });
  }

  // Land on whatever is at the target: find the surface with a ray from above.
  q_teleport(target) {
    const a = this.actor, w = this.world;
    const tgt = this.rt.resolveTarget(a, target);
    if (!tgt) return false;
    const box = a.bounds();
    const center = a.position;
    const hit = w.raycast(new THREE.Vector3(tgt.pos.x, 80, tgt.pos.z), new THREE.Vector3(0, -1, 0), 120, (e) => a.has(e));
    const surface = hit ? 80 - hit.distance : 0;
    const delta = new THREE.Vector3(tgt.pos.x - center.x, surface + 0.05 - box.min.y, tgt.pos.z - center.z);
    w.transform(a.members, { delta, pivot: center, keepSpawn: true });
    for (const { body } of a.bodies()) {
      if (!body.isDynamic()) continue;
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    return true;
  }

  q_partTurnTo(name, degrees) {
    const n = String(name).toLowerCase();
    const targets = n.includes('arms') || n.includes('wings') || n === 'both arms'
      ? [...(this.actor.model?.parts.values() ?? [])].filter((p) => p.def.name.includes(n.includes('wings') ? 'wing' : 'arm'))
      : [this._part(name)];
    let wait = 0.2;
    for (const p of targets) {
      if (p.def.kind !== 'hinge') continue;
      const [lo, hi] = p.def.limits ?? [-180, 180];
      const ang = clamp(degrees, lo, hi);
      wait = Math.max(wait, Math.abs(ang - p.angle) / 240 + 0.15);
      if (p.spin) { p.spin = 0; this._settleHinge(p); }
      p.angle = ang;
    }
    return new Promise((r) => setTimeout(() => r(true), Math.min(1.5, wait) * 1000));
  }

  async q_partWiggle(name, times) {
    const p = this._part(name);
    if (p.def.kind !== 'hinge') return false;
    const base = p.angle;
    const [lo, hi] = p.def.limits ?? [-180, 180];
    const amp = Math.min(30, (hi - lo) / 3);
    for (let i = 0; i < clamp(times, 1, 10); i++) {
      if (!this.worker) return false;
      p.angle = clamp(base + amp, lo, hi);
      await new Promise((r) => setTimeout(r, 180));
      p.angle = clamp(base - amp, lo, hi);
      await new Promise((r) => setTimeout(r, 180));
    }
    p.angle = base;
    return true;
  }

  q_look(distance) {
    const a = this.actor;
    const f = a.forward().setY(0).normalize();
    const origin = a.frontPoint(0.1);
    const hit = this.world.raycast(origin, f, clamp(distance, 1, 100), (e) => a.has(e));
    if (!hit || hit.info.entity.kind === 'ground') return null;
    return { ...hit.info.entity.describe(), color: hit.info.color, distance: Math.round(hit.distance * 10) / 10 };
  }

  q_nearest(filter) {
    const n = this.rt.nearest(this.actor, filter);
    if (!n) return null;
    return { ...n.entity.describe(), distance: Math.round(n.distance * 10) / 10, direction: Math.round(this.rt.angleTo(this.actor, n.pos)) };
  }

  q_touching(filter) {
    for (const m of this.actor.members) {
      const map = this.rt.contacts.get(m);
      if (!map) continue;
      for (const info of map.values()) {
        if (info.entity.removed || this.actor.has(info.entity)) continue;
        if (matchFilter(filter, { ...info.entity.describe(), color: info.color })) return true;
      }
    }
    return false;
  }

  // Its eyes: a picture of what's straight ahead goes to Claude with the
  // labels, and the answer is one of them or "none". One look at a time per
  // program, at most one a second, since each is an API call.
  async q_see(labels) {
    const a = this.actor;
    const choices = (Array.isArray(labels) ? labels : []).map((l) => String(l).trim()).filter(Boolean).slice(0, 12);
    if (!choices.length) throw new Error('see() needs a list of labels, like see(["food", "a friend"])');
    const prev = this._seeing ?? Promise.resolve();
    const turn = prev.then(async () => {
      const wait = 1000 - (performance.now() - (this._lastSee ?? -1e9));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this._lastSee = performance.now();
      if (!a.alive) return 'none';
      const image = this.rt.ui.snapshot?.(a);
      if (!image) return 'none';
      const show = (label) => this.rt.ui.showSeen?.(a, image, label);
      show(null); // the picture goes up at once, with "looking…"
      try {
        const r = await fetch('./api/see', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, labels: choices, looker: a.describe().name }),
        });
        const out = await r.json();
        if (!r.ok) throw new Error(out.error ?? `HTTP ${r.status}`);
        this.rt.ui.log?.(`👀 ${a.describe().name} sees ${out.seen} → ${out.label}`);
        const label = choices.includes(out.label) ? out.label : 'none';
        show(label);
        return label;
      } catch (err) {
        this.rt.ui.log?.(`👀 ${a.describe().name} couldn't look (${err.message}), so it saw "none".`, 'error');
        show('none');
        return 'none';
      }
    });
    this._seeing = turn.catch(() => {});
    return turn;
  }

  q_position() {
    const a = this.actor;
    const p = a.position;
    const y = a.isWorld ? 0 : a.bounds().min.y;
    return { x: Math.round(p.x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(p.z * 10) / 10, heading: Math.round(a.heading()) };
  }

  q_clone(what, where) {
    const now = performance.now();
    this.cloneTimes = this.cloneTimes.filter((t) => now - t < 1000);
    if (this.cloneTimes.length >= 3) return null; // at most 3 copies a second
    const src = this.rt.resolveActor(this.actor, what);
    if (!src) throw new Error(what == null ? 'nothing to copy' : `I couldn't find ${JSON.stringify(what)} to copy`);
    if (src.isWorld) throw new Error("the World can't copy itself. Say what to copy, like clone(thing(\"tree-1\")).");
    this.cloneTimes.push(now);
    const copy = this.rt.stage?.cloneActor(src, where, this);
    return copy ? copy.describe() : null;
  }
}

// Host side of the sandbox: owns one Worker per running behavior, validates
// every command it sends, and turns primitives into physics on the model.
import * as THREE from 'three';
import { COLORS, SOUNDS, HOST_COMMANDS, HOST_QUERIES } from './primitives.js';
import { SIZES, BRICK_H, material, colorHex } from '../world/bricks.js';
import { matchFilter } from './filter.js';

export { matchFilter };

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));
const wrap180 = (a) => ((a + 540) % 360) - 180;
const MAX_SPAWNED_PER_MODEL = 60;

export class Runtime {
  constructor({ world, audio, ui, net }) {
    this.world = world;
    this.audio = audio;
    this.ui = ui;
    this.net = net;
    this.programs = new Set();
    this.heldKeys = new Set();
    this.contacts = new Map(); // entity -> Map(otherColliderKey -> info)
    world.onCollision = (a, b, started) => this._collision(a, b, started);
    world.beforeStep = (dt) => this._tick(dt);
    this._tickTimer = setInterval(() => this._keyTick(), 33);
    this._watchdog = setInterval(() => this._ping(), 1000);
  }

  // ---- program lifecycle ----------------------------------------------------

  start(entity, behavior) {
    const p = new Program(this, entity, behavior);
    this.programs.add(p);
    p.start();
    return p;
  }

  stopAll(entity) {
    for (const p of [...this.programs]) if (!entity || p.entity === entity) p.stop();
    if (entity) this._resetControls(entity);
  }

  _resetControls(e) {
    e.control.drive = 0;
    e.control.steer = 0;
    for (const part of e.parts.values()) { part.spin = 0; }
  }

  // ---- input ----------------------------------------------------------------

  keyDown(key) {
    if (this.heldKeys.has(key)) return;
    this.heldKeys.add(key);
    for (const p of this.programs) p.send({ type: 'key', key }, key);
  }
  keyUp(key) {
    this.heldKeys.delete(key);
    for (const p of this.programs) p.send({ type: 'keyup', key }, key);
  }
  click(entity) {
    for (const p of this.programs) if (p.entity === entity) p.send({ type: 'click' });
  }
  broadcast(name, fromNet = false) {
    for (const p of this.programs) p.send({ type: 'message', name });
    if (!fromNet) this.net?.sendMessage(name);
  }
  _keyTick() {
    if (!this.heldKeys.size) return;
    for (const p of this.programs) p.send({ type: 'tick' });
  }
  _ping() { for (const p of this.programs) p.ping(); }

  // ---- physics hooks --------------------------------------------------------

  _collision(a, b, started) {
    for (const [self, other] of [[a, b], [b, a]]) {
      if (self.entity.kind !== 'model' || self.entity.remote) continue;
      if (!this.contacts.has(self.entity)) this.contacts.set(self.entity, new Map());
      const map = this.contacts.get(self.entity);
      const key = `${other.entity.id}|${other.part ?? ''}|${other.color}`;
      if (!started) { map.delete(key); continue; }
      map.set(key, other);
      const desc = { ...other.entity.describe(), color: other.color };
      for (const p of this.programs) if (p.entity === self.entity) p.touched(desc);
    }
  }

  _tick(dt) {
    for (const p of this.programs) p.tickTasks(dt);
  }

  // ---- shared helpers used by Program ---------------------------------------

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
      if (e === self || thingId === self.thingId) continue;
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
  constructor(rt, entity, behavior) {
    this.rt = rt;
    this.entity = entity;
    this.behavior = behavior;
    this.worker = null;
    this.keys = new Set();
    this.touchFilters = [];
    this.tasks = [];
    this.lastPong = performance.now();
    this.touchCooldown = new Map();
    this.spawnTimes = [];
  }

  get label() { return `${this.entity.name} · ${this.behavior.title ?? 'behavior'}`; }

  start() {
    this.worker = new Worker(new URL('./sandbox.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => this._onMessage(ev.data);
    this.worker.onerror = (ev) => { ev.preventDefault?.(); this._error(ev.message ?? 'worker error', true); };
    this.worker.postMessage({ type: 'load', code: this.behavior.code });
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
      case 'error': this._error(m.message, m.fatal); break;
      case 'cmd':
        if (!HOST_COMMANDS.has(m.name)) return this._error(`unknown command ${m.name}`);
        try { this[`cmd_${m.name}`](...(m.args ?? [])); } catch (err) { this._error(`${m.name}: ${err.message}`); }
        break;
      case 'query': {
        if (!HOST_QUERIES.has(m.name)) return this._reply(m.id, null);
        let result;
        try { result = this[`q_${m.name}`](...(m.args ?? [])); } catch (err) { this._error(`${m.name}: ${err.message}`); result = null; }
        Promise.resolve(result).then((v) => this._reply(m.id, v ?? null));
        break;
      }
    }
  }

  _reply(id, value) { this.worker?.postMessage({ type: 'reply', id, value }); }

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
    if (!this.tasks.length || this.entity.removed) return;
    const done = [];
    for (const t of this.tasks) if (t.update(dt)) done.push(t);
    for (const t of done) { this.tasks.splice(this.tasks.indexOf(t), 1); t.finish(); }
  }

  _part(name) {
    const e = this.entity;
    const n = String(name).toLowerCase().trim();
    if (e.parts.has(n)) return e.parts.get(n);
    for (const [k, p] of e.parts) if (k.includes(n) || n.includes(k)) return p;
    // "arm" -> first part containing "arm"; "wheels" handled by caller
    for (const [k, p] of e.parts) if (n.split(' ').some((w) => w.length > 2 && k.includes(w))) return p;
    throw new Error(`${e.name} has no part called "${name}". Parts: ${[...e.parts.keys()].join(', ')}`);
  }

  _totalMass() {
    let m = this.entity.chassis.mass();
    for (const p of this.entity.parts.values()) m += p.body.mass();
    return m;
  }

  // ---- commands -------------------------------------------------------------

  cmd_drive(speed) { this.entity.control.drive = clamp(speed, -25, 25); }
  cmd_steer(rate) { this.entity.control.steer = clamp(rate, -360, 360); }
  cmd_stop() {
    for (const t of this.tasks) t.finish();
    this.tasks = [];
    this.rt._resetControls(this.entity);
  }
  cmd_jump(power) {
    const e = this.entity;
    if (Math.abs(e.chassis.linvel().y) > 2) return; // already in the air
    const v = 5 + clamp(power, 1, 10) * 1.6;
    e.chassis.applyImpulse({ x: 0, y: this._totalMass() * v, z: 0 }, true);
    this.rt.audio.play('boing', e.position);
  }
  cmd_push(direction, power) {
    const e = this.entity;
    const f = e.forward();
    const left = new THREE.Vector3(0, 1, 0).cross(f);
    const dirs = { forward: f, backward: f.clone().negate(), back: f.clone().negate(), left, right: left.clone().negate(), up: new THREE.Vector3(0, 1, 0) };
    const d = dirs[String(direction).toLowerCase()] ?? f;
    const imp = d.multiplyScalar(this._totalMass() * clamp(power, 1, 10) * 2.5);
    e.chassis.applyImpulse(imp, true);
  }
  cmd_partSpin(name, speed) {
    const n = String(name).toLowerCase();
    if (n.includes('wheel')) {
      this.entity.control.drive = clamp(speed / 30, -25, 25);
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
  cmd_partColor(name, color) {
    const p = this._part(name);
    const c = this._color(color);
    p.object3d.traverse((o) => { if (o.isMesh && o.material?.color && !o.userData.keepColor) o.material = material(c); });
    for (let i = 0; i < p.body.numColliders(); i++) {
      const info = this.rt.world.colliderInfo.get(p.body.collider(i).handle);
      if (info) info.color = c;
    }
  }
  cmd_color(color) {
    const e = this.entity;
    const c = this._color(color);
    const original = colorHex(e.def.color);
    e.bodies[0].object3d.traverse((o) => {
      if (o.isMesh && (o.userData.origColor ?? o.material.color.getHex()) === original) {
        o.userData.origColor = original;
        o.material = material(c);
      }
    });
    e.color = c;
    for (let i = 0; i < e.chassis.numColliders(); i++) {
      const info = this.rt.world.colliderInfo.get(e.chassis.collider(i).handle);
      if (info && info.color === e.def.color) info.color = c;
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
    const e = this.entity, w = this.rt.world;
    opts = opts ?? {};
    const color = opts.color ? this._color(opts.color) : Object.keys(COLORS)[Math.floor(Math.random() * 10)];
    const size = SIZES[opts.size] ? opts.size : '2x2';
    const f = e.forward();
    let pos;
    if (opts.from) {
      const p = this._part(opts.from);
      const bucket = p.def.bricks?.find((b) => b.bucket);
      const local = bucket ? new THREE.Vector3(...bucket.at).add(new THREE.Vector3(0, 1.2, 0)) : new THREE.Vector3(0, 1.5, 0);
      const r = p.body.rotation(), t = p.body.translation();
      pos = local.applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
    } else if (opts.at && typeof opts.at === 'object' && opts.at.__ref === 'place') {
      pos = new THREE.Vector3(clamp(opts.at.x, -100, 100), 8, clamp(opts.at.z, -100, 100));
    } else {
      const at = String(opts.at ?? 'front');
      if (at === 'top' || at === 'here') pos = e.position.add(new THREE.Vector3(0, 4.5, 0));
      else if (at === 'back') pos = e.position.add(f.clone().multiplyScalar(-6)).add(new THREE.Vector3(0, 1, 0));
      else pos = w.frontPoint(e, 1.6).add(new THREE.Vector3(0, 0.6, 0));
    }
    const lv = e.chassis.linvel();
    const launch = clamp(opts.launch ?? 0, 0, 40);
    const linvel = { x: lv.x + f.x * launch, y: lv.y + launch * 0.45, z: lv.z + f.z * launch };
    const brick = w.addBrick({ size, color, x: pos.x, y: Math.max(pos.y, BRICK_H / 2 + 0.05), z: pos.z, yaw: e.heading(), owner: e, linvel, name: `${color} brick` });
    e.spawned = e.spawned ?? [];
    e.spawned.push(brick);
    while (e.spawned.length > MAX_SPAWNED_PER_MODEL) w.remove(e.spawned.shift());
    this.rt.audio.play('pop', pos);
  }
  cmd_play(sound) {
    const s = String(sound).toLowerCase();
    if (!SOUNDS.includes(s)) throw new Error(`no sound called "${sound}"`);
    this.rt.audio.play(s, this.entity.position);
    this.rt.net?.sendSound(s, this.entity.position);
  }
  cmd_say(text, seconds) {
    this.rt.ui.say(this.entity, String(text).slice(0, 80), clamp(seconds, 0.5, 10));
    this.rt.net?.sendSay(this.entity, String(text).slice(0, 80), clamp(seconds, 0.5, 10));
  }
  cmd_broadcast(name) { this.rt.broadcast(String(name).slice(0, 40)); }
  cmd_log(text) { this.rt.ui.log(`${this.label}: ${String(text).slice(0, 200)}`); }

  // ---- queries (things that take time, and sensing) -------------------------

  q_move(distance, speed) {
    const e = this.entity;
    const dist = clamp(distance, -200, 200);
    const sp = Math.abs(clamp(speed, 0.5, 25)) * Math.sign(dist || 1);
    const start = e.position.setY(0);
    e.control.drive = sp;
    return this._task(() => e.position.setY(0).distanceTo(start) >= Math.abs(dist), Math.abs(dist) / Math.abs(sp) * 3 + 2,
      () => { e.control.drive = 0; });
  }

  q_turn(degrees) {
    const e = this.entity;
    const total = clamp(degrees, -3600, 3600);
    let turned = 0;
    let last = e.heading();
    const rate = 120;
    return this._task(() => {
      const h = e.heading();
      turned += wrap180(h - last);
      last = h;
      const remaining = total - turned;
      if (Math.abs(remaining) < 2) return true;
      e.control.steer = Math.sign(remaining) * Math.min(rate, Math.max(25, Math.abs(remaining) * 3));
      return false;
    }, Math.abs(total) / 40 + 2, () => { e.control.steer = 0; });
  }

  q_face(target) {
    const e = this.entity;
    const tgt = this.rt.resolveTarget(e, target);
    if (!tgt) return false;
    return this._task(() => {
      const a = this.rt.angleTo(e, tgt.pos);
      if (Math.abs(a) < 3) return true;
      e.control.steer = Math.sign(a) * Math.min(120, Math.max(25, Math.abs(a) * 3));
      return false;
    }, 5, () => { e.control.steer = 0; });
  }

  q_goTo(target, speed) {
    const e = this.entity;
    const sp = clamp(speed, 0.5, 25);
    if (!this.rt.resolveTarget(e, target)) return false;
    return this._task(() => {
      const tgt = this.rt.resolveTarget(e, target); // things can move
      if (!tgt) return true;
      const d = tgt.pos.clone().setY(0).distanceTo(e.position.setY(0));
      if (d < tgt.radius + this._halfLength()) return true;
      const a = this.rt.angleTo(e, tgt.pos);
      e.control.steer = clamp(a * 3, -140, 140);
      e.control.drive = sp * Math.max(0, Math.cos(a * DEG)) * (Math.abs(a) > 60 ? 0.2 : 1);
      return false;
    }, 30, () => { e.control.drive = 0; e.control.steer = 0; });
  }

  _halfLength() {
    let m = 0;
    for (const b of this.entity.def.bricks) m = Math.max(m, Math.abs(b.at[2]) + b.size[2] / 2);
    return m;
  }

  q_partTurnTo(name, degrees) {
    const n = String(name).toLowerCase();
    const targets = n.includes('arms') || n === 'both arms'
      ? [...this.entity.parts.values()].filter((p) => p.def.name.includes('arm'))
      : [this._part(name)];
    let wait = 0.2;
    for (const p of targets) {
      if (p.def.kind !== 'hinge') continue;
      const [lo, hi] = p.def.limits ?? [-180, 180];
      const a = clamp(degrees, lo, hi);
      wait = Math.max(wait, Math.abs(a - p.angle) / 240 + 0.15);
      if (p.spin) { p.spin = 0; this._settleHinge(p); }
      p.angle = a;
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
    const e = this.entity, w = this.rt.world;
    const f = e.forward().setY(0).normalize();
    const origin = w.frontPoint(e, 0.1);
    const hit = w.raycast(origin, f, clamp(distance, 1, 100), e);
    if (!hit || hit.info.entity.kind === 'ground') return null;
    return { ...hit.info.entity.describe(), color: hit.info.color, distance: Math.round(hit.distance * 10) / 10 };
  }

  q_nearest(filter) {
    const n = this.rt.nearest(this.entity, filter);
    if (!n) return null;
    return { ...n.entity.describe(), distance: Math.round(n.distance * 10) / 10, direction: Math.round(this.rt.angleTo(this.entity, n.pos)) };
  }

  q_touching(filter) {
    const map = this.rt.contacts.get(this.entity);
    if (!map) return false;
    for (const info of map.values()) if (matchFilter(filter, { ...info.entity.describe(), color: info.color })) return true;
    return false;
  }

  q_position() {
    const p = this.entity.position;
    return { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, heading: Math.round(this.entity.heading()) };
  }
}

// The Stage holds what's in the current world and what everything knows:
// which premade world is loaded, the behaviors taught to each thing (keyed by
// actor key, so they survive Reset), models the kid added, things they moved
// or deleted, and copies made by clone(). Switching worlds keeps each world's
// state, so coming back finds everything as it was taught.
import * as THREE from 'three';
import { WORLDS_BY_ID } from './world/worlds.js';
import { LIBRARY_BY_ID, modelBottom } from './world/library.js';
import { compileLocal, titleFrom } from './behavior/compiler.js';
import { syntaxError } from './behavior/generate.js';
import { applyColor } from './behavior/runtime.js';

const MAX_COPIES = 40;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const V = (a) => new THREE.Vector3(...a);

let behaviorIds = 1;
export function makeBehavior(b) {
  return {
    id: behaviorIds++, enabled: b.enabled ?? true, running: false,
    text: b.text, html: b.html ?? esc(b.text), code: b.code, summary: b.summary ?? [], source: b.source,
    notes: b.notes ?? '',
    by: b.by ?? null, // who taught it (a player id in a shared room)
    // button labels for the key pad, {key: label}; read from the code when missing
    keys: Array.isArray(b.keys) ? Object.fromEntries(b.keys.map((k) => [k.key, k.label])) : b.keys ?? null,
    title: b.title || titleFrom([(b.summary?.[0] ?? b.text).replace(/^[^:]*:\s*/, '')]),
  };
}

// What a behavior's generator needs to know about the thing it's for.
export function describeTarget(actor) {
  const kind = actor.kind;
  if (kind === 'world') {
    return {
      kind: 'world', name: 'World', motion: 'none', parts: [],
      blurb: 'The World itself (the baseplate everything stands on). World rules can change gravity, drop bricks, copy things and react to keys. The World itself never moves.',
    };
  }
  if (kind === 'model') return { ...actor.model.def, kind: 'model', name: actor.name };
  const ms = actor.members;
  const kinematic = ms.every((e) => e.chassis.isKinematic());
  const e = ms[0];
  if (kind === 'piece') {
    const whole = actor.world.actorOf(e);
    return { kind: 'piece', name: actor.name, motion: 'loose', parts: [], blurb: `One ${e.color} brick picked out of ${whole.name}. It can slide, turn, jump, change color, copy itself and more.` };
  }
  return {
    kind: 'thing', name: actor.name, motion: kinematic ? 'slide' : 'loose', parts: [],
    blurb: kinematic
      ? `A ${e.kind} in the world. It doesn't fall over, but it can slide and turn around, change color, copy itself and more.`
      : ms.length > 1
        ? `${actor.name}: ${ms.length} loose bricks that can be knocked over. The whole thing can slide and turn as one, jump, change color, copy itself and more.`
        : `A loose ${e.kind}. It can slide, turn, jump, change color, copy itself and more.`,
  };
}

export class Stage {
  constructor({ world, runtime, ui, view }) {
    Object.assign(this, { world, runtime, ui, view });
    runtime.stage = this;
    this.saved = new Map();
    this.worldId = null;
    this.state = null;
    this.serial = 0;
    this._stars = null;
  }

  get preset() { return WORLDS_BY_ID[this.worldId]; }

  behaviorsOf(key) {
    if (!this.state.behaviors.has(key)) this.state.behaviors.set(key, []);
    return this.state.behaviors.get(key);
  }

  // ---- loading and rebuilding ----------------------------------------------

  _fresh(preset) {
    const behaviors = new Map();
    for (const [key, list] of Object.entries(preset.behaviors ?? {})) {
      behaviors.set(key, list.map((b) => {
        if (b.code) return makeBehavior({ ...b, source: 'premade' });
        const m = preset.models.find((x) => x.id === key);
        const r = compileLocal(b.text, m ? LIBRARY_BY_ID[m.def] : { parts: [] });
        return makeBehavior({ text: b.text, ...r, title: b.title ?? r.title, keys: b.keys, source: 'premade' });
      }));
    }
    return { behaviors, added: [], moves: [], deleted: new Set() };
  }

  load(worldId) {
    if (!WORLDS_BY_ID[worldId]) worldId = 'playground';
    if (this.worldId) this.saved.set(this.worldId, this.state);
    this.worldId = worldId;
    this.state = this.saved.get(worldId) ?? this._fresh(this.preset);
    if (this.view) {
      this.applyTheme(this.preset.theme);
      const { pos, target } = this.preset.camera;
      this.view.camera.position.set(...pos);
      this.view.controls.target.set(...target);
      this.view.controls.update();
    }
    this.reset();
  }

  // pose.color paints a premade model (a team's blue race car).
  _addModel(defId, pose, key, name) {
    const def = LIBRARY_BY_ID[defId];
    const y = pose.lift ? -modelBottom(def) + 0.05 + pose.lift : undefined;
    const e = this.world.addModel(def, { x: pose.x, y, z: pose.z, yaw: pose.yaw ?? 0, id: key, name });
    if (pose.color && pose.color !== def.color) applyColor(this.world, this.world.actor(key), pose.color);
    return e;
  }

  // Put everything back where it started; behaviors keep running.
  reset() {
    const { world, runtime, state } = this;
    const preset = this.preset;
    runtime.stopAll();
    world.clear();
    runtime.contacts.clear();
    world.setGravity(preset.gravity ?? 1);
    preset.build(world);
    for (const m of preset.models) this._addModel(m.def, m, m.id, m.name);
    for (const a of state.added) this._addModel(a.defId, a.pose, a.key, a.name);
    for (const key of state.deleted) for (const e of world.actor(key).members) world.remove(e);
    for (const mv of state.moves) {
      const a = world.actor(mv.key);
      if (a.alive) world.transform(a.members, { delta: V(mv.delta), dyaw: mv.dyaw, pivot: V(mv.pivot) });
    }
    // Copies and spawned bricks are gone, and so is what they knew.
    for (const key of [...state.behaviors.keys()]) if (key !== 'world' && !world.actor(key).alive) state.behaviors.delete(key);
    for (const [key, list] of state.behaviors) for (const b of list) if (b.enabled) runtime.start(world.actor(key), b);
    this.ui.onWorldRebuilt?.();
  }

  // ---- what kids do with things --------------------------------------------

  addModel(defId, pose) {
    const def = LIBRARY_BY_ID[defId];
    pose = { ...pose, ...this.world.findClearSpot(def, pose) }; // never start inside something
    const n = [...this.world.entities.values()].filter((e) => e.def?.id === defId).length;
    const key = `m${++this.serial}`;
    const name = n ? `${def.name} ${n + 1}` : def.name;
    this.state.added.push({ key, defId, pose, name });
    this._addModel(defId, pose, key, name);
    return this.world.actor(key);
  }

  // A drag or a turn: remember it so Reset puts the thing back here.
  recordMove(key, delta, dyaw, pivot) {
    this.state.moves.push({ key, delta: delta.toArray(), dyaw, pivot: pivot.toArray() });
  }

  // forever: the 🗑 button (Reset won't bring it back). Otherwise remove()
  // from a program: copies are gone for good, originals come back on Reset.
  removeActor(actor, { forever = false } = {}) {
    if (!actor.alive || actor.isWorld) return;
    this.runtime.stopAll(actor);
    for (const e of actor.members) this.world.remove(e);
    const isCopy = actor.key.includes('~');
    if (forever || isCopy) this.state.behaviors.delete(actor.key);
    if (forever && !isCopy) {
      const i = this.state.added.findIndex((a) => a.key === actor.key);
      if (i >= 0) this.state.added.splice(i, 1);
      else this.state.deleted.add(actor.key);
    }
    this.ui.onActorRemoved?.(actor);
  }

  // Copy an actor, with its behaviors, next to it (or `where`).
  cloneActor(src, where, program) {
    const { world } = this;
    const copies = [...world.byThing.keys()].filter((k) => k.includes('~')).length;
    if (copies >= MAX_COPIES) {
      if (!this._warnedCopies) this.ui.log(`That's ${MAX_COPIES} copies, the most there can be. Reset the world to clear them.`, 'error');
      this._warnedCopies = true;
      return null;
    }
    const members = src.members;
    if (!members.length) return null;
    const key = `${src.key}~${++this.serial}`;
    const center = src.position;
    const box = src.bounds();
    const size = box.getSize(new THREE.Vector3());
    const rel = { min: box.min.clone().sub(center).toArray(), max: box.max.clone().sub(center).toArray() };
    const f = src.forward();
    const left = new THREE.Vector3(f.z, 0, -f.x);
    const reach = (dir) => Math.abs(dir.x) * size.x + Math.abs(dir.z) * size.z + 1;
    let target = center.clone();
    if (where && typeof where === 'object' && where.__ref === 'place') target.set(Number(where.x) || 0, center.y, Number(where.z) || 0);
    else if (where === 'above') target.y += size.y + 0.5;
    else {
      const dir = { front: f, back: f.clone().negate(), left }[where] ?? left.clone().negate();
      target.add(dir.clone().multiplyScalar(reach(dir)));
    }
    const spot = world.findClearBox(rel, { x: target.x, z: target.z, y: target.y }, 0.3);
    const delta = new THREE.Vector3(spot.x - center.x, target.y - center.y, spot.z - center.z);
    const name = `${src.name.replace(/ copy( \d+)?$/, '')} copy`;
    const m = src.model;
    if (m) {
      const p = m.position.add(delta);
      world.addModel(m.def, { x: p.x, y: p.y, z: p.z, yaw: m.heading(), id: key, name });
      if (m.color !== m.def.color) applyColor(world, world.actor(key), m.color);
    } else {
      for (const e of members) {
        const p = e.position.add(delta);
        const recipe = e.recipe.type === 'brick' || e.recipe.type === 'ball' ? { ...e.recipe, opts: { ...e.recipe.opts, color: e.color } } : e.recipe;
        world.rebuild(recipe, {
          x: p.x, y: p.y, z: p.z, quat: e.quaternion, thingId: key, id: members.length === 1 ? key : undefined,
          name, sleeping: e.chassis.isSleeping(),
        });
      }
    }
    const copy = world.actor(key);
    copy.yaw = src.yaw;
    const list = (this.state.behaviors.get(src.key) ?? []).map((b) => makeBehavior(b));
    this.state.behaviors.set(key, list);
    for (const b of list) if (b.enabled) this.runtime.start(copy, b, { isClone: true });
    this.ui.audio?.play('pop', copy.position);
    this.ui.onActorAdded?.(copy);
    void program;
    return copy;
  }

  // ---- behaviors: what the inspector (or a player over the wire) can do ----

  programOf(actor, b) { return [...this.runtime.programs].find((p) => p.behavior === b && p.actor === actor) ?? null; }

  // Stop a behavior's program and start it again if it's enabled.
  restart(actor, b) {
    for (const p of [...this.runtime.programs]) if (p.behavior === b) p.stop();
    this.runtime.resetControls(actor);
    if (actor.isWorld && !b.enabled && /\bgravity\(/.test(b.code)) { this.world.setGravity(1); this.ui.onGravity?.(1); } // switching a gravity rule off
    if (b.enabled) this.runtime.start(actor, b, { owner: b.by });
    this.ui.onBehaviorsChanged?.(actor);
  }

  // A new behavior: the kid's words plus the generated program.
  teach(actor, b) {
    if (!actor.alive) return null;
    const err = syntaxError(b.code);
    if (err) throw new Error(`That code has a typo: ${err}`);
    const behavior = makeBehavior({
      ...b,
      notes: [b.notes, b.unknown?.length ? `I didn't understand: \u201c${b.unknown.join('\u201d, \u201c')}\u201d` : ''].filter(Boolean).join(' '),
    });
    this.behaviorsOf(actor.key).push(behavior);
    if (behavior.notes) this.ui.log(`${behavior.title}: ${behavior.notes}`);
    this.runtime.start(actor, behavior, { owner: behavior.by });
    this.ui.onBehaviorsChanged?.(actor);
    return behavior;
  }

  // A request that named an existing behavior and asked to change it: swap in
  // the new program on the same card, keeping its place in the list.
  changeBehavior(actor, b, res) {
    const err = syntaxError(res.code);
    if (err) throw new Error(`That code has a typo: ${err}`);
    const fresh = makeBehavior({ ...res, title: res.title || b.title });
    Object.assign(b, {
      code: fresh.code, title: fresh.title, summary: fresh.summary, keys: fresh.keys, notes: fresh.notes, source: fresh.source,
      text: res.text, html: res.html, enabled: true, collapsed: false, draft: null, changedAt: performance.now(),
    });
    if (res.by) b.by = res.by;
    this.ui.log(`Changed \u201c${b.title}\u201d${b.notes ? `: ${b.notes}` : ''}`);
    this.restart(actor, b);
  }

  setEnabled(actor, b, on) {
    b.enabled = !!on;
    this.restart(actor, b);
  }

  deleteBehavior(actor, b) {
    const list = this.behaviorsOf(actor.key);
    b.enabled = false;
    this.restart(actor, b);
    const i = list.indexOf(b);
    if (i >= 0) list.splice(i, 1);
    this.ui.onBehaviorsChanged?.(actor);
  }

  // The code was edited by hand and run.
  editCode(actor, b, code, by) {
    if (code === b.code) return;
    const err = syntaxError(code);
    if (err) throw new Error(`That code has a typo: ${err}`);
    b.code = code;
    b.draft = null;
    b.keys = null; // the labels may not fit the new code
    b.source = 'edited';
    b.enabled = true;
    if (by) b.by = by;
    this.restart(actor, b);
  }

  // ---- moving things by hand ------------------------------------------------

  turn(actor, degrees = 45) {
    if (!actor?.alive || actor.isWorld || actor.fixed) return;
    const pivot = actor.position;
    this.world.transform(actor.members, { dyaw: degrees, pivot });
    if (actor.usesOwnYaw) actor.yaw = (actor.yaw ?? 0) + degrees;
    this.recordMove(actor.key, new THREE.Vector3(), degrees, pivot);
  }

  respawn(actor) {
    const m = actor?.model;
    if (m) this.world.resetModel(m);
  }

  // The end of a drag: the thing was held at delta/yaw from where it started;
  // apply that for real so Reset remembers it.
  endDrag(actor, delta, dyaw, pivot) {
    if (!actor.alive) return;
    this.world.transform(actor.members, { delta, dyaw, pivot });
    for (const { body } of actor.bodies()) {
      if (body.isDynamic()) { body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true); body.wakeUp(); }
    }
    if (actor.usesOwnYaw && dyaw) actor.yaw = (actor.yaw ?? 0) + dyaw;
    this.recordMove(actor.key, delta, dyaw, pivot);
  }

  // ---- the look of the world -----------------------------------------------

  applyTheme(theme) { applyTheme(this.view, this.world, theme); }
}

// The look of a world: sky, fog, lights, ground, stars. view: {scene, hemi,
// sun, gfx}; the stars are kept on the view between worlds.
export function applyTheme(view, world, theme) {
  const { scene, hemi, sun, gfx } = view;
  scene.fog = theme.fog ? new THREE.Fog(theme.sky, ...theme.fog) : null;
  hemi.color.set(theme.hemi[0]); hemi.groundColor.set(theme.hemi[1]); hemi.intensity = theme.hemi[2];
  if (gfx) gfx.setSky(theme); else scene.background = new THREE.Color(theme.sky);
  sun.color.set(theme.sun[0]); sun.intensity = theme.sun[1];
  world.setGroundLook(theme.ground);
  if (theme.stars && !view._stars) view._stars = makeSpace();
  if (view._stars) {
    if (theme.stars) scene.add(view._stars); else scene.remove(view._stars);
  }
}

// Stars, a ringed planet and a moon, far away (not part of the physics).
function makeSpace() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i < 1500; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(320 + Math.random() * 60);
    if (v.y < -40) v.y = -v.y;
    pts.push(v.x, v.y, v.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  // brighter than white, so the stars bloom a little
  g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(2.5, 2.5, 2.8), size: 1.6, sizeAttenuation: false, fog: false })));
  const planet = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.MeshStandardMaterial({ color: 0xe0874a, roughness: 0.8, fog: false }));
  planet.position.set(-150, 90, 220);
  const ring = new THREE.Mesh(new THREE.RingGeometry(55, 75, 64), new THREE.MeshBasicMaterial({ color: 0xf2d39b, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false }));
  ring.position.copy(planet.position);
  ring.rotation.set(1.2, 0.3, 0.2);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshStandardMaterial({ color: 0xbfc5d2, roughness: 1, fog: false }));
  moon.position.set(160, 60, 180);
  g.add(planet, ring, moon);
  g.traverse((o) => { o.raycast = () => {}; });
  return g;
}

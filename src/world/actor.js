// An Actor is anything a behavior program can run on:
//   model — a premade creation (one entity with a chassis and parts)
//   thing — an assembly: every entity sharing a thingId (a house of loose
//           bricks, a tree, a single loose brick, the ball...)
//   piece — one brick picked out of an assembly
//   world — the baseplate, home of world rules (gravity, spawning, cloning)
// Actors are looked up by key (a thingId, an entity id, or 'world'), so they
// survive the world being rebuilt: a program's actor comes back to life when
// an entity with the same key does.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

export class Actor {
  constructor(world, key) {
    this.world = world;
    this.key = key;
    this._control = { drive: 0, steer: 0, rise: 0 };
    this.yaw = null; // heading for assemblies that have no single body to read it from
    this._wasActive = false;
  }

  get kind() {
    if (this.key === 'world') return 'world';
    const set = this.world.byThing.get(this.key);
    if (set?.size) {
      const [e] = set;
      return set.size === 1 && e.kind === 'model' ? 'model' : 'thing';
    }
    return this.world.entities.has(this.key) ? 'piece' : 'gone';
  }

  get members() {
    if (this.key === 'world') return [];
    const set = this.world.byThing.get(this.key);
    if (set?.size) return [...set];
    const e = this.world.entities.get(this.key);
    return e ? [e] : [];
  }

  get model() {
    const set = this.world.byThing.get(this.key);
    if (set?.size !== 1) return null;
    const [e] = set;
    return e.kind === 'model' ? e : null;
  }

  get alive() { return this.key === 'world' || this.members.length > 0; }
  get isWorld() { return this.key === 'world'; }
  get fixed() { return this.members.some((e) => e.fixed); } // stays where it is when grabbed (see addStatic)

  has(entity) {
    if (this.key === 'world') return false;
    return entity.thingId === this.key || entity.id === this.key;
  }

  get name() {
    if (this.isWorld) return 'World';
    const [e] = this.members;
    return e?.name ?? this.key;
  }

  get color() { return this.members[0]?.color ?? 'green'; }

  get control() { return this.model?.control ?? this._control; }

  describe() {
    if (this.isWorld) return { id: 'world', name: 'World', kind: 'world', color: 'green' };
    const [e] = this.members;
    return { ...e?.describe(), id: this.key, name: this.name, kind: e?.kind ?? 'thing', color: e?.color ?? null };
  }

  // Bodies of every member: [{body, entity}]
  bodies() {
    const out = [];
    for (const e of this.members) for (const { body } of e.bodies) out.push({ body, entity: e });
    return out;
  }

  get position() {
    if (this.isWorld) return new THREE.Vector3();
    const m = this.model;
    if (m) return m.position;
    const ms = this.members;
    if (!ms.length) return new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const e of ms) c.add(e.position);
    return c.multiplyScalar(1 / ms.length);
  }

  // Assemblies (and balls, which roll) keep a heading of their own instead of
  // reading it off a body.
  get usesOwnYaw() {
    const ms = this.members;
    return ms.length !== 1 || ms[0].kind === 'ball';
  }

  heading() {
    if (this.isWorld) return 0;
    const m = this.model;
    if (m) return m.heading();
    if (this.usesOwnYaw) return this.yaw ?? 0;
    return this.members[0]?.heading() ?? 0;
  }

  forward() {
    const h = this.heading() * DEG;
    return new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
  }

  // World-space bounding box of everything in the actor.
  // precise: measure the actual vertices. Otherwise each mesh's box is
  // rotated and re-boxed, which is quick but grows as a ball rolls.
  bounds(precise = false) {
    const box = new THREE.Box3();
    for (const e of this.members) {
      for (const { object3d } of e.bodies) {
        object3d.updateMatrixWorld(true);
        box.expandByObject(object3d, precise);
      }
    }
    return box;
  }

  // A point just outside the front of the actor.
  frontPoint(extra = 0.5) {
    const m = this.model;
    if (m) return this.world.frontPoint(m, extra);
    const box = this.bounds();
    const c = box.getCenter(new THREE.Vector3());
    const h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const f = this.forward();
    return c.add(f.clone().multiplyScalar(Math.abs(f.x) * h.x + Math.abs(f.z) * h.z + extra));
  }

  // Half the actor's length along its heading, for "close enough" checks.
  halfLength() {
    const m = this.model;
    if (m) {
      let r = 0;
      for (const b of m.def.bricks) r = Math.max(r, Math.abs(b.at[2]) + b.size[2] / 2);
      return r;
    }
    const h = this.bounds().getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const f = this.forward();
    return Math.abs(f.x) * h.x + Math.abs(f.z) * h.z;
  }

  totalMass() {
    let m = 0;
    for (const { body } of this.bodies()) if (body.isDynamic()) m += body.mass();
    return m;
  }

  // Move every body by the same impulse per unit mass (a jump or a shove).
  kick(velocity) {
    for (const { body } of this.bodies()) {
      if (!body.isDynamic()) continue;
      body.applyImpulse({ x: velocity.x * body.mass(), y: velocity.y * body.mass(), z: velocity.z * body.mass() }, true);
    }
  }

  // While it's being driven, loose bricks slide without friction, so the
  // bottom row (pressed down by the rows above) keeps up with the rest.
  _setSlick(on) {
    if (!!this._slick === on) return;
    this._slick = on;
    const R = this.world.R;
    this._friction ??= new Map();
    for (const { body } of this.bodies()) {
      if (!body.isDynamic()) continue;
      for (let i = 0; i < body.numColliders(); i++) {
        const c = body.collider(i);
        if (on) this._friction.set(c.handle, c.friction());
        c.setFriction(on ? 0 : this._friction.get(c.handle) ?? 0.8);
        c.setFrictionCombineRule(on ? R.CoefficientCombineRule.Min : R.CoefficientCombineRule.Average);
      }
    }
  }

  // drive/steer/rise for things and pieces (models use World.applyControls).
  // Dynamic bricks get a velocity, so a house drives off as one block and
  // turning swings every brick around the middle. Kinematic props (trees,
  // platforms) are moved directly.
  applyControls(dt) {
    if (this.isWorld || this.model) return;
    const c = this._control;
    const active = !!(c.drive || c.steer || c.rise);
    if (!active && !this._wasActive) return;
    this._wasActive = active;
    const ms = this.members;
    if (!ms.length) return;
    // Moving means setting velocities. Turning a single loose thing in place
    // only turns it (a rolling ball keeps rolling while you aim it).
    const moving = !!(c.drive || c.rise || (c.steer && ms.length > 1));
    const wasMoving = this._wasMoving;
    this._wasMoving = moving;
    this._setSlick(moving);
    const center = this.position;
    const omega = c.steer * DEG;
    const f = this.forward();
    if (this.usesOwnYaw) this.yaw = (this.yaw ?? 0) + c.steer * dt;
    const turn = new THREE.Quaternion().setFromAxisAngle(UP, omega * dt);
    for (const { body, entity } of this.bodies()) {
      const t = body.translation();
      if (body.isKinematic()) {
        if (!active) continue;
        const r = new THREE.Vector3(t.x - center.x, 0, t.z - center.z).applyQuaternion(turn);
        body.setNextKinematicTranslation({
          x: center.x + r.x + f.x * c.drive * dt, y: t.y + c.rise * dt, z: center.z + r.z + f.z * c.drive * dt,
        });
        const q = body.rotation();
        body.setNextKinematicRotation(turn.clone().multiply(new THREE.Quaternion(q.x, q.y, q.z, q.w)));
      } else if (body.isDynamic()) {
        if (moving || wasMoving) {
          const lv = body.linvel();
          const rx = t.x - center.x, rz = t.z - center.z;
          // velocity = forward * drive + (turning about the middle) ω × r
          const tx = f.x * c.drive + omega * rz, tz = f.z * c.drive - omega * rx;
          const vy = c.rise ? c.rise : (wasMoving && !moving && this.world.gravityScale === 0 ? 0 : lv.y);
          body.setLinvel({ x: tx, y: vy, z: tz }, true); // when it stops, it stops
        }
        if (entity.kind !== 'ball' && (c.steer || !active)) {
          const av = body.angvel();
          body.setAngvel({ x: av.x, y: omega, z: av.z }, true);
        }
      }
    }
  }
}

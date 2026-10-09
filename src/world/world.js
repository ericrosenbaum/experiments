// The physics world: Rapier rigid bodies + the Three.js meshes that mirror
// them. Everything in the world is an Entity. Programmable models are
// entities with kind 'model', a chassis body, and named parts joined to the
// chassis by revolute joints (wheels and hinges).
import * as THREE from 'three';
import { brickMesh, wheelMesh, material, SIZES, BRICK_H } from './bricks.js';
import { modelBottom } from './library.js';

const DEG = Math.PI / 180;
export const GRAVITY = -25; // studs/s^2 — "toy scale" gravity, snappy but readable

let nextId = 1;

export class Entity {
  constructor(props) {
    this.id = props.id ?? `e${nextId++}`;
    this.kind = props.kind;           // 'model' | 'brick' | 'tree' | 'house' | 'rock' | 'ramp' | 'ground' ...
    this.name = props.name;
    this.color = props.color;
    this.thingId = props.thingId ?? this.id; // groups (a house of many bricks) share one thingId
    this.def = props.def ?? null;
    this.bodies = [];                // [{body, object3d}]
    this.chassis = null;
    this.parts = new Map();          // name -> {def, body, joint, object3d}
    this.control = { drive: 0, steer: 0 };
    this.owner = props.owner ?? null; // for spawned bricks: the model that made them
    this.remote = !!props.remote;
    this.spawnPose = null;
  }
  get position() {
    const t = this.chassis.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }
  get quaternion() {
    const r = this.chassis.rotation();
    return new THREE.Quaternion(r.x, r.y, r.z, r.w);
  }
  forward() { return new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion); }
  heading() { // degrees, 0 = facing +Z, positive = turned left (toward +X)
    const f = this.forward();
    return Math.atan2(f.x, f.z) / DEG;
  }
  describe() { return { id: this.thingId, name: this.name, kind: this.kind, color: this.color }; }
}

export class World {
  constructor(RAPIER, scene) {
    this.R = RAPIER;
    this.scene = scene;
    this.physics = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.physics.integrationParameters.numSolverIterations = 8;
    this.events = new RAPIER.EventQueue(true);
    this.entities = new Map();
    this.colliderInfo = new Map(); // collider handle -> {entity, part, color}
    this.accum = 0;
    this.dt = 1 / 60;
    this.onCollision = null;       // (infoA, infoB, started) => void
    this.beforeStep = null;        // (dt) => void
    this.paused = false;
    this._buildGround();
  }

  _buildGround() {
    const R = this.R;
    const e = new Entity({ kind: 'ground', name: 'Ground', color: 'green', id: 'ground' });
    const body = this.physics.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    const col = this.physics.createCollider(R.ColliderDesc.cuboid(100, 0.5, 100).setFriction(1.0), body);
    this.colliderInfo.set(col.handle, { entity: e, part: null, color: 'green' });
    e.chassis = body;
    this.entities.set(e.id, e);
    this.ground = e;

    if (typeof document === 'undefined') return; // headless (tests)
    // Baseplate look: a stud texture on a big plane.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#3f9e44'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#4db352'; g.beginPath(); g.arc(32, 32, 19, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2f7f34'; g.lineWidth = 3; g.beginPath(); g.arc(33, 34, 19, 0.2, Math.PI * 0.9); g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(200, 200);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    this.scene.add(plane);
  }

  _register(entity) { this.entities.set(entity.id, entity); return entity; }

  _attachCollider(desc, body, entity, part, color, events) {
    if (events) desc.setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS);
    const col = this.physics.createCollider(desc, body);
    this.colliderInfo.set(col.handle, { entity, part, color });
    return col;
  }

  // ---- programmable models -------------------------------------------------

  addModel(def, { x = 0, z = 0, yaw = 0, name, remote = false, id } = {}) {
    const R = this.R;
    const e = new Entity({ kind: 'model', name: name ?? def.name, color: def.color, def, remote, id });
    const y = -modelBottom(def) + 0.05;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * DEG);
    e.spawnPose = { x, y, z, yaw };
    const mkDesc = () => (remote ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic());

    // chassis
    const chassisDesc = mkDesc().setTranslation(x, y, z).setRotation(q).setAngularDamping(0.8).setLinearDamping(0.05).setCanSleep(false);
    const chassis = this.physics.createRigidBody(chassisDesc);
    if (def.motion === 'glide' && !remote) chassis.setEnabledRotations(false, true, false, true);
    const chassisObj = new THREE.Group();
    for (const br of def.bricks) {
      const [w, h, d] = br.size;
      const desc = R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(...br.at).setDensity(def.density ?? 1);
      // gliders slide on frictionless feet; their motion comes from applyControls
      if (def.motion === 'glide') desc.setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min);
      else desc.setFriction(0.6);
      this._attachCollider(desc, chassis, e, null, br.color, !remote);
      const m = brickMesh(w, h, d, br.color, br.studs !== false);
      m.position.set(...br.at);
      m.userData.entity = e;
      chassisObj.add(m);
    }
    this.scene.add(chassisObj);
    e.chassis = chassis;
    e.bodies.push({ body: chassis, object3d: chassisObj, part: null });

    // parts
    const toWorld = (local) => new THREE.Vector3(...local).applyQuaternion(q).add(new THREE.Vector3(x, y, z));
    for (const p of def.parts) {
      const anchorLocal = p.kind === 'wheel' ? p.at : p.pivot;
      const wp = toWorld(anchorLocal);
      const body = this.physics.createRigidBody(mkDesc().setTranslation(wp.x, wp.y, wp.z).setRotation(q).setCanSleep(false).setAngularDamping(p.kind === 'wheel' ? 0.2 : 2));
      const obj = new THREE.Group();
      if (p.kind === 'wheel') {
        const desc = R.ColliderDesc.ball(p.radius).setFriction(1.6).setDensity(0.6);
        this._attachCollider(desc, body, e, p.name, 'black', !remote);
        const wm = wheelMesh(p.radius, p.width);
        wm.traverse((o) => { o.userData.entity = e; o.userData.part = p.name; });
        obj.add(wm);
      } else {
        for (const br of p.bricks) {
          const [w, h, d] = br.size;
          const desc = R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(...br.at).setFriction(0.7).setDensity(p.density ?? 0.5);
          this._attachCollider(desc, body, e, p.name, br.color, !remote);
          const m = brickMesh(w, h, d, br.color, br.studs !== false);
          m.position.set(...br.at);
          m.userData.entity = e;
          m.userData.part = p.name;
          obj.add(m);
        }
      }
      this.scene.add(obj);
      let joint = null;
      if (!remote) {
        const axis = p.kind === 'wheel' ? { x: 1, y: 0, z: 0 } : { x: p.axis[0], y: p.axis[1], z: p.axis[2] };
        const jd = R.JointData.revolute(
          { x: anchorLocal[0], y: anchorLocal[1], z: anchorLocal[2] }, { x: 0, y: 0, z: 0 }, axis);
        joint = this.physics.createImpulseJoint(jd, chassis, body, true);
        joint.setContactsEnabled(false);
        if (p.kind === 'hinge') {
          const [lo, hi] = p.limits ?? [-180, 180];
          const s = p.sign ?? 1;
          joint.setLimits(Math.min(lo * s, hi * s) * DEG, Math.max(lo * s, hi * s) * DEG);
          joint.configureMotorPosition(0, 400 * (p.strength ?? 1), 40 * (p.strength ?? 1));
        } else {
          joint.configureMotorVelocity(0, 4);
        }
      }
      const part = { def: p, body, joint, object3d: obj, angle: 0, spin: 0, colorOverride: null };
      e.parts.set(p.name, part);
      e.bodies.push({ body, object3d: obj, part: p.name });
    }
    // Disable contacts between parts of the same model (e.g. arm vs wheel).
    if (!remote) {
      const parts = [...e.parts.values()];
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const jd = this.R.JointData.generic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0);
          const nj = this.physics.createImpulseJoint(jd, parts[i].body, parts[j].body, true);
          nj.setContactsEnabled(false);
        }
      }
    }
    chassisObj.userData.entity = e;
    return this._register(e);
  }

  // ---- loose bricks and props ----------------------------------------------

  addBrick({ size = '2x4', dims, color = 'red', x, y, z, yaw = 0, kind = 'brick', name, thingId, owner, sleeping = false, linvel }) {
    const R = this.R;
    const [w, h, d] = dims ?? SIZES[size] ?? SIZES['2x4'];
    const e = new Entity({ kind, name: name ?? `${color} brick`, color, thingId, owner });
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * DEG);
    const desc = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(q).setSleeping(sleeping).setAngularDamping(0.3);
    if (linvel) desc.setLinvel(linvel.x, linvel.y, linvel.z);
    const body = this.physics.createRigidBody(desc);
    this._attachCollider(R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.8).setDensity(0.6), body, e, null, color, false);
    const m = brickMesh(w, h, d, color);
    m.userData.entity = e;
    const obj = new THREE.Group();
    obj.add(m);
    this.scene.add(obj);
    e.chassis = body;
    e.bodies.push({ body, object3d: obj, part: null });
    e.size = [w, h, d];
    this._syncOne(body, obj);
    return this._register(e);
  }

  // A fixed prop built from boxes: [{at, size, color}]
  addStatic({ kind, name, color, x, y = 0, z, yaw = 0, boxes, thingId }) {
    const R = this.R;
    const e = new Entity({ kind, name, color, thingId });
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * DEG);
    const body = this.physics.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q));
    const obj = new THREE.Group();
    for (const bx of boxes) {
      const [w, h, d] = bx.size;
      const cd = R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(...bx.at).setFriction(0.8);
      if (bx.rot) cd.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(...bx.rot)));
      this._attachCollider(cd, body, e, null, bx.color, false);
      const m = brickMesh(w, h, d, bx.color, bx.studs !== false);
      m.position.set(...bx.at);
      if (bx.rot) m.rotation.set(...bx.rot);
      m.userData.entity = e;
      obj.add(m);
    }
    this.scene.add(obj);
    e.chassis = body;
    e.bodies.push({ body, object3d: obj, part: null });
    this._syncOne(body, obj);
    return this._register(e);
  }

  addBall({ radius = 1.2, color = 'white', x, y, z, name = 'Ball' }) {
    const R = this.R;
    const e = new Entity({ kind: 'ball', name, color });
    const body = this.physics.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setAngularDamping(0.4).setLinearDamping(0.1));
    this._attachCollider(R.ColliderDesc.ball(radius).setFriction(0.6).setRestitution(0.6).setDensity(0.2), body, e, null, color, false);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), material(color));
    m.castShadow = true;
    m.userData.entity = e;
    const spots = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 1.01, 0), new THREE.MeshStandardMaterial({ color: 0x222222, wireframe: true }));
    const obj = new THREE.Group();
    obj.add(m, spots);
    this.scene.add(obj);
    e.chassis = body;
    e.bodies.push({ body, object3d: obj, part: null });
    return this._register(e);
  }

  remove(entity) {
    for (const { body, object3d } of entity.bodies) {
      for (let i = 0; i < body.numColliders(); i++) this.colliderInfo.delete(body.collider(i).handle);
      this.physics.removeRigidBody(body);
      this.scene.remove(object3d);
    }
    entity.bodies = [];
    entity.removed = true;
    this.entities.delete(entity.id);
  }

  // ---- motors ---------------------------------------------------------------

  applyControls(e, dt) {
    if (e.remote || e.removed) return;
    const c = e.control;
    const def = e.def;
    const R = this.R;
    if (def.motion === 'wheels') {
      const wheels = [...e.parts.values()].filter((p) => p.def.kind === 'wheel');
      const track = Math.max(...wheels.map((w) => Math.abs(w.def.at[0]))) * 2;
      const omega = c.steer * DEG;
      for (const w of wheels) {
        const sideSign = w.def.side === 'left' ? -1 : 1;
        const v = c.drive + sideSign * omega * track / 2;
        w.joint.configureMotorVelocity(v / w.def.radius, 40 * (def.wheelPower ?? 1));
      }
      // Skid-steering four grippy wheels barely turns, so help the chassis
      // yaw toward the requested rate (like a kid steering a toy by hand).
      if (Math.abs(c.steer) > 0.01 || c._wasSteering) {
        const av = e.chassis.angvel();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(e.quaternion);
        const cur = av.x * up.x + av.y * up.y + av.z * up.z;
        const k = 0.6 * (omega - cur);
        e.chassis.setAngvel({ x: av.x + up.x * k, y: av.y + up.y * k, z: av.z + up.z * k }, true);
      }
      c._wasSteering = Math.abs(c.steer) > 0.01;
    } else {
      // glide: steer the chassis velocity directly, keep gravity
      const lv = e.chassis.linvel();
      const f = e.forward();
      const target = f.multiplyScalar(c.drive);
      const k = 0.2; // smoothing toward the target velocity
      const grounded = Math.abs(lv.y) < 1.5;
      if (grounded || Math.abs(c.drive) > 0) {
        e.chassis.setLinvel({ x: lv.x + (target.x - lv.x) * k, y: lv.y, z: lv.z + (target.z - lv.z) * k }, true);
      }
      const av = e.chassis.angvel();
      e.chassis.setAngvel({ x: 0, y: av.y + (c.steer * DEG - av.y) * 0.3, z: 0 }, true);
    }
    for (const p of e.parts.values()) {
      if (p.def.kind !== 'hinge') continue;
      const s = p.def.sign ?? 1;
      const str = p.def.strength ?? 1;
      if (p.spin) {
        // spinning a hinge: open its limits and drive by velocity
        p.joint.setLimits(-1e6, 1e6);
        p.joint.configureMotorVelocity(p.spin * DEG * s, 20 * str);
      } else {
        // Ease the motor target toward the requested angle at the part's
        // swing speed, so motions are smooth and throws have a sane speed.
        p.cmdAngle ??= 0;
        const step = (p.def.speed ?? 240) * dt;
        p.cmdAngle += Math.max(-step, Math.min(step, p.angle - p.cmdAngle));
        p.joint.configureMotorPosition(p.cmdAngle * DEG * s, 600 * str, 50 * str);
      }
    }
    void R;
  }

  // ---- stepping -------------------------------------------------------------

  step(frameDt) {
    if (this.paused) { this.sync(); return; }
    this.accum += Math.min(frameDt, 0.1);
    let steps = 0;
    while (this.accum >= this.dt && steps < 4) {
      this.beforeStep?.(this.dt);
      for (const e of this.entities.values()) if (e.kind === 'model') this.applyControls(e, this.dt);
      this.physics.step(this.events);
      this.events.drainCollisionEvents((h1, h2, started) => {
        const a = this.colliderInfo.get(h1), b = this.colliderInfo.get(h2);
        if (a && b && a.entity !== b.entity) this.onCollision?.(a, b, started);
      });
      this.accum -= this.dt;
      steps++;
    }
    this.sync();
    this._cleanupFallen();
  }

  _syncOne(body, obj) {
    const t = body.translation(), r = body.rotation();
    obj.position.set(t.x, t.y, t.z);
    obj.quaternion.set(r.x, r.y, r.z, r.w);
  }

  sync() {
    for (const e of this.entities.values()) for (const { body, object3d } of e.bodies) this._syncOne(body, object3d);
  }

  _cleanupFallen() {
    for (const e of [...this.entities.values()]) {
      if (!e.chassis || e.kind === 'ground' || e.removed) continue;
      if (e.chassis.translation().y < -40) {
        if (e.kind === 'model' && !e.remote) this.resetModel(e);
        else if (e.kind !== 'model') this.remove(e);
      }
    }
  }

  resetModel(e, pose = e.spawnPose) {
    const { x, y, z, yaw } = pose;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * DEG);
    const base = new THREE.Vector3(x, y, z);
    e.control.drive = 0; e.control.steer = 0;
    e.chassis.setTranslation(base, true);
    e.chassis.setRotation(q, true);
    e.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    e.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const p of e.parts.values()) {
      const local = p.def.kind === 'wheel' ? p.def.at : p.def.pivot;
      p.body.setTranslation(new THREE.Vector3(...local).applyQuaternion(q).add(base), true);
      p.body.setRotation(q, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      p.angle = 0; p.spin = 0; p.cmdAngle = 0;
      if (p.def.kind === 'hinge') {
        const [lo, hi] = p.def.limits ?? [-180, 180];
        const s = p.def.sign ?? 1;
        p.joint.setLimits(Math.min(lo * s, hi * s) * DEG, Math.max(lo * s, hi * s) * DEG);
      }
    }
  }

  // ---- queries --------------------------------------------------------------

  // World-space point on a model in local coordinates.
  localToWorld(e, local) {
    return new THREE.Vector3(...local).applyQuaternion(e.quaternion).add(e.position);
  }

  // Front of a model: center of its chassis bricks pushed to the front face.
  frontPoint(e, extra = 0.5) {
    let maxZ = -Infinity, sumY = 0;
    for (const br of e.def.bricks) { maxZ = Math.max(maxZ, br.at[2] + br.size[2] / 2); sumY += br.at[1]; }
    for (const p of e.def.parts) if (p.kind === 'hinge') for (const br of p.bricks) maxZ = Math.max(maxZ, p.pivot[2] + br.at[2] + br.size[2] / 2);
    return this.localToWorld(e, [0, sumY / e.def.bricks.length, maxZ + extra]);
  }

  raycast(origin, dir, maxDist, excludeEntity) {
    const R = this.R;
    const ray = new R.Ray(origin, dir);
    const hit = this.physics.castRay(ray, maxDist, true, undefined, undefined, undefined, undefined,
      (col) => this.colliderInfo.get(col.handle)?.entity !== excludeEntity);
    if (!hit) return null;
    const info = this.colliderInfo.get(hit.collider.handle);
    return info ? { info, distance: hit.timeOfImpact } : null;
  }

  // Center of all entities sharing a thingId (a house is many bricks).
  thingCenter(thingId) {
    const pts = [];
    for (const e of this.entities.values()) if (e.thingId === thingId && e.chassis) pts.push(e.position);
    if (!pts.length) return null;
    return pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  }

  // One entry per thing (groups collapsed), with a representative entity.
  things() {
    const out = new Map();
    for (const e of this.entities.values()) {
      if (e.kind === 'ground' || !e.chassis) continue;
      if (!out.has(e.thingId)) out.set(e.thingId, e);
    }
    return out;
  }
}

export { BRICK_H, material };

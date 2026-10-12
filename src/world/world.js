// The physics world: Rapier rigid bodies + the Three.js meshes that mirror
// them. Everything in the world is an Entity. Programmable models are
// entities with kind 'model', a chassis body, and named parts joined to the
// chassis by revolute joints (wheels and hinges). Entities that share a
// thingId form one assembly (a house of loose bricks); see actor.js for how
// programs address models, assemblies, single bricks and the world itself.
import * as THREE from 'three';
import { brickMesh, wheelMesh, material, SIZES, BRICK_H } from './bricks.js';
import { modelBottom, modelBounds } from './library.js';
import { Actor } from './actor.js';
import { buildMinifig, buildSeatedMinifig, FIG } from './minifig.js';

const DEG = Math.PI / 180;
export const GRAVITY = -25; // studs/s^2 — "toy scale" gravity, snappy but readable
const FAR = 150; // things that fly further than this are cleaned up

let nextId = 1;
const yawQuat = (yaw) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * DEG);

export class Entity {
  constructor(props) {
    this.id = props.id ?? `e${nextId++}`;
    this.kind = props.kind;           // 'model' | 'brick' | 'tree' | 'house' | 'rock' | 'ramp' | 'ground' ...
    this.name = props.name;
    this.color = props.color;
    this.thingId = props.thingId ?? this.id; // an assembly (a house of many bricks) shares one thingId
    this.def = props.def ?? null;
    this.bodies = [];                // [{body, object3d}]
    this.chassis = null;
    this.parts = new Map();          // name -> {def, body, joint, object3d}
    this.control = { drive: 0, steer: 0, rise: 0 };
    this.owner = props.owner ?? null; // for spawned bricks: the actor that made them
    this.recipe = null;              // how to build it again (for clone)
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
  describe() {
    const d = { id: this.thingId, name: this.name, kind: this.kind, color: this.color };
    if (this.def) d.type = this.def.id; // which library model, e.g. "cow"
    return d;
  }
}

export class World {
  constructor(RAPIER, scene) {
    this.R = RAPIER;
    this.scene = scene;
    this.physics = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.physics.integrationParameters.numSolverIterations = 8;
    this.events = new RAPIER.EventQueue(true);
    this.entities = new Map();
    this.byThing = new Map();      // thingId -> Set(entity)
    this.actors = new Map();       // key -> Actor
    this.colliderInfo = new Map(); // collider handle -> {entity, part, color}
    this.memberCount = new Map();  // thingId -> next member number, for stable brick ids
    this.accum = 0;
    this.dt = 1 / 60;
    this.gravityScale = 1;
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
    this.groundCanvas = document.createElement('canvas');
    this.groundCanvas.width = this.groundCanvas.height = 64;
    const tex = new THREE.CanvasTexture(this.groundCanvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(200, 200);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex = tex;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 2, roughness: 0.75 }));
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    plane.userData.ground = true;
    this.scene.add(plane);
    this.setGroundLook();
  }

  // Baseplate look: a stud texture on a big plane.
  setGroundLook({ base = '#3f9e44', stud = '#4db352', edge = '#2f7f34' } = {}) {
    if (!this.groundCanvas) return;
    const g = this.groundCanvas.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    g.fillStyle = stud; g.beginPath(); g.arc(32, 32, 19, 0, Math.PI * 2); g.fill();
    g.strokeStyle = edge; g.lineWidth = 3; g.beginPath(); g.arc(33, 34, 19, 0.2, Math.PI * 0.9); g.stroke();
    this.groundTex.needsUpdate = true;
  }

  // 1 = normal, 0 = floating, negative = things fall up.
  setGravity(scale) {
    this.gravityScale = scale;
    this.physics.gravity = { x: 0, y: GRAVITY * scale, z: 0 };
    // Sleeping bodies ignore gravity, so wake them up when there is some.
    if (scale !== 0) this.physics.forEachRigidBody((b) => { if (b.isDynamic()) b.wakeUp(); });
  }

  actor(key) {
    let a = this.actors.get(key);
    if (!a) { a = new Actor(this, key); this.actors.set(key, a); }
    return a;
  }

  // The actor an entity belongs to (its whole assembly).
  actorOf(entity) { return this.actor(entity.thingId); }

  _register(entity) {
    this.entities.set(entity.id, entity);
    if (!this.byThing.has(entity.thingId)) this.byThing.set(entity.thingId, new Set());
    this.byThing.get(entity.thingId).add(entity);
    return entity;
  }

  _memberId(thingId) {
    const n = (this.memberCount.get(thingId) ?? 0) + 1;
    this.memberCount.set(thingId, n);
    return `${thingId}.${n}`;
  }

  _attachCollider(desc, body, entity, part, color) {
    desc.setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS);
    const col = this.physics.createCollider(desc, body);
    this.colliderInfo.set(col.handle, { entity, part, color });
    return col;
  }

  // ---- programmable models -------------------------------------------------

  addModel(def, { x = 0, y, z = 0, yaw = 0, name, id, thingId } = {}) {
    const R = this.R;
    const e = new Entity({ kind: 'model', name: name ?? def.name, color: def.color, def, id, thingId: thingId ?? id });
    y ??= -modelBottom(def) + 0.05;
    const q = yawQuat(yaw);
    e.spawnPose = { x, y, z, yaw };
    e.recipe = { type: 'model', defId: def.id };

    // chassis
    const chassisDesc = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(q).setAngularDamping(0.8).setLinearDamping(0.05).setCanSleep(false);
    const chassis = this.physics.createRigidBody(chassisDesc);
    if (def.motion === 'glide') chassis.setEnabledRotations(false, true, false, true);
    const chassisObj = new THREE.Group();
    for (const br of def.bricks) {
      const [w, h, d] = br.size;
      const desc = R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(...br.at).setDensity(def.density ?? 1);
      // gliders slide on frictionless feet; their motion comes from applyControls
      if (def.motion === 'glide') desc.setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min);
      else desc.setFriction(0.6);
      this._attachCollider(desc, chassis, e, null, br.color);
      if (br.hidden) continue; // a collider only; something else is drawn there
      const m = brickMesh(w, h, d, br.color, br.studs !== false);
      m.position.set(...br.at);
      m.userData.entity = e;
      chassisObj.add(m);
    }
    // Minifigures are drawn by minifig.js, in figure space (y = 0 at the feet);
    // the chassis origin sits at the top of the hips.
    const fig = def.figure ? buildMinifig(def.figure) : null;
    const tag = (obj, part) => obj.traverse((o) => { o.userData.entity = e; if (part) o.userData.part = part; });
    if (fig) {
      fig.body.position.y = -FIG.torsoY;
      tag(fig.body);
      chassisObj.add(fig.body);
      e.figureLegs = fig.legs;
      e.walk = 0;
    }
    // a rider (a race car's driver) is only for looks: no collider, but clicking it picks the model
    if (def.rider) {
      const rider = buildSeatedMinifig(def.rider.figure, { reach: def.rider.reach });
      rider.position.set(...def.rider.at);
      tag(rider);
      chassisObj.add(rider);
    }
    this.scene.add(chassisObj);
    e.chassis = chassis;
    e.bodies.push({ body: chassis, object3d: chassisObj, part: null });

    // parts
    const toWorld = (local) => new THREE.Vector3(...local).applyQuaternion(q).add(new THREE.Vector3(x, y, z));
    for (const p of def.parts) {
      const anchorLocal = p.kind === 'wheel' ? p.at : p.pivot;
      const wp = toWorld(anchorLocal);
      const body = this.physics.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(wp.x, wp.y, wp.z).setRotation(q).setCanSleep(false).setAngularDamping(p.kind === 'wheel' ? 0.2 : 2));
      const obj = new THREE.Group();
      if (p.kind === 'wheel') {
        const desc = R.ColliderDesc.ball(p.radius).setFriction(1.6).setDensity(0.6);
        this._attachCollider(desc, body, e, p.name, 'black');
        const wm = wheelMesh(p.radius, p.width);
        wm.traverse((o) => { o.userData.entity = e; o.userData.part = p.name; });
        obj.add(wm);
      } else {
        for (const br of p.bricks) {
          const [w, h, d] = br.size;
          const desc = R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(...br.at).setFriction(0.7).setDensity(p.density ?? 0.5);
          this._attachCollider(desc, body, e, p.name, br.color);
          if (br.hidden) continue;
          const m = brickMesh(w, h, d, br.color, br.studs !== false);
          m.position.set(...br.at);
          m.userData.entity = e;
          m.userData.part = p.name;
          obj.add(m);
        }
      }
      // a minifigure's head and arms ride on these part bodies
      if (fig) {
        const look = p.name === 'head' ? fig.head : p === def.parts[1] ? fig.leftArm : p === def.parts[2] ? fig.rightArm : null;
        if (look) {
          look.position.set(-p.pivot[0], -p.pivot[1] - FIG.torsoY, -p.pivot[2]);
          tag(look, p.name);
          obj.add(look);
        }
      }
      this.scene.add(obj);
      const axis = p.kind === 'wheel' ? { x: 1, y: 0, z: 0 } : { x: p.axis[0], y: p.axis[1], z: p.axis[2] };
      const jd = R.JointData.revolute(
        { x: anchorLocal[0], y: anchorLocal[1], z: anchorLocal[2] }, { x: 0, y: 0, z: 0 }, axis);
      const joint = this.physics.createImpulseJoint(jd, chassis, body, true);
      joint.setContactsEnabled(false);
      if (p.kind === 'hinge') {
        const [lo, hi] = p.limits ?? [-180, 180];
        const s = p.sign ?? 1;
        joint.setLimits(Math.min(lo * s, hi * s) * DEG, Math.max(lo * s, hi * s) * DEG);
        joint.configureMotorPosition(0, 400 * (p.strength ?? 1), 40 * (p.strength ?? 1));
      } else {
        joint.configureMotorVelocity(0, 4);
      }
      const part = { def: p, body, joint, object3d: obj, angle: 0, spin: 0, colorOverride: null };
      e.parts.set(p.name, part);
      e.bodies.push({ body, object3d: obj, part: p.name });
    }
    // Disable contacts between parts of the same model (e.g. arm vs wheel).
    const parts = [...e.parts.values()];
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const jd = this.R.JointData.generic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0);
        const nj = this.physics.createImpulseJoint(jd, parts[i].body, parts[j].body, true);
        nj.setContactsEnabled(false);
      }
    }
    chassisObj.userData.entity = e;
    return this._register(e);
  }

  // Nearest spot to (x, z), spiralling outward, where a box (min/max relative
  // to the pose origin) doesn't touch anything already in the world. y is the
  // origin's height; by default the box rests on the ground.
  findClearBox({ min, max }, { x = 0, z = 0, yaw = 0, y } = {}, margin = 0.5) {
    const R = this.R;
    const half = min.map((v, k) => (max[k] - v) / 2 + margin);
    const center = min.map((v, k) => (max[k] + v) / 2);
    const lift = y ?? -min[1] + 0.05;
    const q = yawQuat(yaw);
    const shape = new R.Cuboid(...half);
    // Test colliders directly: the scene-query tree only refreshes on step,
    // so it would miss things added since (like the whole world at boot).
    const others = [];
    this.physics.forEachCollider((col) => {
      if (this.colliderInfo.get(col.handle)?.entity.kind !== 'ground') others.push(col);
    });
    const reach = Math.hypot(...half) + 12;
    const clear = (px, pz) => {
      const c = new THREE.Vector3(...center).applyQuaternion(q).add(new THREE.Vector3(px, lift, pz));
      return others.every((col) => {
        const t = col.translation();
        return Math.hypot(t.x - c.x, t.z - c.z) > reach || !col.intersectsShape(shape, c, q);
      });
    };
    if (clear(x, z)) return { x, z, yaw };
    for (let r = 2; r <= 60; r += 2) {
      const n = Math.ceil((2 * Math.PI * r) / 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const px = x + r * Math.cos(a), pz = z + r * Math.sin(a);
        if (clear(px, pz)) return { x: px, z: pz, yaw };
      }
    }
    return { x, z, yaw };
  }

  findClearSpot(def, pose = {}, margin = 0.5) { return this.findClearBox(modelBounds(def), pose, margin); }

  // ---- loose bricks and props ----------------------------------------------

  // A loose, dynamic brick. Bricks that share a thingId make one assembly.
  addBrick(opts) {
    const { size = '2x4', dims, color = 'red', x, y, z, yaw = 0, quat, kind = 'brick', name, thingId, id, owner, sleeping = false, linvel, angvel, studs } = opts;
    const R = this.R;
    const [w, h, d] = dims ?? SIZES[size] ?? SIZES['2x4'];
    const e = new Entity({ kind, name: name ?? `${color} brick`, color, thingId, owner, id: id ?? (thingId ? this._memberId(thingId) : undefined) });
    const q = quat ?? yawQuat(yaw);
    const desc = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(q).setSleeping(sleeping).setAngularDamping(0.3);
    if (linvel) desc.setLinvel(linvel.x, linvel.y, linvel.z);
    if (angvel) desc.setAngvel(angvel);
    const body = this.physics.createRigidBody(desc);
    this._attachCollider(R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.8).setDensity(0.6), body, e, null, color);
    const m = brickMesh(w, h, d, color, studs !== false);
    m.userData.entity = e;
    const obj = new THREE.Group();
    obj.add(m);
    this.scene.add(obj);
    e.chassis = body;
    e.bodies.push({ body, object3d: obj, part: null });
    e.size = [w, h, d];
    e.recipe = { type: 'brick', opts: { dims: [w, h, d], color, kind, name: e.name, studs } };
    this._syncOne(body, obj);
    return this._register(e);
  }

  // A prop built from boxes: [{at, size, color, rot?}]. It doesn't fall or get
  // knocked over, but a program can still drive it around (it's kinematic).
  // sensor: things pass through it but it still feels touches (coins).
  addStatic(opts) {
    const { kind, name, color, x, y = 0, z, yaw = 0, quat, boxes, thingId, id, sensor = false } = opts;
    const R = this.R;
    const e = new Entity({ kind, name, color, thingId, id: id ?? thingId });
    const body = this.physics.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z).setRotation(quat ?? yawQuat(yaw)));
    const obj = new THREE.Group();
    for (const bx of boxes) {
      const [w, h, d] = bx.size;
      const cd = R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(...bx.at).setFriction(0.8).setSensor(sensor);
      if (bx.rot) cd.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(...bx.rot)));
      this._attachCollider(cd, body, e, null, bx.color);
      const m = brickMesh(w, h, d, bx.color, bx.studs !== false);
      m.position.set(...bx.at);
      if (bx.rot) m.rotation.set(...bx.rot);
      m.userData.entity = e;
      obj.add(m);
    }
    this.scene.add(obj);
    e.chassis = body;
    e.bodies.push({ body, object3d: obj, part: null });
    e.recipe = { type: 'static', opts: { kind, name, color, boxes, sensor } };
    this._syncOne(body, obj);
    return this._register(e);
  }

  // damping slows its roll (a golf ball rolls to a stop on the green); bounce is restitution.
  addBall({ radius = 1.2, color = 'white', x, y, z, quat, name = 'Ball', kind = 'ball', thingId, id, damping = 0.1, spinDamping = 0.4, bounce = 0.6, spots = true, density = 0.2 }) {
    const R = this.R;
    const e = new Entity({ kind, name, color, thingId, id: id ?? thingId });
    const desc = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setAngularDamping(spinDamping).setLinearDamping(damping).setCcdEnabled(true);
    if (quat) desc.setRotation(quat);
    const body = this.physics.createRigidBody(desc);
    this._attachCollider(R.ColliderDesc.ball(radius).setFriction(0.6).setRestitution(bounce).setDensity(density), body, e, null, color);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, radius > 2 ? 4 : 2), material(color)); // smoother when it's big
    m.castShadow = true;
    m.userData.entity = e;
    const obj = new THREE.Group();
    obj.add(m);
    if (spots) { // lines on it, so you can see it roll
      const lines = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 1.01, 0), new THREE.MeshStandardMaterial({ color: 0x222222, wireframe: true }));
      lines.userData.entity = e;
      obj.add(lines);
    }
    this.scene.add(obj);
    e.chassis = body;
    e.bodies.push({ body, object3d: obj, part: null });
    e.recipe = { type: 'ball', opts: { radius, color, name, kind, damping, spinDamping, bounce, spots, density } };
    return this._register(e);
  }

  // Build an entity again from its recipe at a new pose (for clone).
  rebuild(recipe, { x, y, z, quat, yaw, id, thingId, name, sleeping, def }) {
    switch (recipe.type) {
      case 'model': return this.addModel(def, { x, y, z, yaw, id, thingId, name });
      case 'brick': return this.addBrick({ ...recipe.opts, x, y, z, quat, id, thingId, name: name ?? recipe.opts.name, sleeping });
      case 'static': return this.addStatic({ ...recipe.opts, x, y, z, quat, id, thingId, name: name ?? recipe.opts.name });
      case 'ball': return this.addBall({ ...recipe.opts, x, y, z, quat, id, thingId, name: name ?? recipe.opts.name });
      default: return null;
    }
  }

  remove(entity) {
    if (entity.removed) return;
    for (const { body, object3d } of entity.bodies) {
      for (let i = 0; i < body.numColliders(); i++) this.colliderInfo.delete(body.collider(i).handle);
      this.physics.removeRigidBody(body);
      this.scene.remove(object3d);
    }
    entity.bodies = [];
    entity.removed = true;
    this.entities.delete(entity.id);
    const set = this.byThing.get(entity.thingId);
    set?.delete(entity);
    if (set && !set.size) this.byThing.delete(entity.thingId);
  }

  // Remove everything but the ground.
  clear() {
    for (const e of [...this.entities.values()]) if (e.kind !== 'ground') this.remove(e);
    this.memberCount.clear();
    for (const a of this.actors.values()) { a._control.drive = a._control.steer = a._control.rise = 0; a.yaw = null; a._wasActive = a._wasMoving = false; }
  }

  // ---- motors ---------------------------------------------------------------

  applyControls(e, dt) {
    if (e.removed) return;
    const c = e.control;
    const def = e.def;
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
      if (c.rise) { const lv = e.chassis.linvel(); e.chassis.setLinvel({ x: lv.x, y: c.rise, z: lv.z }, true); }
    } else {
      // glide: steer the chassis velocity directly, keep gravity
      const lv = e.chassis.linvel();
      const f = e.forward();
      const target = f.multiplyScalar(c.drive);
      const k = 0.2; // smoothing toward the target velocity
      const grounded = Math.abs(lv.y) < 1.5;
      // rising flies; with no gravity, gliders hover instead of drifting off
      const vy = c.rise ? lv.y + (c.rise - lv.y) * 0.3 : this.gravityScale === 0 ? lv.y * 0.9 : lv.y;
      if (grounded || Math.abs(c.drive) > 0 || c.rise || this.gravityScale === 0) {
        e.chassis.setLinvel({ x: lv.x + (target.x - lv.x) * k, y: vy, z: lv.z + (target.z - lv.z) * k }, true);
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
  }

  // ---- stepping -------------------------------------------------------------

  step(frameDt) {
    if (this.paused) { this.sync(); return; }
    this.accum += Math.min(frameDt, 0.1);
    let steps = 0;
    while (this.accum >= this.dt && steps < 4) {
      this.beforeStep?.(this.dt);
      for (const e of this.entities.values()) if (e.kind === 'model') this.applyControls(e, this.dt);
      for (const a of this.actors.values()) if (a._wasActive || a._control.drive || a._control.steer || a._control.rise) a.applyControls(this.dt);
      this.physics.step(this.events);
      this.events.drainCollisionEvents((h1, h2, started) => {
        const a = this.colliderInfo.get(h1), b = this.colliderInfo.get(h2);
        if (a && b && a.entity !== b.entity) this.onCollision?.(a, b, started);
      });
      this.accum -= this.dt;
      steps++;
    }
    this.sync();
    this._animateFigures(Math.min(frameDt, 0.1));
    this._cleanupFallen();
  }

  // Minifigures swing their legs as they walk, faster the faster they go.
  _animateFigures(dt) {
    for (const e of this.entities.values()) {
      if (!e.figureLegs) continue;
      const v = e.chassis.linvel();
      const speed = Math.hypot(v.x, v.z);
      const moving = Math.min(1, speed / 4);
      e.walk += dt * Math.min(speed, 14) * 1.6;
      const swing = Math.sin(e.walk) * 0.55 * moving;
      e.figureLegs[0].rotation.x = swing;
      e.figureLegs[1].rotation.x = -swing;
    }
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
      const t = e.chassis.translation();
      if (t.y < -40 || t.y > FAR || Math.abs(t.x) > FAR || Math.abs(t.z) > FAR) {
        if (e.kind === 'model') this.resetModel(e);
        else this.remove(e);
      }
    }
  }

  resetModel(e, pose = e.spawnPose) {
    const { x, y, z, yaw } = pose;
    const q = yawQuat(yaw);
    const base = new THREE.Vector3(x, y, z);
    e.control.drive = 0; e.control.steer = 0; e.control.rise = 0;
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

  // Move and turn a set of entities rigidly: rotate by dyaw (degrees) about
  // `pivot`, then shift by `delta`. Used for dragging and for layouts.
  transform(entities, { delta = new THREE.Vector3(), dyaw = 0, pivot, keepSpawn = false }) {
    const q = yawQuat(dyaw);
    pivot ??= new THREE.Vector3();
    for (const e of entities) {
      for (const { body } of e.bodies) {
        const t = body.translation(), r = body.rotation();
        const p = new THREE.Vector3(t.x, t.y, t.z).sub(pivot).applyQuaternion(q).add(pivot).add(delta);
        const nq = q.clone().multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w));
        body.setTranslation(p, false);
        body.setRotation(nq, false);
        if (body.isKinematic()) { body.setNextKinematicTranslation(p); body.setNextKinematicRotation(nq); }
      }
      if (e.spawnPose && !keepSpawn) {
        const sp = new THREE.Vector3(e.spawnPose.x, e.spawnPose.y, e.spawnPose.z).sub(pivot).applyQuaternion(q).add(pivot).add(delta);
        e.spawnPose = { x: sp.x, y: sp.y, z: sp.z, yaw: e.spawnPose.yaw + dyaw };
      }
    }
    this.sync();
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

  // exclude: (entity) => true for entities the ray should pass through
  raycast(origin, dir, maxDist, exclude) {
    const R = this.R;
    const ray = new R.Ray(origin, dir);
    const hit = this.physics.castRay(ray, maxDist, true, undefined, undefined, undefined, undefined,
      (col) => { const info = this.colliderInfo.get(col.handle); return !!info && !col.isSensor() && !exclude?.(info.entity); });
    if (!hit) return null;
    const info = this.colliderInfo.get(hit.collider.handle);
    return info ? { info, distance: hit.timeOfImpact } : null;
  }

  // Center of an assembly (or of one entity, by id).
  thingCenter(thingId) {
    const set = this.byThing.get(thingId);
    if (set?.size) {
      const c = new THREE.Vector3();
      for (const e of set) c.add(e.position);
      return c.multiplyScalar(1 / set.size);
    }
    const e = this.entities.get(thingId);
    return e?.chassis && e.kind !== 'ground' ? e.position : null;
  }

  // One entry per thing (assemblies collapsed), with a representative entity.
  things() {
    const out = new Map();
    for (const [thingId, set] of this.byThing) {
      const [e] = set;
      if (e.kind !== 'ground' && e.chassis) out.set(thingId, e);
    }
    return out;
  }
}

export { BRICK_H, material };

// The physics world: Rapier rigid bodies + the Three.js meshes that mirror
// them. Everything in the world is an Entity. Programmable models are
// entities with kind 'model', a chassis body, and named parts joined to the
// chassis by revolute joints (wheels and hinges). Entities that share a
// thingId form one assembly (a house of loose bricks); see actor.js for how
// programs address models, assemblies, single bricks and the world itself.
import * as THREE from 'three';
import { brickMesh, wheelMesh, flowerMesh, material, colorHex, SIZES, BRICK_H } from './bricks.js';
import { modelBottom, modelBounds } from './library.js';
import { Actor } from './actor.js';
import { buildMinifig, buildSeatedMinifig, FIG } from './minifig.js';

const DEG = Math.PI / 180;
// A seated minifigure's collision boxes, [half-sizes, center] in the space of
// buildSeatedMinifig (origin where its thighs meet the seat): legs out front,
// body, head.
const RIDER_BOXES = [
  [0.9, 0.5, 0.95, 0, 0.55, 0.85],
  [0.9, 1.0, 0.5, 0, 1.85, 0],
  [0.6, 0.6, 0.6, 0, 3.6, 0],
];
// How sudden a change in a model's speed in one physics step throws its rider
// out (studs a second): driving, steering and bumps stay well under this.
const RIDER_JOLT = 9;
const toWorldPoint = (local, q, x, y, z) => local.clone().applyQuaternion(q).add(new THREE.Vector3(x, y, z));

// Pen lines: matte, colored per vertex, drawn from both sides.
const PEN_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });

// Split boxes into brick-sized pieces (at most 2 studs across and a brick
// tall), coarser if that would make too many to keep the world quick.
const MAX_PIECES = 160;
function splitIntoBricks(boxes) {
  const counts = (scale) => boxes.map(({ size: [w, h, d] }) => [Math.ceil(w / (2 * scale) - 0.01), Math.ceil(h / (1.2 * scale) - 0.01), Math.ceil(d / (2 * scale) - 0.01)]);
  let scale = 1, n = counts(scale);
  while (n.reduce((sum, [a, b, c]) => sum + a * b * c, 0) > MAX_PIECES && scale < 20) n = counts(scale *= 1.25);
  const out = [];
  boxes.forEach(({ size: [w, h, d], color, pos, quat }, i) => {
    const [nx, ny, nz] = n[i];
    const sw = w / nx, sh = h / ny, sd = d / nz;
    for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
      const local = new THREE.Vector3(-w / 2 + sw * (ix + 0.5), -h / 2 + sh * (iy + 0.5), -d / 2 + sd * (iz + 0.5));
      out.push({ size: [sw * 0.96, sh * 0.96, sd * 0.96], color, pos: local.applyQuaternion(quat).add(pos), quat });
    }
  });
  return out;
}

const GLIDE_ROUND = 0.2; // studs: the rounding on a glider's collision boxes
export const WHEEL_ACCEL = 60; // studs/s² a wheeled model speeds up by, at most
const TRACTION = 90; // studs/s² the traction assist can change a wheeled model's ground speed by
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
      // Gliders slide on frictionless feet (their motion comes from
      // applyControls), with rounded edges so they ride up over thin lips
      // (a pond, a road) instead of catching on them like a box would.
      const round = def.motion === 'glide' ? Math.min(GLIDE_ROUND, w / 4, h / 4, d / 4) : 0;
      const desc = (round
        ? R.ColliderDesc.roundCuboid(w / 2 - round, h / 2 - round, d / 2 - round, round)
        : R.ColliderDesc.cuboid(w / 2, h / 2, d / 2)).setTranslation(...br.at).setDensity(def.density ?? 1);
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
    this.scene.add(chassisObj);
    e.chassis = chassis;
    e.bodies.push({ body: chassis, object3d: chassisObj, part: null });
    // A rider (the race car's driver) is its own body held in the seat by a
    // joint, so it bumps into things; a crash, a hard landing or flipping over
    // lets go of it and it tumbles out (see _checkRiders). Reset puts it back.
    if (def.rider) {
      const at = new THREE.Vector3(...def.rider.at);
      const rp = toWorldPoint(at, q, x, y, z);
      const body = this.physics.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(rp.x, rp.y, rp.z).setRotation(q).setAngularDamping(0.4));
      const color = def.rider.figure.torso ?? 'white';
      for (const [hx, hy, hz, cx, cy, cz] of RIDER_BOXES) {
        this._attachCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setDensity(0.3).setFriction(0.8), body, e, null, color);
      }
      const joint = this.physics.createImpulseJoint(R.JointData.fixed(at, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }), chassis, body, true);
      joint.setContactsEnabled(false);
      const look = buildSeatedMinifig(def.rider.figure, { reach: def.rider.reach });
      tag(look);
      const obj = new THREE.Group();
      obj.add(look);
      this.scene.add(obj);
      e.bodies.push({ body, object3d: obj, part: null });
      e.rider = { body, joint, lastV: null };
    }

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

  // A little flower (spawn({shape: "flower"})). The heavy round plate at its
  // foot and a light stem and bloom keep it landing upright.
  addFlower({ color = 'red', x, y, z, yaw = 0, quat, name, thingId, id, owner, linvel, angvel }) {
    const R = this.R;
    const e = new Entity({ kind: 'flower', name: name ?? `${color} flower`, color, thingId, owner, id });
    const desc = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(quat ?? yawQuat(yaw)).setAngularDamping(0.5);
    if (linvel) desc.setLinvel(linvel.x, linvel.y, linvel.z);
    if (angvel) desc.setAngvel(angvel);
    const body = this.physics.createRigidBody(desc);
    this._attachCollider(R.ColliderDesc.cuboid(0.48, 0.19, 0.48).setTranslation(0, -0.71, 0).setFriction(0.9).setDensity(2.5), body, e, null, 'green');
    this._attachCollider(R.ColliderDesc.cuboid(0.4, 0.62, 0.4).setTranslation(0, 0.28, 0).setFriction(0.6).setDensity(0.05), body, e, null, color);
    const obj = new THREE.Group();
    const m = flowerMesh(color);
    m.traverse((o) => { o.userData.entity = e; });
    obj.add(m);
    this.scene.add(obj);
    e.chassis = body;
    e.bodies.push({ body, object3d: obj, part: null });
    e.recipe = { type: 'flower', opts: { color, name: e.name } };
    this._syncOne(body, obj);
    return this._register(e);
  }

  // A rider lets go of its seat when its model stops or swerves hard in one
  // step (a crash, a hard landing) or tips well over, and pops up a little.
  _checkRiders() {
    for (const e of this.entities.values()) {
      const r = e.rider;
      if (!r?.joint || e.removed) continue;
      const v = e.chassis.linvel();
      const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(e.quaternion).y;
      const jolt = r.lastV ? Math.hypot(v.x - r.lastV.x, v.y - r.lastV.y, v.z - r.lastV.z) : 0;
      r.lastV = { x: v.x, y: v.y, z: v.z };
      if (jolt < RIDER_JOLT && upY > 0.4) continue;
      this.physics.removeImpulseJoint(r.joint, true);
      r.joint = null;
      const rv = r.body.linvel();
      r.body.setLinvel({ x: rv.x, y: rv.y + 5, z: rv.z }, true);
      r.body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }, true);
    }
  }

  // ---- pens ------------------------------------------------------------------
  // Like a Logo turtle: a thing with its pen down leaves a ribbon on the ground
  // under it. Each pen is one growing mesh with a color per vertex; later
  // pieces sit a hair higher so crossings don't flicker.

  pen(key) {
    this.pens ??= new Map();
    let p = this.pens.get(key);
    if (!p) this.pens.set(key, p = { key, down: false, color: 'blue', size: 3, last: null });
    return p;
  }
  penDown(key) { const p = this.pen(key); p.down = true; p.last = null; }
  penUp(key) { const p = this.pen(key); p.down = false; p.last = null; }

  clearDrawing() {
    for (const p of this.pens?.values() ?? []) {
      if (p.mesh) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); }
      p.mesh = null;
      p.last = null;
    }
    this.penLayer = 0;
  }

  _drawPens() {
    for (const p of this.pens?.values() ?? []) {
      if (!p.down) continue;
      const a = this.actor(p.key);
      if (!a.alive) continue;
      const at = a.position;
      at.y = Math.max(0.2, a.bounds().min.y + 0.05); // just above the studs, or whatever it stands on
      if (!p.last) { p.last = at; continue; }
      if (Math.hypot(at.x - p.last.x, at.z - p.last.z) < 0.12) continue;
      this._penSegment(p, p.last, at);
      p.last = at;
    }
  }

  _penSegment(p, a, b) {
    if (!p.mesh) {
      p.cap = 0;
      p.count = 0;
      p.mesh = new THREE.Mesh(new THREE.BufferGeometry(), PEN_MATERIAL);
      p.mesh.frustumCulled = false;
      p.mesh.receiveShadow = true;
      this.scene.add(p.mesh);
    }
    if (p.count === p.cap) { // grow: twice the room, keeping what's drawn
      const cap = Math.max(256, p.cap * 2);
      const grow = (old, n) => { const arr = new old.constructor(n); arr.set(old); return arr; };
      p.pos = p.pos ? grow(p.pos, cap * 12) : new Float32Array(cap * 12);
      p.col = p.col ? grow(p.col, cap * 12) : new Float32Array(cap * 12);
      p.nrm = p.nrm ? grow(p.nrm, cap * 12) : new Float32Array(cap * 12); // all straight up, so the lighting sees the color
      p.idx = p.idx ? grow(p.idx, cap * 6) : new Uint32Array(cap * 6);
      const g = p.mesh.geometry;
      g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(p.col, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(p.nrm, 3));
      g.setIndex(new THREE.BufferAttribute(p.idx, 1));
      p.cap = cap;
    }
    const half = 0.08 + p.size * 0.06;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len; // along the line
    const nx = -uz * half, nz = ux * half; // across it
    const lift = (this.penLayer = (this.penLayer ?? 0) + 1) * 1e-5;
    const ya = a.y + lift, yb = b.y + lift;
    const ax = a.x - ux * half, az = a.z - uz * half, bx = b.x + ux * half, bz = b.z + uz * half; // square ends overlap at corners
    const v = p.count * 12;
    p.pos.set([ax + nx, ya, az + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz], v);
    const c = new THREE.Color(colorHex(p.color));
    for (let i = 0; i < 4; i++) { p.col.set([c.r, c.g, c.b], v + i * 3); p.nrm.set([0, 1, 0], v + i * 3); }
    const base = p.count * 4;
    p.idx.set([base, base + 2, base + 1, base + 1, base + 2, base + 3], p.count * 6);
    p.count++;
    const g = p.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.index.needsUpdate = true;
    g.setDrawRange(0, p.count * 6);
  }

  // ---- explosions ----------------------------------------------------------

  // Burst things into loose bricks flying out from `center`. Props and models
  // become bricks (big blocks split into brick-sized pieces); things that are
  // already loose bricks (a house, a tower) are just flung. The originals are
  // hidden and stop colliding at once, so the pieces don't start inside them;
  // returns whether they need removing (props and models do).
  explode(entities, { center, power = 5 }) {
    const boxes = []; // {size, color, pos, quat} in world space
    const fling = [];
    let replaced = false;
    for (const e of entities) {
      if (e.removed) continue;
      if (e.kind === 'model') this._modelBoxes(e, boxes);
      else if (e.recipe?.type === 'static') this._propBoxes(e, boxes);
      else { fling.push(e); continue; }
      replaced = true;
      for (const { body, object3d } of e.bodies) {
        for (let i = 0; i < body.numColliders(); i++) body.collider(i).setEnabled(false);
        object3d.visible = false;
      }
    }
    const speed = 3 + power * 2.5;
    const kick = (pos) => {
      const d = new THREE.Vector3().subVectors(pos, center);
      d.y = Math.max(d.y, 0) + 1.5; // outward and up, never into the ground
      return d.normalize().multiplyScalar(speed * (0.7 + Math.random() * 0.6));
    };
    const spin = () => ({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 });
    for (const p of splitIntoBricks(boxes)) {
      const v = kick(p.pos);
      this.addBrick({ dims: p.size, color: p.color, x: p.pos.x, y: p.pos.y, z: p.pos.z, quat: p.quat, linvel: v, angvel: spin(), name: `${p.color} brick` });
    }
    for (const e of fling) {
      for (const { body } of e.bodies) {
        if (!body.isDynamic()) continue;
        const t = body.translation();
        body.setLinvel(kick(new THREE.Vector3(t.x, t.y, t.z)), true);
        body.setAngvel(spin(), true);
      }
    }
    return replaced;
  }

  _propBoxes(e, out) {
    const t = e.chassis.translation(), r = e.chassis.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w), at = new THREE.Vector3(t.x, t.y, t.z);
    for (const bx of e.recipe.opts.boxes) {
      const bq = bx.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...bx.rot)) : new THREE.Quaternion();
      out.push({ size: bx.size, color: bx.color, pos: new THREE.Vector3(...bx.at).applyQuaternion(q).add(at), quat: q.clone().multiply(bq) });
    }
  }

  // A model's visible bricks, chassis and parts; wheels become dark blocks.
  // Minifigures are drawn rather than built, so they burst into their
  // collision boxes (which carry the figure's colors).
  _modelBoxes(e, out) {
    const place = (body, list) => {
      const t = body.translation(), r = body.rotation();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w), at = new THREE.Vector3(t.x, t.y, t.z);
      const shown = list.filter((b) => !b.hidden);
      for (const b of shown.length ? shown : list) out.push({ size: b.size, color: b.color, pos: new THREE.Vector3(...b.at).applyQuaternion(q).add(at), quat: q.clone() });
    };
    place(e.chassis, e.def.bricks);
    for (const p of e.parts.values()) {
      if (p.def.kind === 'wheel') {
        const t = p.body.translation(), r = p.body.rotation(), d = p.def.radius * 1.6;
        out.push({ size: [p.def.width, d, d], color: 'black', pos: new THREE.Vector3(t.x, t.y, t.z), quat: new THREE.Quaternion(r.x, r.y, r.z, r.w) });
      } else place(p.body, p.def.bricks);
    }
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
      case 'flower': return this.addFlower({ ...recipe.opts, x, y, z, quat, id, thingId, name: name ?? recipe.opts.name });
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
    this.clearDrawing();
    this.pens?.clear();
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
      // Ease the wheels toward the asked-for speed. Jumping straight to a high
      // speed gives the motors so much torque that the car pops a wheelie and
      // flips; braking toward a stop is allowed to be quicker than speeding up.
      const was = e._wheelDrive ?? 0;
      const braking = Math.abs(c.drive) < Math.abs(was) || Math.sign(c.drive) !== Math.sign(was);
      const step = (braking ? 2 : 1) * WHEEL_ACCEL * dt;
      e._wheelDrive = was + Math.max(-step, Math.min(step, c.drive - was));
      for (const w of wheels) {
        const sideSign = w.def.side === 'left' ? -1 : 1;
        const v = e._wheelDrive + sideSign * omega * track / 2;
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
      // Traction: nudge the chassis's ground velocity toward "forward at the
      // wheels' speed", a little each step. On their own, four grippy wheels
      // get going sluggishly and scrub off most of their speed in a turn; this
      // keeps a toy car rolling where it points. Only while driving, on the
      // ground and upright, and limited, so it can't plow through a tower.
      const lv = e.chassis.linvel();
      const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(e.quaternion).y;
      if ((c.drive || e._wheelDrive) && Math.abs(lv.y) < 2 && upY > 0.7) {
        const f = e.forward();
        const dx = f.x * e._wheelDrive - lv.x, dz = f.z * e._wheelDrive - lv.z;
        const d = Math.hypot(dx, dz), most = TRACTION * dt;
        const k = d > most ? most / d : 1;
        e.chassis.setLinvel({ x: lv.x + dx * k, y: lv.y, z: lv.z + dz * k }, true);
      }
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
    this._checkRiders();
    this.sync();
    this._drawPens();
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
    if (e.rider) { // back in the seat, buckled in again
      const r = e.rider;
      const at = new THREE.Vector3(...e.def.rider.at);
      r.body.setTranslation(at.clone().applyQuaternion(q).add(base), true);
      r.body.setRotation(q, true);
      r.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      r.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (!r.joint) {
        r.joint = this.physics.createImpulseJoint(this.R.JointData.fixed(at, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }), e.chassis, r.body, true);
        r.joint.setContactsEnabled(false);
      }
      r.lastV = null;
    }
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

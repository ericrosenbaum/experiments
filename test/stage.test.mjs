// The Stage and actors, headless: every world loads with working pre-taught
// behaviors, assemblies move as one, clone/remove/reset keep the right
// things, drags survive Reset, and the castle catapult can reach the castle.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeWorld, run, LIBRARY_BY_ID } from './physics.harness.mjs';
import { Stage } from '../src/stage.js';
import { WORLDS } from '../src/world/worlds.js';
import { PRIMITIVES } from '../src/behavior/primitives.js';
import { overlappingColliders } from './overlap.mjs';

const API = [...new Set(PRIMITIVES.map(([sig]) => sig.replace(/^await /, '').match(/^(\w+)/)[1]))];
const AsyncFunction = (async () => {}).constructor;

const w = await makeWorld();
const started = [];
const runtime = { // no Workers in node: record what would run
  contacts: new Map(),
  start(actor, b, opts) { started.push({ actor, b, opts }); },
  stopAll() {},
};
const view = {
  scene: w.scene, hemi: new THREE.HemisphereLight(), sun: new THREE.DirectionalLight(),
  camera: new THREE.PerspectiveCamera(), controls: { target: new THREE.Vector3(), update() {} },
};
const logs = [];
const stage = new Stage({ world: w, runtime, ui: { log: (m) => logs.push(m) }, view });

// Every world loads, its pre-taught behaviors parse and only use primitives.
for (const preset of WORLDS) {
  started.length = 0;
  stage.load(preset.id);
  assert.ok(w.actor(preset.select).alive, `${preset.id}: the thing selected at start should exist`);
  assert.equal(w.gravityScale, preset.gravity ?? 1, `${preset.id}: gravity`);
  for (const [key, list] of stage.state.behaviors) {
    assert.ok(w.actor(key).alive, `${preset.id}: behaviors for "${key}", which doesn't exist`);
    for (const b of list) {
      assert.doesNotThrow(() => new AsyncFunction(...API, b.code), `${preset.id}/${key}: ${b.text}\n${b.code}`);
      assert.ok(b.summary.length, `${preset.id}/${key}: "${b.text}" should have a read-back`);
      assert.ok(!b.notes, `${preset.id}/${key}: "${b.text}" had notes: ${b.notes}`);
    }
  }
  const n = [...stage.state.behaviors.values()].flat().length;
  assert.equal(started.length, n, `${preset.id}: every behavior should start`);
  console.log(`ok: ${preset.name} loads with ${n} working pre-taught behaviors`);
}

// An assembly drives as one block, and turning swings it around the middle.
stage.load('playground');
{
  const house = w.actor('house-1');
  assert.equal(house.kind, 'thing');
  const before = house.members.map((e) => e.position);
  const c0 = house.position;
  house.control.drive = 6;
  run(w, 1.5);
  house.control.drive = 0;
  run(w, 0.5);
  const moved = house.members.map((e, i) => e.position.z - before[i].z);
  const spread = Math.max(...moved) - Math.min(...moved);
  assert.ok(Math.min(...moved) > 5, `every brick should come along (least moved ${Math.min(...moved).toFixed(2)})`);
  assert.ok(spread < 1.5, `the house should stay together (spread ${spread.toFixed(2)})`);
  house.control.steer = 60;
  run(w, 1);
  house.control.steer = 0;
  run(w, 0.3);
  assert.ok(house.heading() > 40, `the house should turn left (heading ${house.heading().toFixed(0)})`);
  console.log(`ok: a house drives ${(house.position.z - c0.z).toFixed(1)} studs as one block and turns ${house.heading().toFixed(0)}°`);

  // a prop (kinematic) slides and turns too
  const tree = w.actor('tree-1');
  const t0 = tree.position;
  tree.control.drive = 5;
  run(w, 1);
  tree.control.drive = 0;
  assert.ok(tree.position.distanceTo(t0) > 4, 'a tree should drive');
  console.log('ok: a tree slides when told to drive');
}

// A single brick picked out of an assembly is its own actor.
{
  const piece = w.actor('tower.5');
  assert.equal(piece.kind, 'piece');
  assert.equal(piece.members.length, 1);
  assert.ok(w.actor('tower').has(piece.members[0]), 'the piece is still part of the tower');
  console.log('ok: one brick of the tower can be taught on its own');
}

// clone: a copy lands clear of the original and brings the behaviors along.
stage.load('playground');
{
  const car = w.actor('racecar');
  started.length = 0;
  const copy = stage.cloneActor(car, null);
  assert.ok(copy?.alive && copy.kind === 'model', 'the copy is a model');
  assert.equal(copy.model.def.id, 'racecar');
  assert.equal(stage.state.behaviors.get(copy.key).length, stage.state.behaviors.get('racecar').length, 'behaviors come along');
  assert.ok(started.every((s) => s.actor === copy && s.opts?.isClone), 'the copy runs them as a clone');
  assert.ok(copy.position.distanceTo(car.position) > 4, 'the copy is beside the original');
  const house = w.actor('house-2');
  const hcopy = stage.cloneActor(house, { __ref: 'place', x: 0, z: 30 });
  assert.equal(hcopy.members.length, house.members.length, 'every brick is copied');
  assert.ok(Math.hypot(hcopy.position.x, hcopy.position.z - 30) < 6, 'the house copy goes where it was asked');
  const above = stage.cloneActor(w.actor('ball'), 'above');
  assert.ok(above.position.y > w.actor('ball').position.y + 1.5, 'clone "above" stacks it on top');
  assert.deepEqual(overlappingColliders(w).map(([a, b, d]) => `${a.entity.id} x ${b.entity.id} by ${d.toFixed(2)}`), [], 'copies never start inside anything');
  console.log('ok: clone copies models, houses and balls with their behaviors, beside, at a place, or above');

  // removing a copy forgets it; removing an original is undone by Reset
  stage.removeActor(copy);
  assert.ok(!copy.alive && !stage.state.behaviors.has(copy.key));
  stage.removeActor(w.actor('tree-2'));
  assert.ok(!w.actor('tree-2').alive);
  stage.reset();
  assert.ok(w.actor('tree-2').alive, 'Reset brings back things a program removed');
  assert.ok(!hcopy.alive && !above.alive, 'Reset clears copies');
  stage.removeActor(w.actor('tree-3'), { forever: true });
  stage.reset();
  assert.ok(!w.actor('tree-3').alive, 'the 🗑 button removes it for good');
  console.log('ok: remove() and Reset handle copies, originals and deleted things');

  // the copy limit
  let made = 0;
  for (let i = 0; i < 60; i++) if (stage.cloneActor(w.actor('brick-1'), { __ref: 'place', x: (i % 8) * 4 - 16, z: -40 + Math.floor(i / 8) * 4 })) made++;
  assert.equal(made, 40, 'at most 40 copies');
  assert.ok(logs.some((m) => /40 copies/.test(m)), 'and the kid is told why');
  console.log('ok: copies stop at 40');
}

// Moving something sticks through Reset.
stage.load('farm');
{
  const t = w.actor('tractor');
  const pivot = t.position;
  w.transform(t.members, { delta: new THREE.Vector3(5, 0, 0), dyaw: 90, pivot });
  stage.recordMove('tractor', new THREE.Vector3(5, 0, 0), 90, pivot);
  const hay = w.actor('hay');
  const hp = hay.position;
  w.transform(hay.members, { delta: new THREE.Vector3(0, 0, -6), pivot: hp });
  stage.recordMove('hay', new THREE.Vector3(0, 0, -6), 0, hp);
  stage.reset();
  assert.ok(Math.abs(w.actor('tractor').position.x - (pivot.x + 5)) < 0.2, 'the tractor stays where it was dragged');
  assert.ok(Math.abs(w.actor('tractor').heading() - 90) < 2, 'and keeps facing the way it was turned');
  assert.ok(Math.abs(w.actor('hay').position.z - (hp.z - 6)) < 0.2, 'the hay too');
  console.log('ok: drags and turns survive Reset');
}

// Switching worlds keeps each world's own state.
{
  stage.load('playground');
  const added = stage.addModel('dragon', { x: 0, z: -20 });
  stage.load('space');
  assert.ok(!added.alive);
  stage.load('playground');
  assert.ok(added.alive, 'coming back to a world finds the dragon that was added');
  console.log('ok: each world remembers what was added to it');
}

// No gravity in space: asteroids float in place, and so do ships.
stage.load('space');
{
  const rock = w.actor('asteroid-1');
  const y0 = rock.position.y;
  const ship = w.actor('spaceship');
  const s0 = ship.position.y;
  run(w, 3);
  assert.ok(Math.abs(rock.position.y - y0) < 0.5, `an asteroid should float (moved ${(rock.position.y - y0).toFixed(2)})`);
  assert.ok(Math.abs(ship.position.y - s0) < 0.5, 'the spaceship should stay put');
  ship.control.rise = 6;
  run(w, 1);
  ship.control.rise = 0;
  const up = ship.position.y - s0;
  run(w, 1);
  assert.ok(up > 3, `rise() should fly it up (${up.toFixed(1)})`);
  assert.ok(Math.abs(ship.position.y - s0 - up) < 1.5, 'and it hovers when it stops rising');
  w.setGravity(1);
  run(w, 2);
  assert.ok(rock.position.y < y0 - 2, 'with gravity back on, asteroids fall');
  console.log(`ok: zero gravity floats asteroids, rise() flies the ship up ${up.toFixed(1)} studs and it hovers`);
}

// The castle catapult, as placed, can hit the castle.
stage.load('castle');
{
  const cat = w.actor('catapult').model;
  run(w, 0.5);
  const castle = w.actor('castle');
  const before = new Map(castle.members.map((e) => [e, e.position]));
  for (let shot = 0; shot < 3; shot++) {
    const arm = cat.parts.get('throwing arm');
    const bucket = arm.def.bricks.find((b) => b.bucket);
    const r = arm.body.rotation(), t = arm.body.translation();
    const pos = new THREE.Vector3(...bucket.at).add(new THREE.Vector3(0, 1.2, 0)).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
    w.addBrick({ size: '2x2', color: 'red', x: pos.x, y: pos.y, z: pos.z, yaw: cat.heading() });
    run(w, 1);
    arm.angle = 130;
    run(w, 2.5);
    arm.angle = 0;
    run(w, 1);
  }
  const moved = [...before].filter(([e, p]) => !e.removed && e.position.distanceTo(p) > 0.5).length;
  assert.ok(moved >= 2, `three throws should knock some of the castle loose (moved ${moved})`);
  console.log(`ok: the catapult knocked ${moved} castle bricks loose in 3 throws`);
}

// Minigolf: aimed at the cup, a well-charged putt sinks the ball on hole 1,
// the cup feels it drop in, and no putt gets out over the walls.
stage.load('minigolf');
{
  const ball = w.actor('golfball');
  let cupTouched = false;
  w.onCollision = (a, b, started) => { if (started && [a, b].some((x) => x.entity.thingId === 'cup-1') && [a, b].some((x) => x.entity.thingId === 'golfball')) cupTouched = true; };
  run(w, 0.3);
  ball.yaw = 0; // the cup is straight ahead (+z)
  ball.kick({ x: 0, y: 0, z: 6 * 2.5 }); // push("forward", 6)
  run(w, 6);
  const p = ball.position;
  assert.ok(p.y < 1 && Math.hypot(p.x - 16, p.z - 9) < 1.2, `the putt should end in cup 1 (ball at ${p.toArray().map((v) => v.toFixed(1))})`);
  assert.ok(cupTouched, 'cup 1 feels the ball drop in');
  for (const yaw of [30, -60, 150]) { // full-power putts in odd directions stay on the course
    stage.reset();
    const b2 = w.actor('golfball');
    b2.yaw = yaw;
    const f = b2.forward();
    b2.kick({ x: f.x * 25, y: 0, z: f.z * 25 });
    run(w, 6);
    const q = b2.position;
    assert.ok(Math.abs(q.x - 16) < 3 && Math.abs(q.z) < 13, `a hard putt at ${yaw}° should stay on hole 1 (ball at ${q.toArray().map((v) => v.toFixed(1))})`);
  }
  w.onCollision = null;
  console.log('ok: a charged putt sinks hole 1 and the cup feels it; hard putts stay inside the walls');
}

console.log('stage: all checks passed');

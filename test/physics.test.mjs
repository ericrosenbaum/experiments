// Physics checks on the real world + model library (no renderer).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeWorld, run, LIBRARY_BY_ID } from './physics.harness.mjs';
import { WORLDS_BY_ID } from '../src/world/worlds.js';

const w = await makeWorld();
WORLDS_BY_ID.playground.build(w);
const bricks = () => [...w.entities.values()].filter((e) => e.kind === 'tower' || e.kind === 'house');
const snap = new Map(bricks().map((e) => [e, e.position]));
run(w, 4);
const settled = bricks().filter((e) => e.position.distanceTo(snap.get(e)) > 0.05);
assert.equal(settled.length, 0, `${settled.length} tower/house bricks moved on their own`);
console.log(`ok: ${snap.size} tower/house bricks stay put`);

// Every model sits upright on the ground and drives forward + turns left.
for (const id of Object.keys(LIBRARY_BY_ID)) {
  const e = w.addModel(LIBRARY_BY_ID[id], { x: 0, z: -30, yaw: 0 });
  run(w, 1);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(e.quaternion).y;
  assert.ok(up > 0.98, `${id} should stand upright (up.y=${up})`);
  const p0 = e.position;
  e.control.drive = 7;
  run(w, 2);
  const dz = e.position.z - p0.z;
  assert.ok(dz > 8, `${id} should drive forward (+z), moved ${dz.toFixed(2)}`);
  e.control.drive = 0;
  e.control.steer = 90;
  const h0 = e.heading();
  run(w, 1);
  const turned = e.heading() - h0;
  assert.ok(turned > 45, `${id} should turn left with positive steer, turned ${turned.toFixed(1)}`);
  e.control.steer = 0;
  // hinges follow their target angle
  for (const p of e.parts.values()) {
    if (p.def.kind !== 'hinge') continue;
    const target = Math.min(p.def.limits[1], 60);
    p.angle = target;
    run(w, 1);
    const rel = new THREE.Quaternion().copy(e.quaternion).invert().multiply(new THREE.Quaternion().copy(p.body.rotation()));
    const axis = new THREE.Vector3(...p.def.axis);
    const got = 2 * Math.atan2(new THREE.Vector3(rel.x, rel.y, rel.z).dot(axis), rel.w) * 180 / Math.PI * (p.def.sign ?? 1);
    assert.ok(Math.abs(got - target) < 12, `${id} ${p.def.name} should reach ${target}°, got ${got.toFixed(1)}°`);
    p.angle = 0;
  }
  console.log(`ok: ${id} upright, drives ${dz.toFixed(1)} studs in 2s, turns ${turned.toFixed(0)}°/s, hinges track`);
  w.remove(e);
}

// The race car knocks bricks off the rainbow tower.
{
  const car = w.addModel(LIBRARY_BY_ID.racecar, { x: 14, z: -4, yaw: 0 }); // tower is at (14, 12)
  const before = new Map(bricks().filter((e) => e.kind === 'tower').map((e) => [e, e.position]));
  car.control.drive = 14;
  run(w, 3);
  car.control.drive = 0;
  run(w, 2);
  const moved = [...before].filter(([e, p]) => e.position.distanceTo(p) > 1).length;
  assert.ok(moved >= 4, `driving into the tower should topple it (moved ${moved})`);
  console.log(`ok: car toppled ${moved}/${before.size} tower bricks`);
  w.remove(car);
}

// The catapult throws a brick from its bucket.
{
  const cat = w.addModel(LIBRARY_BY_ID.catapult, { x: -40, z: 30, yaw: 0 });
  run(w, 1);
  const arm = cat.parts.get('throwing arm');
  const bucket = arm.def.bricks.find((b) => b.bucket);
  const r = arm.body.rotation(), t = arm.body.translation();
  const pos = new THREE.Vector3(...bucket.at).add(new THREE.Vector3(0, 1.2, 0)).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
  const brick = w.addBrick({ size: '2x2', color: 'red', x: pos.x, y: pos.y, z: pos.z });
  run(w, 1);
  const start = brick.position;
  assert.ok(start.distanceTo(pos) < 1.5, 'brick should rest in the bucket');
  arm.angle = 130;
  run(w, 3);
  const flew = brick.position.z - start.z;
  assert.ok(flew > 6, `catapult should fling the brick forward, went ${flew.toFixed(1)}`);
  console.log(`ok: catapult flung a brick ${flew.toFixed(1)} studs forward`);
}

// goTo's path planning: around a wall, straight when clear, nothing when walled in
{
  const { planPath } = await import('../src/behavior/pathfind.js');
  const THREE = await import('three');
  const pw = await makeWorld();
  pw.addStatic({ kind: 'wall', name: 'Wall', color: 'gray', x: 0, z: 0, thingId: 'wall', boxes: [{ at: [0, 1.5, 0], size: [20, 3, 1], color: 'gray' }] });
  const opts = { radius: 1.5, bottom: 0, top: 3, ignore: () => false };
  const around = planPath(pw, new THREE.Vector3(0, 0, -8), new THREE.Vector3(0, 0, 8), opts);
  assert.ok(around && around.length > 1, 'a wall in the way gives a path with turns');
  assert.ok(around.slice(0, -1).every((p) => Math.abs(p.x) > 10), `the path goes around the ends of the wall: ${around.map((p) => `(${p.x.toFixed(0)},${p.z.toFixed(0)})`).join(' ')}`);
  assert.equal(planPath(pw, new THREE.Vector3(30, 0, -8), new THREE.Vector3(30, 0, 8), opts).length, 1, 'open ground: straight there');
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; pw.addStatic({ kind: 'wall', name: 'Ring', color: 'red', x: -40 + Math.cos(a) * 6, z: Math.sin(a) * 6, thingId: `ring-${k}`, boxes: [{ at: [0, 1.5, 0], size: [3, 3, 3], color: 'red' }] }); }
  assert.equal(planPath(pw, new THREE.Vector3(-60, 0, 0), new THREE.Vector3(-40, 0, 0), opts), null, 'a walled-in goal has no path');
  console.log('ok: goTo plans around a wall, goes straight when clear, and knows when there is no way');
}
console.log('physics: all checks passed');

// How well does a catapult at (x, z) hit the castle-world castle?
// usage: node tools/castle-probe.mjs [catapultX catapultZ throws]
import * as THREE from 'three';
import { makeWorld, run, LIBRARY_BY_ID } from '../test/physics.harness.mjs';
import { WORLDS_BY_ID } from '../src/world/worlds.js';

const [x0, z0, throws] = [Number(process.argv[2] ?? -3), Number(process.argv[3] ?? 14), Number(process.argv[4] ?? 3)];
const w = await makeWorld();
WORLDS_BY_ID.castle.build(w);
const cat = w.addModel(LIBRARY_BY_ID.catapult, { x: x0, z: z0 });
run(w, 0.5);
const before = new Map([...w.byThing.get('castle')].map((e) => [e, e.position]));
const arm = cat.parts.get('throwing arm');
const bucket = arm.def.bricks.find((b) => b.bucket);
for (let shot = 0; shot < throws; shot++) {
  const r = arm.body.rotation(), t = arm.body.translation();
  const pos = new THREE.Vector3(...bucket.at).add(new THREE.Vector3(0, 1.2, 0)).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
  const brick = w.addBrick({ size: '2x2', color: 'red', x: pos.x, y: pos.y, z: pos.z });
  run(w, 1);
  arm.angle = 130;
  let maxY = 0, hitAt = null;
  for (let i = 0; i < 150; i++) {
    const v0 = brick.chassis.linvel().z;
    run(w, 1 / 60);
    const p = brick.position;
    maxY = Math.max(maxY, p.y);
    if (!hitAt && v0 > 3 && brick.chassis.linvel().z < v0 - 3) hitAt = p;
  }
  arm.angle = 0;
  run(w, 1);
  const moved = [...before].filter(([e, p]) => e.removed || e.position.distanceTo(p) > 0.5).length;
  console.log(`throw ${shot + 1}: apex ${maxY.toFixed(1)}, hit at ${hitAt ? hitAt.toArray().map((v) => v.toFixed(1)).join(', ') : 'nothing'}, castle bricks moved so far: ${moved}`);
}

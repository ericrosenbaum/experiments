// Trace a catapult throw: arm angle, brick position, chassis tilt.
import * as THREE from 'three';
import { makeWorld, run, LIBRARY_BY_ID } from '../test/physics.harness.mjs';
const w = await makeWorld();
const cat = w.addModel(LIBRARY_BY_ID.catapult, { x: 0, z: 0 });
run(w, 1);
const arm = cat.parts.get('throwing arm');
const bucket = arm.def.bricks.find((b) => b.bucket);
const r = arm.body.rotation(), t = arm.body.translation();
const pos = new THREE.Vector3(...bucket.at).add(new THREE.Vector3(0, 1.2, 0)).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
const brick = w.addBrick({ size: '2x2', color: 'red', x: pos.x, y: pos.y, z: pos.z });
run(w, 1);
arm.angle = 130;
for (let i = 0; i < 24; i++) {
  run(w, 0.1);
  const q = new THREE.Quaternion().copy(arm.body.rotation());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const ang = Math.atan2(fwd.y, -fwd.z) * 180 / Math.PI;
  const b = brick.position, c = cat.position;
  console.log((i + 1) / 10, 'arm', ang.toFixed(0), 'brick', b.x.toFixed(1), b.y.toFixed(1), b.z.toFixed(1), 'cat', c.y.toFixed(2), c.z.toFixed(2));
}

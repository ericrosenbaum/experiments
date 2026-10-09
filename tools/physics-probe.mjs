import * as THREE from 'three';
import { makeWorld, run, LIBRARY_BY_ID } from '../test/physics.harness.mjs';
const w = await makeWorld();
const f = (v) => v.toFixed(2);
for (const id of ['racecar', 'digger', 'catapult', 'robot', 'dino']) {
  const e = w.addModel(LIBRARY_BY_ID[id], { x: 0, z: 0 });
  run(w, 1);
  const p0 = e.position;
  e.control.drive = 7;
  run(w, 2);
  const p1 = e.position;
  e.control.drive = 0; e.control.steer = 90;
  const h0 = e.heading();
  run(w, 1);
  const h1 = e.heading();
  e.control.steer = 0;
  run(w, 1);
  const p2 = e.position;
  console.log(id, 'settled y', f(p0.y), 'drive 2s dz', f(p1.z - p0.z), 'dx', f(p1.x - p0.x), 'turn 1s @90:', f(h1 - h0), 'stopped drift', f(p2.distanceTo(p1)), 'up.y', f(new THREE.Vector3(0,1,0).applyQuaternion(e.quaternion).y));
  w.remove(e);
}

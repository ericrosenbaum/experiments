// Geometry checks: nothing in the starting world interpenetrates, and no
// model has two boxes with overlapping coplanar faces (which z-fight, i.e.
// flicker, when rendered).
import assert from 'node:assert/strict';
import { makeWorld, LIBRARY_BY_ID } from './physics.harness.mjs';
import { buildWorld } from '../src/world/worldmap.js';
import { overlappingColliders } from './overlap.mjs';

const EPS = 1e-3;

// Boxes of a model at rest, in model space.
function modelBoxes(def) {
  const boxes = def.bricks.map((br) => ({ name: `${br.color} brick`, c: br.at, h: br.size.map((s) => s / 2) }));
  for (const p of def.parts) {
    for (const br of p.bricks ?? []) boxes.push({ name: `${p.name} ${br.color} brick`, c: br.at.map((v, k) => v + p.pivot[k]), h: br.size.map((s) => s / 2) });
  }
  return boxes;
}

// Faces of a and b that share a plane and a normal and overlap in area.
function coplanarFaces(a, b) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    for (const s of [-1, 1]) {
      if (Math.abs(a.c[k] + s * a.h[k] - (b.c[k] + s * b.h[k])) > EPS) continue;
      const overlap = [0, 1, 2].filter((j) => j !== k).every((j) =>
        Math.min(a.c[j] + a.h[j], b.c[j] + b.h[j]) - Math.max(a.c[j] - a.h[j], b.c[j] - b.h[j]) > EPS);
      if (overlap) out.push(`${s > 0 ? '+' : '-'}${'xyz'[k]}`);
    }
  }
  return out;
}

const fights = [];
for (const def of Object.values(LIBRARY_BY_ID)) {
  const boxes = modelBoxes(def);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      for (const f of coplanarFaces(boxes[i], boxes[j])) fights.push(`${def.id}: ${boxes[i].name} / ${boxes[j].name} on ${f}`);
    }
  }
}
assert.deepEqual(fights, [], `coplanar faces that will flicker:\n  ${fights.join('\n  ')}`);
console.log('ok: no model has coplanar overlapping faces');

const w = await makeWorld();
buildWorld(w);
const start = [['racecar', 0, 0, 0], ['robot', -8, -4, 20], ['catapult', 9, -3, 25]];
for (const [id, x, z, yaw] of start) {
  const def = LIBRARY_BY_ID[id];
  w.addModel(def, w.findClearSpot(def, { x, z, yaw }));
}
// Dropping a model right on top of a house finds clear ground nearby.
w.addModel(LIBRARY_BY_ID.digger, w.findClearSpot(LIBRARY_BY_ID.digger, { x: -20, z: -14 }));
const overlaps = overlappingColliders(w).map(([a, b, d]) => `${a.entity.name} (${a.part ?? a.color}) / ${b.entity.name} (${b.part ?? b.color}): ${d.toFixed(2)}`);
assert.deepEqual(overlaps, [], `things start out overlapping:\n  ${overlaps.join('\n  ')}`);
console.log('ok: nothing in the starting world overlaps');

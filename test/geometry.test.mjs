// Geometry checks: nothing in the starting world interpenetrates, and no
// model has two boxes with overlapping coplanar faces (which z-fight, i.e.
// flicker, when rendered).
import assert from 'node:assert/strict';
import { makeWorld, LIBRARY_BY_ID } from './physics.harness.mjs';
import { modelBottom } from '../src/world/library.js';
import { WORLDS } from '../src/world/worlds.js';
import { overlappingColliders } from './overlap.mjs';

const EPS = 1e-3;

// The faces of a piece that really are flat sides of its box. Round pieces
// are flat only at their ends; a hull underneath, along its straight sides
// and at the stern; a ladder or a turned piece doesn't fill its box's faces.
function flatFaces(br) {
  const all = ['-x', '+x', '-y', '+y', '-z', '+z'];
  if (br.rot) return [];
  switch (br.shape) {
    case 'round': case 'bar': case 'container': return all.filter((f) => f[1] === (br.axis ?? 'y'));
    case 'hull': return ['-y', '-x', '+x', '-z'];
    case 'ladder': return [];
    default: return all;
  }
}

// Boxes of a model at rest, in model space.
function modelBoxes(def) {
  const box = (br, name, c) => ({ name, c, h: br.size.map((s) => s / 2), faces: flatFaces(br) });
  const boxes = def.bricks.filter((br) => !br.hidden).map((br) => box(br, `${br.color} ${br.shape ?? 'brick'}`, br.at));
  for (const p of def.parts) {
    for (const br of (p.bricks ?? []).filter((x) => !x.hidden)) boxes.push(box(br, `${p.name} ${br.color} ${br.shape ?? 'brick'}`, br.at.map((v, k) => v + p.pivot[k])));
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
      const face = `${s > 0 ? '+' : '-'}${'xyz'[k]}`;
      if (overlap && a.faces.includes(face) && b.faces.includes(face)) out.push(face);
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

// Every premade world starts with nothing inside anything else.
const w = await makeWorld();
for (const preset of WORLDS) {
  w.clear();
  preset.build(w);
  for (const m of preset.models) {
    const def = LIBRARY_BY_ID[m.def];
    w.addModel(def, { x: m.x, z: m.z, yaw: m.yaw ?? 0, y: m.lift ? -modelBottom(def) + 0.05 + m.lift : undefined, id: m.id });
  }
  const overlaps = overlappingColliders(w).map(([a, b, d]) => `${a.entity.name} (${a.part ?? a.color}) / ${b.entity.name} (${b.part ?? b.color}): ${d.toFixed(2)}`);
  assert.deepEqual(overlaps, [], `${preset.id}: things start out overlapping:\n  ${overlaps.join('\n  ')}`);
  console.log(`ok: nothing in the ${preset.name} world overlaps (${w.entities.size} entities)`);
}
// Dropping a model right on top of a house finds clear ground nearby.
w.clear();
WORLDS[0].build(w);
w.addModel(LIBRARY_BY_ID.digger, w.findClearSpot(LIBRARY_BY_ID.digger, { x: -20, z: -14 }));
assert.deepEqual(overlappingColliders(w), [], 'a new model should land clear of the house');
console.log('ok: new models land clear of what is there');

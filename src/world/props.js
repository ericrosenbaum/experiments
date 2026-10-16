// Builders for the things the premade worlds are made of. Loose-brick
// builds (houses, towers, the castle, hay) are dynamic bricks that start out
// asleep, so they stand until something knocks them over. Everything else is
// a prop: it doesn't fall over, but a program can still drive it around.
// Every builder takes a stable id, so taught behaviors and layout changes
// find the same thing again after the world is rebuilt.
import { BRICK_H as B, PLATE_H as P } from './bricks.js';

export const RAINBOW = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const box = (x, y, z, w, h, d, color, extra = {}) => ({ at: [x, y, z], size: [w, h, d], color, ...extra });
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// loose: built from loose bricks, asleep until something knocks it apart (a
// trunk of stacked bricks under three layers of leaves), instead of a prop.
export function tree(world, id, x, z, { scale = 1, name, leaf = 'green', top = 'lime', loose = false } = {}) {
  const h = 4 * B * scale;
  name ??= `Tree ${id.replace(/\D+/g, '')}`;
  if (loose) {
    const n = Math.max(2, Math.round(h / B)), t = h / n; // trunk pieces about a brick tall
    const add = (y, w, hh, d, color) => world.addBrick({ dims: [w, hh, d], color, x, y, z, kind: 'tree', name, thingId: id, sleeping: true });
    for (let i = 0; i < n; i++) add(t * (i + 0.5), 2, t, 2, 'brown');
    add(h + B / 2, 6, B, 6, leaf);
    add(h + B * 1.5, 4, B, 4, leaf);
    add(h + B * 2.5, 2, B, 2, top);
    return;
  }
  world.addStatic({
    kind: 'tree', name: name ?? `Tree ${id.replace(/\D+/g, '')}`, color: leaf, x, z, thingId: id,
    boxes: [
      box(0, h / 2, 0, 2, h, 2, 'brown'),
      box(0, h + 0.6, 0, 6, B, 6, leaf),
      box(0, h + 1.8, 0, 4, B, 4, leaf),
      box(0, h + 3.0, 0, 2, B, 2, top),
    ],
  });
}

// A house of loose bricks (asleep until something bumps it).
export function house(world, id, cx, cz, wallColor, roofColor, { name, y = 0 } = {}) {
  name ??= `${cap(roofColor)}-Roof House`;
  const rows = 4;
  const add = (x, yy, z, w, d, color = wallColor, h = B) =>
    world.addBrick({ dims: [w, h, d], color, x: cx + x, y: y + yy, z: cz + z, kind: 'house', name, thingId: id, sleeping: true });
  // Lay segment lengths (in studs) along a wall, alternating the joint pattern.
  const segs = (len, odd) => (len === 8 ? (odd ? [2, 4, 2] : [4, 4]) : (odd ? [2, 4] : [4, 2]));
  for (let r = 0; r < rows; r++) {
    const yy = B / 2 + r * B;
    const odd = r % 2 === 1;
    // front (+z) and back (-z) walls span x; side walls span z
    const fbLen = odd ? 6 : 8, sLen = odd ? 8 : 6;
    for (const side of [1, -1]) {
      let x = -fbLen / 2;
      for (const L of segs(fbLen, odd)) {
        const mid = x + L / 2;
        const inDoor = side === 1 && r < 2 && Math.abs(mid) < 1.5;
        if (!inDoor) add(mid, yy, side * 3.5, L, 1, r === rows - 1 ? 'white' : wallColor);
        x += L;
      }
      let z = -sLen / 2;
      for (const L of segs(sLen, !odd)) {
        add(side * 3.5, yy, z + L / 2, 1, L, r === 1 && Math.abs(z + L / 2) < 1.5 ? 'cyan' : wallColor);
        z += L;
      }
    }
  }
  const top = rows * B;
  add(0, top + P / 2, 0, 9, 9, roofColor, P);
  add(0, top + P + B / 2, 0, 6, 6, roofColor);
  add(0, top + P + B * 1.5, 0, 3, 3, roofColor);
}

// Two bricks per layer, crossing each layer.
export function tower(world, id, cx, cz, { layers = 12, colors = RAINBOW, name = 'Rainbow Tower', kind = 'tower' } = {}) {
  for (let i = 0; i < layers; i++) {
    const y = B / 2 + i * B;
    const color = colors[i % colors.length];
    const along = i % 2 === 0;
    for (const off of [-1, 1]) {
      world.addBrick({
        size: '2x4', color, kind, name, thingId: id, sleeping: true,
        x: cx + (along ? off : 0), y, z: cz + (along ? 0 : off), yaw: along ? 0 : 90,
      });
    }
  }
}

export function ramp(world, id, x, z, { yaw = 0 } = {}) {
  world.addStatic({
    kind: 'ramp', name: 'Ramp', color: 'gray', x, z, yaw, thingId: id,
    boxes: [
      box(0, 1.15, 0, 8, 0.4, 10, 'gray', { rot: [0.24, 0, 0], studs: false }), // high end on the support (-z)
      box(0, 1.25, -5.7, 8, 2.5, 1.6, 'darkgray', { studs: false }),
    ],
  });
}

// Terraces of a hill; returns the height of the top.
export function hill(world, id, x, z, tiers = [[26, 26], [20, 20]], colors = ['green', 'lime']) {
  world.addStatic({
    kind: 'hill', name: 'Hill', color: colors[0], x, z, thingId: id,
    boxes: tiers.map(([w, d], i) => box(0, B / 2 + i * B, 0, w, B, d, colors[i % colors.length], { studs: false })),
  });
  return tiers.length * B;
}

// A castle of loose bricks: four walls with a gate in the front (-z), a tower
// on each corner, battlements, and a flag.
export function castle(world, id, cx, cz, { y = 0, wall = 'gray', trim = 'darkgray', flag = 'red' } = {}) {
  const name = 'Castle';
  const add = (x, yy, z, w, h, d, color) =>
    world.addBrick({ dims: [w, h, d], color, x: cx + x, y: y + yy, z: cz + z, kind: 'castle', name, thingId: id, sleeping: true });
  const half = 6, tw = 3, inner = half - tw / 2; // walls between towers run from -4.5 to 4.5
  const lay = (spans, fixed, alongX, yy, color) => {
    for (const [a, b] of spans) {
      const mid = (a + b) / 2, len = b - a;
      if (alongX) add(mid, yy, fixed, len, B, 1, color); else add(fixed, yy, mid, 1, B, len, color);
    }
  };
  const halves = [[-inner, 0], [0, inner]];
  const thirds = [[-inner, -1.5], [-1.5, 1.5], [1.5, inner]];
  for (let r = 0; r < 3; r++) {
    const yy = B / 2 + r * B;
    // front wall: a gate in the bottom two rows, then a long lintel over it
    lay(r < 2 ? [[-inner, -1.5], [1.5, inner]] : [[-inner, -2.5], [-2.5, 2.5], [2.5, inner]], -half, true, yy, wall);
    lay(r % 2 ? thirds : halves, half, true, yy, wall);
    lay(r % 2 ? halves : thirds, -half, false, yy, wall);
    lay(r % 2 ? halves : thirds, half, false, yy, wall);
  }
  // battlements
  for (const p of [-4, -2, 0, 2, 4]) {
    add(p, 3.5 * B, -half, 1, B, 1, trim);
    add(p, 3.5 * B, half, 1, B, 1, trim);
    add(-half, 3.5 * B, p, 1, B, 1, trim);
    add(half, 3.5 * B, p, 1, B, 1, trim);
  }
  // corner towers
  for (const tx of [-half, half]) {
    for (const tz of [-half, half]) {
      for (let l = 0; l < 5; l++) add(tx, B / 2 + l * B, tz, tw, B, tw, wall);
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) add(tx + dx, 5.5 * B, tz + dz, 1, B, 1, trim);
    }
  }
  // a flag on the back-left tower
  add(half, 5 * B + 1.5, half, 0.3, 3, 0.3, 'brown');
  add(half, 5 * B + 2.4, half - 0.95, 0.1, 1.2, 1.6, flag);
}

export function well(world, id, x, z) {
  world.addStatic({
    kind: 'well', name: 'Well', color: 'gray', x, z, thingId: id,
    boxes: [
      box(1.25, B / 2, 0, 0.5, B, 3, 'gray', { studs: false }),
      box(-1.25, B / 2, 0, 0.5, B, 3, 'gray', { studs: false }),
      box(0, B / 2, 1.25, 2, B, 0.5, 'gray', { studs: false }),
      box(0, B / 2, -1.25, 2, B, 0.5, 'gray', { studs: false }),
      box(0, 0.3, 0, 2, 0.6, 2, 'blue', { studs: false }),
      box(1.25, B + 1.2, 0, 0.3, 2.4, 0.3, 'brown', { studs: false }),
      box(-1.25, B + 1.2, 0, 0.3, 2.4, 0.3, 'brown', { studs: false }),
      box(0, B + 2.6, 0, 3.6, P, 2.4, 'red'),
    ],
  });
}

export function tent(world, id, x, z, { color = 'red', name = 'Tent' } = {}) {
  world.addStatic({
    kind: 'tent', name, color, x, z, thingId: id,
    boxes: [
      box(0, 0.8, 0, 5, 1.6, 5, color, { studs: false }),
      box(0, 2.0, 0, 3.6, 0.8, 3.6, 'white', { studs: false }),
      box(0, 2.8, 0, 2, 0.8, 2, color, { studs: false }),
      box(0, 3.8, 0, 0.2, 1.2, 0.2, 'brown', { studs: false }),
      box(0, 0.7, 2.55, 1.4, 1.4, 0.1, 'black', { studs: false }),
    ],
  });
}

export function dummy(world, id, x, z) {
  world.addStatic({
    kind: 'dummy', name: 'Training Dummy', color: 'tan', x, z, thingId: id,
    boxes: [
      box(0, 1.5, 0, 0.4, 3, 0.4, 'brown', { studs: false }),
      box(0, 2.4, 0, 3, 0.4, 0.4, 'brown', { studs: false }),
      box(0, 2.1, 0, 1.4, 1.4, 1.0, 'tan', { studs: false }),
      box(0, 3.4, 0, 1.0, 1.0, 1.0, 'tan', { studs: false }),
    ],
  });
}

// A straight fence along +x (turn it with yaw).
export function fence(world, id, x, z, length, { yaw = 0, color = 'brown', name = 'Fence' } = {}) {
  const posts = Math.max(2, Math.round(length / 3) + 1);
  const boxes = [];
  for (let i = 0; i < posts; i++) boxes.push(box(-length / 2 + (i * length) / (posts - 1), 0.9, 0, 0.4, 1.8, 0.4, color, { studs: false }));
  for (const yy of [0.7, 1.4]) {
    for (let i = 0; i < posts - 1; i++) {
      const a = -length / 2 + (i * length) / (posts - 1) + 0.2, b = -length / 2 + ((i + 1) * length) / (posts - 1) - 0.2;
      boxes.push(box((a + b) / 2, yy, 0, b - a, 0.25, 0.2, color, { studs: false }));
    }
  }
  world.addStatic({ kind: 'fence', name, color, x, z, yaw, thingId: id, boxes });
}

// Hay bales: three on the ground and one on top (loose).
export function hay(world, id, x, z, { yaw = 0, name = 'Hay Bales' } = {}) {
  const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
  const add = (lx, y, lz) => world.addBrick({
    dims: [2, B, 3], color: 'yellow', x: x + lx * c + lz * s, y, z: z - lx * s + lz * c, yaw, kind: 'hay', name, thingId: id, sleeping: true, studs: false,
  });
  add(-2.05, B / 2, 0); add(0, B / 2, 0); add(2.05, B / 2, 0);
  add(-1.025, B * 1.5, 0); add(1.025, B * 1.5, 0);
}

export function flagPole(world, id, x, z, { color = 'red', name = 'Flag', kind = 'flag', height = 6, y = 0, dynamic = false } = {}) {
  world.addStatic({
    kind, name, color, x, y, z, thingId: id, dynamic,
    boxes: [
      box(0, 0.2, 0, 1.6, P, 1.6, 'gray'),
      box(0, P + height / 2, 0, 0.3, height, 0.3, 'white', { studs: false }),
      box(0, P + height + 0.25, 0, 0.6, 0.5, 0.6, 'yellow', { studs: false }),
      box(0, P + height - 1.0, -1.15, 0.1, 1.6, 2, color, { studs: false }),
    ],
  });
}

// ---- platformer --------------------------------------------------------------

export function platform(world, id, x, top, z, w, d, { color = 'orange', name = 'Platform', thickness = B, kind = 'platform', yaw = 0 } = {}) {
  world.addStatic({
    kind, name, color, x, y: top - thickness, z, yaw, thingId: id,
    boxes: [box(0, thickness / 2, 0, w, thickness, d, color, { studs: w * d <= 64 })],
  });
}

// A coin you can pass through; its behaviors notice the hero touching it.
export function coin(world, id, x, y, z) {
  world.addStatic({
    kind: 'coin', name: 'Coin', color: 'yellow', x, y, z, thingId: id, sensor: true,
    boxes: [
      box(0, 0, 0, 1.2, 1.2, 0.25, 'yellow', { studs: false }),
      box(0, 0, 0, 0.5, 0.7, 0.35, 'orange', { studs: false }),
    ],
  });
}

export function pipe(world, id, x, z, h = 2.4) {
  world.addStatic({
    kind: 'pipe', name: 'Pipe', color: 'green', x, z, thingId: id,
    boxes: [
      box(0, h / 2, 0, 2.4, h, 2.4, 'green', { studs: false }),
      box(0, h + 0.4, 0, 3, 0.8, 3, 'green', { studs: false }),
      box(0, h + 0.85, 0, 2, 0.1, 2, 'black', { studs: false }),
    ],
  });
}

export function block(world, id, x, y, z, { name = 'Surprise Block' } = {}) {
  world.addStatic({
    kind: 'block', name, color: 'yellow', x, y, z, thingId: id,
    boxes: [
      box(0, 0, 0, 1.6, 1.6, 1.6, 'yellow', { studs: false }),
      box(0, 0.2, 0.85, 0.6, 0.6, 0.1, 'orange', { studs: false }),
      box(0, -0.45, 0.85, 0.2, 0.2, 0.1, 'orange', { studs: false }),
    ],
  });
}

export function cloud(world, id, x, y, z) {
  world.addStatic({
    kind: 'cloud', name: 'Cloud', color: 'white', x, y, z, thingId: id,
    boxes: [box(0, 0, 0, 6, 1.6, 3, 'white', { studs: false }), box(0.5, 1.2, 0, 3, 0.8, 2.4, 'white', { studs: false })],
  });
}

// ---- space -------------------------------------------------------------------

export function asteroid(world, id, x, y, z, { size = 2.5, color = 'darkgray', spin = 0.3 } = {}) {
  world.addBrick({
    dims: [size, size * 0.8, size * 0.9], color, x, y, z, yaw: (x * 37 + z * 11) % 360, kind: 'asteroid', name: 'Asteroid', thingId: id, studs: false,
    angvel: { x: spin * 0.6, y: spin, z: -spin * 0.4 },
  });
}

export function landingPad(world, id, x, z) {
  world.addStatic({
    kind: 'pad', name: 'Landing Pad', color: 'gray', x, z, thingId: id,
    boxes: [
      box(0, 0.2, 0, 8, P, 8, 'darkgray', { studs: false }),
      box(0, 0.45, 0, 6, 0.1, 0.6, 'yellow', { studs: false }),
      box(2.7, 0.45, 2.7, 0.6, 0.1, 0.6, 'red', { studs: false }),
      box(-2.7, 0.45, -2.7, 0.6, 0.1, 0.6, 'red', { studs: false }),
    ],
  });
}

export function station(world, id, x, z) {
  world.addStatic({
    kind: 'station', name: 'Moon Base', color: 'white', x, z, thingId: id,
    boxes: [
      box(0, 1.2, 0, 8, 2.4, 6, 'white', { studs: false }),
      box(0, 2.8, 0, 6, 0.8, 4, 'gray'),
      box(0, 3.6, 0, 3, 0.8, 2, 'white', { studs: false }),
      box(0, 1.3, 3.05, 5, 0.8, 0.1, 'cyan', { studs: false }),
      box(5, 0.9, 0, 2, 1.8, 2, 'gray', { studs: false }),
      box(-2, 5.5, 0, 0.2, 3, 0.2, 'gray', { studs: false }),
      box(-2, 7.1, 0, 2, 0.2, 2, 'red', { studs: false }),
    ],
  });
}

export function crystal(world, id, x, z, { color = 'cyan' } = {}) {
  world.addStatic({
    kind: 'crystal', name: 'Crystal', color, x, z, thingId: id,
    boxes: [
      box(0, 1.2, 0, 1, 2.4, 1, color, { studs: false, rot: [0.15, 0.5, 0] }),
      box(0.9, 0.7, 0.4, 0.7, 1.4, 0.7, color, { studs: false, rot: [0, 0.3, -0.35] }),
      box(-0.8, 0.6, -0.3, 0.6, 1.2, 0.6, color, { studs: false, rot: [0.3, 0.9, 0.3] }),
    ],
  });
}

// ---- village and farm ----------------------------------------------------------

// Flat strips: [[x, z, w, d], ...] in one prop.
export function road(world, id, strips, { color = 'darkgray', name = 'Road' } = {}) {
  world.addStatic({
    kind: 'road', name, color, x: 0, z: 0, thingId: id,
    boxes: strips.map(([x, z, w, d]) => box(x, 0.02, z, w, 0.04, d, color, { studs: false })), // thin enough to drive onto
  });
}

export function lamp(world, id, x, z) {
  world.addStatic({
    kind: 'lamp', name: 'Lamp Post', color: 'black', x, z, thingId: id,
    boxes: [
      box(0, 0.2, 0, 1, P, 1, 'black'),
      box(0, 2.4, 0, 0.3, 4, 0.3, 'black', { studs: false }),
      box(0, 4.7, 0, 0.9, 0.6, 0.9, 'yellow', { studs: false }),
      box(0, 5.1, 0, 1.1, 0.2, 1.1, 'black', { studs: false }),
    ],
  });
}

export function fountain(world, id, x, z) {
  world.addStatic({
    kind: 'fountain', name: 'Fountain', color: 'blue', x, z, thingId: id,
    boxes: [
      box(2.75, 0.5, 0, 0.5, 1, 6, 'gray', { studs: false }),
      box(-2.75, 0.5, 0, 0.5, 1, 6, 'gray', { studs: false }),
      box(0, 0.5, 2.75, 5, 1, 0.5, 'gray', { studs: false }),
      box(0, 0.5, -2.75, 5, 1, 0.5, 'gray', { studs: false }),
      box(0, 0.35, 0, 5, 0.7, 5, 'blue', { studs: false }),
      box(0, 1.5, 0, 1, 2.3, 1, 'gray', { studs: false }),
      box(0, 2.85, 0, 2, P, 2, 'cyan', { studs: false }),
    ],
  });
}

export function stall(world, id, x, z, { color = 'red', goods = 'orange', yaw = 0, name = 'Market Stall' } = {}) {
  world.addStatic({
    kind: 'stall', name, color, x, z, yaw, thingId: id,
    boxes: [
      box(0, 0.6, 0, 4, B, 2, 'brown'),
      box(-0.9, 1.45, 0.2, 1, 0.5, 1, goods, { studs: false }),
      box(0.9, 1.45, 0.2, 1, 0.5, 1, 'lime', { studs: false }),
      box(1.8, 2.2, -0.8, 0.2, 2, 0.2, 'brown', { studs: false }),
      box(-1.8, 2.2, -0.8, 0.2, 2, 0.2, 'brown', { studs: false }),
      box(1.8, 2.2, 0.8, 0.2, 2, 0.2, 'brown', { studs: false }),
      box(-1.8, 2.2, 0.8, 0.2, 2, 0.2, 'brown', { studs: false }),
      box(0, 3.4, 0, 4.4, P, 2.6, color, { studs: false }),
    ],
  });
}

export function barn(world, id, x, z, { yaw = 0 } = {}) {
  world.addStatic({
    kind: 'barn', name: 'Barn', color: 'red', x, z, yaw, thingId: id,
    boxes: [
      box(0, 2.4, 0, 10, 4.8, 8, 'red', { studs: false }),
      box(0, 1.6, 4.05, 3.6, 3.2, 0.1, 'brown', { studs: false }),
      box(0, 1.6, 4.15, 3.6, 0.3, 0.1, 'white', { studs: false }),
      box(0, 3.35, 4.1, 3.9, 0.3, 0.2, 'white', { studs: false }),
      box(0, 3.9, 4.05, 1.4, 0.8, 0.1, 'white', { studs: false }),
      box(0, 5.1, 0, 10.6, 0.6, 8.6, 'darkgray', { studs: false }),
      box(0, 5.8, 0, 8, 0.8, 8.2, 'darkgray', { studs: false }),
      box(0, 6.6, 0, 5, 0.8, 7.8, 'darkgray', { studs: false }),
      box(0, 7.3, 0, 2, 0.6, 7.4, 'darkgray', { studs: false }),
    ],
  });
}

export function silo(world, id, x, z) {
  world.addStatic({
    kind: 'silo', name: 'Silo', color: 'gray', x, z, thingId: id,
    boxes: [
      box(0, 4, 0, 3.4, 8, 3.4, 'gray', { studs: false }),
      box(0, 4, 0, 4, 7.6, 2.4, 'gray', { studs: false }),
      box(0, 4, 0, 2.4, 7.6, 4, 'gray', { studs: false }),
      box(0, 8.4, 0, 2.6, 0.8, 2.6, 'red', { studs: false }),
      box(0, 9.1, 0, 1.4, 0.6, 1.4, 'red', { studs: false }),
    ],
  });
}

// Rows of crops: a strip of soil with plants on it.
export function crops(world, id, x, z, { rows = 4, length = 10, plant = 'orange', leaf = 'green', name = 'Carrots', tall = false } = {}) {
  const boxes = [];
  for (let r = 0; r < rows; r++) {
    const rz = (r - (rows - 1) / 2) * 2.5;
    boxes.push(box(0, 0.2, rz, length, P, 1.2, 'brown', { studs: false }));
    for (let i = 0; i < Math.floor(length / 2); i++) {
      const px = -length / 2 + 1 + i * 2;
      if (tall) boxes.push(box(px, 1.6, rz, 0.4, 2.4, 0.4, leaf, { studs: false }), box(px, 2.2, rz, 0.5, 0.8, 0.5, plant, { studs: false }));
      else boxes.push(box(px, 0.55, rz, 0.5, 0.3, 0.5, plant, { studs: false }), box(px, 0.95, rz, 0.3, 0.5, 0.3, leaf, { studs: false }));
    }
  }
  world.addStatic({ kind: 'crops', name, color: plant, x, z, thingId: id, boxes });
}

export function pond(world, id, x, z, w = 10, d = 7) {
  world.addStatic({
    kind: 'pond', name: 'Pond', color: 'blue', x, z, thingId: id,
    boxes: [
      box(0, 0.025, 0, w, 0.05, d, 'blue', { studs: false }),
      box(0, 0.0175, 0, w + 1, 0.035, d - 2, 'blue', { studs: false }),
      box(0, 0.0175, 0, w - 2, 0.035, d + 1, 'blue', { studs: false }),
    ],
  });
}

// ---- minigolf -----------------------------------------------------------------

// A raised green: surface pieces with a square cup cut out, and walls on top
// so the ball stays in. rects and walls are [cx, cz, w, d] in local studs.
export function green(world, id, x, z, { rects, walls, cup, name = 'Green', height = B, cupSize = 1.8 }) {
  const boxes = greenBoxes({ rects, cup, height, cupSize });
  for (const [cx, cz, w, d] of walls) boxes.push(box(cx, height + 0.4, cz, w, 0.8, d, 'brown', { studs: false }));
  world.addStatic({ kind: 'green', name, color: 'green', x, z, thingId: id, boxes });
}

// The surface of a green, with a square cup cut out of it.
function greenBoxes({ rects, cup, height, cupSize }) {
  const boxes = [];
  const c = cupSize / 2;
  const [hx, hz] = cup;
  for (const [cx, cz, w, d] of rects) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const hasCup = hx - c >= x0 && hx + c <= x1 && hz - c >= z0 && hz + c <= z1;
    const pieces = hasCup
      ? [[x0, z0, x1, hz - c], [x0, hz + c, x1, z1], [x0, hz - c, hx - c, hz + c], [hx + c, hz - c, x1, hz + c]]
      : [[x0, z0, x1, z1]];
    for (const [a, b, e, f] of pieces) {
      if (e - a > 0.01 && f - b > 0.01) boxes.push(box((a + e) / 2, height / 2, (b + f) / 2, e - a, height, f - b, 'green', { studs: false }));
    }
  }
  return boxes;
}

// The bottom of a cup: dark, and a sensor, so its behaviors feel the ball drop in.
// depth: how high the sensor reaches, so a ball resting on something in the cup still counts.
export function cup(world, id, x, z, { name = 'Cup', size = 1.7, depth = 0.9 } = {}) {
  world.addStatic({
    kind: 'cup', name, color: 'black', x, z, thingId: id, sensor: true,
    boxes: [box(0, depth / 2, 0, size, depth, size, 'black', { studs: false })],
  });
}

// The flag that marks a cup, standing at its corner.
export function pin(world, id, x, y, z, { color = 'red', name = 'Flag' } = {}) {
  world.addStatic({
    kind: 'flag', name, color, x, y, z, thingId: id,
    boxes: [
      box(0, 2.0, 0, 0.15, 4, 0.15, 'white', { studs: false }),
      box(0, 3.5, 0.75, 0.05, 1, 1.4, color, { studs: false }),
    ],
  });
}

// A spinning gate: a post with two crossed blades (teach it to turn).
export function spinner(world, id, x, y, z, { reach = 3.3, name = 'Spinner' } = {}) {
  world.addStatic({
    kind: 'spinner', name, color: 'red', x, y, z, thingId: id,
    boxes: [
      box(0, 1.0, 0, 0.6, 2.0, 0.6, 'yellow', { studs: false }),
      box(0, 0.5, 0, reach * 2, 0.8, 0.4, 'red', { studs: false }),
      box(0, 0.6, 0, 0.4, 0.9, reach * 2, 'white', { studs: false }),
    ],
  });
}

// ---- MEGA GOLF: a course built for a ball bigger than a minifig ---------------

// A ramp between two heights: a slab whose top runs from y0 to y1 along `axis`
// ('x' or 'z') across the rectangle [x0, x1] × [z0, z1], with stepped blocks
// underneath so it looks solid. Returns boxes in world space (for a prop at 0, 0).
function slope([x0, x1], [z0, z1], y0, y1, axis, { color = 'green', fill = 'tan', t = 0.8, steps = 4 } = {}) {
  const run = axis === 'x' ? x1 - x0 : z1 - z0;
  const a = Math.atan2(y1 - y0, run);
  const len = Math.hypot(run, y1 - y0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (y0 + y1) / 2 - t / 2 / Math.cos(a);
  const boxes = [axis === 'x'
    ? box(cx, cy, cz, len, t, z1 - z0, color, { rot: [0, 0, a], studs: false })
    : box(cx, cy, cz, x1 - x0, t, len, color, { rot: [-a, 0, 0], studs: false })];
  const under = (u) => y0 + (y1 - y0) * u - t / Math.cos(a) - 0.05; // underside at fraction u of the run
  for (let i = 0; i < steps; i++) {
    const h = Math.min(under(i / steps), under((i + 1) / steps));
    if (h < 0.3) continue;
    const s0 = x0 + ((axis === 'x' ? run : 0) * i) / steps, s1 = x0 + ((axis === 'x' ? run : 0) * (i + 1)) / steps;
    const r0 = z0 + ((axis === 'z' ? run : 0) * i) / steps, r1 = z0 + ((axis === 'z' ? run : 0) * (i + 1)) / steps;
    boxes.push(axis === 'x'
      ? box((s0 + s1) / 2, h / 2, cz, s1 - s0, h, z1 - z0, fill, { studs: false })
      : box(cx, h / 2, (r0 + r1) / 2, x1 - x0, h, r1 - r0, fill, { studs: false }));
  }
  return { boxes, angle: a };
}

// The whole MEGA GOLF hole: a tee fairway, a ramp up to a plateau with two
// turns, a ramp down, and a raised green with a cup big enough for the ball.
// Returns the spots the world needs (tee, cup, obstacles).
export function megaCourse(world) {
  const FAIR = 0.4, PLAT = 6.4, GREEN = 3.6, WALL = 3.2, T = 1;
  const boxes = []; // one prop, so the pieces can meet without counting as things stuck inside each other
  const add = (more) => boxes.push(...more);
  // a flat wall along x or z, standing on a surface at height y
  const wallX = (x0, x1, z, y) => box((x0 + x1) / 2, y + WALL / 2, z, x1 - x0 + T, WALL, T, 'brown', { studs: false });
  const wallZ = (z0, z1, x, y) => box(x, y + WALL / 2, (z0 + z1) / 2, T, WALL, z1 - z0 + T, 'brown', { studs: false });

  // 1. the tee fairway, on the ground; it turns right at the far end
  add([
    box(0, FAIR / 2, -19, 20, FAIR, 66, 'green', { studs: false }),
    wallZ(-52, 14, -10.5, FAIR), wallZ(-52, -6, 10.5, FAIR), wallX(-10, 10, -52.5, FAIR), wallX(-10, 10, 14.5, FAIR),
  ]);
  // 2. a ramp up to the plateau
  const up = slope([10, 30], [-6, 14], FAIR, PLAT, 'x');
  const midUp = (FAIR + PLAT) / 2;
  add([
    ...up.boxes,
    box(20, midUp + WALL / 2, -6.5, 21, WALL, T, 'brown', { rot: [0, 0, up.angle], studs: false }),
    box(20, midUp + WALL / 2, 14.5, 21, WALL, T, 'brown', { rot: [0, 0, up.angle], studs: false }),
  ]);
  // 3. the plateau: turn left, then past the obstacles
  add([
    box(40, (PLAT - FAIR) / 2, 19, 20, PLAT - FAIR, 50, 'tan', { studs: false }),
    box(40, PLAT - FAIR / 2, 19, 20, FAIR, 50, 'green', { studs: false }),
    wallZ(-6, 44, 50.5, PLAT), wallX(30, 50, -6.5, PLAT), wallZ(14, 44, 29.5, PLAT),
  ]);
  // 4. a ramp down to the green
  const down = slope([30, 50], [44, 64], PLAT, GREEN, 'z');
  const midDown = (PLAT + GREEN) / 2;
  add([
    ...down.boxes,
    box(29.5, midDown + WALL / 2, 54, T, WALL, 21, 'brown', { rot: [-down.angle, 0, 0], studs: false }),
    box(50.5, midDown + WALL / 2, 54, T, WALL, 21, 'brown', { rot: [-down.angle, 0, 0], studs: false }),
  ]);
  // 5. the green, raised, with the cup cut out of it
  const cup = [40, 84];
  add(greenBoxes({ cup, cupSize: 10.4, height: GREEN, rects: [[40, 78, 32, 28]] }));
  add([
    wallZ(64, 92, 23.5, GREEN), wallZ(64, 92, 56.5, GREEN), wallX(24, 56, 92.5, GREEN),
    wallX(24, 30, 63.5, GREEN), wallX(50, 56, 63.5, GREEN),
  ]);
  world.addStatic({ kind: 'green', name: 'Mega Course', color: 'green', x: 0, z: 0, thingId: 'course', boxes });
  return { FAIR, PLAT, GREEN, tee: [0, -40], cup };
}

// A giant toadstool: a white stem and a spotty red cap.
export function mushroom(world, id, x, z, { y = 0, name = 'Giant Mushroom', cap = 'red' } = {}) {
  // the cap is up above the mega ball (7 studs tall), so only the stem is in the way
  const dots = [[-2.5, -2], [2, -2.5], [0, 1], [-2, 2.8], [2.8, 2]].map(([dx, dz]) => box(dx, 10.25, dz, 1.4, 0.3, 1.4, 'white', { studs: false }));
  world.addStatic({
    kind: 'mushroom', name, color: cap, x, y, z, thingId: id,
    boxes: [box(0, 4, 0, 3, 8, 3, 'white', { studs: false }), box(0, 9, 0, 9, 2, 9, cap, { studs: false }), ...dots],
  });
}

// A spinning bar as wide as a fairway (teach it to turn).
export function giantSpinner(world, id, x, y, z, { reach = 9, name = 'Giant Spinner' } = {}) {
  world.addStatic({
    kind: 'spinner', name, color: 'red', x, y, z, thingId: id,
    boxes: [
      box(0, 3.5, 0, 2, 7, 2, 'yellow', { studs: false }),
      box(0, 2.2, 0, reach * 2, 3.2, 1.2, 'red', { studs: false }),
      box(0, 2.2, 0, 1.2, 3.2, reach * 2, 'white', { studs: false }),
    ],
  });
}

// A flag pole tall enough to see from the tee.
export function giantPin(world, id, x, y, z, { color = 'red', name = 'Giant Flag' } = {}) {
  world.addStatic({
    kind: 'flag', name, color, x, y, z, thingId: id,
    boxes: [box(0, 8, 0, 0.6, 16, 0.6, 'white', { studs: false }), box(0, 14, 2.6, 0.2, 3.6, 5, color, { studs: false })],
  });
}

// Big Rex: a dinosaur taller than most houses, with comically tiny arms.
// Faces +z; a prop, so a program can turn it and slide it around.
export function bigRex(world, id, x, z, { yaw = 0, name = 'Big Rex', color = 'lime' } = {}) {
  const spikes = [-6, -3, 0, 3].map((sz, i) => box(0, 14.9 - i * 0.2, sz - 1, 1.8, 1.8, 1.8, 'green', { rot: [Math.PI / 4, 0, 0], studs: false }));
  const teeth = [-2.2, -1.1, 0, 1.1, 2.2].map((tx) => box(tx, 18.2, 10.6, 0.5, 0.7, 0.5, 'white', { studs: false }));
  world.addStatic({
    kind: 'dinosaur', name, color, x, z, yaw, thingId: id,
    boxes: [
      box(3, 4, 0, 3, 8, 4, color, { studs: false }), box(-3, 4, 0, 3, 8, 4, color, { studs: false }), // legs
      box(3, 0.6, 1.4, 3.4, 1.2, 6, 'green', { studs: false }), box(-3, 0.6, 1.4, 3.4, 1.2, 6, 'green', { studs: false }), // feet
      box(0, 11, -1, 9, 7, 13, color), // body
      box(0, 10.5, 5.6, 6, 5, 0.5, 'yellow', { studs: false }), // belly
      box(0, 10, -10, 5, 4, 8, color), box(0, 9, -16, 3, 2.5, 6, color), // tail
      box(0, 16, 4, 5, 6, 5, color), // neck
      box(0, 20, 6.5, 7, 4.4, 9.5, color), box(0, 17.6, 7, 6, 1.2, 8, 'green', { studs: false }), // head and jaw
      box(3.6, 21, 7.5, 0.3, 1.6, 1.6, 'white', { studs: false }), box(-3.6, 21, 7.5, 0.3, 1.6, 1.6, 'white', { studs: false }), // eyes
      box(3.75, 21, 7.8, 0.2, 0.8, 0.8, 'black', { studs: false }), box(-3.75, 21, 7.8, 0.2, 0.8, 0.8, 'black', { studs: false }),
      box(3.2, 12.5, 5.5, 1, 1, 2.4, color, { studs: false }), box(-3.2, 12.5, 5.5, 1, 1, 2.4, color, { studs: false }), // tiny arms
      ...spikes, ...teeth,
    ],
  });
}

// ---- Calvinball: a playing field to make your own game on ----------------------
// The field runs along x: the left half (x < 0) is one team's, the right half
// the other's, each with a goal at its end. Only the field itself is fixed;
// everything around it can be knocked over (and Reset stands it up again).

export const FIELD = { length: 82, width: 52, mouth: 9 }; // mouth: half the width of a goal

// The field: two colored halves with white lines (halfway line, center
// circle, sidelines and a box in front of each goal) and the floor inside
// each goal, flat enough to drive on.
export function field(world, id, { length = FIELD.length, width = FIELD.width, mouth = FIELD.mouth, left = '#d8685d', right = '#5b8fd6', name = 'Field' } = {}) {
  const hx = length / 2, hz = width / 2, T = 0.04, LINE = 0.4;
  const line = (x, z, w, d, extra) => box(x, T + 0.01, z, w, 0.02, d, 'white', { studs: false, ...extra }); // lies on top
  const boxes = [
    box(-hx / 2, T / 2, 0, hx, T, width, left, { studs: false }),
    box(hx / 2, T / 2, 0, hx, T, width, right, { studs: false }),
    line(0, 0, LINE, width),
    line(0, -hz + LINE / 2, length, LINE), line(0, hz - LINE / 2, length, LINE),
    line(-hx + LINE / 2, 0, LINE, width), line(hx - LINE / 2, 0, LINE, width),
    line(0, 0, 1.4, 1.4), // the center spot
  ];
  const r = 9, n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    boxes.push(line(Math.sin(a) * r, Math.cos(a) * r, (2 * Math.PI * r) / n + 0.06, LINE, { rot: [0, a, 0] }));
  }
  const deep = 9, wide = 2 * mouth + 12; // the box in front of each goal
  for (const s of [-1, 1]) {
    boxes.push(line(s * (hx - deep), 0, LINE, wide));
    for (const zs of [-1, 1]) boxes.push(line(s * (hx - deep / 2), zs * (wide / 2 - LINE / 2), deep, LINE));
    boxes.push(box(s * (hx + 1.5), T / 2, 0, 3, T, 2 * mouth, 'darkgray', { studs: false })); // the floor of the goal
  }
  world.addStatic({ kind: 'field', name, color: 'white', x: 0, z: 0, thingId: id, boxes, fixed: true }); // no dragging it away by accident
}

// A low wall of loose bricks all around the field, open at each goal; the
// end walls are in the team colors. Heavy bricks, so the ball bounces off,
// but a car can still bash a gap in it.
export function fieldWalls(world, id, { length = FIELD.length, width = FIELD.width, mouth = FIELD.mouth, ends = ['red', 'blue'], name = 'Field Wall' } = {}) {
  const hx = length / 2, hz = width / 2;
  const add = (x, z, w, d, color) => world.addBrick({ dims: [w, B, d], color, x, y: B / 2, z, kind: 'wall', name, thingId: id, sleeping: true, density: 2.5 });
  const row = (from, to, piece, place) => { // bricks about `piece` long from `from` to `to`
    const n = Math.max(1, Math.round((to - from) / piece)), len = (to - from) / n;
    for (let i = 0; i < n; i++) place(from + len * (i + 0.5), len);
  };
  for (const zs of [-1, 1]) row(-hx - 1, hx + 1, 7, (x, len) => add(x, zs * (hz + 0.5), len, 1, 'white'));
  ends.forEach((color, i) => {
    const s = i === 0 ? -1 : 1;
    for (const zs of [-1, 1]) row(mouth + 1, hz, 5, (z, len) => add(s * (hx + 0.5), zs * z, 1, len, color)); // beside the goal posts
  });
}

// A goal of bricks standing on the goal line at x; side: -1 is the left end
// of the field (it opens toward +x), 1 the right. Striped posts, a crossbar,
// and see-through netting at the back and sides to stop the ball. It's one
// heavy piece: the ball can't budge it, but a car can knock it over.
export function goal(world, id, x, side, { color = 'red', name = `${cap(color)} Goal`, mouth = FIELD.mouth, height = 4 } = {}) {
  const at = (u, y, z, w, h, d, c, extra) => box(side * u, y, z, w, h, d, c, extra); // u: how deep into the goal
  const top = height * B;
  const boxes = [];
  for (const u of [0.5, 3.5]) {
    for (const zs of [-1, 1]) {
      for (let i = 0; i < height; i++) boxes.push(at(u, B / 2 + i * B, zs * (mouth + 0.5), 1, B, 1, i % 2 ? color : 'white'));
    }
    boxes.push(at(u, top + B / 2, 0, 1, B, 2 * mouth + 2, color)); // crossbar, and the bar across the back
  }
  for (const zs of [-1, 1]) {
    boxes.push(at(2, top + B / 2, zs * (mouth + 0.5), 2, B, 1, 'white'));
    boxes.push(at(2, top / 2, zs * (mouth + 0.5), 2, top, 1, 'white', { glass: true, studs: false })); // side netting
  }
  boxes.push(at(3.5, top / 2, 0, 1, top, 2 * mouth, 'white', { glass: true, studs: false })); // back netting
  world.addStatic({ kind: 'goal', name, color, x, z: 0, thingId: id, boxes, dynamic: true, density: 1.5 });
}

// The inside of a goal (see goal), a step past the goal line: a see-through
// sensor, so the ball rolls in and its behaviors notice. It stays put even if
// the goal is knocked over: that's where the goal is.
export function goalNet(world, id, x, side, { color = 'red', name = `${cap(color)} Net`, mouth = FIELD.mouth, height = 4 } = {}) {
  const top = height * B;
  world.addStatic({
    kind: 'net', name, color, x, z: 0, thingId: id, sensor: true,
    boxes: [box(side * 2, (top + 0.04) / 2, 0, 2, top - 0.04, 2 * mouth, color, { glass: true, studs: false })],
  });
}

// A big scoreboard on two legs. Its screen shows whatever its behaviors
// show() on it; the ends are painted in the team colors. Knock it over and
// it keeps showing the score, lying in the grass.
export function scoreboard(world, id, x, z, { yaw = 0, left = 'red', right = 'blue', text = 'RED  vs  BLUE\n0 - 0', name = 'Scoreboard' } = {}) {
  const boxes = [
    box(-8, 4, 0, 2, 8, 2, 'darkgray'),
    box(8, 4, 0, 2, 8, 2, 'darkgray'),
    box(-8, 0.2, 0, 4, P, 4, 'darkgray'), // feet
    box(8, 0.2, 0, 4, P, 4, 'darkgray'),
    box(0, 12, 0, 24, 8, 1.6, 'black', { studs: false }),
    box(0, 12, 0, 22, 6.6, 1.8, 'black', { studs: false, screen: { text } }),
    box(-12.75, 12, 0, 1.5, 8, 2, left, { studs: false }),
    box(12.75, 12, 0, 1.5, 8, 2, right, { studs: false }),
    box(0, 16 + B / 2, 0, 27, B, 2, 'yellow'),
  ];
  for (let i = -4; i <= 4; i++) boxes.push(box(i * 3, 16 + B + B / 2, 0, 1, B, 1, i % 2 ? 'white' : 'yellow', { shape: 'round' })); // lamps along the top
  world.addStatic({ kind: 'scoreboard', name, color: 'black', x, z, yaw, thingId: id, boxes, dynamic: true });
}

// A training cone of loose bricks: knock it over and Reset stands it up again.
export function cone(world, id, x, z, { y = 0, color = 'orange', name = 'Cone' } = {}) {
  const add = (yy, w, h, c) => world.addBrick({ dims: [w, h, w], color: c, x, y: y + yy, z, kind: 'cone', name, thingId: id, sleeping: true, studs: false });
  add(0.15, 1.6, 0.3, color);
  add(0.3 + 0.45, 1, 0.9, color);
  add(1.2 + 0.25, 0.6, 0.5, 'white');
}

// A team bench with a backrest at its back (-z; turn it with yaw).
export function bench(world, id, x, z, { color = 'red', yaw = 0, name = `${cap(color)} Bench` } = {}) {
  world.addStatic({
    kind: 'bench', name, color, x, z, yaw, thingId: id, dynamic: true,
    boxes: [
      box(-3.5, B / 2, 0, 1, B, 2, 'darkgray', { studs: false }),
      box(3.5, B / 2, 0, 1, B, 2, 'darkgray', { studs: false }),
      box(0, B + P / 2, 0, 8, P, 2, color),
      box(0, B + P + 0.8, -0.8, 8, 1.6, 0.4, color, { studs: false }),
    ],
  });
}

// A round water cooler with a white lid.
export function cooler(world, id, x, z, { color = 'orange', name = 'Water Cooler' } = {}) {
  world.addStatic({
    kind: 'cooler', name, color, x, z, thingId: id, dynamic: true,
    boxes: [
      box(0, 1, 0, 1.6, 2, 1.6, color, { shape: 'round', studs: false }),
      box(0, 2.15, 0, 1.8, 0.3, 1.8, 'white', { shape: 'round' }),
    ],
  });
}

// A tall stadium light, its lamps facing the middle of the field. A heavy
// foot keeps it standing until something big hits it.
export function lightTower(world, id, x, z, { name = 'Stadium Light' } = {}) {
  const yaw = (Math.atan2(-x, -z) * 180) / Math.PI;
  const boxes = [
    box(0, P / 2, 0, 3, P, 3, 'darkgray'),
    box(0, P + 7, 0, 1, 14, 1, 'gray', { studs: false }),
    box(0, P + 15.2, 0, 5, 2.4, 0.8, 'darkgray', { studs: false }),
  ];
  for (const lx of [-1.5, 0, 1.5]) for (const ly of [14.6, 15.8]) boxes.push(box(lx, P + ly, 0.45, 1.2, 1, 0.1, 'yellow', { studs: false }));
  world.addStatic({ kind: 'light', name, color: 'gray', x, z, yaw, thingId: id, boxes, dynamic: true });
}

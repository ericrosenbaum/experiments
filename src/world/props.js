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

export function tree(world, id, x, z, { scale = 1, name, leaf = 'green', top = 'lime' } = {}) {
  const h = 4 * B * scale;
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

export function flagPole(world, id, x, z, { color = 'red', name = 'Flag', kind = 'flag', height = 6, y = 0 } = {}) {
  world.addStatic({
    kind, name, color, x, y, z, thingId: id,
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
  for (const [cx, cz, w, d] of walls) boxes.push(box(cx, height + 0.4, cz, w, 0.8, d, 'brown', { studs: false }));
  world.addStatic({ kind: 'green', name, color: 'green', x, z, thingId: id, boxes });
}

// The bottom of a cup: dark, and a sensor, so its behaviors feel the ball drop in.
export function cup(world, id, x, z, { name = 'Cup', size = 1.7 } = {}) {
  world.addStatic({
    kind: 'cup', name, color: 'black', x, z, thingId: id, sensor: true,
    boxes: [box(0, 0.45, 0, size, 0.9, size, 'black', { studs: false })],
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

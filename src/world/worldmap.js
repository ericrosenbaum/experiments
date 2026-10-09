// The premade world: trees, two brick houses (knock them over!), a rainbow
// tower to topple, a ramp, a ball, and some loose bricks.
import { BRICK_H, PLATE_H } from './bricks.js';

const RAINBOW = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

function tree(world, n, x, z, scale = 1) {
  const h = 4 * BRICK_H * scale;
  world.addStatic({
    kind: 'tree', name: `Tree ${n}`, color: 'green', x, z, thingId: `tree-${n}`,
    boxes: [
      { at: [0, h / 2, 0], size: [2, h, 2], color: 'brown' },
      { at: [0, h + 0.6, 0], size: [6, BRICK_H, 6], color: 'green' },
      { at: [0, h + 1.8, 0], size: [4, BRICK_H, 4], color: 'green' },
      { at: [0, h + 3.0, 0], size: [2, BRICK_H, 2], color: 'lime' },
    ],
  });
}

// A house of loose bricks (asleep until something bumps it).
function house(world, n, cx, cz, wallColor, roofColor) {
  const thingId = `house-${n}`;
  const name = `${roofColor[0].toUpperCase() + roofColor.slice(1)}-Roof House`;
  const rows = 4;
  const add = (x, y, z, w, d, color = wallColor) =>
    world.addBrick({ dims: [w, BRICK_H, d], color, x: cx + x, y, z: cz + z, kind: 'house', name, thingId, sleeping: true });
  // Lay segment lengths (in studs) along a wall, alternating the joint pattern.
  const segs = (len, odd) => (len === 8 ? (odd ? [2, 4, 2] : [4, 4]) : (odd ? [2, 4] : [4, 2]));
  for (let r = 0; r < rows; r++) {
    const y = BRICK_H / 2 + r * BRICK_H;
    const odd = r % 2 === 1;
    // front (+z) and back (-z) walls span x; side walls span z
    const fbLen = odd ? 6 : 8, sLen = odd ? 8 : 6;
    for (const side of [1, -1]) {
      let x = -fbLen / 2;
      for (const L of segs(fbLen, odd)) {
        const mid = x + L / 2;
        const inDoor = side === 1 && r < 2 && Math.abs(mid) < 1.5;
        if (!inDoor) add(mid, y, side * 3.5, L, 1, r === rows - 1 ? 'white' : wallColor);
        x += L;
      }
      let z = -sLen / 2;
      for (const L of segs(sLen, !odd)) {
        add(side * 3.5, y, z + L / 2, 1, L, r === 1 && Math.abs(z + L / 2) < 1.5 ? 'cyan' : wallColor);
        z += L;
      }
    }
  }
  const top = rows * BRICK_H;
  add(0, top + PLATE_H / 2, 0, 9, 9, roofColor);
  world.addBrick({ dims: [6, BRICK_H, 6], color: roofColor, x: cx, y: top + PLATE_H + BRICK_H / 2, z: cz, kind: 'house', name, thingId, sleeping: true });
  world.addBrick({ dims: [3, BRICK_H, 3], color: roofColor, x: cx, y: top + PLATE_H + BRICK_H * 1.5, z: cz, kind: 'house', name, thingId, sleeping: true });
}

function tower(world, cx, cz, layers = 12) {
  for (let i = 0; i < layers; i++) {
    const y = BRICK_H / 2 + i * BRICK_H;
    const color = RAINBOW[i % RAINBOW.length];
    const along = i % 2 === 0;
    for (const off of [-1, 1]) {
      world.addBrick({
        size: '2x4', color, kind: 'tower', name: 'Rainbow Tower', thingId: 'tower', sleeping: true,
        x: cx + (along ? off : 0), y, z: cz + (along ? 0 : off), yaw: along ? 0 : 90,
      });
    }
  }
}

export function buildWorld(world) {
  const trees = [[-30, 6], [-26, 18], [-14, 30], [8, 34], [30, 18], [36, 0], [-36, -8], [12, -34], [-6, -30], [40, -28]];
  trees.forEach(([x, z], i) => tree(world, i + 1, x, z, i % 3 === 0 ? 1.3 : 1));
  house(world, 1, -20, -14, 'tan', 'red');
  house(world, 2, 24, -16, 'white', 'blue');
  tower(world, 14, 12);
  world.addStatic({
    kind: 'ramp', name: 'Ramp', color: 'gray', x: -6, z: 22, thingId: 'ramp',
    boxes: [
      { at: [0, 1.15, 0], size: [8, 0.4, 10], color: 'gray', rot: [-0.24, 0, 0], studs: false },
      { at: [0, 1.25, -5.7], size: [8, 2.5, 1.6], color: 'darkgray', studs: false },
    ],
  });
  world.addBall({ x: 4, y: 1.3, z: 14, color: 'white', name: 'Ball' });
  const loose = [['red', -12, 6], ['blue', -10, 8], ['yellow', -12.5, 9], ['green', -9, 4.5], ['orange', 6, -10], ['purple', 8, -12]];
  loose.forEach(([color, x, z], i) => world.addBrick({ size: i % 2 ? '2x2' : '2x4', color, x, y: BRICK_H / 2, z, yaw: i * 37, sleeping: true }));
}

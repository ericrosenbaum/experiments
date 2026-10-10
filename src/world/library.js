// The premade model library. Building isn't part of this prototype, so
// creations are described as data: a chassis made of bricks, plus named
// parts (wheels and hinged pieces) that can move relative to the chassis.
//
// Frame: +Z is the model's front, +Y up, +X the model's LEFT side.
// All positions are in studs, relative to the chassis origin.
//
// part kinds:
//   wheel  — a driven wheel on an axle along X. side: 'left' | 'right'.
//   hinge  — bricks that swing about `axis` through `pivot`. `sign` maps
//            the kid-facing angle to the joint angle so that positive means
//            "up", "forward" or "to the left" for that part. `limits` are
//            kid-facing degrees. `strength` scales the hinge motor.
//
// motion: 'wheels' (differential drive) or 'glide' (stays upright and
// slides, like a walking character).

import { BRICK_H as B, PLATE_H as P } from './bricks.js';

const b = (x, y, z, w, h, d, color, extra = {}) => ({ at: [x, y, z], size: [w, h, d], color, ...extra });

export const LIBRARY = [
  {
    id: 'racecar',
    name: 'Race Car',
    blurb: 'Four wheels and a big spoiler. Drives with differential steering.',
    color: 'red',
    motion: 'wheels',
    bricks: [
      b(0, 0, 0, 4, P, 8, 'red'),
      b(0, (P + B) / 2, 3.5, 4, B, 1, 'red'),
      b(0, (P + B) / 2, 1.5, 4, P, 1, 'black', { studs: false }),
      b(0, (P + B) / 2, -0.5, 2, B, 2, 'black'),
      b(0, P / 2 + B + 0.6, -0.5, 1, B, 1, 'yellow'),
      b(1.5, (P + B) / 2, -3.5, 1, B, 1, 'red'),
      b(-1.5, (P + B) / 2, -3.5, 1, B, 1, 'red'),
      b(0, P / 2 + B + P / 2, -3.5, 4, P, 1.4, 'black'),
      b(1.2, 0.05, 4.05, 0.8, 0.4, 0.1, 'yellow', { studs: false }),
      b(-1.2, 0.05, 4.05, 0.8, 0.4, 0.1, 'yellow', { studs: false }),
    ],
    parts: [
      { name: 'front left wheel', kind: 'wheel', side: 'left', at: [2.5, -0.15, 2.6], radius: 0.95, width: 0.8 },
      { name: 'front right wheel', kind: 'wheel', side: 'right', at: [-2.5, -0.15, 2.6], radius: 0.95, width: 0.8 },
      { name: 'back left wheel', kind: 'wheel', side: 'left', at: [2.5, -0.15, -2.6], radius: 0.95, width: 0.8 },
      { name: 'back right wheel', kind: 'wheel', side: 'right', at: [-2.5, -0.15, -2.6], radius: 0.95, width: 0.8 },
    ],
  },
  {
    id: 'robot',
    name: 'Robot',
    blurb: 'Glides around. Has a turning head and two arms.',
    color: 'blue',
    motion: 'glide',
    bricks: [
      b(0.8, -2.4, 0.3, 1.2, P, 2, 'darkgray'),
      b(-0.8, -2.4, 0.3, 1.2, P, 2, 'darkgray'),
      b(0.8, -1.4, 0, 1, 1.6, 1, 'gray', { studs: false }),
      b(-0.8, -1.4, 0, 1, 1.6, 1, 'gray', { studs: false }),
      b(0, 0.6, 0, 3, 2 * B, 2, 'blue'),
      b(0, 1.0, 1.05, 1.2, P, 0.12, 'yellow', { studs: false }),
      b(0, 0.3, 1.05, 0.5, 0.5, 0.12, 'red', { studs: false }),
    ],
    parts: [
      {
        name: 'head', kind: 'hinge', pivot: [0, 1.8, 0], axis: [0, 1, 0], sign: 1, limits: [-100, 100], strength: 1,
        bricks: [
          b(0, 0.8, 0, 2, 1.6, 2, 'white', { studs: false }),
          b(0.45, 1.0, 1.02, 0.4, 0.4, 0.1, 'black', { studs: false }),
          b(-0.45, 1.0, 1.02, 0.4, 0.4, 0.1, 'black', { studs: false }),
          b(0, 0.45, 1.02, 0.9, 0.15, 0.1, 'black', { studs: false }),
          b(0, 2.0, 0, 0.25, 0.8, 0.25, 'darkgray', { studs: false }),
          b(0, 2.5, 0, 0.5, 0.5, 0.5, 'red', { studs: false }),
        ],
      },
      {
        name: 'left arm', kind: 'hinge', pivot: [1.95, 1.4, 0], axis: [1, 0, 0], sign: -1, limits: [-60, 180], strength: 1,
        bricks: [
          b(0, -0.9, 0, 0.9, 2.2, 0.9, 'blue', { studs: false }),
          b(0, -2.25, 0, 1, 0.6, 1, 'yellow', { studs: false }),
        ],
      },
      {
        name: 'right arm', kind: 'hinge', pivot: [-1.95, 1.4, 0], axis: [1, 0, 0], sign: -1, limits: [-60, 180], strength: 1,
        bricks: [
          b(0, -0.9, 0, 0.9, 2.2, 0.9, 'blue', { studs: false }),
          b(0, -2.25, 0, 1, 0.6, 1, 'yellow', { studs: false }),
        ],
      },
    ],
  },
  {
    id: 'digger',
    name: 'Digger',
    blurb: 'A yellow digger with a scoop arm that lifts and pushes.',
    color: 'yellow',
    motion: 'wheels',
    bricks: [
      b(0, 0, -0.5, 4, B, 6, 'yellow'),
      b(0, B, -1.5, 3, B, 3, 'yellow'),
      b(0, 2 * B, -1.5, 3, B, 3, 'cyan', { studs: false }),
      b(0, 2.5 * B + P / 2, -1.5, 3.4, P, 3.4, 'yellow'),
      b(1, B, -3.5, 1, B, 1, 'darkgray'),
      b(1, 2 * B, -3.5, 1, B, 1, 'darkgray', { studs: false }),
    ],
    parts: [
      { name: 'front left wheel', kind: 'wheel', side: 'left', at: [2.55, -0.3, 1.4], radius: 1.1, width: 0.9 },
      { name: 'front right wheel', kind: 'wheel', side: 'right', at: [-2.55, -0.3, 1.4], radius: 1.1, width: 0.9 },
      { name: 'back left wheel', kind: 'wheel', side: 'left', at: [2.55, -0.3, -2.4], radius: 1.1, width: 0.9 },
      { name: 'back right wheel', kind: 'wheel', side: 'right', at: [-2.55, -0.3, -2.4], radius: 1.1, width: 0.9 },
      {
        name: 'scoop', kind: 'hinge', pivot: [0, 0.6, 2.5], axis: [1, 0, 0], sign: -1, limits: [-15, 75], strength: 3,
        bricks: [
          b(1.5, 0, 1.5, 1, B, 3, 'darkgray'),
          b(-1.5, 0, 1.5, 1, B, 3, 'darkgray'),
          b(0, -0.6, 3.4, 5, P, 1.8, 'darkgray', { studs: false }),
          b(0, 0.1, 4.2, 5, 1.0, 0.2, 'darkgray', { studs: false }),
        ],
      },
    ],
  },
  {
    id: 'catapult',
    name: 'Catapult',
    blurb: 'Rolls on wheels and flings bricks with its throwing arm.',
    color: 'brown',
    motion: 'wheels',
    density: 4, // heavy base so a fast throw doesn't flip it
    wheelPower: 4,
    bricks: [
      b(0, 0, 0, 4, B, 6, 'brown'),
      b(1.5, B, 0.5, 1, B, 1, 'brown'),
      b(-1.5, B, 0.5, 1, B, 1, 'brown'),
      // axle plates, split to leave a slot the throwing arm swings through
      b(1.3, 1.5 * B + P / 2, 0.5, 1.4, P, 1, 'tan', { studs: false }),
      b(-1.3, 1.5 * B + P / 2, 0.5, 1.4, P, 1, 'tan', { studs: false }),
      b(0, B * 0.75, -1.5, 2, P, 3, 'tan'),
    ],
    parts: [
      { name: 'front left wheel', kind: 'wheel', side: 'left', at: [2.45, -0.2, 2.0], radius: 0.9, width: 0.7 },
      { name: 'front right wheel', kind: 'wheel', side: 'right', at: [-2.45, -0.2, 2.0], radius: 0.9, width: 0.7 },
      { name: 'back left wheel', kind: 'wheel', side: 'left', at: [2.45, -0.2, -2.0], radius: 0.9, width: 0.7 },
      { name: 'back right wheel', kind: 'wheel', side: 'right', at: [-2.45, -0.2, -2.0], radius: 0.9, width: 0.7 },
      {
        name: 'throwing arm', kind: 'hinge', pivot: [0, 1.25 * B + 0.5, 0.5], axis: [1, 0, 0], sign: 1, limits: [-5, 130], strength: 4, speed: 200, density: 0.3,
        bricks: [
          // arm ends where the bucket begins; the walls stand on the bucket
          // floor and the back wall fits between the side walls, so no two
          // faces share a plane (they'd flicker). Inside is 2.3 x 2.45, so a
          // 2x2 brick fits without overlapping the walls.
          b(0, 0, -2.0, 1, P, 4.4, 'tan'),
          b(0, 0.0, -5.5, 2.6, P, 2.6, 'darkgray', { bucket: true, studs: false }),
          b(1.225, 0.55, -5.5, 0.15, 0.7, 2.6, 'darkgray', { studs: false }),
          b(-1.225, 0.55, -5.5, 0.15, 0.7, 2.6, 'darkgray', { studs: false }),
          b(0, 0.55, -6.725, 2.3, 0.7, 0.15, 'darkgray', { studs: false }),
        ],
      },
    ],
  },
  {
    id: 'dino',
    name: 'Dino',
    blurb: 'A green dinosaur that glides along. Chomping jaw and a wagging tail.',
    color: 'green',
    motion: 'glide',
    bricks: [
      b(1, -2.0, 1.5, 1, 1.6, 1, 'green', { studs: false }),
      b(-1, -2.0, 1.5, 1, 1.6, 1, 'green', { studs: false }),
      b(1, -2.0, -1.5, 1, 1.6, 1, 'green', { studs: false }),
      b(-1, -2.0, -1.5, 1, 1.6, 1, 'green', { studs: false }),
      b(0, 0, 0, 3, 2 * B, 5, 'green'),
      b(0, -0.4, 0.2, 2.2, B, 4, 'lime', { studs: false }),
      b(0, B + P / 2, 1.2, 1, P, 1, 'orange'),
      b(0, B + P / 2, -0.2, 1, P, 1, 'orange'),
      b(0, B + P / 2, -1.6, 1, P, 1, 'orange'),
    ],
    parts: [
      {
        name: 'head', kind: 'hinge', pivot: [0, 1.0, 2.5], axis: [1, 0, 0], sign: -1, limits: [-30, 40], strength: 1.5,
        bricks: [
          b(0, 0.6, 1.4, 2.2, B, 3, 'green'),
          b(0.6, 1.0, 2.95, 0.3, 0.3, 0.1, 'black', { studs: false }),
          b(-0.6, 1.0, 2.95, 0.3, 0.3, 0.1, 'black', { studs: false }),
          b(0, -0.1, 2.2, 1.9, 0.2, 1.2, 'white', { studs: false }),
        ],
      },
      {
        name: 'tail', kind: 'hinge', pivot: [0, 0.2, -2.5], axis: [0, 1, 0], sign: 1, limits: [-50, 50], strength: 1,
        bricks: [
          b(0, 0, -1.4, 1.8, B, 2.8, 'green'),
          b(0, -0.2, -3.7, 1, 0.8, 1.8, 'green', { studs: false }),
        ],
      },
    ],
  },
];

export const LIBRARY_BY_ID = Object.fromEntries(LIBRARY.map((d) => [d.id, d]));

// Local-space bounding box of a model at rest: { min: [x,y,z], max: [x,y,z] }.
export function modelBounds(def) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const grow = (c, half) => {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], c[k] - half[k]); max[k] = Math.max(max[k], c[k] + half[k]); }
  };
  for (const br of def.bricks) grow(br.at, br.size.map((s) => s / 2));
  for (const p of def.parts) {
    if (p.kind === 'wheel') grow(p.at, [p.width / 2, p.radius, p.radius]);
    else for (const br of p.bricks) grow(br.at.map((v, k) => v + p.pivot[k]), br.size.map((s) => s / 2));
  }
  return { min, max };
}

// Lowest point of a model, for placing it on the ground.
export function modelBottom(def) {
  return modelBounds(def).min[1];
}

// Things you can add from the library that aren't models: balls, game pieces
// (goals, rings, a scoreboard), buildings and props, and single bricks, for
// making up games like Calvinball from a blank world. A model is a chassis
// with parts; these are props, loose-brick builds and balls, built by
// build(world, {x, z, yaw, id, name}). bounds is the box (around the spot it's
// built at, standing on the ground) used to find clear ground for it.
// behaviors come already taught, like a premade world's.
import { BRICK_H as B, PLATE_H as P } from './bricks.js';
import * as Props from './props.js';
import { SCOREBOARD, ballBehavior, goalFor } from './games.js';
import { MACHINE_OBJECTS } from './machines.js';

const DEG = Math.PI / 180;
const box = (x, y, z, w, h, d, color, extra = {}) => ({ at: [x, y, z], size: [w, h, d], color, ...extra });
const around = (hx, h, hz) => ({ min: [-hx, 0, -hz], max: [hx, h, hz] });

// Where a spot in an object's own space lands in the world.
const turned = (x, z, yaw) => {
  const c = Math.cos(yaw * DEG), s = Math.sin(yaw * DEG);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
};

function ball(id, name, blurb, { radius, color, density = 0.2, bounce = 0.6, damping = 0.1, spots = true, behaviors }) {
  return {
    id, name, blurb, color, category: 'balls', tags: 'ball', bounds: around(radius, 2 * radius, radius), behaviors,
    examples: ['When the red car bumps it, tell everyone "red scores".', 'Forever, if it is touching the ground, jump a little.', 'When I press space, push it forward hard.'],
    build: (w, { x, z, id: key, name: n }) => w.addBall({ radius, color, x, y: radius + 0.05, z, name: n, thingId: key, density, bounce, damping, spots }),
  };
}

// A goal of bricks, its mouth facing forward (+z), with a see-through net
// inside that feels the ball roll in (the posts don't count). One heavy
// piece: a ball can't move it, a car can knock it over.
function goalObject(team, other) {
  const mouth = 6, top = 4 * B;
  const boxes = [];
  for (const zz of [-0.5, -3.5]) {
    for (const xs of [-1, 1]) for (let i = 0; i < 4; i++) boxes.push(box(xs * (mouth + 0.5), B / 2 + i * B, zz, 1, B, 1, i % 2 ? team : 'white'));
    boxes.push(box(0, top + B / 2, zz, 2 * mouth + 2, B, 1, team));
  }
  for (const xs of [-1, 1]) {
    boxes.push(box(xs * (mouth + 0.5), top + B / 2, -2, 1, B, 2, 'white'));
    boxes.push(box(xs * (mouth + 0.5), top / 2, -2, 1, top, 2, 'white', { glass: true, studs: false }));
  }
  boxes.push(box(0, top / 2, -3.5, 2 * mouth, top, 1, 'white', { glass: true, studs: false }));
  boxes.push(box(0, (top + 0.05) / 2, -2, 2 * mouth, top - 0.05, 2, team, { glass: true, studs: false, sensor: true })); // the net: where a goal counts
  const Team = team === 'red' ? 'Red' : 'Blue';
  return {
    id: `${team}-goal`, name: `${Team} Goal`, tags: 'net score', color: team, category: 'game', bounds: { min: [-mouth - 1, 0, -4], max: [mouth + 1, top + B, 0] },
    blurb: `${Team}'s goal, made of bricks. When a ball rolls into its net, it tells everyone "${other} scores".`,
    examples: [`When a ball rolls in, play yay and say "Goal!"`, 'Forever, move 6 studs slowly, then turn around.'],
    behaviors: [goalFor(other, team, '"ball"')],
    build: (w, { x, z, yaw, id, name }) => w.addStatic({ kind: 'goal', name, color: team, x, z, yaw, thingId: id, boxes, dynamic: true, density: 1.5 }),
  };
}

// An octagon of bricks standing on one side, big enough to kick a ball or
// drive a car through; a hidden sensor fills the hole.
function ring(id, name, apothem, blurb) {
  const t = 1.2, side = 2 * apothem * Math.tan(22.5 * DEG), cy = apothem + t / 2;
  const colors = ['red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'blue', 'purple'];
  const boxes = [];
  for (let k = 0; k < 8; k++) {
    const a = k * 45 * DEG;
    boxes.push(box(Math.sin(a) * apothem, cy - Math.cos(a) * apothem, 0, side + t * Math.tan(22.5 * DEG), t, 1, colors[k], { rot: [0, 0, a], studs: false }));
  }
  boxes.push(box(0, P / 2, 0, side + 2, P, 6, 'darkgray')); // a foot to stand on
  const h = apothem - t / 2 - 0.3;
  for (const a of [0, 45 * DEG]) boxes.push(box(0, cy, 0, 2 * h, 2 * h, 0.4, 'white', { rot: [0, 0, a], sensor: true, hidden: true }));
  const r = apothem / Math.cos(22.5 * DEG) + t;
  return {
    id, name, blurb, tags: 'hoop octagon', color: 'yellow', category: 'game', bounds: { min: [-r, 0, -3], max: [r, cy + r, 3] },
    examples: ['When the ball goes through, tell everyone "red scores".', 'Forever, turn slowly.'],
    behaviors: [{
      title: 'Ring Ding',
      text: 'When anything goes through, play ding.',
      summary: ['When anything goes through the ring: play ding'],
      code: '// The hole in the middle feels whatever goes through it.\nonTouch(null, () => {\n  play("ding");\n});',
    }],
    build: (w, { x, z, yaw, id: key, name: n }) => w.addStatic({ kind: 'ring', name: n, color: 'yellow', x, z, yaw, thingId: key, boxes, dynamic: true }),
  };
}

function brick(w, d, color, { h = B, name } = {}) {
  const plate = h === P;
  return {
    id: `brick-${w}x${d}${plate ? '-plate' : ''}`, tags: 'brick', name: name ?? `${w}x${d} ${plate ? 'Plate' : 'Brick'}`, color, category: 'bricks',
    blurb: `One loose ${w} by ${d} ${plate ? 'plate' : 'brick'}, to build with, stack or knock around.`,
    bounds: around(Math.max(w, d) / 2 * 1.42, h, Math.max(w, d) / 2 * 1.42), // any way it's turned
    examples: ['When I press space, jump.', 'When it bumps into the ball, change color to random.'],
    build: (wd, { x, z, yaw, id, name: n }) => wd.addBrick({ dims: [w, h, d], color, x, y: h / 2, z, yaw, thingId: id, name: n, kind: 'brick' }),
  };
}

export const OBJECTS = [
  // ---- balls
  ball('soccer-ball', 'Soccer Ball', 'A ball for kicking around. It already knows the game: players kick it, and after a goal it goes back to where it started.', { radius: 1.5, color: 'white', behaviors: [ballBehavior({ home: 'start' })] }),
  ball('bouncy-ball', 'Bouncy Ball', 'A small, very bouncy ball.', { radius: 0.9, color: 'lime', bounce: 0.95, spots: false }),
  ball('golf-ball', 'Golf Ball', 'A tiny ball that rolls a long way.', { radius: 0.5, color: 'white', damping: 0.35, spots: false }),
  ball('bowling-ball', 'Bowling Ball', 'Small but heavy: it knocks things over.', { radius: 1.1, color: 'purple', density: 3, bounce: 0.2, spots: false }),
  ball('beach-ball', 'Beach Ball', 'Big and light: it floats along and bounces off everything.', { radius: 2.5, color: 'pink', density: 0.04, bounce: 0.8, damping: 0.3 }),
  ball('giant-ball', 'Giant Ball', 'A ball taller than a minifigure. Good luck kicking it.', { radius: 4, color: 'orange', density: 0.1 }),

  // ---- game pieces
  goalObject('red', 'blue'),
  goalObject('blue', 'red'),
  {
    id: 'scoreboard', tags: 'score points screen', name: 'Scoreboard', color: 'black', category: 'game', bounds: { min: [-13.5, 0, -2], max: [13.5, 18.5, 2] },
    blurb: 'A big scoreboard. It keeps the score: anything can tell everyone "red scores" or "blue scores". First to 5 wins; R starts again.',
    examples: ['Make the first to 3 win.', 'When it hears "game over", play tada.'],
    behaviors: [SCOREBOARD],
    build: (w, { x, z, yaw, id, name }) => Props.scoreboard(w, id, x, z, { yaw, name }),
  },
  {
    id: 'sign', tags: 'screen text message', name: 'Sign', color: 'black', category: 'game', bounds: { min: [-4, 0, -1.5], max: [4, 7.2, 1.5] },
    blurb: 'A little sign with a screen: teach it to show() a message, a countdown or a score.',
    examples: ['At the start, show "Welcome!"', 'Count down from 10 on the screen, then show "GO!"', 'When it hears "red scores", show "RED!" for 2 seconds.'],
    build: (w, { x, z, yaw, id, name }) => w.addStatic({
      kind: 'sign', name, color: 'black', x, z, yaw, thingId: id, dynamic: true,
      boxes: [
        box(0, P / 2, 0, 3, P, 3, 'darkgray'),
        box(0, P + 2, 0, 1, 4, 1, 'gray', { studs: false }),
        box(0, P + 5.5, 0, 8, 3, 0.6, 'black', { studs: false, screen: { text: 'Hello!' } }),
      ],
    }),
  },
  ring('big-ring', 'Big Ring', 5, 'A rainbow octagon of bricks standing on its edge, big enough to kick a ball through. It dings when something goes through.'),
  ring('giant-ring', 'Giant Ring', 8, 'A huge rainbow octagon to drive a car through. It dings when something goes through.'),
  {
    id: 'traffic-cone', tags: 'course obstacle', name: 'Traffic Cone', color: 'orange', category: 'game', bounds: around(0.8, 1.7, 0.8),
    blurb: 'An orange cone of loose bricks. Line some up to make a course; knock them over and Reset stands them up.',
    examples: ['When the ball bumps into it, play bonk.'],
    build: (w, { x, z, id, name }) => Props.cone(w, id, x, z, { name }),
  },
  {
    id: 'flag', tags: 'finish corner', name: 'Flag', color: 'red', category: 'game', bounds: { min: [-0.8, 0, -2.2], max: [0.8, 7, 0.8] },
    blurb: 'A flag on a pole, for marking a finish line or a corner. It can be knocked over.',
    examples: ['When the race car touches it, play yay and say "Finish!"'],
    build: (w, { x, z, id, name }) => Props.flagPole(w, id, x, z, { name, dynamic: true }),
  },

  // ---- buildings and props
  {
    id: 'little-house', tags: 'home building', name: 'Little House', color: 'red', category: 'buildings', bounds: around(4.5, 8, 4.5),
    blurb: 'A little house of loose bricks with a red roof. It stands until something crashes into it.',
    examples: ['When the ball hits it, explode.'],
    build: (w, { x, z, id, name }) => Props.house(w, id, x, z, 'tan', 'red', { name }),
  },
  {
    id: 'cottage', tags: 'house home building', name: 'Cottage', color: 'blue', category: 'buildings', bounds: around(4.5, 8, 4.5),
    blurb: 'A white cottage of loose bricks with a blue roof.',
    examples: ['When the ball hits it, explode.'],
    build: (w, { x, z, id, name }) => Props.house(w, id, x, z, 'white', 'blue', { name }),
  },
  {
    id: 'brick-tower', name: 'Brick Tower', color: 'yellow', category: 'buildings', bounds: around(2, 12, 2),
    blurb: 'A rainbow tower of loose bricks, just right for knocking down.',
    examples: ['When the ball knocks it, play strike.'],
    build: (w, { x, z, id, name }) => Props.tower(w, id, x, z, { layers: 10, name }),
  },
  {
    id: 'brick-wall', tags: 'barrier', name: 'Brick Wall', color: 'red', category: 'buildings', bounds: around(4.5, 3 * B, 4.5),
    blurb: 'A low wall of loose bricks, three rows high, to block a path or smash through.',
    examples: ['When the car bumps it, say "Crash!"'],
    build: (w, { x, z, yaw, id, name }) => {
      const at = turned(x, z, yaw);
      for (let r = 0; r < 3; r++) {
        const pieces = r % 2 ? [-3, 1, 3.5] : [-2, 2]; // centers, staggered like real bricks
        const lens = r % 2 ? [2, 4, 1] : [4, 4];
        pieces.forEach((c, i) => {
          const [wx, wz] = at(c, 0);
          w.addBrick({ dims: [lens[i], B, 1], color: r === 2 ? 'white' : 'red', x: wx, y: B / 2 + r * B, z: wz, yaw, kind: 'wall', name, thingId: id, sleeping: true });
        });
      }
    },
  },
  {
    id: 'fence', tags: 'pen', name: 'Fence', color: 'brown', category: 'buildings', bounds: around(4.5, 2, 4.5),
    blurb: 'A short wooden fence. It falls over if something runs into it.',
    examples: ['Forever, if the ball is close, play woof.'],
    build: (w, { x, z, yaw, id, name }) => Props.fence(w, id, x, z, 6, { yaw: yaw + 90, name, dynamic: true }), // across the way it faces
  },
  {
    id: 'long-fence', tags: 'pen', name: 'Long Fence', color: 'brown', category: 'buildings', bounds: around(7.5, 2, 7.5),
    blurb: 'A long wooden fence, for penning things in or marking out a field.',
    examples: ['When the cow touches it, say "Moo!"'],
    build: (w, { x, z, yaw, id, name }) => Props.fence(w, id, x, z, 12, { yaw: yaw + 90, name, dynamic: true }),
  },
  {
    id: 'ramp', tags: 'jump', name: 'Ramp', color: 'gray', category: 'buildings', bounds: { min: [-4, 0, -6.5], max: [4, 2.5, 5] },
    blurb: 'A ramp to jump a car or roll a ball off. It stays where you put it.',
    examples: ['When the car touches it, play whoosh.'],
    build: (w, { x, z, yaw, id, name }) => w.addStatic({
      kind: 'ramp', name, color: 'gray', x, z, yaw, thingId: id, // the low end in front, toward you
      boxes: [box(0, 1.15, 0, 8, 0.4, 10, 'gray', { rot: [0.24, 0, 0], studs: false }), box(0, 1.25, -5.7, 8, 2.5, 1.6, 'darkgray', { studs: false })],
    }),
  },
  {
    id: 'big-ramp', tags: 'jump', name: 'Big Ramp', color: 'orange', category: 'buildings', bounds: { min: [-5, 0, -9.8], max: [5, 4.6, 8.3] },
    blurb: 'A long, steep ramp for big jumps.',
    examples: ['When the car touches it, play whoosh.'],
    build: (w, { x, z, yaw, id, name }) => {
      const len = 16, height = 4.4, a = Math.atan2(height, len), slab = Math.hypot(len, height);
      w.addStatic({
        kind: 'ramp', name, color: 'orange', x, z, yaw, thingId: id,
        boxes: [
          box(0, height / 2 - 0.25, 0, 10, 0.5, slab, 'orange', { rot: [a, 0, 0], studs: false }),
          box(0, (height - 0.5) / 2, -len / 2 - 0.9, 10, height - 0.5, 1.6, 'darkgray', { studs: false }),
        ],
      });
    },
  },
  {
    id: 'platform', tags: 'block jump', name: 'Platform', color: 'orange', category: 'buildings', bounds: around(4, 2 * B, 4),
    blurb: 'A big flat block, two bricks high, to jump up onto or stand things on. It stays where you put it.',
    examples: ['Forever, move 6 studs, wait 1 second, move back 6 studs, wait 1 second.'],
    build: (w, { x, z, yaw, id, name }) => Props.platform(w, id, x, 2 * B, z, 8, 8, { name, thickness: 2 * B, yaw }),
  },
  {
    id: 'bench', name: 'Bench', color: 'red', category: 'buildings', bounds: around(4.5, 3.2, 4.5),
    blurb: 'A team bench for the sidelines.',
    examples: ['When the ball hits it, say "Hey, watch it!"'],
    build: (w, { x, z, yaw, id, name }) => Props.bench(w, id, x, z, { yaw, name }),
  },
  {
    id: 'stadium-light', tags: 'lamp lamppost', name: 'Stadium Light', color: 'gray', category: 'buildings', bounds: around(2.6, 17, 2.6),
    blurb: 'A tall stadium light. Knock it over and it comes crashing down.',
    examples: ['When the ball hits it, play crash.'],
    build: (w, { x, z, id, name }) => Props.lightTower(w, id, x, z, { name }),
  },
  {
    id: 'tree', tags: 'nature', name: 'Tree', color: 'green', category: 'buildings', bounds: around(3, 8.5, 3),
    blurb: 'A tree of loose bricks. Smash into it and it falls apart.',
    examples: ['When the ball hits it, drop a green brick on top.'],
    build: (w, { x, z, id, name }) => Props.tree(w, id, x, z, { name, loose: true }),
  },

  // ---- single bricks
  brick(1, 1, 'yellow'),
  brick(1, 2, 'orange'),
  brick(1, 4, 'green'),
  brick(2, 2, 'blue'),
  brick(2, 4, 'red'),
  brick(2, 8, 'purple'),
  brick(4, 4, 'lime'),
  brick(4, 8, 'gray', { h: P }),
  brick(8, 8, 'white', { h: P, name: '8x8 Plate' }),
  ...MACHINE_OBJECTS,
];

export const OBJECTS_BY_ID = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));

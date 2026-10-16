// Mechanical toys for building chain-reaction machines: things that swing
// freely (a see-saw, a pendulum, a bell), things that spin about each axis (a
// turntable, a windmill, a paddle wheel, conveyor rollers), things that slide
// (a spring pad, a lift, a button) and a flipper. Each is a model, so it's
// programmable like any other, and comes already knowing one or two things.
//
// What makes them combine: they move whatever touches them, and they talk
// with messages. A button tells everyone "go" when something lands on it,
// so "When it hears go, launch" wires a spring pad to it; a bell rings and
// tells everyone "ding". Put a ball at one end and the chain does the rest.
//
// All of them glide (they stay upright and don't slide off when bumped) and
// sit on heavy bases. Part kinds are described in library.js; these add:
//   free: true   a hinge with no motor holding it: it swings however it's
//                pushed. turnTo pushes it there, then lets go.
//   slider       a part that slides along `axis` within `limits` (studs).
//                `spring` ones come back to 0 after a launch.
import { BRICK_H as B, PLATE_H as P } from './bricks.js';

const b = (x, y, z, w, h, d, color, extra = {}) => ({ at: [x, y, z], size: [w, h, d], color, ...extra });
const flat = { studs: false };

// A switch for a spinning part: space starts and stops it.
const spinToggle = (part, speed, { on = false, title = 'Spin' } = {}) => ({
  title,
  keys: { ' ': 'spin' },
  text: `When I press space, start or stop spinning the ${part}.${on ? ' Start spinning.' : ''}`,
  summary: [...(on ? [`At the start: spin the ${part}`] : []), `When space is pressed: start or stop the ${part}`],
  code: `let spinning = ${on};
${on ? `part("${part}").spin(${speed});\n` : ''}onKey(" ", () => {
  spinning = !spinning;
  part("${part}").spin(spinning ? ${speed} : 0);
});`,
});

const LAUNCH = {
  title: 'Launch',
  keys: { ' ': 'launch' },
  text: 'When I press space, launch the pad and play boing.',
  summary: ['When space is pressed: shoot the pad up, boing, and back down'],
  code: 'onKey(" ", async () => {\n  play("boing");\n  await part("pad").slideTo(3);\n  await part("pad").slideTo(0);\n});',
};

const SEESAW = {
  id: 'seesaw', name: 'See-Saw', category: 'machines', color: 'yellow',
  blurb: 'A long plank on a post that tips freely. Drop something on one end to fling what\'s on the other, or slam it with space.',
  examples: ['When I press space, swing the plank to 25.', 'When it hears "go", swing the plank to -25.', 'When something lands on it, play boing.'],
  motion: 'glide', density: 4,
  bricks: [
    b(0, P / 2, 0, 4, P, 4, 'darkgray'),
    b(0, P + 1.25, 0, 1.6, 2.5, 1.6, 'gray', flat),
    b(0, P + 2.6, 0, 2.4, 0.2, 1, 'darkgray', flat),
  ],
  parts: [{
    // the front end goes up for positive angles; it touches down at about ±25
    name: 'plank', kind: 'hinge', free: true, drag: 0.1, damping: 0.2, pivot: [0, 3.2, 0], axis: [1, 0, 0], sign: -1, limits: [-25, 25], strength: 6, speed: 360, density: 0.4,
    bricks: [
      b(0, 0.2, 0, 2, P, 14, 'yellow'),
      b(0, 0.9, 6.75, 2, 1.0, 0.5, 'red', flat),
      b(0, 0.9, -6.75, 2, 1.0, 0.5, 'blue', flat),
    ],
  }],
  behaviors: [{
    title: 'Slam',
    keys: { ' ': 'front up', b: 'back up' },
    text: 'When I press space, slam the front end up. When I press b, slam the back end up.',
    summary: ['When space is pressed: tip the front end up fast', 'When b is pressed: tip the back end up fast'],
    code: 'onKey(" ", () => {\n  play("whoosh");\n  part("plank").turnTo(25);\n});\nonKey("b", () => {\n  play("whoosh");\n  part("plank").turnTo(-25);\n});',
  }],
};

const SPRING_PAD = {
  id: 'spring-pad', name: 'Spring Pad', category: 'machines', color: 'lime',
  blurb: 'A pad on a spring that shoots straight up and throws whatever is sitting on it.',
  examples: ['When I press space, launch.', 'When it hears "go", launch the pad.', 'When something lands on it, launch.'],
  motion: 'glide', density: 4,
  bricks: [
    b(0, 0.6, 0, 4, 1.2, 4, 'darkgray', flat),
    b(0, 1.25, 1.75, 4, 0.1, 0.5, 'yellow', flat), // warning stripes
    b(0, 1.25, -1.75, 4, 0.1, 0.5, 'yellow', flat),
  ],
  parts: [{
    name: 'pad', kind: 'slider', spring: true, about: 'a spring pad: slideTo(3) then slideTo(0) launches what is on it', pivot: [0, 1.3, 0], axis: [0, 1, 0], limits: [0, 3], speed: 36, strength: 5, density: 0.6,
    bricks: [
      b(0, 0.2, 0, 3.4, P, 3.4, 'lime'),
      b(0, -0.6, 0, 1.2, 1.1, 1.2, 'gray', { shape: 'round', studs: false }), // the spring, hidden in the base until it pops up
    ],
  }],
  behaviors: [LAUNCH],
};

const TURNTABLE = {
  id: 'turntable', name: 'Turntable', category: 'machines', color: 'blue',
  blurb: 'A big round table that spins flat, like a merry-go-round, with two posts that sweep things around.',
  examples: ['When I press space, spin the table.', 'When it hears "go", spin the table fast for 3 seconds.', 'Forever, spin the table slowly.'],
  motion: 'glide', density: 4,
  bricks: [b(0, 0.3, 0, 3, 0.6, 3, 'darkgray', { shape: 'round' })],
  parts: [{
    name: 'table', kind: 'hinge', free: true, drag: 2, damping: 0.05, density: 0.2, pivot: [0, 0.6, 0], axis: [0, 1, 0], sign: 1, limits: [-180, 180], strength: 12, friction: 1.2,
    bricks: [
      b(0, 0.2, 0, 10, P, 10, 'blue', { shape: 'round', studs: false }),
      b(3.6, 1.0, 0, 1, 1.2, 1, 'yellow', { shape: 'round' }),
      b(-3.6, 1.0, 0, 1, 1.2, 1, 'yellow', { shape: 'round' }),
      b(0, 0.55, 0, 1.2, 0.3, 1.2, 'white', { shape: 'round' }),
    ],
  }],
  behaviors: [spinToggle('table', 120)],
};

const WINDMILL = {
  id: 'windmill', name: 'Windmill', category: 'machines', color: 'white',
  blurb: 'A windmill whose sails turn on an axle pointing forward, sweeping down low enough to bat things away.',
  examples: ['When I press space, spin the sails fast.', 'When it hears "go", spin the sails backwards.', 'When I press s, stop.'],
  motion: 'glide', density: 4,
  bricks: [
    b(0, P / 2, 0, 4, P, 4, 'darkgray'),
    b(0, P + 2.6, 0, 2, 5.2, 2, 'white'),
    b(0, 6.0, 0, 2.6, 0.8, 2.6, 'red', flat),
    b(0, 6.7, 0, 1.6, 0.6, 1.6, 'red', flat),
  ],
  parts: [{
    name: 'sails', kind: 'hinge', free: true, drag: 1, damping: 0.3, pivot: [0, 5, 1.4], axis: [0, 0, 1], sign: 1, limits: [-180, 180], strength: 3,
    bricks: [
      b(0, 0, 0.3, 1.2, 1.2, 0.6, 'gray', { shape: 'round', axis: 'z', studs: false }),
      b(0, 2.5, 0.3, 0.9, 3.8, 0.25, 'white', flat),
      b(0, -2.5, 0.3, 0.9, 3.8, 0.25, 'white', flat),
      b(2.5, 0, 0.3, 3.8, 0.9, 0.25, 'red', flat),
      b(-2.5, 0, 0.3, 3.8, 0.9, 0.25, 'red', flat),
    ],
  }],
  behaviors: [spinToggle('sails', 90, { on: true })],
};

const PADDLE_WHEEL = {
  id: 'paddle-wheel', name: 'Paddle Wheel', category: 'machines', color: 'orange',
  blurb: 'Four paddles on an axle across a frame. Spinning, they scoop up anything that rolls in and fling it out the front.',
  examples: ['When I press space, spin the paddles.', 'When something touches it, spin the paddles fast for 2 seconds.', 'When it hears "go", spin the paddles backwards.'],
  motion: 'glide', density: 4,
  bricks: [
    b(2.5, 0.2, 0, 1, P, 4, 'brown'),
    b(-2.5, 0.2, 0, 1, P, 4, 'brown'),
    b(2.5, 1.9, 0, 1, 3.0, 1, 'brown', flat),
    b(-2.5, 1.9, 0, 1, 3.0, 1, 'brown', flat),
  ],
  parts: [{
    // positive spin sweeps the bottom paddle forward
    name: 'paddles', kind: 'hinge', free: true, drag: 1, damping: 0.3, pivot: [0, 2.6, 0], axis: [1, 0, 0], sign: -1, limits: [-180, 180], strength: 4,
    bricks: [
      b(0, 0, 0, 4, 0.7, 0.7, 'gray', { shape: 'round', axis: 'x', studs: false }),
      b(0, 1.3, 0, 3.6, 2.0, 0.3, 'orange', flat),
      b(0, -1.3, 0, 3.6, 2.0, 0.3, 'orange', flat),
      b(0, 0, 1.3, 3.6, 0.3, 2.0, 'yellow', flat),
      b(0, 0, -1.3, 3.6, 0.3, 2.0, 'yellow', flat),
    ],
  }],
  behaviors: [spinToggle('paddles', 300)],
};

const PENDULUM = {
  id: 'pendulum', name: 'Pendulum', category: 'machines', color: 'red',
  blurb: 'A heavy hammer hanging from a tall frame. Pull it back and let go, and it swings through whatever is in front.',
  examples: ['When I press space, swing the hammer to -80.', 'When it hears "go", pull the hammer back and let go.', 'When it bumps into a brick, play bonk.'],
  motion: 'glide', density: 4,
  bricks: [
    b(3, P / 2, 0, 1.4, P, 6, 'darkgray'),
    b(-3, P / 2, 0, 1.4, P, 6, 'darkgray'),
    b(3, 4.7, 0, 1, 8.6, 1, 'gray', flat),
    b(-3, 4.7, 0, 1, 8.6, 1, 'gray', flat),
    b(0, 9.4, 0, 7, 0.8, 1, 'darkgray', flat),
  ],
  parts: [{
    // positive swings the hammer forward; it hangs straight down at 0
    name: 'hammer', kind: 'hinge', free: true, drag: 0.02, damping: 0.05, pivot: [0, 8.8, 0], axis: [1, 0, 0], sign: -1, limits: [-110, 110], strength: 3, speed: 150,
    bricks: [
      b(0, -3.6, 0, 0.35, 7.2, 0.35, 'gray', { shape: 'bar', studs: false }),
      b(0, -7.6, 0, 2, 1.6, 2.4, 'red', { density: 3, studs: false }),
    ],
  }],
  behaviors: [{
    title: 'Pull Back and Let Go',
    keys: { ' ': 'swing' },
    text: 'When I press space, pull the hammer back and let it go.',
    summary: ['When space is pressed: pull the hammer back, then let it swing'],
    code: 'onKey(" ", async () => {\n  await part("hammer").turnTo(-80);\n  play("whoosh");\n});',
  }],
};

const FLIPPER = {
  id: 'flipper', name: 'Flipper', category: 'machines', color: 'red',
  blurb: 'A pinball flipper: a bat that whacks a ball out the front when you press space.',
  examples: ['When I press space, flip.', 'When the ball touches it, flip.', 'When it hears "go", flip twice.'],
  motion: 'glide', density: 6,
  bricks: [
    b(0, 0.3, 0, 2, 0.6, 2, 'darkgray', { shape: 'round' }),
    b(0, 0.7, 0, 1, 0.2, 1, 'yellow', { shape: 'round' }),
  ],
  parts: [{
    // rests pointing to the right; positive swings it toward the front
    name: 'bat', kind: 'hinge', pivot: [0, 1.2, 0], axis: [0, 1, 0], sign: 1, limits: [-10, 75], strength: 4, speed: 900,
    bricks: [b(-2.4, 0, 0, 4.4, 1, 1, 'red', flat), b(0, 0.02, 0, 1.3, 1.16, 1.3, 'red', { shape: 'round' })],
  }],
  behaviors: [{
    title: 'Flip',
    keys: { ' ': 'flip' },
    text: 'When I press space, flip the bat.',
    summary: ['When space is pressed: flip the bat forward and back'],
    code: 'onKey(" ", async () => {\n  play("whiz");\n  await part("bat").turnTo(70);\n  await wait(0.15);\n  await part("bat").turnTo(0);\n});',
  }],
};

const LIFT = {
  id: 'lift', name: 'Lift', category: 'machines', color: 'yellow',
  blurb: 'A platform that rides up and down a tall wall: carry a ball up high to start a machine.',
  examples: ['When I press the up arrow, raise the platform. When I press the down arrow, lower the platform.', 'When it hears "go", raise the platform 6 studs.'],
  motion: 'glide', density: 4,
  bricks: [
    b(0, P / 2, 0, 5, P, 5, 'darkgray'),
    b(0, P + 4.6, -2.15, 4.8, 9.2, 0.6, 'yellow', flat),
    b(2.15, P + 4.6, -1.6, 0.5, 9.2, 0.5, 'black', flat),
    b(-2.15, P + 4.6, -1.6, 0.5, 9.2, 0.5, 'black', flat),
  ],
  parts: [{
    name: 'platform', kind: 'slider', about: 'a lift: slideTo(8) is the top', pivot: [0, 0.8, 0.3], axis: [0, 1, 0], limits: [0, 8], speed: 3, strength: 4,
    bricks: [
      b(0, 0, 0, 3.6, P, 3.6, 'gray'),
      b(1.65, 0.4, 0, 0.3, 0.4, 3.6, 'gray', flat),
      b(-1.65, 0.4, 0, 0.3, 0.4, 3.6, 'gray', flat),
    ],
  }],
  behaviors: [{
    title: 'Up and Down',
    keys: { ArrowUp: 'up', ArrowDown: 'down' },
    text: 'When I press the up arrow, raise the platform. When I press the down arrow, lower the platform.',
    summary: ['When ↑ is pressed: ride up to the top', 'When ↓ is pressed: ride back down'],
    code: 'onKey("ArrowUp", () => part("platform").slideTo(8));\nonKey("ArrowDown", () => part("platform").slideTo(0));',
  }],
};

const ROLLERS = [-6, -4, -2, 0, 2, 4, 6];
const CONVEYOR = {
  id: 'conveyor', name: 'Conveyor', category: 'machines', color: 'gray',
  blurb: 'A row of rollers between two rails that carry whatever is on them forward. Space stops and starts them.',
  examples: ['When I press space, spin the rollers backwards.', 'When it hears "go", spin the rollers fast.', 'When I press s, stop the rollers.'],
  motion: 'glide', density: 4,
  bricks: [
    b(2.4, 1.1, 0, 0.6, 2.2, 14.4, 'darkgray', flat),
    b(-2.4, 1.1, 0, 0.6, 2.2, 14.4, 'darkgray', flat),
    ...ROLLERS.filter((_, i) => i % 2 === 0).map((z) => b(0, 0.25, z, 4.2, 0.5, 0.6, 'darkgray', flat)),
  ],
  // positive spin moves the tops of the rollers forward
  parts: ROLLERS.map((z, i) => ({
    name: `roller ${i + 1}`, kind: 'hinge', free: true, carry: 0.6, drag: 1, damping: 0.3, pivot: [0, 1.3, z], axis: [1, 0, 0], sign: 1, limits: [-180, 180], strength: 2, friction: 1.5,
    bricks: [b(0, 0, 0, 4.2, 1.2, 1.2, i % 2 ? 'gray' : 'white', { shape: 'round', axis: 'x', studs: false })],
  })),
  behaviors: [spinToggle('rollers', 360, { on: true, title: 'Run' })],
};

const BUTTON = {
  id: 'button', name: 'Button', category: 'machines', color: 'red',
  blurb: 'A big button on the ground. When anything lands on it, it clicks and tells everyone "go".',
  examples: ['When something touches it, tell everyone "go".', 'When I press space, tell everyone "go".', 'When something touches it, play tada.'],
  motion: 'glide', density: 6,
  bricks: [b(0, 0.25, 0, 3.2, 0.5, 3.2, 'darkgray', flat)],
  parts: [{
    name: 'button', kind: 'slider', about: 'a button: slideTo(-0.3) presses it in', pivot: [0, 0.75, 0], axis: [0, 1, 0], limits: [-0.3, 0], speed: 4, strength: 2,
    bricks: [b(0, 0, 0, 2.2, 0.5, 2.2, 'red', { shape: 'round' })],
  }],
  behaviors: [{
    title: 'Tell Everyone Go',
    keys: { ' ': 'go' },
    text: 'When something lands on it (or I press space), press in, play beep and tell everyone "go".',
    summary: ['When anything touches it, or space is pressed: click in and tell everyone "go" (then wait a second)'],
    code: `let ready = true;
async function press() {
  if (!ready) return;
  ready = false;
  play("beep");
  broadcast("go");
  await part("button").slideTo(-0.3);
  await wait(1);
  await part("button").slideTo(0);
  ready = true;
}
onTouch(null, press);
onKey(" ", press);`,
  }],
};

const BELL = {
  id: 'bell', name: 'Bell', category: 'machines', color: 'yellow',
  blurb: 'A bell hanging low in a frame. Roll or throw something into it and it swings, rings and tells everyone "ding": a good end for a machine.',
  examples: ['When something touches it, play tada and say "We did it!"', 'When I press space, ring.', 'When it hears "ding", play yay.'],
  motion: 'glide', density: 4,
  bricks: [
    b(2.2, P / 2, 0, 1.2, P, 3, 'darkgray'),
    b(-2.2, P / 2, 0, 1.2, P, 3, 'darkgray'),
    b(2.2, 2.5, 0, 0.8, 4.2, 0.8, 'brown', flat),
    b(-2.2, 2.5, 0, 0.8, 4.2, 0.8, 'brown', flat),
    b(0, 4.9, 0, 5.2, 0.6, 1, 'brown', flat),
  ],
  parts: [{
    name: 'bell', kind: 'hinge', free: true, drag: 1, damping: 1.2, pivot: [0, 4.5, 0], axis: [1, 0, 0], sign: -1, limits: [-60, 60], strength: 2,
    bricks: [
      b(0, -0.4, 0, 0.6, 0.6, 0.6, 'gray', { shape: 'round', studs: false }),
      b(0, -1.3, 0, 1.6, 1.2, 1.6, 'yellow', { shape: 'round', studs: false }),
      b(0, -2.4, 0, 2.6, 1.0, 2.6, 'yellow', { shape: 'round', studs: false }),
    ],
  }],
  behaviors: [{
    title: 'Ring',
    keys: { ' ': 'ring' },
    text: 'When something hits it (or I press space), ring, swing and tell everyone "ding". The same thing can only ring it again after 10 seconds.',
    summary: ['When anything touches it, or space is pressed: ring the bell and tell everyone "ding"', 'Something that just rang it has to wait 10 seconds to ring it again'],
    code: `let ready = true;
let last = null; // what rang it last: a ball resting against it doesn't keep ringing it
async function ring(id) {
  if (!ready || id === last) return;
  ready = false;
  last = id;
  play("bell");
  broadcast("ding");
  await part("bell").wiggle(2);
  ready = true;
  await wait(10);
  if (last === id) last = null;
}
onTouch(null, (what) => ring(what.id));
onKey(" ", () => ring("space"));`,
  }],
};

// A row of dominoes standing on end, from (x, z) toward the front (yaw 0 is
// +z): loose tiles asleep until the first one is pushed.
export function dominoes(world, id, x, z, { count = 10, yaw = 0, gap = 1.8, name = 'Dominoes' } = {}) {
  const colors = ['red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'blue', 'purple'];
  const s = Math.sin(yaw * Math.PI / 180), c = Math.cos(yaw * Math.PI / 180);
  for (let i = 0; i < count; i++) {
    world.addBrick({ dims: [2, 3, 0.5], color: colors[i % colors.length], x: x + s * i * gap, y: 1.5, z: z + c * i * gap, yaw, kind: 'domino', name, thingId: id, sleeping: true, studs: false });
  }
}

// Things for machines that aren't models (see objects.js).
export const MACHINE_OBJECTS = [{
  id: 'dominoes', name: 'Dominoes', tags: 'domino chain', color: 'orange', category: 'machines', bounds: { min: [-1.2, 0, -0.5], max: [1.2, 3, 16.7] },
  blurb: 'Ten dominoes standing in a row. Knock over the first and they all go, one after another.',
  examples: ['When I press space, explode with power 1.', 'When it touches the button, play tada.'],
  build: (w, { x, z, yaw, id, name }) => dominoes(w, id, x, z, { yaw, name }),
}];

export const MACHINES = [SEESAW, SPRING_PAD, TURNTABLE, WINDMILL, PADDLE_WHEEL, PENDULUM, FLIPPER, LIFT, CONVEYOR, BUTTON, BELL];

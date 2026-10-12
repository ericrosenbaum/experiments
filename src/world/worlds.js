// The premade worlds you can switch between. Each has a look (sky, ground,
// light), gravity, props, models, and a few behaviors that come already
// taught, so there's something to try right away. Behaviors are keyed by
// thing id ('world' holds the World's rules); a behavior is either a sentence
// for the offline compiler ({text}) or ready-made {text, summary, code}.
import * as P from './props.js';
import { RAINBOW } from './props.js';

const RAINBOW_UP = [...RAINBOW].reverse(); // purple at the bottom, red on top
import { BRICK_H as B } from './bricks.js';

const ARROWS = 'When I press the up arrow, drive forward. When I press the down arrow, drive backward. While I hold left, turn left. While I hold right, turn right.';
const STEER = ARROWS;

const SKY = {
  day: { sky: 0x9fd3f5, fog: [90, 190], hemi: [0xdff1ff, 0x5d7a3a, 1.4], sun: [0xfff4dd, 2.4] },
};

// Every coin in the platform game knows the same thing.
const COIN = {
  title: 'Spinning Coin',
  text: 'When the hero touches it, play coin and disappear. Spin slowly.',
  summary: ['Always: spin slowly', 'When the Hero touches it: play coin and disappear'],
  code: 'onStart(() => steer(90)); // spin slowly\nonTouch(thing("hero"), async () => {\n  play("coin");\n  remove();\n});',
};

export const WORLDS = [
  {
    id: 'playground',
    name: 'Playground',
    emoji: '🧱',
    blurb: 'Trees, two brick houses and a rainbow tower to knock over.',
    theme: { ...SKY.day, ground: { base: '#3f9e44', stud: '#4db352', edge: '#2f7f34' } },
    camera: { pos: [-6, 19, -27], target: [0, 1, 3] },
    build(w) {
      const trees = [[-30, 6], [-26, 18], [-14, 30], [8, 34], [30, 18], [36, 0], [-36, -8], [12, -34], [-6, -30], [40, -28]];
      trees.forEach(([x, z], i) => P.tree(w, `tree-${i + 1}`, x, z, { scale: i % 3 === 0 ? 1.3 : 1 }));
      P.house(w, 'house-1', -20, -14, 'tan', 'red');
      P.house(w, 'house-2', 24, -16, 'white', 'blue');
      P.tower(w, 'tower', 14, 12);
      P.ramp(w, 'ramp', -6, 22);
      w.addBall({ x: 4, y: 1.3, z: 14, color: 'white', name: 'Ball', thingId: 'ball' });
      const loose = [['red', -13, 5], ['blue', -9, 8], ['yellow', -13, 11], ['green', -8.5, 3.5], ['orange', 5, -11], ['purple', 9.5, -12]];
      loose.forEach(([color, x, z], i) => w.addBrick({ size: i % 2 ? '2x2' : '2x4', color, x, y: B / 2, z, yaw: i * 37, sleeping: true, thingId: `brick-${i + 1}` }));
    },
    models: [
      { id: 'racecar', def: 'racecar', x: 0, z: 0 },
      { id: 'catapult', def: 'catapult', x: 9, z: -3, yaw: 25 },
    ],
    behaviors: { racecar: [{ text: ARROWS }] },
    select: 'racecar',
  },

  {
    id: 'castle',
    name: 'Castle',
    emoji: '🏰',
    blurb: 'A castle on a hill, a catapult aimed right at it, and a knight, a horse and a dragon.',
    theme: { sky: 0xa9cbe8, fog: [80, 180], hemi: [0xe8f0ff, 0x56703a, 1.35], sun: [0xffe6c0, 2.3], ground: { base: '#4f8f3a', stud: '#5ea446', edge: '#3c702c' } },
    camera: { pos: [-24, 19, -8], target: [0, 2, 18] },
    build(w) {
      const top = P.hill(w, 'hill', 0, 29.5, [[22, 21]]);
      P.castle(w, 'castle', 0, 28, { y: top });
      P.tent(w, 'tent', 16, -6, { color: 'red' });
      P.tent(w, 'tent-2', 23, -1, { color: 'blue', name: 'Blue Tent' });
      P.well(w, 'well', -16, -4);
      P.dummy(w, 'dummy', -8, -10);
      P.hay(w, 'hay', 14, 8, { yaw: 30 });
      P.fence(w, 'fence', -26, 6, 12, { yaw: 90 });
      P.flagPole(w, 'banner', 7, -10, { color: 'blue', name: 'Banner' });
      const trees = [[-30, 24], [-24, 38], [26, 34], [32, 18], [-34, -10], [30, -20], [-12, 46], [14, 48]];
      trees.forEach(([x, z], i) => P.tree(w, `tree-${i + 1}`, x, z, { scale: i % 2 ? 1 : 1.25, leaf: i % 3 ? 'green' : 'lime', top: 'green' }));
    },
    models: [
      { id: 'catapult', def: 'catapult', x: -3, z: 14 },
      { id: 'knight', def: 'knight', x: -11, z: 8, yaw: 10 },
      { id: 'horse', def: 'horse', x: -16, z: 6, yaw: 30 },
      { id: 'dragon', def: 'dragon', x: 24, z: 14, yaw: -110 },
      { id: 'wizard', def: 'wizard', x: 12, z: 2, yaw: -30 },
    ],
    behaviors: {
      catapult: [
        { title: 'Load and Fling', keys: { ' ': 'fling' }, text: 'When I press space, put a brick in the throwing arm, wait 1 second, then fling.' },
        { text: 'While I hold left, turn left. While I hold right, turn right.' },
      ],
      knight: [{ text: STEER }, { text: 'When I press s, swing the sword arm.' }],
      dragon: [{ text: 'Every 4 seconds, wag the tail.' }],
      wizard: [{ title: 'Abracadabra', keys: { ' ': 'magic' }, text: 'When I press space, wave the right arm, play ding and say "Abracadabra!"' }],
    },
    select: 'catapult',
  },

  {
    id: 'space',
    name: 'Space',
    emoji: '🚀',
    blurb: 'No gravity! A starfighter, a UFO, a rocket, floating asteroids and a couple of aliens.',
    theme: { sky: 0x05060f, fog: [110, 260], hemi: [0x9fb4ff, 0x20202a, 1.0], sun: [0xffffff, 2.6], ground: { base: '#30323d', stud: '#3d404e', edge: '#24252e' }, stars: true },
    camera: { pos: [-10, 18, -30], target: [0, 4, 4] },
    gravity: 0,
    build(w) {
      P.landingPad(w, 'pad', -16, -6);
      P.station(w, 'base', -22, 16);
      P.crystal(w, 'crystal-1', 18, 20, { color: 'cyan' });
      P.crystal(w, 'crystal-2', 24, 8, { color: 'pink' });
      P.crystal(w, 'crystal-3', -30, -14, { color: 'lime' });
      const rocks = [[6, 6, 14, 3], [-6, 9, 20, 2.4], [14, 4, 26, 3.4], [-14, 12, 30, 2.6], [20, 10, 2, 2.2], [-4, 14, 8, 2], [10, 13, 36, 3], [-20, 6, 34, 2.8], [26, 7, 22, 2.4], [0, 5, 28, 2]];
      rocks.forEach(([x, y, z, size], i) => P.asteroid(w, `asteroid-${i + 1}`, x, y, z, { size, color: i % 3 === 0 ? 'brown' : i % 3 === 1 ? 'darkgray' : 'gray', spin: 0.2 + (i % 4) * 0.1 }));
    },
    models: [
      { id: 'spaceship', def: 'spaceship', x: 0, z: 0 },
      { id: 'ufo', def: 'ufo', x: 14, z: 6, yaw: -40 },
      { id: 'rocket', def: 'rocket', x: -16, z: -6, lift: 0.5 },
      { id: 'alien', def: 'alien', x: -8, z: 8, yaw: 160, name: 'Zib' },
      { id: 'alien-2', def: 'alien', x: 22, z: -6, yaw: -60, name: 'Zab' },
      { id: 'astronaut', def: 'astronaut', x: 6, z: -8, yaw: 20 },
    ],
    behaviors: {
      world: [{ text: 'At the start, turn off gravity.' }],
      spaceship: [
        { text: STEER },
        { text: 'While I hold w, fly up. While I hold s, fly down.' },
        { title: 'Laser Blaster', text: 'When I press space, play laser and shoot a red brick.' },
      ],
      ufo: [{ text: 'Forever, spin the dome.' }, { text: 'Wander slowly.' }],
      rocket: [{
        title: 'Blast Off',
        keys: { ' ': 'blast off' },
        text: 'When I press space, say "3, 2, 1, blast off!", play whoosh and rise for 4 seconds.',
        summary: ['When you press space: say "3, 2, 1, blast off!", play whoosh, then fly up for 4 seconds'],
        code: 'onKey(" ", async () => {\n  say("3, 2, 1, blast off!");\n  await wait(1.5);\n  play("whoosh");\n  rise(8);\n  await wait(4);\n  rise(0);\n});',
      }],
      alien: [{ title: 'Greetings, Earthling', text: 'When I press h, wave the left arm and say "Greetings, Earthling!"' }],
      astronaut: [{ title: 'To the Stars', text: 'When I press h, wave the left arm and say "To the stars!"' }],
      'alien-2': [{ text: 'Forever, turn the head left, wait 1 second, turn the head right, wait 1 second.' }],
    },
    select: 'spaceship',
  },

  {
    id: 'platformer',
    name: 'Platform Game',
    emoji: '🍄',
    blurb: 'Jump across platforms, grab the coins, dodge the slimes and reach the flag.',
    theme: { sky: 0x7cc8ff, fog: [100, 200], hemi: [0xffffff, 0x6aa84f, 1.5], sun: [0xfff2cc, 2.4], ground: { base: '#55b04a', stud: '#66c45a', edge: '#3f8f36' } },
    camera: { pos: [-26, 16, -10], target: [0, 3, 12] },
    build(w) {
      P.platform(w, 'step-1', 0, B, 0, 6, 6, { color: 'orange', name: 'Step' });
      P.platform(w, 'step-2', 0, 2 * B, 7, 6, 6, { color: 'orange', name: 'Big Step', thickness: 2 * B });
      P.platform(w, 'ledge', 0, 4.2, 15, 6, 6, { color: 'brown', name: 'Ledge', thickness: 0.8 });
      P.platform(w, 'lift', 0, 4.8, 23, 6, 6, { color: 'blue', name: 'Moving Platform', thickness: 0.8, yaw: 90 });
      P.platform(w, 'high-ledge', 0, 6.0, 31, 6, 6, { color: 'brown', name: 'High Ledge', thickness: 0.8 });
      P.platform(w, 'goal-step', 0, 3.6, 39, 8, 6, { color: 'orange', name: 'Goal Step', thickness: 3.6 });
      P.flagPole(w, 'goal', 2, 41, { color: 'green', name: 'Goal Flag', kind: 'goal', y: 3.6, height: 6 });
      P.coin(w, 'coin-1', 0, B + 1.6, 0);
      P.coin(w, 'coin-2', 0, 2 * B + 1.6, 7);
      P.coin(w, 'coin-3', 0, 4.2 + 1.6, 15);
      P.coin(w, 'coin-4', 0, 6.0 + 1.6, 31);
      P.coin(w, 'coin-5', -8, 1.6, 20);
      P.coin(w, 'coin-6', 8, 1.6, 12);
      P.block(w, 'block', -6, 4.2, 4);
      P.pipe(w, 'pipe-1', 9, 26, 2.4);
      P.pipe(w, 'pipe-2', -9, 32, 3.6);
      for (let i = 0; i < 5; i++) P.cloud(w, `cloud-${i + 1}`, -30 + i * 16, 16 + (i % 2) * 4, 30 + (i % 3) * 14);
      P.tree(w, 'tree-1', 18, 4);
      P.tree(w, 'tree-2', 16, 36, { scale: 1.2 });
    },
    models: [
      { id: 'hero', def: 'hero', x: 0, z: -9 },
      { id: 'slime', def: 'slime', x: -7, z: 12, yaw: 90 },
      { id: 'slime-2', def: 'slime', x: 7, z: 20, yaw: -90 },
    ],
    behaviors: {
      world: [{ title: 'Game Goal', text: 'At the start, say "Get all the coins and reach the flag!" for 10 seconds.' }],
      hero: [{ text: STEER }, { text: 'When I press space, jump high.' }],
      slime: [{ text: 'Forever, move 6 studs, then turn around.' }],
      'slime-2': [{ text: 'Forever, move 6 studs, then turn around.' }],
      lift: [{
        title: 'Up and Down Lift',
        text: 'Forever, move 6 studs, wait 1 second, move back 6 studs, wait 1 second.',
        summary: ['Forever: slide 6 studs one way, wait, slide back, wait'],
        code: 'forever(async () => {\n  await move(6, 3);\n  await wait(1);\n  await move(-6, 3);\n  await wait(1);\n});',
      }],
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`coin-${n}`, [COIN]])),
      block: [{
        title: 'Surprise Block',
        text: 'When the hero bumps it, play ding and drop a yellow brick on top.',
        summary: ['When the Hero bumps it: play ding and drop a yellow brick on top'],
        code: 'onTouch(thing("hero"), async () => {\n  play("ding");\n  spawn({ color: "yellow", size: "1x1", at: "top" });\n});',
      }],
      goal: [{
        title: 'Victory Flag',
        text: 'When the hero touches it, play yay and say "You win!"',
        summary: ['When the Hero touches it: play yay and say "You win!"'],
        code: 'onTouch(thing("hero"), async () => {\n  play("yay");\n  say("You win!", 4);\n});',
      }],
    },
    select: 'hero',
  },

  {
    id: 'village',
    name: 'Village',
    emoji: '🏘️',
    blurb: 'Brick houses along the roads, a fountain, market stalls, a bell tower and a dump truck.',
    theme: { sky: 0xb5dcf7, fog: [90, 190], hemi: [0xf0f6ff, 0x6b7f4a, 1.4], sun: [0xfff0d8, 2.4], ground: { base: '#5aa34a', stud: '#69b657', edge: '#47853a' } },
    camera: { pos: [-20, 22, -30], target: [0, 1, 2] },
    build(w) {
      P.road(w, 'road', [[0, 0, 70, 6], [0, 19.5, 6, 33], [0, -19.5, 6, 33]]);
      P.house(w, 'house-1', -12, 10, 'tan', 'red', { name: 'Bakery' });
      P.house(w, 'house-2', 12, 10, 'white', 'blue', { name: 'Blue-Roof House' });
      P.house(w, 'house-3', -12, -11, 'yellow', 'green', { name: 'Green-Roof House' });
      P.house(w, 'house-4', 24, -11, 'pink', 'purple', { name: 'Purple-Roof House' });
      P.house(w, 'house-5', -26, 10, 'orange', 'brown', { name: 'Brown-Roof House' });
      P.tower(w, 'bell-tower', 12, -12, { layers: 14, colors: ['white', 'tan'], name: 'Bell Tower', kind: 'tower' });
      P.fountain(w, 'fountain', 8, 24);
      P.stall(w, 'stall-1', -9, 24, { color: 'red', goods: 'orange', yaw: 90, name: 'Fruit Stall' });
      P.stall(w, 'stall-2', -9, 31, { color: 'blue', goods: 'yellow', yaw: 90, name: 'Cheese Stall' });
      P.well(w, 'well', 24, 10);
      [[-4.5, 5], [4.5, 5], [-4.5, -5], [4.5, -5], [-20, 4.5], [20, -4.5]].forEach(([x, z], i) => P.lamp(w, `lamp-${i + 1}`, x, z));
      const trees = [[-30, -6], [-36, 24], [32, 24], [36, -26], [-28, -28], [20, 40], [-20, 42]];
      trees.forEach(([x, z], i) => P.tree(w, `tree-${i + 1}`, x, z, { scale: i % 2 ? 1 : 1.2 }));
    },
    models: [
      { id: 'truck', def: 'truck', x: -24, z: 0, yaw: 90 },
      { id: 'mayor', def: 'robot', x: 14, z: 30, yaw: 200, name: 'Mayor Bot' },
      { id: 'racecar', def: 'racecar', x: 2, z: -30, yaw: 0 },
      { id: 'villager', def: 'villager', x: -5, z: 27, yaw: 90, name: 'Rosa' },
      { id: 'villager-2', def: 'villager', x: 18, z: 4, yaw: 200, name: 'Ben' },
    ],
    behaviors: {
      truck: [{ text: ARROWS }, { text: 'When I press space, raise the dump bed, wait 1 second, lower the dump bed.' }],
      villager: [{ title: 'Lovely Day Wave', text: 'When I press h, wave the right arm and say "Lovely day!"' }],
      'villager-2': [{ text: 'Wander slowly.' }],
      mayor: [{ title: "Mayor's Welcome", keys: { h: 'hello' }, text: 'When I press h, raise both arms and say "Welcome to Brickton!" then lower both arms.' }],
    },
    select: 'truck',
  },

  {
    id: 'farm',
    name: 'Farm',
    emoji: '🚜',
    blurb: 'A red barn, a silo, fields of carrots and corn, cows in the pen and a tractor.',
    theme: { sky: 0xaee0ff, fog: [90, 190], hemi: [0xfffbe8, 0x7b8a3a, 1.45], sun: [0xfff0c8, 2.5], ground: { base: '#7bb24a', stud: '#8bc457', edge: '#61913a' } },
    camera: { pos: [-24, 22, -26], target: [0, 1, 6] },
    build(w) {
      P.barn(w, 'barn', -16, 18);
      P.silo(w, 'silo', -26, 22);
      P.crops(w, 'carrots', 14, 18, { rows: 4, length: 12, plant: 'orange', name: 'Carrots' });
      P.crops(w, 'corn', 14, 32, { rows: 3, length: 12, plant: 'yellow', leaf: 'green', name: 'Corn', tall: true });
      P.fence(w, 'pen-n', 22, 6, 18);
      P.fence(w, 'pen-s', 22, -12, 18);
      P.fence(w, 'pen-e', 31, -3, 16.4, { yaw: 90 });
      P.pond(w, 'pond', -18, -14);
      P.hay(w, 'hay', -6, 8);
      P.hay(w, 'hay-2', -28, 6, { yaw: 90, name: 'More Hay' });
      const trees = [[-36, -4], [-34, 36], [30, 40], [38, 22], [-6, 40], [36, -30]];
      trees.forEach(([x, z], i) => P.tree(w, `tree-${i + 1}`, x, z, { scale: i % 2 ? 1.1 : 1 }));
    },
    models: [
      { id: 'tractor', def: 'tractor', x: 0, z: -4 },
      { id: 'cow', def: 'cow', x: 22, z: 0, yaw: -70, name: 'Daisy' },
      { id: 'cow-2', def: 'cow', x: 24, z: -7, yaw: 200, name: 'Buttercup' },
      { id: 'horse', def: 'horse', x: -6, z: -14, yaw: 60 },
      { id: 'farmer', def: 'farmer', x: 8, z: 3, yaw: -20 },
    ],
    behaviors: {
      tractor: [{ text: ARROWS }, { text: 'When I press space, lift the loader, wait 1 second, lower the loader.' }],
      cow: [{ text: 'Every 5 seconds, wag the tail.' }],
      farmer: [{ title: 'Howdy Wave', text: 'When I press h, wave the left arm and say "Howdy!"' }],
      'cow-2': [{ text: 'Every 7 seconds, nod the head.' }],
    },
    select: 'tractor',
  },

  {
    id: 'minigolf',
    name: 'Minigolf',
    emoji: '⛳',
    blurb: 'Three holes of minigolf: aim the ball with ← →, hold space to charge a putt and let go to hit (↑ is a little tap). R puts it back on the tee.',
    theme: { sky: 0x9bd6ff, fog: [100, 200], hemi: [0xffffff, 0x5f8f3a, 1.45], sun: [0xfff4dd, 2.4], ground: { base: '#5aa34a', stud: '#69b657', edge: '#47853a' } },
    camera: { pos: [-6, 30, -42], target: [-6, 0, 3] },
    build(w) {
      const H = B; // greens are one brick high; the cups go down to the ground
      P.green(w, 'green-1', 16, 0, {
        name: 'Hole 1', cup: [0, 9], rects: [[0, 0, 6, 26]],
        walls: [[0, -12.75, 6, 0.5], [0, 12.75, 6, 0.5], [-2.75, 0, 0.5, 25], [2.75, 0, 0.5, 25]],
      });
      P.green(w, 'green-2', 2, 0, { // a dogleg (to the right, as you putt)
        name: 'Hole 2', cup: [-8, 5], rects: [[0, 0, 6, 16], [-7, 5, 8, 6]],
        walls: [[0, -7.75, 6, 0.5], [-4, 7.75, 14, 0.5], [2.75, 0, 0.5, 15], [-2.75, -2.75, 0.5, 9.5], [-6.75, 2.25, 8.5, 0.5], [-10.75, 5, 0.5, 5]],
      });
      P.green(w, 'green-3', -16, 0, { // past the spinner
        name: 'Hole 3', cup: [0, 10], rects: [[0, 0, 8, 26]],
        walls: [[0, -12.75, 8, 0.5], [0, 12.75, 8, 0.5], [-3.75, 0, 0.5, 25], [3.75, 0, 0.5, 25]],
      });
      [[16, 9], [-6, 5], [-16, 10]].forEach(([x, z], i) => {
        P.cup(w, `cup-${i + 1}`, x, z, { name: `Cup ${i + 1}` });
        P.pin(w, `pin-${i + 1}`, x - 1.1, H, z + 1.1, { color: ['red', 'yellow', 'blue'][i], name: `Flag ${i + 1}` });
      });
      P.spinner(w, 'spinner', -16, H, 0);
      w.addBall({ radius: 0.5, color: 'white', x: 16, y: H + 0.55, z: -10, name: 'Golf Ball', thingId: 'golfball', damping: 0.35, spinDamping: 0.8, bounce: 0.7, spots: false });
      const trees = [[-30, -6], [-30, 16], [-8, 24], [10, 24], [30, -2], [30, 18], [0, 32]];
      trees.forEach(([x, z], i) => P.tree(w, `tree-${i + 1}`, x, z, { scale: i % 2 ? 1 : 1.2 }));
    },
    models: [
      { id: 'golfer', def: 'golfer', x: 21.5, z: -9, yaw: -90 },
    ],
    behaviors: {
      world: [{ title: 'How to Play', text: 'At the start, say "Minigolf! Aim with ← →. Hold space, let go to putt." for 10 seconds.' }],
      golfball: [{
        title: 'Minigolf Ball',
        keys: { ArrowLeft: 'aim', ArrowRight: 'aim', ArrowUp: 'tap', ' ': 'putt', r: 'restart' },
        text: 'Aim with the left and right arrows. Hold space to charge up a putt and let go to hit it; up is a little tap. Count the strokes. When it hears "in the hole", cheer, then go to the next tee. R goes back to the tee.',
        summary: [
          'While ← or → is held: aim left or right',
          'While space is held: charge up the putt; let go to hit it. ↑: a little tap (each one is a stroke)',
          'When it hears "in the hole": cheer and go to the next hole',
          'When R is pressed: back to the tee',
        ],
        code: `// Minigolf! The ball keeps track of which hole it's on and how many strokes.
const tees = [place(16, -10), place(2, -5), place(-16, -10)];
const cups = ["cup-1", "cup-2", "cup-3"];
let hole = 0;
let strokes = 0;

async function startHole() {
  strokes = 0;
  await teleport(tees[hole]);
  await face(thing(cups[hole]));
  say("Hole " + (hole + 1), 2);
}

// aim
onKey("ArrowLeft", () => steer(70));
onKeyUp("ArrowLeft", () => steer(0));
onKey("ArrowRight", () => steer(-70));
onKeyUp("ArrowRight", () => steer(0));

// putt: hold space to charge up, let go to hit
let power = 1;
whileKey(" ", () => {
  power = Math.min(10, power + 0.15);
  const bars = Math.round(power);
  say("Power " + "▮".repeat(bars) + "▯".repeat(10 - bars), 1);
});
onKeyUp(" ", () => {
  strokes = strokes + 1;
  push("forward", power);
  play("pop");
  say("Stroke " + strokes, 1);
  power = 1;
});
onKey("ArrowUp", () => { strokes = strokes + 1; push("forward", 1.5); play("pop"); });

onKey("r", startHole);

onMessage("in the hole", async () => {
  play("yay");
  say(strokes === 1 ? "Hole in one!" : "In the hole in " + strokes + "!", 3);
  await wait(3);
  hole = (hole + 1) % tees.length;
  await startHole();
});

onStart(async () => { await face(thing(cups[0])); });`,
      }],
      ...Object.fromEntries([1, 2, 3].map((n) => [`cup-${n}`, [{
        title: 'Cup Catcher',
        text: 'When the golf ball drops in, tell everyone "in the hole".',
        summary: ['When the Golf Ball drops in: tell everyone "in the hole"'],
        code: 'onTouch(thing("golfball"), () => {\n  broadcast("in the hole");\n});',
      }]])),
      spinner: [{ title: 'Spinner', text: 'Forever, turn slowly.', summary: ['Always: turn slowly'], code: 'onStart(() => steer(60)); // keep turning' }],
      golfer: [{ title: 'Nice Putt Cheer', text: 'When it hears "in the hole", wave the left arm and say "Nice putt!"' }],
    },
    select: 'golfball',
  },

  {
    id: 'megagolf',
    name: 'MEGA GOLF',
    emoji: '🏌️',
    blurb: "One giant hole, and you're the golfer. Walk with the arrows, hold space to wind up and let go to whack the ball (stand right next to it). Watch out for zoomy slimes and Big Rex. R puts the ball back on the tee.",
    theme: { sky: 0xffd9a8, fog: [120, 260], hemi: [0xfff4e6, 0x6f8f3a, 1.45], sun: [0xffe9c4, 2.5], ground: { base: '#6bb04f', stud: '#7cc25e', edge: '#55903d' } },
    camera: { pos: [-16, 22, -76], target: [0, 3, -40] },
    follow: true,
    build(w) {
      const c = P.megaCourse(w);
      P.mushroom(w, 'mushroom-1', 4, -24, { y: c.FAIR }); // its stem is right in the way of a straight shot
      P.mushroom(w, 'mushroom-2', -5, -9, { y: c.FAIR, cap: 'orange', name: 'Orange Mushroom' });
      P.giantSpinner(w, 'spinner', 40, c.PLAT, 26);
      for (let i = 0; i < 5; i++) {
        w.addBrick({ dims: [4, 2.4, 4], color: RAINBOW_UP[i], x: 45, y: c.PLAT + 1.2 + i * 2.4, z: 38, kind: 'tower', name: 'Mega Tower', thingId: 'mega-tower', sleeping: true });
      }
      P.cup(w, 'mega-cup', c.cup[0], c.cup[1], { name: 'Mega Cup', size: 9.6, depth: 2.4 }); // still counts with a slime under the ball
      P.giantPin(w, 'giant-flag', c.cup[0] + 6, c.GREEN, c.cup[1] + 6);
      P.bigRex(w, 'rex', 76, 80, { yaw: -90 });
      w.addBall({ radius: 3.5, color: 'white', x: c.tee[0], y: c.FAIR + 3.55, z: c.tee[1], name: 'Mega Ball', thingId: 'megaball', damping: 0.2, spinDamping: 0.6, bounce: 0.3, spots: false, density: 1 });
      const trees = [[-28, -40], [-26, 0], [-24, 36], [-6, 40], [14, 60], [66, 20], [70, 48], [64, -16], [30, -40], [60, 104], [20, 100]];
      trees.forEach(([x, z], i) => P.tree(w, `tree-${i + 1}`, x, z, { scale: 1.6 + (i % 3) * 0.3 }));
    },
    models: [
      { id: 'golfer', def: 'golfer', x: 0, z: -45, lift: 0.4, name: 'You' },
      { id: 'zip', def: 'slime', x: -4, z: -30, yaw: 90, lift: 0.4, name: 'Zip' },
      { id: 'zap', def: 'slime', x: 36, z: 6, yaw: -90, lift: 6.4, name: 'Zap' },
      { id: 'zoom', def: 'slime', x: 30, z: 74, yaw: 45, lift: 3.6, name: 'Zoom' },
    ],
    behaviors: {
      world: [
        { title: 'How to Play', text: 'At the start, say "MEGA GOLF! Walk with the arrows. Hold space to wind up, let go to whack the ball." for 10 seconds.' },
        {
          title: 'Brick Confetti',
          text: 'When it hears "in the hole", drop a shower of rainbow bricks on the green.',
          summary: ['When it hears "in the hole": drop rainbow bricks all over the green'],
          code: `onMessage("in the hole", async () => {
  const colors = ["red", "orange", "yellow", "green", "blue", "purple"];
  for (let i = 0; i < 18; i++) {
    spawn({ color: colors[i % 6], size: "2x2", at: place(random(28, 52), random(68, 90)) });
    await wait(0.1);
  }
});`,
        },
      ],
      golfer: [
        { title: 'Walk Around', text: STEER },
        {
          title: 'Mega Swing',
          keys: { ' ': 'swing', r: 'reset' },
          text: 'Hold space to wind up and let go to swing: it tells the ball how hard. R sends the ball and me back to the tee. When it hears "in the hole", cheer, then go back to the tee.',
          summary: [
            'While space is held: wind up (the longer, the harder); let go to swing',
            'When R is pressed: the ball and I go back to the tee',
            'When it hears "in the hole": cheer, then back to the tee',
          ],
          code: `// Hold space to wind up, let go to swing. The ball works out which way to fly.
let power = 1;
whileKey(" ", () => {
  if (power === 1) part("right arm").turnTo(-60); // wind up
  power = Math.min(10, power + 0.2);
  const bars = Math.round(power);
  say("Power " + "▮".repeat(bars) + "▯".repeat(10 - bars), 1);
});
onKeyUp(" ", async () => {
  broadcast("whack " + Math.round(power));
  power = 1;
  await part("right arm").turnTo(120);
  await wait(0.2);
  await part("right arm").turnTo(0);
});

async function backToTee() {
  await teleport(place(0, -45));
  await face(place(0, -40));
}
onKey("r", async () => {
  broadcast("back to the tee");
  await backToTee();
});

onMessage("in the hole", async () => {
  say("MEGA PUTT!", 3);
  part("left arm").turnTo(160);
  await part("right arm").turnTo(160);
  await wait(1.5);
  part("left arm").turnTo(0);
  await part("right arm").turnTo(0);
  await wait(2.5);
  await backToTee();
});`,
        },
      ],
      megaball: [{
        title: 'Mega Ball',
        text: 'When the golfer swings close by, fly away from them, harder the longer they wound up. Count the strokes. When it hears "in the hole", cheer and go back to the tee.',
        summary: [
          'When the golfer swings next to it: fly away from them (each swing is a stroke)',
          'When it hears "back to the tee": go back to the tee',
          'When it hears "in the hole": cheer and go back to the tee',
        ],
        code: `// The MEGA ball. When the golfer swings close by, it flies away from them.
let strokes = 0;

async function whack(power) {
  const golfer = await nearest(thing("golfer"));
  if (!golfer || golfer.distance > 8) { say("Too far away!", 1.5); return; }
  strokes = strokes + 1;
  // fly away from the golfer: split it into a forward/back push and a left/right push
  const away = (golfer.direction + 180) / 57.3; // 57.3 turns degrees into the angle units sin and cos use
  const strength = power * 1.5; // a mega ball needs a mega swing to get up the ramp
  shove(Math.cos(away) * strength, "forward", "backward");
  shove(Math.sin(away) * strength, "left", "right");
  play("hit");
  say("Stroke " + strokes, 1.5);
}
// push one way or the other; a push tops out at 10, so a bigger one takes two
function shove(amount, plus, minus) {
  const way = amount > 0 ? plus : minus;
  const size = Math.abs(amount);
  if (size >= 1) push(way, Math.min(size, 10));
  if (size >= 11) push(way, size - 10);
}

// the golfer says how hard: "whack 1" up to "whack 10"
for (let i = 0; i < 10; i++) {
  const power = i + 1;
  onMessage("whack " + power, () => whack(power));
}

onMessage("back to the tee", async () => {
  strokes = 0;
  await teleport(place(0, -40));
});

onMessage("in the hole", async () => {
  play("yay");
  say(strokes === 1 ? "MEGA HOLE IN ONE!" : "In the hole in " + strokes + "!", 4);
  await wait(4);
  strokes = 0;
  await teleport(place(0, -40));
});`,
      }],
      'mega-cup': [{
        title: 'Cup Catcher',
        text: 'When the mega ball drops in, tell everyone "in the hole".',
        summary: ['When the Mega Ball drops in: tell everyone "in the hole"'],
        code: 'onTouch(thing("megaball"), () => {\n  broadcast("in the hole");\n});',
      }],
      spinner: [{ title: 'Spinner', text: 'Forever, turn slowly.', summary: ['Always: turn slowly'], code: 'onStart(() => steer(35)); // keep turning' }],
      ...Object.fromEntries([['zip', 'lime'], ['zap', 'pink'], ['zoom', 'cyan']].map(([id, color]) => [id, [{
        title: 'Zoomies',
        text: `At the start, turn ${color}. Forever, zoom forward really fast, then turn a random amount. When the mega ball hits it, say "Wheee!" and jump.`,
        summary: [`At the start: turn ${color}`, 'Forever: zoom forward really fast, then turn a random amount', 'When the Mega Ball hits it: say "Wheee!" and jump'],
        code: `onStart(() => color("${color}"));
forever(async () => {
  await move(random(5, 12), 22); // zoom!
  await turn(random(-150, 150));
});
onTouch(thing("megaball"), () => {
  say("Wheee!", 1);
  jump(8);
});`,
      }]])),
      rex: [{
        title: 'Ball Watcher',
        text: 'Forever, turn to watch the mega ball, and if it is close, say something about how tiny it is. When it hears "in the hole", roar and say "ROAR! That was AMAZING!"',
        summary: ['Forever: turn to watch the Mega Ball, and talk about how tiny it is when it comes close', 'When it hears "in the hole": roar and cheer'],
        code: `// Big Rex keeps an eye on that tiny little ball.
const comments = ["Ooh, a tiny ball!", "Is that a pebble?", "So small. So cute.", "I could eat that in one bite."];
forever(async () => {
  await face(thing("megaball"));
  const ball = await nearest(thing("megaball"));
  if (ball && ball.distance < 40) say(comments[random(0, comments.length - 1)], 2.5);
  await wait(4);
});
onMessage("in the hole", () => {
  play("roar");
  say("ROAR! That was AMAZING!", 3);
});`,
      }],
    },
    select: 'golfer',
  },
];

export const WORLDS_BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w]));

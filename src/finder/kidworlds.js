// Worlds "made by other kids" for the World Finder demo. Each is a small
// diorama built from the same props and library models as the main app, in
// the same preset shape as src/world/worlds.js (so the Stage can load it),
// plus what a kid would fill in when sharing: a title, a short summary, who
// made it and where, and the tags they picked. `shot` places the thumbnail
// camera: it looks at `target` from `dist` studs away, `yaw` degrees around
// (0 = from -z, the side models face when yaw is 180) and `pitch` degrees up.
//
// tools/finder/render.mjs renders the thumbnails and writes
// public/finder/worlds.json from these; the finder page only reads that file.
import * as P from '../world/props.js';
import { BRICK_H as B } from '../world/bricks.js';

const ARROWS = 'When I press the up arrow, drive forward. When I press the down arrow, drive backward. While I hold left, turn left. While I hold right, turn right.';

const SKY = {
  day: { sky: 0x9fd3f5, fog: [90, 190], hemi: [0xdff1ff, 0x5d7a3a, 1.4], sun: [0xfff4dd, 2.4] },
  warm: { sky: 0xf6d7a7, fog: [80, 180], hemi: [0xfff1dc, 0x9a7a4a, 1.4], sun: [0xffe2b0, 2.6] },
  snow: { sky: 0xcfe6f7, fog: [70, 170], hemi: [0xf4f9ff, 0xb9c8d6, 1.5], sun: [0xfffaf0, 2.2] },
  dusk: { sky: 0x2a2f5e, fog: [60, 150], hemi: [0x8a93d8, 0x2b2440, 0.9], sun: [0xc9b8ff, 1.5] },
  space: { sky: 0x05060f, fog: [110, 260], hemi: [0x9fb4ff, 0x20202a, 1.0], sun: [0xffffff, 2.6], stars: true },
};
const GROUND = {
  grass: { base: '#3f9e44', stud: '#4db352', edge: '#2f7f34' },
  meadow: { base: '#7bb24a', stud: '#8bc457', edge: '#61913a' },
  sand: { base: '#d9b26f', stud: '#e6c283', edge: '#b8935a' },
  snow: { base: '#e8eef5', stud: '#f7fafc', edge: '#c9d3df' },
  sea: { base: '#2f7fc4', stud: '#3b91d6', edge: '#24659e' },
  moon: { base: '#30323d', stud: '#3d404e', edge: '#24252e' },
  night: { base: '#2c4a3a', stud: '#365a47', edge: '#213a2d' },
  lava: { base: '#3a2a26', stud: '#4a3530', edge: '#2a1d1a' },
};

// A flat slab of plates (sand, snow, water, a field) that doesn't move.
// Slabs that share a thing id (the dance floor) each need their own entity id.
let slabs = 0;
const slab = (w, id, x, z, wd, d, color, { name = 'Ground', kind = 'ground-patch', y = 0, h = 0.4, studs = false } = {}) =>
  w.addStatic({ kind, name, color, x, z, thingId: id, id: `${id}#${++slabs}`, boxes: [{ at: [0, y + h / 2, 0], size: [wd, h, d], color, studs }] });

// A pile of loose bricks (asleep until something bumps them).
const pile = (w, id, x, z, colors, { rows = 3, name = 'Brick Pile' } = {}) => {
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < rows - r; i++) {
      w.addBrick({ size: '2x4', color: colors[n++ % colors.length], x: x + (i - (rows - r - 1) / 2) * 4.1, y: B / 2 + r * B, z, yaw: 0, sleeping: true, thingId: id, kind: 'pile', name });
    }
  }
};

export const KID_WORLDS = [
  {
    id: 'dragon-mountain',
    title: 'Dragon Mountain Siege',
    summary: 'Fling bricks at the castle before the dragon wakes up.',
    by: { name: 'Aiko', age: 10, city: 'Osaka', country: 'Japan', flag: '🇯🇵' },
    tags: { genre: ['adventure', 'battle'], topic: ['castles', 'dragons'] },
    theme: { ...SKY.day, ground: GROUND.grass },
    build(w) {
      const top = P.hill(w, 'hill', 0, 14, [[22, 18], [16, 14]]);
      P.castle(w, 'castle', 0, 14, { y: top, flag: 'purple' });
      P.tree(w, 'tree-1', -16, 6); P.tree(w, 'tree-2', 15, 2, { scale: 1.2 });
      P.hay(w, 'hay', 9, -6, { yaw: 20 });
    },
    models: [
      { id: 'catapult', def: 'catapult', x: -2, z: -8 },
      { id: 'dragon', def: 'dragon', x: 13, z: 10, yaw: -130 },
      { id: 'knight', def: 'knight', x: -8, z: -6, yaw: 160 },
    ],
    behaviors: {
      catapult: [{ text: 'When I press space, put a brick in the throwing arm, wait 1 second, then fling.' }, { text: 'While I hold left, turn left. While I hold right, turn right.' }],
      dragon: [{ text: 'Every 3 seconds, flap the left wing and the right wing and roar.' }, { text: 'When it bumps into a brick, say "Who woke me up?" and chase the knight.' }],
      knight: [{ text: ARROWS }],
    },
    shot: { target: [4, 3.5, 5], yaw: -8, pitch: 26, dist: 38 },
  },
  {
    id: 'moo-racetrack',
    title: 'Moo Moo Racetrack',
    summary: 'Race around the farm. Do not hit the cows!',
    by: { name: 'Mateo', age: 8, city: 'Buenos Aires', country: 'Argentina', flag: '🇦🇷' },
    tags: { genre: ['racing', 'game'], topic: ['farms', 'animals', 'vehicles'] },
    theme: { ...SKY.day, ground: GROUND.meadow },
    build(w) {
      P.road(w, 'track', [[0, -8, 34, 5], [0, 12, 34, 5], [-14.5, 2, 5, 15], [14.5, 2, 5, 15]]);
      P.fence(w, 'fence', 0, 2, 16);
      P.hay(w, 'hay', -4, 4, { yaw: 10 }); P.hay(w, 'hay-2', 5, 0, { yaw: -20, name: 'More Hay' });
      P.flagPole(w, 'finish', -12, -11, { color: 'white', name: 'Finish Flag', kind: 'goal' });
      P.barn(w, 'barn', 0, 24);
    },
    models: [
      { id: 'racecar', def: 'racecar', x: -6, z: -8, yaw: 90 },
      { id: 'cow', def: 'cow', x: 8, z: -8, yaw: 200, name: 'Lola' },
      { id: 'cow-2', def: 'cow', x: 15, z: 4, yaw: 120, name: 'Pancho' },
    ],
    behaviors: {
      racecar: [{ text: ARROWS }, { text: 'When it bumps into a cow, play crash and say "Sorry cow!"' }],
      cow: [{ text: 'Forever, move 6 studs, then turn around.' }],
      'cow-2': [{ text: 'Every 4 seconds, play moo.' }],
      finish: [{ text: 'When the racecar touches it, play yay and say "Lap!"' }],
    },
    shot: { target: [1, 1, 2], yaw: -24, pitch: 40, dist: 36 },
  },
  {
    id: 'planet-zib',
    title: 'The Lost Rocket of Planet Zib',
    summary: 'Help Zib find the crystals so the rocket can fly home.',
    by: { name: 'Amara', age: 11, city: 'Lagos', country: 'Nigeria', flag: '🇳🇬' },
    tags: { genre: ['adventure', 'story'], topic: ['space', 'aliens'] },
    theme: { ...SKY.space, ground: GROUND.moon },
    gravity: 0.4,
    build(w) {
      P.crystal(w, 'crystal-1', 8, 6, { color: 'pink' });
      P.crystal(w, 'crystal-2', -9, 10, { color: 'cyan' });
      P.crystal(w, 'crystal-3', 4, 16, { color: 'lime' });
      P.landingPad(w, 'pad', -6, -2);
      P.asteroid(w, 'asteroid-1', 10, 9, 14, { size: 3 });
      P.asteroid(w, 'asteroid-2', -12, 11, 18, { size: 2.4, color: 'brown' });
    },
    models: [
      { id: 'rocket', def: 'rocket', x: -6, z: -2, lift: 0.4 },
      { id: 'alien', def: 'alien', x: 2, z: 0, yaw: 200, name: 'Zib' },
      { id: 'ufo', def: 'ufo', x: 10, z: 18, yaw: -40 },
    ],
    behaviors: {
      world: [{ text: 'At the start, set gravity to 0.4.' }],
      alien: [{ text: ARROWS }, { text: 'When it touches a crystal, play ding and say "One more!"' }],
      rocket: [{ text: 'When it hears launch, say "3, 2, 1!", play whoosh and rise for 4 seconds.' }],
      ufo: [{ text: 'Wander slowly.' }, { text: 'Forever, spin the dome.' }],
    },
    shot: { target: [0, 3, 6], yaw: -10, pitch: 22, dist: 30 },
  },
  {
    id: 'coin-tower',
    title: 'Coin Tower Climb',
    summary: 'Jump up the steps, grab every coin, dodge the slimes.',
    by: { name: 'Lukas', age: 9, city: 'Berlin', country: 'Germany', flag: '🇩🇪' },
    tags: { genre: ['game', 'platformer'], topic: ['heroes'] },
    theme: { sky: 0x7cc8ff, fog: [100, 200], hemi: [0xffffff, 0x6aa84f, 1.5], sun: [0xfff2cc, 2.4], ground: GROUND.grass },
    build(w) {
      P.platform(w, 'step-1', -6, B, 2, 6, 6, { color: 'orange', name: 'Step' });
      P.platform(w, 'step-2', 0, 2.6, 6, 6, 6, { color: 'red', name: 'Step 2', thickness: 2.6 });
      P.platform(w, 'step-3', 6, 4.4, 10, 6, 6, { color: 'blue', name: 'Step 3', thickness: 0.8 });
      P.platform(w, 'top', 0, 6.4, 16, 8, 6, { color: 'yellow', name: 'Top', thickness: 0.8 });
      P.coin(w, 'coin-1', -6, B + 1.6, 2); P.coin(w, 'coin-2', 0, 4.2, 6); P.coin(w, 'coin-3', 6, 6, 10); P.coin(w, 'coin-4', 0, 8, 16);
      P.flagPole(w, 'goal', 2.5, 17, { color: 'green', name: 'Goal Flag', kind: 'goal', y: 6.4, height: 5 });
      P.pipe(w, 'pipe', 9, 0, 3);
      P.block(w, 'block', -7, 5.4, 7);
      P.cloud(w, 'cloud', -10, 14, 24);
    },
    models: [
      { id: 'hero', def: 'hero', x: -7, z: -6, yaw: 160 },
      { id: 'slime', def: 'slime', x: 4, z: -2, yaw: 90 },
    ],
    behaviors: {
      hero: [{ text: ARROWS }, { text: 'When I press space, jump high.' }],
      slime: [{ text: 'Forever, move 6 studs, then turn around.' }],
      ...Object.fromEntries([1, 2, 3, 4].map((n) => [`coin-${n}`, [{ text: 'When the hero touches it, play coin and disappear.' }]])),
      goal: [{ text: 'When the hero touches it, play yay and say "You win!"' }],
    },
    shot: { target: [0, 4, 6], yaw: -30, pitch: 22, dist: 30 },
  },
  {
    id: 'desert-dino',
    title: 'Desert Dino Dig',
    summary: 'Dig up the old bones before the dino finds you.',
    by: { name: 'Priya', age: 10, city: 'Jaipur', country: 'India', flag: '🇮🇳' },
    tags: { genre: ['adventure', 'explore'], topic: ['dinosaurs', 'vehicles'] },
    theme: { ...SKY.warm, ground: GROUND.sand },
    build(w) {
      pile(w, 'rocks', 6, 10, ['tan', 'brown', 'orange'], { rows: 3, name: 'Rock Pile' });
      P.tent(w, 'tent', -12, 8, { color: 'orange', name: 'Dig Tent' });
      P.hill(w, 'dune', -2, 22, [[18, 8], [10, 5]], ['tan', 'orange']);
      [[-4, 6], [-1, 9], [2, 5]].forEach(([x, z], i) => w.addBrick({ dims: [3, 0.6, 0.8], color: 'white', x, y: 0.3, z, yaw: i * 50, sleeping: true, thingId: 'bones', kind: 'bones', name: 'Old Bones', studs: false }));
    },
    models: [
      { id: 'digger', def: 'digger', x: -5, z: -4, yaw: 150 },
      { id: 'dino', def: 'dino', x: 12, z: 2, yaw: -120 },
    ],
    behaviors: {
      digger: [{ text: ARROWS }, { text: 'When I press space, lower the scoop, wait 1 second, raise the scoop.' }],
      dino: [{ text: 'Forever, chase the digger.' }, { text: 'Every 5 seconds, open the mouth and roar.' }],
    },
    shot: { target: [4, 2, 6], yaw: -16, pitch: 30, dist: 34 },
  },
  {
    id: 'snow-fort',
    title: 'Snow Fort Showdown',
    summary: 'Two snow forts, one catapult each. Knock theirs down first!',
    by: { name: 'Freya', age: 9, city: 'Oslo', country: 'Norway', flag: '🇳🇴' },
    tags: { genre: ['battle', 'game'], topic: ['snow', 'castles'] },
    theme: { ...SKY.snow, ground: GROUND.snow },
    build(w) {
      P.house(w, 'fort-red', -10, 14, 'white', 'red', { name: 'Red Fort' });
      P.house(w, 'fort-blue', 10, 14, 'white', 'blue', { name: 'Blue Fort' });
      P.tree(w, 'tree-1', -20, 22, { leaf: 'white', top: 'white', scale: 1.1 });
      P.tree(w, 'tree-2', 20, 24, { leaf: 'white', top: 'white' });
      P.tree(w, 'tree-3', 0, 30, { leaf: 'white', top: 'cyan', scale: 1.3 });
    },
    models: [
      { id: 'catapult', def: 'catapult', x: -8, z: 0, yaw: 20 },
      { id: 'catapult-2', def: 'catapult', x: 8, z: 0, yaw: -20, name: 'Blue Catapult' },
      { id: 'villager', def: 'villager', x: 0, z: -4, yaw: 180, name: 'Referee Rolf' },
    ],
    behaviors: {
      catapult: [{ text: 'When I press space, put a white brick in the throwing arm, wait 1 second, then fling.' }],
      'catapult-2': [{ text: 'When I press space, put a white brick in the throwing arm, wait 1 second, then fling.' }],
      villager: [{ text: 'When I click it, raise both arms and say "Fight!"' }],
      world: [{ text: 'Every 2 seconds, drop a white brick from the sky.' }],
    },
    shot: { target: [0, 2.5, 7], yaw: 0, pitch: 28, dist: 40 },
  },
  {
    id: 'market-town',
    title: 'Tiny Market Town',
    summary: 'Say hi to everyone at the market and buy a mango.',
    by: { name: 'Kofi', age: 7, city: 'Accra', country: 'Ghana', flag: '🇬🇭' },
    tags: { genre: ['story', 'cozy'], topic: ['towns', 'people'] },
    theme: { ...SKY.warm, ground: GROUND.grass },
    build(w) {
      P.road(w, 'road', [[0, 0, 40, 6]]);
      P.stall(w, 'stall-1', -8, 8, { color: 'orange', goods: 'yellow', name: 'Mango Stall', yaw: 180 });
      P.stall(w, 'stall-2', 0, 8, { color: 'green', goods: 'red', name: 'Tomato Stall', yaw: 180 });
      P.stall(w, 'stall-3', 8, 8, { color: 'purple', goods: 'orange', name: 'Kente Cloth Stall', yaw: 180 });
      P.house(w, 'house-1', -14, 20, 'yellow', 'red');
      P.house(w, 'house-2', 12, 20, 'tan', 'green');
      P.tree(w, 'tree-1', 0, 22, { scale: 1.2 });
    },
    models: [
      { id: 'villager', def: 'villager', x: -4, z: 3, yaw: 160, name: 'Ama' },
      { id: 'villager-2', def: 'villager', x: 4, z: 3, yaw: 200, name: 'Kwame' },
      { id: 'farmer', def: 'farmer', x: -10, z: -2, yaw: 120, name: 'Auntie Esi' },
    ],
    behaviors: {
      villager: [{ text: 'When I click it, wave the right arm and say "Akwaaba!"' }],
      'villager-2': [{ text: 'When I click it, nod the head and say "Mangoes, fresh mangoes!"' }],
      farmer: [{ text: 'Wander slowly.' }],
    },
    shot: { target: [0, 2.5, 8], yaw: 0, pitch: 24, dist: 28 },
  },
  {
    id: 'robot-disco',
    title: 'Robot Dance Party',
    summary: 'Press a key and every robot busts a move.',
    by: { name: 'Hana', age: 8, city: 'Seoul', country: 'South Korea', flag: '🇰🇷' },
    tags: { genre: ['music', 'party'], topic: ['robots'] },
    theme: { ...SKY.dusk, ground: { base: '#3a2d5c', stud: '#4a3a73', edge: '#2a2045' } },
    build(w) {
      const floor = ['red', 'yellow', 'blue', 'green', 'purple', 'orange', 'pink', 'cyan'];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) slab(w, 'dance-floor', -6 + i * 4, 2 + j * 4, 4, 4, floor[(i * 3 + j * 5) % floor.length], { name: 'Dance Floor', kind: 'floor', h: 0.25 });
      P.lamp(w, 'lamp-1', -10, 16); P.lamp(w, 'lamp-2', 10, 16);
      P.tower(w, 'speaker', 0, 18, { layers: 6, colors: ['black', 'darkgray'], name: 'Speaker Tower', kind: 'tower' });
    },
    models: [
      { id: 'robot', def: 'robot', x: -4, z: 4, yaw: 170 },
      { id: 'robot-2', def: 'robot', x: 4, z: 4, yaw: 190, name: 'Robo Bo' },
      { id: 'robot-3', def: 'robot', x: 0, z: 10, yaw: 180, name: 'DJ Byte' },
    ],
    behaviors: {
      robot: [{ text: 'When it hears party, dance and play music.' }],
      'robot-2': [{ text: 'When it hears party, spin around and wave both arms.' }],
      'robot-3': [{ text: 'When I press space, broadcast party, play music and say "Drop the beat!"' }],
    },
    shot: { target: [0, 2.5, 7], yaw: 8, pitch: 26, dist: 26 },
  },
  {
    id: 'wizard-tower',
    title: "The Wizard's Tower",
    summary: 'Climb the tower, find the spell crystals, tame the dragon.',
    by: { name: 'Oliver', age: 12, city: 'Manchester', country: 'United Kingdom', flag: '🇬🇧' },
    tags: { genre: ['story', 'adventure'], topic: ['magic', 'dragons'] },
    theme: { ...SKY.dusk, ground: GROUND.night },
    build(w) {
      P.tower(w, 'tower', 0, 14, { layers: 16, colors: ['purple', 'blue', 'purple', 'darkgray'], name: "Wizard's Tower", kind: 'tower' });
      P.crystal(w, 'crystal-1', -8, 8, { color: 'cyan' });
      P.crystal(w, 'crystal-2', 9, 10, { color: 'pink' });
      P.tree(w, 'tree-1', -14, 20, { leaf: 'darkgray', top: 'purple' });
      P.tree(w, 'tree-2', 15, 22, { leaf: 'darkgray', top: 'purple', scale: 1.2 });
      P.lamp(w, 'lamp', -4, 4);
    },
    models: [
      { id: 'wizard', def: 'wizard', x: 2, z: 2, yaw: 190 },
      { id: 'dragon', def: 'dragon', x: 11, z: 18, yaw: -140, name: 'Ember' },
    ],
    behaviors: {
      wizard: [{ text: ARROWS }, { text: 'When I press space, wave the right arm, play ding and say "Lumos!" and broadcast spell.' }],
      dragon: [{ text: 'When it hears spell, color it purple, flap the left wing and say "I am tamed!"' }],
      'crystal-1': [{ text: 'When the wizard touches it, play ding and disappear.' }],
      'crystal-2': [{ text: 'When the wizard touches it, play ding and disappear.' }],
    },
    shot: { target: [1, 5, 10], yaw: -14, pitch: 18, dist: 32 },
  },
  {
    id: 'island-rescue',
    title: 'Island Rescue',
    summary: 'Fly the starfighter out to sea and rescue the stranded farmer.',
    by: { name: 'Leilani', age: 10, city: 'Honolulu', country: 'United States', flag: '🇺🇸' },
    tags: { genre: ['adventure', 'rescue'], topic: ['islands', 'vehicles'] },
    theme: { ...SKY.day, ground: GROUND.sea },
    build(w) {
      P.hill(w, 'island', 4, 10, [[18, 14], [12, 9], [5, 4]], ['tan', 'lime', 'green']);
      P.tree(w, 'palm-1', 0, 12, { leaf: 'lime', top: 'green', scale: 0.9 });
      P.tree(w, 'palm-2', 9, 8, { leaf: 'lime', top: 'green' });
      P.flagPole(w, 'sos', 6, 14, { color: 'red', name: 'SOS Flag', y: 3 * B, height: 4 });
      P.hill(w, 'rock', -14, 2, [[5, 5]], ['gray']);
    },
    models: [
      { id: 'spaceship', def: 'spaceship', x: -10, z: -6, yaw: 40, lift: 3, name: 'Rescue Jet' },
      { id: 'farmer', def: 'farmer', x: 3, z: 6, yaw: 200, name: 'Stranded Sam' },
    ],
    behaviors: {
      spaceship: [{ text: ARROWS }, { text: 'While I hold w, fly up. While I hold s, fly down.' }],
      farmer: [{ text: 'Every 3 seconds, wave the left arm and say "Help!"' }, { text: 'When the spaceship touches it, play yay and say "My hero!"' }],
    },
    shot: { target: [0, 2, 4], yaw: -28, pitch: 30, dist: 30 },
  },
  {
    id: 'domino-run',
    title: 'Rainbow Domino Run',
    summary: 'One push knocks over all four towers. Set it up again and again!',
    by: { name: 'Sofia', age: 9, city: 'São Paulo', country: 'Brazil', flag: '🇧🇷' },
    tags: { genre: ['sandbox', 'puzzle'], topic: ['physics'] },
    theme: { ...SKY.day, ground: GROUND.grass },
    build(w) {
      P.tower(w, 'tower-1', -9, 4, { layers: 8, colors: ['red', 'orange'] , name: 'Red Tower' });
      P.tower(w, 'tower-2', -3, 9, { layers: 10, colors: ['yellow', 'green'], name: 'Green Tower' });
      P.tower(w, 'tower-3', 3, 14, { layers: 12, colors: ['blue', 'cyan'], name: 'Blue Tower' });
      P.tower(w, 'tower-4', 9, 19, { layers: 14, colors: ['purple', 'pink'], name: 'Purple Tower' });
      P.ramp(w, 'ramp', -16, -4, { yaw: 40 });
      w.addBall({ x: -14, y: 1.3, z: -2, color: 'red', name: 'Big Ball', thingId: 'ball' });
    },
    models: [{ id: 'robot', def: 'robot', x: -18, z: -10, yaw: 40 }],
    behaviors: {
      robot: [{ text: 'When I press space, push the ball forward.' }],
      ball: [{ text: 'When it bumps into a tower, play crash.' }],
      world: [{ text: 'When I click the ground, clone the ball there.' }],
    },
    shot: { target: [0, 4, 11], yaw: 40, pitch: 22, dist: 40 },
  },
  {
    id: 'alien-zoo',
    title: 'Alien Petting Zoo',
    summary: 'Cows in space! Feed them hay and watch them float.',
    by: { name: 'Wei', age: 8, city: 'Chengdu', country: 'China', flag: '🇨🇳' },
    tags: { genre: ['silly', 'sandbox'], topic: ['space', 'animals', 'aliens'] },
    theme: { ...SKY.space, ground: GROUND.moon },
    gravity: 0,
    build(w) {
      P.fence(w, 'pen-n', 0, 14, 18, { color: 'cyan' });
      P.fence(w, 'pen-w', -9, 7, 14, { yaw: 90, color: 'cyan' });
      P.fence(w, 'pen-e', 9, 7, 14, { yaw: 90, color: 'cyan' });
      P.hay(w, 'hay', -3, 9);
      P.station(w, 'base', 16, 22);
      P.crystal(w, 'crystal', -14, 16, { color: 'lime' });
    },
    models: [
      { id: 'cow', def: 'cow', x: -3, z: 4, yaw: 150, lift: 2.2, name: 'Space Cow' },
      { id: 'cow-2', def: 'cow', x: 4, z: 8, yaw: 220, lift: 4.5, name: 'Moo-nie' },
      { id: 'alien', def: 'alien', x: 4, z: -2, yaw: 190, name: 'Zookeeper Xi' },
      { id: 'ufo', def: 'ufo', x: -12, z: 0, yaw: 20 },
    ],
    behaviors: {
      world: [{ text: 'At the start, turn off gravity.' }],
      cow: [{ text: 'Forever, spin slowly and play moo.' }],
      'cow-2': [{ text: 'When I click it, play moo and jump.' }],
      alien: [{ text: 'When I click it, wave the left arm and say "Do not feed them after midnight!"' }],
    },
    shot: { target: [0, 3, 6], yaw: -8, pitch: 20, dist: 26 },
  },
  {
    id: 'construction-crew',
    title: 'Construction Crew',
    summary: 'Scoop the bricks, dump them, build a new house.',
    by: { name: 'Noah', age: 7, city: 'Toronto', country: 'Canada', flag: '🇨🇦' },
    tags: { genre: ['sandbox', 'building'], topic: ['vehicles', 'construction'] },
    theme: { ...SKY.day, ground: GROUND.sand },
    build(w) {
      P.road(w, 'road', [[0, -4, 40, 6]]);
      pile(w, 'pile', -6, 10, ['yellow', 'orange', 'red'], { rows: 3 });
      P.house(w, 'house', 10, 14, 'white', 'yellow', { name: 'New House' });
      [[-14, 2], [-12, 2], [16, 0]].forEach(([x, z], i) => P.flagPole(w, `cone-${i + 1}`, x, z, { color: 'orange', name: 'Cone', kind: 'cone', height: 1.6 }));
    },
    models: [
      { id: 'digger', def: 'digger', x: -8, z: 2, yaw: 160 },
      { id: 'truck', def: 'truck', x: 6, z: -4, yaw: 260 },
    ],
    behaviors: {
      digger: [{ text: ARROWS }, { text: 'When I press space, lower the scoop, wait 1 second, raise the scoop.' }],
      truck: [{ text: ARROWS }, { text: 'When I press space, raise the dump bed.' }],
    },
    shot: { target: [0, 2, 5], yaw: -12, pitch: 30, dist: 30 },
  },
  {
    id: 'hay-maze',
    title: 'Haunted Hay Maze',
    summary: 'Find your way out. The slimes come out at night...',
    by: { name: 'Zainab', age: 11, city: 'Cairo', country: 'Egypt', flag: '🇪🇬' },
    tags: { genre: ['spooky', 'puzzle'], topic: ['mazes', 'monsters'] },
    theme: { ...SKY.dusk, ground: GROUND.night },
    build(w) {
      const walls = [[-8, 0, 0], [0, 0, 0], [8, 0, 0], [-12, 6, 90], [-4, 6, 90], [4, 8, 0], [12, 6, 90], [-8, 12, 0], [6, 14, 0], [0, 18, 90]];
      walls.forEach(([x, z, yaw], i) => P.hay(w, `hay-${i + 1}`, x, z, { yaw, name: 'Hay Wall' }));
      P.lamp(w, 'lamp', 8, 18);
      P.flagPole(w, 'exit', 12, 20, { color: 'lime', name: 'Exit', kind: 'goal' });
      P.tree(w, 'tree', -16, 22, { leaf: 'darkgray', top: 'black' });
    },
    models: [
      { id: 'hero', def: 'hero', x: -4, z: -6, yaw: 170, name: 'Explorer' },
      { id: 'slime', def: 'slime', x: 0, z: 10, yaw: 200, name: 'Ghost Slime' },
      { id: 'slime-2', def: 'slime', x: 9, z: 4, yaw: 220, name: 'Night Slime' },
    ],
    behaviors: {
      hero: [{ text: ARROWS }],
      slime: [{ text: 'Forever, chase the explorer.' }, { text: 'When it touches the explorer, play boo and say "Boo!"' }],
      'slime-2': [{ text: 'Every 3 seconds, color it purple, wait 1 second, color it green.' }],
      exit: [{ text: 'When the explorer touches it, play yay and say "You escaped!"' }],
    },
    shot: { target: [0, 1.5, 7], yaw: -6, pitch: 36, dist: 30 },
  },
  {
    id: 'moon-base',
    title: 'Moon Base Alpha',
    summary: 'Land the ship, refuel at the base, launch the next mission.',
    by: { name: 'Ethan', age: 12, city: 'Sydney', country: 'Australia', flag: '🇦🇺' },
    tags: { genre: ['simulation', 'adventure'], topic: ['space', 'vehicles'] },
    theme: { ...SKY.space, ground: GROUND.moon },
    gravity: 0.2,
    build(w) {
      P.station(w, 'base', -6, 14);
      P.landingPad(w, 'pad', 8, 4);
      P.landingPad(w, 'pad-2', -12, 0);
      P.crystal(w, 'fuel', 4, 18, { color: 'yellow' });
      P.lamp(w, 'beacon', 0, 6);
    },
    models: [
      { id: 'spaceship', def: 'spaceship', x: 8, z: 4, yaw: 200, lift: 0.4 },
      { id: 'rocket', def: 'rocket', x: -12, z: 0, lift: 0.4 },
      { id: 'astronaut', def: 'astronaut', x: 0, z: 0, yaw: 180 },
    ],
    behaviors: {
      world: [{ text: 'At the start, set gravity to 0.2.' }],
      spaceship: [{ text: ARROWS }, { text: 'While I hold w, fly up. While I hold s, fly down.' }, { text: 'When it touches the pad, stop and broadcast landed.' }],
      astronaut: [{ text: 'When it hears landed, go to the spaceship and say "Refueling!"' }],
      rocket: [{ text: 'When I click it, say "Mission go!", play whoosh and rise for 5 seconds.' }],
    },
    shot: { target: [-1, 3, 6], yaw: -20, pitch: 24, dist: 32 },
  },
  {
    id: 'rodeo-ranch',
    title: 'Horse Ranch Rodeo',
    summary: 'Ride around the barrels as fast as you can.',
    by: { name: 'Camila', age: 10, city: 'Mexico City', country: 'Mexico', flag: '🇲🇽' },
    tags: { genre: ['racing', 'game'], topic: ['animals', 'horses', 'farms'] },
    theme: { ...SKY.warm, ground: GROUND.sand },
    build(w) {
      P.fence(w, 'fence-n', 0, 18, 26); P.fence(w, 'fence-s', 0, -6, 26);
      P.fence(w, 'fence-w', -13, 6, 24, { yaw: 90 }); P.fence(w, 'fence-e', 13, 6, 24, { yaw: 90 });
      [[-6, 2], [6, 2], [0, 12]].forEach(([x, z], i) => w.addStatic({ kind: 'barrel', name: 'Barrel', color: 'red', x, z, thingId: `barrel-${i + 1}`, boxes: [{ at: [0, 1.2, 0], size: [2, 2.4, 2], color: i === 2 ? 'blue' : 'red' }] }));
      P.hay(w, 'hay', 17, 10, { yaw: 90 });
      P.barn(w, 'barn', -2, 30);
    },
    models: [
      { id: 'horse', def: 'horse', x: -3, z: -2, yaw: 150, name: 'Relámpago' },
      { id: 'horse-2', def: 'horse', x: 8, z: 10, yaw: 230, name: 'Canela' },
      { id: 'farmer', def: 'farmer', x: 10, z: -3, yaw: 210, name: 'Judge Rosa' },
    ],
    behaviors: {
      horse: [{ text: ARROWS }, { text: 'When I press space, jump high and play neigh.' }],
      'horse-2': [{ text: 'Forever, go to the blue barrel, then go to the red barrel.' }],
      farmer: [{ text: 'When the horse touches a barrel, say "Penalty!"' }],
    },
    shot: { target: [0, 1.5, 6], yaw: -14, pitch: 34, dist: 32 },
  },
  {
    id: 'slime-soccer',
    title: 'Slime Soccer',
    summary: 'Robot vs. slimes. First to 3 goals wins.',
    by: { name: 'Arjun', age: 9, city: 'Singapore', country: 'Singapore', flag: '🇸🇬' },
    tags: { genre: ['sports', 'game'], topic: ['robots', 'monsters'] },
    theme: { ...SKY.day, ground: GROUND.grass },
    build(w) {
      slab(w, 'pitch', 0, 6, 30, 20, 'lime', { name: 'Pitch', kind: 'field', h: 0.1 });
      slab(w, 'line', 0, 6, 0.4, 20, 'white', { name: 'Halfway Line', kind: 'field', h: 0.14 });
      for (const [side, color] of [[-1, 'red'], [1, 'blue']]) {
        w.addStatic({ kind: 'goal', name: `${color === 'red' ? 'Red' : 'Blue'} Goal`, color, x: side * 15, z: 6, thingId: `goal-${color}`,
          boxes: [{ at: [0, 1.6, -3], size: [0.6, 3.2, 0.6], color: 'white' }, { at: [0, 1.6, 3], size: [0.6, 3.2, 0.6], color: 'white' }, { at: [0, 3.4, 0], size: [0.6, 0.6, 6.6], color }] });
      }
      w.addBall({ x: 0, y: 1.3, z: 6, color: 'white', name: 'Soccer Ball', thingId: 'ball', radius: 1 });
    },
    models: [
      { id: 'robot', def: 'robot', x: -6, z: 4, yaw: 100 },
      { id: 'slime', def: 'slime', x: 6, z: 8, yaw: -90, name: 'Goalie Gloop' },
      { id: 'slime-2', def: 'slime', x: 4, z: 2, yaw: -110, name: 'Striker Splat' },
    ],
    behaviors: {
      robot: [{ text: ARROWS }, { text: 'When I press space, push forward hard.' }],
      slime: [{ text: 'Forever, move 4 studs, then turn around.' }],
      'slime-2': [{ text: 'Forever, chase the ball.' }],
      'goal-blue': [{ text: 'When the ball touches it, play yay, say "GOAL!" and broadcast kickoff.' }],
    },
    shot: { target: [0, 1.5, 5], yaw: -4, pitch: 38, dist: 30 },
  },
  {
    id: 'bell-tower-mystery',
    title: 'The Bell Tower Mystery',
    summary: 'Who keeps ringing the bell at midnight? Ask around the village.',
    by: { name: 'Élodie', age: 10, city: 'Lyon', country: 'France', flag: '🇫🇷' },
    tags: { genre: ['story', 'mystery'], topic: ['towns', 'people'] },
    theme: { ...SKY.dusk, ground: GROUND.grass },
    build(w) {
      P.tower(w, 'bell-tower', 0, 16, { layers: 14, colors: ['white', 'tan'], name: 'Bell Tower', kind: 'tower' });
      P.house(w, 'house-1', -12, 10, 'tan', 'red', { name: 'Bakery' });
      P.house(w, 'house-2', 12, 10, 'white', 'blue', { name: 'Library' });
      P.fountain(w, 'fountain', 0, 4);
      P.lamp(w, 'lamp-1', -5, -2); P.lamp(w, 'lamp-2', 5, -2);
    },
    models: [
      { id: 'villager', def: 'villager', x: -4, z: 0, yaw: 160, name: 'Madame Odile' },
      { id: 'wizard', def: 'wizard', x: 5, z: 12, yaw: 200, name: 'The Stranger' },
      { id: 'villager-2', def: 'villager', x: 4, z: -4, yaw: 200, name: 'Petit Jean' },
    ],
    behaviors: {
      villager: [{ text: 'When I click it, say "I heard the bell at midnight!"' }],
      'villager-2': [{ text: 'When I click it, turn the head left and say "Shh... ask the stranger."' }],
      wizard: [{ text: 'When I click it, play ding and say "Perhaps it was... me."' }],
      'bell-tower': [{ text: 'Every 10 seconds, play ding.' }],
    },
    shot: { target: [0, 4, 7], yaw: 6, pitch: 22, dist: 32 },
  },
  {
    id: 'volcano-island',
    title: 'Volcano Island',
    summary: 'The volcano is erupting lava bricks! Get the dino to safety.',
    by: { name: 'Tane', age: 11, city: 'Auckland', country: 'New Zealand', flag: '🇳🇿' },
    tags: { genre: ['adventure', 'survival'], topic: ['volcanoes', 'dinosaurs', 'nature'] },
    theme: { ...SKY.warm, ground: GROUND.lava },
    build(w) {
      const top = P.hill(w, 'volcano', 0, 16, [[18, 18], [13, 13], [9, 9], [6, 6]], ['darkgray', 'darkgray', 'brown', 'brown']);
      slab(w, 'crater', 0, 16, 4, 4, 'orange', { name: 'Lava', kind: 'lava', y: top - 0.3, h: 0.5 });
      [[-6, 4, 'red'], [4, 6, 'orange'], [8, 12, 'red']].forEach(([x, z, c], i) => slab(w, `lava-${i + 1}`, x, z, 3, 2, c, { name: 'Lava Flow', kind: 'lava', h: 0.15 }));
      P.tree(w, 'fern-1', -14, 4, { leaf: 'green', top: 'lime', scale: 0.8 });
      P.tree(w, 'fern-2', 14, 0, { leaf: 'green', top: 'lime' });
    },
    models: [
      { id: 'dino', def: 'dino', x: -4, z: -4, yaw: 170 },
      { id: 'hero', def: 'hero', x: 4, z: -6, yaw: 200, name: 'Ranger' },
    ],
    behaviors: {
      volcano: [{ text: 'Every 2 seconds, throw an orange brick up.' }],
      dino: [{ text: ARROWS }, { text: 'When it touches lava, play ouch and jump.' }],
      hero: [{ text: 'Forever, follow the dino.' }],
    },
    shot: { target: [0, 3, 7], yaw: 10, pitch: 22, dist: 32 },
  },
  {
    id: 'pipe-speedrun',
    title: 'Pipe Maze Speedrun',
    summary: 'Moving platforms, warp pipes and a timer. Beat 30 seconds!',
    by: { name: 'Yuki', age: 12, city: 'Sapporo', country: 'Japan', flag: '🇯🇵' },
    tags: { genre: ['game', 'platformer', 'speedrun'], topic: ['heroes'] },
    theme: { sky: 0x7cc8ff, fog: [100, 200], hemi: [0xffffff, 0x6aa84f, 1.5], sun: [0xfff2cc, 2.4], ground: GROUND.grass },
    build(w) {
      P.pipe(w, 'pipe-1', -8, 0, 2.4); P.pipe(w, 'pipe-2', -2, 6, 4); P.pipe(w, 'pipe-3', 6, 4, 3);
      P.platform(w, 'lift', 2, 5, 12, 5, 5, { color: 'blue', name: 'Moving Platform', thickness: 0.8 });
      P.platform(w, 'high', 10, 7, 16, 5, 5, { color: 'brown', name: 'High Ledge', thickness: 0.8 });
      P.coin(w, 'coin-1', 2, 6.6, 12); P.coin(w, 'coin-2', 10, 8.6, 16); P.coin(w, 'coin-3', -2, 5.6, 6);
      P.block(w, 'block', -6, 5, 10);
      P.flagPole(w, 'goal', 11, 17, { color: 'green', name: 'Goal Flag', kind: 'goal', y: 7, height: 5 });
      P.cloud(w, 'cloud', -12, 16, 22);
    },
    models: [
      { id: 'hero', def: 'hero', x: -9, z: -6, yaw: 160 },
      { id: 'slime', def: 'slime', x: 3, z: -2, yaw: 90 },
    ],
    behaviors: {
      world: [{ text: 'At the start, say "Go! 30 seconds!"' }, { text: 'Every 1 second, broadcast tick.' }],
      hero: [{ text: ARROWS }, { text: 'When I press space, jump high.' }, { text: 'When it touches a pipe, play whoosh and jump high.' }],
      lift: [{ text: 'Forever, move 5 studs, wait 1 second, move back 5 studs, wait 1 second.' }],
      slime: [{ text: 'Forever, chase the hero.' }],
      goal: [{ text: 'When the hero touches it, play yay and say "New record!"' }],
      ...Object.fromEntries([1, 2, 3].map((n) => [`coin-${n}`, [{ text: 'When the hero touches it, play coin and disappear.' }]])),
    },
    shot: { target: [1, 4, 6], yaw: -28, pitch: 22, dist: 30 },
  },
  {
    id: 'harvest-helper',
    title: 'Harvest Helper',
    summary: 'Drive the tractor and help bring in the carrots and corn.',
    by: { name: 'Grace', age: 6, city: 'Nairobi', country: 'Kenya', flag: '🇰🇪' },
    tags: { genre: ['cozy', 'simulation'], topic: ['farms', 'vehicles'] },
    theme: { ...SKY.day, ground: GROUND.meadow },
    build(w) {
      P.crops(w, 'carrots', -6, 12, { rows: 4, length: 10, plant: 'orange', name: 'Carrots' });
      P.crops(w, 'corn', 8, 12, { rows: 3, length: 10, plant: 'yellow', leaf: 'green', name: 'Corn', tall: true });
      P.silo(w, 'silo', 16, 24);
      P.barn(w, 'barn', -6, 28);
      P.hay(w, 'hay', 14, 0);
    },
    models: [
      { id: 'tractor', def: 'tractor', x: 0, z: 0, yaw: 160 },
      { id: 'farmer', def: 'farmer', x: -8, z: 2, yaw: 200, name: 'Mama Wanjiru' },
    ],
    behaviors: {
      tractor: [{ text: ARROWS }],
      farmer: [{ text: 'When I click it, wave the left arm and say "Jambo!"' }],
    },
    shot: { target: [2, 2, 10], yaw: -10, pitch: 30, dist: 34 },
  },
  {
    id: 'knight-school',
    title: 'Knight School',
    summary: 'Practice on the training dummies, then joust with the horse.',
    by: { name: 'Iwona', age: 9, city: 'Kraków', country: 'Poland', flag: '🇵🇱' },
    tags: { genre: ['battle', 'training'], topic: ['castles', 'knights', 'horses'] },
    theme: { ...SKY.day, ground: GROUND.grass },
    build(w) {
      P.dummy(w, 'dummy-1', -6, 8); P.dummy(w, 'dummy-2', 0, 10); P.dummy(w, 'dummy-3', 6, 8);
      P.tent(w, 'tent', -14, 16, { color: 'red', name: 'Armory Tent' });
      P.tent(w, 'tent-2', 14, 16, { color: 'blue', name: 'Stable Tent' });
      P.flagPole(w, 'banner', 0, 20, { color: 'red', name: 'School Banner', height: 7 });
      P.fence(w, 'fence', 0, -6, 20, { color: 'tan' });
    },
    models: [
      { id: 'knight', def: 'knight', x: -2, z: 2, yaw: 190 },
      { id: 'knight-2', def: 'knight', x: 4, z: 1, yaw: 170, name: 'Sir Bartek' },
      { id: 'horse', def: 'horse', x: 10, z: 4, yaw: 220 },
    ],
    behaviors: {
      knight: [{ text: ARROWS }, { text: 'When I press s, swing the sword arm.' }],
      'knight-2': [{ text: 'Every 2 seconds, swing the sword arm.' }],
      'dummy-1': [{ text: 'When the knight touches it, play bonk and wiggle.' }],
      horse: [{ text: 'When I click it, play neigh and jump.' }],
    },
    shot: { target: [0, 2.5, 8], yaw: 4, pitch: 24, dist: 28 },
  },
  {
    id: 'asteroid-dodge',
    title: 'Starfighter Asteroid Dodge',
    summary: 'Fly through the asteroid field. Blast the ones in your way.',
    by: { name: 'Malik', age: 11, city: 'Dubai', country: 'United Arab Emirates', flag: '🇦🇪' },
    tags: { genre: ['game', 'shooter'], topic: ['space', 'vehicles'] },
    theme: { ...SKY.space, ground: GROUND.moon },
    gravity: 0,
    build(w) {
      const rocks = [[-6, 5, 10, 3], [5, 7, 14, 3.4], [-2, 10, 20, 2.6], [9, 4, 6, 2.2], [-10, 8, 18, 2.8], [3, 12, 26, 3], [12, 9, 22, 2.4], [-8, 4, 2, 2]];
      rocks.forEach(([x, y, z, size], i) => P.asteroid(w, `asteroid-${i + 1}`, x, y, z, { size, color: i % 3 === 0 ? 'brown' : i % 3 === 1 ? 'darkgray' : 'gray', spin: 0 }));
      P.crystal(w, 'crystal', 14, 30, { color: 'pink' });
    },
    models: [{ id: 'spaceship', def: 'spaceship', x: 0, z: -2, yaw: 180, lift: 4 }],
    behaviors: {
      world: [{ text: 'At the start, turn off gravity.' }, { text: 'Every 3 seconds, drop a gray brick from the sky.' }],
      spaceship: [{ text: ARROWS }, { text: 'While I hold w, fly up. While I hold s, fly down.' }, { text: 'When I press space, play laser and shoot a red brick.' }, { text: 'When it bumps into an asteroid, play crash and say "Shields down!"' }],
    },
    shot: { target: [0, 5, 8], yaw: -12, pitch: 14, dist: 28 },
  },
  {
    id: 'pond-picnic',
    title: 'Cozy Pond Picnic',
    summary: 'A quiet afternoon by the pond. The cows say hello.',
    by: { name: 'Lucía', age: 7, city: 'Madrid', country: 'Spain', flag: '🇪🇸' },
    tags: { genre: ['cozy', 'calm'], topic: ['nature', 'animals'] },
    theme: { ...SKY.day, ground: GROUND.meadow },
    build(w) {
      P.pond(w, 'pond', 4, 10, 12, 8);
      slab(w, 'blanket', -7, 4, 5, 5, 'red', { name: 'Picnic Blanket', kind: 'blanket', h: 0.12 });
      slab(w, 'blanket-stripe', -7, 4, 5, 1, 'white', { name: 'Picnic Blanket', kind: 'blanket', h: 0.14 });
      P.tree(w, 'tree-1', -12, 14, { scale: 1.3 }); P.tree(w, 'tree-2', 14, 20, { leaf: 'lime', top: 'green' });
      P.tree(w, 'tree-3', -2, 24, { scale: 1.1 });
      P.fence(w, 'fence', 14, 2, 10, { yaw: 90, color: 'white' });
    },
    models: [
      { id: 'villager', def: 'villager', x: -7, z: 3, yaw: 160, name: 'Lucía' },
      { id: 'cow', def: 'cow', x: 9, z: 2, yaw: 230, name: 'Rosita' },
      { id: 'cow-2', def: 'cow', x: -2, z: 16, yaw: 170, name: 'Nube' },
    ],
    behaviors: {
      villager: [{ text: 'When I click it, wave the right arm and say "¡Hola!"' }],
      cow: [{ text: 'Every 6 seconds, play moo and nod the head.' }],
      'cow-2': [{ text: 'Wander slowly.' }],
    },
    shot: { target: [0, 1.5, 8], yaw: -6, pitch: 30, dist: 28 },
  },
];

export const KID_WORLDS_BY_ID = Object.fromEntries(KID_WORLDS.map((w) => [w.id, w]));

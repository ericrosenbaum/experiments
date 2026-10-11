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
import { FIG } from './minifig.js';

const b = (x, y, z, w, h, d, color, extra = {}) => ({ at: [x, y, z], size: [w, h, d], color, ...extra });

// A minifigure: physics is a few plain boxes (hidden); what you see is built
// by minifig.js from `figure` (colors, face, torso print, hat, held things).
// Parts: a turning head and two arms that swing forward from the shoulder.
// Chassis origin is the top of the hips (figure space y = FIG.torsoY).
function minifig({ id, name, blurb, category = 'people', examples, figure, arms = ['left arm', 'right arm'] }) {
  const O = FIG.torsoY;
  const hide = { hidden: true };
  const [sx, sy] = FIG.shoulder;
  const armBox = (side) => [b(side * 0.25, -0.95, 0.05, 0.55, 1.9, 0.6, figure.torso ?? 'red', hide)];
  return {
    id, name, blurb, category, examples, figure,
    color: figure.torso ?? 'red',
    motion: 'glide',
    bricks: [
      b(0, FIG.torsoY / 2 - O, 0, FIG.torsoBottomW, FIG.torsoY, 1.11, figure.legs ?? 'blue', hide),
      b(0, FIG.torsoY + FIG.torsoH / 2 - O, 0, 1.7, FIG.torsoH, FIG.torsoD, figure.torso ?? 'red', hide),
    ],
    parts: [
      { name: 'head', kind: 'hinge', pivot: [0, FIG.neckY - O, 0], axis: [0, 1, 0], sign: 1, limits: [-90, 90], strength: 1,
        bricks: [b(0, 0.8, 0, 1.36, 1.4, 1.36, figure.head ?? 'yellow', hide)] },
      { name: arms[0], kind: 'hinge', pivot: [sx, sy - O, 0], axis: [1, 0, 0], sign: -1, limits: [-60, 180], strength: 1.5, bricks: armBox(1) },
      { name: arms[1], kind: 'hinge', pivot: [-sx, sy - O, 0], axis: [1, 0, 0], sign: -1, limits: [-60, 180], strength: 1.5, bricks: armBox(-1) },
    ],
  };
}

const PEOPLE = [
  minifig({
    id: 'knight', name: 'Knight',
    blurb: 'A brave knight with a sword, a shield and a helmet.',
    examples: ['When I press space, swing the sword arm.', 'When I press s, raise the shield arm, wait 1 second, lower the shield arm.', 'When it bumps into the dragon, say "Back, dragon!" and back up.', 'Go to the castle.'],
    figure: { torso: 'gray', arms: 'gray', legs: 'black', print: 'knight', face: 'stern', hat: 'helmet', hatColor: 'gray', held: { right: 'sword', left: 'shield' } },
    arms: ['shield arm', 'sword arm'],
  }),
  minifig({
    id: 'hero', name: 'Hero',
    blurb: 'A jumpy hero in a red cap and overalls, made for platform games.',
    examples: ['When I press space, jump high.', 'When it bumps into a coin, play coin.', 'When I press w, wave the right arm and say "Hi!"'],
    figure: { torso: 'red', arms: 'red', legs: 'blue', print: 'overalls', face: 'mustache', hat: 'cap', hatColor: 'red' },
  }),
  minifig({
    id: 'astronaut', name: 'Astronaut',
    blurb: 'A classic spaceman in a white suit and helmet.',
    examples: ['When I press w, fly up. When I press s, fly down.', 'When I press h, wave the left arm and say "To the stars!"', 'Go to the rocket.'],
    figure: { torso: 'white', arms: 'white', legs: 'white', print: 'space', hat: 'space', hatColor: 'white' },
  }),
  minifig({
    id: 'farmer', name: 'Farmer',
    blurb: 'A farmer in a straw hat with a pitchfork.',
    examples: ['Every 5 seconds, go to the nearest cow.', 'When I press h, wave the left arm and say "Howdy!"', 'When I press space, jump.'],
    figure: { torso: 'green', arms: 'green', legs: 'blue', print: 'overalls', face: 'freckles', hat: 'straw', hatColor: 'tan', held: { right: 'pitchfork' } },
  }),
  minifig({
    id: 'villager', name: 'Villager',
    blurb: 'A friendly villager in a button-up shirt.',
    examples: ['Wander slowly.', 'When I press h, wave the right arm and say "Lovely day!"', 'Go to the fountain.'],
    figure: { torso: 'blue', arms: 'blue', legs: 'tan', print: 'buttons', hat: 'hair', hatColor: 'brown' },
  }),
  minifig({
    id: 'wizard', name: 'Wizard',
    blurb: 'A wizard with a pointy hat and a magic wand.',
    examples: ['When I press t, wave the right arm, play ding and make a copy of the nearest tree.', 'When I press space, say "Abracadabra!" and turn a random color.', 'Forever, turn the head left, wait 1 second, turn the head right.'],
    figure: { torso: 'purple', arms: 'purple', legs: 'blue', face: 'smile', hat: 'wizard', hatColor: 'blue', held: { right: 'wand' } },
  }),
  minifig({
    id: 'golfer', name: 'Golfer',
    blurb: 'A golfer in a sun visor, putter in hand.',
    examples: ['When it hears "in the hole", wave the left arm and say "Nice putt!"', 'When I press space, swing the right arm.', 'Follow the ball slowly.'],
    figure: { torso: 'white', arms: 'white', legs: 'tan', print: 'buttons', face: 'smile', hat: 'cap', hatColor: 'blue', held: { right: 'club' } },
  }),
  minifig({
    id: 'alien', name: 'Alien', category: 'space',
    blurb: 'A friendly green alien with big eyes and bobbly antennae.',
    examples: ['When I press h, wave the left arm and say "Greetings!"', 'Forever, turn the head left, wait 1 second, turn the head right.', 'When I press space, jump and play laser.'],
    figure: { torso: 'green', arms: 'green', legs: 'green', head: 'lime', hands: 'lime', print: 'zip', face: 'alien', hat: 'antennae', hatColor: 'pink' },
  }),
];

export const LIBRARY = [
  {
    id: 'racecar',
    category: 'vehicles',
    examples: ["When I press space, honk and jump high.", "When it bumps into a tree, say \"Ouch!\" and back up, then turn right.", "When I press f, throw a red brick.", "Forever, go to the ball fast."],
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
    category: 'characters',
    examples: ["When I press h, raise both arms and say \"Hello!\" then lower both arms.", "Forever, turn the head left, wait 1 second, turn the head right, wait 1 second.", "When I press space, dance.", "Wander. When it bumps into anything, play beep and turn around."],
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
    category: 'vehicles',
    examples: ["When I press space, lift the scoop, wait 1 second, lower the scoop.", "Go to the Rainbow Tower fast, then lift the scoop.", "When I press the arrows, drive and steer."],
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
    category: 'vehicles',
    examples: ["When I press space, put a brick in the throwing arm, wait 1 second, then fling.", "Face the castle.", "Every 3 seconds, put a red brick in the throwing arm, wait 1 second and fling."],
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
    category: 'animals',
    examples: ["Chase the nearest car and roar.", "Forever, wag the tail.", "When it sees a red brick, roar and chomp.", "When I press space, jump high and roar."],
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
  {
    id: 'tractor',
    name: 'Tractor',
    blurb: 'Big back wheels, little front wheels, and a front loader that lifts.',
    category: 'vehicles',
    examples: ['When I press space, lift the loader, wait 1 second, lower the loader.', 'Go to the hay fast, then lift the loader.', 'When I press h, honk twice.'],
    color: 'green',
    motion: 'wheels',
    density: 2,
    wheelPower: 2,
    bricks: [
      b(0, 0, 0.2, 2.4, B, 5.2, 'green'),
      b(0, 1.0, 1.6, 2, 0.8, 2.4, 'green'),
      b(0, 0.2, 2.85, 1.6, 0.8, 0.1, 'darkgray', { studs: false }),
      b(0.6, 1.9, 1.8, 0.3, 1.0, 0.3, 'darkgray', { studs: false }),
      b(0, 1.4, -1.2, 2.2, 1.6, 2, 'cyan', { studs: false }),
      b(0, 2.4, -1.2, 2.6, P, 2.4, 'green'),
    ],
    parts: [
      { name: 'front left wheel', kind: 'wheel', side: 'left', at: [1.6, -0.3, 2.0], radius: 0.9, width: 0.7 },
      { name: 'front right wheel', kind: 'wheel', side: 'right', at: [-1.6, -0.3, 2.0], radius: 0.9, width: 0.7 },
      { name: 'back left wheel', kind: 'wheel', side: 'left', at: [2.0, 0.3, -1.6], radius: 1.5, width: 1.0 },
      { name: 'back right wheel', kind: 'wheel', side: 'right', at: [-2.0, 0.3, -1.6], radius: 1.5, width: 1.0 },
      {
        name: 'loader', kind: 'hinge', pivot: [0, 0.4, 2.8], axis: [1, 0, 0], sign: -1, limits: [-10, 70], strength: 2,
        bricks: [
          b(1.3, 0, 1.0, 0.3, 0.3, 2.0, 'yellow', { studs: false }),
          b(-1.3, 0, 1.0, 0.3, 0.3, 2.0, 'yellow', { studs: false }),
          b(0, -0.4, 2.2, 3.0, 1.0, 0.4, 'yellow', { studs: false }),
        ],
      },
    ],
  },
  {
    id: 'truck',
    name: 'Dump Truck',
    blurb: 'A truck with a dump bed that tips up to pour out whatever it carries.',
    category: 'vehicles',
    examples: ['When I press space, raise the dump bed, wait 1 second, lower the dump bed.', 'When I press b, drop 3 bricks on top.', 'When I press the arrows, drive and steer.'],
    color: 'blue',
    motion: 'wheels',
    density: 1.5,
    wheelPower: 2,
    bricks: [
      b(0, 0, 0, 3, 0.6, 7, 'darkgray', { studs: false }),
      b(0, 1.2, 2.4, 3, 1.8, 2.2, 'blue'),
      b(0, 1.6, 3.55, 2.4, 0.8, 0.1, 'cyan', { studs: false }),
    ],
    parts: [
      { name: 'front left wheel', kind: 'wheel', side: 'left', at: [1.95, -0.4, 2.3], radius: 1.0, width: 0.8 },
      { name: 'front right wheel', kind: 'wheel', side: 'right', at: [-1.95, -0.4, 2.3], radius: 1.0, width: 0.8 },
      { name: 'back left wheel', kind: 'wheel', side: 'left', at: [1.95, -0.4, -2.3], radius: 1.0, width: 0.8 },
      { name: 'back right wheel', kind: 'wheel', side: 'right', at: [-1.95, -0.4, -2.3], radius: 1.0, width: 0.8 },
      {
        name: 'dump bed', kind: 'hinge', pivot: [0, 0.3, -3.3], axis: [1, 0, 0], sign: -1, limits: [0, 60], strength: 3,
        bricks: [
          b(0, 0.2, 2.3, 3, P, 4.6, 'yellow'),
          b(1.4, 0.8, 2.3, 0.2, 0.8, 4.6, 'yellow', { studs: false }),
          b(-1.4, 0.8, 2.3, 0.2, 0.8, 4.6, 'yellow', { studs: false }),
          b(0, 0.8, 4.5, 2.6, 0.8, 0.2, 'yellow', { studs: false }),
        ],
      },
    ],
  },
  {
    id: 'slime',
    name: 'Slime',
    blurb: 'A wobbly purple blob with a chomping mouth. Every platform game needs one.',
    category: 'characters',
    examples: ['Forever, move 6 studs, then turn around.', 'When it bumps into the hero, chomp and say "Gotcha!"', 'Every 2 seconds, jump.'],
    color: 'purple',
    motion: 'glide',
    bricks: [
      b(0, 0, 0, 2.2, 1.4, 2.2, 'purple'),
      b(0, 0.9, 0, 1.4, P, 1.4, 'purple'),
      b(0.45, 0.2, 1.15, 0.4, 0.4, 0.1, 'white', { studs: false }),
      b(-0.45, 0.2, 1.15, 0.4, 0.4, 0.1, 'white', { studs: false }),
      b(0.45, 0.15, 1.25, 0.2, 0.2, 0.1, 'black', { studs: false }),
      b(-0.45, 0.15, 1.25, 0.2, 0.2, 0.1, 'black', { studs: false }),
    ],
    parts: [
      {
        name: 'mouth', kind: 'hinge', pivot: [0, -0.3, 1.2], axis: [1, 0, 0], sign: -1, limits: [-30, 30], strength: 8, density: 2,
        bricks: [b(0, 0, 0.2, 1.2, 0.3, 0.4, 'black', { studs: false })],
      },
    ],
  },
  {
    id: 'spaceship',
    name: 'Spaceship',
    blurb: 'A starfighter with folding wings and a spinning radar. It can fly up and down.',
    category: 'space',
    examples: ['When I press w, fly up. When I press s, fly down.', 'When I press space, play laser and shoot a red brick.', 'Forever, spin the radar.', 'When I press f, fold the wings up.'],
    color: 'white',
    motion: 'glide',
    bricks: [
      b(1.2, -1.0, 0, 0.4, P, 3, 'darkgray', { studs: false }),
      b(-1.2, -1.0, 0, 0.4, P, 3, 'darkgray', { studs: false }),
      b(1.2, -0.5, 0, 0.4, 0.6, 0.6, 'gray', { studs: false }),
      b(-1.2, -0.5, 0, 0.4, 0.6, 0.6, 'gray', { studs: false }),
      b(0, 0.4, 0, 2.4, B, 6, 'white'),
      b(0, 0.3, 3.6, 1.4, 0.8, 1.2, 'white', { studs: false }),
      b(0, 1.4, 0.8, 1.4, 0.8, 2, 'cyan', { studs: false }),
      b(0.7, 0.4, -3.3, 0.8, 0.8, 0.6, 'darkgray', { studs: false }),
      b(-0.7, 0.4, -3.3, 0.8, 0.8, 0.6, 'darkgray', { studs: false }),
      b(0.7, 0.4, -3.65, 0.5, 0.5, 0.1, 'orange', { studs: false }),
      b(-0.7, 0.4, -3.65, 0.5, 0.5, 0.1, 'orange', { studs: false }),
    ],
    parts: [
      {
        name: 'left wing', kind: 'hinge', pivot: [1.2, 0.2, -0.8], axis: [0, 0, 1], sign: 1, limits: [-20, 60], strength: 1.5,
        bricks: [
          b(1.4, 0, 0, 2.8, 0.3, 2.4, 'blue', { studs: false }),
          b(2.6, 0.55, 0, 0.4, 0.8, 1.6, 'red', { studs: false }),
        ],
      },
      {
        name: 'right wing', kind: 'hinge', pivot: [-1.2, 0.2, -0.8], axis: [0, 0, 1], sign: -1, limits: [-20, 60], strength: 1.5,
        bricks: [
          b(-1.4, 0, 0, 2.8, 0.3, 2.4, 'blue', { studs: false }),
          b(-2.6, 0.55, 0, 0.4, 0.8, 1.6, 'red', { studs: false }),
        ],
      },
      {
        name: 'radar', kind: 'hinge', pivot: [0, 1.0, -1.5], axis: [0, 1, 0], sign: 1, limits: [-90, 90], strength: 0.5,
        bricks: [
          b(0, 0.3, 0, 0.2, 0.6, 0.2, 'gray', { studs: false }),
          b(0, 0.7, 0, 1.2, 0.2, 0.3, 'red', { studs: false }),
        ],
      },
    ],
  },
  {
    id: 'ufo',
    name: 'UFO',
    blurb: 'A flying saucer with a spinning glass dome. Beep boop.',
    category: 'space',
    examples: ['Forever, spin the dome.', 'Wander. Every 3 seconds, play beep.', 'When I press w, fly up. When I press s, fly down.'],
    color: 'gray',
    motion: 'glide',
    bricks: [
      b(1.2, -1.3, 1.2, 0.4, 0.6, 0.4, 'gray', { studs: false }),
      b(-1.2, -1.3, 1.2, 0.4, 0.6, 0.4, 'gray', { studs: false }),
      b(1.2, -1.3, -1.2, 0.4, 0.6, 0.4, 'gray', { studs: false }),
      b(-1.2, -1.3, -1.2, 0.4, 0.6, 0.4, 'gray', { studs: false }),
      b(0, -0.7, 0, 3, 0.6, 3, 'darkgray', { studs: false }),
      b(0, -0.1, 0, 6, 0.6, 6, 'gray', { studs: false }),
      b(0, 0.4, 0, 4.6, P, 4.6, 'gray', { studs: false }),
      b(3.05, -0.1, 0, 0.1, 0.3, 0.6, 'yellow', { studs: false }),
      b(-3.05, -0.1, 0, 0.1, 0.3, 0.6, 'yellow', { studs: false }),
      b(0, -0.1, 3.05, 0.6, 0.3, 0.1, 'yellow', { studs: false }),
      b(0, -0.1, -3.05, 0.6, 0.3, 0.1, 'yellow', { studs: false }),
    ],
    parts: [
      {
        name: 'dome', kind: 'hinge', pivot: [0, 0.6, 0], axis: [0, 1, 0], sign: 1, limits: [-180, 180], strength: 1,
        bricks: [
          b(0, 0.5, 0, 2.6, 1.0, 2.6, 'cyan', { studs: false }),
          b(0, 1.4, 0, 0.2, 0.8, 0.2, 'gray', { studs: false }),
          b(0, 2.0, 0, 0.5, P, 0.5, 'lime', { studs: false }),
        ],
      },
    ],
  },
  {
    id: 'rocket',
    name: 'Rocket',
    blurb: 'A tall rocket with a spinning nose cone. Make it rise to blast off.',
    category: 'space',
    examples: ['When I press space, say "3, 2, 1, blast off!", play whoosh and rise fast.', 'Forever, spin the nose cone.', 'When I press the up arrow, rise for 3 seconds then stop.'],
    color: 'white',
    motion: 'glide',
    bricks: [
      b(1.3, -2.4, 0, 0.6, 1.6, 0.3, 'red', { studs: false }),
      b(-1.3, -2.4, 0, 0.6, 1.6, 0.3, 'red', { studs: false }),
      b(0, -2.4, 1.3, 0.3, 1.6, 0.6, 'red', { studs: false }),
      b(0, -2.4, -1.3, 0.3, 1.6, 0.6, 'red', { studs: false }),
      b(0, -2.6, 0, 2, B, 2, 'white'),
      b(0, -0.8, 0, 2, 2.4, 2, 'white'),
      b(0, 0.6, 0, 2, P, 2, 'red'),
      b(0, 1.6, 0, 2, 1.6, 2, 'white'),
      b(0, 1.6, 1.05, 0.8, 0.8, 0.1, 'cyan', { studs: false }),
    ],
    parts: [
      {
        name: 'nose cone', kind: 'hinge', pivot: [0, 2.4, 0], axis: [0, 1, 0], sign: 1, limits: [-180, 180], strength: 1,
        bricks: [
          b(0, 0.4, 0, 1.4, 0.8, 1.4, 'red', { studs: false }),
          b(0, 1.1, 0, 0.8, 0.6, 0.8, 'red', { studs: false }),
          b(0, 1.6, 0, 0.3, P, 0.3, 'yellow', { studs: false }),
        ],
      },
    ],
  },
  {
    id: 'dragon',
    name: 'Dragon',
    blurb: 'A red dragon with flapping wings, a swinging tail and a fiery roar. It can fly.',
    category: 'animals',
    examples: ['When I press space, flap the wings, roar and rise.', 'Forever, wag the tail.', 'Chase the knight and roar.', 'When it bumps into the castle, roar and throw a orange brick.'],
    color: 'red',
    motion: 'glide',
    density: 1.5,
    bricks: [
      b(1.2, -2.0, 1.6, 1, 1.6, 1.2, 'red', { studs: false }),
      b(-1.2, -2.0, 1.6, 1, 1.6, 1.2, 'red', { studs: false }),
      b(1.2, -2.0, -1.6, 1, 1.6, 1.2, 'red', { studs: false }),
      b(-1.2, -2.0, -1.6, 1, 1.6, 1.2, 'red', { studs: false }),
      b(0, 0, 0, 3.4, 2 * B, 5, 'red'),
      b(0, -1.3, 0.2, 2.6, P, 3.6, 'yellow', { studs: false }),
      b(0, 1.4, 1.2, 0.6, P, 0.8, 'orange'),
      b(0, 1.4, -0.2, 0.6, P, 0.8, 'orange'),
      b(0, 1.4, -1.6, 0.6, P, 0.8, 'orange'),
    ],
    parts: [
      {
        name: 'head', kind: 'hinge', pivot: [0, 0.8, 2.5], axis: [1, 0, 0], sign: -1, limits: [-30, 40], strength: 2,
        bricks: [
          b(0, 0.6, 1.0, 1.6, 1.6, 2.0, 'red', { studs: false }),
          b(0, 1.0, 2.6, 2.2, 1.4, 1.6, 'red', { studs: false }),
          b(0.7, 1.4, 3.45, 0.3, 0.3, 0.1, 'yellow', { studs: false }),
          b(-0.7, 1.4, 3.45, 0.3, 0.3, 0.1, 'yellow', { studs: false }),
          b(0.6, 2.1, 2.0, 0.25, 0.6, 0.25, 'white', { studs: false }),
          b(-0.6, 2.1, 2.0, 0.25, 0.6, 0.25, 'white', { studs: false }),
        ],
      },
      {
        name: 'tail', kind: 'hinge', pivot: [0, 0.2, -2.5], axis: [0, 1, 0], sign: 1, limits: [-50, 50], strength: 1.5,
        bricks: [
          b(0, 0, -1.6, 1.8, B, 3.2, 'red'),
          b(0, -0.1, -4.0, 1.0, 0.8, 1.8, 'red', { studs: false }),
          b(0, 0.4, -4.6, 0.3, 0.6, 0.5, 'orange', { studs: false }),
        ],
      },
      {
        name: 'left wing', kind: 'hinge', pivot: [1.7, 0.9, 0.4], axis: [0, 0, 1], sign: 1, limits: [-30, 60], strength: 2,
        bricks: [
          b(1.7, 0, 0, 3.4, 0.2, 2.4, 'orange', { studs: false }),
          b(1.7, 0.2, 0.9, 3.4, 0.2, 0.4, 'red', { studs: false }),
        ],
      },
      {
        name: 'right wing', kind: 'hinge', pivot: [-1.7, 0.9, 0.4], axis: [0, 0, 1], sign: -1, limits: [-30, 60], strength: 2,
        bricks: [
          b(-1.7, 0, 0, 3.4, 0.2, 2.4, 'orange', { studs: false }),
          b(-1.7, 0.2, 0.9, 3.4, 0.2, 0.4, 'red', { studs: false }),
        ],
      },
    ],
  },
  {
    id: 'horse',
    name: 'Horse',
    blurb: 'A brown horse with a nodding head and a swishing tail. Saddle included.',
    category: 'animals',
    examples: ['When I press the arrows, drive and steer.', 'Every 3 seconds, swish the tail.', 'When I press n, nod the head and say "Neigh!"', 'Follow the knight.'],
    color: 'brown',
    motion: 'glide',
    bricks: [
      b(0.8, -2.0, 1.6, 0.8, 2.0, 0.8, 'brown', { studs: false }),
      b(-0.8, -2.0, 1.6, 0.8, 2.0, 0.8, 'brown', { studs: false }),
      b(0.8, -2.0, -1.6, 0.8, 2.0, 0.8, 'brown', { studs: false }),
      b(-0.8, -2.0, -1.6, 0.8, 2.0, 0.8, 'brown', { studs: false }),
      b(0, 0, 0, 2.2, 2.0, 4.6, 'brown'),
      b(0, 1.2, -0.2, 2.0, P, 1.6, 'red'),
    ],
    parts: [
      {
        name: 'head', kind: 'hinge', pivot: [0, 0.6, 2.3], axis: [1, 0, 0], sign: -1, limits: [-40, 30], strength: 1.5,
        bricks: [
          b(0, 1.0, 0.5, 1.2, 2.4, 1.2, 'brown', { studs: false }),
          b(0, 2.0, 1.6, 1.1, 1.0, 2.0, 'brown', { studs: false }),
          b(0, 1.6, -0.15, 0.3, 1.8, 0.3, 'black', { studs: false }),
          b(0.6, 2.2, 1.9, 0.1, 0.2, 0.2, 'black', { studs: false }),
          b(-0.6, 2.2, 1.9, 0.1, 0.2, 0.2, 'black', { studs: false }),
        ],
      },
      {
        name: 'tail', kind: 'hinge', pivot: [0, 0.6, -2.3], axis: [0, 1, 0], sign: 1, limits: [-45, 45], strength: 1,
        bricks: [b(0, -0.6, -0.3, 0.4, 1.6, 0.6, 'black', { studs: false })],
      },
    ],
  },
  {
    id: 'cow',
    name: 'Cow',
    blurb: 'A spotty cow. Nods, swishes its tail, and says moo.',
    category: 'animals',
    examples: ['Every 5 seconds, play moo and wag the tail.', 'When I press m, nod the head and play moo.', 'Wander slowly.'],
    color: 'white',
    motion: 'glide',
    bricks: [
      b(0.9, -1.6, 1.5, 0.8, 1.6, 0.8, 'white', { studs: false }),
      b(-0.9, -1.6, 1.5, 0.8, 1.6, 0.8, 'white', { studs: false }),
      b(0.9, -1.6, -1.5, 0.8, 1.6, 0.8, 'white', { studs: false }),
      b(-0.9, -1.6, -1.5, 0.8, 1.6, 0.8, 'white', { studs: false }),
      b(0, 0, 0, 2.4, 1.6, 4.2, 'white'),
      b(1.25, 0.2, 0.5, 0.1, 0.8, 1.2, 'black', { studs: false }),
      b(-1.25, -0.1, -0.8, 0.1, 0.8, 1.4, 'black', { studs: false }),
      b(0.3, 0.85, -0.6, 1.0, 0.1, 1.2, 'black', { studs: false }),
      b(0, -0.95, -0.6, 0.8, 0.3, 0.8, 'pink', { studs: false }),
    ],
    parts: [
      {
        name: 'head', kind: 'hinge', pivot: [0, 0.4, 2.1], axis: [1, 0, 0], sign: -1, limits: [-40, 30], strength: 1.5,
        bricks: [
          b(0, 0.3, 0.8, 1.4, 1.4, 1.6, 'white', { studs: false }),
          b(0, -0.1, 1.75, 1.2, 0.6, 0.3, 'pink', { studs: false }),
          b(0.55, 1.2, 0.6, 0.2, P, 0.2, 'tan', { studs: false }),
          b(-0.55, 1.2, 0.6, 0.2, P, 0.2, 'tan', { studs: false }),
          b(0.75, 0.5, 1.3, 0.1, 0.2, 0.2, 'black', { studs: false }),
          b(-0.75, 0.5, 1.3, 0.1, 0.2, 0.2, 'black', { studs: false }),
        ],
      },
      {
        name: 'tail', kind: 'hinge', pivot: [0, 0.6, -2.1], axis: [0, 1, 0], sign: 1, limits: [-45, 45], strength: 1,
        bricks: [
          b(0, -0.6, -0.15, 0.2, B, 0.3, 'white', { studs: false }),
          b(0, -1.35, -0.15, 0.35, 0.3, 0.4, 'black', { studs: false }),
        ],
      },
    ],
  },
];

LIBRARY.push(...PEOPLE);

export const LIBRARY_BY_ID = Object.fromEntries(LIBRARY.map((d) => [d.id, d]));

export const CATEGORIES = [
  ['people', 'People'], ['vehicles', 'Vehicles'], ['characters', 'Characters'], ['animals', 'Animals'], ['space', 'Space'],
];

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

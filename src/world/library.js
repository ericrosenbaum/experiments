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
import { RUN, kick } from './games.js';

const b = (x, y, z, w, h, d, color, extra = {}) => ({ at: [x, y, z], size: [w, h, d], color, ...extra });

// A minifigure: physics is a few plain boxes (hidden); what you see is built
// by minifig.js from `figure` (colors, face, torso print, hat, held things).
// Parts: a turning head and two arms that swing forward from the shoulder.
// Chassis origin is the top of the hips (figure space y = FIG.torsoY).
function minifig({ id, name, blurb, category = 'people', examples, figure, arms = ['left arm', 'right arm'], behaviors }) {
  const O = FIG.torsoY;
  const hide = { hidden: true };
  const [sx, sy] = FIG.shoulder;
  const armBox = (side) => [b(side * 0.25, -0.95, 0.05, 0.55, 1.9, 0.6, figure.torso ?? 'red', hide)];
  return {
    id, name, blurb, category, examples, figure, behaviors,
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
    id: 'kelvin', name: 'Kelvin',
    blurb: 'A moody fellow in a black pinstripe suit and a purple vest, with wild black hair.',
    examples: ['When I press h, wave the right arm and say "Hmph."', 'Go to the race car.', 'When it bumps into a brick, say "Watch it!" and back up.', 'Forever, turn the head left, wait 1 second, turn the head right.'],
    figure: { torso: 'black', arms: 'black', hands: '#f1c9a3', legs: 'black', print: 'suit', legPrint: 'tails', face: 'scowl', hat: 'shaggy', hatColor: 'black' },
  }),
  minifig({
    id: 'red-player', name: 'Red Player',
    blurb: 'A Red team player in a red jersey and cap, ready for any game you make up.',
    examples: ['When I press space, kick the ball if it is close.', 'When it hears "red scores", jump and say "Goal!"', 'Go to the ball fast.', 'When it bumps into a blue player, play bonk and back up.'],
    behaviors: [RUN, kick('"ball"')], // ready to play: arrows run, space kicks the nearest ball
    figure: { torso: 'red', arms: 'red', legs: 'white', print: 'jersey', face: 'smile', hat: 'cap', hatColor: 'red' },
  }),
  minifig({
    id: 'blue-player', name: 'Blue Player',
    blurb: 'A Blue team player in a blue jersey and cap, ready for any game you make up.',
    examples: ['When I press space, kick the ball if it is close.', 'When it hears "blue scores", jump and say "Goal!"', 'Go to the ball fast.', 'When it bumps into a red player, play bonk and back up.'],
    behaviors: [RUN, kick('"ball"')], // ready to play: arrows run, space kicks the nearest ball
    figure: { torso: 'blue', arms: 'blue', legs: 'white', print: 'jersey', face: 'freckles', hat: 'cap', hatColor: 'blue' },
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
      b(0, P, -0.5, 2, P, 2, 'black'), // seat
      b(0, (P + B) / 2, -1.75, 2, B, 0.5, 'black', { studs: false }), // seat back
      b(1.5, (P + B) / 2, -3.5, 1, B, 1, 'red'),
      b(-1.5, (P + B) / 2, -3.5, 1, B, 1, 'red'),
      b(0, P / 2 + B + P / 2, -3.5, 4, P, 1.4, 'black'),
      b(1.2, 0.05, 4.05, 0.8, 0.4, 0.1, 'yellow', { studs: false }),
      b(-1.2, 0.05, 4.05, 0.8, 0.4, 0.1, 'yellow', { studs: false }),
    ],
    // the driver sits on the seat (top at 1.5 plates), reaching for the dashboard
    rider: { at: [0, 1.5 * P, -0.7], reach: 60, figure: { torso: 'white', arms: 'white', legs: 'white', print: 'zip', face: 'smile', hat: 'space', hatColor: 'red' } },
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
    examples: ["Chase the nearest car.", "Forever, wag the tail.", "When it sees a red brick, roar and chomp.", "When I press space, jump high and roar."],
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
    examples: ['Forever, spin the dome.', 'Wander. When I press b, play beep.', 'When I press w, fly up. When I press s, fly down.'],
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
    examples: ['When I press space, flap the wings, roar and rise.', 'Forever, wag the tail.', 'Chase the knight.', 'When it bumps into the castle, roar and throw a orange brick.'],
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
    id: 'turtle',
    name: 'Turtle',
    blurb: 'A Logo turtle. With its pen down it draws a line wherever it goes, and it moves and turns exactly, so shapes come out right.',
    category: 'animals',
    examples: ['When I press s, put the pen down and draw a square.', 'When I press c, erase.', 'When I press r, set the pen color to red.'],
    color: 'green',
    motion: 'glide',
    precise: true, // move() and turn() end exactly on target (see runtime q_move/q_turn)
    bricks: [
      b(1.1, -0.65, 1.0, 0.8, 0.7, 0.8, 'lime', { studs: false }),
      b(-1.1, -0.65, 1.0, 0.8, 0.7, 0.8, 'lime', { studs: false }),
      b(1.1, -0.65, -1.0, 0.8, 0.7, 0.8, 'lime', { studs: false }),
      b(-1.1, -0.65, -1.0, 0.8, 0.7, 0.8, 'lime', { studs: false }),
      b(0, -0.3, -1.85, 0.4, 0.3, 0.7, 'lime', { studs: false }), // tail
      b(0, -0.2, 0, 2.6, P, 3.2, 'green', { studs: false }), // belly
      b(0, 0.5, 0, 2.4, 1.0, 3.0, 'green', { studs: false }), // shell
      b(0, 1.3, 0, 1.6, 0.6, 2.2, 'green'), // top of the shell
      b(0.4, 1.66, 0.5, 0.5, 0.1, 0.5, 'lime', { studs: false }), // spots, just above the top of the shell
      b(-0.4, 1.66, -0.5, 0.5, 0.1, 0.5, 'lime', { studs: false }),
    ],
    parts: [
      {
        name: 'head', kind: 'hinge', pivot: [0, 0.1, 1.55], axis: [0, 1, 0], sign: 1, limits: [-60, 60], strength: 1,
        bricks: [
          b(0, 0.1, 0.55, 1.0, 0.9, 1.1, 'lime', { studs: false }),
          b(0.42, 0.3, 0.85, 0.2, 0.2, 0.2, 'black', { studs: false }),
          b(-0.42, 0.3, 0.85, 0.2, 0.2, 0.2, 'black', { studs: false }),
        ],
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

// The skyship, built to match a real brick build from four photos: a white
// boat hull with a rising bow, a black stern deck with a round gray drum, a
// see-through cabin with a lever on top, four poles carrying a long hose,
// and a yellow ladder clipped to its right side. It floats: no gravity, so
// it hovers wherever it is. Bow is +Z; +X is its left side.
const DECK = 1.3; // top of the hull
const HOSE_GRAY = '#7d8186'; // flat silver
// two pairs of poles: the front pair stands further to the left
const POLES = [[1.2, 2.55], [1.2, 1.55], [-0.5, -1.15], [-0.5, -2.1]];
// The hose is one long loop through the clamps on top of the poles, crossing
// itself at the front pair: a loop reaching forward over the bow, a wide
// loop swinging out to the left and back over the stern, and a short run
// from the back pair's clamps to the front pair's.
const HOSE = [
  // forward from the front pair, out over the bow and back
  [1.2, 6.45, 2.55], [0.3, 6.5, 4.0], [-0.5, 6.35, 6.0], [-0.3, 5.8, 7.6], [0.7, 5.2, 8.3],
  [1.6, 4.9, 7.2], [2.0, 5, 5.0], [2.0, 5.9, 3.4], [1.8, 6.45, 1.6],
  // down past the cabin on the left, round the stern and back along the top
  [1.8, 6.35, 0.4], [2.6, 5.8, -1.0], [3.8, 5.45, -3.4], [4.3, 5.25, -5.9], [3.8, 5.3, -7.3],
  [3.0, 5.55, -8.0], [1.9, 6.05, -8.1], [1.0, 6.55, -7.5], [0.2, 6.85, -6.3], [-0.3, 6.95, -3.4],
  // through the back pair's clamps and over to the front pair's
  [-0.5, 6.4, -1.6], [-0.1, 6.6, -0.2], [0.7, 6.55, 1.0], [1.2, 6.45, 1.55],
];

const SKYSHIP = {
  id: 'skyship',
  name: 'Skyship',
  blurb: 'A flying boat with a see-through cabin, a lever to pull and a ladder that swings out. It floats in the air.',
  category: 'vehicles',
  examples: ['While I hold w, fly up. While I hold s, fly down.', 'When I press space, pull the lever and play whoosh.', 'When I press l, swing the ladder.', 'Wander slowly.'],
  color: 'white',
  motion: 'glide',
  floats: true,
  bricks: [
    // the hull, open on top; its bow rises to a blunt tip. The stern end is
    // solid and sits on the black deck.
    b(0, DECK / 2, 3.725, 6, DECK, 12.45, 'white', { shape: 'hull', tip: 3.4, taper: 5.5, lift: 1.2, sheer: 0, wall: 0.7, floor: 0.5, deadrise: 0.35 }),
    b(0, DECK / 2, -3.3, 6, DECK, 1.6, 'white', { studs: false }),
    b(0, (DECK + 0.4) / 2, -5.425, 6, DECK - 0.4, 2.65, 'white', { studs: false }),
    // black stern deck with a yellow plate beside it, the drum on top
    b(-0.5, 0.2, -7.6, 6, 0.4, 7, 'black'),
    b(3.0, 0, -8.0, 1, 0.4, 4, 'yellow'),
    b(0.4, 1.6, -9.4, 3.4, 2.4, 3.4, 'gray', { shape: 'container' }),
    // the left gunwale: a tan log, a red brick, white at the stern
    b(2.5, DECK + 0.3, 1.45, 1, 1, 3.9, 'tan', { shape: 'round', axis: 'z' }),
    b(2.5, DECK + 0.2, -2.25, 1, 0.4, 3.5, 'white', { studs: false }),
    b(2.5, DECK + 0.625, -2.25, 1, 0.45, 3.5, 'red', { studs: false }),
    b(2.5, DECK + 0.5, -5.375, 1, 1, 2.75, 'white', { studs: false }),
    b(1.15, DECK + 0.5, -4.675, 1.7, 1, 4.15, 'white', { studs: false }),
    // the right gunwale: white bricks, a clear brick, and a gray roller by the cabin
    b(-2.5, DECK + 0.5, -1.05, 1, 1, 2.9, 'white', { studs: false }),
    b(-2.5, DECK + 1.1, -1.8, 1, 0.2, 1, 'white', { shape: 'round' }),
    b(-2.5, DECK + 1.1, -0.8, 1, 0.2, 1, 'white', { shape: 'round' }),
    b(-2.5, DECK + 0.4, 0.85, 0.9, 0.8, 0.9, 'cyan', { glass: true, studs: false }),
    b(-2.2, DECK + 0.5, -4.8, 1, 1, 4, 'gray', { shape: 'round', axis: 'z' }),
    // the bow deck: a long red tile, with a gray clip at the tip
    b(-0.6, 0.8, 6.2, 2, 0.7, 5, 'white', { studs: false }),
    b(-0.6, 1.35, 6.65, 2, 0.4, 6, 'red', { studs: false }),
    b(0.9, 1.45, 9.3, 1, 0.5, 1.6, 'gray', { studs: false }),
    b(0.9, 1.85, 9.6, 0.5, 0.3, 0.6, 'gray', { studs: false }),
    b(1.0, 1.15, 8.1, 1, 0.8, 1, 'white', { shape: 'round' }),
    b(1.0, 1.15, 7.0, 1.2, 0.8, 1.2, 'white', { studs: false }),
    b(1.6, 1.1, 5.6, 1, 0.6, 1, 'white', { shape: 'round' }),
    b(1.6, 1.1, 4.6, 1, 0.6, 1, 'white', { shape: 'round' }),
    b(1.1, 0.6, 7.5, 1.6, 0.2, 4.6, 'white', { studs: false }),
    b(2.3, DECK + 0.3, 3.75, 0.9, 0.9, 0.9, 'cyan', { glass: true, studs: false }),
    // along the right side, forward: a white block with a tan tile and a red
    // knob, then the grille under a gray plate and another red knob
    b(-2.15, 0.95, 4.9, 1.5, 0.9, 2.6, 'white', { studs: false }),
    b(-2.2, DECK + 0.3, 5.45, 1, 0.4, 2, 'tan', { studs: false }),
    b(-2.2, DECK + 0.4, 3.95, 1, 0.6, 1, 'red', { shape: 'round', studs: false }),
    b(-2.3, 1.05, 2.55, 1, 1.1, 2, 'white', { studs: false }),
    b(-2.3, 2.2, 2.55, 1, 1.2, 2, 'darkgray', { shape: 'grille' }),
    b(-2.3, 3.0, 2.55, 1, 0.4, 2, 'gray'),
    b(-2.3, 3.5, 2.05, 1, 0.6, 1, 'red', { shape: 'round', studs: false }),
    // a white wall amidships
    b(-1.45, 0.975, -0.45, 1.1, 0.95, 3.9, 'white', { studs: false }),
    b(-1.45, 2.05, 0.5, 1.1, 1.2, 2, 'white', { studs: false }),
    b(-1.45, 2.05, -1.5, 1.1, 1.2, 2, 'white', { studs: false }),
    b(-1.5, 2.75, -1.3, 1, 0.2, 2, 'white'),
    // four poles, each with a collar and a hose clamp
    ...POLES.flatMap(([x, z]) => [
      b(x, 3.65, z, 0.35, 6.3, 0.35, 'gray', { shape: 'bar' }),
      b(x, 5.85, z, 0.9, 0.2, 0.9, 'gray', { shape: 'round', studs: false }),
      b(x, 6.35, z, 0.6, 0.7, 0.6, HOSE_GRAY, { shape: 'round', studs: false }),
    ]),
    // fittings where the hose meets the poles
    b(1.2, 6.25, 3.35, 0.5, 0.5, 1.5, HOSE_GRAY, { shape: 'round', axis: 'z' }),
    b(-0.5, 6.5, -1.6, 0.5, 0.5, 1.6, HOSE_GRAY, { shape: 'round', axis: 'z' }),
    // the see-through cabin and what's on its roof
    b(-0.7, DECK + 1.55, -4.8, 2, 3.1, 4.2, 'cyan', { shape: 'panel', glass: true }),
    b(-0.7, 4.5, -3.75, 1, 0.2, 1, 'red', { shape: 'round', studs: false }),
    b(-0.7, 4.5, -4.7, 0.9, 0.2, 0.9, 'cyan', { glass: true, studs: false }),
    b(-0.7, 4.75, -5.6, 0.9, 0.7, 0.9, 'yellow', { shape: 'round', studs: false }),
    b(-0.7, 4.5, -6.55, 1, 0.2, 1, 'red', { shape: 'round', studs: false }),
    // the ladder's clips, outside the right gunwale
    b(-4.15, DECK + 0.15, 3.0, 0.35, 0.35, 3, 'yellow', { shape: 'bar', axis: 'z' }),
    b(-3.6, DECK + 0.15, 2.0, 1.2, 0.5, 0.5, 'yellow', { shape: 'round', axis: 'x' }),
    b(-3.6, DECK + 0.15, 4.0, 1.2, 0.5, 0.5, 'yellow', { shape: 'round', axis: 'x' }),
  ],
  hoses: [{ points: HOSE, closed: true, radius: 0.13, color: HOSE_GRAY }],
  parts: [
    {
      // sticks out to the right and up; positive pulls it up
      name: 'lever', kind: 'hinge', pivot: [-0.7, 5.1, -5.6], axis: [0, 0, 1], sign: -1, limits: [-30, 60], strength: 0.5,
      bricks: [
        b(-0.74, 0.32, 0.24, 0.18, 1.69, 0.18, 'black', { shape: 'bar', rot: [0.289, 0.18, 1.11] }),
        b(-1.49, 0.64, 0.47, 0.3, 0.3, 0.3, 'black', { shape: 'round', studs: false }),
      ],
    },
    {
      // leans in a little; positive swings it out over the right side
      name: 'ladder', kind: 'hinge', pivot: [-4.15, DECK + 0.15, 3.0], axis: [0, 0, 1], sign: 1, limits: [0, 90], strength: 1,
      bricks: [b(0.65, 3.65, 0, 3, 7.4, 0.3, 'yellow', { shape: 'ladder', rot: [0, Math.PI / 2, -0.175], rotOrder: 'ZYX', studs: false })],
    },
  ],
};

LIBRARY.push(SKYSHIP, ...PEOPLE);

export const LIBRARY_BY_ID = Object.fromEntries(LIBRARY.map((d) => [d.id, d]));

// Models first, then the things in objects.js.
export const CATEGORIES = [
  ['people', 'People'], ['vehicles', 'Vehicles'], ['characters', 'Characters'], ['animals', 'Animals'], ['space', 'Space'],
  ['balls', 'Balls'], ['game', 'Game Pieces'], ['buildings', 'Buildings & Props'], ['bricks', 'Bricks'],
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

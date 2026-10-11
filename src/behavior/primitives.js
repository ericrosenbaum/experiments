// The high-level primitives a behavior program can call. This file is the
// single source of truth for: the sandbox worker (which functions exist),
// the host (which commands it accepts), the LLM prompt (what Claude may use),
// and the in-app help.
//
// A program belongs to one "thing": a model, an assembly (a house, a tree, a
// loose brick), one brick picked out of an assembly, or the World itself.
//
// Coordinates: the world is measured in studs. One stud = the width of a
// 1x1 brick. A brick is 1.2 studs tall, a plate 0.4. "Forward" is the way
// the model faces. Speeds are studs per second; angles are degrees.

export const SOUNDS = ['beep', 'boing', 'honk', 'pop', 'crash', 'ding', 'whoosh', 'laser', 'roar', 'coin', 'drum', 'yay', 'moo'];

export const COLORS = {
  red: 0xd01712, blue: 0x0a64d6, yellow: 0xf7c600, green: 0x2a9d3a, black: 0x1b1d20,
  white: 0xf2f3f2, orange: 0xfe8a18, purple: 0x8d4fc0, pink: 0xf28ec3, brown: 0x6b3f22,
  gray: 0x9ba19d, darkgray: 0x5b6670, tan: 0xe4cd9e, lime: 0xa5ca18, cyan: 0x3cc6e6,
};

export const SPEED_WORDS = { 'very slow': 2, slowly: 3, slow: 3, normal: 7, fast: 13, quickly: 13, 'very fast': 20, 'super fast': 24 };

// Each entry: [signature, description, kind]. kind: event | action | wait | sense | util
export const PRIMITIVES = [
  // events
  ['onStart(fn)', 'Run fn when the program starts.', 'event'],
  ['onKey(key, fn)', 'Run fn when a key is pressed while this thing is selected (only the selected thing hears keys). key: "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " " (space), or a letter like "a".', 'event'],
  ['onKeyUp(key, fn)', 'Run fn when a key is released.', 'event'],
  ['whileKey(key, fn)', 'Run fn over and over (about 30 times a second) while a key is held down. Use for steering.', 'event'],
  ['onTouch(filter, fn)', 'Run fn(thing) when this model bumps into something. filter can be null (anything but the ground), a color "red", a kind "tree" | "house" | "brick" | "model" | "ground", or a thing("...") reference. thing = {name, kind, color, id}.', 'event'],
  ['onClick(fn)', 'Run fn when someone clicks on this thing (for the World: clicks on the ground).', 'event'],
  ['onMessage(name, fn)', 'Run fn when anything calls broadcast(name). Lets things talk to each other.', 'event'],
  ['onClone(fn)', 'Run fn in a copy right after clone() makes it (copies also run their other behaviors, like onStart and forever).', 'event'],
  ['forever(fn)', 'Run fn again and again, forever. A short pause is added between runs automatically.', 'event'],
  ['every(seconds, fn)', 'Run fn every so many seconds.', 'event'],

  // continuous movement (keeps going until changed)
  ['drive(speed)', 'Start moving forward at speed (negative = backward). Keeps going until stop() or drive(0). Wheeled models spin their wheels; others glide.', 'action'],
  ['steer(rate)', 'Start turning at rate degrees per second. Positive = left, negative = right. Keeps going until steer(0) or stop().', 'action'],
  ['rise(speed)', 'Start moving straight up at speed (negative = down), like flying or a lift. rise(0) or stop() ends it.', 'action'],
  ['stop()', 'Stop driving, steering and spinning parts.', 'action'],
  ['jump(power)', 'Hop up. power 1..10, default 5.', 'action'],
  ['push(direction, power)', 'Give the model a shove. direction: "forward" | "backward" | "left" | "right" | "up". power 1..10.', 'action'],

  // movement that finishes (await these)
  ['await move(distance, speed)', 'Move forward distance studs (negative = backward), then stop.', 'wait'],
  ['await turn(degrees)', 'Turn in place by degrees. Positive = left, negative = right.', 'wait'],
  ['await goTo(target, speed)', 'Drive until near target: a thing("...") reference, a place(x, z), or a kind like "tree" (the nearest one).', 'wait'],
  ['await face(target)', 'Turn to face a target (same kinds of targets as goTo).', 'wait'],

  // parts (identified by name or pointing)
  ['part(name).spin(speed)', 'Spin a part continuously (degrees per second, negative = other way). part(name).spin(0) stops it.', 'action'],
  ['await part(name).turnTo(degrees)', 'Swing a hinged part (arm, head, tail, bucket...) to an angle. 0 is its starting pose.', 'wait'],
  ['await part(name).wiggle(times)', 'Wiggle a part back and forth, like a wave or a wag.', 'wait'],
  ['part(name).color(color)', 'Change a part\'s color.', 'action'],
  ['color(color)', 'Change this thing\'s color (a model\'s body, every brick of an assembly, or the World\'s ground).', 'action'],

  // world effects
  ['spawn(options)', 'Make a new brick. options: {color, size: "1x1" | "2x2" | "2x4" | "1x4" | "4x4", at: "front" | "back" | "top" | "here" | place(x,z), launch: speed (throws it forward), from: part name (spawn near that part)}. All optional.', 'action'],
  ['play(sound)', 'Play a sound: ' + SOUNDS.map((s) => `"${s}"`).join(', ') + '.', 'action'],
  ['say(text, seconds)', 'Show a speech bubble above the model.', 'action'],
  ['broadcast(name)', 'Send a message everything can hear with onMessage(name, ...).', 'action'],
  ['await clone(what, where)', 'Make a copy, with all its behaviors. what: null for this thing, or another thing: thing("...") or a kind like "tree" (the nearest one). where (optional): place(x, z), "front", "back", "left", "right" or "above"; leave it out for a clear spot right beside. Returns the copy as {name, kind, color, id}, or null if there are too many copies already.', 'wait'],
  ['remove()', 'Take this thing out of the world (copies are gone for good; Reset world brings the original back).', 'action'],
  ['gravity(amount)', 'World rules only: set gravity for everything. 1 = normal, 0 = everything floats, 0.3 = moon, negative = things fall up.', 'action'],

  // waiting & sensing
  ['await wait(seconds)', 'Pause this script.', 'wait'],
  ['await look(distance)', 'What is straight ahead within distance studs (default 20)? Returns {name, kind, color, id, distance} or null.', 'sense'],
  ['await nearest(filter)', 'Nearest thing matching filter (kind, color, or null for anything). Returns {name, kind, color, id, distance, direction} or null. direction is degrees, positive = to the left.', 'sense'],
  ['await touching(filter)', 'true if currently touching something matching filter.', 'sense'],
  ['await position()', 'This thing\'s {x, y, z, heading}. y is height above the ground.', 'sense'],

  // references and helpers
  ['thing(id)', 'A reference to a specific thing in the world that the kid pointed at.', 'util'],
  ['place(x, z)', 'A reference to a spot on the ground.', 'util'],
  ['isClone()', 'true when this program is running in a copy made by clone().', 'util'],
  ['is(thing, filter)', 'true if a thing (from look, nearest or onTouch) matches a filter like "red", "tree" or {color: "red", kind: "brick"}.', 'util'],
  ['random(min, max)', 'A random whole number between min and max.', 'util'],
  ['log(...values)', 'Print to the program log (for debugging).', 'util'],
];

// Commands the host accepts from a sandbox (fire-and-forget).
export const HOST_COMMANDS = new Set([
  'drive', 'steer', 'rise', 'stop', 'jump', 'push', 'partSpin', 'partColor', 'color',
  'spawn', 'play', 'say', 'broadcast', 'remove', 'gravity', 'log',
]);

// Queries the host answers asynchronously (the sandbox awaits a reply).
export const HOST_QUERIES = new Set([
  'move', 'turn', 'goTo', 'face', 'partTurnTo', 'partWiggle', 'look', 'nearest', 'touching', 'position', 'clone',
]);

export function primitivesReference() {
  const groups = { event: 'Events', action: 'Actions', wait: 'Things that take time (use await)', sense: 'Sensing (use await)', util: 'Helpers' };
  let out = '';
  for (const [kind, title] of Object.entries(groups)) {
    out += `\n## ${title}\n`;
    for (const [sig, desc, k] of PRIMITIVES) if (k === kind) out += `- ${sig} — ${desc}\n`;
  }
  return out;
}

// Offline compiler: each sentence must compile to code that parses, uses
// only known primitives, and covers the phrases we expect kids to type.
import assert from 'node:assert/strict';
import { compileLocal } from '../src/behavior/compiler.js';
import { LIBRARY_BY_ID } from '../src/world/library.js';
import { PRIMITIVES } from '../src/behavior/primitives.js';

const API = [...new Set(PRIMITIVES.map(([sig]) => sig.replace(/^await /, '').match(/^(\w+)/)[1]))];
const AsyncFunction = (async () => {}).constructor;

function check(text, modelId, expect) {
  const r = compileLocal(text, LIBRARY_BY_ID[modelId]);
  assert.doesNotThrow(() => new AsyncFunction(...API, r.code), `syntax: ${text}\n${r.code}`);
  for (const e of [].concat(expect)) {
    assert.ok(e instanceof RegExp ? e.test(r.code) : r.code.includes(e), `"${text}" should produce ${e}\n---\n${r.code}\n--- unknown: ${r.unknown}`);
  }
  return r;
}

check('when I press the up arrow, drive forward', 'racecar', ['onKey("ArrowUp"', 'drive(7)', 'onKeyUp("ArrowUp"', 'drive(0)']);
check('while I hold left, turn left', 'racecar', ['onKey("ArrowLeft"', /steer\(\d+\)/, 'steer(0)']);
check('when I press space, honk and jump high', 'racecar', ['play("honk")', 'jump(9)']);
check('when it bumps into a tree, say "Ouch!" and back up', 'racecar', ['onTouch("tree"', 'say("Ouch!")', 'await move(-5']);
check('forever, wave the left arm and turn the head right', 'robot', ['forever(', 'part("left arm").wiggle(', 'part("head").turnTo(-60)']);
check('when I click it, raise both arms then say hi', 'robot', ['onClick(', 'part("left arm").turnTo(90)', 'part("right arm").turnTo(90)', 'say("hi")']);
check('go to {thing:tower|Rainbow Tower} fast', 'digger', ['goTo(thing("tower"), 13)']);
check('when I press f, throw a red brick', 'racecar', ['onKey("f"', 'spawn({color: "red", launch: 18})']);
check('when I press space, put a brick in the {part:throwing arm} then fling', 'catapult', ['spawn({from: "throwing arm"})', 'part("throwing arm").turnTo(130)']);
check('every 2 seconds, drop a blue brick', 'dino', ['every(2', 'spawn({color: "blue", at: "top"})']);
check('chase the nearest ball', 'dino', ['forever(', 'goTo("ball"']);
check('wander', 'robot', ['forever(', 'move(random(']);
check('when it sees a red brick, roar and wag the tail', 'dino', ['look(15)', 'is(seen, {color: "red", kind: "brick"})', 'play("roar")', 'part("tail").wiggle(']);
check('when it hears go, drive forward fast', 'racecar', ['onMessage("go"', 'drive(13)']);
check('when I press b, tell everyone go', 'robot', ['broadcast("go")']);
check('spin around 2 times and turn blue', 'robot', ['await turn(720)', 'color("blue")']);
check('when I press g, go to {place:10,-5}', 'robot', ['goTo(place(10, -5), 7)']);
check('{part:head} spins fast', 'robot', ['part("head").spin(650)']);
check('when I press space, lift the scoop, wait 1 second, lower the scoop', 'digger', ['part("scoop").turnTo(90)', 'wait(1)', 'part("scoop").turnTo(0)']);
check('when I press d, dance', 'robot', ['play("yay")']);
const r = check('when I press x, fly to the moon', 'robot', []);
assert.deepEqual(r.unknown, ['fly to the moon']);
console.log('compiler: all checks passed');

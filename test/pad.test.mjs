// The key pad finds each key a program listens to, names what it does, and
// groups keys the way a kid would read them.
import assert from 'node:assert/strict';
import { keyLabels, padGroups, padHtml } from '../src/ui/pad.js';
import { compileLocal } from '../src/behavior/compiler.js';
import { LIBRARY_BY_ID } from '../src/world/library.js';

const arrows = compileLocal('When I press the up arrow, drive forward. When I press the down arrow, drive backward. While I hold left, turn left. While I hold right, turn right.', LIBRARY_BY_ID.racecar).code;
const fly = compileLocal('While I hold w, fly up. While I hold s, fly down.', LIBRARY_BY_ID.spaceship).code;
const sword = 'onKey("x", async () => { await part("sword arm").turnTo(90); await part("sword arm").turnTo(0); });';
const labels = { ...keyLabels(arrows), ...keyLabels(fly), ...keyLabels(sword) };
assert.deepEqual(padGroups(labels).map((g) => [g.label, g.keys.join(' ')]), [
  ['move', 'ArrowUp ArrowLeft ArrowDown ArrowRight'],
  ['up and down', 'w s'],
  ['sword', 'x'],
]);
assert.equal(padGroups(keyLabels('onKey("ArrowLeft", () => steer(60)); onKey("ArrowRight", () => steer(-60));'))[0].label, 'turn');
assert.equal(padGroups(keyLabels('onKey(" ", () => { play("honk"); jump(5); });'))[0].label, 'jump');
// w sits above s on the pad, like on a keyboard
const html = padHtml([{ kind: 'letters', keys: ['w', 's'], label: 'up and down' }]);
assert.match(html, /data-key="w" style="grid-row:1/);
assert.match(html, /data-key="s" style="grid-row:2/);
console.log('pad: all checks passed');

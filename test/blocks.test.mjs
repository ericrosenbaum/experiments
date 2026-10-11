// Every premade program draws as blocks without falling back to raw code, and
// the main shapes come out where the JavaScript has them.
import assert from 'node:assert/strict';
import { renderBlocks } from '../src/ui/blocks.js';
import { WORLDS } from '../src/world/worlds.js';

for (const w of WORLDS) for (const list of Object.values(w.behaviors)) for (const b of list) {
  if (!b.code) continue;
  const html = renderBlocks(b.code);
  assert.ok(!html.includes('k-other') && !html.includes('bk-error'), `${w.id}: "${b.text}" should draw without raw code`);
}

const html = renderBlocks('// wave hi\nonKey(" ", async () => {\n  if (await touching("red")) { play("honk"); } else { await part("left arm").turnTo(90); }\n  for (let i = 0; i < 3; i++) jump(5);\n});');
for (const s of ['bk-hat', 'space', 'bk-note', 'wave hi', 'touching', 'else', 'swing', 'left arm', 'repeat', 'jump with power']) assert.ok(html.includes(s), `blocks should include ${s}`);
assert.ok(renderBlocks('onKey(').includes('bk-error'));
console.log('blocks: all checks passed');

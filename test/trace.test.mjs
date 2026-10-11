// Tracing keeps programs valid and working, and every id it reports is a
// block the blocks view drew (so it can light up).
import assert from 'node:assert/strict';
import { instrument } from '../src/behavior/trace.js';
import { renderBlocks } from '../src/ui/blocks.js';
import { WORLDS } from '../src/world/worlds.js';

const AsyncFunction = (async () => {}).constructor;
const programs = [];
for (const w of WORLDS) for (const list of Object.values(w.behaviors)) for (const b of list) if (b.code) programs.push(b.code);
programs.push('onKey("x", async () => {\n  for (let i = 0; i < 3; i++) { if (i === 1) continue; jump(i); }\n  outer: while (true) { break outer; }\n  const f = () => ({ a: 1 });\n  if (isClone()) return; else play("pop");\n});');

for (const code of programs) {
  const traced = instrument(code);
  assert.doesNotThrow(() => new AsyncFunction('__on', '__off', traced), `instrumented code should parse:\n${traced}`);
  const blocks = new Set([...renderBlocks(code).matchAll(/data-at="(\d+)"/g)].map((m) => +m[1]));
  for (const [, id] of traced.matchAll(/__on\((\d+)\)/g)) assert.ok(blocks.has(+id), `traced id ${id} should be a block in:\n${code}`);
}

// Same results as before, with balanced on/off, including early returns.
const code = 'let n = 0;\nasync function f(x) {\n  if (x > 2) return x * 2;\n  n = n + x;\n  await wait(0);\n  return n;\n}\nonStart(async () => { log(await f(1), await f(5)); });';
const out = [];
const counts = new Map();
let start;
const api = {
  onStart: (fn) => { start = fn; }, wait: () => Promise.resolve(), log: (...v) => out.push(...v),
  __on: (id) => counts.set(id, (counts.get(id) ?? 0) + 1), __off: (id) => counts.set(id, counts.get(id) - 1),
};
await new AsyncFunction(...Object.keys(api), instrument(code))(...Object.values(api));
await start();
assert.deepEqual(out, [1, 10]);
assert.ok(counts.size > 3 && [...counts.values()].every((c) => c === 0), 'every __on should be matched by __off');
console.log('trace: all checks passed');

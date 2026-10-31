// Tracing keeps programs valid and working, and every id it reports is a
// block the blocks view drew (so it can light up), both for the code as
// written and for the code the blocks write after an edit.
import assert from 'node:assert/strict';
import { instrument } from '../src/behavior/trace.js';
import { codeToBlocks } from '../src/blocks/fromcode.js';
import { Blockly, toCode } from '../src/blocks/blockly.js';
import { WORLDS } from '../src/world/worlds.js';
import { PROGRAMS } from './blocks-programs.js';

const AsyncFunction = (async () => {}).constructor;
const programs = [];
for (const w of WORLDS) for (const list of Object.values(w.behaviors)) for (const b of list) if (b.code) programs.push(b.code);
programs.push('onKey("x", async () => {\n  for (let i = 0; i < 3; i++) { if (i === 1) continue; jump(i); }\n  outer: while (true) { break outer; }\n  const f = () => ({ a: 1 });\n  if (isClone()) return; else play("pop");\n});');
programs.push(...PROGRAMS);

// (a statement inside a gray block of JavaScript lights up with nothing)
const checkIds = (code, ids) => {
  const traced = instrument(code);
  const { raws } = codeToBlocks(code);
  assert.doesNotThrow(() => new AsyncFunction('__on', '__off', '__hat', '__def', traced), `instrumented code should parse:\n${traced}`);
  for (const [, id] of traced.matchAll(/__on\((\d+)\)/g)) assert.ok(ids.has(+id) || raws.some(([a, b]) => +id > a && +id < b), `traced id ${id} should be a block in:\n${code}`);
};
for (const code of programs) {
  const r = codeToBlocks(code);
  checkIds(code, new Set(Object.values(r.at)));
  // the code the blocks write
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(r.json, ws);
  const again = toCode(ws);
  ws.dispose();
  checkIds(again.code, new Set(Object.values(again.at)));
}

// Same results as before, with balanced on/off, including early returns.
const code = 'let n = 0;\nasync function f(x) {\n  if (x > 2) return x * 2;\n  n = n + x;\n  await wait(0);\n  return n;\n}\nonStart(async () => { log(await f(1), await f(5)); });';
const out = [];
const counts = new Map();
let start;
const api = {
  onStart: (fn) => { start = fn; }, wait: () => Promise.resolve(), log: (...v) => out.push(...v),
  __on: (id) => counts.set(id, (counts.get(id) ?? 0) + 1), __off: (id) => counts.set(id, counts.get(id) - 1),
  __hat: (id) => hats.push(id), __def: (id, fn) => defs.set(id, fn),
};
const hats = [], defs = new Map();
await new AsyncFunction(...Object.keys(api), instrument(code))(...Object.values(api));
await start();
assert.deepEqual(out, [1, 10]);
assert.ok(counts.size > 3 && [...counts.values()].every((c) => c === 0), 'every __on should be matched by __off');
// each script is marked for running by a click: events by __hat, definitions by __def
assert.deepEqual(hats, [code.indexOf('onStart')], 'the onStart script is marked with its block id');
assert.equal(await defs.get(code.indexOf('async function'))(1), 2, 'clicking "define f" can call f');
console.log('trace: all checks passed');

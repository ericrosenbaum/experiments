// The sim server's sandboxes: programs can't reach Node, a stuck loop takes
// down only its own sandbox (with the kid-readable message) and the others
// keep answering, for both kinds: a worker thread and a V8 isolate.
import assert from 'node:assert/strict';
import { nodeSandbox } from '../server/sim/sandbox-node.js';
import { isolateSandbox } from '../server/sim/sandbox-isolate.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, make] of [['worker thread', nodeSandbox], ['V8 isolate', isolateSandbox]]) {
  // ---- no way out ---------------------------------------------------------------
  const s = make({ shared: true });
  const got = [];
  s.attach(1, (m) => got.push(m));
  s.load(1, `onStart(() => {
    log(typeof process, typeof require, typeof fetch, typeof WebSocket, typeof XMLHttpRequest, typeof importScripts, typeof Buffer);
    let dyn = 'no'; try { dyn = typeof globalThis.process?.binding; } catch { dyn = 'threw'; }
    log('binding:' + dyn);
  });`, false);
  await sleep(400);
  const logs = got.filter((m) => m.type === 'cmd' && m.name === 'log').map((m) => m.args[0]);
  assert.equal(logs[0], 'undefined undefined undefined undefined undefined undefined undefined', `${name}: no Node or network globals (${logs[0]})`);
  assert.equal(logs[1], 'binding:undefined');
  assert.ok(got.some((m) => m.type === 'ready'), `${name}: the program is ready`);

  // ---- a stuck loop ---------------------------------------------------------------
  const other = make({ shared: true });
  const otherGot = [];
  other.attach(1, (m) => otherGot.push(m));
  other.load(1, 'onKey("a", () => say("still here"));', false);
  const stuck = [];
  s.attach(2, (m) => stuck.push(m));
  s.load(2, 'onStart(async () => { await wait(0.05); while (true) { } });', false);
  await sleep(300);
  // the watchdog: pings go unanswered, and after 3.5s the sandbox is terminated
  const t0 = performance.now();
  while (!s.dead && performance.now() - t0 < 6000) {
    if (performance.now() - s.lastPong > 3500) s.terminate('got stuck — a loop never paused. Try adding wait() inside it.');
    else s.ping();
    await sleep(250);
  }
  assert.ok(s.dead, `${name}: a sandbox with a loop that never pauses is terminated`);
  const dead = [...got, ...stuck].find((m) => m.type === 'dead');
  assert.ok(dead && /never paused/.test(dead.reason), `${name}: every program in it hears why (${dead?.reason})`);
  other.send(1, { type: 'key', key: 'a' });
  await sleep(200);
  assert.ok(otherGot.some((m) => m.type === 'cmd' && m.name === 'say'), `${name}: the other sandbox keeps answering`);
  other.terminate();
  console.log(`ok: ${name}: no Node or network inside, a stuck loop is stopped (${((performance.now() - t0) / 1000).toFixed(1)}s), others go on`);
}
console.log('sandbox: all checks passed');

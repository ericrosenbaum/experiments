// A room, headless with fake sockets: the platformer runs its pre-taught
// programs in Node sandboxes, two joiners get the same world, locks are
// exclusive and let go on leave, keys reach only the locked thing, a taught
// behavior runs, snapshots carry only what moved, and a coin vanishes when
// the hero touches it.
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Room } from '../server/sim/room.js';
import { nodeSandbox } from '../server/sim/sandbox-node.js';
import { decodeSnapshot } from '../src/net/codec.js';
import { validate } from '../server/sim/protocol.js';

await RAPIER.init();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fake socket records what the room sends it.
function fakeSocket() {
  const got = [];
  return {
    got,
    send(data) { got.push(typeof data === 'string' ? JSON.parse(data) : decodeSnapshot(data)); },
    close() { this.closed = true; },
    of(type) { return got.filter((m) => m?.type === type); },
    last(type) { return this.of(type).at(-1); },
    snapshots() { return got.filter((m) => m && m.bodies && m.t != null && !m.type); },
    clear() { got.length = 0; },
  };
}

const room = new Room({ id: 'test', RAPIER, makeSandbox: nodeSandbox, worldId: 'platformer', idleMs: 1e9 });
const w = room.world;

// ---- the premade programs run in Node ----------------------------------------
await sleep(1500);
const programs = [...room.runtime.programs];
assert.ok(programs.length >= 10, `the platformer has programs (${programs.length})`);
assert.ok(programs.every((p) => p.behavior.running), `every program is ready: ${programs.filter((p) => !p.behavior.running).map((p) => p.label).join(', ')}`);
assert.equal(room.sandboxes.size, 1, 'premade programs share the room sandbox');
console.log(`ok: ${programs.length} pre-taught platformer programs run in one Node sandbox`);

// ---- two joiners get the same world -----------------------------------------
const sa = fakeSocket(), sb = fakeSocket();
const A = room.join(sa, validate({ type: 'hello', room: 'test', name: 'Ada' }));
const B = room.join(sb, validate({ type: 'hello', room: 'test', name: 'Bo' }));
const wa = sa.last('welcome'), wb = sb.last('welcome');
assert.equal(wa.manifest.world, 'platformer');
assert.equal(wa.manifest.entities.length, wb.manifest.entities.length);
assert.deepEqual(wa.manifest.entities.map((e) => e.id), wb.manifest.entities.map((e) => e.id), 'the same things in the same order');
assert.ok(wa.manifest.entities.every((e) => e.recipe && e.bids.length === e.bodies.length), 'every entity has a recipe and body ids');
assert.ok(Object.keys(wa.manifest.behaviors).length >= 5, 'behaviors come with the manifest');
assert.notEqual(A.color, B.color, 'players get different colors');
assert.equal(sb.last('players').players.length, 2);
console.log(`ok: two joiners get the same ${wa.manifest.entities.length}-entity manifest`);

// ---- locks -------------------------------------------------------------------
room.handle(A, { type: 'select', key: 'hero' });
room.handle(B, { type: 'select', key: 'hero' });
assert.equal(room.holder('hero'), A.id, 'Ada holds the hero');
assert.equal(sb.last('lockDenied')?.key, 'hero', 'Bo is told no');
assert.equal(B.selection, null);
room.handle(B, { type: 'select', key: 'slime' });
assert.equal(room.holder('slime'), B.id);
room.handle(B, { type: 'select', key: 'world' });
assert.equal(room.holder('slime'), null, 'picking something else lets go');
assert.equal(B.selection, 'world');
assert.equal(sa.last('selected').playerId, B.id, 'everyone hears who selected what');
console.log('ok: a selection is an exclusive lock, except the World');

// ---- keys go only to the locked thing ------------------------------------------
const heroPos = () => w.actor('hero').position;
const h0 = heroPos();
room.handle(B, { type: 'key', key: 'ArrowUp', down: true });
await sleep(700);
room.handle(B, { type: 'key', key: 'ArrowUp', down: false });
assert.ok(heroPos().distanceTo(h0) < 0.5, "Bo's keys don't move Ada's hero");
room.handle(A, { type: 'key', key: 'ArrowUp', down: true });
await sleep(900);
room.handle(A, { type: 'key', key: 'ArrowUp', down: false });
const moved = heroPos().distanceTo(h0);
assert.ok(moved > 2, `Ada's keys drive the hero (${moved.toFixed(1)} studs)`);
console.log(`ok: only the lock holder's keys move the hero (${moved.toFixed(1)} studs)`);

// ---- snapshots carry what moved ---------------------------------------------------
sa.clear();
await sleep(300);
const snaps = sa.snapshots();
assert.ok(snaps.length >= 4, `snapshots keep coming (${snaps.length} in 300ms)`);
const heroBids = new Set(w.actor('hero').model.bids);
const deltas = snaps.filter((s) => !s.full);
assert.ok(deltas.some((s) => s.bodies.some(([bid]) => heroBids.has(bid))), 'the moving hero is in them');
const quiet = deltas.at(-1);
assert.ok(quiet.bodies.length < room.byBid.size / 2, `a delta snapshot has only moving bodies (${quiet.bodies.length} of ${room.byBid.size})`);
sa.clear();
await sleep(2100);
const full = sa.snapshots().find((s) => s.full);
assert.ok(full && full.bodies.length === room.byBid.size, `a full snapshot has every body (${full?.bodies.length})`);
console.log(`ok: delta snapshots carry ${quiet.bodies.length} bodies, full ones ${full.bodies.length}`);

// ---- teaching over the wire ---------------------------------------------------------
sa.clear(); sb.clear();
room.handle(B, { type: 'teach', key: 'hero', behavior: { text: 'jump', code: 'onKey("j", () => jump(8));', summary: ['jump'], title: 'Jump' } });
assert.ok(sb.last('log')?.text.includes('using'), 'Bo cannot teach the hero Ada holds');
room.handle(A, { type: 'teach', key: 'hero', behavior: { text: 'jump', code: 'onKey("j", () => jump(8));', summary: ['jump'], title: 'Jump' } });
await sleep(600);
const lists = sb.of('behaviors').filter((m) => m.key === 'hero');
assert.ok(lists.length, 'everyone gets the new behavior list');
const jump = lists.at(-1).list.find((b) => b.title === 'Jump');
assert.ok(jump?.running && jump.by === A.id, 'it runs and remembers who taught it');
const y0 = heroPos().y;
room.handle(A, { type: 'key', key: 'j', down: true });
await sleep(300);
room.handle(A, { type: 'key', key: 'j', down: false });
assert.ok(heroPos().y > y0 + 1, `j makes the hero jump (${(heroPos().y - y0).toFixed(1)} up)`);
room.handle(A, { type: 'teach', key: 'hero', behavior: { text: 'bad', code: 'onKey("k", () => {', summary: [], title: 'Bad' } });
assert.ok(sa.last('log')?.text.includes('typo'), 'code that does not parse is refused');
console.log('ok: a behavior taught over the wire runs for its lock holder');

// ---- a coin vanishes when the hero touches it ----------------------------------------
const coin = w.actor('coin-1');
assert.ok(coin.alive);
room.handle(A, { type: 'teach', key: 'hero', behavior: { text: 'go', code: 'onStart(async () => { await teleport(thing("coin-1")); });', summary: ['go'], title: 'Go' } });
await sleep(1500);
assert.ok(!coin.alive, 'the coin is gone');
assert.ok(sa.of('remove').some((m) => m.ids.some((id) => id.startsWith('coin-1'))), 'and everyone was told');
assert.ok(sa.of('sound').some((m) => m.name === 'coin'), 'with the coin sound');
console.log('ok: the hero teleported onto a coin and it vanished for everyone');

// ---- drags and the ⋯ menu ------------------------------------------------------------
sa.clear();
room.handle(A, { type: 'select', key: 'slime' });
const s0 = w.actor('slime').position;
room.handle(A, { type: 'dragStart', key: 'slime' });
room.handle(A, { type: 'drag', key: 'slime', delta: [6, 0, 0], yaw: 90 });
await sleep(100);
room.handle(A, { type: 'dragEnd', key: 'slime', delta: [6, 0, 0], yaw: 90, moved: true });
await sleep(100);
assert.ok(Math.abs(w.actor('slime').position.x - (s0.x + 6)) < 1, 'a drag over the wire moves the slime');
assert.equal(room.stage.state.moves.at(-1)?.key, 'slime', 'and Reset will remember it');
room.handle(A, { type: 'clone', key: 'slime' });
const made = sa.last('made');
assert.ok(made?.key.startsWith('slime~'), 'Duplicate replies with the copy');
await sleep(50);
assert.ok(sb.of('add').some((m) => m.entities.some((e) => e.thingId === made.key)), 'the copy is added for everyone');
console.log('ok: drags, turns and copies work over the wire');

// ---- leaving lets go and keeps programs running ----------------------------------------
room.handle(A, { type: 'select', key: 'hero' });
assert.equal(room.sandboxes.has(A.id), true, "Ada's programs run in her own sandbox");
room.leave(A);
assert.equal(room.holder('hero'), null, 'leaving releases the lock');
assert.equal(room.sandboxes.has(A.id), false);
await sleep(800);
const heroList = room.stage.behaviorsOf('hero');
assert.ok(heroList.find((b) => b.title === 'Jump')?.running, 'her Jump behavior keeps running in the room sandbox');
assert.equal(sb.last('players').players.length, 1);
console.log('ok: leaving releases locks and hands programs to the room');

// ---- reset sends a fresh world ----------------------------------------------------------
room.handle(B, { type: 'select', key: 'hero' });
const go = room.stage.behaviorsOf('hero').find((b) => b.title === 'Go');
room.handle(B, { type: 'behavior', key: 'hero', id: go.id, op: 'delete' });
assert.ok(!room.stage.behaviorsOf('hero').includes(go), 'Bo can delete a behavior now that he holds the hero');
sb.clear();
room.handle(B, { type: 'reset' });
await sleep(100);
assert.ok(sb.last('world')?.manifest.entities.length > 10, 'Reset sends everyone the world again');
assert.ok(w.actor('coin-1').alive, 'the coin is back');
assert.ok(!sb.of('add').length, 'without a flood of add events');
room.handle(B, { type: 'world', id: 'castle' });
await sleep(100);
assert.equal(sb.last('world')?.manifest.world, 'castle', 'switching worlds does too');
console.log('ok: Reset and world switches send a fresh manifest');

// ---- malformed and over-eager messages are dropped --------------------------------------
assert.equal(validate({ type: 'teach', key: 'hero' }), null);
assert.equal(validate({ type: 'drag', key: 'hero', delta: [1, 2], yaw: 0 }), null);
assert.equal(validate({ type: 'nope' }), null);
assert.equal(validate({ type: 'select', key: '../x' }), null);
for (let i = 0; i < 100; i++) room.handle(B, { type: 'key', key: 'x', down: i % 2 === 0 });
assert.ok(room.stats.dropped >= 40, `a flood is dropped (${room.stats.dropped})`);
console.log('ok: malformed messages and floods are dropped');

room.leave(B);
room.dispose();
console.log('room: all checks passed');

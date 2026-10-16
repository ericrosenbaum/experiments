// The library's things (objects.js): each one builds without anything inside
// anything else, stands still until something hits it, and fits in its
// bounds (so "never start inside something" works). Then a game made from
// the library in the blank world, in a headless room with real programs: two
// goals, a scoreboard, a soccer ball and a player. A ball in the blue goal
// scores for Red, space kicks the ball, and a ball through the ring dings.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeWorld, run } from './physics.harness.mjs';
import { overlappingColliders } from './overlap.mjs';
import { OBJECTS, OBJECTS_BY_ID } from '../src/world/objects.js';
import { LIBRARY_BY_ID, CATEGORIES } from '../src/world/library.js';
import { Room } from '../server/sim/room.js';
import { nodeSandbox } from '../server/sim/sandbox-node.js';
import { decodeSnapshot } from '../src/net/codec.js';
import { validate } from '../server/sim/protocol.js';

const cats = new Set(CATEGORIES.map(([c]) => c));
for (const o of OBJECTS) {
  assert.ok(cats.has(o.category), `${o.id}: unknown section ${o.category}`);
  assert.ok(!LIBRARY_BY_ID[o.id], `${o.id}: the same id as a model`);
}

const w = await makeWorld();
for (const o of OBJECTS) {
  for (const yaw of [0, 37]) {
    w.clear();
    o.build(w, { x: 0, z: 0, yaw, id: 'it', name: o.name });
    const a = w.actor('it');
    assert.ok(a.alive, `${o.id} builds`);
    assert.deepEqual(overlappingColliders(w).map(([p, q, d]) => `${p.color}/${q.color} ${d.toFixed(2)}`), [], `${o.id} at ${yaw}°: nothing inside anything`);
    const before = a.members.map((e) => e.position);
    run(w, 1.5);
    const moved = a.members.filter((e, i) => e.position.distanceTo(before[i]) > 0.1).length;
    assert.equal(moved, 0, `${o.id} at ${yaw}°: ${moved} pieces moved by themselves`);
    // its bounds, turned the same way, hold everything
    const { min, max } = o.bounds;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (yaw * Math.PI) / 180);
    const corners = [];
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push(new THREE.Vector3(x, y, z).applyQuaternion(q));
    const want = new THREE.Box3().setFromPoints(corners).expandByScalar(0.6);
    const got = a.bounds();
    assert.ok(want.containsBox(got), `${o.id} at ${yaw}°: built ${got.min.toArray().map((v) => v.toFixed(1))}..${got.max.toArray().map((v) => v.toFixed(1))} outside its bounds`);
  }
}
console.log(`ok: all ${OBJECTS.length} library things build clear of themselves, stand still and fit their bounds`);

// ---- a game from the library ------------------------------------------------------
await RAPIER.init();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sock = { got: [], send(d) { this.got.push(typeof d === 'string' ? JSON.parse(d) : decodeSnapshot(d)); }, close() {} };
const room = new Room({ id: 'lib', RAPIER, makeSandbox: nodeSandbox, worldId: 'blank', idleMs: 1e9 });
const A = room.join(sock, validate({ type: 'hello', room: 'lib', name: 'Ada' }));
const add = (defId, x, z, yaw = 0) => {
  room.handle(A, validate({ type: 'addModel', defId, pose: { x, z, yaw } }));
  return room.world.actor(sock.got.filter((m) => m.type === 'made').at(-1).key);
};
const redGoal = add('red-goal', -30, 0, 90); // its mouth faces +x
const blueGoal = add('blue-goal', 30, 0, -90);
const board = add('scoreboard', 0, -30);
const ball = add('soccer-ball', 0, 0);
const player = add('red-player', -6, 0, 90);
const ringA = add('big-ring', 0, 30);
for (const a of [redGoal, blueGoal, board, ball, player, ringA]) assert.ok(a.alive, `${a.key} was added`);
assert.equal(room.stage.behaviorsOf(blueGoal.key)[0].title, 'Goal for Red', 'a goal comes knowing when the ball is in');
assert.equal(room.stage.behaviorsOf(player.key).length, 2, 'a team player comes knowing how to run and kick');
await sleep(1500);
const screen = () => board.members.find((e) => e.screen).screen.text;
assert.equal(screen(), 'RED  vs  BLUE\n0 - 0', 'the scoreboard shows 0 - 0');

const put = (x, y, z, v = { x: 0, y: 0, z: 0 }) => { const b = ball.members[0].chassis; b.setTranslation({ x, y, z }, true); b.setLinvel(v, true); };
// the ball hits a post first: that's no goal
const post = blueGoal.members[0].position.clone().add(new THREE.Vector3(-1.5, 1.6, 6.5));
put(post.x, post.y, post.z, { x: 4, y: 0, z: 0 });
await sleep(700);
assert.equal(screen(), 'RED  vs  BLUE\n0 - 0', `hitting the post doesn't count (${JSON.stringify(screen())})`);
put(32, 1.6, 0); // inside the blue goal's net
await sleep(700);
assert.match(screen(), /^RED SCORES!\n1 - 0$/, `a ball in the Blue Goal scores for Red (${JSON.stringify(screen())})`);
await sleep(2500);
const home = ball.position;
assert.ok(Math.hypot(home.x, home.z) < 2, `the ball goes back to where it started (${home.x.toFixed(1)}, ${home.z.toFixed(1)})`);
console.log('ok: Red Goal, Blue Goal, Scoreboard and Soccer Ball make a game in the blank world: a post is no goal, the net is');

// space kicks the nearest ball
const p = player.position;
put(p.x + 2.7, 1.6, p.z);
await sleep(300);
const b0 = ball.position;
room.handle(A, { type: 'select', key: player.key });
room.handle(A, { type: 'key', key: ' ', down: true });
room.handle(A, { type: 'key', key: ' ', down: false });
await sleep(700);
assert.ok(ball.position.x - b0.x > 4, `a Red Player from the library kicks the ball (${(ball.position.x - b0.x).toFixed(1)} studs)`);
console.log('ok: a Red Player from the library kicks the Soccer Ball');

// through the ring
const r = ringA.position;
const dings = () => sock.got.filter((m) => m.type === 'sound' && m.name === 'ding').length;
const d0 = dings();
put(r.x, 5.5, r.z - 6, { x: 0, y: 0, z: 14 });
await sleep(1200);
assert.ok(dings() > d0, 'a ball through the Big Ring makes it ding');
console.log('ok: a ball through the Big Ring dings');

console.log('objects: all checks passed');
process.exit(0);

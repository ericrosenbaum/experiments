// Calvinball, in a headless room with its pre-taught programs running in Node
// sandboxes: everything but the field and the nets can be knocked over yet
// stands still on its own; the scoreboard shows the score from the start, a ball in Blue's
// net scores for Red (the screen updates for everyone, late joiners too) and
// goes back to the middle, space kicks the ball away from the kicker, five
// goals win, and R on the scoreboard starts a new game.
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Room } from '../server/sim/room.js';
import { nodeSandbox } from '../server/sim/sandbox-node.js';
import { decodeSnapshot } from '../src/net/codec.js';
import { validate } from '../server/sim/protocol.js';
import { FIELD } from '../src/world/props.js';
import { BRICK_H as B } from '../src/world/bricks.js';

await RAPIER.init();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeSocket() {
  const got = [];
  return {
    got,
    send(data) { got.push(typeof data === 'string' ? JSON.parse(data) : decodeSnapshot(data)); },
    close() {},
    of(type) { return got.filter((m) => m?.type === type); },
  };
}

const room = new Room({ id: 'calvin', RAPIER, makeSandbox: nodeSandbox, worldId: 'calvinball', idleMs: 1e9 });
const w = room.world;
const fixed = [...w.entities.values()].filter((e) => e.kind !== 'ground' && !e.chassis.isDynamic()).map((e) => e.thingId);
assert.deepEqual([...new Set(fixed)].sort(), ['blue-net', 'field', 'red-net'], 'only the field and the nets are fixed');
const props = [...w.entities.values()].filter((e) => e.kind !== 'model' && e.kind !== 'ball' && e.kind !== 'ground');
const start = new Map(props.map((e) => [e, e.position]));
await sleep(1500);
const moved = props.filter((e) => e.position.distanceTo(start.get(e)) > 0.05).map((e) => `${e.name} ${start.get(e).toArray().map((v) => v.toFixed(1))} -> ${e.position.toArray().map((v) => v.toFixed(1))}`);
assert.deepEqual(moved, [], 'nothing falls over by itself');
console.log(`ok: ${props.length} props stand still until something hits them; only the field and the nets are fixed`);
const programs = [...room.runtime.programs];
assert.ok(programs.length >= 15 && programs.every((p) => p.behavior.running), `every Calvinball program runs (${programs.filter((p) => !p.behavior.running).map((p) => p.label).join(', ')})`);

const screen = () => w.actor('scoreboard').members.find((e) => e.screen).screen.text;
const ball = w.actor('ball');
const put = (x, z) => { const b = ball.members[0].chassis; b.setTranslation({ x, y: 1.6, z }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); };
assert.equal(screen(), 'RED  vs  BLUE\n0 - 0', 'the scoreboard starts at 0 - 0');

const sa = fakeSocket();
const A = room.join(sa, validate({ type: 'hello', room: 'calvin', name: 'Ada' }));
const board = sa.of('welcome')[0].manifest.entities.find((e) => e.thingId === 'scoreboard');
assert.equal(board.screen, 'RED  vs  BLUE\n0 - 0', 'a joiner gets what the screen says');
console.log(`ok: ${programs.length} Calvinball programs run and the scoreboard shows 0 - 0`);

// ---- a goal ----------------------------------------------------------------------
put(FIELD.length / 2 + 1.4, 0); // in Blue's net
await sleep(800);
assert.match(screen(), /^RED SCORES!\n1 - 0$/, `Red scores (the screen says ${JSON.stringify(screen())})`);
assert.ok(sa.of('show').some((m) => m.key === 'scoreboard' && m.text === screen()), 'players are told what the screen shows');
await sleep(3000);
assert.equal(screen(), 'RED  vs  BLUE\n1 - 0', 'then it shows the score');
assert.ok(Math.hypot(ball.position.x, ball.position.z) < 1.5, `the ball goes back to the middle (at ${ball.position.x.toFixed(1)}, ${ball.position.z.toFixed(1)})`);
const sb = fakeSocket();
room.join(sb, validate({ type: 'hello', room: 'calvin', name: 'Bo' }));
assert.equal(sb.of('welcome')[0].manifest.entities.find((e) => e.thingId === 'scoreboard').screen, 'RED  vs  BLUE\n1 - 0', 'a late joiner sees the score');
console.log('ok: a ball in the Blue net scores for Red, everyone sees 1 - 0, and the ball goes back to the middle');

// ---- a kick ------------------------------------------------------------------------
const kicker = w.actor('red-1').position;
put(kicker.x + 2.7, kicker.z); // just in front of Red Player 1, who faces +x
await sleep(300);
const before = ball.position;
room.handle(A, { type: 'select', key: 'red-1' });
room.handle(A, { type: 'key', key: ' ', down: true });
room.handle(A, { type: 'key', key: ' ', down: false });
await sleep(700);
const after = ball.position;
assert.ok(after.x - before.x > 4 && Math.abs(after.z - before.z) < 2, `space kicks the ball away from the kicker (it went ${(after.x - before.x).toFixed(1)} studs)`);
console.log(`ok: space kicks the ball ${(after.x - before.x).toFixed(1)} studs away from the kicker`);

// ---- winning, and a new game ----------------------------------------------------------
for (let i = 0; i < 6; i++) { room.runtime.broadcast('red scores'); await sleep(100); }
await sleep(500);
assert.equal(screen(), 'RED WINS!\n5 - 0', `five goals win, and the game stops counting (${JSON.stringify(screen())})`);
room.handle(A, { type: 'select', key: 'scoreboard' });
room.handle(A, { type: 'key', key: 'r', down: true });
room.handle(A, { type: 'key', key: 'r', down: false });
await sleep(800);
assert.equal(screen(), 'RED  vs  BLUE\n0 - 0', 'R starts a new game');
console.log('ok: five goals win; R on the scoreboard starts a new game');

// ---- the field stays put; the goals are wide ---------------------------------------
{
  const field = w.actor('field'), cone = w.actor('cone-1');
  assert.ok(field.fixed && !cone.fixed, 'the field is fixed, a cone is not');
  const f0 = field.position, c0 = cone.position;
  for (const key of ['field', 'cone-1']) {
    room.handle(A, { type: 'select', key });
    room.handle(A, validate({ type: 'dragStart', key }));
    room.handle(A, validate({ type: 'drag', key, delta: [6, 0, 6], yaw: 30 }));
    await sleep(200);
    room.handle(A, validate({ type: 'dragEnd', key, delta: [6, 0, 6], yaw: 30 }));
    room.handle(A, validate({ type: 'turn', key, degrees: 45 }));
  }
  await sleep(300);
  assert.ok(field.position.distanceTo(f0) < 0.01, 'dragging or turning the field does nothing');
  assert.ok(cone.position.distanceTo(c0) > 4, 'but a cone drags');
  const posts = w.actor('red-goal').members[0].recipe.opts.boxes.filter((b) => b.size[1] === B && b.size[0] === 1 && b.size[2] === 1).map((b) => b.at[2]);
  assert.ok(Math.max(...posts) - Math.min(...posts) - 1 >= 18, 'the goal mouth is 18 studs wide');
  console.log('ok: the field can\'t be dragged or turned (a cone can), and the goals are 18 studs wide');
}

// ---- things fall over ------------------------------------------------------------------
const light = w.actor('light-1').members[0];
const top0 = light.bounds?.().max.y ?? w.actor('light-1').bounds().max.y;
light.chassis.wakeUp();
light.chassis.applyImpulseAtPoint({ x: 60, y: 0, z: 60 }, { x: light.position.x, y: 15, z: light.position.z }, true);
await sleep(3000);
const top1 = w.actor('light-1').bounds().max.y;
assert.ok(top1 < top0 - 8, `a shoved stadium light falls over (its top went from ${top0.toFixed(1)} to ${top1.toFixed(1)})`);
console.log('ok: a shoved stadium light falls over');

room.close?.();
console.log('calvinball: all checks passed');
process.exit(0);

// The mechanical toys move things the way they should, a spinning part keeps
// spinning (it used to lock up), and the Machine Shop's chain reaction runs
// from the pendulum all the way to the bell, with real programs.
import assert from 'node:assert/strict';
import { makeWorld, run, LIBRARY_BY_ID } from './physics.harness.mjs';
import { Runtime } from '../src/behavior/runtime.js';
import { Stage } from '../src/stage.js';
import { nodeSandbox } from '../server/sim/sandbox-node.js';
import { compileLocal } from '../src/behavior/compiler.js';

// Each toy gets a fresh world: put it at the origin and let it settle.
async function toy(id) {
  const w = await makeWorld();
  const e = w.addModel(LIBRARY_BY_ID[id], { x: 0, z: 0 });
  const p0 = e.position;
  run(w, 1);
  assert.ok(e.position.distanceTo(p0) < 0.3, `${id} should stand still, moved ${e.position.distanceTo(p0).toFixed(2)}`);
  return { w, e, part: (n) => e.parts.get(n) };
}
const ball = (w, x, y, z) => w.addBall({ x, y, z, color: 'white', name: 'Ball', thingId: `ball-${x}-${y}-${z}` });
const peak = (w, thing, seconds, each) => {
  let top = -Infinity;
  for (let i = 0; i < seconds * 60; i++) { w.step(1 / 60); each?.(i); top = Math.max(top, thing.position.y); }
  return top;
};

{ // a spring pad throws a ball straight up
  const { w, part } = await toy('spring-pad');
  const b = ball(w, 0, 3, 0);
  run(w, 1);
  part('pad').slide = 3;
  const top = peak(w, b, 2, (i) => { if (i === 20) part('pad').slide = 0; });
  assert.ok(top > 8, `the spring pad should throw a ball high, got ${top.toFixed(1)}`);
  console.log(`ok: the spring pad throws a ball ${top.toFixed(1)} studs up`);
}

{ // a see-saw tips under a ball, and slamming it flings the ball
  const { w, e, part } = await toy('seesaw');
  const b = ball(w, 0, 5, -6);
  run(w, 1.5);
  assert.ok(w.partPose(e, part('plank')) > 15, `a ball on the back end tips the front up, got ${w.partPose(e, part('plank')).toFixed(1)}°`);
  part('plank').angle = -25; part('plank').hold = true;
  const top = peak(w, b, 2, (i) => { if (i === 30) part('plank').hold = false; });
  assert.ok(top > 10, `slamming the see-saw should fling the ball, peak ${top.toFixed(1)}`);
  console.log(`ok: the see-saw tips under a ball and flings it ${top.toFixed(1)} studs up`);
}

{ // spinners spin about each axis, and a spinning part doesn't lock up
  for (const [id, name, speed, axis, least] of [['turntable', 'table', 120, 'y', 1.5], ['windmill', 'sails', 360, 'z', 5], ['paddle-wheel', 'paddles', 300, 'x', 4]]) {
    const { w, part } = await toy(id);
    part(name).spin = speed;
    run(w, 1.5);
    const got = Math.abs(part(name).body.angvel()[axis]);
    assert.ok(got > least, `${id} should spin about ${axis}, got ${got.toFixed(2)} rad/s`);
  }
  const { w, part } = await toy('ufo');
  part('dome').spin = 120;
  run(w, 2);
  assert.ok(part('dome').body.angvel().y > 1.5, `the UFO dome should keep spinning, got ${part('dome').body.angvel().y.toFixed(2)} rad/s`);
  console.log('ok: the turntable, windmill and paddle wheel spin about y, z and x, and spinning parts keep spinning');
}

{ // the paddle wheel scoops a ball that rolls in and throws it out the front
  const { w, part } = await toy('paddle-wheel');
  part('paddles').spin = 300;
  const b = ball(w, 0, 1.3, -4);
  b.chassis.setLinvel({ x: 0, y: 0, z: 4 }, true);
  run(w, 3);
  assert.ok(b.position.z > 4, `the paddles should throw the ball forward, it's at z ${b.position.z.toFixed(1)}`);
  console.log('ok: the paddle wheel throws a ball out the front');
}

{ // the pendulum, pulled back and let go, swings through and knocks a ball away
  const { w, e, part } = await toy('pendulum');
  const b = ball(w, 0, 1.3, 2.5);
  const hammer = part('hammer');
  hammer.angle = -80; hammer.hold = true;
  run(w, 1.2);
  assert.ok(w.partPose(e, hammer) < -70, 'the hammer pulls back');
  hammer.hold = false;
  let most = -Infinity;
  for (let i = 0; i < 180; i++) { w.step(1 / 60); most = Math.max(most, w.partPose(e, hammer)); }
  assert.ok(most > 50, `the hammer should swing through, reached ${most.toFixed(1)}°`);
  assert.ok(b.position.z > 10, `the ball should be knocked away, it's at z ${b.position.z.toFixed(1)}`);
  console.log(`ok: the pendulum swings to ${most.toFixed(0)}° and knocks a ball ${b.position.z.toFixed(0)} studs`);
}

{ // the flipper whacks a ball forward
  const { w, part } = await toy('flipper');
  const b = ball(w, -3, 1.3, 1.6);
  run(w, 0.5);
  part('bat').angle = 70; run(w, 0.3); part('bat').angle = 0; run(w, 1.5);
  assert.ok(b.position.z > 4, `the flipper should whack the ball forward, it's at z ${b.position.z.toFixed(1)}`);
  console.log('ok: the flipper whacks a ball forward');
}

{ // the lift carries a ball to the top
  const { w, part } = await toy('lift');
  const b = ball(w, 0, 2.5, 0.3);
  run(w, 1);
  part('platform').slide = 8;
  run(w, 4);
  assert.ok(b.position.y > 9, `the lift should carry the ball up, it's at y ${b.position.y.toFixed(1)}`);
  console.log('ok: the lift carries a ball to the top');
}

{ // the conveyor carries a ball (which would just spin between rollers) and a brick
  const { w, e } = await toy('conveyor');
  for (const p of e.parts.values()) p.spin = 360;
  const b = ball(w, 0, 4, -5);
  const brick = w.addBrick({ size: '2x2', color: 'red', x: 0, y: 4, z: -2 });
  run(w, 4);
  assert.ok(b.position.z > 3, `the conveyor should carry the ball, it's at z ${b.position.z.toFixed(1)}`);
  assert.ok(brick.position.z > 5, `the conveyor should carry the brick, it's at z ${brick.position.z.toFixed(1)}`);
  console.log('ok: the conveyor carries a ball and a brick');
}

{ // the button gives under a brick; the bell swings when hit
  const { w, e, part } = await toy('button');
  w.addBrick({ size: '2x2', color: 'red', x: 0, y: 4, z: 0 });
  run(w, 1.5);
  assert.ok(w.partPose(e, part('button')) < -0.05, 'a brick pushes the button in');
  const bell = await toy('bell');
  const b = ball(bell.w, 0, 1.3, 6);
  b.chassis.setLinvel({ x: 0, y: 0, z: -10 }, true);
  let most = 0;
  for (let i = 0; i < 90; i++) { bell.w.step(1 / 60); most = Math.max(most, Math.abs(bell.w.partPose(bell.e, bell.part('bell')))); }
  assert.ok(most > 10, `a ball rolling into the bell should swing it, swung ${most.toFixed(1)}°`);
  console.log('ok: the button gives under a brick, and the bell swings when a ball hits it');
}

{ // the offline compiler knows sliders and groups of parts
  const pad = compileLocal('When I press space, launch.', LIBRARY_BY_ID['spring-pad']);
  assert.match(pad.code, /part\("pad"\)\.slideTo\(3\)[\s\S]*slideTo\(0\)/, pad.code);
  const lift = compileLocal('When I press l, lower the platform.', LIBRARY_BY_ID.lift);
  assert.match(lift.code, /part\("platform"\)\.slideTo\(0\)/, lift.code);
  const rollers = compileLocal('When I press space, spin the rollers.', LIBRARY_BY_ID.conveyor);
  assert.equal((rollers.code.match(/\.spin\(/g) ?? []).length, 7, rollers.code);
  console.log('ok: the offline compiler launches pads, lowers lifts and spins every roller');
}

// The Machine Shop's chain, in real time with real programs: the pendulum
// knocks the red ball into the dominoes, the last one lands on the button
// ("go"), the see-saw flings the blue ball onto the conveyor, and the
// conveyor carries it into the bell ("ding").
{
  const w = await makeWorld();
  const heard = [];
  const ui = new Proxy({}, { get: (o, k) => o[k] ?? (() => {}) });
  const runtime = new Runtime({ world: w, audio: { play() {} }, ui, sandboxFor: () => nodeSandbox() });
  const broadcast = runtime.broadcast.bind(runtime);
  const t0 = Date.now();
  runtime.broadcast = (name) => { heard.push([name, (Date.now() - t0) / 1000]); broadcast(name); };
  const stage = new Stage({ world: w, runtime, ui, view: null });
  stage.load('machines');
  const timer = setInterval(() => w.step(1 / 60), 1000 / 60);
  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
  await sleep(2);
  runtime.setKeyTarget(w.actor('pendulum'));
  runtime.keyDown(' ');
  runtime.keyUp(' ');
  for (let i = 0; i < 40 && !heard.some(([n]) => n === 'ding'); i++) await sleep(0.5);
  await sleep(4); // nothing rings twice
  clearInterval(timer);
  runtime.dispose();
  const names = heard.map(([n]) => n);
  assert.deepEqual(names, ['go', 'ding'], `the chain should tell everyone "go" and then "ding", once each: ${JSON.stringify(heard)}`);
  console.log(`ok: the Machine Shop's chain reaction runs: "go" at ${heard[0][1].toFixed(1)}s, "ding" at ${heard[1][1].toFixed(1)}s`);
}
console.log('machines: all checks passed');
process.exit(0);

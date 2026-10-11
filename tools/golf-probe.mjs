// Minigolf physics: from each tee, aimed at the cup, which putts sink the ball?
// A putt is push(power): the ball starts at power * 2.5 studs/s.
// usage: node tools/golf-probe.mjs
import { makeWorld, run } from '../test/physics.harness.mjs';
import { WORLDS_BY_ID } from '../src/world/worlds.js';

const tees = [[16, -10], [-16, -10]];
const cups = [[16, 9], [-16, 10]];
const w = await makeWorld();
for (let h = 0; h < tees.length; h++) {
  const results = [];
  for (let power = 1; power <= 10; power += 0.5) {
    w.clear();
    WORLDS_BY_ID.minigolf.build(w);
    const ball = w.actor('golfball');
    const [tx, tz] = tees[h], [cx, cz] = cups[h];
    w.transform(ball.members, { delta: ball.position.clone().set(tx - ball.position.x, 0, tz - ball.position.z), pivot: ball.position });
    run(w, 0.3);
    ball.yaw = Math.atan2(cx - tx, cz - tz) * 180 / Math.PI;
    const f = ball.forward();
    ball.kick({ x: f.x * power * 2.5, y: 0, z: f.z * power * 2.5 });
    let sunk = false, maxZ = -99;
    for (let i = 0; i < 60 * 8; i++) {
      run(w, 1 / 60);
      const p = ball.position;
      maxZ = Math.max(maxZ, p.z);
      if (p.y < 1.0 && Math.hypot(p.x - cx, p.z - cz) < 1.2) { sunk = true; break; }
    }
    const p = ball.position;
    results.push(`${power}:${sunk ? 'SUNK' : `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`}`);
  }
  console.log(`hole at tee ${tees[h]}:`, results.join('  '));
}

// The snapshot codec: positions to 1/64 stud, rotations within a degree, and
// bytes that decode to what was encoded.
import assert from 'node:assert/strict';
import { quantize, dequantize, encodeSnapshot, decodeSnapshot, sameQuant } from '../src/net/codec.js';

const norm = (q) => { const l = Math.hypot(...q); return q.map((v) => v / l); };
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180 / Math.PI;

let worst = 0;
const bodies = [];
for (let i = 0; i < 200; i++) {
  const t = { x: (Math.random() - 0.5) * 300, y: Math.random() * 60, z: (Math.random() - 0.5) * 300 };
  const q = norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
  const qv = quantize(t, { x: q[0], y: q[1], z: q[2], w: q[3] });
  const back = dequantize(qv);
  assert.ok(Math.abs(back.p[0] - t.x) <= 1 / 128 + 1e-9 && Math.abs(back.p[2] - t.z) <= 1 / 128 + 1e-9, 'position within half a step');
  worst = Math.max(worst, angle(back.q, q));
  bodies.push([i * 7, qv]);
}
assert.ok(worst < 0.1, `rotation error ${worst.toFixed(3)}° should be under a tenth of a degree`);
console.log(`ok: 200 transforms round-trip (worst rotation error ${worst.toFixed(4)}°)`);

const buf = encodeSnapshot({ t: 123456.5, full: true, bodies });
assert.equal(buf.byteLength, 12 + 200 * 15);
const out = decodeSnapshot(buf);
assert.equal(out.t, 123456.5);
assert.equal(out.full, true);
assert.equal(out.bodies.length, 200);
for (let i = 0; i < 200; i++) {
  assert.equal(out.bodies[i][0], bodies[i][0]);
  assert.ok(sameQuant(out.bodies[i][1], bodies[i][1]), `body ${i} decodes to what was encoded`);
}
assert.ok(!sameQuant(bodies[0][1], bodies[1][1]));
console.log(`ok: a 200-body snapshot is ${buf.byteLength} bytes and decodes exactly`);
console.log('codec: all checks passed');

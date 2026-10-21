import test from 'node:test';
import assert from 'node:assert/strict';
import { Shape, hsbToRgb, STRIDE, capVertices, CAP_VERTEX_COUNT } from '../src/shape.js';

// a straight stroke left to right, 10 px per point, 100 samples per point
function line(n = 20) {
  return path(Array.from({ length: n }, (_, i) => [(i + 1) * 10, 100]));
}

function path(coords, samplesPerPoint = 100) {
  const s = new Shape(1);
  let prev = { x: coords[0][0] - 1, y: coords[0][1] };
  coords.forEach(([x, y], i) => {
    const p = { x, y };
    s.addPoint(p, prev, 8, [1, 0, 0], i * samplesPerPoint);
    prev = p;
  });
  s.finish();
  return s;
}

test('builds a strip two vertices per point', () => {
  const s = line(20);
  assert.equal(s.vertexCount, 40);
  // first point: right of a rightward heading is +y (screen down)
  assert.deepEqual([...s.vertices.subarray(0, STRIDE * 2)].map((v) => Math.round(v)), [10, 108, 1, 0, 0, 10, 92, 1, 0, 0]);
});

test('hit test includes the margin', () => {
  const s = line();
  assert.ok(s.inside({ x: 100, y: 100 }));
  assert.ok(s.inside({ x: 100, y: 112 }));
  assert.ok(!s.inside({ x: 100, y: 115 }));
  assert.ok(!s.inside({ x: 300, y: 100 }));
});

test('round end caps and a bigger target at the start (issues #10, #4)', () => {
  const s = line();
  // past the end, inside its cap
  assert.ok(s.inside({ x: 210, y: 100 }));
  assert.ok(!s.inside({ x: 215, y: 100 }));
  // well before the start
  assert.ok(s.inside({ x: -12, y: 100 }));
  assert.ok(!s.inside({ x: -18, y: 100 }));
  const caps = capVertices(s, s.vertices, null);
  assert.equal(caps.length, CAP_VERTEX_COUNT * STRIDE);
  const xs = [];
  for (let i = 0; i < CAP_VERTEX_COUNT; i++) xs.push(caps[i * STRIDE]);
  // the start cap reaches back to x = 10 - 8, the end cap forward to 200 + 8
  assert.ok(Math.abs(Math.min(...xs) - 2) < 1e-3);
  assert.ok(Math.abs(Math.max(...xs) - 208) < 1e-3);
});

test('a self-crossing stroke plays the part drawn last (issue #11)', () => {
  // right along y = 100, then a loop that comes back down through (100, 100)
  const coords = [];
  for (let x = 0; x <= 200; x += 10) coords.push([x, 100]);
  for (let y = 90; y >= 0; y -= 10) coords.push([200, y]);
  for (let x = 190; x >= 100; x -= 10) coords.push([x, 0]);
  for (let y = 10; y <= 200; y += 10) coords.push([100, y]);
  const s = path(coords);
  const pos = s.audioPositionAt({ x: 100, y: 100 });
  // the second pass is at index 21 + 10 + 10 + 9 = 50
  assert.ok(Math.abs(pos - 50 * 100) < 1, `played from ${pos}`);
  // and reads direction from that part: moving down is forward there
  assert.equal(s.directionFor({ x: 100, y: 104 }, { x: 100, y: 96 }), 1);
});

test('drawing speed, for turning a swipe into a playback rate', () => {
  // 10 px per 100 samples at 1000 samples/s: 100 px/s
  const s = line();
  assert.ok(Math.abs(s.drawingSpeedAt({ x: 100, y: 100 }, 1000) - 100) < 1e-6);
});

test('touching plays from where it was drawn', () => {
  const s = line();
  assert.equal(s.audioPositionAt({ x: 10, y: 100 }), 0);
  assert.equal(s.audioPositionAt({ x: 55, y: 105 }), 450);
  assert.equal(s.indexAtAudioPosition(450), 4);
});

test('rubbing against the stroke reverses it', () => {
  const s = line();
  assert.equal(s.directionFor({ x: 105, y: 100 }, { x: 100, y: 100 }), 1);
  assert.equal(s.directionFor({ x: 100, y: 100 }, { x: 105, y: 100 }), -1);
  assert.equal(s.directionFor({ x: 100, y: 100 }, { x: 100, y: 100 }), null);
  // right at the start, too (the original ignored the first two points)
  assert.equal(s.directionFor({ x: 10, y: 100 }, { x: 15, y: 100 }), -1);
});

test('reversal works on a leftward stroke, where raw angles wrap', () => {
  const s = new Shape(2);
  let prev = { x: 300, y: 100.01 };
  for (let i = 1; i <= 20; i++) {
    const p = { x: 300 - i * 10, y: 100 - (i % 2) * 0.02 };
    s.addPoint(p, prev, 8, [1, 0, 0], i * 100);
    prev = p;
  }
  s.finish();
  assert.equal(s.directionFor({ x: 145, y: 100.02 }, { x: 150, y: 99.98 }), 1);
  assert.equal(s.directionFor({ x: 150, y: 100 }, { x: 145, y: 100 }), -1);
});

test('bulges behind the playback point while playing', () => {
  const s = line();
  s.playPos = 950; // point 9
  const v = s.animatedVertices(0, null);
  const halfWidth = (i) => (v[i * 2 * STRIDE + 1] - v[i * 2 * STRIDE + STRIDE + 1]) / 2;
  assert.ok(Math.abs(halfWidth(9) - (8 + 16 + 2.5)) < 1e-4);
  assert.ok(halfWidth(5) < halfWidth(9));
  assert.ok(Math.abs(halfWidth(15) - 8) < 1e-4);
});

test('hsb like ofColor', () => {
  assert.deepEqual(hsbToRgb(0, 1), [1, 0, 0]);
  assert.deepEqual(hsbToRgb(1 / 3, 1).map((x) => Math.round(x * 100) / 100), [0, 1, 0]);
  assert.deepEqual(hsbToRgb(0.5, 0), [1, 1, 1]);
});

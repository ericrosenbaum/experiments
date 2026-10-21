import test from 'node:test';
import assert from 'node:assert/strict';
import { Shape, hsbToRgb, STRIDE } from '../src/shape.js';

// a straight stroke left to right, 10 px per point, 100 samples per point
function line(n = 20) {
  const s = new Shape(1);
  let prev = { x: 0, y: 100 };
  for (let i = 1; i <= n; i++) {
    const p = { x: i * 10, y: 100 };
    s.addPoint(p, prev, 8, [1, 0, 0], (i - 1) * 100);
    prev = p;
  }
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

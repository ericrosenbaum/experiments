import test from 'node:test';
import assert from 'node:assert/strict';
import { PitchTracker } from '../src/pitch.js';
import { Analyzer, pitchClass } from '../src/analysis.js';

const tone = (freq, sr, n, amp = 0.3, harmonics = [1]) => {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (const [k, h] of harmonics.entries()) out[i] += (amp * h * Math.sin((2 * Math.PI * freq * (k + 1) * i) / sr)) / harmonics.length;
  }
  return out;
};

for (const sr of [44100, 48000]) {
  test(`tracks sung pitches at ${sr} Hz`, () => {
    for (const freq of [130.8, 220, 261.6, 440, 659.3, 987.8]) {
      const t = new PitchTracker(sr);
      let f = 0;
      // a voice-like tone, with harmonics, over a few successive buffers
      for (let k = 0; k < 4; k++) f = t.compute(tone(freq, sr, 2048, 0.3, [1, 0.5, 0.3]));
      assert.ok(Math.abs(f - freq) / freq < 0.02, `${freq} Hz read as ${f}`);
    }
  });
}

test('finds no pitch in silence', () => {
  const t = new PitchTracker(44100);
  assert.equal(t.compute(new Float32Array(2048)), 0);
});

test('pitch class', () => {
  assert.ok(Math.abs(pitchClass(440) - 9) < 1e-9); // A
  assert.ok(Math.abs(pitchClass(261.63) - 0) < 0.01); // C
  assert.ok(Math.abs(pitchClass(220) - 9) < 1e-9);
});

const feed = (a, samples) => {
  let r;
  for (let o = 0; o + a.window <= samples.length; o += a.window) {
    a.buffer.copyWithin(0, a.window);
    a.buffer.set(samples.subarray(o, o + a.window), a.window);
    r = a.update();
  }
  return r;
};

test('color and width from a sung note', () => {
  const sr = 48000;
  const a = new Analyzer(sr);
  feed(a, new Float32Array(sr)); // a second of quiet first
  let r = feed(a, tone(440, sr, sr / 2));
  assert.ok(Math.abs(r.hue - 9 / 12) < 0.01, `hue ${r.hue}`);
  assert.equal(r.saturation, 1);
  assert.ok(r.width > 5 && r.width <= 30, `width ${r.width}`);
  const louder = feed(a, tone(440, sr, sr / 2, 0.9)).width;
  assert.ok(louder > r.width);
  r = feed(a, new Float32Array(4096));
  assert.equal(r.width, 0);
});

test('noise draws white', () => {
  const sr = 44100;
  const a = new Analyzer(sr);
  feed(a, new Float32Array(sr));
  feed(a, tone(440, sr, sr / 4));
  let seed = 1;
  const noise = new Float32Array(sr / 2).map(() => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.6);
  // the tracker may hold on to its last pitch, but a noisy one turns white
  const r = feed(a, noise);
  if (r.freq > 0) assert.equal(r.saturation, 0);
});

test('a steady background hum stops counting as sound', () => {
  const sr = 44100;
  const a = new Analyzer(sr);
  const hum = tone(60, sr, sr * 120, 0.003);
  const r = feed(a, hum);
  assert.equal(r.width, 0);
});

test('takes a little more to start a stroke than to keep one going (issue #5)', () => {
  const sr = 44100;
  const a = new Analyzer(sr);
  feed(a, new Float32Array(sr));
  // scaled loudness of a sine of amplitude A is sqrt(A / sqrt(2) * 1.63)
  const amp = (loud) => (loud * loud * Math.SQRT2) / 1.63;
  assert.equal(feed(a, tone(440, sr, 8192, amp(0.06))).width, 0); // above the gate, below the start level
  assert.ok(feed(a, tone(440, sr, 8192, amp(0.08))).width > 0); // starts
  assert.ok(feed(a, tone(440, sr, 8192, amp(0.055))).width > 0); // and carries on quieter
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleFor, shiftPitch, hsv, bellColor, INSTRUMENTS } from '../src/music.js';

// Sample roots in MIDI numbers (C3 = 60 naming, checked by pitch analysis).
const MULTI_ROOTS = [42, 48, 54, 60, 66, 72];
const sounding = (inst, note, octave) => {
  const { sample, rate } = sampleFor(inst, note, octave);
  const root = INSTRUMENTS[inst].files.length === 6 ? MULTI_ROOTS[sample] : 60;
  return root + 12 * Math.log2(rate);
};

test('multi-sampled instruments play every note chromatically', () => {
  for (const inst of [2, 3]) {
    for (let octave = 0; octave < 3; octave++) {
      for (let note = 0; note <= 12; note++) {
        assert.ok(Math.abs(sounding(inst, note, octave) - (36 + 12 * octave + note)) < 1e-9);
        assert.ok(sampleFor(inst, note, octave).rate <= 1, 'samples are only pitched down');
      }
    }
  }
});

test('single-sampled instruments use the original speed formula', () => {
  assert.equal(sampleFor(4, 0, 0).rate, 0.5);
  assert.equal(sampleFor(4, 0, 1).rate, 1);
  assert.equal(sampleFor(4, 12, 2).rate, 4);
});

test('shiftPitch wraps across octaves like the original', () => {
  assert.deepEqual(shiftPitch(12, 1, 1), { note: 1, octave: 2 });
  assert.deepEqual(shiftPitch(12, 2, 1), { note: 1, octave: 0 });
  assert.deepEqual(shiftPitch(0, 0, -1), { note: 11, octave: 2 });
  assert.deepEqual(shiftPitch(4, 1, 1, true), { note: 5, octave: 1 });
  assert.deepEqual(shiftPitch(5, 1, 1, true), { note: 7, octave: 1 });
  assert.deepEqual(shiftPitch(0, 1, -1, true), { note: 11, octave: 0 });
});

test('colors', () => {
  assert.equal(hsv(0, 1, 1), 0xff0000);
  assert.equal(hsv(1 / 3, 1, 1), 0x00ff00);
  assert.equal(bellColor(0, 0), 0x800000);
  assert.equal(bellColor(0, 2), 0xff8080);
});

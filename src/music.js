// Notes, colors and instrument tunings. Pure functions, no audio or DOM.

import { NUM_NOTES, LOW_OCT_BRIGHTNESS, HIGH_OCT_SATURATION } from './config.js';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'];

// The role of each note in C major, which picks the bell's pattern:
// 0 = in the triad (plain), 1 = in the scale (band), 2 = outside it (stripes).
export const NOTE_FUNCTIONS = [0, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 1, 0];

export const isDiatonic = (note) => NOTE_FUNCTIONS[note] !== 2;

// Instruments in the original's order (it sorted the instruments folder).
// `row` is the shape's row in the bell sprite sheet. Multi-sampled
// instruments have six samples, a C and an F# per octave, named with the
// C3 = middle C convention; single-sampled ones have one sample.
export const INSTRUMENTS = [
  { name: 'bass', shape: 'ring', files: ['bass/acoustic_bass_sample.wav'] },
  { name: 'e-piano', shape: 'square', files: ['e-piano/piano_sample.wav'] },
  {
    name: 'piano',
    shape: 'ball',
    files: ['2_piano_Fs1', '3_piano_C2', '4_piano_Fs2', '5_piano_C3', '6_piano_Fs3', '7_piano_C4'].map(
      (f) => `piano/${f}.wav`,
    ),
  },
  {
    name: 'pluck',
    shape: 'star',
    files: ['2_pluck_Fs1', '3_pluck_C2', '4_pluck_Fs2', '5_pluck_C3', '6_pluck_Fs3', '7_pluck_C4'].map(
      (f) => `pluck/${f}.wav`,
    ),
  },
  { name: 'vibes', shape: 'triangle', files: ['vibes/vibe_sample.wav'] },
];

export const DEFAULT_INSTRUMENT = INSTRUMENTS.length - 1;

/**
 * Which sample to play, and at what playback rate, for a note (0-12) in an
 * octave (0-2). Same arithmetic as the original PolySynth, so every
 * instrument sounds in the register it did on the iPad.
 */
export function sampleFor(instrument, note, octave) {
  const multi = INSTRUMENTS[instrument].files.length === 6;
  if (multi) {
    // pitch an F# (samples 0, 2, 4) or the C above it (1, 3, 5) down
    if (note < 7) return { sample: octave * 2, rate: 2 ** (-(6 - note) / 12) };
    return { sample: 1 + octave * 2, rate: 2 ** (-(12 - note) / 12) };
  }
  return { sample: 0, rate: 2 ** ((note + octave * 12 + 48 - 60) / 12) };
}

/** HSV (all 0-1) to an 0xRRGGBB number. */
export function hsv(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][((i % 6) + 6) % 6];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** A bell's color: hue from the note, darker low octave, paler high octave. */
export function bellColor(note, octave, brightness = 1) {
  const s = octave === 2 ? HIGH_OCT_SATURATION : 1;
  const v = (octave === 0 ? LOW_OCT_BRIGHTNESS : 1) * brightness;
  return hsv(note / NUM_NOTES, s, v);
}

export const cssColor = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Move a note by `steps`, wrapping across the three octaves as the original
 * did. With `diatonic`, steps skip notes outside the scale.
 */
export function shiftPitch(note, octave, steps, diatonic = false) {
  const dir = Math.sign(steps);
  for (let i = 0; i < Math.abs(steps); i++) {
    do {
      note += dir;
      if (note > 12) {
        note -= 12;
        octave = (octave + 1) % 3;
      }
      if (note < 0) {
        note += 12;
        octave = (octave + 2) % 3;
      }
    } while (diatonic && !isDiatonic(note));
  }
  return { note, octave };
}

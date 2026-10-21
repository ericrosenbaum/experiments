// What the original did each frame in ofApp::update(): turn the last stretch
// of microphone input into a stroke color (hue from pitch class, white for
// noisy sounds) and a stroke width (from loudness, 0 for silence).

import { PitchTracker } from './pitch.js';

export const WINDOW = 1024; // samples per analysis at 44.1 kHz, as in the original

// Stroke half-widths in CSS pixels. The original's 10–60 were iPad retina
// pixels, two to a point.
export const MIN_WIDTH = 5;
export const MAX_WIDTH = 30;
const GATE = 0.05; // on the scaled loudness below; quieter than this is silence

/** Pitch class (0 = C … 11.99 = B) of a frequency in Hz. */
export function pitchClass(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  return ((midi % 12) + 12) % 12;
}

/** Loudness scaled the way the original did it: more sensitive to quiet sounds. */
export function scaledLoudness(samples, start, count) {
  let sum = 0;
  for (let i = start; i < start + count; i++) sum += samples[i] * samples[i];
  return Math.sqrt(Math.sqrt(sum / count) * 1.63);
}

export function zeroCrossings(samples, start, count) {
  let n = 0;
  for (let i = start + 1; i < start + count; i++) if (samples[i] > 0 && samples[i - 1] < 0) n++;
  return n;
}

export class Analyzer {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    // the same durations as the original's buffers at 44.1 kHz
    this.window = Math.round((WINDOW * sampleRate) / 44100);
    this.buffer = new Float32Array(this.window * 2);
    this.tracker = new PitchTracker(sampleRate, this.buffer.length);
    // more than this many upward zero crossings per window (about 2 kHz) is
    // noise, not a sung note, and draws white
    this.noisyCrossings = 50;
    this.hue = 0; // 0–1; the original started out red
    this.saturation = 1;
    this.width = 0;
    // A slow-moving estimate of the room's background level. The original's
    // gate is a fixed, very low level that suited the iPad's microphone; a
    // laptop fan can sit above it, so the gate also stays a little above the
    // background. When the room is quiet this changes nothing.
    this.noiseFloor = 0.15; // starts high and settles within a second of quiet
  }

  /** Analyze `this.buffer`, whose second half holds the newest window. */
  update() {
    const { buffer, window: w } = this;
    const recent = w; // offset of the newest window

    const crossings = zeroCrossings(buffer, recent, w);
    const sat = crossings > this.noisyCrossings ? 0 : 1;
    const freq = this.tracker.compute(buffer, 0, buffer.length);
    if (freq > 0) {
      this.hue = pitchClass(freq) / 12;
      this.saturation = sat;
    }

    const loud = scaledLoudness(buffer, recent, w);
    const dt = w / this.sampleRate;
    if (loud < this.noiseFloor) this.noiseFloor += (loud - this.noiseFloor) * Math.min(1, dt / 0.2);
    else this.noiseFloor += (loud - this.noiseFloor) * (dt / 30);
    const gate = Math.max(GATE, this.noiseFloor * 1.6);
    this.width = loud < gate ? 0 : MIN_WIDTH + Math.min(loud, 1) * (MAX_WIDTH - MIN_WIDTH);
    return { hue: this.hue, saturation: this.saturation, width: this.width, freq };
  }
}

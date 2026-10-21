// Sample playback, rebuilt on Tone.js from the original's PolySynth.
//
// Each instrument has 8 voices. A note plays its sample at full level for one
// second, then decays exponentially (the original multiplied by 0.9999 per
// sample at 44.1 kHz, a time constant of about 0.23 s). When all voices are
// busy, the oldest is stolen and faded out over ~23 ms rather than cut off.

import * as Tone from 'tone';
import { INSTRUMENTS, sampleFor } from './music.js';
import { ASSETS } from './config.js';

const VOICES_PER_INSTRUMENT = 8;
const SUSTAIN = 1;
const DECAY_TC = 1 / (1 - 0.9999) / 44100;
const STEAL_FADE = 0.023;

let master = null;
let buffers = []; // per instrument, an array of ToneAudioBuffers
const voices = INSTRUMENTS.map(() => []);
let loaded = null;

/** Start downloading samples. Safe to call before audio is unlocked. */
export function loadSamples() {
  loaded ??= Promise.all(
    INSTRUMENTS.map((inst) =>
      Promise.all(inst.files.map((f) => new Tone.ToneAudioBuffer().load(`${ASSETS}/instruments/${f}`))),
    ),
  ).then((b) => {
    buffers = b;
  });
  return loaded;
}

/** Resume the audio context; browsers require this inside a user gesture. */
export function unlock() {
  const ctx = Tone.getContext();
  // 'suspended' before the first gesture; 'interrupted' on iOS after a call
  // or switching apps
  if (ctx.state !== 'running') Tone.start().catch(() => {});
  playThroughSilentSwitch();
  if (!master) {
    // The original summed every voice, scaled by 0.25 and hard-clipped.
    // A compressor and limiter keep big chords clean instead.
    const limiter = new Tone.Limiter(-1).toDestination();
    const comp = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.003, release: 0.25 }).connect(limiter);
    master = new Tone.Gain(0.35).connect(comp);
  }
}

// iOS Safari only lets a gesture start audio when it ends (touchend, click),
// not when it begins, so pointerdown alone never unlocks it there. Listen for
// the end of every gesture until the context is running, and again whenever
// iOS interrupts it.
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, () => Tone.getContext().state !== 'running' && unlock(), { capture: true, passive: true });
}

// The iPhone's ring/silent switch mutes Web Audio unless the page asks for
// media playback. Safari 16.4+ has an API for that; on older versions,
// playing any <audio> element (here, a looping silent one) does the same.
let sessionSet = false;
function playThroughSilentSwitch() {
  if (sessionSet) return;
  sessionSet = true;
  if (navigator.audioSession) {
    navigator.audioSession.type = 'playback';
    return;
  }
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) {
    return;
  }
  const el = document.createElement('audio');
  el.setAttribute('x-webkit-airplay', 'deny');
  el.preload = 'auto';
  el.loop = true;
  el.src = silentWav();
  el.play().catch(() => {
    sessionSet = false; // try again on the next gesture
  });
}

function silentWav() {
  const samples = 4410; // 0.1 s at 44.1 kHz, 8-bit mono
  const buf = new DataView(new ArrayBuffer(44 + samples));
  const str = (o, s) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  buf.setUint32(4, 36 + samples, true);
  str(8, 'WAVEfmt ');
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true);
  buf.setUint16(22, 1, true);
  buf.setUint32(24, 44100, true);
  buf.setUint32(28, 44100, true);
  buf.setUint16(32, 1, true);
  buf.setUint16(34, 8, true);
  str(36, 'data');
  buf.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) buf.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export const now = () => Tone.now();
export const isRunning = () => Tone.getContext().state === 'running';

/** Play a note now, or at an AudioContext time. */
export function playNote(instrument, note, octave, velocity = 1, when = Tone.now()) {
  if (!master) return;
  const set = buffers[instrument];
  if (!set) return;
  const { sample, rate } = sampleFor(instrument, note, octave);
  const buffer = set[sample];
  if (!buffer?.loaded) return;

  const pool = voices[instrument];
  const t = Math.max(when, Tone.now());
  // free finished voices, then steal the oldest if we're still full
  for (let i = pool.length - 1; i >= 0; i--) {
    if (pool[i].end <= Tone.now()) pool.splice(i, 1);
  }
  if (pool.length >= VOICES_PER_INSTRUMENT) {
    const oldest = pool.shift();
    oldest.gain.gain.cancelScheduledValues(t);
    oldest.gain.gain.setValueAtTime(oldest.gain.gain.getValueAtTime(t), t);
    oldest.gain.gain.linearRampToValueAtTime(0, t + STEAL_FADE);
    oldest.source.stop(t + STEAL_FADE);
  }

  const gain = new Tone.Gain(velocity).connect(master);
  const source = new Tone.ToneBufferSource({ url: buffer, playbackRate: rate }).connect(gain);
  const length = buffer.duration / rate;
  const end = Math.min(t + length, t + SUSTAIN + DECAY_TC * 7);
  gain.gain.setValueAtTime(velocity, t);
  gain.gain.setTargetAtTime(0, t + SUSTAIN, DECAY_TC);
  source.start(t);
  source.stop(end);
  source.onended = () => {
    source.dispose();
    gain.dispose();
  };
  pool.push({ source, gain, end });
}

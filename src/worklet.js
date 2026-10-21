// Runs on the audio thread. Does what the original's audioIn() and
// audioOut() did: analyzes the microphone, records it into the shape being
// drawn, and plays shapes back from wherever they were touched.
//
// Messages in (from audio.js):
//   { t: 'record', id }            start recording a new shape
//   { t: 'endRecord', id }         stop; replies { t: 'recorded', id, samples }
//   { t: 'load', id, samples }     a saved shape's sound
//   { t: 'play', id, pos, token }  start playing at sample pos
//   { t: 'direction', id, rate }   the playback rate to ease toward: 1 forward,
//                                  -1 backward, faster or slower after a swipe
//   { t: 'stop', id }              fade out
//   { t: 'remove', id } / { t: 'clear' }
// Messages out:
//   { t: 'tick', hue, saturation, width, recId, recPos, voices: [[id, pos, token]] }
//     once per analysis window, about 43 times a second
//   { t: 'ended', id, token }      a shape stopped playing on its own

import { Analyzer } from './analysis.js';

class SingingFingersProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.analyzer = new Analyzer(sampleRate);
    this.pending = new Float32Array(this.analyzer.window);
    this.pendingLen = 0;
    // the original faded 100 samples at 44.1 kHz
    this.fadeLen = Math.round((100 * sampleRate) / 44100);
    this.shapes = new Map(); // id -> { samples, voice }
    this.rec = null; // { id, blocks: [], length }
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.t) {
      case 'record':
        this.rec = { id: m.id, blocks: [], length: 0 };
        break;
      case 'endRecord': {
        if (!this.rec || this.rec.id !== m.id) break;
        const samples = new Float32Array(this.rec.length);
        let o = 0;
        for (const b of this.rec.blocks) {
          samples.set(b, o);
          o += b.length;
        }
        this.rec = null;
        // The original did this on first playback (rampInAndOut), so the
        // ends of a shape never click.
        const ramp = Math.min(this.fadeLen, samples.length);
        for (let i = 0; i < ramp; i++) {
          samples[i] *= i / ramp;
          samples[samples.length - ramp + i] *= 1 - i / ramp;
        }
        this.shapes.set(m.id, { samples, voice: null, fading: [] });
        this.port.postMessage({ t: 'recorded', id: m.id, samples: samples.slice() });
        break;
      }
      case 'load':
        this.shapes.set(m.id, { samples: m.samples, voice: null, fading: [] });
        break;
      case 'play': {
        const s = this.shapes.get(m.id);
        if (!s) break;
        // touched again while playing: fade the old voice out under the new
        // one instead of cutting it off mid-wave, which clicks (issue #13)
        if (s.voice) {
          if (s.voice.fadeOut < 0) s.voice.fadeOut = this.fadeLen;
          s.fading.push(s.voice);
        }
        s.voice = { pos: m.pos, rate: 1, target: 1, fadeIn: 0, fadeOut: -1, token: m.token };
        break;
      }
      case 'direction': {
        const v = this.shapes.get(m.id)?.voice;
        if (v) v.target = m.rate;
        break;
      }
      case 'stop': {
        const v = this.shapes.get(m.id)?.voice;
        if (v && v.fadeOut < 0) v.fadeOut = this.fadeLen;
        break;
      }
      case 'remove':
        this.shapes.delete(m.id);
        if (this.rec?.id === m.id) this.rec = null;
        break;
      case 'clear':
        this.shapes.clear();
        this.rec = null;
        break;
    }
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const out = outputs[0][0];
    const n = out.length;

    if (input) {
      if (this.rec) {
        this.rec.blocks.push(input.slice());
        this.rec.length += input.length;
      }
      this.analyze(input);
    } else {
      this.analyze(null, n);
    }

    out.fill(0);
    for (const [id, s] of this.shapes) {
      if (s.fading.length) s.fading = s.fading.filter((f) => this.render(s, f, out));
      const v = s.voice;
      if (v && !this.render(s, v, out)) {
        s.voice = null;
        this.port.postMessage({ t: 'ended', id, token: v.token });
      }
    }
    for (let i = 0; i < n; i++) out[i] = softClip(out[i]);
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }

  // Shape::getSample(), a block at a time. Returns false once the voice is done.
  render(s, v, out) {
    const { samples } = s;
    const fadeLen = this.fadeLen;
    for (let i = 0; i < out.length; i++) {
      // ease toward the target rate, so reversing direction sweeps through zero
      v.rate += (v.target - v.rate) / 1000;
      const pos = v.pos;
      v.pos += v.rate;
      if (pos < 0 || pos >= samples.length - 1) return false;
      let volume = 1;
      v.fadeIn++;
      if (v.fadeIn < fadeLen) volume = v.fadeIn / fadeLen;
      if (v.fadeOut >= 0) {
        v.fadeOut = Math.max(0, v.fadeOut - 1);
        volume = v.fadeOut / fadeLen;
        if (v.fadeOut === 0) return false;
      }
      const k = Math.floor(pos);
      const f = pos - k;
      out[i] += (samples[k] + (samples[k + 1] - samples[k]) * f) * volume;
    }
    return true;
  }

  analyze(input, silentLength = 0) {
    const a = this.analyzer;
    const len = input ? input.length : silentLength;
    for (let i = 0; i < len; i++) {
      this.pending[this.pendingLen++] = input ? input[i] : 0;
      if (this.pendingLen === this.pending.length) {
        // slide the newest window into the second half of the buffer
        a.buffer.copyWithin(0, a.window);
        a.buffer.set(this.pending, a.window);
        this.pendingLen = 0;
        const { hue, saturation, width } = a.update();
        const voices = [];
        for (const [id, s] of this.shapes) if (s.voice) voices.push([id, s.voice.pos, s.voice.token]);
        this.port.postMessage({
          t: 'tick',
          hue,
          saturation,
          width,
          recId: this.rec?.id ?? null,
          recPos: this.rec?.length ?? 0,
          voices,
        });
      }
    }
  }
}

// Many shapes playing at once used to hard-clip. This leaves anything below
// the knee alone and eases louder peaks into a ceiling just under full scale.
function softClip(v) {
  const knee = 0.7;
  const ceiling = 0.98;
  const x = Math.abs(v);
  if (x <= knee) return v;
  return Math.sign(v) * (knee + (ceiling - knee) * Math.tanh((x - knee) / (ceiling - knee)));
}

registerProcessor('singing-fingers', SingingFingersProcessor);

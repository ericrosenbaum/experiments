// Synthesized sound effects (no audio files). Volume falls off with distance
// from the camera.
export class Audio {
  constructor(camera) {
    this.camera = camera;
    this.ctx = null;
    this.muted = false;
  }

  _ctx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  play(name, position) {
    if (this.muted) return;
    let ctx;
    try { ctx = this._ctx(); } catch { return; }
    const d = position ? this.camera.position.distanceTo(position) : 10;
    const vol = Math.max(0.05, Math.min(1, 30 / (d + 10)));
    const out = ctx.createGain();
    out.gain.value = vol * 0.5;
    out.connect(ctx.destination);
    const t = ctx.currentTime;
    const tone = (type, f0, f1, dur, start = 0, gain = 1) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + start);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + start + dur);
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(gain, t + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(out);
      o.start(t + start);
      o.stop(t + start + dur + 0.05);
    };
    const noise = (dur, f, q = 1, start = 0, gain = 1) => {
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = f; filt.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(filt).connect(g).connect(out);
      src.start(t + start);
    };
    switch (name) {
      case 'beep': tone('square', 880, 880, 0.15, 0, 0.3); break;
      case 'boing': tone('sine', 180, 520, 0.35, 0, 0.8); break;
      case 'honk': tone('sawtooth', 330, 310, 0.25, 0, 0.35); tone('sawtooth', 415, 400, 0.25, 0, 0.25); break;
      case 'pop': tone('sine', 700, 180, 0.08, 0, 0.7); break;
      case 'crash': noise(0.6, 900, 0.6, 0, 1.6); tone('triangle', 120, 40, 0.4, 0, 0.6); break;
      case 'ding': tone('sine', 1320, 1300, 0.8, 0, 0.5); tone('sine', 2640, 2600, 0.4, 0, 0.15); break;
      case 'whoosh': noise(0.5, 1500, 0.4, 0, 1.4); break;
      case 'laser': tone('sawtooth', 1800, 200, 0.25, 0, 0.3); break;
      case 'roar': noise(0.9, 300, 0.8, 0, 2.2); tone('sawtooth', 110, 70, 0.9, 0, 0.4); break;
      case 'coin': tone('square', 988, 988, 0.08, 0, 0.25); tone('square', 1319, 1319, 0.3, 0.08, 0.25); break;
      case 'drum': tone('sine', 150, 50, 0.3, 0, 1); noise(0.1, 2000, 1, 0, 0.4); break;
      case 'moo': tone('sawtooth', 140, 110, 0.9, 0, 0.5); tone('sine', 280, 220, 0.9, 0, 0.3); break;
      case 'yay': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.18, i * 0.09, 0.35)); break;
      default: tone('sine', 440, 440, 0.1, 0, 0.3);
    }
  }
}

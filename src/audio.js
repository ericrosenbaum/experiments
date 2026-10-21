// The audio context, the microphone and the worklet that does the real work
// (see worklet.js). Everything here runs on the main thread.

import workletUrl from './worklet.js?worker&url';

export class Audio {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.mic = null; // the MediaStream, once we have one
    this.micError = null;
    // the latest analysis, updated about 43 times a second
    this.hue = 0;
    this.saturation = 1;
    this.width = 0;
    this.recId = null;
    this.recPos = 0;
    this.onTick = () => {};
    this.onEnded = () => {};
    this.onRecorded = () => {};
  }

  get sampleRate() {
    return this.ctx?.sampleRate ?? 44100;
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  /**
   * Must be called from a user gesture. Resolves once the worklet runs; the
   * microphone may still have been refused (see micError).
   */
  async start() {
    if (this.ctx) return this.resume();
    // With a microphone open, iOS needs a play-and-record session, or it
    // drops output to the earpiece or mutes it with the silent switch.
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const resumed = this.ctx.resume().catch(() => {});
    // Ask for the microphone in the same gesture; Safari is picky about that.
    const micReq = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({
          // the raw signal, as the iPad recorded it: echo cancellation would
          // eat the shapes' own sound, and gain control would flatten the
          // loudness that sets the stroke width
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        })
      : Promise.reject(new Error('This browser has no microphone access.'));
    await this.ctx.audioWorklet.addModule(workletUrl);
    this.node = new AudioWorkletNode(this.ctx, 'singing-fingers', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    this.node.port.onmessage = (e) => this.onMessage(e.data);
    this.node.connect(this.ctx.destination);
    await resumed;
    try {
      this.mic = await micReq;
      this.ctx.createMediaStreamSource(this.mic).connect(this.node);
    } catch (err) {
      this.micError = err;
    }
    // iOS suspends the context after a call or app switch, and only a gesture
    // that ends (touchend, click) may resume it
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
      addEventListener(type, () => this.running || this.resume(), { capture: true, passive: true });
    }
  }

  resume() {
    return this.ctx?.resume().catch(() => {});
  }

  onMessage(m) {
    if (m.t === 'tick') {
      this.hue = m.hue;
      this.saturation = m.saturation;
      this.width = m.width;
      this.recId = m.recId;
      this.recPos = m.recPos;
      this.onTick(m);
    } else if (m.t === 'ended') {
      this.onEnded(m.id, m.token);
    } else if (m.t === 'recorded') {
      this.onRecorded(m.id, m.samples);
    }
  }

  send(m, transfer) {
    this.node?.port.postMessage(m, transfer);
  }

  record(id) {
    this.recId = id;
    this.recPos = 0;
    this.send({ t: 'record', id });
  }
  endRecord(id) {
    this.send({ t: 'endRecord', id });
  }
  load(id, samples) {
    this.send({ t: 'load', id, samples });
  }
  play(id, pos, token) {
    this.send({ t: 'play', id, pos, token });
  }
  direction(id, rate) {
    this.send({ t: 'direction', id, rate });
  }
  stop(id) {
    this.send({ t: 'stop', id });
  }
  remove(id) {
    this.send({ t: 'remove', id });
  }
  clear() {
    this.send({ t: 'clear' });
  }
}

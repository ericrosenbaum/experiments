// Audio in and out: recording, speech-to-text, speech synthesis, and playing
// a sequence of Lines (recorded clip if there is one, synth voice otherwise).

import { getClip } from './store.js';
import { playSound, duck, quiet, unquiet } from './audio.js';

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// ---- recording -----------------------------------------------------------
let stream = null;
async function mic() {
  if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  return stream;
}

function pickMime() {
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  }
  return '';
}

// ---- speech-to-text backends ---------------------------------------------
let asrPromise = null;
export const whisper = {
  name: 'whisper',
  model: 'Xenova/whisper-tiny.en',
  status: 'not loaded',
  ready(onProgress) {
    if (!asrPromise) {
      this.status = 'loading';
      asrPromise = import(TRANSFORMERS_URL).then(async ({ pipeline }) => {
        const p = await pipeline('automatic-speech-recognition', this.model, { progress_callback: onProgress });
        this.status = 'ready';
        return p;
      }).catch((e) => { this.status = 'failed: ' + e.message; asrPromise = null; throw e; });
    }
    return asrPromise;
  },
  async transcribe(blob) {
    const asr = await this.ready();
    const pcm = await toPcm16k(blob);
    const out = await asr(pcm);
    return (out.text || '').trim();
  },
};

async function toPcm16k(blob) {
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buf);
  ctx.close();
  const len = Math.ceil(decoded.duration * 16000);
  const off = new OfflineAudioContext(1, len, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

// Web Speech recognition. Asks for on-device processing where the browser
// supports it; otherwise (most browsers today) it may use a cloud service.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const webspeech = {
  name: 'webspeech',
  supported: !!SR,
  local: 'unknown',
  async checkLocal(lang = 'en-US') {
    if (!SR?.available) return (this.local = 'unknown (no on-device API)');
    try {
      this.local = await SR.available({ langs: [lang], processLocally: true });
      if (this.local === 'downloadable') await SR.install({ langs: [lang], processLocally: true }), (this.local = 'available');
    } catch (e) { this.local = 'error: ' + e.message; }
    return this.local;
  },
  start(lang = 'en-US') {
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    if (this.local === 'available' && 'processLocally' in rec) rec.processLocally = true;
    let finalText = '';
    let interim = '';
    rec.onresult = (e) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      this.onInterim?.((finalText + interim).trim());
    };
    const done = new Promise((res) => { rec.onend = () => res((finalText + interim).trim()); rec.onerror = () => {}; });
    rec.start();
    return { stop: () => { rec.stop(); return done; } };
  },
};

// ---- capture: one tap-to-talk turn -> { blob, text } ------------------------
// mode: 'whisper' (record, then transcribe the clip on-device),
//       'webspeech' (record + browser recognition at the same time),
//       'record-only' (just audio; text comes from the type box).
export async function startCapture(mode, { onInterim } = {}) {
  const s = await mic();
  const mime = pickMime();
  const rec = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => (rec.onstop = res));
  rec.start();
  let ws = null;
  if (mode === 'webspeech' && webspeech.supported) {
    webspeech.onInterim = onInterim;
    try { ws = webspeech.start(); } catch { ws = null; }
  }
  const t0 = performance.now();
  return {
    async stop() {
      const wsText = ws ? ws.stop() : null;
      rec.stop();
      await stopped;
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      const seconds = (performance.now() - t0) / 1000;
      let text = '';
      let asrMs = 0;
      const t1 = performance.now();
      if (mode === 'whisper') text = await whisper.transcribe(blob);
      else if (wsText) text = await wsText;
      asrMs = Math.round(performance.now() - t1);
      return { blob, text, seconds, asrMs };
    },
  };
}

// ---- speech synthesis ----------------------------------------------------
let voice = null;
export function pickVoice(preferName) {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang?.startsWith('en'));
  voice = vs.find((v) => v.name === preferName)
    || vs.find((v) => v.localService && v.default)
    || vs.find((v) => v.localService)
    || vs[0] || null;
  return voice;
}
export const voices = () => speechSynthesis.getVoices().filter((v) => v.lang?.startsWith('en'));
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => voice || pickVoice();

// Mobile speech synthesis is fragile:
// - iOS speaks only after a first speak() inside a tap (unlockSpeech).
// - An utterance can be garbage-collected mid-speech, so its onend never fires;
//   keep a reference until it's done.
// - speak() right after cancel() is sometimes dropped.
// - Some phones stay silent while the page's Web Audio (the music) holds the
//   audio, and a chosen voice can fail where the system default works.
// So a line that doesn't start gets retried down a ladder of fixes, and the
// first one that works is kept for the rest of the session:
//   normal → pause Web Audio + default voice → close Web Audio + default voice
const LADDER = [
  { name: 'normal', quiet: null, defaultVoice: false, wait: 1500 },
  { name: 'pause music, default voice', quiet: 'suspend', defaultVoice: true, wait: 2500 },
  { name: 'close audio, default voice', quiet: 'close', defaultVoice: true, wait: 3500 },
];
let rung = 0;
let failures = 0; // lines where nothing worked; after two, stop retrying
let speaking = null;
let lastCancel = 0;
export const ttsStatus = { lines: 0, started: 0, retried: 0, way: null, error: '' };

export function unlockSpeech() {
  if (!('speechSynthesis' in window) || unlockSpeech.done) return;
  unlockSpeech.done = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

function speakOnce(text, { rate = 1, startWithin = 0, defaultVoice = false } = {}) {
  return new Promise((res) => {
    const u = new SpeechSynthesisUtterance(text);
    let custom = false;
    if (!defaultVoice && (voice || pickVoice())) { try { u.voice = voice; custom = true; } catch { /* stale voice object */ } }
    u.lang = (custom && voice.lang) || 'en-US';
    u.rate = rate;
    speaking = u;
    let started = false;
    const finish = (ok) => { clearTimeout(noStart); clearTimeout(guard); if (speaking === u) speaking = null; res(ok); };
    // Some engines never fire onend (or have no voices at all); don't hang the game.
    const guard = setTimeout(() => finish(started), 4000 + text.length * 90 / rate);
    const noStart = startWithin ? setTimeout(() => {
      if (!started) { speechSynthesis.cancel(); lastCancel = performance.now(); finish(false); }
    }, startWithin) : null;
    u.onstart = () => { started = true; ttsStatus.started++; clearTimeout(noStart); };
    u.onend = () => finish(true);
    u.onerror = (e) => { ttsStatus.error = e.error || 'error'; finish(started); };
    speechSynthesis.resume(); // Chrome on Android can get stuck paused
    speechSynthesis.speak(u);
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function say(text, { rate = 1 } = {}) {
  if (!text || !('speechSynthesis' in window)) return;
  ttsStatus.lines++;
  const since = performance.now() - lastCancel;
  if (since < 150) await pause(150 - since);
  const known = ttsStatus.way != null && failures < 2 ? !ttsStatus.way.startsWith('none') : failures >= 2;
  for (let r = rung; r < LADDER.length; r++) {
    const step = LADDER[r];
    if (r > rung) ttsStatus.retried++;
    if (step.quiet) await quiet(step.quiet);
    try {
      if (r > 0) await pause(150);
      // Once a way is known to work, don't cut lines off waiting for onstart.
      const ok = await speakOnce(text, { rate, defaultVoice: step.defaultVoice, startWithin: known && r === rung ? 0 : step.wait });
      if (ok || (known && r === rung)) { rung = r; ttsStatus.way = step.name; return; }
    } finally {
      if (step.quiet) unquiet();
    }
  }
  ttsStatus.way = 'none worked';
  if (++failures >= 2) { rung = 0; ttsStatus.way = 'none worked (stopped retrying)'; }
}

// One spoken test line with no music, for the settings dialog.
export async function testVoice() {
  const t0 = performance.now();
  await quiet('suspend');
  try {
    const chosen = await speakOnce('This is the narrator.', { startWithin: 3000 });
    const fallback = chosen ? null : await speakOnce('This is the default voice.', { startWithin: 3000, defaultVoice: true });
    return { chosen, fallback, ms: Math.round(performance.now() - t0) };
  } finally {
    unquiet();
  }
}

export function voiceInfo() {
  const all = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
  return { count: all.length, voice: voice ? `${voice.name}${voice.localService ? ' (on device)' : ' (network)'}` : 'system default' };
}

// ---- playing a sequence of Lines -----------------------------------------
let current = null; // { cancel }
let audioEl = null;

export function stopSpeaking() {
  current?.cancel();
  if (window.speechSynthesis) { speechSynthesis.cancel(); lastCancel = performance.now(); }
  if (audioEl) { audioEl.pause(); audioEl = null; }
}

export async function playClip(id) {
  const blob = await getClip(id);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  audioEl = new Audio(url);
  await new Promise((res) => { audioEl.onended = audioEl.onerror = res; audioEl.play().catch(res); });
  URL.revokeObjectURL(url);
  return true;
}

// Short glue words (",", "and") are merged into neighbouring synth text so the
// synth voice doesn't stop and start on every comma.
export async function playLines(lines, { onLine } = {}) {
  stopSpeaking();
  let cancelled = false;
  current = { cancel: () => (cancelled = true) };
  const merged = [];
  for (const l of lines) {
    const prev = merged[merged.length - 1];
    if (!l.clip && !l.sfx && prev && !prev.clip && !prev.sfx) prev.text = `${prev.text} ${l.text}`.replace(/\s+([,.])/g, '$1');
    else merged.push({ ...l });
  }
  try {
    for (const l of merged) {
      if (cancelled) break;
      onLine?.(l);
      if (l.sfx) { duck(true); await playSound(l.sfx); continue; }
      if (!l.text && !l.clip) continue;
      duck(true);
      if (l.clip && (await playClip(l.clip))) continue;
      await say(l.text);
    }
  } finally {
    if (!cancelled) duck(false);
  }
}

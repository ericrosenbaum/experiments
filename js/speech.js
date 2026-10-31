// Audio in and out: recording, speech-to-text, speech synthesis, and playing
// a sequence of Lines (recorded clip if there is one, synth voice otherwise).

import { getClip } from './store.js';

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

export function say(text, { rate = 1 } = {}) {
  return new Promise((res) => {
    if (!text || !('speechSynthesis' in window)) return res();
    const u = new SpeechSynthesisUtterance(text);
    if (voice || pickVoice()) u.voice = voice;
    u.rate = rate;
    // Some engines never fire onend (or have no voices at all); don't hang the game.
    const guard = setTimeout(res, 3000 + text.length * 90 / rate);
    u.onend = u.onerror = () => { clearTimeout(guard); res(); };
    speechSynthesis.speak(u);
  });
}

// ---- playing a sequence of Lines -----------------------------------------
let current = null; // { cancel }
let audioEl = null;

export function stopSpeaking() {
  current?.cancel();
  speechSynthesis?.cancel();
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
    if (!l.clip && prev && !prev.clip) prev.text = `${prev.text} ${l.text}`.replace(/\s+([,.])/g, '$1');
    else merged.push({ ...l });
  }
  for (const l of merged) {
    if (cancelled) break;
    onLine?.(l);
    if (l.clip && (await playClip(l.clip))) continue;
    await say(l.text);
  }
}

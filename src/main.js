// The page: lobby, camera, the room connection, and the wiring between the
// world worker, the other browsers, speech recognition and camera tracking.
import { WORLD } from './world/primitives.js';
import { WorldHost } from './world/host.js';
import { Mesh } from './rtc.js';
import { listen } from './speech.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let room = params.get('room');
if (!room || !/^[a-z0-9-]{3,40}$/.test(room)) {
  room = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  params.set('room', room);
  history.replaceState(null, '', `?${params}`);
}

const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
$('name').value = params.get('name') ?? store.get('worldchat-name') ?? '';

let ws = null;
let meId = null;
let hostId = null;
let stream = null;
let mesh = null;
let perception = null;
let percept = { hands: [], face: null, pose: null };
let speech = null;
const videos = new Map(); // id -> <video>
const state = { version: 0, status: '', kind: 'idle' };
window.__wc = state; // read by the end-to-end test
state.say = (text) => send({ type: 'utter', text }); // stands in for speech recognition there

// ---- status line -------------------------------------------------------

function setStatus(kind, text) {
  state.kind = kind;
  state.status = text;
  $('status').dataset.kind = kind;
  $('status').textContent = text;
}
let finalLine = '';
function setHeard(line, interim = '') {
  if (line != null) finalLine = line;
  const el = $('heard');
  el.textContent = finalLine;
  if (interim) { const s = document.createElement('span'); s.className = 'interim'; s.textContent = `${finalLine ? '  ' : ''}${interim}`; el.append(s); }
}

// ---- the world ---------------------------------------------------------

const send = (m) => { if (ws?.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
let lastState = '';
let lastStateAt = 0;

const host = new WorldHost($('stage'), {
  me(s) {
    const json = JSON.stringify({ ...s, ...percept, hasVideo: hasVideo() });
    const now = performance.now();
    if (json === lastState && now - lastStateAt < 2000) return;
    lastState = json;
    lastStateAt = now;
    send(`{"type":"state","s":${json}}`);
  },
  shared(json) { if (meId === hostId) send(`{"type":"shared","s":${json}}`); },
  error(m) { console.warn('world error', m); send({ type: 'error', version: m.version, module: m.module, message: m.message }); },
  async needs(list) {
    state.needs = list;
    if (!list.length && !perception) return;
    if (!perception) {
      const { Perception } = await import('./perception.js');
      perception ??= new Perception({
        own: () => videos.get(meId),
        videos: () => videos,
        onPercept(p) { percept = p; sendPercept(); },
        onCutout(id, bitmap) { host.send({ type: 'frame', id, bitmap, cutout: true }, [bitmap]); },
        onProblem(text) { setStatus('error', text); },
      });
    }
    perception.setNeeds(list);
  },
});

host.onCanvas = () => sendPercept(); // a replaced worker needs to hear this again

const hasVideo = () => !!stream?.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');
const sendPercept = () => host.send({ type: 'percept', ...percept, hasVideo: hasVideo() });

// Each camera's frames go to the worker as bitmaps, small enough to be cheap.
function addVideo(id, mediaStream, muted) {
  removeVideo(id);
  const v = document.createElement('video');
  v.autoplay = true;
  v.playsInline = true;
  v.muted = muted;
  v.srcObject = mediaStream;
  $('videos').append(v);
  videos.set(id, v);
  v.play().catch(() => {});
  let busy = false;
  const step = () => {
    if (videos.get(id) !== v) return;
    if (!busy && v.videoWidth) {
      busy = true;
      const w = Math.min(480, v.videoWidth);
      createImageBitmap(v, { resizeWidth: w, resizeHeight: Math.round(w * v.videoHeight / v.videoWidth), resizeQuality: 'low' })
        .then((bitmap) => host.send({ type: 'frame', id, bitmap }, [bitmap]), () => {})
        .finally(() => { busy = false; });
    }
    v.requestVideoFrameCallback(step);
  };
  v.requestVideoFrameCallback(step);
}

function removeVideo(id) {
  const v = videos.get(id);
  if (!v) return;
  videos.delete(id);
  v.srcObject = null;
  v.remove();
  host.send({ type: 'frame', id, bitmap: null });
  host.send({ type: 'frame', id, bitmap: null, cutout: true });
}

// ---- the room ----------------------------------------------------------

function connect(name) {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${room}`);
  ws.onopen = () => send({ type: 'hello', name });
  ws.onclose = (ev) => { if (meId || ev.reason) setStatus('error', ev.reason || 'Lost the connection. Reload to rejoin.'); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case 'welcome': {
        meId = m.id;
        hostId = m.hostId;
        state.meId = meId;
        state.version = m.program.version;
        host.setRoster(m.players, m.hostId);
        host.setShared(m.shared, true);
        host.setProgram(m.program);
        host.start(meId);
        for (const [id, s] of Object.entries(m.states)) host.send({ type: 'state', id, s });
        sendPercept();
        if (stream) addVideo(meId, stream, true);
        mesh = new Mesh({
          stream,
          signal: (to, data) => send({ type: 'signal', to, data }),
          onStream: (id, s) => (s ? addVideo(id, s, false) : removeVideo(id)),
        });
        for (const id of m.peers) mesh.call(id);
        state.players = m.players.length;
        if (m.ai === 'none') setStatus('error', 'The server has no Claude key, so the world cannot change yet.');
        else if (m.ai === 'mock') setStatus('idle', 'Mock mode: canned answers only.');
        break;
      }
      case 'roster':
        hostId = m.hostId;
        host.setRoster(m.players, m.hostId);
        state.players = m.players.length;
        if (m.left) mesh?.drop(m.left);
        break;
      case 'signal': mesh?.receive(m.from, m.data); break;
      case 'state': host.send({ type: 'state', id: m.id, s: m.s }); break;
      case 'shared': host.setShared(m.s); break;
      case 'program': state.version = m.version; host.setProgram({ version: m.version, modules: m.modules }); break;
      case 'heard': setHeard(`${m.name}: ${m.text}`); break;
      case 'status':
        if (m.kind === 'building') setStatus('building', `Making it for ${m.by}: ${m.text}`);
        else if (m.kind === 'fixing') setStatus('fixing', `That broke, trying again: ${m.text}`);
        else setStatus(m.kind, m.text);
        break;
    }
  };
}

async function join(name) {
  store.set('worldchat-name', name);
  const audio = { echoCancellation: true, noiseSuppression: true };
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio }); } catch {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio }); } catch { stream = null; }
  }
  $('lobby').hidden = true;
  $('bar').hidden = false;
  connect(name);

  speech = listen({
    onInterim: (text) => setHeard(null, text),
    onFinal: (text) => send({ type: 'utter', text }),
    onState(s) {
      const mic = $('mic');
      mic.setAttribute('aria-pressed', String(s === 'on'));
      mic.textContent = s === 'on' ? 'Listening' : s === 'unsupported' ? 'No speech here' : s === 'blocked' ? 'Mic blocked' : 'Not listening';
      mic.disabled = s === 'unsupported';
    },
  });
  if (params.get('listen') !== '0') speech.start();
}

$('join').addEventListener('submit', (ev) => { ev.preventDefault(); join($('name').value.trim() || 'Someone'); });
if (params.get('auto') === '1') join($('name').value.trim() || 'Someone');

$('ask').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = $('text').value.trim();
  if (!text) return;
  send({ type: 'ask', text });
  $('text').value = '';
  $('text').blur(); // so arrow keys go back to the world
});
$('undo').addEventListener('click', () => send({ type: 'undo' }));
$('mic').addEventListener('click', () => { if ($('mic').getAttribute('aria-pressed') === 'true') speech?.stop(); else speech?.start(); });
$('invite').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${room}`;
  try { await navigator.clipboard.writeText(url); $('invite').textContent = 'Copied'; } catch { prompt('Copy this link', url); }
  setTimeout(() => { $('invite').textContent = 'Copy invite'; }, 1500);
});

// ---- input for the world ----------------------------------------------

const typing = (ev) => ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement;
const WORLD_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);
addEventListener('keydown', (ev) => {
  if (typing(ev) || ev.metaKey || ev.ctrlKey || ev.altKey || !meId) return;
  if (WORLD_KEYS.has(ev.key)) ev.preventDefault();
  if (!ev.repeat) host.send({ type: 'key', key: ev.key, down: true });
});
addEventListener('keyup', (ev) => { if (meId) host.send({ type: 'key', key: ev.key, down: false }); });
addEventListener('blur', () => host.send({ type: 'keysclear' }));

let pointerDown = false;
function pointer(ev) {
  const r = host.canvas?.getBoundingClientRect();
  if (!r?.width) return;
  host.send({ type: 'pointer', x: ((ev.clientX - r.left) / r.width) * WORLD.W, y: ((ev.clientY - r.top) / r.height) * WORLD.H, down: pointerDown });
}
$('stage').addEventListener('pointermove', pointer);
$('stage').addEventListener('pointerdown', (ev) => { pointerDown = true; pointer(ev); });
addEventListener('pointerup', (ev) => { pointerDown = false; pointer(ev); });

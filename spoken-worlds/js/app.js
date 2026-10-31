import { SAMPLE_WORLD } from './sample.js';
import { newState, choicesFor, describe, step, lint, parseRules } from './engine.js';
import { decide, lexical, BACKENDS, llm } from './decide.js';
import { startCapture, playLines, stopSpeaking, playClip, say, voices, pickVoice, whisper, webspeech } from './speech.js';
import * as store from './store.js';
import { authorWorld, AUTHOR_COMMANDS, Signal, summary, newScene } from './author.js';

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
};

// ---- settings ----------------------------------------------------------------
const settings = Object.assign(
  { asr: window.SpeechRecognition || window.webkitSpeechRecognition ? 'webspeech' : 'whisper', backend: 'lexical', hybrid: false, voice: '' },
  JSON.parse(localStorageGet('sw-settings') || '{}'),
);
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function saveSettings() { try { localStorage.setItem('sw-settings', JSON.stringify(settings)); } catch {} }

// ---- app state ---------------------------------------------------------------
let world = null;
let mode = 'play';
let game = null; // play state
let lastDecision = null;
let lastHeard = '';
let lastClip = null;
let focus = null; // authoring focus { scene, need, option }
let authoring = false;
let pendingAnswer = null; // resolver for io.ask

const save = debounce(() => world && store.putWorld(world), 300);
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---- views -------------------------------------------------------------------
async function showHome() {
  stopAll();
  world = null;
  $('#home').hidden = false;
  $('#world').hidden = true;
  $('#world-title').textContent = '';
  const list = $('#world-list');
  list.replaceChildren();
  const worlds = await store.listWorlds();
  if (!worlds.length) list.append(el('li', { class: 'muted' }, 'No worlds yet.'));
  for (const w of worlds) {
    list.append(el('li', { onclick: () => openWorld(w.id) },
      el('span', {}, el('strong', { text: w.title || 'Untitled' }), el('span', { class: 'muted small', text: `  ${Object.keys(w.scenes).length} places` })),
      el('span', { class: 'muted', text: '›' })));
  }
}

async function openWorld(id, startMode = 'play') {
  world = await store.getWorld(id);
  if (!world) return showHome();
  $('#home').hidden = true;
  $('#world').hidden = false;
  $('#world-title').textContent = world.title || 'Untitled';
  $('#log').replaceChildren();
  setMode(startMode);
}

function stopAll() {
  stopSpeaking();
  authoring = false;
  if (pendingAnswer) { pendingAnswer.reject(new Signal('stop')); pendingAnswer = null; }
}

function setMode(m) {
  stopAll();
  mode = m;
  for (const b of document.querySelectorAll('.tabs [data-mode]')) b.setAttribute('aria-selected', b.dataset.mode === m);
  $('#talk-pane').hidden = m === 'map';
  $('#map-pane').hidden = m !== 'map';
  $('#teach').hidden = true;
  $('#hint').textContent = '';
  if (m === 'map') renderMap();
  if (m === 'play') startPlay();
  if (m === 'author') startAuthoring();
  renderDebug();
}

// ---- log -----------------------------------------------------------------------
function log(who, lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const text = arr.map((l) => (typeof l === 'string' ? l : l.text)).join(' ').replace(/\s+([,.])/g, '$1');
  const hasClip = arr.some((l) => l?.clip);
  const m = el('div', { class: `msg ${who}` }, el('span', { class: 'tag', text: who === 'you' ? 'you' : 'narrator' }), text,
    hasClip ? el('span', { class: 'clip', text: '  ● recorded' }) : null);
  $('#log').append(m);
  $('#log').scrollTop = 1e9;
}
async function speak(lines) {
  log('narrator', lines);
  await playLines(lines.map((l) => (typeof l === 'string' ? { text: l } : l)));
}

// ---- input: tap to talk / type ------------------------------------------------------
let capture = null;
let heldBlob = null; // typing-only mode: audio recorded before the words are typed
const talk = $('#talk');
function setTalk(state) {
  talk.classList.toggle('recording', state === 'rec');
  talk.classList.toggle('busy', state === 'busy');
  talk.firstChild.textContent = state === 'rec' ? 'Tap when done' : state === 'busy' ? 'Listening…' : 'Tap to talk';
}

talk.addEventListener('click', async () => {
  if (talk.classList.contains('busy')) return;
  if (!capture) {
    stopSpeaking();
    try {
      $('#caption').textContent = '';
      capture = await startCapture(settings.asr === 'typed' ? 'record-only' : settings.asr, { onInterim: (t) => ($('#caption').textContent = t) });
      setTalk('rec');
    } catch (e) {
      $('#caption').textContent = 'Microphone unavailable: ' + e.message;
    }
    return;
  }
  const c = capture;
  capture = null;
  setTalk('busy');
  if (settings.asr === 'whisper' && whisper.status !== 'ready') $('#caption').textContent = 'Loading Whisper (first time only)…';
  try {
    const r = await c.stop();
    $('#caption').textContent = r.text ? `heard: “${r.text}”  (${r.seconds.toFixed(1)}s audio, ${r.asrMs} ms to transcribe)` : 'Didn’t catch any words — try again, or type.';
    if (settings.asr === 'typed' && !r.text) {
      // record-only: keep the audio, take the words from the type box
      const typed = $('#type-input').value.trim();
      if (!typed) { $('#caption').textContent = 'Recorded. Now type what you said and press Send.'; heldBlob = r.blob; return; }
      r.text = typed;
    }
    if (r.text) await handleInput(r.text, r.blob);
  } catch (e) {
    $('#caption').textContent = 'Speech-to-text failed: ' + e.message;
  } finally {
    setTalk('idle');
  }
});

$('#type-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('#type-input').value.trim();
  if (!t) return;
  $('#type-input').value = '';
  const b = heldBlob;
  heldBlob = null;
  stopSpeaking();
  handleInput(t, b);
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !$('#world').hidden && mode !== 'map' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) {
    e.preventDefault();
    talk.click();
  }
});

async function handleInput(text, blob) {
  lastHeard = text;
  log('you', text);
  if (mode === 'author' && pendingAnswer) {
    const p = pendingAnswer;
    pendingAnswer = null;
    p.resolve({ text, blob });
  } else if (mode === 'play') {
    await playTurn(text);
  }
}

// ---- play ----------------------------------------------------------------------
async function startPlay(fromScene) {
  $('#log').replaceChildren();
  const saved = await store.getProgress(world.id);
  if (fromScene) {
    game = { ...newState(world), scene: fromScene, visited: [fromScene] };
  } else {
    game = saved && world.scenes[saved.scene] && !saved.ended ? saved : newState(world);
  }
  renderDebug();
  $('#hint').textContent = 'Tap to talk (or press space). Try “what can I do?”';
  const intro = game.turn === 0 ? [{ text: world.title + '.' }] : [{ text: 'Welcome back.' }];
  await speak([...intro, ...describe(world, game)]);
}

async function playTurn(text) {
  $('#teach').hidden = true;
  const choices = choicesFor(world, game);
  const t0 = performance.now();
  const res = await decide(text, choices, { backend: settings.backend, hybrid: settings.hybrid });
  res.ms = Math.round(performance.now() - t0);
  res.heard = text;
  lastDecision = res;
  const { state, lines } = step(world, game, res.choice);
  game = state;
  store.putProgress(world.id, game);
  renderDebug();
  if (res.choice == null) showTeach(text);
  await speak(lines);
}

// After a miss, let the author teach the world what that utterance meant.
function showTeach(text) {
  const opts = world.scenes[game.scene]?.options || [];
  if (!opts.length) return;
  const box = $('#teach');
  box.replaceChildren(el('div', { class: 'small muted', text: `Author tip: what should “${text}” have meant? Tapping one adds it as another way to say that option.` }),
    ...opts.map((o) => el('button', { class: 'small', onclick: () => {
      o.also = [...(o.also || []), text];
      save();
      box.hidden = true;
      playTurnWithChoice(o.id);
    } }, o.phrase?.text || o.id)));
  box.hidden = false;
}
async function playTurnWithChoice(id) {
  const { state, lines } = step(world, game, id);
  game = state;
  store.putProgress(world.id, game);
  renderDebug();
  await speak(lines);
}

// ---- author --------------------------------------------------------------------
const answered = { n: 0 };
const io = {
  say: (t) => speak([t]),
  setFocus: (f) => { focus = f; renderDebug(); },
  async ask(prompt, spec = {}) {
    for (;;) {
      if (!authoring) throw new Signal('stop');
      $('#hint').textContent = hintFor(spec);
      const heard = new Promise((resolve, reject) => (pendingAnswer = { resolve, reject }));
      await speak([prompt]);
      const { text, blob } = await heard;
      const cmd = await commandFor(text, spec);
      if (cmd === '@redo') throw new Signal('undo');
      if (cmd === '@playback') { if (lastClip) await playClip(lastClip); else await speak(['Nothing recorded yet.']); continue; }
      if (cmd === '@skip') return { skipped: true, text: '' };
      if (cmd === '@where') { await speak([summary(world, focus)]); continue; }
      if (cmd === '@play') throw new Signal('play');
      if (cmd === '@stop') throw new Signal('stop');

      let choice = null;
      if (spec.kind === 'choice' && spec.choices.length) {
        const r = await decide(text, spec.choices, { backend: settings.backend, hybrid: settings.hybrid });
        lastDecision = { ...r, heard: text };
        renderDebug();
        choice = r.choice;
      } else if (spec.choices?.length) {
        // Free speech with an escape hatch ("that's all"): only near-exact matches count.
        const r = await lexical.decide(text, spec.choices);
        if (r.confidence >= 0.8) choice = r.choice;
      }
      if (spec.kind === 'choice' && !choice && !spec.allowFree) {
        await speak(["Sorry, I didn't catch which one."]);
        continue;
      }
      let clip = null;
      if (blob && !choice) { clip = await store.saveRecording(blob); lastClip = clip; }
      answered.n++;
      return { text: cleanup(text), clip, choice };
    }
  },
};

function cleanup(t) {
  return t.trim().replace(/^(um+|uh+|so|okay|ok)[, ]+/i, '').replace(/^\w/, (c) => c.toUpperCase());
}

function hintFor(spec) {
  const base = 'Anytime: “go back”, “play it back”, “skip”, “where am I”, “play from here”, “stop”.';
  if (spec.kind === 'choice') return `Options: ${spec.choices.map((c) => c.phrases[0]).join(' · ')}.  ${base}`;
  return base;
}

// Author commands must match a command phrase almost exactly when the question
// expects free speech, so that "go back to the cabin" stays content.
async function commandFor(text, spec) {
  const norm = text.toLowerCase().replace(/[^a-z' ]/g, '').replace(/\b(um|uh|please|okay|ok)\b/g, '').trim().replace(/\s+/g, ' ');
  for (const c of AUTHOR_COMMANDS) if (c.phrases.includes(norm)) return c.id;
  if (spec.kind === 'choice') {
    const r = await lexical.decide(text, AUTHOR_COMMANDS);
    if (r.choice && r.confidence >= 0.8) return r.choice;
  }
  return null;
}

async function startAuthoring() {
  authoring = true;
  $('#log').replaceChildren();
  const undo = [];
  for (;;) {
    undo.push(JSON.stringify(world));
    answered.n = 0;
    try {
      await authorWorld(world, io, async () => { await store.putWorld(world); undo.push(JSON.stringify(world)); answered.n = 0; });
      authoring = false;
      $('#world-title').textContent = world.title;
      return;
    } catch (s) {
      if (!(s instanceof Signal)) { console.error(s); log('narrator', 'Something went wrong: ' + s.message); authoring = false; return; }
      if (s.type === 'undo') {
        // Redo the current step; if nothing was answered in it yet, the one before.
        let target = undo.pop();
        if (answered.n === 0 && undo.length) target = undo.pop();
        world = JSON.parse(target);
        await store.putWorld(world);
        await speak(['Okay, let’s redo that.']);
        continue;
      }
      if (s.type === 'play') { const at = focus?.scene; setMode('play'); if (at) startPlay(at); return; }
      if (s.type === 'stop') { if (authoring) { authoring = false; await speak(['Stopped. Your work is saved.']); } return; }
    } finally {
      $('#world-title').textContent = world.title || 'Untitled';
    }
  }
}

// ---- debug panel -------------------------------------------------------------------
function renderDebug() {
  const b = $('#debug-body');
  if (!b || !world) return;
  const rows = [];
  if (mode === 'play' && game) {
    rows.push(`scene     ${game.scene} (${world.scenes[game.scene]?.name})`);
    rows.push(`have      ${game.have.join(', ') || '—'}`);
    rows.push(`switches  ${game.facts.join(', ') || '—'}`);
    rows.push(`visited   ${game.visited.join(', ')}`);
    rows.push(`turn      ${game.turn}${game.ended ? '  ENDED: ' + game.ended : ''}`);
  }
  if (mode === 'author') {
    rows.push(summary(world, focus));
    if (focus) rows.push(`next: ${focus.need} @ ${focus.scene}${focus.option ? ' / ' + focus.option : ''}`);
  }
  b.replaceChildren(el('pre', { text: rows.join('\n') }));
  if (lastDecision) {
    const d = lastDecision;
    b.append(el('div', { class: 'small', text: `heard “${d.heard}” → ${d.choice ?? 'nothing'}  [${d.backend}${d.ms != null ? ', ' + d.ms + ' ms' : ''}]${d.note ? ' — ' + d.note : ''}` }));
    for (const s of d.scores.slice(0, 6)) {
      b.append(el('div', { class: s.id === d.choice ? 'chosen small' : 'small' },
        el('span', { class: 'bar-score', style: `width:${Math.max(2, s.score * 120)}px` }), `${s.score.toFixed(2)}  ${s.id}`));
    }
  }
}

// ---- map / editor -----------------------------------------------------------------
function lineField(label, line, set, opts = {}) {
  const ta = el('textarea', { rows: opts.rows || 2, oninput: (e) => { set({ ...(line || {}), text: e.target.value }); save(); refreshIssues(); } });
  ta.value = line?.text || '';
  const recBtn = el('button', { class: 'small', type: 'button', title: 'Record this line' }, line?.clip ? 'Re-record' : 'Record');
  let cap = null;
  recBtn.addEventListener('click', async () => {
    if (!cap) {
      stopSpeaking();
      try { cap = await startCapture(settings.asr === 'typed' ? 'record-only' : settings.asr); } catch (e) { alert(e.message); return; }
      recBtn.textContent = 'Stop';
      recBtn.classList.add('danger');
      return;
    }
    const c = cap;
    cap = null;
    recBtn.textContent = '…';
    const r = await c.stop();
    const clip = await store.saveRecording(r.blob);
    line = { text: r.text || ta.value, clip };
    ta.value = line.text;
    set(line);
    save();
    recBtn.textContent = 'Re-record';
    recBtn.classList.remove('danger');
  });
  const playBtn = el('button', { class: 'small', type: 'button', onclick: () => playLines([line || { text: ta.value }]) }, '▶');
  return el('label', { class: 'field' }, el('span', {}, label, line?.clip ? el('b', { text: '● recorded' }) : null, recBtn, playBtn), ta);
}

function renderMap() {
  const map = $('#map');
  map.replaceChildren();
  const sel = $('#start-select');
  sel.replaceChildren(...Object.entries(world.scenes).map(([id, s]) => el('option', { value: id, selected: id === world.start }, s.name || id)));
  for (const [id, sc] of Object.entries(world.scenes)) {
    const card = el('div', { class: 'scene' + (focus?.scene === id ? ' focus' : ''), id: 'scene-' + id });
    const name = el('input', { value: sc.name || '', placeholder: 'place name', oninput: (e) => { sc.name = e.target.value; save(); } });
    card.append(el('header', {}, name, el('span', { class: 'id', text: `go ${id}` }),
      el('button', { class: 'small', onclick: () => { setMode('play'); startPlay(id); } }, 'Play from here'),
      el('button', { class: 'small danger ghost', onclick: () => { if (confirm(`Delete ${sc.name}?`)) { delete world.scenes[id]; save(); renderMap(); } } }, 'Delete')));
    card.append(lineField('Description', sc.description, (l) => (sc.description = l), { rows: 3 }));
    sc.options.forEach((o, i) => {
      const also = el('input', { value: (o.also || []).join(', '), placeholder: 'other ways to say it, comma-separated', oninput: (e) => { o.also = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); save(); } });
      const rules = el('textarea', { class: 'rules', rows: 2, placeholder: 'rules, one per line (see cheat sheet)', oninput: (e) => { o.rules = e.target.value; save(); refreshIssues(); } });
      rules.value = o.rules || '';
      card.append(el('div', { class: 'option' },
        el('div', { class: 'grid2' },
          lineField(`Option ${i + 1}: player says`, o.phrase, (l) => (o.phrase = l), { rows: 1 }),
          el('label', { class: 'field' }, el('span', { text: 'also understood as' }), also)),
        lineField('What happens', o.result, (l) => (o.result = l)),
        parseRules(o.rules).needs.length || parseRules(o.rules).needsNot.length
          ? lineField('…if they can’t (recorded “else”)', o.otherwise, (l) => (o.otherwise = l)) : null,
        el('label', { class: 'field' }, el('span', { text: 'rules' }), rules),
        el('button', { class: 'small danger ghost', onclick: () => { sc.options.splice(i, 1); save(); renderMap(); } }, 'Remove option')));
    });
    card.append(el('div', { class: 'row' }, el('button', { class: 'small', onclick: () => {
      sc.options.push({ id: 'option-' + store.newId(), phrase: { text: '' }, also: [], result: { text: '' }, rules: '' });
      save(); renderMap();
    } }, '+ option')));
    map.append(card);
  }
  refreshIssues();
}

function refreshIssues() {
  $('#issues').replaceChildren(...lint(world).map((t) => el('li', { text: t })));
}

$('#start-select').addEventListener('change', (e) => { world.start = e.target.value; save(); refreshIssues(); });
$('#add-scene').addEventListener('click', () => {
  const name = prompt('Name of the new place?');
  if (!name) return;
  const id = newScene(world, name);
  world.scenes[id].description = { text: '' };
  save();
  renderMap();
});
$('#delete-world').addEventListener('click', async () => {
  if (!confirm(`Delete “${world.title}” from this device?`)) return;
  await store.deleteWorld(world.id);
  showHome();
});

// ---- home actions ------------------------------------------------------------------
$('#home-link').addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname); showHome(); });
for (const b of document.querySelectorAll('.tabs [data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));

$('#new-world').addEventListener('click', async () => {
  const w = { id: 'w-' + store.newId(), title: '', start: null, items: {}, scenes: {} };
  await store.putWorld(w);
  await openWorld(w.id, 'author');
});
$('#load-sample').addEventListener('click', async () => {
  const w = structuredClone(SAMPLE_WORLD);
  if (!(await store.getWorld(w.id))) await store.putWorld(w);
  openWorld(w.id);
});
$('#import-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { const w = await store.importWorld(f); openWorld(w.id); } catch (err) { alert(err.message); }
});
$('#export').addEventListener('click', async () => {
  try { await store.shareFile(await store.exportWorld(world)); } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
});
$('#share-link').addEventListener('click', async () => {
  const url = location.origin + location.pathname + (await store.worldToHash(world));
  try { await navigator.clipboard.writeText(url); $('#caption').textContent = `Link copied (${url.length} characters). Recordings aren't included; the narrator voice reads everything.`; }
  catch { prompt('Copy this link:', url); }
});

// ---- settings dialog -----------------------------------------------------------------
const dlg = $('#settings');
function refreshSettings() {
  $('#asr').value = settings.asr;
  $('#backend').value = settings.backend;
  $('#hybrid').checked = settings.hybrid;
  const vs = voices();
  $('#voice').replaceChildren(...vs.map((v) => el('option', { value: v.name, selected: v.name === settings.voice }, `${v.name}${v.localService ? ' (on device)' : ' (network)'}`)));
  $('#asr-status').textContent = settings.asr === 'whisper' ? `Whisper: ${whisper.status}`
    : settings.asr === 'webspeech' ? (webspeech.supported ? `On-device recognition: ${webspeech.local}` : 'Not supported in this browser.') : 'Type answers; the button still records audio for authoring.';
  const b = BACKENDS[settings.backend];
  $('#backend-status').textContent = b.status ? `${b.name}: ${b.status}` : '';
}
$('#settings-btn').addEventListener('click', async () => {
  if (webspeech.supported && webspeech.local === 'unknown') webspeech.checkLocal().then(refreshSettings);
  llm.available().then((a) => { if (llm.status === 'not loaded') llm.status = `not loaded (${a})`; refreshSettings(); });
  refreshSettings();
  dlg.showModal();
});
for (const id of ['asr', 'backend', 'voice']) {
  $('#' + id).addEventListener('change', (e) => {
    settings[id] = e.target.value;
    if (id === 'voice') { pickVoice(settings.voice); say('Hello. This is the narrator.'); }
    saveSettings();
    refreshSettings();
  });
}
$('#hybrid').addEventListener('change', (e) => { settings.hybrid = e.target.checked; saveSettings(); if (settings.hybrid) llm.ready().catch(() => {}); });
$('#preload').addEventListener('click', async (e) => {
  e.preventDefault();
  const progress = (p) => { if (p.status === 'progress') $('#backend-status').textContent = `downloading ${p.file || ''} ${Math.round(p.progress || 0)}%`; };
  const jobs = [];
  if (settings.asr === 'whisper') jobs.push(whisper.ready(progress));
  if (settings.backend !== 'lexical') jobs.push(BACKENDS[settings.backend].ready(progress));
  try { await Promise.all(jobs); } catch (err) { alert('Download failed: ' + err.message); }
  refreshSettings();
});

// ---- boot ----------------------------------------------------------------------------
(async function boot() {
  if ('speechSynthesis' in window) setTimeout(() => pickVoice(settings.voice), 300);
  const shared = await store.worldFromHash(location.hash).catch(() => null);
  if (shared) {
    shared.id ||= 'w-' + store.newId();
    await store.putWorld(shared);
    history.replaceState(null, '', location.pathname);
    return openWorld(shared.id);
  }
  showHome();
})();

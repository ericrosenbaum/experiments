// The World Finder page, in two screens.
//   ask:  a kid types or says what they feel like playing (or browses the
//         tags). Claude (server/finder.js) turns the sentence into tags and
//         keyword wishes ("lava" → the worlds' lava, volcano, magma); the
//         wishes show up as chips they can flip or remove.
//   look: the decision model (model.js) reads the worlds in
//         public/finder/worlds.json one at a time, one fact at a time; each
//         clue fills a wish, and worlds that clear the bar fly over to
//         "Picked for you" with the wish they matched best.
import { FACETS, CRITERIA, THRESHOLD, crit, facetOf, isKeyword, read, decide, hitsFor, parse } from './model.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (p) => `${Math.round(p * 100)}%`;
const colorOf = (id) => `var(--${facetOf(id).color})`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const WORLDS = await (await fetch('./finder/worlds.json')).json();
const KEYWORDS = [...new Set(WORLDS.flatMap((w) => w.keywords ?? []))];
const thumbUrl = (w) => `url('./${w.thumb}')`; // single quotes: it goes inside style="…" attributes

const state = {
  said: {},   // wishes heard in the sentence
  groups: {}, // keyword wishes: {"kw:geology": {matches: [...], related: [...]}}
  tapped: {}, // taps on chips override them: 1, -1, or 0 for "removed"
  speed: 1, run: 0, running: false, order: [], seen: 0, found: 0, tab: FACETS[0].id,
  ai: undefined, asked: '', askSeq: 0, asking: null, askTimer: 0, listening: false,
};
const ms = (base) => base / state.speed;
const sleep = (t, run) => new Promise((ok, no) => setTimeout(() => (run === state.run ? ok() : no(new Error('stopped'))), t));

// What the kid wants: the sentence first, then their taps, without removed ones.
function prefs() {
  const out = { ...state.said };
  for (const [id, v] of Object.entries(state.tapped)) if (v) out[id] = v; else delete out[id];
  return out;
}
const cycle = (v) => (v === 1 ? -1 : v === -1 ? 0 : 1);

// ---- screen 1: ask ----------------------------------------------------------------

const EXAMPLES = [
  ['Dragons and castles', 'Dragons and castles, but nothing too scary. Something easy!'],
  ['Space, no gravity', 'Space with no gravity, made in Africa'],
  ['Cozy farms', 'I love cozy farms with cows. I hate racing.'],
  ['Hard games', 'Hard games where you collect coins'],
];

// What a keyword wish looks for, for tooltips.
function covers(id) {
  const g = state.groups[id];
  if (!g) return '';
  const m = Array.isArray(g) ? g : g.matches;
  return `Looks for: ${m.join(', ')}${g.related?.length ? ` (and a little: ${g.related.join(', ')})` : ''}. `;
}

function chip(id, v, extra = '') {
  const c = crit(id);
  const cls = v === 1 ? 'like' : v === -1 ? 'dislike' : '';
  return `<button type="button" class="chip ${cls}${isKeyword(id) ? ' kw' : ''}" data-id="${esc(id)}" style="--c:${colorOf(id)}" aria-pressed="${v === 1 ? 'true' : v === -1 ? 'mixed' : 'false'}"
    title="${esc(covers(id))}${v === 1 ? 'Yes please (tap for no thanks)' : v === -1 ? 'No thanks (tap to remove)' : 'Tap if you like this'}">
    <span class="ic">${c.icon}</span><span class="tx">${esc(c.label)}</span>${extra}</button>`;
}

function renderAsk(changed = []) {
  const p = prefs();
  const ids = Object.keys(p);
  $('#wishes').innerHTML = ids.map((id) => chip(id, p[id], '<span class="x" aria-hidden="true">×</span>')).join('');
  $('#examples').hidden = ids.length > 0;
  // tabs and the open facet's chips
  $('#facet-tabs').innerHTML = FACETS.map((f) => {
    const n = ids.filter((id) => crit(id).facet === f.id).length;
    return `<button type="button" role="tab" data-tab="${f.id}" style="--c:var(--${f.color})" aria-selected="${f.id === state.tab}">${esc(f.label)}${n ? `<span class="n">${n}</span>` : ''}</button>`;
  }).join('');
  $('#facet-chips').innerHTML = CRITERIA.filter((c) => c.facet === state.tab).map((c) => chip(c.id, p[c.id])).join('');
  for (const id of changed) for (const el of document.querySelectorAll(`.chip[data-id="${id}"]`)) el.classList.add('pop');
  $('#go').disabled = !Object.values(p).some((v) => v > 0);
}

function onChip(e) {
  const el = e.target.closest('.chip');
  if (!el) return;
  const id = el.dataset.id;
  state.tapped[id] = cycle(prefs()[id]);
  renderAsk([id]);
}

function mirror(text, parsed) {
  let html = '', at = 0;
  for (const p of [...parsed].sort((a, b) => a.start - b.start)) {
    if (p.start < at) continue;
    html += esc(text.slice(at, p.start));
    html += `<mark class="${p.polarity > 0 ? 'like' : 'dislike'}" style="--c:${colorOf(p.id)}">${esc(text.slice(p.start, p.end))}</mark>`;
    at = p.end;
  }
  $('#say-mirror').innerHTML = html + esc(text.slice(at)) + '\n';
}

// Wishes from the sentence. Taps on a wish the sentence just changed give way
// to the new words.
function setSaid(said, groups = {}) {
  const changed = Object.keys(said).filter((id) => state.said[id] !== said[id]);
  for (const id of changed) delete state.tapped[id];
  state.said = said;
  // Keep what tapped keyword wishes look for; replace the rest.
  const kept = Object.fromEntries(Object.entries(state.groups).filter(([id]) => id in state.tapped));
  state.groups = { ...kept, ...groups };
  renderAsk(changed);
}

function status(html, cls = '') {
  const el = $('#heard-status');
  el.innerHTML = html;
  el.className = `heard-status ${cls}`;
}

// As the kid types, the on-device word list gives an instant first guess.
// Once they pause (or stop talking, or press Find), Claude reads the sentence
// and its tags replace the guess. Without Claude the guess stands.
function hear() {
  const ta = $('#say-input');
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight}px`;
  const parsed = parse(ta.value, KEYWORDS);
  mirror(ta.value, parsed);
  const said = {}, groups = {};
  for (const { id, polarity, keywords } of parsed) { said[id] = polarity; if (keywords) groups[id] = { matches: keywords }; }
  setSaid(said, groups);
  clearTimeout(state.askTimer);
  if (!ta.value.trim()) { state.asked = ''; status(''); return; }
  if (state.ai && !state.listening) state.askTimer = setTimeout(ask, 900);
  else if (!state.ai) status(state.ai === false ? 'Matched with the word list on this device (Claude isn’t set up on the server).' : '');
}

// Where each of Claude's wishes came from in the sentence, for highlighting.
function spans(text, wishes) {
  const lower = text.toLowerCase();
  const out = [];
  for (const w of wishes) {
    const i = w.words ? lower.indexOf(w.words.toLowerCase()) : -1;
    if (i >= 0) out.push({ id: w.id, polarity: w.polarity, start: i, end: i + w.words.length });
  }
  return out;
}

async function ask() {
  clearTimeout(state.askTimer);
  const text = $('#say-input').value.trim();
  if (!state.ai || !text) return;
  if (text === state.asked) return state.asking;
  state.asked = text;
  const seq = ++state.askSeq;
  status('<span class="dots"><i></i><i></i><i></i></span> Claude is reading that…', 'busy');
  document.body.classList.add('asking');
  state.asking = (async () => {
    try {
      const res = await fetch('./api/finder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? res.status);
      if (seq !== state.askSeq) return;
      const said = {}, groups = {};
      for (const w of out.wishes) said[w.id] = w.polarity;
      for (const k of out.keywords ?? []) { said[k.id] = k.polarity; groups[k.id] = { matches: k.matches, related: k.related ?? [] }; }
      setSaid(said, groups);
      mirror($('#say-input').value, spans($('#say-input').value, [...out.wishes, ...(out.keywords ?? [])]));
      const any = out.wishes.length + (out.keywords?.length ?? 0);
      const none = out.unmatched?.length ? ` Nothing here has ${out.unmatched.map((u) => `“${esc(u)}”`).join(', ')}.` : '';
      status(out.refused ? 'Claude couldn’t help with that one. Try saying it another way?'
        : any ? `<b>Claude understood.</b>${none}` : `Claude didn’t find anything to look for in that.${none}`, any ? 'ok' : '');
    } catch (err) {
      if (seq !== state.askSeq) return;
      state.asked = '';
      status('Couldn’t reach Claude, so the word list on this device guessed instead.', 'warn');
      console.warn('finder: Claude call failed', err);
    } finally {
      if (seq === state.askSeq) document.body.classList.remove('asking');
    }
  })();
  return state.asking;
}

// ---- talking ---------------------------------------------------------------------

// Browser speech recognition, as in the behavior composer: final words go in at
// the cursor like typing; when the kid stops talking, Claude reads it.
function setupMic() {
  const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  const btn = $('#mic');
  if (!SR) return;
  btn.hidden = false;
  const ta = $('#say-input');
  const rec = new SR();
  rec.lang = navigator.language || 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor in the box
  btn.addEventListener('click', () => (state.listening ? rec.stop() : rec.start()));
  rec.onstart = () => {
    state.listening = true;
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    btn.title = 'Stop listening';
    status('🎤 Listening… say what kind of world you feel like.', 'busy');
  };
  rec.onend = () => {
    state.listening = false;
    btn.classList.remove('on');
    btn.setAttribute('aria-pressed', 'false');
    btn.title = 'Say it out loud';
    if (state.ai && ta.value.trim()) ask(); else hear();
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') status('I need permission to use the microphone to hear you.', 'warn');
    else if (e.error !== 'no-speech' && e.error !== 'aborted') status(`Listening stopped: ${esc(e.error)}`, 'warn');
  };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r.isFinal) { interim += r[0].transcript; continue; }
      const words = r[0].transcript.trim();
      if (!words) continue;
      const at = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, at), after = ta.value.slice(ta.selectionEnd ?? at);
      const cap = !before.trim() || /[.!?]\s*$/.test(before);
      const ins = (before && !/\s$/.test(before) ? ' ' : '') + (cap ? words[0].toUpperCase() + words.slice(1) : words) + ' ';
      ta.value = before + ins + after;
      ta.selectionStart = ta.selectionEnd = before.length + ins.length;
      hear();
    }
    if (interim) status(`🎤 …${esc(interim.trim())}`, 'busy');
  };
  state.stopListening = () => state.listening && rec.stop();
}

function setupAsk() {
  const ta = $('#say-input');
  ta.addEventListener('input', hear);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
  $('#examples').innerHTML = `<span>Try</span>${EXAMPLES.map(([label, x], i) => `<button type="button" data-i="${i}" title="${esc(x)}">${esc(label)}</button>`).join('')}`;
  $('#examples').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    ta.value = EXAMPLES[+b.dataset.i][1];
    state.tapped = {};
    hear();
    ask();
    ta.focus();
  });
  $('#wishes').addEventListener('click', onChip);
  $('#facet-chips').addEventListener('click', onChip);
  $('#facet-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { state.tab = t.dataset.tab; renderAsk(); }
  });
  $('#browse-toggle').addEventListener('click', () => {
    const open = $('#browse-panel').hidden;
    $('#browse-panel').hidden = !open;
    $('#browse-toggle').setAttribute('aria-expanded', String(open));
    $('#browse-toggle').innerHTML = `${open ? 'Hide tags' : 'Browse all tags'} <span aria-hidden="true">${open ? '▴' : '▾'}</span>`;
  });
  $('#go').addEventListener('click', go);
}

function show(screen) {
  document.body.dataset.screen = screen;
  $('#ask').hidden = screen !== 'ask';
  $('#look').hidden = screen !== 'look';
  scrollTo(0, 0);
}

// ---- screen 2: look ----------------------------------------------------------------

function renderCrits() {
  const p = state.prefs;
  const ids = Object.keys(p).sort((a, b) => p[b] - p[a]);
  $('#bar-wishes').innerHTML = ids.map((id) => `<span class="w ${p[id] < 0 ? 'dislike' : ''}" style="--c:${colorOf(id)}" title="${esc(covers(id))}">${crit(id).icon} ${esc(crit(id).label)}</span>`).join('');
  $('#crits').innerHTML = ids.map((id) => `
    <div class="crit ${p[id] > 0 ? 'like' : 'dislike'}" data-id="${id}" style="--c:${colorOf(id)}">
      <span class="ci">${crit(id).icon}</span>
      <span class="cl"><span>${esc(crit(id).label)}</span><b></b></span>
      <span class="bar"><i></i></span>
    </div>`).join('');
}

function showEvidence(d, hitIds = []) {
  for (const row of document.querySelectorAll('#crits .crit')) {
    const id = row.dataset.id;
    const p = d ? d.p[id] ?? 0 : 0;
    row.querySelector('.bar i').style.width = pct(p);
    row.querySelector('b').textContent = d ? pct(p) : '';
    row.classList.toggle('strong', p >= 0.5);
    if (hitIds.includes(id)) { row.classList.remove('hit'); void row.offsetWidth; row.classList.add('hit'); }
  }
  const m = d ? d.match : 0;
  const fill = $('#meter-fill');
  fill.style.strokeDasharray = `${Math.max(0.001, m * 100)} 100`;
  fill.classList.toggle('over', !!d && m >= THRESHOLD && !d.vetoed.length);
}

function feed(kind, text, { hits = [], cls = '' } = {}) {
  const el = document.createElement('div');
  el.className = `line ${cls}${hits.length ? ' has-hit' : ''}`;
  el.innerHTML = `<span class="k">${esc(kind)}</span><span class="t">${esc(text)}</span><span class="h">${hits.map((h) =>
    `<span class="${state.prefs[h.crit] < 0 ? 'neg' : ''}" style="--c:${colorOf(h.crit)}" title="${esc(crit(h.crit).label)}">${crit(h.crit).icon} +${pct(h.w)}</span>`).join('')}</span>`;
  const box = $('#feed');
  box.append(el);
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Just the next three worlds, getting smaller as they get further away.
function renderQueue(next) {
  $('#queue').innerHTML = state.order.slice(next, next + 3).map((w) =>
    `<div class="q" style="background-image:${thumbUrl(w)}" title="${esc(w.title)}"></div>`).join('');
}

function tick(i, cls) {
  const t = $('#ticks').children[i];
  if (t) t.className = cls;
}

function progress() {
  const left = state.order.length - state.seen;
  $('#progress-text').innerHTML = `<b>${state.seen}</b> of ${state.order.length} worlds · <b>${state.found}</b> picked${state.running && left ? ` · ${left} to go` : ''}`;
}

function putInLens(w) {
  $('#lens').innerHTML = `<div class="thumb in" style="background-image:${thumbUrl(w)}"></div>`;
  $('#lens-title').textContent = w.title;
  $('#lens-by').textContent = `by ${w.by.name}, ${w.by.age} · ${w.by.city} ${w.by.flag}`;
  $('#verdict').className = 'verdict';
}

function stampVerdict(pick, text) {
  const v = $('#verdict');
  v.textContent = text;
  v.className = `verdict ${pick ? 'pick' : 'pass'}`;
  void v.offsetWidth;
  v.classList.add('show');
}

function addCard(w, d) {
  $('.cards-empty')?.remove();
  const [best, ...rest] = d.reasons;
  const all = d.reasons.map((r) => `${crit(r.id).label} ${pct(r.p)}`).join(', ');
  const card = document.createElement('article');
  card.className = 'card';
  card.tabIndex = 0;
  card.title = `By ${w.by.name}, ${w.by.age}, from ${w.by.city}, ${w.by.country}. Matched on ${all}.`;
  card.innerHTML = `
    <div class="stamp"><div class="thumb ghost-thumb" style="background-image:${thumbUrl(w)}"></div></div>
    <div class="card-body">
      <h3>${esc(w.title)}</h3>
      <p class="sum">${esc(w.summary)}</p>
      <div class="why">
        <span class="badge"><span class="pct">${pct(d.match)}</span><span class="bt">${crit(best.id).icon} ${esc(crit(best.id).label)}${rest.length ? ` +${rest.length}` : ''}</span></span>
        <span class="flag" aria-label="${esc(w.by.country)}">${w.by.flag}</span>
      </div>
    </div>`;
  $('#cards').prepend(card);
  const n = $('#n-found');
  n.textContent = state.found;
  n.classList.add('has');
  n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump');
  return card;
}

async function flyToCard(w, card) {
  const target = card.querySelector('.thumb');
  const from = $('#lens').getBoundingClientRect();
  if (reduced) { target.classList.remove('ghost-thumb'); return; }
  await new Promise(requestAnimationFrame);
  const to = target.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'flyer thumb';
  Object.assign(fly.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, backgroundImage: thumbUrl(w) });
  document.body.append(fly);
  $('#lens .thumb')?.classList.add('out-pick');
  const dx = to.left - from.left, dy = to.top - from.top, s = to.width / from.width;
  const anim = fly.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 60}px) scale(${(1 + s) / 2}) rotate(8deg)`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)` },
  ], { duration: ms(800) + 200, easing: 'cubic-bezier(.5, 0, .3, 1)' });
  anim.onfinish = () => { target.classList.remove('ghost-thumb'); fly.remove(); };
  anim.oncancel = anim.onfinish;
}

// A world's keywords, the ones a wish looks for first.
function keywordLine(keywords, hits) {
  const wanted = new Set();
  for (const h of hits) {
    const g = state.lookGroups[h.crit];
    if (g) for (const k of [...(g.matches ?? g), ...(g.related ?? [])]) wanted.add(k);
  }
  return [...keywords.filter((k) => wanted.has(k)), ...keywords.filter((k) => !wanted.has(k))].join(', ');
}

async function scan(w, i, run) {
  tick(i, 'now');
  $('#queue .q')?.classList.add('leaving');
  putInLens(w);
  showEvidence(null);
  $('#feed').innerHTML = ''; // clues are about the world in the lens
  await sleep(ms(450), run);
  renderQueue(i + 1);

  const { facts } = read(w);
  for (let k = 0; k < facts.length; k++) {
    const f = facts[k];
    const hits = hitsFor(f, state.prefs, state.lookGroups).filter((h) => h.w >= 0.05);
    feed(f.kind, f.keywords ? keywordLine(f.keywords, hits) : f.text, { hits });
    showEvidence(decide(facts, state.prefs, k + 1, state.lookGroups), hits.map((h) => h.crit));
    await sleep(ms(hits.length ? 240 : 90), run);
  }
  const d = decide(facts, state.prefs, undefined, state.lookGroups);
  state.seen++;

  if (d.pick) {
    state.found++;
    tick(i, 'pick');
    progress();
    stampVerdict(true, 'MATCH!');
    feed('picked', `${w.title}: ${pct(d.match)} match`, { cls: 'result keep' });
    await sleep(ms(650), run);
    await flyToCard(w, addCard(w, d));
    await sleep(ms(700), run);
  } else {
    tick(i, 'pass');
    progress();
    const vetoed = d.vetoed[0] && crit(d.vetoed[0]);
    stampVerdict(false, vetoed ? `no ${vetoed.icon}` : 'not this one');
    feed('passed', vetoed ? `has ${vetoed.label.toLowerCase()}` : `${pct(d.match)} match, needs ${pct(THRESHOLD)}`, { cls: 'result' });
    await sleep(ms(420), run);
    $('#lens .thumb')?.classList.add('out-pass');
    await sleep(ms(340), run);
  }
}

function setRunning(on) {
  state.running = on;
  document.body.classList.toggle('running', on);
  $('#stop').textContent = on ? 'Stop' : 'Look again';
  progress();
}

async function start() {
  const run = ++state.run;
  state.seen = state.found = 0;
  state.order = shuffle(WORLDS);
  $('#ticks').innerHTML = state.order.map(() => '<i></i>').join('');
  $('#feed').innerHTML = '';
  $('#cards').innerHTML = '<div class="cards-empty">Worlds that match land here.<br />Hover one to see it wiggle.</div>';
  $('#n-found').textContent = '0';
  $('#n-found').classList.remove('has');
  renderCrits();
  renderQueue(0);
  setRunning(true);
  try {
    for (const [i, w] of state.order.entries()) await scan(w, i, run);
    finish();
  } catch (e) {
    if (e.message !== 'stopped') throw e;
  }
}

function finish() {
  setRunning(false);
  $('#queue').innerHTML = '';
  $('#lens').innerHTML = `<div class="lens-empty">${state.found ? '✨' : '🔭'}</div>`;
  $('#verdict').className = 'verdict';
  showEvidence(null);
  $('#feed').innerHTML = '';
  $('#lens-title').textContent = state.found ? `Found ${state.found} for you!` : 'No matches this time';
  $('#lens-by').textContent = state.found ? 'Hover one to see it wiggle.' : 'Try fewer wishes, or different ones.';
  if (!state.found) $('.cards-empty').textContent = 'Nothing matched all of that. Try fewer wishes!';
}

function stop() {
  state.run++;
  setRunning(false);
  $('#lens .thumb')?.classList.remove('in');
}

// Find: let Claude finish reading the sentence first, then go look.
async function go() {
  state.stopListening?.();
  const btn = $('#go');
  if (state.ai && $('#say-input').value.trim()) {
    btn.disabled = true;
    btn.classList.add('waiting');
    await ask();
    btn.classList.remove('waiting');
    renderAsk();
  }
  if (!$('#go').disabled) look();
}

function look() {
  state.prefs = prefs();
  state.lookGroups = { ...state.groups };
  show('look');
  start();
}

function setupLook() {
  $('#edit').addEventListener('click', () => { stop(); show('ask'); $('#say-input').focus(); });
  $('#stop').addEventListener('click', () => (state.running ? stop() : start()));
  $('#clues-toggle').addEventListener('click', (e) => {
    const all = $('#feed').classList.toggle('all');
    e.target.setAttribute('aria-pressed', String(all));
    e.target.textContent = all ? 'Show just the clues' : 'Show everything it reads';
    $('#clues-label').textContent = all ? 'Everything it reads' : 'Clues';
  });
  for (const b of document.querySelectorAll('.speed button')) {
    b.addEventListener('click', () => {
      state.speed = +b.dataset.speed;
      for (const o of document.querySelectorAll('.speed button')) o.setAttribute('aria-checked', String(o === b));
    });
  }
  $('#meter-tick').innerHTML = '<line x1="188" y1="100" x2="199" y2="100" />';
  $('#meter-tick').setAttribute('transform', `rotate(${THRESHOLD * 360} 100 100)`);
}

// ---- boot ----------------------------------------------------------------------------

setupAsk();
setupMic();
setupLook();
renderAsk();
fetch('./api/finder').then((r) => r.json()).then((r) => { state.ai = !!r.available; }).catch(() => { state.ai = false; });
// for tests
Object.assign(window, { __finder: { state, start, stop, look, ask, prefs, WORLDS } });

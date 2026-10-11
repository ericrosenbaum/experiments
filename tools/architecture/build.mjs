// Regenerates the parts of docs/architecture.html that come straight from the
// source: the full Claude prompts, schemas, the primitives list, and the worked
// examples. Each lives between <!-- gen:NAME --> and <!-- /gen:NAME --> markers;
// everything else in the page is hand-written.
//
//   node tools/architecture/build.mjs              # re-render from source + saved examples
//   node --env-file=.env.local tools/architecture/build.mjs --examples
//                                                  # also re-run the examples against Claude
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as behavior from '../../src/behavior/prompt.js';
import * as chat from '../../src/chat/prompt.js';
import { PRIMITIVES } from '../../src/behavior/primitives.js';
import { compileLocal } from '../../src/behavior/compiler.js';
import { LIBRARY_BY_ID } from '../../src/world/library.js';
import { SYM } from '../../src/chat/symbols.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE = path.join(root, 'docs/architecture.html');
const EXAMPLES = path.join(root, 'tools/architecture/examples.json');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pre = (s, cls = '') => `<pre class="code ${cls}"><code>${esc(s)}</code></pre>`;
const chips = (t) => esc(t)
  .replace(/\{part:([^}]*)\}/g, '<span class="chip part">$1</span>')
  .replace(/\{thing:[^|}]*\|?([^}]*)\}/g, '<span class="chip thing">$1</span>')
  .replace(/\{place:([^}]*)\}/g, '<span class="chip place">$1</span>');

// ---- example inputs -----------------------------------------------------------
const THINGS = [
  { id: 'tree-3', name: 'Tree 3', kind: 'tree', color: 'green', distance: 9 },
  { id: 'house-1', name: 'Red House', kind: 'house', color: 'red', distance: 14 },
  { id: 'tower', name: 'Rainbow Tower', kind: 'tower', color: 'yellow', distance: 18 },
  { id: 'ball', name: 'Ball', kind: 'ball', color: 'orange', distance: 6 },
];
const WORLD = { kind: 'world', name: 'World', motion: 'none', parts: [], blurb: 'The World itself (the baseplate everything stands on). World rules can change gravity, drop bricks, copy things and react to keys. The World itself never moves.' };
const BEHAVIOR_CASES = [
  { text: 'when I press space, wave {part:left arm} and say hi, then go to {thing:tree-3|Tree 3}', model: { ...LIBRARY_BY_ID.robot, kind: 'model', name: 'Robot' }, things: THINGS, otherBehaviors: ['While ↑ is held: drive forward'] },
  { text: 'forever, if you see something red in front of you, honk and back up', model: { ...LIBRARY_BY_ID.racecar, kind: 'model', name: 'Race Car' }, things: THINGS },
  { text: 'when I click the ground, make everything float for 5 seconds and then drop a bunch of rainbow bricks', model: WORLD, things: THINGS },
];
const CHAT_CASES = ['can we build a rocket together? 🚀', 'wait for me, my car broke lol', 'tu castillo es muy grande, ¡qué guay!'];

async function runExamples() {
  const { generate } = await import('../../server/generate.js');
  const { translate } = await import('../../server/bricktalk.js');
  const out = { date: new Date().toISOString().slice(0, 10), behavior: [], chat: [] };
  for (const c of BEHAVIOR_CASES) {
    const r = await generate(c);
    if (r.status !== 200) throw new Error(`generate failed (${r.status}): ${r.body.error}`);
    out.behavior.push({ text: c.text, target: c.model.name, claude: r.body });
  }
  for (const text of CHAT_CASES) out.chat.push({ text, result: (await translate({ text })).body });
  fs.writeFileSync(EXAMPLES, JSON.stringify(out, null, 2) + '\n');
  return out;
}

// ---- renderers ----------------------------------------------------------------
const symImg = (id) => {
  const f = path.join(root, 'public/bricktalk', `${id}.webp`);
  const src = fs.existsSync(f) ? `data:image/webp;base64,${fs.readFileSync(f).toString('base64')}` : '';
  return `<span class="sym"><img src="${src}" width="44" height="44" alt="${esc(SYM[id]?.gloss ?? id)}"><span>${esc(id)}</span></span>`;
};

function behaviorExamples(ex) {
  return ex.behavior.map((e, i) => {
    const c = BEHAVIOR_CASES.find((k) => k.text === e.text) ?? BEHAVIOR_CASES[i];
    const off = compileLocal(c.text, c.model);
    return `<article class="example">
  <header class="ex-head"><span class="ex-target">${esc(e.target)}</span><p class="kid">“${chips(e.text)}”</p></header>
  <div class="ex-cols">
    <section class="ex-col claude"><h4>Claude <span class="tag">${esc(e.claude.model ?? '')}</span></h4>
      <ul class="readback">${e.claude.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${pre(e.claude.code)}
      ${e.claude.notes ? `<p class="notes"><b>Notes:</b> ${esc(e.claude.notes)}</p>` : '<p class="notes muted">No notes.</p>'}
    </section>
    <section class="ex-col offline"><h4>Offline compiler</h4>
      <ul class="readback">${off.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${pre(off.code)}
      ${off.unknown?.length ? `<p class="notes"><b>Didn’t understand:</b> ${off.unknown.map(esc).join('; ')}</p>` : '<p class="notes muted">Understood everything.</p>'}
    </section>
  </div>
  <details><summary>The user message Claude received</summary>${pre(behavior.buildUserMessage(c))}</details>
</article>`;
  }).join('\n');
}

function chatExamples(ex) {
  return ex.chat.map((e) => {
    const r = e.result;
    const rows = (r.phrases ?? []).map((p) => `<div class="phrase">${p.map(symImg).join('')}</div>`).join('');
    return `<article class="chat-ex">
  <p class="kid">“${esc(e.text)}”</p>
  <div class="phrases">${rows || '<span class="muted">nothing sent</span>'}</div>
  <dl class="chat-meta">
    <dt>Dropped</dt><dd>${r.dropped?.length ? r.dropped.map(esc).join(', ') : '—'}</dd>
    <dt>Blocked by validator</dt><dd>${r.blocked?.length ? r.blocked.map(esc).join(' ') : '—'}</dd>
  </dl>
</article>`;
  }).join('\n');
}

function primitivesTable() {
  const groups = { event: 'Events', action: 'Actions', wait: 'Take time (await)', sense: 'Sensing (await)', util: 'Helpers' };
  return Object.entries(groups).map(([k, title]) => `<div class="prim-group"><h4>${title}</h4><ul>${PRIMITIVES.filter((p) => p[2] === k)
    .map(([sig]) => `<li><code>${esc(sig.replace(/^await /, ''))}</code></li>`).join('')}</ul></div>`).join('');
}

// ---- splice into the page -------------------------------------------------------
const ex = process.argv.includes('--examples') ? await runExamples() : JSON.parse(fs.readFileSync(EXAMPLES, 'utf8'));
const blocks = {
  'behavior-system': pre(behavior.SYSTEM_PROMPT, 'prompt'),
  'behavior-user': pre(behavior.buildUserMessage(BEHAVIOR_CASES[0]), 'prompt'),
  'behavior-schema': pre(JSON.stringify(behavior.RESPONSE_SCHEMA, null, 2)),
  'chat-system': pre(chat.SYSTEM_PROMPT, 'prompt'),
  'chat-user': pre(chat.buildUserMessage({ text: CHAT_CASES[0] }), 'prompt'),
  'chat-schema': pre(JSON.stringify({ ...chat.RESPONSE_SCHEMA, properties: { ...chat.RESPONSE_SCHEMA.properties, phrases: { ...chat.RESPONSE_SCHEMA.properties.phrases, items: { type: 'array', items: { type: 'string', enum: [`…${chat.RESPONSE_SCHEMA.properties.phrases.items.items.enum.length} symbol ids…`] } } } } }, null, 2)),
  'behavior-examples': behaviorExamples(ex),
  'chat-examples': chatExamples(ex),
  'examples-date': esc(ex.date),
  primitives: primitivesTable(),
  'prim-count': String(PRIMITIVES.length),
};
let html = fs.readFileSync(PAGE, 'utf8');
for (const [name, body] of Object.entries(blocks)) {
  const re = new RegExp(`(<!-- gen:${name} -->)[\\s\\S]*?(<!-- /gen:${name} -->)`, 'g');
  if (!re.test(html)) throw new Error(`marker gen:${name} not found in ${PAGE}`);
  html = html.replace(re, (_, a, b) => `${a}${body}${b}`);
}
fs.writeFileSync(PAGE, html);
console.log(`architecture: wrote ${path.relative(root, PAGE)} (examples from ${ex.date})`);

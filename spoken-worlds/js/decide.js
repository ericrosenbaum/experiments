// The decision model: (utterance, fixed list of choices) -> one choice id or null.
// Three interchangeable backends, all on-device:
//   lexical    — word overlap + a small synonym table. No download, instant.
//   embeddings — sentence embeddings (MiniLM) via transformers.js, cosine similarity.
//   llm        — the browser's built-in language model (Chrome Prompt API) with a
//                JSON-schema-constrained answer. Used alone, or as a tie-breaker.
//
// choices: [{ id, phrases: [string] }]
// returns: { choice: id|null, confidence, scores: [{ id, score }], backend }

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

const STOP = new Set('a an the to of in on at into onto my me i i\'ll ill im i\'m um uh like please can could would will want wanna just let lets let\'s so and then it this that there here you your some up do try maybe okay ok well now'.split(' '));
const SYN = {
  look: ['look', 'examine', 'inspect', 'check', 'search', 'see', 'view', 'explore', 'peek', 'around'],
  go: ['go', 'walk', 'head', 'move', 'run', 'enter', 'step', 'travel'],
  open: ['open', 'unlock', 'unseal'],
  take: ['take', 'grab', 'get', 'pick', 'collect', 'carry'],
  leave: ['leave', 'exit', 'out', 'outside', 'escape', 'depart'],
  push: ['push', 'press', 'hit', 'tap'],
  pull: ['pull', 'yank', 'tug'],
  back: ['back', 'return', 'previous'],
  inventory: ['inventory', 'have', 'carrying', 'items', 'pockets', 'holding', 'stuff'],
  help: ['help', 'options', 'hint', 'stuck'],
  repeat: ['repeat', 'again', 'describe'],
};
const CANON = {};
for (const [k, ws] of Object.entries(SYN)) for (const w of ws) CANON[w] = k;

const stem = (w) => w.replace(/(ing|ed|es|s)$/, '') || w;
function tokens(s) {
  return String(s).toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => CANON[w] || CANON[stem(w)] || stem(w));
}

function rank(scores) {
  return scores.sort((a, b) => b.score - a.score);
}

function pick(scores, threshold, margin, backend) {
  rank(scores);
  const [top, second] = scores;
  const ok = top && top.score >= threshold && (!second || top.score - second.score >= margin);
  return { choice: ok ? top.id : null, confidence: top ? top.score : 0, scores, backend, ambiguous: !!(top && top.score >= threshold && !ok) };
}

export const lexical = {
  name: 'lexical',
  async ready() { return true; },
  async decide(text, choices) {
    // Weighted word overlap: a word that appears in many choices ("go", "look")
    // counts for less than one that singles a choice out ("kitchen", "frog").
    const toks = choices.map((c) => c.phrases.map((p) => new Set(tokens(p))));
    const df = new Map();
    for (const sets of toks) for (const w of new Set(sets.flatMap((t) => [...t]))) df.set(w, (df.get(w) || 0) + 1);
    const weight = (w) => Math.log(1 + choices.length / (df.get(w) || 1)); // unseen words count fully against a match
    const u = new Set(tokens(text));
    const uw = [...u].reduce((a, w) => a + weight(w), 0);
    const raw = String(text).toLowerCase().trim();
    const scores = choices.map((c, ci) => {
      let best = 0;
      c.phrases.forEach((p, pi) => {
        if (raw === p.toLowerCase()) { best = 1; return; }
        const t = toks[ci][pi];
        if (!t.size || !uw) return;
        let inter = 0;
        let tw = 0;
        for (const w of t) { tw += weight(w); if (u.has(w)) inter += weight(w); }
        best = Math.max(best, inter / Math.sqrt(tw * uw));
      });
      return { id: c.id, score: best };
    });
    return pick(scores, 0.4, 0.05, 'lexical');
  },
};

// ---- embeddings ----------------------------------------------------------
let extractorPromise = null;
const vecCache = new Map();
export const embeddings = {
  name: 'embeddings',
  status: 'not loaded',
  async ready(onProgress) {
    if (!extractorPromise) {
      this.status = 'loading';
      extractorPromise = import(TRANSFORMERS_URL).then(async ({ pipeline }) => {
        const ex = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8', progress_callback: onProgress });
        this.status = 'ready';
        return ex;
      }).catch((e) => { this.status = 'failed: ' + e.message; extractorPromise = null; throw e; });
    }
    return extractorPromise;
  },
  async embed(texts) {
    const ex = await this.ready();
    const missing = texts.filter((t) => !vecCache.has(t));
    if (missing.length) {
      const out = await ex(missing, { pooling: 'mean', normalize: true });
      const list = out.tolist();
      missing.forEach((t, i) => vecCache.set(t, list[i]));
    }
    return texts.map((t) => vecCache.get(t));
  },
  async decide(text, choices) {
    const all = choices.flatMap((c) => c.phrases);
    const [u, ...vs] = await this.embed([text, ...all]);
    let k = 0;
    const scores = choices.map((c) => {
      let best = -1;
      for (let i = 0; i < c.phrases.length; i++, k++) {
        let dot = 0;
        const v = vs[k];
        for (let j = 0; j < v.length; j++) dot += u[j] * v[j];
        best = Math.max(best, dot);
      }
      return { id: c.id, score: best };
    });
    return pick(scores, 0.45, 0.03, 'embeddings');
  },
};

// ---- built-in LLM (Chrome Prompt API) -------------------------------------
let llmSession = null;
export const llm = {
  name: 'llm',
  status: 'not loaded',
  async available() {
    if (!('LanguageModel' in self)) return 'unavailable';
    try { return await self.LanguageModel.availability(); } catch { return 'unavailable'; }
  },
  async ready(onProgress) {
    if (llmSession) return llmSession;
    if ((await this.available()) === 'unavailable') { this.status = 'unavailable in this browser'; throw new Error(this.status); }
    this.status = 'loading';
    llmSession = await self.LanguageModel.create({
      initialPrompts: [{ role: 'system', content: 'You map what a player said in a text adventure to exactly one of the listed choices, or "none" if nothing fits. Choose by meaning and intent, not exact words.' }],
      monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress?.({ status: 'progress', progress: e.loaded * 100 })); },
    });
    this.status = 'ready';
    return llmSession;
  },
  async decide(text, choices) {
    const s = await this.ready();
    const ids = choices.map((c) => c.id);
    const list = choices.map((c) => `- ${c.id}: ${c.phrases.join(' / ')}`).join('\n');
    const schema = { type: 'object', properties: { choice: { type: 'string', enum: [...ids, 'none'] } }, required: ['choice'] };
    const out = await (await s.clone()).prompt(`Choices:\n${list}\n\nPlayer said: "${text}"\n\nAnswer with JSON.`, { responseConstraint: schema });
    let choice = null;
    try { choice = JSON.parse(out).choice; } catch {}
    if (!ids.includes(choice)) choice = null;
    return { choice, confidence: choice ? 1 : 0, scores: ids.map((id) => ({ id, score: id === choice ? 1 : 0 })), backend: 'llm' };
  },
};

export const BACKENDS = { lexical, embeddings, llm };

// Main entry. `hybrid`: if the primary result is ambiguous or empty and the LLM
// is available, let it break the tie among the top three.
export async function decide(text, choices, { backend = 'lexical', hybrid = false } = {}) {
  const b = BACKENDS[backend] || lexical;
  let res;
  try { res = await b.decide(text, choices); }
  catch (e) { res = await lexical.decide(text, choices); res.note = `${backend} failed (${e.message}); used lexical`; }
  if (hybrid && backend !== 'llm' && (res.choice == null || res.ambiguous) && llmSession) {
    const top = res.scores.slice(0, 3).map((s) => choices.find((c) => c.id === s.id));
    const r2 = await llm.decide(text, top).catch(() => null);
    if (r2?.choice) return { ...res, choice: r2.choice, backend: res.backend + '+llm' };
  }
  return res;
}

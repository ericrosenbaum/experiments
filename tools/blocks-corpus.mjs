// Every premade behavior program in the app (worlds, library models, machines),
// plus what the offline compiler writes for the example sentences: the corpus
// the blocks tests round-trip.
import { WORLDS } from '../src/world/worlds.js';
import { LIBRARY } from '../src/world/library.js';
import { compileLocal } from '../src/behavior/compiler.js';

export function corpus() {
  const out = [];
  const add = (where, b) => { if (b?.code) out.push({ where, text: b.text ?? b.title ?? '', code: b.code }); };
  for (const w of WORLDS) for (const [k, list] of Object.entries(w.behaviors ?? {})) for (const b of list) add(`${w.id}/${k}`, b);
  for (const d of LIBRARY) for (const b of d.behaviors ?? []) add(`library/${d.id}`, b);
  const seen = new Set(out.map((c) => c.code));
  for (const d of LIBRARY) for (const ex of d.examples ?? []) {
    const text = typeof ex === 'string' ? ex : ex.text;
    if (!text) continue;
    try {
      const r = compileLocal(text, d);
      if (r?.code && !seen.has(r.code)) { seen.add(r.code); out.push({ where: `compiler/${d.id}`, text, code: r.code }); }
    } catch { /* not every example compiles offline */ }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = corpus();
  for (const p of c) console.log(`//// ${p.where}: ${p.text}\n${p.code}\n`);
  console.error(`${c.length} programs`);
}

// Turn a description into a program: Claude (via the dev server) when it's
// available, otherwise the offline compiler. Either way the result is
// syntax-checked here (compiled, never run) before it goes to a sandbox.
import { compileLocal } from './compiler.js';
import { PRIMITIVES } from './primitives.js';

const API_NAMES = [...new Set(PRIMITIVES.map(([sig]) => sig.replace(/^await /, '').match(/^(\w+)/)[1]))];
const AsyncFunction = (async () => {}).constructor;

let claudeAvailable = null;
export async function probeClaude() {
  if (claudeAvailable !== null) return claudeAvailable;
  try {
    const r = await fetch('./api/generate', { method: 'GET' });
    claudeAvailable = r.ok && (await r.json()).available === true;
  } catch { claudeAvailable = false; }
  return claudeAvailable;
}

// The offline compiler can't merge a change into an existing program, so it
// always makes a new behavior and says so.
const offlineNote = (named, text) => named.length && /\b(change|modify|edit|update|fix|tweak|adjust|instead)\b/i.test(text)
  ? ` The offline helper can't change “${named[0].title}”, so this is a new behavior.` : '';

export function syntaxError(code) {
  try { new AsyncFunction(...API_NAMES, code); return null; } catch (err) { return err.message; }
}

// Behaviors the kid mentions by name ("make Move with Arrows faster"). The
// match is on the whole title, ignoring case and punctuation; whether the kid
// actually wants that behavior changed is up to Claude (see "modifies").
const words = (s) => ` ${s.replace(/\{[^}]*\}/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
export function findNamedBehaviors(text, behaviors) {
  const said = words(text);
  return behaviors.filter((b) => b.title && words(b.title).trim() && said.includes(words(b.title)));
}

export async function generateBehavior({ text, model, things, otherBehaviors, named = [], messages = [], preferOffline = false }) {
  if (!preferOffline && (await probeClaude())) {
    try {
      const r = await fetch('./api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model, things, otherBehaviors, named, messages }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error ?? `HTTP ${r.status}`);
      const err = syntaxError(out.code);
      if (err) throw new Error(`generated code didn't parse: ${err}`);
      const modifies = named.some((b) => b.title === out.modifies) ? out.modifies : '';
      return { code: out.code, keys: out.keys, title: out.title, summary: out.summary, notes: out.notes, modifies, unknown: [], source: 'claude' };
    } catch (err) {
      const local = compileLocal(text, model);
      return { ...local, modifies: '', notes: `Claude wasn't reachable (${err.message}), so the offline helper wrote this.${offlineNote(named, text)}` };
    }
  }
  const local = compileLocal(text, model);
  return { ...local, modifies: '', notes: [local.notes, offlineNote(named, text).trim()].filter(Boolean).join(' ') };
}

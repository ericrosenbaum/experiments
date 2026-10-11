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

export function syntaxError(code) {
  try { new AsyncFunction(...API_NAMES, code); return null; } catch (err) { return err.message; }
}

export async function generateBehavior({ text, model, things, otherBehaviors, preferOffline = false }) {
  if (!preferOffline && (await probeClaude())) {
    try {
      const r = await fetch('./api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model, things, otherBehaviors }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error ?? `HTTP ${r.status}`);
      const err = syntaxError(out.code);
      if (err) throw new Error(`generated code didn't parse: ${err}`);
      return { code: out.code, title: out.title, summary: out.summary, notes: out.notes, unknown: [], source: 'claude' };
    } catch (err) {
      const local = compileLocal(text, model);
      return { ...local, notes: `Claude wasn't reachable (${err.message}), so the offline helper wrote this.` };
    }
  }
  return compileLocal(text, model);
}

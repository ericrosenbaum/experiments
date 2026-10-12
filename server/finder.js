// POST /api/finder — turns what a kid said they feel like playing into
// World Finder wishes with Claude: tags marked yes or no, plus keyword wishes
// ("geology" → lava, volcano, magma) matched to the worlds' keywords. The page falls back
// to its on-device word list when there's no key or the call fails; the
// matching itself always runs on the page.
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import { systemPrompt, responseSchema, buildUserMessage, keywordsOf } from '../src/finder/prompt.js';
import { CRITERIA_BY_ID } from '../src/finder/model.js';

export const MODEL = 'claude-opus-5-5';

// The worlds' keywords, read from the manifest (and again if it changes).
const MANIFEST = new URL('../public/finder/worlds.json', import.meta.url);
let vocab = { mtime: 0 };
function vocabulary() {
  const mtime = fs.statSync(MANIFEST).mtimeMs;
  if (mtime !== vocab.mtime) {
    const keywords = keywordsOf(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')));
    vocab = { mtime, keywords, set: new Set(keywords), system: systemPrompt(keywords), schema: responseSchema(keywords) };
  }
  return vocab;
}

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  client ??= new Anthropic();
  return client;
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error('request too large');
  }
  return JSON.parse(body);
}

export async function understand({ text }) {
  const c = getClient();
  if (!c) return { status: 503, body: { error: 'The finder needs ANTHROPIC_API_KEY on the dev server.' } };
  text = String(text ?? '').slice(0, 1000).trim();
  if (!text) return { status: 200, body: { wishes: [], keywords: [], unmatched: [] } };
  const v = vocabulary();
  const response = await c.beta.messages.create({
    model: MODEL,
    max_tokens: 4096,
    // A short classification: low effort keeps it quick. If a safety
    // classifier declines, the API retries on a fallback model in the same call.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: v.schema } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: v.system,
    messages: [{ role: 'user', content: buildUserMessage(text) }],
  });
  if (response.stop_reason === 'refusal') return { status: 200, body: { wishes: [], keywords: [], unmatched: [], refused: true } };
  if (response.stop_reason === 'max_tokens') return { status: 502, body: { error: 'response was cut off' } };
  const out = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  // Keep real tags, the last word on each, at most 8.
  const seen = new Map();
  for (const w of out.wishes ?? []) if (CRITERIA_BY_ID[w.id]) { seen.delete(w.id); seen.set(w.id, w); }
  const wishes = [...seen.values()].slice(-8).map((w) => ({ id: w.id, polarity: w.want === 'no' ? -1 : 1, words: String(w.words ?? '') }));
  // Keyword wishes: id from the kid's words, real keywords only, at most 6.
  const kw = new Map();
  for (const k of out.keywords ?? []) {
    const words = String(k.words ?? '').trim();
    const matches = [...new Set(k.matches ?? [])].filter((m) => v.set.has(m));
    const related = [...new Set(k.related ?? [])].filter((m) => v.set.has(m) && !matches.includes(m));
    if (!words || !matches.length) continue;
    const id = `kw:${words.toLowerCase()}`;
    kw.delete(id);
    kw.set(id, { id, polarity: k.want === 'no' ? -1 : 1, words, matches, related });
  }
  const keywords = [...kw.values()].slice(-6);
  return { status: 200, body: { wishes, keywords, unmatched: (out.unmatched ?? []).slice(0, 5), model: response.model } };
}

export function finderMiddleware() {
  return async (req, res, next) => {
    if (req.url !== '/api/finder') return next();
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') { res.end(JSON.stringify({ available: !!getClient(), model: MODEL, keywords: vocabulary().keywords.length })); return; }
    if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
    try {
      const { status, body } = await understand(await readJson(req));
      res.statusCode = status;
      res.end(JSON.stringify(body));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    }
  };
}

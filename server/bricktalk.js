// POST /api/bricktalk — turns a chat message into Brick Talk symbol ids with
// Claude. There is no offline fallback: without ANTHROPIC_API_KEY the chat
// can't send. The page still validates every phrase before showing or sending it.
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, RESPONSE_SCHEMA, buildUserMessage } from '../src/chat/prompt.js';
import { validate } from '../src/chat/symbols.js';

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

export async function translate(input) {
  const c = getClient();
  if (!c) return { status: 503, body: { error: 'Brick Talk needs ANTHROPIC_API_KEY on the dev server.' } };
  const response = await c.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });
  if (response.stop_reason === 'refusal') return { status: 200, body: { phrases: [], dropped: [], refused: true } };
  if (response.stop_reason === 'max_tokens') return { status: 502, body: { error: 'response was cut off' } };
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const out = JSON.parse(text);
  // Keep the phrases that pass; report the ones that don't.
  const phrases = [], blocked = [];
  for (const p of (out.phrases ?? []).slice(0, 3)) {
    const v = validate(p);
    if (v.ok) phrases.push(p); else blocked.push(...v.why);
  }
  return { status: 200, body: { phrases, dropped: out.dropped ?? [], blocked: [...new Set(blocked)] } };
}

export function bricktalkMiddleware() {
  return async (req, res, next) => {
    if (req.url !== '/api/bricktalk') return next();
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') { res.end(JSON.stringify({ available: !!getClient() })); return; }
    if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
    try {
      const { status, body } = await translate(await readJson(req));
      res.statusCode = status;
      res.end(JSON.stringify(body));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    }
  };
}

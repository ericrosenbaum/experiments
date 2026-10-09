// POST /api/generate — turns a kid's description into behavior code with
// Claude. Runs inside the Vite dev/preview server so ANTHROPIC_API_KEY stays
// server-side. Without a key it answers 503 and the page falls back to the
// offline compiler.
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, RESPONSE_SCHEMA, buildUserMessage } from '../src/behavior/prompt.js';

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
    if (body.length > 100_000) throw new Error('request too large');
  }
  return JSON.parse(body);
}

export async function generate(input) {
  const c = getClient();
  if (!c) return { status: 503, body: { error: 'no ANTHROPIC_API_KEY on the server' } };
  const response = await c.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });
  if (response.stop_reason === 'refusal') return { status: 422, body: { error: 'Claude declined this request.' } };
  if (response.stop_reason === 'max_tokens') return { status: 502, body: { error: 'response was cut off' } };
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const out = JSON.parse(text);
  return { status: 200, body: { ...out, source: 'claude', model: response.model } };
}

export function generateMiddleware() {
  return async (req, res, next) => {
    if (req.url !== '/api/generate') return next();
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') { // capability probe
      res.end(JSON.stringify({ available: !!getClient() }));
      return;
    }
    if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
    try {
      const { status, body } = await generate(await readJson(req));
      res.statusCode = status;
      res.end(JSON.stringify(body));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    }
  };
}

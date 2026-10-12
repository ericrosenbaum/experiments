// POST /api/see — a thing's eyes. The page sends a snapshot of what's straight
// in front of it and a few labels to choose from; Claude says which one the
// picture shows, or "none". Runs in the Vite server so the API key stays
// server-side; without a key it answers 503 and see() returns "none".
import Anthropic from '@anthropic-ai/sdk';

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  client ??= new Anthropic();
  return client;
}

const SYSTEM = `You are the eyes of a toy in a 3D world built from plastic toy bricks (like LEGO). You get a picture taken from the toy's eyes, looking straight ahead.

Pick the label that best describes the main thing the toy is looking at: something close and roughly in the middle of the picture, not far away in the background. Things in this world are made of bricks, minifigures and simple shapes, so judge them the way a child would: a green-headed minifigure with antennae is an alien, a minifigure in overalls is a person, a field of orange bricks with green tops is carrots, a big lizard with teeth is scary.

If nothing close matches any label, answer "none". Also say in a few words what you see.`;

const clean = (labels) => [...new Set((Array.isArray(labels) ? labels : []).map((l) => String(l).trim().slice(0, 60)).filter(Boolean))].slice(0, 12);

export async function see({ image, labels, looker }) {
  const c = getClient();
  if (!c) return { status: 503, body: { error: 'no ANTHROPIC_API_KEY on the server' } };
  const choices = clean(labels);
  if (!choices.length) return { status: 400, body: { error: 'see() needs at least one label' } };
  if (typeof image !== 'string' || !image || image.length > 2_000_000) return { status: 400, body: { error: 'missing or oversized picture' } };
  const response = await c.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 1024,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            label: { type: 'string', enum: [...choices, 'none'] },
            seen: { type: 'string', description: 'A few words about what is in front of the toy.' },
          },
          required: ['label', 'seen'],
          additionalProperties: false,
        },
      },
    },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: `${looker ? `You are the eyes of: ${String(looker).slice(0, 80)}.\n` : ''}Labels: ${choices.map((l) => `"${l}"`).join(', ')}, or "none".` },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') return { status: 422, body: { error: 'Claude declined this request.' } };
  if (response.stop_reason === 'max_tokens') return { status: 502, body: { error: 'response was cut off' } };
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const out = JSON.parse(text);
  return { status: 200, body: { label: out.label, seen: out.seen, model: response.model } };
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2_500_000) throw new Error('request too large');
  }
  return JSON.parse(body);
}

export function seeMiddleware() {
  return async (req, res, next) => {
    if (req.url !== '/api/see') return next();
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
    try {
      const { status, body } = await see(await readJson(req));
      res.statusCode = status;
      res.end(JSON.stringify(body));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    }
  };
}

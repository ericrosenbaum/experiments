// The two Claude calls: triage (is this utterance a request?) and codegen
// (edit the world's modules). MOCK_CLAUDE=1 swaps both for canned answers so
// the end-to-end test needs no key and is deterministic.
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, RESPONSE_SCHEMA, TRIAGE_PROMPT, TRIAGE_SCHEMA, buildUserMessage } from './prompt.js';

const MOCK = process.env.MOCK_CLAUDE === '1';
const CODE_MODEL = process.env.CODE_MODEL ?? 'claude-opus-5-5';
const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? 'claude-haiku-5-5';

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  client ??= new Anthropic();
  return client;
}

export const available = () => MOCK || !!getClient();
export const mode = () => (MOCK ? 'mock' : getClient() ? 'claude' : 'none');

function jsonFrom(response) {
  if (response.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  if (response.stop_reason === 'max_tokens') throw new Error('The answer was cut off before it finished.');
  return JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

// -> {kind: 'change' | 'undo' | 'none', request}
export async function triage({ transcript, utterance }) {
  if (MOCK) return mockTriage(utterance.text);
  const c = getClient();
  if (!c) return { kind: 'none', request: '' };
  const earlier = transcript.length ? transcript.map((u) => `${u.name}: ${u.text}`).join('\n') : '(nothing yet)';
  const response = await c.messages.create({
    model: TRIAGE_MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TRIAGE_SCHEMA } },
    system: TRIAGE_PROMPT,
    messages: [{ role: 'user', content: `Earlier lines:\n${earlier}\n\nNewest line:\n${utterance.name}: ${utterance.text}` }],
  });
  return jsonFrom(response);
}

// -> {say, ops: [{op, name, code}]}
export async function generate(input) {
  if (MOCK) return mockGenerate(input);
  const c = getClient();
  if (!c) throw new Error('No ANTHROPIC_API_KEY on the server.');
  const response = await c.beta.messages.create({
    model: CODE_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });
  return jsonFrom(response);
}

// ---------------------------------------------------------------- mock ----

function mockTriage(text) {
  if (/\bundo\b/i.test(text)) return { kind: 'undo', request: '' };
  if (/^(make|add|put|give|let)\b/i.test(text.trim())) return { kind: 'change', request: text };
  return { kind: 'none', request: '' };
}

const MOCKS = [
  [/circle/i, () => ({
    say: 'Videos are circles now.',
    ops: [{ op: 'upsert', name: 'tiles', code: `return {
  draw(ctx, g) {
    for (const p of ctx.players) {
      const r = 180 * p.scale;
      g.save(); g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.clip();
      ctx.drawVideo(g, p, p.x, p.y, r * 2, r * 2);
      g.restore();
    }
  },
};` }],
  })],
  [/field/i, () => ({
    say: 'Field is in.',
    ops: [{ op: 'upsert', name: 'field', code: `return { layer: -10, draw(ctx, g) { g.fillStyle = 'rgb(40,40,200)'; g.fillRect(0, 0, ctx.W, ctx.H); } };` }],
  })],
  [/walk|arrow/i, () => ({
    say: 'Arrow keys to walk.',
    ops: [{ op: 'upsert', name: 'walk', code: `return {
  control(ctx, me, dt) {
    const v = 600 * dt;
    if (ctx.key('ArrowLeft')) me.x -= v;
    if (ctx.key('ArrowRight')) me.x += v;
    if (ctx.key('ArrowUp')) me.y -= v;
    if (ctx.key('ArrowDown')) me.y += v;
  },
};` }],
  })],
  [/ball/i, () => ({
    say: 'A ball is bouncing.',
    ops: [{ op: 'upsert', name: 'ball', code: `return {
  layer: 5,
  simulate(ctx, dt) {
    const b = ctx.shared.ball ??= { x: 800, y: 450, vx: 300, vy: 220 };
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 30 || b.x > ctx.W - 30) b.vx *= -1;
    if (b.y < 30 || b.y > ctx.H - 30) b.vy *= -1;
  },
  draw(ctx, g) {
    const b = ctx.shared.ball; if (!b) return;
    g.fillStyle = 'rgb(255,0,255)'; g.beginPath(); g.arc(b.x, b.y, 30, 0, 7); g.fill();
  },
};` }],
  })],
  // The first attempt throws; the retry (which carries `failure`) works.
  [/broken/i, (input) => (input.failure
    ? { say: 'Fixed: blue bar.', ops: [{ op: 'upsert', name: 'bar', code: `return { layer: 9, draw(ctx, g) { g.fillStyle = 'rgb(255,128,0)'; g.fillRect(0, 0, ctx.W, 60); } };` }] }
    : { say: 'Bar added.', ops: [{ op: 'upsert', name: 'bar', code: `return { layer: 9, draw(ctx, g) { nothingHere.boom(); } };` }] })],
  [/freeze/i, (input) => (input.failure
    ? { say: 'That one would have frozen the world, so I left it out.', ops: [] }
    : { say: 'Spinning.', ops: [{ op: 'upsert', name: 'spin', code: `return { draw(ctx, g) { while (true) {} } };` }] })],
  [/typo/i, (input) => (input.failure
    ? { say: 'Fixed the typo.', ops: [{ op: 'upsert', name: 'typo', code: `return {};` }] }
    : { say: 'Typo.', ops: [{ op: 'upsert', name: 'typo', code: `return { draw(ctx, g) { ` }] })],
];

async function mockGenerate(input) {
  await new Promise((r) => setTimeout(r, 150));
  for (const [re, make] of MOCKS) if (re.test(input.request)) return make(input);
  return { say: `(mock) I have no canned answer for "${input.request}".`, ops: [] };
}

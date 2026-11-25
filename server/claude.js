// The two Claude calls: triage (is this utterance a request?) and codegen
// (edit the world's modules). MOCK_CLAUDE=1 swaps both for canned answers so
// the end-to-end test needs no key and is deterministic. USE_CLAUDE_CODE=1
// sends both through the local `claude` CLI instead of the API, so prototyping
// runs on your Claude Code login with no key.
import { spawn } from 'node:child_process';
import os from 'node:os';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, RESPONSE_SCHEMA, TRIAGE_PROMPT, TRIAGE_SCHEMA, buildUserMessage } from './prompt.js';

const MOCK = process.env.MOCK_CLAUDE === '1';
const CODE_MODEL = process.env.CODE_MODEL ?? 'claude-opus-5-5';
// What the room's model menu offers. CODE_MODEL picks the one a room starts on.
export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus: most capable' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet: faster' },
  { id: 'claude-haiku-5-5', label: 'Haiku: fastest' },
];
if (!MODELS.some((m) => m.id === CODE_MODEL)) MODELS.unshift({ id: CODE_MODEL, label: CODE_MODEL });
export const DEFAULT_MODEL = CODE_MODEL;
const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? 'claude-haiku-5-5';
const CLI = process.env.USE_CLAUDE_CODE === '1';
const CLI_TIMEOUT_MS = 180_000;

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  client ??= new Anthropic();
  return client;
}

export const available = () => MOCK || CLI || !!getClient();
export const mode = () => (MOCK ? 'mock' : CLI ? 'claude-code' : getClient() ? 'claude' : 'none');

function jsonFrom(response) {
  if (response.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  if (response.stop_reason === 'max_tokens') throw new Error('The answer was cut off before it finished.');
  return JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

// One headless Claude Code run: no tools, no settings, hooks, MCP servers or
// saved session, so it behaves like a plain API call that returns JSON.
function viaClaudeCode({ model, system, schema, user }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_BIN ?? 'claude', [
      '-p', '--model', model, '--effort', 'low', '--tools', '', '--strict-mcp-config', '--setting-sources', '',
      '--disable-slash-commands', '--no-session-persistence', '--output-format', 'json',
      '--system-prompt', system, '--json-schema', JSON.stringify(schema),
    ], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Claude Code took too long.')); }, CLI_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(e.code === 'ENOENT' ? 'The `claude` command was not found on the server.' : e.message)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let result;
      try { result = JSON.parse(out); } catch { return reject(new Error(err.trim().slice(0, 300) || `claude exited with code ${code}`)); }
      if (result.is_error) return reject(new Error(String(result.result ?? result.subtype).slice(0, 300)));
      if (result.structured_output) return resolve(result.structured_output);
      try { resolve(JSON.parse(result.result)); } catch { reject(new Error('Claude Code did not return JSON.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(user);
  });
}

// -> {kind: 'change' | 'undo' | 'none', request}
export async function triage({ transcript, utterance }) {
  if (MOCK) return mockTriage(utterance.text);
  const earlier = transcript.length ? transcript.map((u) => `${u.name}: ${u.text}`).join('\n') : '(nothing yet)';
  const user = `Earlier lines:\n${earlier}\n\nNewest line:\n${utterance.name}: ${utterance.text}`;
  if (CLI) return viaClaudeCode({ model: TRIAGE_MODEL, system: TRIAGE_PROMPT, schema: TRIAGE_SCHEMA, user });
  const c = getClient();
  if (!c) return { kind: 'none', request: '' };
  const response = await c.messages.create({
    model: TRIAGE_MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TRIAGE_SCHEMA } },
    system: TRIAGE_PROMPT,
    messages: [{ role: 'user', content: user }],
  });
  return jsonFrom(response);
}

// -> {say, ops: [{op, name, code}]}
export async function generate(input, model = CODE_MODEL) {
  if (MOCK) return mockGenerate(input);
  if (CLI) return viaClaudeCode({ model, system: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA, user: buildUserMessage(input) });
  const c = getClient();
  if (!c) throw new Error('No ANTHROPIC_API_KEY on the server.');
  const response = await c.beta.messages.create({
    model,
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

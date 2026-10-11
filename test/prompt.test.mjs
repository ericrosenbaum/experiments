// The Claude prompt mentions every primitive and the model's real parts, and
// the endpoint degrades cleanly without an API key.
import assert from 'node:assert/strict';
import { SYSTEM_PROMPT, buildUserMessage, RESPONSE_SCHEMA } from '../src/behavior/prompt.js';
import { PRIMITIVES } from '../src/behavior/primitives.js';
import { LIBRARY_BY_ID } from '../src/world/library.js';
import { generate } from '../server/generate.js';

for (const [sig] of PRIMITIVES) assert.ok(SYSTEM_PROMPT.includes(sig), `prompt should document ${sig}`);
const msg = buildUserMessage({
  text: 'when I press space, wave {part:left arm} and go to {thing:tree-3|Tree 3}',
  model: LIBRARY_BY_ID.robot,
  things: [{ id: 'tree-3', name: 'Tree 3', kind: 'tree', color: 'green', distance: 12 }],
  otherBehaviors: ['When ↑ is held: drive forward'],
});
for (const s of ['"left arm"', '"head"', 'id "tree-3"', '{part:left arm}', 'drive forward']) assert.ok(msg.includes(s), `user message should include ${s}`);
assert.deepEqual(RESPONSE_SCHEMA.required, ['title', 'summary', 'code', 'keys', 'notes']);

const saved = { key: process.env.ANTHROPIC_API_KEY, tok: process.env.ANTHROPIC_AUTH_TOKEN };
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
const r = await generate({ text: 'jump', model: LIBRARY_BY_ID.robot });
assert.equal(r.status, 503);
Object.assign(process.env, saved.key ? { ANTHROPIC_API_KEY: saved.key } : {}, saved.tok ? { ANTHROPIC_AUTH_TOKEN: saved.tok } : {});
console.log('prompt: all checks passed');

// The Claude prompt mentions every primitive and the model's real parts, and
// the endpoint degrades cleanly without an API key.
import assert from 'node:assert/strict';
import { SYSTEM_PROMPT, buildUserMessage, RESPONSE_SCHEMA } from '../src/behavior/prompt.js';
import { PRIMITIVES } from '../src/behavior/primitives.js';
import { LIBRARY_BY_ID } from '../src/world/library.js';
import { generate } from '../server/generate.js';
import { findNamedBehaviors, generateBehavior } from '../src/behavior/generate.js';
import { SOUND_LIST, soundsFor } from '../src/behavior/sounds.js';
import { existsSync } from 'node:fs';

for (const [sig] of PRIMITIVES) assert.ok(SYSTEM_PROMPT.includes(sig), `prompt should document ${sig}`);
const msg = buildUserMessage({
  text: 'when I press space, wave {part:left arm} and go to {thing:tree-3|Tree 3}',
  model: LIBRARY_BY_ID.robot,
  things: [{ id: 'tree-3', name: 'Tree 3', kind: 'tree', color: 'green', distance: 12 }],
  otherBehaviors: ['When ↑ is held: drive forward'],
});
for (const s of ['"left arm"', '"head"', 'id "tree-3"', '{part:left arm}', 'drive forward']) assert.ok(msg.includes(s), `user message should include ${s}`);
// sounds: every one is in the prompt, recordings are on disk, and things get fitting suggestions
for (const x of SOUND_LIST) {
  assert.ok(SYSTEM_PROMPT.includes(`${x.id} (${x.about})`), `prompt should list the ${x.id} sound`);
  if (x.from) assert.ok(existsSync(new URL(`../public/sounds/${x.id}.mp3`, import.meta.url)), `public/sounds/${x.id}.mp3 is missing (run tools/sounds/fetch.mjs)`);
}
assert.equal(new Set(SOUND_LIST.map((x) => x.id)).size, SOUND_LIST.length, 'sound ids are unique');
assert.ok(SOUND_LIST.every((x) => /^[a-z]+$/.test(x.id)), 'sound ids are one lowercase word');
assert.ok(soundsFor(LIBRARY_BY_ID.racecar).includes('vroom'));
assert.ok(soundsFor(LIBRARY_BY_ID.cow).includes('moo'));
assert.ok(buildUserMessage({ text: 'honk', model: LIBRARY_BY_ID.racecar }).includes('Sounds that suit it: honk, vroom'));
assert.deepEqual(RESPONSE_SCHEMA.required, ['title', 'summary', 'code', 'keys', 'notes', 'modifies']);

// behaviors named in the request, and how they reach Claude
const mine = [{ title: 'Move with Arrows' }, { title: 'Honk and Jump' }, { title: 'Jump' }, { title: '' }];
const names = (t) => findNamedBehaviors(t, mine).map((b) => b.title);
assert.deepEqual(names('make move with arrows go faster'), ['Move with Arrows']);
assert.deepEqual(names('In “Honk and Jump”, honk twice!'), ['Honk and Jump', 'Jump']);
assert.deepEqual(names('when I press j, jump'), ['Jump']);
assert.deepEqual(names('when I press space, honk'), []);
assert.deepEqual(names('go to {thing:j|Jump} and honk'), [], 'chip text is not a behavior name');
assert.deepEqual(names('make it jumpy'), [], 'whole words only');
const named = buildUserMessage({
  text: 'make Move with Arrows faster', model: LIBRARY_BY_ID.racecar,
  named: [{ title: 'Move with Arrows', summary: ['While ↑ is held: drive'], code: 'whileKey("ArrowUp", () => drive(7));' }],
});
for (const s of ['mentioned this existing behavior by name', '### Move with Arrows', 'whileKey("ArrowUp", () => drive(7));']) assert.ok(named.includes(s), `named section should include ${s}`);
assert.ok(!msg.includes('mentioned'), 'no named section when nothing was named');
const off = await generateBehavior({ text: 'change Jump so it beeps', model: LIBRARY_BY_ID.robot, named: [{ title: 'Jump', code: '' }], preferOffline: true });
assert.equal(off.modifies, '', 'the offline helper never claims to change a behavior');
assert.match(off.notes, /can't change “Jump”/);

const saved = { key: process.env.ANTHROPIC_API_KEY, tok: process.env.ANTHROPIC_AUTH_TOKEN };
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
const r = await generate({ text: 'jump', model: LIBRARY_BY_ID.robot });
assert.equal(r.status, 503);
Object.assign(process.env, saved.key ? { ANTHROPIC_API_KEY: saved.key } : {}, saved.tok ? { ANTHROPIC_AUTH_TOKEN: saved.tok } : {});
console.log('prompt: all checks passed');

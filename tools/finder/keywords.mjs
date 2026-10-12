// Pull specific keywords out of each World Finder world with Claude, so kids
// can search for "lava" or "geology" and not just the broad tags. Reads what's
// actually in each world from public/finder/worlds.json (title, summary,
// maker, tags, things, behaviors) and writes a `keywords` list back into it.
// render.mjs keeps them when it re-renders.
//   node --env-file=.env.local tools/finder/keywords.mjs [id,id,...]
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';

const FILE = 'public/finder/worlds.json';
const only = process.argv[2]?.split(',');
const worlds = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const client = new Anthropic();

const SCHEMA = {
  type: 'object',
  properties: { keywords: { type: 'array', items: { type: 'string' } } },
  required: ['keywords'],
  additionalProperties: false,
};

const SYSTEM = `You write search keywords for 3D brick worlds that kids build and share, so other kids can find them by typing or saying what they're into. You get one world's description and its contents. Return 15 to 25 keywords that are specific to this world.

Good keywords:
- the notable things in it: creatures, characters, vehicles, buildings, objects ("dragon", "catapult", "palm tree", "coin")
- materials, landscape and weather ("lava", "sand", "snow", "ocean", "night")
- what you do there ("flinging", "jumping", "rescue", "racing", "collecting", "soccer")
- school topics and big ideas it touches, when it really does ("geology", "gravity", "astronomy", "farming", "chain reaction")
- the place it evokes or comes from, and its culture, when it shows ("hawaii", "pacific", "market", "medieval")
- a mood if it's strong ("spooky", "peaceful")

Rules: lowercase, one or two words each, singular nouns where natural. Nothing generic that fits every world ("brick", "lego", "world", "game", "fun", "build", "kids"). No duplicates or near-duplicates. Only what's actually in the world or clearly implied by it.`;

function describe(w) {
  const things = w.things.map((t) => (t.type && t.type !== t.name.toLowerCase() ? `${t.name} (${t.type})` : t.name)).join(', ');
  return `<world>
Title: ${w.title}
Summary: ${w.summary}
Made by: ${w.by.name}, ${w.by.age}, ${w.by.city}, ${w.by.country}
Maker's tags: ${[...w.tags.genre, ...w.tags.topic].join(', ')}
Gravity: ${w.gravity}
Things in it: ${things}
What things do:
${w.behaviors.map((b) => `- ${b.owner}: ${b.summary?.join('; ') || b.text}`).join('\n')}
</world>`;
}

async function keywordsFor(w) {
  const response = await client.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4096,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: describe(w) }],
  });
  if (response.stop_reason !== 'end_turn') throw new Error(`${w.id}: stopped with ${response.stop_reason}`);
  const { keywords } = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  return [...new Set(keywords.map((k) => k.toLowerCase().trim().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 25);
}

const todo = worlds.filter((w) => !only || only.includes(w.id));
const results = await Promise.all(todo.map(async (w) => [w.id, await keywordsFor(w)]));
for (const [id, kws] of results) {
  worlds.find((w) => w.id === id).keywords = kws;
  console.log(`${id.padEnd(20)} ${kws.join(', ')}`);
}
fs.writeFileSync(FILE, JSON.stringify(worlds, null, 1));
const all = new Set(worlds.flatMap((w) => w.keywords ?? []));
console.log(`${all.size} distinct keywords across ${worlds.length} worlds`);

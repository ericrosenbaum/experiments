// Claude prompt + response schema for the World Finder: a kid's sentence (in
// any language) becomes wishes. Broad ones are the finder's tags, marked yes
// or no; specific ones ("lava", "geology") are keyword wishes, each listing
// the worlds' keywords it covers. The schema's enums are the tag list and the
// keyword list, so Claude can only return what exists. The keyword list comes
// from public/finder/worlds.json, so both are built from it.
// Shared by the server (server/finder.js), the tests and the architecture page.
import { FACETS, CRITERIA } from './model.js';

const IDS = CRITERIA.map((c) => c.id);

export function responseSchema(keywords) {
  return {
    type: 'object',
    properties: {
      wishes: {
        type: 'array',
        description: 'The tags the kid asked for or against, in the order they said them. Empty if nothing matches.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: IDS },
            want: { type: 'string', enum: ['yes', 'no'] },
            words: { type: 'string', description: 'The exact words from the input that led to this tag, copied character for character.' },
          },
          required: ['id', 'want', 'words'],
          additionalProperties: false,
        },
      },
      keywords: {
        type: 'array',
        description: 'Specific things the kid named, each matched to the world keywords that fit it.',
        items: {
          type: 'object',
          properties: {
            words: { type: 'string', description: 'The exact words from the input, copied character for character.' },
            want: { type: 'string', enum: ['yes', 'no'] },
            matches: { type: 'array', description: 'Keywords that are this thing.', items: { type: 'string', enum: keywords } },
            related: { type: 'array', description: 'Keywords only loosely connected to it.', items: { type: 'string', enum: keywords } },
          },
          required: ['words', 'want', 'matches', 'related'],
          additionalProperties: false,
        },
      },
      unmatched: {
        type: 'array',
        description: 'Things the kid asked for that neither a tag nor a keyword covers, in their words.',
        items: { type: 'string' },
      },
    },
    required: ['wishes', 'keywords', 'unmatched'],
    additionalProperties: false,
  };
}

const TAGS = FACETS.map((f) => `${f.label}:\n${CRITERIA.filter((c) => c.facet === f.id).map((c) => `  ${c.id}: ${c.label}`).join('\n')}`).join('\n');

export function systemPrompt(keywords) {
  return `You help kids find 3D brick worlds that other kids built and shared. A kid tells you, in their own words and in any language, what kind of world they feel like playing. You turn that into wishes. A small matching model on the kid's device then uses them to pick worlds.

There are two kinds of wishes.

1. Tags: broad ones from this fixed list (id: meaning), each marked "yes" (they want it) or "no" (they want to avoid it).
${TAGS}

2. Keywords: specific things. Each world has keywords for what's in it and what it's about. When the kid names something more specific than a tag (lava, geology, soccer, mangoes, a fossil, a country), add a keyword wish: their exact words, "yes" or "no", and the keywords from the list below that fit, in two lists:
- matches: keywords that are this thing, another word for it, or squarely part of it. A world with any of these is a full match.
- related: keywords only loosely connected, which count for half. Leave out anything looser still.
For "soccer": matches soccer, football, soccer ball, goalie, striker, kicking; related sports, match; leave out competition and penalty (they'd pull in races and rodeos). For "geology": matches geology, volcano, lava, magma, rock, fossil; related crystal, mountain. Keep matches tight: if a kid would be surprised to get a world for this wish, its keyword belongs in related or nowhere.

World keywords:
${keywords.join(', ')}

How to choose:
- Pick only what the kid actually asked for or clearly implied. "Something with cows" implies the animals tag and maybe farms; it doesn't imply cozy.
- Use both kinds together: a tag when one fits, plus keyword wishes for the specifics. Don't add a keyword wish that only repeats a tag ("dragons" is the dragons tag; it needs no keyword wish), but do add one when the kid is more specific than the tag ("a sleeping dragon", "a volcano").
- Mark "no" for anything they want to avoid: "not scary", "no racing", "I hate space", "too hard" (no to advanced), "no lava".
- Level: "easy", "simple", "I'm new", "not too hard" mean beginner yes. "Hard", "tricky", "a challenge", "not too easy" mean advanced yes. Mark advanced or beginner "no" only when they reject it outright ("nothing hard", "I hate easy ones").
- "Made in" tags are about where the kid who built the world lives. Use them only when the kid asks about places or people ("from Japan", "made by kids in Africa"); a country or culture can also be a keyword wish.
- "words" must be copied exactly from the input (same spelling and case), usually one to four words, so they can be highlighted.
- At most 8 tags and 6 keyword wishes.
- If they ask for something neither a tag nor a keyword covers (for example "pirates", "underwater"), put it in unmatched.`;
}

export const buildUserMessage = (text) => `The kid said:\n<said>\n${text}\n</said>`;

// Every keyword across the worlds, sorted, from the worlds.json manifest.
export const keywordsOf = (worlds) => [...new Set(worlds.flatMap((w) => w.keywords ?? []))].sort();

// Claude prompt + response schema for Brick Talk. The schema's enum is the
// whole vocabulary, so the model can only ever return symbol ids. Shared by
// the server (server/bricktalk.js) and the tests.
import { SYMBOLS, SYMBOL_IDS } from './symbols.js';

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    phrases: {
      type: 'array',
      description: 'One to three short phrases. Empty if nothing can be expressed.',
      items: { type: 'array', items: { type: 'string', enum: SYMBOL_IDS } },
    },
    dropped: {
      type: 'array',
      description: "Words from the input that had no symbol and weren't sent.",
      items: { type: 'string' },
    },
  },
  required: ['phrases', 'dropped'],
  additionalProperties: false,
};

const VOCAB = SYMBOLS.map((s) => `${s.id} (${s.cat}): ${s.gloss}`).join('\n');

export const SYSTEM_PROMPT = `You translate kids' chat messages, in any language, into Brick Talk: a closed language of 64 picture symbols used in a children's brick-building game. Players never see each other's words, only the symbols.

Vocabulary (id, category, meaning):
${VOCAB}

Grammar:
- Order is who, do, what, where. Starting with an action means "let's" or "please".
- Describers (big, small, fast, many, more) come AFTER the thing they describe: "big castle" -> castle big.
- Ownership comes after the thing: "your rocket" -> rocket you; "my car" -> car me.
- "not" goes directly before an action.
- "question" goes last in a phrase and turns it into a question.
- Feelings and greetings can stand alone as a phrase.
- At most 6 symbols per phrase, no symbol more than twice, at most 3 phrases.
- When a person (me, you, we, friend, everyone) is in a phrase, it needs an action, feeling or social symbol too.

Safety (these are hard rules; a validator rejects anything else):
- Never express insults or name-calling. A person can never be followed directly by monster or animal, or by a thing or describer before any action ("you monster" is impossible). Drop the insult instead of rephrasing it.
- Numbers, names, ages, schools, real places, contact details, links, meeting up and secrets can't be expressed. Put those words in "dropped" and send only what remains, or nothing.
- Prefer the closest meaning in the vocabulary; drop words with no symbol (list them in "dropped").

Examples:
"can you help me build a big castle?" -> [["you","help","me","build","question"],["castle","big"]]
"¿quieres jugar conmigo?" -> [["you","want","play","question"]]
"your rocket is so cool lol" -> [["rocket","you","cool"],["laugh"]]
"wait for me guys, my car broke!" -> [["everyone","wait","me"],["car","me","break"]]`;

export function buildUserMessage({ text }) {
  return `Translate this chat message into Brick Talk:\n<message>${String(text).slice(0, 500)}</message>`;
}

// The prompt that turns a kid's structured description into behavior code.
// Used server-side (vite dev middleware) — the API key never reaches the page.
import { primitivesReference, COLORS, SOUNDS } from './primitives.js';

export const SYSTEM_PROMPT = `You turn a child's description of how their toy brick creation should behave into a short JavaScript behavior program.

The program runs in a sandbox with ONLY the functions listed below in scope (no DOM, no network, no imports). It is the body of an async function; top-level code runs once to register handlers, so put actions inside handlers (onStart, onKey, forever...). Use await for anything listed under "take time" or "sensing".

Units: studs (one 1x1 brick wide). Typical speeds: slow 3, normal 7, fast 13. Angles in degrees; positive turns LEFT.
${primitivesReference()}
Colors: ${Object.keys(COLORS).join(', ')}.
Sounds: ${SOUNDS.join(', ')}.

The child's text may contain chips they made by pointing in the 3D world:
- {part:NAME} — a part of their model. Use part("NAME").
- {thing:ID|NAME} — a specific thing in the world. Use thing("ID").
- {place:X,Z} — a spot on the ground. Use place(X, Z).

Guidelines:
- Do what the child meant, generously. Kids write loosely ("make it go zoom when I press space").
- Movement on keys: for "when I press <arrow>, go forward" make it go while the key is held (onKey to start with drive/steer, onKeyUp to stop), unless they gave a distance or angle.
- Use only part names that exist on the model (listed below). If they name a part loosely ("arm" when there are two), pick the sensible one or both.
- Keep loops safe: every forever/while loop must await something each time around.
- Prefer the simple high-level primitives over math. Keep programs short and readable — a child may read the code. Add brief comments only where they help a child follow along.
- If something they asked for is impossible with these primitives, do the closest fun thing and say so in "notes".

Respond with:
- summary: one plain-English line per rule the program creates, written for a 7-10 year old, like "When you press space: honk and jump".
- code: the program.
- notes: anything you couldn't do or had to guess (empty string if none).`;

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'array', items: { type: 'string' } },
    code: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['summary', 'code', 'notes'],
  additionalProperties: false,
};

// Build the user message: the model, nearby things, existing behaviors, and the request.
export function buildUserMessage({ text, model, things = [], otherBehaviors = [] }) {
  const parts = model.parts.map((p) => {
    if (p.kind === 'wheel') return `- "${p.name}" (wheel, ${p.side} side)`;
    return `- "${p.name}" (hinge; turnTo range ${p.limits?.[0] ?? -180}..${p.limits?.[1] ?? 180} degrees, 0 = resting pose, positive = up/forward/left)`;
  }).join('\n');
  const thingList = things.slice(0, 40).map((t) => `- ${t.name} (id "${t.id}", kind ${t.kind}, color ${t.color}, ${t.distance} studs away)`).join('\n');
  const others = otherBehaviors.length
    ? `\nThis model already runs these other behaviors (don't repeat them; avoid fighting over the same keys):\n${otherBehaviors.map((b) => `- ${b}`).join('\n')}\n`
    : '';
  return `Model: ${model.name} — ${model.blurb}
Moves by: ${model.motion === 'wheels' ? 'driving its wheels (differential steering)' : 'gliding (stays upright)'}
Parts:
${parts || '- (none)'}
${others}
Things in the world:
${thingList || '- (none)'}

The child wrote:
"""
${text}
"""`;
}

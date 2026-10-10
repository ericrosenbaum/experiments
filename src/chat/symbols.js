// Brick Talk: a closed set of 64 symbols, each a small 3D-rendered brick build
// (public/bricktalk/<id>.webp, from the Brick Talk artifact). Messages
// are rows of symbol ids, never free text. The validator here is what
// enforces the rules; Claude only proposes ids (see src/chat/prompt.js).

export const CATS = {
  people:   { label: 'People',    base: '#0055BF', ink: '#FFFFFF' },
  action:   { label: 'Actions',   base: '#237841', ink: '#FFFFFF' },
  thing:    { label: 'Things',    base: '#F2CD37', ink: '#05131D' },
  place:    { label: 'Places',    base: '#3F3691', ink: '#FFFFFF' },
  feeling:  { label: 'Feelings',  base: '#C91A09', ink: '#FFFFFF' },
  social:   { label: 'Social',    base: '#FE8A18', ink: '#05131D' },
  modifier: { label: 'Modifiers', base: '#A0A5A9', ink: '#05131D' },
};

// id | category | gloss
const RAW = `
me|people|I, me
you|people|you
we|people|we, us (me + you)
friend|people|friend
everyone|people|everyone, all of us
build|action|build, make
break|action|break, knock down
go|action|go
come|action|come (to me)
look|action|look, see
find|action|find, search
give|action|give, share
help|action|help, lift
want|action|want, ask for
stop|action|stop
wait|action|wait
follow|action|follow
play|action|play, game
win|action|win
trade|action|trade, swap
hide|action|hide
brick|thing|brick, piece
house|thing|house, home, base
castle|thing|castle, tower
bridge|thing|bridge
tree|thing|tree, forest
water|thing|water, sea, river
car|thing|car, vehicle
boat|thing|boat
rocket|thing|rocket, spaceship
gem|thing|treasure, gem
key|thing|key
door|thing|door, gate
flag|thing|flag, goal
star|thing|star, points
monster|thing|monster, enemy
animal|thing|animal, pet
music|thing|music, sound
color|thing|color, paint
here|place|here
there|place|there, over there
up|place|up, on top
down|place|down, under
inside|place|inside, in
happy|feeling|happy
sad|feeling|sad
laugh|feeling|laugh, funny
wow|feeling|wow, amazing
love|feeling|love, like
cool|feeling|cool, nice one
hi|social|hi! / bye!
thanks|social|thank you
sorry|social|sorry
yes|social|yes, OK
no|social|no
question|modifier|? (makes a question)
not|modifier|not, don't
more|modifier|more, again+
big|modifier|big
small|modifier|small
fast|modifier|fast, quick
again|modifier|again
now|modifier|now!
many|modifier|many, lots
`;

export const SYMBOLS = RAW.trim().split('\n').map((line) => {
  const [id, cat, gloss] = line.split('|');
  return { id, cat, gloss };
});
export const SYM = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));
export const SYMBOL_IDS = SYMBOLS.map((s) => s.id);

// ---- rendering -----------------------------------------------------------------
// Each build stands on a round pedestal in its category color; the image has a
// transparent background, so it sits directly on a chat row or bubble.
export function symbolImg(id, px = 36) {
  const s = SYM[id];
  return `<img class="build" src="./bricktalk/${id}.webp" width="${px}" height="${px}" alt="${s.gloss}" title="${s.gloss}" draggable="false" decoding="async">`;
}

export const readAs = (ids) => ids.map((i) => (i === 'question' ? '?' : i)).join(' ').replace(' ?', '?');

// ---- grammar + safety validator --------------------------------------------------
const catOf = (id) => SYM[id].cat;
const DESCRIBERS = new Set(['big', 'small', 'fast', 'many', 'more']);
const INSULTABLE = new Set(['monster', 'animal']);

export function validate(seq) {
  const why = [];
  if (!Array.isArray(seq) || !seq.length) return { ok: false, why: ['Nothing to send.'] };
  if (seq.some((i) => typeof i !== 'string' || !Object.hasOwn(SYM, i))) return { ok: false, why: ['Unknown symbol.'] };
  if (seq.length > 6) why.push('Phrases are at most 6 symbols.');
  const counts = {};
  seq.forEach((i) => { counts[i] = (counts[i] || 0) + 1; });
  if (Object.values(counts).some((n) => n > 2)) why.push('No symbol more than twice.');
  const q = seq.indexOf('question');
  if (q >= 0 && q !== seq.length - 1) why.push('? goes last.');
  seq.forEach((id, k) => { if (id === 'not' && !(seq[k + 1] && catOf(seq[k + 1]) === 'action')) why.push('Not must come right before an action.'); });
  let seenAction = false;
  for (let k = 0; k < seq.length - 1; k++) {
    if (catOf(seq[k]) === 'action') seenAction = true;
    const a = seq[k], b = seq[k + 1];
    if (catOf(a) === 'people' && INSULTABLE.has(b)) why.push("Name-calling isn't possible in Brick Talk.");
    else if (catOf(a) === 'people' && !seenAction && (catOf(b) === 'thing' || DESCRIBERS.has(b))) why.push("Name-calling isn't possible in Brick Talk.");
  }
  const hasPeople = seq.some((i) => catOf(i) === 'people');
  const hasDoFeel = seq.some((i) => ['action', 'feeling', 'social'].includes(catOf(i)));
  const hasContent = seq.some((i) => ['action', 'thing', 'place', 'feeling', 'social'].includes(catOf(i)));
  if (!hasContent) why.push('Needs something to do, a thing, a place or a feeling.');
  else if (hasPeople && !hasDoFeel) why.push('When a person is in a message, they need to do or feel something.');
  return { ok: why.length === 0, why: [...new Set(why)] };
}

// A message is up to three phrases; every phrase must pass on its own.
export function validateMessage(phrases) {
  if (!Array.isArray(phrases) || !phrases.length || phrases.length > 3) return { ok: false, why: ['Nothing to send.'] };
  const why = phrases.flatMap((p) => validate(p).why);
  return { ok: why.length === 0, why: [...new Set(why)] };
}

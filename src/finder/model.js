// The World Finder's decision model. It runs on the device: nothing a kid
// types or picks is sent anywhere.
//
// 1. read(world) turns a world's raw metadata (who made it and where, the tags
//    they picked, the things in it, the behaviors it was taught and their
//    compiled code) into a list of facts, one line each. A fact carries
//    evidence for criteria: {crit, w} with w in 0..1 for how sure it is.
// 2. The evidence for each criterion combines as a noisy-OR:
//    p = 1 - (1 - w1)(1 - w2)..., so two weak hints beat one, and nothing
//    goes past 1.
// 3. decide() weighs the kid's likes against their dislikes: the match is the
//    average p over likes, minus a penalty for the strongest dislike. A world
//    is suggested when the match clears THRESHOLD and no dislike is clearly
//    present. The rationale is the likes it matched best.
//
// parse(text) turns a sentence ("dragons and castles, but nothing scary")
// into likes and dislikes with a small word list and negation scopes.

export const THRESHOLD = 0.5;
const DISLIKE_PENALTY = 0.8;
const DISLIKE_VETO = 0.6;

export const FACETS = [
  { id: 'play', label: 'Kind of play', color: 'sun' },
  { id: 'topic', label: "What it's about", color: 'sky' },
  { id: 'doing', label: 'Things to do', color: 'tomato' },
  { id: 'level', label: 'Level', color: 'grape' },
  { id: 'region', label: 'Made in', color: 'mint' },
];

export const CRITERIA = [
  { id: 'adventure', facet: 'play', label: 'Adventure', icon: '🧭' },
  { id: 'games', facet: 'play', label: 'Games & challenges', icon: '🏆' },
  { id: 'racing', facet: 'play', label: 'Racing', icon: '🏁' },
  { id: 'battle', facet: 'play', label: 'Battles', icon: '⚔️' },
  { id: 'story', facet: 'play', label: 'Stories & mysteries', icon: '📖' },
  { id: 'building', facet: 'play', label: 'Build & experiment', icon: '🧱' },
  { id: 'cozy', facet: 'play', label: 'Cozy & calm', icon: '🌿' },
  { id: 'spooky', facet: 'play', label: 'Spooky', icon: '👻' },
  { id: 'music', facet: 'play', label: 'Music & dance', icon: '🎵' },
  { id: 'silly', facet: 'play', label: 'Silly', icon: '🤪' },

  { id: 'animals', facet: 'topic', label: 'Animals', icon: '🐄' },
  { id: 'dragons', facet: 'topic', label: 'Dinos & dragons', icon: '🐉' },
  { id: 'space', facet: 'topic', label: 'Space', icon: '🚀' },
  { id: 'castles', facet: 'topic', label: 'Castles & knights', icon: '🏰' },
  { id: 'vehicles', facet: 'topic', label: 'Vehicles', icon: '🚜' },
  { id: 'robots', facet: 'topic', label: 'Robots', icon: '🤖' },
  { id: 'magic', facet: 'topic', label: 'Magic', icon: '🪄' },
  { id: 'farms', facet: 'topic', label: 'Farms', icon: '🌽' },
  { id: 'towns', facet: 'topic', label: 'Towns & people', icon: '🏘️' },
  { id: 'nature', facet: 'topic', label: 'Wild places', icon: '🌋' },

  { id: 'drive', facet: 'doing', label: 'Drive it with keys', icon: '🎮' },
  { id: 'click', facet: 'doing', label: 'Click to make things happen', icon: '👆' },
  { id: 'collect', facet: 'doing', label: 'Collect things', icon: '🪙' },
  { id: 'crash', facet: 'doing', label: 'Knock things over', icon: '💥' },
  { id: 'float', facet: 'doing', label: 'Low gravity', icon: '🪐' },
  { id: 'talk', facet: 'doing', label: 'Characters that talk', icon: '💬' },

  { id: 'beginner', facet: 'level', label: 'Easy to start', icon: '🌱' },
  { id: 'advanced', facet: 'level', label: 'Lots going on', icon: '🧠' },

  { id: 'africa', facet: 'region', label: 'Africa', icon: '🌍' },
  { id: 'americas', facet: 'region', label: 'The Americas', icon: '🌎' },
  { id: 'asia', facet: 'region', label: 'Asia', icon: '🌏' },
  { id: 'europe', facet: 'region', label: 'Europe', icon: '🌍' },
  { id: 'oceania', facet: 'region', label: 'Oceania', icon: '🌏' },
];
export const CRITERIA_BY_ID = Object.fromEntries(CRITERIA.map((c) => [c.id, c]));
export const facetOf = (id) => FACETS.find((f) => f.id === CRITERIA_BY_ID[id].facet);

const REGION = {
  Japan: 'asia', India: 'asia', 'South Korea': 'asia', China: 'asia', Singapore: 'asia', 'United Arab Emirates': 'asia',
  Nigeria: 'africa', Ghana: 'africa', Egypt: 'africa', Kenya: 'africa',
  Germany: 'europe', Norway: 'europe', 'United Kingdom': 'europe', France: 'europe', Poland: 'europe', Spain: 'europe',
  Argentina: 'americas', Brazil: 'americas', 'United States': 'americas', Canada: 'americas', Mexico: 'americas',
  Australia: 'oceania', 'New Zealand': 'oceania',
};

// Tags kids pick when they share a world, and what each is evidence for.
const TAG = {
  adventure: { adventure: 1 }, explore: { adventure: 0.8 }, rescue: { adventure: 0.8 }, survival: { adventure: 0.8, games: 0.4 },
  game: { games: 1 }, platformer: { games: 1 }, speedrun: { games: 1 }, shooter: { games: 0.9, battle: 0.5 }, sports: { games: 1 }, training: { games: 0.4, battle: 0.5 },
  racing: { racing: 1 }, battle: { battle: 1 },
  story: { story: 1 }, mystery: { story: 1 },
  sandbox: { building: 1 }, building: { building: 1 }, puzzle: { building: 0.6, games: 0.5 }, physics: { building: 0.8, crash: 0.5 },
  cozy: { cozy: 1 }, calm: { cozy: 1 }, simulation: { cozy: 0.4, building: 0.3 },
  spooky: { spooky: 1 }, monsters: { spooky: 0.35, silly: 0.2 }, music: { music: 1 }, party: { music: 0.8, silly: 0.4 }, silly: { silly: 1 },
  animals: { animals: 1 }, horses: { animals: 1 }, dragons: { dragons: 1 }, dinosaurs: { dragons: 1 },
  space: { space: 1 }, aliens: { space: 0.8, silly: 0.2 }, castles: { castles: 1 }, knights: { castles: 1 },
  vehicles: { vehicles: 1 }, construction: { vehicles: 0.7, building: 0.6 }, robots: { robots: 1 }, magic: { magic: 1 },
  farms: { farms: 1 }, towns: { towns: 1 }, people: { towns: 0.6, talk: 0.3 },
  nature: { nature: 1 }, islands: { nature: 0.9 }, volcanoes: { nature: 1 }, snow: { nature: 0.7 }, mazes: { games: 0.5, building: 0.3 }, heroes: { adventure: 0.3 },
};

// What things in a world hint at. Matched against a thing's library type,
// then its kind.
const THING = {
  castle: { castles: 0.9, crash: 0.4 }, knight: { castles: 0.7, battle: 0.3 }, catapult: { castles: 0.4, crash: 0.6, battle: 0.5 },
  tent: { adventure: 0.2 }, dummy: { castles: 0.4, battle: 0.4 }, flag: {}, goal: { games: 0.6 },
  dragon: { dragons: 1, magic: 0.3 }, dino: { dragons: 1 },
  cow: { animals: 0.8, farms: 0.4 }, horse: { animals: 0.8 },
  barn: { farms: 0.9 }, silo: { farms: 0.8 }, crops: { farms: 0.8 }, hay: { farms: 0.3 }, tractor: { farms: 0.6, vehicles: 0.7 }, farmer: { farms: 0.4 },
  racecar: { vehicles: 0.8, racing: 0.5 }, digger: { vehicles: 0.9, building: 0.3 }, truck: { vehicles: 0.9 }, road: { vehicles: 0.3, towns: 0.3, racing: 0.2 },
  spaceship: { space: 0.7, vehicles: 0.5 }, rocket: { space: 0.9, vehicles: 0.3 }, ufo: { space: 0.8, silly: 0.2 }, alien: { space: 0.7, silly: 0.3 }, astronaut: { space: 0.8 },
  asteroid: { space: 0.6 }, station: { space: 0.7 }, pad: { space: 0.4 }, crystal: { magic: 0.3, collect: 0.2 },
  robot: { robots: 0.9 }, wizard: { magic: 0.9, story: 0.2 },
  house: { towns: 0.5, crash: 0.3 }, stall: { towns: 0.7 }, fountain: { towns: 0.6, cozy: 0.2 }, lamp: { towns: 0.2 }, villager: { towns: 0.6 },
  tower: { crash: 0.4 }, pile: { crash: 0.3, building: 0.3 }, ball: { crash: 0.3, games: 0.2 },
  tree: { nature: 0.15 }, pond: { nature: 0.5, cozy: 0.4 }, hill: { nature: 0.25 }, lava: { nature: 0.5, spooky: 0.15 }, blanket: { cozy: 0.6 },
  slime: { spooky: 0.15, games: 0.3, silly: 0.2 }, coin: { collect: 0.8, games: 0.5 }, platform: { games: 0.4 }, pipe: { games: 0.3 }, block: { games: 0.3 },
  floor: { music: 0.5 }, field: { games: 0.4 }, barrel: { racing: 0.3 },
};

// What compiled code does. Each pattern is tested against one behavior.
const CODE = [
  [/\bdrive\(|\bsteer\(|\brise\(/, (c) => /onKey|whileKey/.test(c), { drive: 1 }, 'you steer it with the keys'],
  [/\bonClick\(/, null, { click: 1 }, 'something happens when you click'],
  [/\bremove\(\)/, (c) => /onTouch/.test(c), { collect: 0.8, games: 0.3 }, 'things disappear when you reach them'],
  [/\bspawn\(|turnTo\(130\)|\bpush\(|\bclone\(/, null, { crash: 0.6, building: 0.3 }, 'makes or flings bricks'],
  [/\bgravity\(/, (c) => /gravity\((0(\.\d+)?)\)/.test(c), { float: 1, space: 0.2 }, 'gravity is turned down'],
  [/\bsay\(/, null, { talk: 0.6, story: 0.15 }, 'says things'],
  [/play\("music"\)|\bdance/, null, { music: 0.6 }, 'music'],
  [/play\("(boo|roar)"\)/, null, { spooky: 0.3 }, 'spooky sounds'],
  [/goTo\(|\bface\(/, (c) => /forever|onTouch|every/.test(c), { games: 0.3, adventure: 0.2 }, 'chases or follows'],
  [/onTouch\(/, (c) => /say\("[^"]*(win|escaped|record|lap|goal)/i.test(c), { games: 0.7, racing: 0.15 }, 'there is a way to win'],
  [/broadcast\(/, null, { story: 0.2 }, 'things send each other messages'],
];

const pct = (p) => `${Math.round(p * 100)}%`;
const named = (t) => (t.type && t.name.toLowerCase() !== t.type ? `${t.name} (${t.type})` : t.name);

// ---- reading a world ----------------------------------------------------------

export function read(world) {
  const facts = [];
  const add = (kind, text, hits = {}) => facts.push({ kind, text, hits: Object.entries(hits).map(([crit, w]) => ({ crit, w })) });

  const region = REGION[world.by.country];
  add('maker', `${world.by.name}, ${world.by.age} · ${world.by.city}, ${world.by.country}`, region ? { [region]: 1 } : {});
  for (const tag of [...world.tags.genre, ...world.tags.topic]) add('tag', `#${tag}`, TAG[tag] ?? {});

  // Things: models one by one, other things grouped by kind ("Tree ×3").
  const groups = new Map();
  for (const t of world.things) {
    const key = t.kind === 'model' ? t.id : t.kind;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  for (const list of groups.values()) {
    const t = list[0];
    const hint = THING[t.type] ?? THING[t.kind] ?? {};
    const bricks = list.reduce((n, x) => n + x.bricks, 0);
    const label = t.kind === 'model' ? named(t) : list.length > 1 ? `${t.name.replace(/ \d+$/, '')} ×${list.length}` : t.name;
    add(t.kind === 'model' ? 'model' : 'thing', `${label}${bricks > 4 ? ` · ${bricks} bricks` : ''}`, hint);
  }

  // Behaviors: the kid's words, with what the code does as evidence.
  const events = new Set();
  let messages = 0;
  for (const b of world.behaviors) {
    const hits = {};
    const why = [];
    for (const [re, also, ev, says] of CODE) {
      if (!re.test(b.code ?? '') || (also && !also(b.code))) continue;
      for (const [k, w] of Object.entries(ev)) hits[k] = 1 - (1 - (hits[k] ?? 0)) * (1 - w);
      why.push(says);
    }
    for (const m of (b.code ?? '').matchAll(/\b(onStart|onKey|whileKey|onTouch|onClick|onMessage|forever|every)\(/g)) events.add(m[1]);
    messages += ((b.code ?? '').match(/broadcast\(/g) ?? []).length;
    add('behavior', `${b.owner}: ${b.summary?.[0] ?? b.text}`, hits);
    facts[facts.length - 1].why = why;
  }
  if (world.gravity < 1) add('world', `gravity is ${world.gravity === 0 ? 'off' : `×${world.gravity}`}`, { float: 1 });

  // Level: how much is going on, from the program side.
  const lines = world.behaviors.reduce((n, b) => n + (b.code ?? '').split('\n').length, 0);
  const complexity = world.behaviors.length + events.size + 2 * messages + Math.floor(lines / 12);
  const lvl = Math.max(0, Math.min(1, (complexity - 6) / 10)); // 6 and under: easy; 16 and up: lots going on
  add('level', `${world.behaviors.length} behaviors · ${events.size} kinds of events${messages ? ` · ${messages} messages` : ''} → complexity ${complexity}`,
    { advanced: lvl, beginner: 1 - lvl });
  return { facts, complexity };
}

// ---- deciding -------------------------------------------------------------------

// Fold facts into per-criterion probabilities (noisy-OR), keeping which facts
// counted. `upto` lets the page score as the facts stream in.
export function evidence(facts, prefs, upto = facts.length) {
  const p = {}, from = {};
  for (const id of Object.keys(prefs)) { p[id] = 0; from[id] = []; }
  for (let i = 0; i < upto; i++) {
    for (const { crit, w } of facts[i].hits) {
      if (!(crit in p) || w <= 0) continue;
      p[crit] = 1 - (1 - p[crit]) * (1 - w);
      from[crit].push(i);
    }
  }
  return { p, from };
}

// prefs: {criterionId: +1 (like) | -1 (dislike)}
export function decide(facts, prefs, upto) {
  const { p, from } = evidence(facts, prefs, upto);
  const likes = Object.keys(prefs).filter((k) => prefs[k] > 0);
  const dislikes = Object.keys(prefs).filter((k) => prefs[k] < 0);
  const like = likes.length ? likes.reduce((s, k) => s + p[k], 0) / likes.length : 0;
  const worst = dislikes.reduce((m, k) => Math.max(m, p[k]), 0);
  const match = Math.max(0, like - DISLIKE_PENALTY * worst);
  const vetoed = dislikes.filter((k) => p[k] >= DISLIKE_VETO);
  const pick = likes.length > 0 && match >= THRESHOLD && !vetoed.length;
  const reasons = likes.filter((k) => p[k] >= 0.5).sort((a, b) => p[b] - p[a]).map((k) => ({ id: k, p: p[k] }));
  return { p, from, match, pick, vetoed, reasons, likes, dislikes, explain: `${pct(like)} of what you like${worst ? `, −${pct(DISLIKE_PENALTY * worst)} for what you don't` : ''}` };
}

// ---- understanding a sentence ---------------------------------------------------

const WORDS = [
  ['adventure', 'adventure adventures adventurous explore exploring explorer quest quests treasure journey rescue'],
  ['games', 'game games challenge challenges challenging platform platformer jump jumping win winning level levels sport sports soccer football goal obstacle speedrun'],
  ['racing', 'race races racing racer fast speed speedy zoom track'],
  ['battle', 'battle battles fight fighting war sword swords attack army knight-fight'],
  ['story', 'story stories mystery mysteries detective secret secrets clue clues'],
  ['building', 'build building builder sandbox experiment experiments physics domino dominoes construct puzzle puzzles'],
  ['cozy', 'cozy cosy calm relaxing relax chill peaceful quiet gentle cute picnic'],
  ['spooky', 'spooky scary scare scared creepy ghost ghosts haunted monster monsters dark night halloween'],
  ['music', 'music musical dance dancing disco party song songs'],
  ['silly', 'silly funny goofy weird wacky hilarious'],
  ['animals', 'animal animals cow cows horse horses pet pets pony ponies zoo'],
  ['dragons', 'dragon dragons dino dinos dinosaur dinosaurs t-rex trex'],
  ['space', 'space rocket rockets alien aliens planet planets moon stars star galaxy astronaut ufo'],
  ['castles', 'castle castles knight knights king queen princess prince kingdom medieval'],
  ['vehicles', 'car cars truck trucks tractor tractors digger diggers vehicle vehicles plane planes jet jets driving'],
  ['robots', 'robot robots robotic bot bots machine machines'],
  ['magic', 'magic magical wizard wizards witch spell spells unicorn crystal crystals'],
  ['farms', 'farm farms farming farmer crops harvest barn'],
  ['towns', 'town towns village villages city cities market shop shops people neighbors'],
  ['nature', 'nature island islands volcano volcanoes snow snowy desert ocean sea jungle forest beach mountain mountains wild outdoors'],
  ['drive', 'drive steer control controls keyboard keys'],
  ['click', 'click clicking tap'],
  ['collect', 'collect collecting coin coins gems loot'],
  ['crash', 'crash crashing smash smashing knock destroy destroying break breaking topple catapult catapults explode explosions'],
  ['float', 'float floating gravity zero-gravity weightless'],
  ['talk', 'talk talking chat characters character friends'],
  ['beginner', 'easy simple beginner beginners starter little young'],
  ['advanced', 'hard harder difficult complicated complex advanced tricky expert'],
  ['africa', 'africa african nigeria ghana egypt kenya'],
  ['americas', 'america americas american usa canada mexico brazil argentina'],
  ['asia', 'asia asian japan india korea china singapore dubai'],
  ['europe', 'europe european germany norway uk england britain france poland spain'],
  ['oceania', 'oceania australia zealand'],
];
const LEXICON = new Map();
for (const [id, words] of WORDS) for (const w of words.split(' ')) LEXICON.set(w, id);
const PHRASES = [[/\bno gravity\b|\bzero g(ravity)?\b|\blow gravity\b/g, 'float'], [/\bnew zealand\b/g, 'oceania'], [/\bsouth korea\b/g, 'asia'], [/\bknock (things )?(over|down)\b/g, 'crash']];
const NEGATE = new Set(['not', 'no', "don't", 'dont', 'never', 'without', 'hate', 'hates', 'nothing', 'avoid', 'except', "isn't", 'isnt', 'too', 'dislike', 'skip']);
const STOP = /^(but|and|though|although|yet|also|plus)$|[.!?;,]$/;

// Returns [{id, polarity: 1 | -1, start, end}] in the order they were said;
// start/end index into text, for highlighting.
export function parse(text) {
  const out = [];
  const lower = text.toLowerCase();
  const taken = [];
  for (const [re, id] of PHRASES) for (const m of lower.matchAll(re)) taken.push({ id, start: m.index, end: m.index + m[0].length });
  let neg = false;
  for (const m of lower.matchAll(/[a-z'’-]+[.!?;,]?/g)) {
    const raw = m[0].replace('’', "'");
    const word = raw.replace(/[.!?;,]$/, '');
    const start = m.index, end = start + word.length;
    const phrase = taken.find((t) => start >= t.start && start < t.end);
    // "too" only negates before a level word ("too hard"); elsewhere it's "also".
    if (phrase) { if (start === phrase.start) out.push({ id: phrase.id, polarity: neg ? -1 : 1, start: phrase.start, end: phrase.end }); }
    else if (NEGATE.has(word) && !(word === 'too' && !/^\s*(hard|difficult|easy|scary|complicated|simple)/.test(lower.slice(end)))) neg = true;
    else if (LEXICON.has(word) || LEXICON.has(word.replace(/s$/, ''))) out.push({ id: LEXICON.get(word) ?? LEXICON.get(word.replace(/s$/, '')), polarity: neg ? -1 : 1, start, end });
    if (STOP.test(word) || /[.!?;,]$/.test(raw)) neg = false;
  }
  return out;
}

// Merge a parse into prefs: the last thing said about a criterion wins.
export function prefsFrom(parsed, prefs = {}) {
  const next = { ...prefs };
  for (const { id, polarity } of parsed) next[id] = polarity;
  return next;
}

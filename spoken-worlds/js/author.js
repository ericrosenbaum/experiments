// Voice authoring: a spoken conversation that walks the author through the
// world one question at a time. The tool keeps a to-do list (scenes without a
// description, options, or results) and always asks the next question, so the
// author never has to navigate the graph by voice.
//
// `io.ask(prompt, spec)` speaks the prompt, waits for one answer (spoken or
// typed) and returns { text, clip, choice }. Answers to multiple-choice
// questions go through the same decision model the game uses.

import { slug, parseRules } from './engine.js';

export class Signal { constructor(type, data) { this.type = type; this.data = data; } }

const C = (id, ...phrases) => ({ id, phrases });

export const AUTHOR_COMMANDS = [
  C('@redo', 'go back', 'redo that', 'try again', 'say it again', 'start that over'),
  C('@playback', 'play it back', 'let me hear that'),
  C('@skip', 'skip', 'skip this', 'later'),
  C('@where', 'where am I', 'what am I doing', 'status'),
  C('@play', 'play from here', 'test it', 'let me play'),
  C('@stop', 'stop authoring', 'stop', 'I am done for now'),
];

const DONE = C('done', "that's all", 'done', "that's it", 'no more', 'finished');

export function todo(world) {
  for (const [id, sc] of Object.entries(world.scenes)) {
    if (!sc.description) return { scene: id, need: 'description' };
    if (!sc.name) return { scene: id, need: 'name' };
    if (!sc.options.length && !sc.optionsSkipped) return { scene: id, need: 'options' };
    const o = sc.options.find((o) => !o.result);
    if (o) return { scene: id, need: 'option', option: o.id };
  }
  return null;
}

export function newScene(world, name) {
  let id = slug(name) || 'place';
  for (let i = 2; world.scenes[id]; i++) id = `${slug(name)}-${i}`;
  world.scenes[id] = { name, description: null, options: [] };
  return id;
}

export function summary(world, at) {
  const n = Object.keys(world.scenes).length;
  let left = 0;
  for (const sc of Object.values(world.scenes)) left += (!sc.description) + sc.options.filter((o) => !o.result).length;
  const where = at ? `You're working on ${world.scenes[at.scene]?.name || 'the first scene'}. ` : '';
  return `${where}This world has ${n} place${n === 1 ? '' : 's'} and ${left} thing${left === 1 ? '' : 's'} left to describe.`;
}

export async function authorWorld(world, io, save) {
  if (!world.title) {
    const a = await io.ask("Let's make a world. What's it called?", { kind: 'text' });
    world.title = a.text || 'Untitled world';
    await save();
  }
  if (!world.start) {
    world.start = 'start';
    world.scenes.start = { name: '', description: null, options: [] };
  }
  let t;
  while ((t = todo(world))) {
    io.setFocus?.(t);
    await authorStep(world, t, io);
    await save();
  }
  io.setFocus?.(null);
  await io.say('Every place has been described. Tap play to try it, or edit anything on the map.');
}

async function authorStep(world, t, io) {
  const sc = world.scenes[t.scene];
  const first = t.scene === world.start && !sc.name;

  if (t.need === 'description') {
    const a = await io.ask(first
      ? 'Describe the first scene. Where is the player, and what is going on? End with a question, like: what do you do?'
      : `Describe ${sc.name}. What does the player find there?`, { kind: 'record' });
    sc.description = a.skipped ? { text: '', skipped: true } : { text: a.text, clip: a.clip };
    return;
  }
  if (t.need === 'name') {
    const a = await io.ask("What's a short name for this place?", { kind: 'text' });
    sc.name = a.text || 'the first place';
    sc.nameClip = a.clip;
    return;
  }
  if (t.need === 'options') {
    await io.say('What can the player do here? Say one thing at a time, and say "that\'s all" when you\'re done.');
    for (let i = 0; ; i++) {
      const a = await io.ask(i ? 'What else?' : 'First thing they can do?', { kind: 'record', choices: i ? [DONE] : [] });
      if (a.choice === 'done' || a.skipped) break;
      if (!a.text) continue;
      sc.options.push({ id: slug(a.text).slice(0, 24) + '-' + sc.options.length, phrase: { text: a.text, clip: a.clip }, also: [], result: null, rules: '' });
    }
    if (!sc.options.length) sc.optionsSkipped = true;
    return;
  }
  if (t.need === 'option') await authorOption(world, sc, sc.options.find((o) => o.id === t.option), io);
}

async function authorOption(world, sc, opt, io) {
  const phrase = opt.phrase.text;
  const a = await io.ask(`When the player says "${phrase}", what happens?`, { kind: 'record' });
  opt.result = a.skipped ? { text: '', skipped: true } : { text: a.text, clip: a.clip };
  const rules = [];

  // Destination
  const places = Object.entries(world.scenes).map(([id, s]) => C('scene:' + id, s.name || 'the first place'));
  const dest = await io.ask('Does that take them somewhere? Say "stay here", "a new place", or the name of a place.', {
    kind: 'choice', choices: [C('stay', 'stay here', 'no', 'nowhere', 'stay'), C('new', 'a new place', 'somewhere new', 'new place'), ...places],
  });
  if (dest.choice === 'new') {
    const n = await io.ask("What's the new place called?", { kind: 'text' });
    const id = newScene(world, n.text || 'a new place');
    world.scenes[id].nameClip = n.clip;
    rules.push(`go ${id}`);
    await io.say(`Okay. I'll ask you about ${world.scenes[id].name} later.`);
  } else if (dest.choice?.startsWith('scene:')) {
    rules.push(`go ${dest.choice.slice(6)}`);
  }

  // Rules
  const RULES = [
    C('none', 'no rules', 'no more rules', 'none', 'nope', 'no', "that's all", 'done'),
    C('gives', 'gives an item', 'they get something', 'gives them something', 'pick up'),
    C('takes', 'uses up an item', 'takes something away', 'lose an item'),
    C('needs', 'needs something', 'only if they have something', 'requires', 'locked'),
    C('sets', 'switches something on', 'unlocks something', 'changes something'),
    C('once', 'only once', 'just one time', 'once'),
    C('win', 'wins the game', 'they win', 'win'),
    C('lose', 'loses the game', 'they lose', 'game over', 'lose'),
  ];
  for (let i = 0; i < 6; i++) {
    const r = await io.ask(i ? 'Any other rules?' : 'Any rules? You can say: gives an item, needs something, unlocks something, only once, wins, loses, or no rules.', { kind: 'choice', choices: RULES });
    if (!r.choice || r.choice === 'none' || r.skipped) break;
    if (r.choice === 'gives' || r.choice === 'takes') {
      const it = await io.ask(r.choice === 'gives' ? 'What item do they get?' : 'What item gets used up?', { kind: 'text' });
      const id = slug(it.text);
      if (!id) continue;
      world.items ||= {};
      if (!world.items[id]) world.items[id] = { text: it.text, clip: it.clip };
      rules.push(`${r.choice} ${id}`);
      await io.say(`Got it: ${r.choice} ${it.text}.`);
    } else if (r.choice === 'sets') {
      const f = await io.ask('Give it a short name, like "pod unlocked" or "alarm off".', { kind: 'text' });
      if (slug(f.text)) rules.push(`sets ${slug(f.text)}`);
    } else if (r.choice === 'needs') {
      const known = [...Object.entries(world.items || {}).map(([id, it]) => C(id, it.text, id.replace(/-/g, ' '))), ...knownFacts(world).map((f) => C(f, f.replace(/-/g, ' ')))];
      const n = await io.ask('What do they need? Name an item, or something that was unlocked.', { kind: 'choice', choices: known, allowFree: true });
      const id = n.choice || slug(n.text);
      if (!id) continue;
      const e = await io.ask("And what happens if they don't have it?", { kind: 'record' });
      opt.otherwise = { text: e.text, clip: e.clip };
      rules.unshift(`needs ${id}`, `else ${e.text}`);
    } else {
      rules.push(r.choice);
    }
  }
  opt.rules = rules.join('\n');
}

function knownFacts(world) {
  const f = new Set();
  for (const sc of Object.values(world.scenes)) for (const o of sc.options) parseRules(o.rules).sets.forEach((x) => f.add(x));
  return [...f];
}


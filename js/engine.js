// Deterministic game engine: rules parsing, game state, and turn resolution.
// The decision model picks a choice id; everything after that happens here.

export const slug = (s) =>
  String(s || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// One rule per line. Unknown lines are reported, not fatal.
export function parseRules(src) {
  const r = { needs: [], needsNot: [], else: null, gives: [], takes: [], sets: [], clears: [], go: null, once: false, end: null, errors: [] };
  for (const raw of String(src || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [word, ...rest] = line.split(/\s+/);
    const arg = rest.join(' ');
    switch (word.toLowerCase()) {
      case 'needs':
        if (/^(no|not)\s+/i.test(arg)) r.needsNot.push(slug(arg.replace(/^(no|not)\s+/i, '')));
        else r.needs.push(slug(arg));
        break;
      case 'else': r.else = arg; break;
      case 'gives': r.gives.push(slug(arg)); break;
      case 'takes': r.takes.push(slug(arg)); break;
      case 'sets': r.sets.push(slug(arg)); break;
      case 'clears': r.clears.push(slug(arg)); break;
      case 'go': r.go = slug(arg.replace(/^to\s+/i, '')); break;
      case 'once': r.once = true; break;
      case 'win': r.end = 'win'; break;
      case 'lose': r.end = 'lose'; break;
      default: r.errors.push(line);
    }
  }
  return r;
}

export const BUILTINS = [
  { id: '@help', phrases: ['what can I do', 'help', 'what are my options', 'options'] },
  { id: '@repeat', phrases: ['repeat that', 'where am I', 'look', 'say that again', 'describe the room'] },
  { id: '@inventory', phrases: ['what do I have', 'inventory', 'what am I carrying', 'check my pockets'] },
  { id: '@places', phrases: ['where have I been', 'map', 'list the places I have visited'] },
  { id: '@restart', phrases: ['start over', 'restart the game', 'begin again'] },
];

export function newState(world) {
  return { scene: world.start, have: [], facts: [], used: {}, visited: [world.start], ended: null, turn: 0 };
}

const has = (st, x) => st.have.includes(x) || st.facts.includes(x);

export function availableOptions(world, st) {
  const scene = world.scenes[st.scene];
  if (!scene) return [];
  return scene.options.filter((o) => !st.used[`${st.scene}/${o.id}`]);
}

// Choices handed to the decision model: scene options + built-in commands.
export function choicesFor(world, st) {
  const opts = availableOptions(world, st).map((o) => ({
    id: o.id,
    phrases: [o.phrase?.text, ...(o.also || [])].filter(Boolean),
  }));
  return [...opts, ...BUILTINS];
}

// A Line is { text, clip? }. Plain strings are synth-only lines.
const L = (x) => (typeof x === 'string' ? { text: x } : x);

export function itemLine(world, id) {
  return L(world.items?.[id] || id.replace(/-/g, ' '));
}

function joinList(world, ids) {
  const out = [];
  ids.forEach((id, i) => {
    if (i > 0) out.push(L(i === ids.length - 1 ? 'and' : ','));
    out.push(itemLine(world, id));
  });
  return out;
}

export function describe(world, st) {
  return [world.scenes[st.scene]?.description || L('…')];
}

// Resolve a choice id against state. Returns { state, lines } with a new state.
export function step(world, state, choiceId) {
  const st = structuredClone(state);
  st.turn++;
  const lines = [];

  if (choiceId == null) {
    lines.push(L("Hmm, I'm not sure what you mean. You could say:"));
    lines.push(...optionList(world, st));
    return { state: st, lines };
  }
  if (choiceId === '@help') {
    lines.push(L('You could say:'), ...optionList(world, st));
    return { state: st, lines };
  }
  if (choiceId === '@repeat') return { state: st, lines: describe(world, st) };
  if (choiceId === '@inventory') {
    lines.push(...(st.have.length ? [L('You have'), ...joinList(world, st.have)] : [L("You aren't carrying anything.")]));
    return { state: st, lines };
  }
  if (choiceId === '@places') {
    const names = st.visited.map((id) => ({ text: world.scenes[id]?.name || id, clip: world.scenes[id]?.nameClip }));
    lines.push(L("You've been to"));
    names.forEach((n, i) => { if (i) lines.push(L(i === names.length - 1 ? 'and' : ',')); lines.push(n); });
    return { state: st, lines };
  }
  if (choiceId === '@restart') {
    const fresh = newState(world);
    return { state: fresh, lines: [L('Starting over.'), ...describe(world, fresh)] };
  }

  const opt = world.scenes[st.scene]?.options.find((o) => o.id === choiceId);
  if (!opt) return { state: st, lines: [L("You can't do that here.")] };
  const r = parseRules(opt.rules);

  const ok = r.needs.every((x) => has(st, x)) && r.needsNot.every((x) => !has(st, x));
  if (!ok) {
    lines.push(opt.otherwise || L(r.else || "You can't do that yet."));
    return { state: st, lines };
  }

  lines.push(opt.result || L('…'));
  for (const x of r.gives) if (!st.have.includes(x)) st.have.push(x);
  st.have = st.have.filter((x) => !r.takes.includes(x));
  for (const x of r.sets) if (!st.facts.includes(x)) st.facts.push(x);
  st.facts = st.facts.filter((x) => !r.clears.includes(x));
  if (r.gives.length) lines.push(L('You got'), ...joinList(world, r.gives), L('.'));
  if (r.once) st.used[`${st.scene}/${opt.id}`] = true;

  if (r.end) {
    st.ended = r.end;
    lines.push(L(r.end === 'win' ? 'The end. You won! Say start over to play again.' : 'Game over. Say start over to try again.'));
    return { state: st, lines };
  }
  if (r.go) {
    const target = findScene(world, r.go);
    if (target) {
      st.scene = target;
      if (!st.visited.includes(target)) st.visited.push(target);
      lines.push(...describe(world, st));
    } else {
      lines.push(L(`(There's no place called ${r.go} yet.)`));
    }
  }
  return { state: st, lines };
}

export function findScene(world, ref) {
  if (world.scenes[ref]) return ref;
  const s = slug(ref);
  return Object.keys(world.scenes).find((id) => slug(world.scenes[id].name) === s || id === s) || null;
}

function optionList(world, st) {
  const opts = availableOptions(world, st);
  const out = [];
  opts.forEach((o, i) => {
    if (i) out.push(L(i === opts.length - 1 ? 'or' : ','));
    out.push(o.phrase || L(o.id));
  });
  out.push(L('. Or ask what you have.'));
  return out;
}

// Static checks shown in the editor: dangling go targets, unknown rules, etc.
export function lint(world) {
  const issues = [];
  if (!world.scenes[world.start]) issues.push(`Start scene "${world.start}" doesn't exist.`);
  for (const [sid, sc] of Object.entries(world.scenes)) {
    if (!sc.description?.text && !sc.description?.clip) issues.push(`${sc.name}: no description yet.`);
    if (!sc.options.length) issues.push(`${sc.name}: no options — the player will be stuck.`);
    for (const o of sc.options) {
      const r = parseRules(o.rules);
      r.errors.forEach((e) => issues.push(`${sc.name} / ${o.phrase?.text}: unknown rule "${e}"`));
      if (r.go && !findScene(world, r.go)) issues.push(`${sc.name} / ${o.phrase?.text}: goes to "${r.go}", which doesn't exist.`);
    }
    void sid;
  }
  return issues;
}

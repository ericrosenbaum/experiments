// Offline compiler: structured kid-language -> behavior code.
//
// This is the fallback when Claude isn't available, and a reference for the
// shape of code Claude should produce. It understands sentences made of a
// trigger ("when I press space", "forever", "when it bumps a tree") followed
// by actions joined with "and" / "then" / commas. Pointed-at things arrive as
// chips serialized like {part:left arm}, {thing:tree-3|Tree 3}, {place:4,-10}.

import { SOUNDS, COLORS, SPEED_WORDS } from './primitives.js';

const COLOR_WORDS = Object.keys(COLORS).concat(['grey']);
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twice: 2, once: 1 };
const KEY_WORDS = [
  [/up(\s*arrow)?/, 'ArrowUp'], [/down(\s*arrow)?/, 'ArrowDown'], [/left(\s*arrow)?/, 'ArrowLeft'],
  [/right(\s*arrow)?/, 'ArrowRight'], [/space(\s*bar)?/, ' '], [/enter|return/, 'Enter'],
];
const KEY_LABEL = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'space', Enter: 'enter' };
const SOUND_VERBS = { honk: 'honk', beep: 'beep', roar: 'roar', pop: 'pop', ding: 'ding', boing: 'boing', zap: 'laser', cheer: 'yay', drum: 'drum' };
// Model types (matched by name) and prop kinds kids are likely to say.
const MODEL_WORDS = ['catapult', 'digger', 'dino', 'tractor', 'truck', 'knight', 'hero', 'slime', 'alien', 'spaceship', 'ufo', 'rocket', 'dragon', 'horse', 'cow'];
const KINDS = ['tree', 'house', 'brick', 'tower', 'ramp', 'ball', 'castle', 'hill', 'coin', 'asteroid', 'platform', 'crystal', 'hay', 'fence', 'barn', 'silo',
  'well', 'tent', 'pipe', 'block', 'goal', 'flag', 'cloud', 'lamp', 'fountain', 'stall', 'pond', 'road', 'dummy', 'station', ...MODEL_WORDS,
  'model', 'car', 'robot', 'anything', 'something', 'thing'];

const VERBS = {};
for (const [base, forms] of Object.entries({
  spin: 'spin spins spinning', wave: 'wave waves waving', wiggle: 'wiggle wiggles', wag: 'wag wags wagging', shake: 'shake shakes',
  nod: 'nod nods', chomp: 'chomp chomps bite bites snap snaps', raise: 'raise raises lift lifts open opens', 'put up': 'put up puts up',
  lower: 'lower lowers drop drops close closes', 'put down': 'put down puts down', turn: 'turn turns look looks', swing: 'swing swings', move: 'move moves',
})) for (const f of forms.split(' ')) VERBS[f] = base;
VERBS['put up'] = VERBS['puts up'] = 'raise';
VERBS['put down'] = VERBS['puts down'] = 'lower';
const VERB_RE = new RegExp(`\\b(${Object.keys(VERBS).sort((a, b) => b.length - a.length).join('|')})\\b`);
const q = (s) => JSON.stringify(s);
const num = (s) => (s == null ? null : s in NUM_WORDS ? NUM_WORDS[s] : Number.isFinite(Number(s)) ? Number(s) : null);

function parseKey(s) {
  s = s.trim().replace(/^the\s+/, '').replace(/\s+key$/, '');
  for (const [re, k] of KEY_WORDS) if (new RegExp(`^${re.source}$`).test(s)) return k;
  if (/^[a-z0-9]$/.test(s)) return s;
  return null;
}

// "90 degrees", "90°", or a bare number that isn't a count ("3 times") or distance.
function degIn(text) {
  const m = text.match(/(-?\d+)\s*(degrees?|°)/) || text.match(/(-?\d+)(?!\s*(times|studs?|steps?|seconds?|x\d))\b/);
  return m ? Number(m[1]) : null;
}

function speedIn(text) {
  for (const w of Object.keys(SPEED_WORDS).sort((a, b) => b.length - a.length)) if (new RegExp(`\\b${w}\\b`).test(text)) return SPEED_WORDS[w];
  return null;
}

function colorIn(text) {
  for (const c of COLOR_WORDS) if (new RegExp(`\\b${c}\\b`).test(text)) return c === 'grey' ? 'gray' : c;
  return null;
}

function timesIn(text) {
  const m = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+times\b|\b(twice|once)\b/);
  return m ? num(m[1] ?? m[2]) : 1;
}

// Pull chips out of a phrase.
function chips(text) {
  const out = { parts: [], things: [], places: [] };
  text.replace(/\{(part|thing|place):([^}]*)\}/g, (_, type, v) => {
    v = v.replace(/\u0001/g, ',').replace(/\u0002/g, '.');
    if (type === 'part') out.parts.push(v.trim());
    if (type === 'thing') { const [id, name] = v.split('|'); out.things.push({ id: id.trim(), name: (name ?? id).trim() }); }
    if (type === 'place') { const [x, z] = v.split(',').map(Number); out.places.push({ x, z }); }
    return '';
  });
  return out;
}
const stripChips = (t) => t.replace(/\{part:([^}]*)\}/g, '$1').replace(/\{thing:[^|}]*\|?([^}]*)\}/g, '$1').replace(/\{place:[^}]*\}/g, 'there');

// Find which part of the model a phrase refers to.
function findParts(phrase, model) {
  const c = chips(phrase);
  if (c.parts.length) return c.parts;
  const names = model?.parts?.map((p) => p.name) ?? [];
  const t = stripChips(phrase);
  const exact = names.filter((n) => t.includes(n));
  if (exact.length) return exact;
  if (/\barms\b/.test(t)) return names.filter((n) => n.includes('arm'));
  if (/\bwheels\b/.test(t)) return names.filter((n) => n.includes('wheel'));
  for (const n of names) {
    const last = n.split(' ').pop();
    if (new RegExp(`\\b${last}\\b`).test(t) && !['wheel'].includes(last)) return [n];
  }
  if (/\b(jaw|mouth|look|looks|nod|nods|chomp|chomps|bite|bites)\b/.test(t)) return names.filter((n) => n === 'head');
  return [];
}

// A target for goTo / face / follow.
function findTarget(phrase) {
  const c = chips(phrase);
  if (c.things.length) return { code: `thing(${q(c.things[0].id)})`, label: c.things[0].name };
  if (c.places.length) return { code: `place(${c.places[0].x}, ${c.places[0].z})`, label: 'that spot' };
  const t = phrase.toLowerCase();
  const color = colorIn(t);
  if (/\brace ?cars?\b/.test(t)) return { code: q('racecar'), label: 'the race car' };
  for (const k of KINDS) {
    if (new RegExp(`\\b${k}s?\\b`).test(t)) {
      const kind = k === 'car' || k === 'robot' ? 'model' : ['anything', 'something', 'thing'].includes(k) ? null : k;
      if (color && kind) return { code: `{color: ${q(color)}, kind: ${q(kind)}}`, label: `the nearest ${color} ${k}` };
      return { code: kind ? q(kind) : 'null', label: `the nearest ${k}` };
    }
  }
  if (color) return { code: q(color), label: `the nearest ${color} thing` };
  return null;
}

function touchFilter(phrase) {
  const t = findTarget(phrase);
  if (!t) return { code: 'null', label: 'anything' };
  return { code: t.code, label: t.label.replace(/^the nearest /, 'a ') };
}

// ---- actions -----------------------------------------------------------------

// Each handler: (phrase, ctx) => {code: [lines], label, continuous?: {stop: [lines]}} | null
const ACTIONS = [
  // world rules: gravity
  (p) => {
    if (!/\bgravity\b|\beverything floats?\b/.test(p)) return null;
    let g = null, label;
    const n = p.match(/gravity\s+(to\s+)?(-?\d+(\.\d+)?)/);
    if (n) { g = Number(n[2]); label = `set gravity to ${g}`; }
    else if (/\b(off|no|zero|none|stop)\b|everything floats?/.test(p)) { g = 0; label = 'turn off gravity'; }
    else if (/\b(moon|low|weak|less|half)\b/.test(p)) { g = /half/.test(p) ? 0.5 : 0.3; label = 'make gravity weak, like on the moon'; }
    else if (/\b(upside|reverse|backwards|up)\b/.test(p)) { g = -0.3; label = 'make gravity pull up'; }
    else if (/\b(strong|heavy|double|more|high|super)\b/.test(p)) { g = 2; label = 'make gravity strong'; }
    else if (/\b(on|normal|back|regular)\b/.test(p)) { g = 1; label = 'turn gravity back on'; }
    return g == null ? null : { code: [`gravity(${g});`], label };
  },

  // disappear
  (p) => (/^(disappear|vanish|go away|poof|remove (it|itself|yourself|me)|delete (it|itself|yourself))\b/.test(p) ? { code: ['remove();'], label: 'disappear' } : null),

  // clone: "clone itself", "make a copy of {thing} above", "make 3 copies"
  (p) => {
    const m = p.match(/^(clone|copy|duplicate)\b|^(make|create|add|build|spawn)\s+(a|another|one more|\d+|two|three|four|five)?\s*(cop(y|ies)|clones?|twins?)\b/);
    if (!m) return null;
    const c = chips(p);
    const ofPart = (m[1] ? p.slice(m[0].length) : (p.match(/\bof\s+(.*)$/)?.[1] ?? '')).split(/\s+(in|at|to|next|above|behind|on|over|beside|ahead|there)\b/)[0];
    let what = 'null', label = 'itself';
    if (c.things.length) { what = `thing(${q(c.things[0].id)})`; label = c.things[0].name; }
    else if (ofPart && !/^\s*(it|itself|me|myself|yourself|this|that)?\s*$/.test(stripChips(ofPart))) {
      const t = findTarget(ofPart);
      if (t) { what = t.code; label = t.label.replace(/^the nearest /, 'the '); }
    }
    let where = null, whereLabel = '';
    if (c.places.length) { where = `place(${c.places[0].x}, ${c.places[0].z})`; whereLabel = ' over there'; }
    else if (/\b(above|on top|up high|over (it|itself))\b/.test(p)) { where = '"above"'; whereLabel = ' above'; }
    else if (/\b(in front|ahead)\b/.test(p)) { where = '"front"'; whereLabel = ' in front'; }
    else if (/\b(behind|in back)\b/.test(p)) { where = '"back"'; whereLabel = ' behind'; }
    else if (/\bleft\b/.test(p)) { where = '"left"'; whereLabel = ' to the left'; }
    else if (/\bright\b/.test(p)) { where = '"right"'; whereLabel = ' to the right'; }
    const call = `await clone(${what}${where ? `, ${where}` : ''});`;
    const n = num(m[3]) && m[3] !== 'a' ? num(m[3]) : timesIn(p);
    return n > 1
      ? { code: [`for (let i = 0; i < ${n}; i++) { ${call} }`], label: `make ${n} copies of ${label}${whereLabel}` }
      : { code: [call], label: `make a copy of ${label}${whereLabel}` };
  },

  // fly up / down
  (p, ctx) => {
    const m = p.match(/^(fly|go|move|float|rise|climb|sink|descend|lift off|take off|blast off)\b\s*(up|upward|upwards|higher|down|downward|downwards|lower)?\b/);
    if (!m) return null;
    const [, verb, dir] = m;
    if (!dir && !['fly', 'float', 'rise', 'climb', 'sink', 'descend', 'lift off', 'take off', 'blast off'].includes(verb)) return null;
    if (!dir && /\b(to|towards?|around|forward|backwards?)\b/.test(p)) return null;
    const down = /^(sink|descend)/.test(verb) || /^(down|lower)/.test(dir ?? '');
    const v = (speedIn(p) ?? 6) * (down ? -1 : 1);
    const word = down ? 'down' : 'up';
    const secs = num((p.match(/\bfor\s+(\d+(\.\d+)?|a|one|two|three|four|five)\s*(seconds?|secs?)/) || [])[1]);
    if (ctx.continuous && secs == null) return { code: [`rise(${v});`], label: `fly ${word}`, continuous: ['rise(0);'] };
    const t = secs ?? 1;
    return { code: [`rise(${v});`, `await wait(${t});`, 'rise(0);'], label: `fly ${word} for ${t} second${t === 1 ? '' : 's'}` };
  },

  // stop
  (p) => (/^(stop|halt|freeze|stand still)\b/.test(p) ? { code: ['stop();'], label: 'stop' } : null),

  // waiting
  (p) => {
    const m = p.match(/^(wait|pause)( for)?\s*(\d+(\.\d+)?|a|one|two|three|four|five)?\s*(seconds?|secs?)?/);
    if (!m) return null;
    const s = num(m[3]) ?? 1;
    return { code: [`await wait(${s});`], label: `wait ${s} second${s === 1 ? '' : 's'}` };
  },

  // say
  (p, ctx) => {
    const m = ctx.raw.match(/\b(say|says|shout|shouts|yell|yells)\s+["“]?(.+?)["”]?$/i);
    if (!m || !/^(say|shout|yell)/.test(p.replace(/^(it |you )/, ''))) return null;
    return { code: [`say(${q(m[2])});`], label: `say "${m[2]}"` };
  },

  // broadcast
  (p) => {
    const m = p.match(/^(tell everyone|broadcast|send( a)? message|shout to everyone)\s+["“]?([\w ]+?)["”]?$/);
    return m ? { code: [`broadcast(${q(m[3].trim())});`], label: `tell everyone "${m[3].trim()}"` } : null;
  },

  // sounds
  (p) => {
    let m = p.match(/^(play|make)( a| the)?\s+(\w+)( sound| noise)?/);
    let s = m && SOUNDS.includes(m[3]) ? m[3] : null;
    if (!s) { m = p.match(/^(\w+)/); s = m && SOUND_VERBS[m[1].replace(/s$/, '')]; }
    if (!s) return null;
    const n = timesIn(p);
    return n > 1
      ? { code: [`for (let i = 0; i < ${n}; i++) { play(${q(s)}); await wait(0.3); }`], label: `play ${s} ${n} times` }
      : { code: [`play(${q(s)});`], label: `play the ${s} sound` };
  },

  // dance
  (p) => (/^(do a )?dance\b/.test(p) ? {
    code: ['play("yay");', 'await turn(30);', 'await turn(-60);', 'await turn(30);', 'jump(3);', 'await wait(0.5);'],
    label: 'dance',
  } : null),

  // wander
  (p) => (/^(wander|roam|explore|drive around|go around)\b/.test(p) ? {
    code: ['await move(random(4, 10));', 'await turn(random(-120, 120));'],
    label: 'wander around', loops: true,
  } : null),

  // go to / follow / chase
  (p) => {
    const m = p.match(/^(go|drive|walk|move|run|head|roll|fly|float)\s+(over\s+)?(to|towards?)\b|^(follow|chase|find|visit)\b/);
    if (!m) return null;
    const t = findTarget(p);
    if (!t) return null;
    const sp = speedIn(p) ?? (m[4] === 'chase' ? 12 : 7);
    return { code: [`await goTo(${t.code}, ${sp});`], label: `${m[4] ?? 'go to'} ${t.label}`, loops: /^(follow|chase)/.test(p) };
  },

  // teleport: "teleport to {place}", "go back to the start"
  (p) => {
    if (!/^(teleport|beam|warp|zap)( me| it| itself| yourself)? (back )?to\b/.test(p)) return null;
    const t = findTarget(p);
    return t ? { code: [`await teleport(${t.code});`], label: `teleport to ${t.label.replace(/^the nearest /, 'the ')}` } : null;
  },

  // face
  (p) => {
    if (!/^(face|look at|turn to(wards?)?|point at)\b/.test(p)) return null;
    const t = findTarget(p);
    return t ? { code: [`await face(${t.code});`], label: `face ${t.label}` } : null;
  },

  // spawn bricks
  (p, ctx) => {
    const m = p.match(/^(spawn|drop|make|throw|shoot|launch|fire|build|place|put|create|toss|fling)\s+(.*?)\b(bricks?|blocks?|pieces?)\b/);
    if (!m) return null;
    const color = colorIn(m[2]);
    const size = (m[2].match(/\b(\d)\s*x\s*(\d)\b/) || []).slice(1).join('x') || null;
    const throwing = /^(throw|shoot|launch|fire|toss|fling)/.test(m[1]);
    const count = num((m[2].match(/^(\d+|two|three|four|five|six|seven|eight|nine|ten)\b/) || [])[1]) ?? timesIn(p);
    const opts = [];
    if (color) opts.push(`color: ${q(color)}`);
    if (size) opts.push(`size: ${q(size)}`);
    const parts = findParts(p, ctx.model);
    if (parts.length) opts.push(`from: ${q(parts[0])}`);
    else if (/\b(on top|above|up)\b/.test(p) || m[1] === 'drop') opts.push('at: "top"');
    else if (/\bbehind\b/.test(p)) opts.push('at: "back"');
    if (throwing && !parts.length) opts.push('launch: 18');
    const c = `spawn({${opts.join(', ')}});`;
    const label = `${m[1]} ${count > 1 ? count + ' ' : 'a '}${color ?? ''} brick${count > 1 ? 's' : ''}`.replace(/\s+/g, ' ');
    return { code: count > 1 ? [`for (let i = 0; i < ${count}; i++) { ${c} await wait(0.25); }`] : [c], label };
  },

  // catapult-ish: fling / swing / launch with a part
  (p, ctx) => {
    if (!/^(fling|swing|launch|fire|throw)\b/.test(p)) return null;
    const parts = findParts(p, ctx.model).filter((n) => !n.includes('wheel'));
    const arm = parts[0] ?? ctx.model?.parts?.find((x) => x.kind === 'hinge')?.name;
    if (!arm) return null;
    return {
      code: [`await part(${q(arm)}).turnTo(130);`, 'play("whoosh");', 'await wait(0.4);', `await part(${q(arm)}).turnTo(0);`],
      label: `swing the ${arm}`,
    };
  },

  // part motions: spin / wave / raise / lower / turn part to N / nod / wag / chomp / look left
  (p, ctx) => {
    const parts = findParts(p, ctx.model).filter((n) => !n.includes('wheel') || /spin/.test(p));
    if (!parts.length) return null;
    const verb = VERBS[(p.match(VERB_RE) || [])[1]] ?? 'wiggle';
    const lines = [];
    let label;
    const deg = degIn(p);
    const speed = speedIn(p) ?? 7;
    for (const n of parts) {
      const pr = `part(${q(n)})`;
      if (verb === 'spin') {
        const s = Math.round(speed * 50) * (/\b(backwards?|other way)\b/.test(p) ? -1 : 1);
        lines.push(`${pr}.spin(${s});`); label = `spin the ${parts.join(' and ')}`;
      } else if (verb === 'raise' || (verb === 'move' && /\bup\b/.test(p))) {
        lines.push(`${pr}.turnTo(${deg ?? 90});`); label = `raise the ${parts.join(' and ')}`;
      } else if (verb === 'lower' || (verb === 'move' && /\bdown\b/.test(p))) {
        lines.push(`${pr}.turnTo(${deg ?? 0});`); label = `lower the ${parts.join(' and ')}`;
      } else if ((verb === 'turn' || verb === 'look') && /\bleft\b/.test(p)) {
        lines.push(`${pr}.turnTo(${deg ?? 60});`); label = `turn the ${n} left`;
      } else if ((verb === 'turn' || verb === 'look') && /\bright\b/.test(p)) {
        lines.push(`${pr}.turnTo(${-(deg ?? 60)});`); label = `turn the ${n} right`;
      } else if (verb === 'turn' && deg != null) {
        lines.push(`${pr}.turnTo(${deg});`); label = `turn the ${n} to ${deg}°`;
      } else if (verb === 'swing') {
        lines.push(`${pr}.turnTo(${deg ?? 120});`); label = `swing the ${n}`;
      } else {
        lines.push(`${pr}.wiggle(${timesIn(p) > 1 ? timesIn(p) : 3});`); label = `${verb} the ${parts.join(' and ')}`;
      }
    }
    // run several parts at once, then wait for them
    const awaited = lines.filter((l) => !l.includes('.spin('));
    if (awaited.length > 1) return { code: [`await Promise.all([${awaited.map((l) => l.replace(/;$/, '')).join(', ')}]);`, ...lines.filter((l) => l.includes('.spin('))], label };
    return { code: lines.map((l) => (l.includes('.spin(') ? l : `await ${l}`)), label };
  },

  // jump / hop
  (p) => {
    if (!/^(jump|hop|leap|bounce)\b/.test(p)) return null;
    const power = /\b(high|big|super)\b/.test(p) ? 9 : /\b(little|small)\b/.test(p) ? 3 : 5;
    const n = timesIn(p);
    return n > 1
      ? { code: [`for (let i = 0; i < ${n}; i++) { jump(${power}); await wait(0.8); }`], label: `jump ${n} times` }
      : { code: [`jump(${power});`], label: `jump${power > 5 ? ' high' : ''}` };
  },

  // turn / spin around (whole model)
  (p, ctx) => {
    const m = p.match(/^(turn|spin|rotate|steer)\s*(around|left|right|in a circle|a full circle|\d+|$)/);
    if (!m) return null;
    let deg = degIn(p);
    const dir = /\bright\b/.test(p) ? -1 : 1;
    if (/around|circle/.test(p)) deg = deg ?? (m[1] === 'spin' || /circle/.test(p) ? 360 : 180);
    if (deg != null) deg *= timesIn(p);
    if (ctx.continuous && deg == null) {
      const rate = (speedIn(p) ?? 7) * 12 * dir;
      return { code: [`steer(${rate});`], label: `turn ${dir > 0 ? 'left' : 'right'}`, continuous: ['steer(0);'] };
    }
    deg = (deg ?? 90) * dir;
    return { code: [`await turn(${deg});`], label: `turn ${dir > 0 ? 'left' : 'right'} ${Math.abs(deg)}°` };
  },

  // drive / move
  (p, ctx) => {
    const m = p.match(/^(go|drive|move|walk|roll|run|zoom|back up|reverse|glide|race|scoot|charge)\b/);
    if (!m) return null;
    const back = /\b(back|backwards?|reverse|back up)\b/.test(p);
    const dist = num((p.match(/(\d+(\.\d+)?)\s*(studs?|steps?|spaces?|blocks?)?/) || [])[1]);
    const sp = speedIn(p) ?? (/zoom|race|run|charge/.test(m[1]) ? 14 : 7);
    const dirWord = back ? 'backward' : 'forward';
    if (dist != null) return { code: [`await move(${back ? -dist : dist}, ${sp});`], label: `${m[1] === 'back up' ? 'back up' : 'go ' + dirWord} ${dist} studs` };
    if (ctx.continuous || ctx.trigger === 'start' || ctx.trigger === 'message') {
      return { code: [`drive(${back ? -sp : sp});`], label: `${back ? 'drive backward' : 'drive forward'}${sp > 7 ? ' fast' : sp < 7 ? ' slowly' : ''}`, continuous: ['drive(0);'] };
    }
    return { code: [`await move(${back ? -5 : 5}, ${sp});`], label: `go ${dirWord} a little` };
  },

  // color changes
  (p) => {
    const m = p.match(/^(turn|change( color)?( to)?|become|go|paint( itself)?)\s+(\w+)$/) || p.match(/^change (its |your )?colou?r to (\w+)/);
    const c = m && colorIn(m[m.length - 1]);
    if (!c && !/random colou?r/.test(p)) return null;
    return c ? { code: [`color(${q(c)});`], label: `turn ${c}` } : { code: ['color("random");'], label: 'turn a random color' };
  },

  // push
  (p) => (/^(push|shove|knock)\b/.test(p) && !findTarget(p) ? { code: ['push("forward", 6);'], label: 'push forward' } : null),
];

// ---- triggers ----------------------------------------------------------------

function parseTrigger(s) {
  let m;
  if ((m = s.match(/^(when|whenever|if)\s+(i\s+|you\s+)?(press|hit|push|tap)(es)?\s+(the\s+)?(.+?)( key)?\s*(,|then|$)/))) {
    const k = parseKey(m[6]);
    if (k) return { type: 'key', key: k, rest: s.slice(m[0].length) };
  }
  if ((m = s.match(/^(while|when|whenever)\s+(i\s+|you\s+)?(hold|holding|keep pressing)( down)?\s+(the\s+)?(.+?)( key)?\s*(,|then|$)/))) {
    const k = parseKey(m[6]);
    if (k) return { type: 'key', key: k, rest: s.slice(m[0].length) };
  }
  if ((m = s.match(/^(when|whenever)\s+(i\s+|you\s+)?(let go of|release)\s+(the\s+)?(.+?)( key)?\s*(,|then|$)/))) {
    const k = parseKey(m[5]);
    if (k) return { type: 'keyup', key: k, rest: s.slice(m[0].length) };
  }
  if ((m = s.match(/^(when|whenever|if)\s+(it|you|the \w+|i)?\s*(touches|touch|bumps into|bump into|bumps|bump|hits|hit|crashes into|crash into|crashes|crash|runs into|run into|runs|run)( into)?\s*(.*?)\s*(,|then|$)/))) {
    if (m[2] !== 'i') {
      // "when the hero touches it": the subject is what does the touching
      const subj = m[2] && /^the /.test(m[2]) && /^(it|me|this|you)?$/.test(m[5].trim()) ? m[2] : m[5];
      return { type: 'touch', filter: touchFilter(subj), rest: s.slice(m[0].length) };
    }
  }
  if ((m = s.match(/^(when|whenever|if)\s+(it|you)\s+(sees?|spots?)\s+(.*?)\s*(,|then|$)/))) {
    return { type: 'see', filter: touchFilter(m[4]), rest: s.slice(m[0].length) };
  }
  if ((m = s.match(/^(when|whenever)\s+(i\s+|you\s+|someone\s+)?(click|clicks|tap|taps)( on)?( it| me| this)?\s*(,|then|$)/))) {
    return { type: 'click', rest: s.slice(m[0].length) };
  }
  if ((m = s.match(/^(when|whenever)\s+(it\s+|you\s+)?(hears?|gets?|receives?)\s+(the\s+)?(message\s+)?["“]?([\w ]+?)["”]?\s*(,|then|$)/))) {
    return { type: 'message', name: m[6].trim(), rest: s.slice(m[0].length) };
  }
  if ((m = s.match(/^(when|at)\s+(the\s+)?(start|game starts|beginning|it starts|go|begin)\s*(,|then|$)|^(first|to start|at first)\s*(,|$)/))) {
    return { type: 'start', rest: s.slice(m[0].length) };
  }
  if ((m = s.match(/^(forever|always|keep|repeat forever|over and over)\s*(,|:)?\s*/))) {
    return { type: 'forever', rest: s.slice(m[0].length) };
  }
  if ((m = s.match(/^every\s+(\d+(\.\d+)?|a|one|two|three|five|ten)?\s*(seconds?|secs?)\s*(,|$)?/))) {
    return { type: 'every', seconds: num(m[1]) ?? 1, rest: s.slice(m[0].length) };
  }
  return { type: 'start', rest: s, implicit: true };
}

function splitActions(rest) {
  return rest
    .split(/\s*(?:,|;|\band then\b|\bthen\b|\band also\b|\band\b|\bafter that\b)\s*/)
    .map((x) => x.trim().replace(/^(it |you |and |to |should |will |then |please |the model |he |she |they )+/g, '').replace(/^(\w+?)s\b(?= )/, (w, v) => (['say', 'spin', 'turn', 'drive', 'wave', 'jump', 'go', 'move'].includes(v) ? v : w)))
    .filter(Boolean);
}

function parseActions(rest, ctx) {
  const out = [];
  const unknown = [];
  for (const raw of splitActions(rest)) {
    const p = raw.toLowerCase();
    let res = null;
    for (const h of ACTIONS) { res = h(p, { ...ctx, raw }); if (res) break; }
    if (res) out.push(res); else unknown.push(stripChips(raw));
  }
  return { actions: out, unknown };
}

const indent = (lines, n = 1) => lines.map((l) => '  '.repeat(n) + l);

export function compileLocal(text, model) {
  // Hide punctuation inside chips so it doesn't split sentences or actions,
  // and set quoted words aside ("Hi, friend!") so they come back untouched.
  text = text.replace(/\{[^}]*\}/g, (m) => m.replace(/,/g, '\u0001').replace(/\./g, '\u0002'));
  const quotes = [];
  text = text.replace(/["“]([^"”]*)["”]/g, (_, inner) => `"Q${quotes.push(inner) - 1}Q"`);
  const unquote = (s, inCode) => s.replace(/Q(\d+)Q/gi, (_, i) => (inCode ? JSON.stringify(quotes[i]).slice(1, -1) : quotes[i]));
  const sentences = text
    .replace(/\n+/g, '. ')
    .split(/(?<=[.!?])\s+|\.\s*$/)
    .map((s) => s.trim().replace(/[.!?]+$/, ''))
    .filter(Boolean);
  const code = [];
  const summary = [];
  const unknown = [];
  for (const sentence of sentences) {
    const lower = sentence.replace(/^(and|also|so|then)\s+/i, '');
    const trig = parseTrigger(lower.toLowerCase().replace(/\{[^}]*\}/g, (m) => m)); // keep chips
    // recover original-case rest (for say "...") from the original sentence
    const restRaw = lower.slice(lower.length - trig.rest.length);
    const continuous = trig.type === 'key';
    const { actions, unknown: unk } = parseActions(restRaw, { model, continuous, trigger: trig.type });
    unknown.push(...unk);
    if (!actions.length) continue;
    const body = actions.flatMap((a) => a.code);
    const labels = actions.map((a) => a.label).join(', then ');
    const loops = actions.some((a) => a.loops);

    switch (trig.type) {
      case 'key': {
        const label = KEY_LABEL[trig.key] ?? trig.key;
        const stops = actions.flatMap((a) => a.continuous ?? []);
        code.push(`onKey(${q(trig.key)}, async () => {`, ...indent(body), '});');
        if (stops.length) {
          code.push(`onKeyUp(${q(trig.key)}, () => {`, ...indent([...new Set(stops)]), '});');
          summary.push(`While ${label} is held: ${labels}`);
        } else summary.push(`When ${label} is pressed: ${labels}`);
        break;
      }
      case 'keyup':
        code.push(`onKeyUp(${q(trig.key)}, async () => {`, ...indent(body), '});');
        summary.push(`When ${KEY_LABEL[trig.key] ?? trig.key} is let go: ${labels}`);
        break;
      case 'touch':
        code.push(`onTouch(${trig.filter.code}, async (thing) => {`, ...indent(body), '});');
        summary.push(`When it bumps ${trig.filter.label}: ${labels}`);
        break;
      case 'see':
        code.push('forever(async () => {', '  const seen = await look(15);',
          `  if (seen && is(seen, ${trig.filter.code})) {`,
          ...indent(body, 2), '  }', '});');
        summary.push(`Whenever it sees ${trig.filter.label} ahead: ${labels}`);
        break;
      case 'click':
        code.push('onClick(async () => {', ...indent(body), '});');
        summary.push(`When you click it: ${labels}`);
        break;
      case 'message':
        code.push(`onMessage(${q(trig.name)}, async () => {`, ...indent(body), '});');
        summary.push(`When it hears "${trig.name}": ${labels}`);
        break;
      case 'forever':
        code.push('forever(async () => {', ...indent(body), '});');
        summary.push(`Forever: ${labels}`);
        break;
      case 'every':
        code.push(`every(${trig.seconds}, async () => {`, ...indent(body), '});');
        summary.push(`Every ${trig.seconds} second${trig.seconds === 1 ? '' : 's'}: ${labels}`);
        break;
      default:
        if (loops) {
          code.push('forever(async () => {', ...indent(body), '});');
          summary.push(`Forever: ${labels}`);
        } else {
          code.push('onStart(async () => {', ...indent(body), '});');
          summary.push(`At the start: ${labels}`);
        }
    }
  }
  return { code: unquote(code.join('\n'), true), summary: summary.map((x) => unquote(x)), unknown: unknown.map((x) => unquote(x)), source: 'offline' };
}

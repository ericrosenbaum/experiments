// The key pad: an on-screen button for every key the selected thing's
// behaviors listen to. Arrows sit in an inverted T, letters keep their places
// on a keyboard (w above s, a left of d), and space is a wide bar. Each group
// has a short label above it: "move", "up and down", "sword".
import { parse } from 'acorn';

const ARROWS = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
const CAPS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'space', Enter: 'enter' };
const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const ROW_SHIFT = [0, 0.5, 0.75, 1.25]; // how far each keyboard row is pushed right
const OPPOSITES = [['up', 'down'], ['left', 'right'], ['forward', 'back'], ['open', 'close'], ['raise', 'lower'], ['faster', 'slower']];
const KEY_EVENTS = new Set(['onKey', 'onKeyUp', 'whileKey']);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// What each key does in a program, read from its code: {key: label}. The most
// telling call wins (moving or swinging a part beats playing a sound or talking).
export function keyLabels(code) {
  let ast;
  try { ast = parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true }); } catch { return {}; }
  const best = new Map(); // key -> [rank, label]
  const consider = (key, rank, label) => { if (label && (!best.has(key) || rank < best.get(key)[0])) best.set(key, [rank, label]); };
  walk(ast, (n) => {
    if (n.type !== 'CallExpression' || !KEY_EVENTS.has(n.callee.name) || n.arguments[0]?.type !== 'Literal') return;
    const key = normKey(n.arguments[0].value);
    walk(n.arguments[1], (c) => { if (c.type === 'CallExpression') { const [rank, label] = callLabel(c); consider(key, rank, label); } });
  });
  return Object.fromEntries([...best].map(([k, [, label]]) => [k, label]));
}

function callLabel(c) {
  const num = (a) => (a?.type === 'Literal' ? a.value : a?.type === 'UnaryExpression' && a.operator === '-' && a.argument.type === 'Literal' ? -a.argument.value : null);
  const name = c.callee.type === 'Identifier' ? c.callee.name : null;
  if (c.callee.type === 'MemberExpression' && c.callee.object.callee?.name === 'part') {
    const part = String(c.callee.object.arguments[0]?.value ?? 'part');
    const method = c.callee.property.name;
    if (method === 'spin' && num(c.arguments[0]) === 0) return [9];
    const short = part.replace(/\s+arm$/, '');
    if (/^(left|right|left arm|right arm)$/.test(short)) return [1, { wiggle: 'wave', turnTo: 'swing', spin: 'spin', color: 'color' }[method]];
    return [1, short];
  }
  const first = num(c.arguments[0]);
  switch (name) {
    case 'drive': case 'move': return first === 0 ? [9] : [1, 'move'];
    case 'speedUp': return [1, 'faster'];
    case 'slowDown': return [1, 'slower'];
    case 'stop': return [1, 'stop'];
    case 'steer': case 'turn': return first === 0 ? [9] : [1, 'turn'];
    case 'rise': return first === 0 ? [9] : [1, first < 0 ? 'down' : 'up'];
    case 'jump': case 'push': return [1, name];
    case 'spawn': {
      const props = c.arguments[0]?.properties ?? [];
      if (props.some((p) => p.key?.name === 'launch')) return [2, 'shoot'];
      return [2, props.some((p) => p.key?.name === 'shape' && p.value?.value === 'flower') ? 'flower' : 'brick'];
    }
    case 'clone': return [2, 'copy'];
    case 'goTo': case 'teleport': case 'face': return [2, 'go'];
    case 'color': return [2, 'color'];
    case 'gravity': return [2, 'gravity'];
    case 'remove': return [2, 'vanish'];
    case 'explode': return [1, 'explode'];
    case 'see': return [2, 'look'];
    case 'penDown': case 'penUp': return [2, 'pen'];
    case 'penColor': return [2, 'color'];
    case 'clearDrawing': return [2, 'erase'];
    case 'broadcast': return [3, String(c.arguments[0]?.value ?? 'message')];
    case 'play': return [4, String(c.arguments[0]?.value ?? 'sound')];
    case 'say': return [5, 'talk'];
    default:
      if (name && !['wait', 'log', 'random', 'thing', 'place', 'is', 'isClone', 'look', 'nearest', 'touching', 'position'].includes(name)) {
        return [3, name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()]; // startHole → "start hole"
      }
      return [9];
  }
}

function walk(n, fn) {
  if (!n || typeof n.type !== 'string') return;
  fn(n);
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) v.forEach((x) => walk(x, fn));
    else if (v && typeof v.type === 'string') walk(v, fn);
  }
}

const normKey = (k) => {
  const s = String(k);
  if (s === ' ') return ' ';
  const map = { space: ' ', spacebar: ' ', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', enter: 'Enter' };
  return map[s.trim().toLowerCase()] ?? (s.trim().length === 1 ? s.trim().toLowerCase() : s.trim());
};

// Group the keys and pick a label for each group.
export function padGroups(labels) {
  const groups = [];
  const arrows = ARROWS.filter((k) => labels[k]);
  if (arrows.length) {
    const vertical = [...new Set(['ArrowUp', 'ArrowDown'].filter((k) => labels[k]).map((k) => labels[k]))];
    const sideways = [...new Set(['ArrowLeft', 'ArrowRight'].filter((k) => labels[k]).map((k) => labels[k]))];
    const all = [...new Set([...vertical, ...sideways])];
    let label = all.join(' · ');
    if (all.length === 1) label = all[0];
    else if (vertical.join() === 'move' && sideways.join() === 'turn') label = 'move';
    else if (pairName(vertical)) label = [pairName(vertical), ...sideways].join(' · ');
    groups.push({ kind: 'arrows', keys: arrows, label });
  }
  // Letters and others: keys with the same label share a group; opposite
  // labels ("up", "down") join into one ("up and down").
  const byLabel = new Map();
  for (const [k, l] of Object.entries(labels)) {
    if (ARROWS.includes(k) || k === ' ') continue;
    if (!byLabel.has(l)) byLabel.set(l, []);
    byLabel.get(l).push(k);
  }
  for (const [a, b] of OPPOSITES) {
    if (byLabel.has(a) && byLabel.has(b)) { byLabel.set(`${a} and ${b}`, [...byLabel.get(a), ...byLabel.get(b)]); byLabel.delete(a); byLabel.delete(b); }
  }
  const letters = [...byLabel].map(([label, keys]) => ({ kind: 'letters', keys, label: { up: 'fly up', down: 'fly down' }[label] ?? label }));
  letters.sort((x, y) => Math.min(...x.keys.map(order)) - Math.min(...y.keys.map(order)));
  groups.push(...letters);
  if (labels[' ']) groups.push({ kind: 'space', keys: [' '], label: { up: 'fly up', down: 'fly down' }[labels[' ']] ?? labels[' '] });
  return groups;
}
const pairName = (ls) => (ls.length === 2 && OPPOSITES.some(([a, b]) => ls.includes(a) && ls.includes(b)) ? `${ls.includes('up') ? 'up and down' : ls.join(' and ')}` : null);
const order = (k) => { const r = ROWS.findIndex((row) => row.includes(k)); return r < 0 ? 999 : r * 20 + ROWS[r].indexOf(k); };

// HTML for the pad. Letters are placed on a half-key grid by where they sit
// on a real keyboard, so w lands above s and a left of d.
export function padHtml(groups) {
  return groups.map((g) => {
    let keys;
    if (g.kind === 'arrows') {
      const area = { ArrowUp: '1 / 2', ArrowLeft: '2 / 1', ArrowDown: '2 / 2', ArrowRight: '2 / 3' };
      const top = g.keys.includes('ArrowUp');
      keys = `<div class="pad-keys">${g.keys.map((k) => {
        const [r, c] = area[k].split(' / ').map(Number);
        return keyBtn(k, `grid-row:${top ? r : r - 1};grid-column:${c}`);
      }).join('')}</div>`;
    } else if (g.kind === 'space') {
      keys = `<div class="pad-keys space">${keyBtn(' ', '')}</div>`;
    } else {
      const spots = g.keys.map((k) => {
        const r = ROWS.findIndex((row) => row.includes(k));
        return r < 0 ? { k, r: 0, c: 0 } : { k, r, c: Math.round((ROW_SHIFT[r] + ROWS[r].indexOf(k)) * 2) };
      });
      const r0 = Math.min(...spots.map((s) => s.r));
      const c0 = Math.min(...spots.map((s) => s.c));
      keys = `<div class="pad-keys half">${spots.map((s) => keyBtn(s.k, `grid-row:${s.r - r0 + 1};grid-column:${s.c - c0 + 1} / span 2`)).join('')}</div>`;
    }
    return `<div class="pad-group"><div class="pad-label">${esc(g.label)}</div>${keys}</div>`;
  }).join('');
}
const keyBtn = (k, style) => `<button class="pad-key" data-key="${esc(k)}" style="${style}" title="Same as pressing ${esc(CAPS[k] ?? k)}">${esc(CAPS[k] ?? k.toUpperCase())}</button>`;

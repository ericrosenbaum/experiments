// The blocks lexicon: every block a behavior program can be drawn with, as
// plain data. src/blocks/fromcode.js reads it to turn JavaScript into blocks,
// src/blocks/blockly.js turns it into Blockly block types and the code
// generator, and the palette lists it by category.
//
// Each block: [type, category, wording, options]
//   wording   words with {NAME} slots; each slot is an input (or a field)
//   fn        the primitive it calls: fn(args...) in the order of `params`
//   part      a part method instead: part(P).method(args...)
//   params    the slots that are the call's arguments, in order
//   slots     {NAME: [kind, default]}: what goes in each slot (see SLOT_KINDS)
//   shape     'stmt' (default), 'reporter', 'boolean', 'hat', 'c', 'cap'
//   wait      the primitive takes time; awaited unless the block says "and keep going"
//   awaits    a reporter whose value comes back later (always awaited)
//   special   a block with its own code (loops, operators, variables...), see blockly.js
// Every event also comes as a C-shaped block (type + "_in") for registering it
// inside another script, and every menu kind as a shadow block "bb_m_" + kind.
// Defaults are the sandbox's own defaults (sandbox.worker.js), so a slot left
// out of the code shows the value that is actually used.
import { COLORS, SOUNDS } from '../behavior/primitives.js';

export const CATEGORIES = [
  ['event', 'Events', '#ffbf00'],
  ['motion', 'Motion', '#4c97ff'],
  ['parts', 'Parts', '#0fbd8c'],
  ['looks', 'Looks', '#9966ff'],
  ['sound', 'Sound', '#cf63cf'],
  ['pen', 'Pen', '#0fbd8c'],
  ['world', 'World', '#e6533c'],
  ['control', 'Control', '#ffab19'],
  ['sensing', 'Sensing', '#5cb1d6'],
  ['operator', 'Operators', '#59c059'],
  ['variable', 'Variables', '#ff8c1a'],
  ['list', 'Lists', '#ff661a'],
  ['custom', 'My Blocks', '#ff6680'],
  ['other', 'Other', '#8a8f99'],
];

export const COLOR_HEX = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]));
export const KEYS = [
  [' ', 'space'], ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowLeft', '←'], ['ArrowRight', '→'], ['Enter', 'enter'],
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split('').map((k) => [k, k]),
];
const KINDS = ['tree', 'house', 'brick', 'model', 'ball'];

// What can be picked from a slot's menu. The value is the JavaScript itself
// ("\"red\"", "null", "thing(\"tower\")"), so a menu block's code is its value.
// ctx: {parts: [names], things: [{id, name, kind}], messages: [names]}
const q = (s) => JSON.stringify(s);
const thingOptions = (ctx) => (ctx.things ?? []).map((t) => [t.name, `thing(${q(t.id)})`]);
const kindOptions = (ctx, label) => {
  const kinds = [...new Set([...KINDS, ...(ctx.things ?? []).map((t) => t.kind).filter(Boolean)])];
  return kinds.filter((k) => k !== 'ground' && k !== 'world').map((k) => [label(k), q(k)]);
};
export const MENUS = {
  color: { def: '"red"', options: () => [...Object.keys(COLORS).map((c) => [c, q(c)]), ['random', '"random"']] },
  sound: { def: '"pop"', options: () => SOUNDS.map((s) => [s, q(s)]) },
  part: { def: '"arm"', options: (ctx) => (ctx.parts?.length ? ctx.parts : ['arm']).map((p) => [p, q(p)]) },
  target: { def: '"tree"', options: (ctx) => [...thingOptions(ctx), ...kindOptions(ctx, (k) => `nearest ${k}`)] },
  copy: { def: 'null', options: (ctx) => [['myself', 'null'], ...thingOptions(ctx), ...kindOptions(ctx, (k) => `nearest ${k}`)] },
  where: { def: 'null', options: () => [['beside me', 'null'], ...['front', 'back', 'left', 'right', 'above'].map((w) => [w, q(w)])] },
  filter: {
    def: 'null',
    options: (ctx) => [['anything', 'null'], ...kindOptions(ctx, (k) => k), ...Object.keys(COLORS).map((c) => [c, q(c)]), ...thingOptions(ctx)],
  },
  dir: { def: '"forward"', options: () => ['forward', 'backward', 'left', 'right', 'up'].map((d) => [d, q(d)]) },
  msg: { def: '"go"', options: (ctx) => [...new Set(['go', ...(ctx.messages ?? [])])].filter((m) => !m.endsWith('…')).map((m) => [m, q(m)]) },
  size: { def: '"2x2"', options: () => ['1x1', '2x2', '2x4', '1x4', '4x4'].map((s) => [s, q(s)]) },
  at: { def: '"front"', options: () => ['front', 'back', 'top', 'here'].map((s) => [s, q(s)]) },
  shape: { def: '"brick"', options: () => ['brick', 'flower'].map((s) => [s, q(s)]) },
};

// The label a menu shows for a value that isn't one of its options (a name
// the code made up, a thing from another world...).
export function menuLabel(kind, code, ctx = {}) {
  const opt = MENUS[kind]?.options(ctx).find(([, v]) => v === code);
  if (opt) return opt[0];
  const m = /^thing\(("(?:[^"\\]|\\.)*")\)$/.exec(code);
  if (m) {
    const id = JSON.parse(m[1]);
    return (ctx.things ?? []).find((t) => t.id === id)?.name ?? id.replace(/[-_]/g, ' ');
  }
  if (code === 'null') return kind === 'copy' ? 'myself' : kind === 'where' ? 'beside me' : 'anything';
  try {
    const v = JSON.parse(code);
    if (typeof v === 'string') return kind === 'target' || kind === 'copy' ? `nearest ${v}` : v;
  } catch { /* an object filter like {color: "red", kind: "brick"} */ }
  if (/^\{.*\}$/.test(code)) return code.slice(1, -1).replace(/\w+:\s*/g, '').replace(/[",]/g, '').replace(/\s+/g, ' ').trim();
  return code;
}

// Slot kinds: 'num' and 'text' are typed-in values, the MENUS keys are
// dropdowns, 'bool' is a hexagonal slot for a condition, 'any' takes any
// reporter. Fields (not inputs): 'key', 'name' (a variable or loop name).
const n = (d) => ['num', d];
const t = (d) => ['text', d];
const m = (kind, d) => [kind, d ?? MENUS[kind].def];

export const BLOCKS = [
  // events
  ['bb_onStart', 'event', 'when it starts', { fn: 'onStart', shape: 'hat' }],
  ['bb_onKey', 'event', 'when {KEY} key pressed', { fn: 'onKey', params: ['KEY'], slots: { KEY: ['key', ' '] }, shape: 'hat' }],
  ['bb_onKeyUp', 'event', 'when {KEY} key let go', { fn: 'onKeyUp', params: ['KEY'], slots: { KEY: ['key', ' '] }, shape: 'hat' }],
  ['bb_whileKey', 'event', 'while {KEY} key is held', { fn: 'whileKey', params: ['KEY'], slots: { KEY: ['key', 'ArrowUp'] }, shape: 'hat' }],
  ['bb_onTouch', 'event', 'when it bumps {F}', { fn: 'onTouch', params: ['F'], slots: { F: m('filter') }, shape: 'hat' }],
  ['bb_onMessage', 'event', 'when I hear {M}', { fn: 'onMessage', params: ['M'], slots: { M: m('msg') }, shape: 'hat' }],
  ['bb_onClone', 'event', 'when I start as a copy', { fn: 'onClone', shape: 'hat' }],
  ['bb_every', 'event', 'every {N} seconds', { fn: 'every', params: ['N'], slots: { N: n(1) }, shape: 'hat' }],
  ['bb_broadcast', 'event', 'tell everyone {M}', { fn: 'broadcast', params: ['M'], slots: { M: m('msg') } }],

  // motion
  ['bb_drive', 'motion', 'drive at speed {N}', { fn: 'drive', params: ['N'], slots: { N: n(7) } }],
  ['bb_steer', 'motion', 'keep turning at speed {N}', { fn: 'steer', params: ['N'], slots: { N: n(60) } }],
  ['bb_rise', 'motion', 'rise at speed {N}', { fn: 'rise', params: ['N'], slots: { N: n(5) } }],
  ['bb_speedUp', 'motion', 'speed up by {N}', { fn: 'speedUp', params: ['N'], slots: { N: n(3) } }],
  ['bb_slowDown', 'motion', 'slow down by {N}', { fn: 'slowDown', params: ['N'], slots: { N: n(3) } }],
  ['bb_stop', 'motion', 'stop moving', { fn: 'stop' }],
  ['bb_jump', 'motion', 'jump with power {N}', { fn: 'jump', params: ['N'], slots: { N: n(5) } }],
  ['bb_push', 'motion', 'push {D} with power {N}', { fn: 'push', params: ['D', 'N'], slots: { D: m('dir'), N: n(5) } }],
  ['bb_move', 'motion', 'move {N} studs at speed {S}', { fn: 'move', params: ['N', 'S'], slots: { N: n(5), S: n(7) }, wait: true }],
  ['bb_turn', 'motion', 'turn {N} degrees', { fn: 'turn', params: ['N'], slots: { N: n(90) }, wait: true }],
  ['bb_goTo', 'motion', 'go to {T} at speed {S}', { fn: 'goTo', params: ['T', 'S'], slots: { T: m('target'), S: n(7) }, wait: true }],
  ['bb_face', 'motion', 'face {T}', { fn: 'face', params: ['T'], slots: { T: m('target') }, wait: true }],
  ['bb_teleport', 'motion', 'teleport to {T}', { fn: 'teleport', params: ['T'], slots: { T: m('target') }, wait: true }],
  ['bb_place', 'motion', 'spot {X} , {Z}', { fn: 'place', params: ['X', 'Z'], slots: { X: n(0), Z: n(0) }, shape: 'reporter' }],

  // parts
  ['bb_spin', 'parts', 'spin {P} at speed {N}', { part: 'spin', params: ['N'], slots: { P: m('part'), N: n(180) } }],
  ['bb_turnTo', 'parts', 'swing {P} to {N} degrees', { part: 'turnTo', params: ['N'], slots: { P: m('part'), N: n(45) }, wait: true }],
  ['bb_slideTo', 'parts', 'slide {P} to {N}', { part: 'slideTo', params: ['N'], slots: { P: m('part'), N: n(1) }, wait: true }],
  ['bb_wiggle', 'parts', 'wiggle {P} {N} times', { part: 'wiggle', params: ['N'], slots: { P: m('part'), N: n(3) }, wait: true }],
  ['bb_partColor', 'parts', 'color {P} {C}', { part: 'color', params: ['C'], slots: { P: m('part'), C: m('color') } }],

  // looks
  ['bb_color', 'looks', 'change color to {C}', { fn: 'color', params: ['C'], slots: { C: m('color') } }],
  ['bb_say', 'looks', 'say {T} for {N} seconds', { fn: 'say', params: ['T', 'N'], slots: { T: t('Hello!'), N: n(2) } }],
  ['bb_show', 'looks', 'show {T} on my screen', { fn: 'show', params: ['T'], slots: { T: t('') } }],
  ['bb_explode', 'looks', 'explode with power {N}', { fn: 'explode', params: ['N'], slots: { N: n(5) } }],

  // sound
  ['bb_play', 'sound', 'play sound {S}', { fn: 'play', params: ['S'], slots: { S: m('sound') } }],

  // pen
  ['bb_penDown', 'pen', 'pen down', { fn: 'penDown' }],
  ['bb_penUp', 'pen', 'pen up', { fn: 'penUp' }],
  ['bb_penColor', 'pen', 'set pen color to {C}', { fn: 'penColor', params: ['C'], slots: { C: m('color') } }],
  ['bb_penSize', 'pen', 'set pen size to {N}', { fn: 'penSize', params: ['N'], slots: { N: n(3) } }],
  ['bb_clearDrawing', 'pen', 'erase all', { fn: 'clearDrawing' }],

  // world
  ['bb_spawn', 'world', 'make a brick', { fn: 'spawn', special: 'spawn' }],
  ['bb_clone', 'world', 'make a copy of {W} at {P}', { fn: 'clone', params: ['W', 'P'], slots: { W: m('copy'), P: m('where') }, wait: true }],
  ['bb_cloneR', 'world', 'new copy of {W} at {P}', { fn: 'clone', params: ['W', 'P'], slots: { W: m('copy'), P: m('where') }, shape: 'reporter', awaits: true }],
  ['bb_remove', 'world', 'disappear', { fn: 'remove' }],
  ['bb_gravity', 'world', 'set gravity to {N}', { fn: 'gravity', params: ['N'], slots: { N: n(1) } }],

  // control
  ['bb_wait', 'control', 'wait {N} seconds', { fn: 'wait', params: ['N'], slots: { N: n(1) }, wait: true }],
  ['bb_forever', 'control', 'forever', { special: 'forever', shape: 'c' }],
  ['bb_repeat', 'control', 'repeat {N} times', { special: 'repeat', slots: { N: n(10) }, shape: 'c' }],
  ['bb_while', 'control', 'repeat while {C}', { special: 'while', slots: { C: ['bool'] }, shape: 'c' }],
  ['bb_forEach', 'control', 'for each {V} in {L}', { special: 'forEach', slots: { V: ['name', 'item'], L: ['any'] }, shape: 'c' }],
  ['bb_if', 'control', 'if {C} then', { special: 'if', slots: { C: ['bool'] }, shape: 'c' }],
  ['bb_ifElse', 'control', 'if {C} then', { special: 'ifElse', slots: { C: ['bool'] }, shape: 'c' }],
  ['bb_together', 'control', 'at the same time', { special: 'together', shape: 'c' }],
  ['bb_return', 'control', 'stop this script', { special: 'return', shape: 'cap' }],
  ['bb_break', 'control', 'stop repeating', { special: 'break', shape: 'cap' }],
  ['bb_continue', 'control', 'skip to the next time around', { special: 'continue', shape: 'cap' }],
  ['bb_isClone', 'control', 'am I a copy?', { fn: 'isClone', shape: 'boolean' }],

  // sensing
  ['bb_look', 'sensing', 'thing ahead within {N}', { fn: 'look', params: ['N'], slots: { N: n(20) }, shape: 'reporter', awaits: true }],
  ['bb_nearest', 'sensing', 'nearest {F}', { fn: 'nearest', params: ['F'], slots: { F: m('filter') }, shape: 'reporter', awaits: true }],
  ['bb_touching', 'sensing', 'touching {F} ?', { fn: 'touching', params: ['F'], slots: { F: m('filter') }, shape: 'boolean', awaits: true }],
  ['bb_position', 'sensing', 'my position', { fn: 'position', shape: 'reporter', awaits: true }],
  ['bb_see', 'sensing', 'what I see, from {L}', { fn: 'see', params: ['L'], slots: { L: ['any'] }, shape: 'reporter', awaits: true }],
  ['bb_is', 'sensing', '{T} is {F} ?', { fn: 'is', params: ['T', 'F'], slots: { T: ['any'], F: m('filter') }, shape: 'boolean' }],
  ['bb_prop', 'sensing', '{P} of {O}', { special: 'prop', slots: { P: ['prop', 'distance'], O: ['any'] }, shape: 'reporter' }],
  ['bb_thing', 'sensing', 'thing named {ID}', { fn: 'thing', params: ['ID'], slots: { ID: t('') }, shape: 'reporter' }],
  ['bb_m_target', 'sensing', '{V}', { special: 'menu', menu: 'target', shape: 'reporter' }],

  // operators
  ['bb_arith', 'operator', '{A} {OP} {B}', { special: 'arith', slots: { A: n(1), OP: ['op'], B: n(1) }, shape: 'reporter' }],
  ['bb_compare', 'operator', '{A} {OP} {B}', { special: 'compare', slots: { A: ['any'], OP: ['op'], B: n(50) }, shape: 'boolean' }],
  ['bb_logic', 'operator', '{A} {OP} {B}', { special: 'logic', slots: { A: ['bool'], OP: ['op'], B: ['bool'] }, shape: 'boolean' }],
  ['bb_not', 'operator', 'not {A}', { special: 'not', slots: { A: ['bool'] }, shape: 'boolean' }],
  ['bb_random', 'operator', 'pick random {A} to {B}', { fn: 'random', params: ['A', 'B'], slots: { A: n(1), B: n(10) }, shape: 'reporter' }],
  ['bb_join', 'operator', 'join', { special: 'join', shape: 'reporter' }],
  ['bb_math', 'operator', '{F} of {A}', { special: 'math', slots: { F: ['fn'], A: n(10) }, shape: 'reporter' }],
  ['bb_minmax', 'operator', '{F} of {A} and {B}', { special: 'minmax', slots: { F: ['fn'], A: n(1), B: n(10) }, shape: 'reporter' }],
  ['bb_fraction', 'operator', 'random fraction', { special: 'fraction', shape: 'reporter' }],
  ['bb_length', 'operator', 'length of {A}', { special: 'length', slots: { A: t('apple') }, shape: 'reporter' }],
  ['bb_contains', 'operator', '{A} contains {B} ?', { special: 'contains', slots: { A: t('apple'), B: t('a') }, shape: 'boolean' }],
  ['bb_repeatText', 'operator', '{A} repeated {N} times', { special: 'repeatText', slots: { A: t('★'), N: n(3) }, shape: 'reporter' }],
  ['bb_ternary', 'operator', 'if {C} then {A} else {B}', { special: 'ternary', slots: { C: ['bool'], A: t('yes'), B: t('no') }, shape: 'reporter' }],
  ['bb_bool', 'operator', '{V}', { special: 'bool', slots: { V: ['tf'] }, shape: 'boolean' }],
  ['bb_null', 'operator', 'nothing', { special: 'null', shape: 'reporter' }],
  ['bb_num', 'operator', '{NUM}', { special: 'num', shape: 'reporter' }],
  ['bb_text', 'operator', '{TEXT}', { special: 'text', shape: 'reporter' }],

  // variables
  ['bb_varGet', 'variable', '{V}', { special: 'varGet', slots: { V: ['var', 'score'] }, shape: 'reporter' }],
  ['bb_varDeclare', 'variable', 'make variable {V} = {X}', { special: 'varDeclare', slots: { V: ['name', 'score'], X: n(0) } }],
  ['bb_varSet', 'variable', 'set {V} to {X}', { special: 'varSet', slots: { V: ['var', 'score'], X: n(0) } }],
  ['bb_varChange', 'variable', 'change {V} by {X}', { special: 'varChange', slots: { V: ['var', 'score'], X: n(1) } }],

  // lists
  ['bb_list', 'list', 'list', { special: 'list', shape: 'reporter' }],
  ['bb_item', 'list', 'item {I} of {L}', { special: 'item', slots: { I: n(0), L: ['any'] }, shape: 'reporter' }],

  // my blocks
  ['bb_define', 'custom', 'define', { special: 'define', shape: 'hat' }],
  ['bb_call', 'custom', '', { special: 'call' }],
  ['bb_callR', 'custom', '', { special: 'call', shape: 'reporter' }],
  ['bb_report', 'custom', 'report {V}', { special: 'report', slots: { V: ['any'] }, shape: 'cap' }],

  // other
  ['bb_log', 'other', 'log {T}', { fn: 'log', params: ['T'], slots: { T: t('hi') } }],
  ['bb_note', 'other', '{TEXT}', { special: 'note' }],
  ['bb_raw', 'other', '{CODE}', { special: 'raw' }],
  ['bb_rawR', 'other', '{CODE}', { special: 'raw', shape: 'reporter' }],
];

export const SPEC = Object.fromEntries(BLOCKS.map(([type, cat, msg, o]) => [type, { type, cat, msg, params: [], slots: {}, shape: 'stmt', ...o }]));

// A menu slot's shadow block for every menu kind.
for (const kind of Object.keys(MENUS)) {
  const type = `bb_m_${kind}`;
  SPEC[type] ??= { type, cat: 'other', msg: '{V}', params: [], slots: {}, special: 'menu', menu: kind, shape: 'reporter' };
}

const HAT_TYPES = Object.values(SPEC).filter((s) => s.shape === 'hat' && s.fn).map((s) => s.type);
// The same events registered inside another script (a loop, a function).
for (const type of HAT_TYPES) SPEC[`${type}_in`] = { ...SPEC[type], type: `${type}_in`, shape: 'c', inner: true };

export const BY_FN = {};
export const BY_PART = {};
for (const s of Object.values(SPEC)) {
  if (s.inner || s.special || s.type === 'bb_cloneR') continue;
  if (s.fn) BY_FN[s.fn] = s;
  if (s.part) BY_PART[s.part] = s;
}

export const OPS = {
  arith: [['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/'], ['mod', '%']],
  compare: [['=', '==='], ['≠', '!=='], ['<', '<'], ['>', '>'], ['≤', '<='], ['≥', '>='], ['=', '=='], ['≠', '!=']],
  logic: [['and', '&&'], ['or', '||']],
  math: [['round', 'round'], ['round down', 'floor'], ['round up', 'ceil'], ['size', 'abs'], ['square root', 'sqrt'], ['sin', 'sin'], ['cos', 'cos']],
  minmax: [['smaller', 'min'], ['bigger', 'max']],
  prop: ['distance', 'direction', 'name', 'kind', 'color', 'id', 'x', 'y', 'z', 'heading'].map((p) => [p, p]),
};

// Blockly for behavior programs: the block types (from lexicon.js), a theme
// in Scratch's colors, and the generator that writes a workspace back into
// JavaScript. Generated code marks where each statement block starts, so the
// page can light up running blocks and run a clicked script (see toCode).
import * as BlocklyNS from 'blockly/core';
import * as EnNS from 'blockly/msg/en';
import { SPEC, MENUS, OPS, KEYS, CATEGORIES, COLOR_HEX, menuLabel } from './lexicon.js';
import { shadowFor, unescText, escText } from './fromcode.js';

// Node (the tests) loads Blockly's CommonJS build, whose namespace has it all under default.
const unwrap = (ns) => Reflect.get(ns, 'default') ?? ns;
export const Blockly = unwrap(BlocklyNS);
Blockly.setLocale(unwrap(EnNS));

// Keys belong to the world: arrows, space and letters drive the selected
// thing even right after clicking its blocks, so Blockly keeps only its
// shortcuts that use Delete, Escape or Ctrl (delete, undo, copy, paste...),
// not its keyboard navigation (arrows, space, "c" to clean up, "d" to duplicate...).
const KEEP_SHORTCUTS = new Set(['escape', 'delete', 'copy', 'cut', 'paste', 'undo', 'redo', 'menu', 'show_tooltip']);
for (const name of Object.keys(Blockly.ShortcutRegistry.registry.getRegistry())) {
  if (!KEEP_SHORTCUTS.has(name)) Blockly.ShortcutRegistry.registry.unregister(name);
}

// Right-click menus: no inline/external inputs, collapsing, disabling, comments
// or clean up, which don't mean anything in the code.
for (const id of ['blockInline', 'blockCollapseExpand', 'blockDisable', 'blockComment', 'cleanWorkspace', 'collapseWorkspace', 'expandWorkspace']) {
  if (Blockly.ContextMenuRegistry.registry.getItem(id)) Blockly.ContextMenuRegistry.registry.unregister(id);
}

// What the menus offer: the selected thing's parts, the things in the world
// and the messages in use. The app keeps it up to date (setBlockContext).
export const blockContext = { parts: [], things: [], messages: [] };
export function setBlockContext(ctx) { Object.assign(blockContext, ctx); }

// ---- theme -------------------------------------------------------------------------
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const blockStyles = {};
for (const [key, , color] of CATEGORIES) {
  blockStyles[key] = { colourPrimary: color, colourSecondary: shade(color, 0.25), colourTertiary: shade(color, -0.2) };
  blockStyles[`${key}_hat`] = { ...blockStyles[key], hat: 'cap' };
  // menus inside a block: a shade darker than the block, like Scratch's
  blockStyles[`${key}_menu`] = { colourPrimary: shade(color, -0.12), colourSecondary: shade(color, -0.12), colourTertiary: shade(color, -0.3) };
}
for (const [name, hex] of Object.entries(COLOR_HEX)) blockStyles[`swatch_${name}`] = { colourPrimary: hex, colourSecondary: hex, colourTertiary: shade(hex, -0.3) };
blockStyles.note = { colourPrimary: '#fef3a0', colourSecondary: '#fef3a0', colourTertiary: '#d8c75a' };
blockStyles.raw = { colourPrimary: '#8a8f99', colourSecondary: '#a6aab2', colourTertiary: '#6b7079' };
export const theme = Blockly.Theme.defineTheme('bricks', {
  name: 'bricks',
  base: Blockly.Themes.Classic,
  blockStyles,
  categoryStyles: Object.fromEntries(CATEGORIES.map(([k, , c]) => [k, { colour: c }])),
  componentStyles: { workspaceBackgroundColour: 'transparent', flyoutBackgroundColour: '#f3f5f9', flyoutOpacity: 1, scrollbarColour: '#c5cad3', scrollbarOpacity: 0.6 },
  fontStyle: { family: "'Nunito', system-ui, sans-serif", weight: '700', size: 15 },
  startHats: false,
});

// ---- fields ------------------------------------------------------------------------
// A dropdown that keeps any value it's given, even one that isn't on its
// menu (a message another world uses, a part a model lost...).
export class FieldOpen extends Blockly.FieldDropdown {
  constructor(options, labelFor, validator) {
    super(typeof options === 'function' ? function () { return options.call(this); } : options, validator);
    this.labelFor = labelFor ?? ((v) => v);
  }
  getOptions(useCache) {
    const opts = [...super.getOptions(useCache)];
    const v = this.value_;
    if (v != null && v !== '' && !opts.some((o) => o[1] === v)) opts.push([this.labelFor(v), v]);
    return opts;
  }
  doClassValidation_(v) { return typeof v === 'string' ? v : v == null ? null : String(v); }
}
Blockly.fieldRegistry.register('field_open', FieldOpen);

const menuOptions = (kind) => function () {
  const opts = MENUS[kind].options(blockContext);
  return opts.length ? opts : [[menuLabel(kind, MENUS[kind].def, blockContext), MENUS[kind].def]];
};

// The variable names a block can see: made with "make variable", named by a
// hat or a loop, plus the one it already has.
function namesIn(block) {
  const names = new Set();
  const ws = block?.workspace;
  if (!ws) return [];
  for (const b of ws.getAllBlocks(false)) {
    if (b.type === 'bb_varDeclare' || b.type === 'bb_forEach') names.add(b.getFieldValue('V'));
    if (b.type === 'bb_repeat' && b.counter) names.add(b.counter);
    for (const p of b.params ?? []) names.add(p);
  }
  names.delete(null); names.delete('');
  return [...names].sort();
}
const varOptions = function () {
  const names = namesIn(this.getSourceBlock());
  return (names.length ? names : ['score']).map((n) => [n, n]);
};
const funcOptions = function () {
  const ws = this.getSourceBlock()?.workspace;
  const names = new Set(ws ? ws.getAllBlocks(false).filter((b) => b.type === 'bb_define').map((b) => b.getFieldValue('NAME')) : []);
  return (names.size ? [...names] : ['myBlock']).map((n) => [n, n]);
};
// Names typed into a block become JavaScript names: "my score" -> myScore.
const toIdentifier = (s) => {
  let id = String(s).trim().replace(/[^\p{L}\p{N}_$ ]/gu, '').replace(/ +(\p{L})/gu, (_, c) => c.toUpperCase()).replace(/ /g, '');
  if (!id) return null;
  if (/^\p{N}/u.test(id)) id = `_${id}`;
  if (RESERVED.has(id)) id = `${id}_`;
  return id;
};
const RESERVED = new Set('break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static await enum implements interface package private protected public arguments eval undefined NaN Infinity'.split(' '));

function slotField(kind, def, spec) {
  switch (kind) {
    case 'key': return new FieldOpen(KEYS.map(([v, label]) => [label, v]), (v) => v);
    case 'name': return new Blockly.FieldTextInput(def ?? 'item', toIdentifier);
    case 'var': return new FieldOpen(varOptions);
    case 'op': return new FieldOpen(OPS[spec.special], (v) => v);
    case 'fn': return new FieldOpen(OPS[spec.special], (v) => v);
    case 'prop': return new FieldOpen(OPS.prop, (v) => v);
    case 'tf': return new Blockly.FieldDropdown([['true', 'true'], ['false', 'false']]);
    default: return null;
  }
}
const FIELD_KINDS = new Set(['key', 'name', 'var', 'op', 'fn', 'prop', 'tf']);

// ---- block types -------------------------------------------------------------------
const WAIT_LABEL = 'and keep going';
const style = (spec) => (spec.cat === 'other' && spec.special === 'note' ? 'note' : spec.cat === 'other' && spec.special === 'raw' ? 'raw'
  : `${spec.cat}${spec.shape === 'hat' ? '_hat' : ''}`);

// Lay out a wording like "go to {T} at speed {S}": words become labels, and
// each slot an input or a field, in order.
function build(block, spec, msg = spec.msg) {
  let pending = [];
  const flushTo = (input) => { for (const [f, name] of pending) input.appendField(f, name); pending = []; };
  for (const tok of msg.split(/(\{\w+\})/).filter((x) => x.trim())) {
    const m = /^\{(\w+)\}$/.exec(tok);
    if (!m) { pending.push([tok.trim(), undefined]); continue; }
    const name = m[1];
    const [kind, def] = spec.slots[name] ?? [spec.special === 'menu' ? 'menu' : spec.special];
    if (FIELD_KINDS.has(kind)) { pending.push([slotField(kind, def, spec), name]); continue; }
    if (spec.special === 'menu') { pending.push([new FieldOpen(menuOptions(spec.menu), (v) => menuLabel(spec.menu, v, blockContext)), 'V']); continue; }
    if (spec.special === 'num') { pending.push([new Blockly.FieldNumber(0), 'NUM']); continue; }
    if (spec.special === 'text' || spec.special === 'note') { pending.push([new Blockly.FieldTextInput(''), 'TEXT']); continue; }
    if (spec.special === 'raw') { pending.push([new Blockly.FieldTextInput(''), 'CODE']); continue; }
    const input = block.appendValueInput(name);
    if (kind === 'bool') input.setCheck('Boolean');
    flushTo(input);
  }
  if (pending.length) flushTo(block.appendDummyInput('LABEL'));
}

function connections(block, spec) {
  const s = spec.shape;
  if (s === 'reporter') block.setOutput(true, null);
  else if (s === 'boolean') block.setOutput(true, 'Boolean');
  else if (s === 'hat') block.setNextStatement(true);
  else {
    block.setPreviousStatement(true);
    if (s !== 'cap' && spec.special !== 'forever') block.setNextStatement(true);
  }
  if (s === 'c') block.appendStatementInput('DO');
  if (spec.special === 'ifElse') {
    block.appendDummyInput('ELSE_LABEL').appendField('else');
    block.appendStatementInput('ELSE');
  }
}

// Shapes that change with the block's extra state.
const MUTATIONS = {
  // a primitive that takes time, run without waiting for it to finish
  wait: {
    saveExtraState() { return this.noWait ? { noWait: true } : null; },
    loadExtraState(s) { this.noWait = !!s?.noWait; this.updateShape_(); },
    updateShape_() {
      if (this.getInput('NOWAIT')) this.removeInput('NOWAIT');
      if (this.noWait) this.appendDummyInput('NOWAIT').appendField(new Blockly.FieldLabel(WAIT_LABEL, 'bb-nowait'));
    },
    customContextMenu(options) {
      if (this.isInFlyout || this.workspace.isReadOnly()) return;
      options.push({
        text: this.noWait ? 'Wait until it’s done' : 'Don’t wait for it (keep going)',
        enabled: true,
        callback: () => {
          const old = this.saveExtraState();
          this.loadExtraState({ noWait: !this.noWait });
          Blockly.Events.fire(new (Blockly.Events.get(Blockly.Events.BLOCK_CHANGE))(this, 'mutation', null, old, this.saveExtraState()));
        },
      });
    },
  },
  // the names a hat or a definition hands its script
  params: {
    saveExtraState() {
      const s = {};
      if (this.params?.length) s.params = this.params;
      if (this.type === 'bb_define') Object.assign(s, { ...(this.isAsync ? { async: true } : {}), style: this.defStyle ?? 'function' });
      return Object.keys(s).length ? s : null;
    },
    loadExtraState(s) {
      this.params = s?.params ?? [];
      this.isAsync = !!s?.async;
      this.defStyle = s?.style ?? 'function';
      if (this.type === 'bb_define' && s?.name) this.setFieldValue(s.name, 'NAME');
      this.updateShape_();
    },
    updateShape_() {
      if (this.getInput('PARAMS')) this.removeInput('PARAMS');
      if (!this.params.length) return;
      const input = this.appendDummyInput('PARAMS');
      if (this.type !== 'bb_define') input.appendField('with');
      for (const p of this.params) input.appendField(new Blockly.FieldLabel(p, 'bb-param'));
      if (this.getInput('DO')) this.moveInputBefore('PARAMS', 'DO');
    },
  },
  // join, list, and calls to the program's own functions: a slot per piece
  slots: {
    saveExtraState() {
      const s = { n: this.n };
      if (this.type === 'bb_call' || this.type === 'bb_callR') return { name: this.getFieldValue('NAME'), args: this.n, ...(this.noWait ? { noWait: true } : {}) };
      return s;
    },
    loadExtraState(s) {
      this.n = s?.n ?? s?.args ?? 0;
      this.noWait = !!s?.noWait;
      if (s?.name) this.setFieldValue(s.name, 'NAME');
      this.updateShape_();
    },
    updateShape_() {
      const prefix = this.type === 'bb_join' ? 'P' : this.type === 'bb_list' ? 'I' : 'A';
      let i = 0;
      while (this.getInput(`${prefix}${i}`)) {
        if (i >= this.n) this.removeInput(`${prefix}${i}`);
        i++;
      }
      for (let k = 0; k < this.n; k++) if (!this.getInput(`${prefix}${k}`)) this.appendValueInput(`${prefix}${k}`);
      if (this.getInput('NOWAIT')) this.removeInput('NOWAIT');
      if (this.type === 'bb_call' && this.noWait) this.appendDummyInput('NOWAIT').appendField(new Blockly.FieldLabel(WAIT_LABEL, 'bb-nowait'));
    },
    customContextMenu(options) {
      if (this.isInFlyout || this.workspace.isReadOnly() || this.type === 'bb_call' || this.type === 'bb_callR') return;
      const change = (n) => () => {
        const old = this.saveExtraState();
        this.loadExtraState({ n });
        const prefix = this.type === 'bb_join' ? 'P' : 'I';
        const input = this.getInput(`${prefix}${n - 1}`);
        if (input && !input.connection.targetBlock() && this.type === 'bb_join') {
          const sh = this.workspace.newBlock('bb_text');
          sh.setShadow(true);
          if (this.rendered) { sh.initSvg(); sh.render(); }
          input.connection.connect(sh.outputConnection);
        }
        Blockly.Events.fire(new (Blockly.Events.get(Blockly.Events.BLOCK_CHANGE))(this, 'mutation', null, old, this.saveExtraState()));
      };
      options.push({ text: 'Add a slot', enabled: true, callback: change(this.n + 1) });
      if (this.n > 1) options.push({ text: 'Remove the last slot', enabled: true, callback: change(this.n - 1) });
    },
  },
  // spawn: a slot for each option it sets
  spawn: {
    saveExtraState() { return { keys: this.keys, ...(this.bare ? { bare: true } : {}) }; },
    loadExtraState(s) { this.keys = s?.keys ?? []; this.bare = !!s?.bare; this.updateShape_(); },
    updateShape_() {
      const words = { color: 'color', size: 'size', at: 'at', launch: 'thrown at speed', from: 'from', shape: 'shape' };
      for (const k of Object.keys(words)) if (this.getInput(k) && !this.keys.includes(k)) this.removeInput(k);
      for (const k of this.keys) if (!this.getInput(k)) this.appendValueInput(k).appendField(words[k]);
    },
  },
  // repeat: the name it counts with, shown when the loop uses it
  counter: {
    saveExtraState() { return this.counter ? { v: this.counter, ...(this.showCounter ? { used: true } : {}) } : null; },
    loadExtraState(s) { this.counter = s?.v ?? null; this.showCounter = !!s?.used; this.updateShape_(); },
    updateShape_() {
      if (this.getInput('COUNTER')) this.removeInput('COUNTER');
      if (this.showCounter) {
        this.appendDummyInput('COUNTER').appendField('counting with').appendField(new Blockly.FieldLabel(this.counter, 'bb-param'));
        this.moveInputBefore('COUNTER', 'DO');
      }
    },
  },
  bare: {
    saveExtraState() { return this.bare ? { bare: true } : null; },
    loadExtraState(s) { this.bare = !!s?.bare; },
  },
};

function defineBlock(spec) {
  const def = {
    init() {
      this.setStyle(style(spec));
      this.setInputsInline(true);
      if (spec.special === 'define') {
        this.appendDummyInput('NAME_IN').appendField('define').appendField(new Blockly.FieldTextInput('myBlock', toIdentifier), 'NAME');
        this.params = [];
      } else if (spec.special === 'call') {
        this.appendDummyInput('NAME_IN').appendField(new FieldOpen(funcOptions), 'NAME');
        this.n = 0;
      } else if (spec.special === 'join' || spec.special === 'list') {
        this.appendDummyInput('LABEL').appendField(spec.msg);
        this.n = 0;
      } else if (spec.special === 'spawn') {
        this.appendDummyInput('LABEL').appendField(spec.msg);
        this.keys = [];
      } else build(this, spec);
      if (spec.special === 'repeat') this.counter = null;
      connections(this, spec);
      if (spec.special === 'note' || spec.special === 'raw') this.addClass?.(`bb-${spec.special}`);
      if (spec.special === 'menu' && spec.menu === 'color') {
        // a color menu wears its color
        this.getField('V').setValidator(function (v) {
          const name = /^"(\w+)"$/.exec(v)?.[1];
          this.getSourceBlock()?.setStyle(COLOR_HEX[name] ? `swatch_${name}` : 'looks');
          return v;
        });
      }
    },
  };
  if (spec.special === 'menu') {
    // a menu's color follows the block it's in
    def.onchange = function () {
      if (spec.menu === 'color') return;
      const parent = this.getParent();
      const want = parent ? `${parent.getStyleName().replace(/_(hat|menu)$/, '')}_menu` : 'sensing';
      if (this.getStyleName() !== want && blockStyles[want]) this.setStyle(want);
    };
  }
  let mixin = null;
  if (spec.wait) mixin = MUTATIONS.wait;
  else if (spec.shape === 'hat' || spec.inner || spec.special === 'define') mixin = MUTATIONS.params;
  else if (['join', 'list', 'call'].includes(spec.special)) mixin = MUTATIONS.slots;
  else if (spec.special === 'spawn') mixin = MUTATIONS.spawn;
  else if (spec.special === 'repeat') mixin = MUTATIONS.counter;
  else if (spec.special === 'varDeclare') mixin = MUTATIONS.bare;
  Object.assign(def, mixin);
  Blockly.Blocks[spec.type] = def;
}
for (const spec of Object.values(SPEC)) defineBlock(spec);

// ---- code --------------------------------------------------------------------------
// Precedence (Blockly's JavaScript orders): lower binds tighter.
export const Order = {
  ATOMIC: 0, MEMBER: 1.2, FUNCTION_CALL: 2, UNARY_NEGATION: 4.3, LOGICAL_NOT: 4.4, AWAIT: 4.8,
  MULTIPLICATION: 5.1, ADDITION: 6.2, RELATIONAL: 8, EQUALITY: 9, LOGICAL_AND: 13, LOGICAL_OR: 14,
  CONDITIONAL: 15, ASSIGNMENT: 16, NONE: 99,
};
const BINARY = {
  '+': Order.ADDITION, '-': Order.ADDITION, '*': Order.MULTIPLICATION, '/': Order.MULTIPLICATION, '%': Order.MULTIPLICATION,
  '<': Order.RELATIONAL, '>': Order.RELATIONAL, '<=': Order.RELATIONAL, '>=': Order.RELATIONAL,
  '===': Order.EQUALITY, '!==': Order.EQUALITY, '==': Order.EQUALITY, '!=': Order.EQUALITY,
  '&&': Order.LOGICAL_AND, '||': Order.LOGICAL_OR,
};
const MARK = (id) => `\u0001${id}\u0002`;

export const gen = new Blockly.CodeGenerator('Bricks');
gen.INDENT = '  ';
gen.ORDER_OVERRIDES = [];
gen.init = function () { this.isInitialized = true; };
gen.finish = (code) => code;
gen.scrubNakedValue = () => '';
// Every statement starts with a marker naming its block; toCode turns those
// into offsets. A hat writes its own script (the blocks below it).
gen.scrub_ = function (block, code, thisOnly) {
  if (block.outputConnection) return code;
  const next = thisOnly || !block.previousConnection ? '' : this.blockToCode(block.getNextBlock());
  return (block.type === 'bb_note' ? '' : MARK(block.id)) + code + next;
};

const val = (b, name, order = Order.NONE, empty = 'null') => gen.valueToCode(b, name, order) || empty;
const below = (b) => {
  const code = gen.blockToCode(b.getNextBlock());
  return code ? gen.prefixLines(code, gen.INDENT) : '';
};
const mouth = (b, name = 'DO') => gen.statementToCode(b, name);
const argsOf = (b, spec) => spec.params.map((p) => {
  const [kind] = spec.slots[p];
  if (kind === 'key') return JSON.stringify(b.getFieldValue(p));
  return val(b, p, Order.NONE, kind === 'num' ? '0' : kind === 'text' ? '""' : 'null');
});

// Does a script need its function to be async? Not counting the scripts of
// events and loops inside it, which are functions of their own.
function needsAwait(first) {
  const stack = [];
  for (let b = first; b; b = b.getNextBlock()) stack.push(b);
  while (stack.length) {
    const b = stack.pop();
    if (!b.isEnabled()) continue;
    const spec = SPEC[b.type];
    if ((spec.wait && !b.noWait) || spec.awaits || spec.special === 'together') return true;
    if ((b.type === 'bb_call' || b.type === 'bb_callR') && !b.noWait) return true;
    if (b.type === 'bb_raw' || b.type === 'bb_rawR') { if (/\bawait\b/.test(b.getFieldValue('CODE'))) return true; continue; }
    if (spec.inner || spec.special === 'forever') {
      for (const name of spec.params) { const t = b.getInputTargetBlock(name); if (t) stack.push(t); }
      continue;
    }
    for (const input of b.inputList) {
      const t = input.connection?.targetBlock();
      if (!t) continue;
      if (input.type === Blockly.inputs.inputTypes.STATEMENT) for (let s = t; s; s = s.getNextBlock()) stack.push(s);
      else stack.push(t);
    }
  }
  return false;
}

function eventCode(b, spec, body) {
  const args = argsOf(b, spec);
  const params = (b.params ?? []).join(', ');
  return `${spec.fn}(${[...args, `async (${params}) => {\n${body}}`].join(', ')});\n`;
}

const forBlock = {};
for (const spec of Object.values(SPEC)) {
  const type = spec.type;
  if (spec.shape === 'hat' && spec.fn) {
    forBlock[type] = (b) => {
      const first = b.getNextBlock();
      // "when it starts" with only a forever loop is just the loop
      if (type === 'bb_onStart' && first?.type === 'bb_forever' && !first.getNextBlock() && first.isEnabled()) return gen.blockToCode(first);
      return eventCode(b, spec, below(b));
    };
  } else if (spec.inner) {
    forBlock[type] = (b) => eventCode(b, spec, mouth(b));
  } else if (spec.fn && !spec.special) {
    const call = (b) => `${spec.fn}(${argsOf(b, spec).join(', ')})`;
    if (spec.shape === 'reporter' || spec.shape === 'boolean') {
      forBlock[type] = spec.awaits ? (b) => [`await ${call(b)}`, Order.AWAIT] : (b) => [call(b), Order.FUNCTION_CALL];
    } else {
      forBlock[type] = (b) => `${spec.wait && !b.noWait ? 'await ' : ''}${call(b)};\n`;
    }
  } else if (spec.part) {
    forBlock[type] = (b) => `${spec.wait && !b.noWait ? 'await ' : ''}part(${val(b, 'P', Order.NONE, '""')}).${spec.part}(${argsOf(b, spec).join(', ')});\n`;
  }
}

const binary = (b) => {
  const op = b.getFieldValue('OP');
  const o = BINARY[op] ?? Order.NONE;
  const empty = b.type === 'bb_arith' ? '0' : b.type === 'bb_logic' ? 'false' : 'null';
  return [`${val(b, 'A', Math.floor(o) + 1, empty)} ${op} ${val(b, 'B', o, empty)}`, o];
};
const callCode = (b) => {
  const args = [];
  for (let i = 0; i < b.n; i++) args.push(val(b, `A${i}`));
  return `${b.getFieldValue('NAME')}(${args.join(', ')})`;
};
const templateText = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
const counterName = (b) => {
  if (b.counter) return b.counter;
  let depth = 0;
  for (let p = b.getSurroundParent(); p; p = p.getSurroundParent()) if (p.type === 'bb_repeat') depth++;
  return ['i', 'j', 'k', 'n', 'm'][depth] ?? `i${depth}`;
};
const inLoop = (b) => {
  for (let p = b.getSurroundParent(); p; p = p.getSurroundParent()) {
    if (['bb_repeat', 'bb_while', 'bb_forEach'].includes(p.type)) return true;
    if (p.type === 'bb_forever' || p.type === 'bb_together' || SPEC[p.type].inner || !p.previousConnection) return false;
  }
  return false;
};
const assigns = (first, name) => {
  for (let s = first; s; s = s.getNextBlock()) {
    for (const d of [s, ...s.getDescendants(false)]) if ((d.type === 'bb_varSet' || d.type === 'bb_varChange') && d.getFieldValue('V') === name) return true;
  }
  return false;
};

Object.assign(forBlock, {
  bb_spawn: (b) => {
    if (!b.keys.length) return b.bare ? 'spawn();\n' : 'spawn({});\n';
    const kind = { color: 'color', size: 'size', at: 'at', launch: 'num', from: 'part', shape: 'shape' };
    return `spawn({${b.keys.map((k) => `${k}: ${val(b, k, Order.NONE, kind[k] === 'num' ? '0' : 'null')}`).join(', ')}});\n`;
  },
  bb_forever: (b) => `forever(async () => {\n${mouth(b)}});\n`,
  bb_repeat: (b) => {
    const v = counterName(b);
    return `for (let ${v} = 0; ${v} < ${val(b, 'N', Order.RELATIONAL, '0')}; ${v}++) {\n${mouth(b)}}\n`;
  },
  bb_while: (b) => `while (${val(b, 'C', Order.NONE, 'false')}) {\n${mouth(b)}}\n`,
  bb_forEach: (b) => {
    const v = b.getFieldValue('V');
    return `for (${assigns(b.getInputTargetBlock('DO'), v) ? 'let' : 'const'} ${v} of ${val(b, 'L', Order.ASSIGNMENT, '[]')}) {\n${mouth(b)}}\n`;
  },
  bb_if: (b) => `if (${val(b, 'C', Order.NONE, 'false')}) {\n${mouth(b)}}\n`,
  bb_ifElse: (b) => {
    const head = `if (${val(b, 'C', Order.NONE, 'false')}) {\n${mouth(b)}}`;
    const alt = b.getInputTargetBlock('ELSE');
    // else if
    if (alt && (alt.type === 'bb_if' || alt.type === 'bb_ifElse') && !alt.getNextBlock() && alt.isEnabled()) return `${head} else ${gen.blockToCode(alt)}`;
    return `${head} else {\n${mouth(b, 'ELSE')}}\n`;
  },
  bb_together: (b) => {
    const parts = [];
    for (let c = b.getInputTargetBlock('DO'); c; c = c.getNextBlock()) {
      if (!c.isEnabled() || c.type === 'bb_note') continue;
      const code = gen.blockToCode(c, true).replace(/\u0001[^\u0002]*\u0002/g, '');
      const one = /^(?:await )?([^\n]*);\n$/.exec(code);
      parts.push(one && !/;/.test(one[1]) ? one[1] : `(async () => {\n${gen.prefixLines(code, gen.INDENT)}})()`);
    }
    return `await Promise.all([${parts.join(', ')}]);\n`;
  },
  bb_return: () => 'return;\n',
  // outside a loop (in a forever, or a script), stopping or skipping ends this run of the script
  bb_break: (b) => (inLoop(b) ? 'break;\n' : 'return;\n'),
  bb_continue: (b) => (inLoop(b) ? 'continue;\n' : 'return;\n'),
  bb_report: (b) => `return ${val(b, 'V')};\n`,
  bb_prop: (b) => [`${val(b, 'O', Order.MEMBER)}.${b.getFieldValue('P')}`, Order.MEMBER],
  bb_arith: binary,
  bb_compare: binary,
  bb_logic: binary,
  bb_not: (b) => [`!${val(b, 'A', Order.LOGICAL_NOT, 'false')}`, Order.LOGICAL_NOT],
  bb_join: (b) => {
    let out = '';
    for (let i = 0; i < b.n; i++) {
      const t = b.getInputTargetBlock(`P${i}`);
      if (!t) continue;
      if (t.type === 'bb_text') out += templateText(unescText(t.getFieldValue('TEXT')));
      else out += `\${${val(b, `P${i}`)}}`;
    }
    return [`\`${out}\``, Order.ATOMIC];
  },
  bb_math: (b) => [`Math.${b.getFieldValue('F')}(${val(b, 'A', Order.NONE, '0')})`, Order.FUNCTION_CALL],
  bb_minmax: (b) => [`Math.${b.getFieldValue('F')}(${val(b, 'A', Order.NONE, '0')}, ${val(b, 'B', Order.NONE, '0')})`, Order.FUNCTION_CALL],
  bb_fraction: () => ['Math.random()', Order.FUNCTION_CALL],
  bb_length: (b) => [`${val(b, 'A', Order.MEMBER, '""')}.length`, Order.MEMBER],
  bb_contains: (b) => [`${val(b, 'A', Order.MEMBER, '""')}.includes(${val(b, 'B', Order.NONE, '""')})`, Order.FUNCTION_CALL],
  bb_repeatText: (b) => [`${val(b, 'A', Order.MEMBER, '""')}.repeat(${val(b, 'N', Order.NONE, '0')})`, Order.FUNCTION_CALL],
  bb_ternary: (b) => [`${val(b, 'C', Order.CONDITIONAL, 'false')} ? ${val(b, 'A', Order.ASSIGNMENT)} : ${val(b, 'B', Order.ASSIGNMENT)}`, Order.CONDITIONAL],
  bb_bool: (b) => [b.getFieldValue('V'), Order.ATOMIC],
  bb_null: () => ['null', Order.ATOMIC],
  bb_num: (b) => {
    const n = Number(b.getFieldValue('NUM')) || 0;
    return [String(n), n < 0 ? Order.UNARY_NEGATION : Order.ATOMIC];
  },
  bb_text: (b) => [JSON.stringify(unescText(b.getFieldValue('TEXT'))), Order.ATOMIC],
  bb_varGet: (b) => [b.getFieldValue('V'), Order.ATOMIC],
  bb_varDeclare: (b) => {
    const x = gen.valueToCode(b, 'X', Order.ASSIGNMENT);
    return `let ${b.getFieldValue('V')}${x ? ` = ${x}` : ''};\n`;
  },
  bb_varSet: (b) => `${b.getFieldValue('V')} = ${val(b, 'X', Order.ASSIGNMENT, '0')};\n`,
  bb_varChange: (b) => `${b.getFieldValue('V')} += ${val(b, 'X', Order.ASSIGNMENT, '0')};\n`,
  bb_list: (b) => {
    const items = [];
    for (let i = 0; i < b.n; i++) items.push(val(b, `I${i}`));
    return [`[${items.join(', ')}]`, Order.ATOMIC];
  },
  bb_item: (b) => [`${val(b, 'L', Order.MEMBER, '[]')}[${val(b, 'I', Order.NONE, '0')}]`, Order.MEMBER],
  bb_define: (b) => {
    const first = b.getNextBlock();
    const async = b.isAsync || needsAwait(first) ? 'async ' : '';
    const name = b.getFieldValue('NAME');
    const params = (b.params ?? []).join(', ');
    const body = below(b);
    if ((b.defStyle ?? 'function') === 'function') return `${async}function ${name}(${params}) {\n${body}}\n`;
    return `${b.defStyle} ${name} = ${async}(${params}) => {\n${body}};\n`;
  },
  bb_call: (b) => `${b.noWait ? '' : 'await '}${callCode(b)};\n`,
  bb_callR: (b) => (b.noWait ? [callCode(b), Order.FUNCTION_CALL] : [`await ${callCode(b)}`, Order.AWAIT]),
  bb_cloneR: (b) => [`await clone(${val(b, 'W')}, ${val(b, 'P')})`, Order.AWAIT],
  bb_note: (b) => unescText(b.getFieldValue('TEXT')).split('\n').map((l) => `// ${l}\n`).join(''),
  bb_raw: (b) => `${b.getFieldValue('CODE')}\n`,
  bb_rawR: (b) => [b.getFieldValue('CODE'), Order.NONE],
});
for (const kind of Object.keys(MENUS)) forBlock[`bb_m_${kind}`] = (b) => [b.getFieldValue('V'), Order.ATOMIC];
Object.assign(gen.forBlock, forBlock);

// The JavaScript for a workspace, and where each statement block's code
// starts in it: {code, at: {blockId: offset}}. Scripts are written top to
// bottom as they sit, a blank line between them. Loose reporters write nothing.
export function toCode(ws) {
  gen.init(ws);
  let marked = '';
  let notesOnly = false;
  for (const b of ws.getTopBlocks(true)) {
    if (b.outputConnection) continue;
    const code = gen.blockToCode(b);
    if (!code) continue;
    if (marked && !notesOnly) marked += '\n'; // a note sits right above the script after it
    marked += code;
    notesOnly = true;
    for (let s = b; s; s = s.getNextBlock()) if (s.type !== 'bb_note') { notesOnly = false; break; }
  }
  const at = {};
  let code = '';
  let last = 0;
  for (const m of marked.matchAll(/\u0001([^\u0002]*)\u0002/g)) {
    code += marked.slice(last, m.index);
    at[m[1]] = code.length;
    last = m.index + m[0].length;
  }
  code += marked.slice(last);
  return { code, at };
}

// ---- the palette --------------------------------------------------------------------
// A ready-to-use copy of a block, with every slot filled with its default.
export function paletteBlock(type, extra = {}) {
  const spec = SPEC[type];
  const fields = {}, inputs = {};
  for (const [name, [kind, def]] of Object.entries(spec.slots)) {
    if (FIELD_KINDS.has(kind)) { if (def != null) fields[name] = def; continue; }
    const sh = shadowFor(kind, def ?? MENUS[kind]?.def);
    if (sh) inputs[name] = { shadow: sh };
  }
  if (spec.part) inputs.P = { shadow: shadowFor('part', JSON.stringify(blockContext.parts?.[0] ?? 'arm')) };
  return { kind: 'block', type, ...(Object.keys(fields).length ? { fields } : {}), ...(Object.keys(inputs).length ? { inputs } : {}), ...extra };
}

// Every block, by category, as Blockly flyout contents.
export function paletteContents() {
  const p = (type, extra) => paletteBlock(type, extra);
  const text = (s) => ({ shadow: { type: 'bb_text', fields: { TEXT: escText(s) } } });
  const num = (n) => ({ shadow: { type: 'bb_num', fields: { NUM: n } } });
  const menu = (kind, v) => ({ shadow: { type: `bb_m_${kind}`, fields: { V: v } } });
  const firstThing = blockContext.things?.[0];
  const byCat = {
    event: [p('bb_onStart'), p('bb_onKey'), p('bb_onKeyUp'), p('bb_whileKey'), p('bb_onTouch'), p('bb_onMessage'), p('bb_onClone'), p('bb_every'), p('bb_broadcast')],
    motion: ['bb_drive', 'bb_steer', 'bb_rise', 'bb_speedUp', 'bb_slowDown', 'bb_stop', 'bb_jump', 'bb_push', 'bb_move', 'bb_turn', 'bb_goTo', 'bb_face', 'bb_teleport', 'bb_place'].map((t) => p(t)),
    parts: ['bb_spin', 'bb_turnTo', 'bb_slideTo', 'bb_wiggle', 'bb_partColor'].map((t) => p(t)),
    looks: ['bb_color', 'bb_say', 'bb_show', 'bb_explode'].map((t) => p(t)),
    sound: [p('bb_play')],
    pen: ['bb_penDown', 'bb_penUp', 'bb_penColor', 'bb_penSize', 'bb_clearDrawing'].map((t) => p(t)),
    world: [
      p('bb_spawn', { extraState: { keys: ['color', 'size', 'at'] }, inputs: { color: menu('color', '"red"'), size: menu('size', '"2x2"'), at: menu('at', '"front"') } }),
      p('bb_spawn', { extraState: { keys: ['color', 'launch'] }, inputs: { color: menu('color', '"blue"'), launch: num(18) } }),
      p('bb_spawn', { extraState: { keys: ['color', 'from'] }, inputs: { color: menu('color', '"yellow"'), from: menu('part', JSON.stringify(blockContext.parts?.[0] ?? 'arm')) } }),
      p('bb_spawn', { extraState: { keys: ['shape', 'color'] }, inputs: { shape: menu('shape', '"flower"'), color: menu('color', '"pink"') } }),
      p('bb_clone'), p('bb_cloneR'), p('bb_remove'), p('bb_gravity'),
    ],
    control: [
      p('bb_wait'), p('bb_forever'), p('bb_repeat'), p('bb_while'), p('bb_forEach'), p('bb_if'), p('bb_ifElse'), p('bb_together'),
      p('bb_return'), p('bb_break'), p('bb_continue'), p('bb_isClone'),
    ],
    sensing: [
      p('bb_look'), p('bb_nearest'), p('bb_touching'), p('bb_position'),
      p('bb_see', { inputs: { L: { block: { type: 'bb_list', extraState: { n: 2 }, inputs: { I0: text('food'), I1: text('something scary') } } } } }),
      p('bb_is', { inputs: { T: { block: { type: 'bb_nearest', inputs: { F: menu('filter', 'null') } } }, F: menu('filter', '"red"') } }),
      p('bb_prop', { inputs: { O: { block: { type: 'bb_nearest', inputs: { F: menu('filter', 'null') } } } } }),
      p('bb_m_target', { fields: { V: firstThing ? `thing(${JSON.stringify(firstThing.id)})` : '"tree"' } }),
      p('bb_thing', { inputs: { ID: text(firstThing?.id ?? 'tree') } }),
    ],
    operator: [
      p('bb_arith', { fields: { OP: '+' } }), p('bb_arith', { fields: { OP: '-' } }), p('bb_arith', { fields: { OP: '*' } }), p('bb_arith', { fields: { OP: '/' } }), p('bb_arith', { fields: { OP: '%' } }),
      p('bb_random'),
      p('bb_compare', { fields: { OP: '<' } }), p('bb_compare', { fields: { OP: '===' } }), p('bb_compare', { fields: { OP: '>' } }),
      p('bb_logic', { fields: { OP: '&&' } }), p('bb_logic', { fields: { OP: '||' } }), p('bb_not'),
      p('bb_join', { extraState: { n: 2 }, inputs: { P0: text('apple '), P1: text('banana') } }),
      p('bb_length'), p('bb_contains'), p('bb_repeatText'),
      p('bb_math', { fields: { F: 'round' } }), p('bb_minmax', { fields: { F: 'min' } }), p('bb_fraction'),
      p('bb_ternary'), p('bb_bool', { fields: { V: 'true' } }), p('bb_null'), p('bb_num', { fields: { NUM: 0 } }), p('bb_text', { fields: { TEXT: 'hello' } }),
    ],
    variable: [
      p('bb_varDeclare'), p('bb_varSet'), p('bb_varChange'), p('bb_varGet'),
    ],
    list: [
      p('bb_list', { extraState: { n: 3 }, inputs: { I0: text('red'), I1: text('green'), I2: text('blue') } }),
      p('bb_item'),
      p('bb_varDeclare', { fields: { V: 'colors' }, inputs: { X: { shadow: shadowFor('num', 0), block: { type: 'bb_list', extraState: { n: 2 }, inputs: { I0: text('red'), I1: text('blue') } } } } }),
    ],
    custom: [
      p('bb_define', { extraState: { name: 'myBlock', style: 'function' } }),
      p('bb_call', { extraState: { name: 'myBlock', args: 0 } }),
      p('bb_callR', { extraState: { name: 'myBlock', args: 0, noWait: true } }),
      p('bb_report'),
    ],
    other: [p('bb_note', { fields: { TEXT: 'a note to myself' } }), p('bb_log'), p('bb_raw', { fields: { CODE: 'log("hi");' } }), p('bb_rawR', { fields: { CODE: 'Math.PI' } })],
  };
  return CATEGORIES.map(([key, name, color]) => ({ key, name, color, blocks: byCat[key] ?? [] }));
}

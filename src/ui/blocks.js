// Draws a behavior program as Scratch-style blocks. It parses the real
// JavaScript and keeps its shape (the same statements, in the same order and
// nesting), but uses plain words: `onKey(" ", async () => { await jump(5) })`
// becomes a "when space key pressed" hat with a "jump with power 5" block
// under it. Shapes are plain HTML/CSS (see .bk-* in style.css).
import { parse } from 'acorn';
import { COLORS } from '../behavior/primitives.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEYS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'space', Enter: 'enter' };
const COLOR_HEX = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]));

// Each primitive: [category, wording, shape]. {0} is the first argument and
// {0:kind} says how to show it; [...] is left out when its arguments are.
const SPECS = {
  onStart: ['event', 'when it starts', 'hat'],
  onKey: ['event', 'when {0:key} key pressed', 'hat'],
  onKeyUp: ['event', 'when {0:key} key let go', 'hat'],
  whileKey: ['event', 'while {0:key} key is held', 'hat'],
  onTouch: ['event', 'when it bumps {0:filter}', 'hat'],
  onMessage: ['event', 'when I hear {0:msg}', 'hat'],
  onClone: ['event', 'when I start as a copy', 'hat'],
  every: ['event', 'every {0} seconds', 'hat'],
  drive: ['motion', 'drive at speed {0}'],
  steer: ['motion', 'keep turning at speed {0}'],
  rise: ['motion', 'rise at speed {0}'],
  stop: ['motion', 'stop moving'],
  jump: ['motion', 'jump[ with power {0}]'],
  push: ['motion', 'push {0:pick}[ with power {1}]'],
  move: ['motion', 'move {0} studs[ at speed {1}]'],
  turn: ['motion', 'turn {0} degrees'],
  goTo: ['motion', 'go to {0:target}[ at speed {1}]'],
  face: ['motion', 'face {0:target}'],
  teleport: ['motion', 'teleport to {0:target}'],
  color: ['looks', 'change color to {0:color}'],
  say: ['looks', 'say {0}[ for {1} seconds]'],
  play: ['sound', 'play sound {0:pick}'],
  broadcast: ['event', 'tell everyone {0:msg}'],
  spawn: ['world', 'make a brick[ {0:opts}]'],
  clone: ['world', 'make a copy of {0:target}[ at {1:target}]'],
  remove: ['world', 'disappear'],
  gravity: ['world', 'set gravity to {0}'],
  wait: ['control', 'wait {0} seconds'],
  look: ['sensing', 'thing ahead[ within {0}]', 'reporter'],
  nearest: ['sensing', 'nearest {0:filter}', 'reporter'],
  touching: ['sensing', 'touching {0:filter}?', 'boolean'],
  position: ['sensing', 'my position', 'reporter'],
  isClone: ['control', 'am I a copy?', 'boolean'],
  is: ['sensing', '{0} is {1:filter}?', 'boolean'],
  random: ['operator', 'pick random {0} to {1}', 'reporter'],
  place: ['motion', 'spot {0} , {1}', 'reporter'],
  log: ['other', 'log {0}[ {1}][ {2}]'],
};
const PART_SPECS = {
  spin: ['parts', 'spin {p} at speed {0}'],
  turnTo: ['parts', 'swing {p} to {0} degrees'],
  wiggle: ['parts', 'wiggle {p}[ {0} times]'],
  color: ['parts', 'color {p} {0:color}'],
};
const MATH = { min: 'smaller of {0} and {1}', max: 'bigger of {0} and {1}', round: 'round {0}', floor: 'round down {0}', ceil: 'round up {0}', abs: 'size of {0}', sqrt: 'square root of {0}', sin: 'sin of {0}', cos: 'cos of {0}', random: 'random fraction' };
const COMPARE = { '===': '=', '==': '=', '!==': '≠', '!=': '≠', '<': '<', '>': '>', '<=': '≤', '>=': '≥' };

const word = (t) => `<span class="bk-w">${esc(t)}</span>`;
const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression');
const unwrapAwait = (n) => (n?.type === 'AwaitExpression' ? n.argument : n);

export function renderBlocks(code, { thingName = () => null } = {}) {
  let ast;
  const comments = [];
  try {
    ast = parse(code, {
      ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true,
      onComment: (block, text, start, end) => comments.push({ text: text.trim(), start, end }),
    });
  } catch (err) {
    return `<div class="bk-error">These blocks don't fit together yet: ${esc(err.message)}</div>`;
  }
  const used = new Set();
  const src = (n) => code.slice(n.start, n.end);
  const userFns = new Set();
  for (const s of ast.body) {
    if (s.type === 'FunctionDeclaration') userFns.add(s.id.name);
    if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (isFn(d.init) && d.id.type === 'Identifier') userFns.add(d.id.name);
  }

  // ---- shapes ----------------------------------------------------------------
  const stack = (cat, inner, cls = '') => `<div class="bk k-${cat} ${cls}">${inner}</div>`;
  const reporter = (cat, inner) => `<span class="bk-r k-${cat}">${inner}</span>`;
  const boolean = (cat, inner) => `<span class="bk-b k-${cat}">${inner}</span>`;
  const cBlock = (cat, head, body, more = []) => `<div class="bk-c k-${cat}"><div class="bk-c-arm">${head}</div><div class="bk-c-mouth">${body}</div>${
    more.map(([label, b]) => `<div class="bk-c-arm bk-c-mid">${label}</div><div class="bk-c-mouth">${b}</div>`).join('')}<div class="bk-c-foot"></div></div>`;
  const script = (hat, body) => `<div class="bk-script">${hat}${body}</div>`;
  const pick = (t, extra = '') => `<span class="bk-dd">${extra}${esc(t)}<i>▾</i></span>`;
  const generic = (n, asStack) => (asStack ? stack('other', `<code>${esc(src(n))}</code>`) : `<span class="bk-r k-other"><code>${esc(src(n))}</code></span>`);

  // Fill a wording template with argument slots.
  function fill(tpl, args, extra = {}) {
    const one = (t) => t.replace(/\{(\w+)(?::(\w+))?\}/g, (_, i, kind) => (i in extra ? extra[i] : slot(args[+i], kind)));
    const segs = tpl.split(/(\[[^\]]*\])/);
    return segs.map((s) => {
      if (!s.startsWith('[')) return s;
      const needs = [...s.matchAll(/\{(\d+)/g)].map((m) => +m[1]);
      return needs.every((i) => args[i] !== undefined) ? s.slice(1, -1) : '';
    }).join('').split(/(\{[^}]+\})/).map((s) => (s.startsWith('{') ? one(s) : s.trim() ? word(s.trim()) : '')).join(' ');
  }

  // ---- expressions -------------------------------------------------------------
  function slot(n, kind) {
    n = unwrapAwait(n);
    if (n === undefined) return kind === 'target' ? pick('myself') : '';
    if (n.type === 'Literal' && typeof n.value === 'string') {
      const v = n.value;
      if (kind === 'key') return pick(KEYS[v] ?? v);
      if (kind === 'color' || ((kind === 'filter' || kind === 'target') && COLOR_HEX[v])) return pick(v, swatch(v));
      if (kind === 'msg') return pick(v, '📣 ');
      if (kind === 'filter') return pick(v);
      if (kind === 'target') return pick(`nearest ${v}`);
      if (kind === 'pick') return pick(v);
    }
    if (n.type === 'Literal' && n.value === null) {
      if (kind === 'filter') return pick('anything');
      if (kind === 'target') return pick('myself');
    }
    if (kind === 'opts' && n.type === 'ObjectExpression') return objectSlots(n, true);
    if (kind === 'filter' && n.type === 'ObjectExpression') return pick(n.properties.map((p) => p.value.value ?? src(p.value)).join(' '));
    return expr(n);
  }
  const swatch = (c) => `<b class="bk-swatch" style="background:${COLOR_HEX[c] ?? '#888'}"></b>`;

  function objectSlots(n, bare) {
    const inner = n.properties.map((p) => {
      if (p.type !== 'Property') return expr(p);
      const key = p.key.name ?? p.key.value;
      const kind = { color: 'color', size: 'pick', at: 'target', from: 'pick' }[key];
      return `${word(key)} ${slot(p.value, key === 'at' ? (p.value.type === 'Literal' ? 'pick' : kind) : kind)}`;
    }).join(' ');
    return bare ? inner : reporter('variable', inner || word('empty'));
  }

  function expr(n) {
    n = unwrapAwait(n);
    switch (n.type) {
      case 'Literal':
        if (typeof n.value === 'number') return `<span class="bk-in">${n.value}</span>`;
        if (typeof n.value === 'string') return `<span class="bk-in bk-str">${esc(n.value) || '&nbsp;'}</span>`;
        if (typeof n.value === 'boolean') return boolean('operator', word(n.value ? 'true' : 'false'));
        if (n.value === null) return `<span class="bk-in bk-str">nothing</span>`;
        return generic(n);
      case 'Identifier':
        if (n.name === 'undefined') return `<span class="bk-in bk-str">nothing</span>`;
        return reporter(userFns.has(n.name) ? 'custom' : 'variable', esc(n.name));
      case 'TemplateLiteral': {
        const parts = [];
        n.quasis.forEach((q, i) => {
          if (q.value.cooked) parts.push(`<span class="bk-in bk-str">${esc(q.value.cooked)}</span>`);
          if (n.expressions[i]) parts.push(expr(n.expressions[i]));
        });
        return reporter('operator', `${word('join')} ${parts.join(' ')}`);
      }
      case 'BinaryExpression':
        if (COMPARE[n.operator]) return boolean('operator', `${expr(n.left)} ${word(COMPARE[n.operator])} ${expr(n.right)}`);
        return reporter('operator', `${expr(n.left)} ${word({ '*': '×', '/': '÷', '%': 'mod' }[n.operator] ?? n.operator)} ${expr(n.right)}`);
      case 'LogicalExpression':
        return boolean('operator', `${expr(n.left)} ${word({ '&&': 'and', '||': 'or', '??': 'or else' }[n.operator])} ${expr(n.right)}`);
      case 'UnaryExpression':
        if (n.operator === '!') return boolean('operator', `${word('not')} ${expr(n.argument)}`);
        if (n.operator === '-' && n.argument.type === 'Literal') return `<span class="bk-in">-${n.argument.value}</span>`;
        return reporter('operator', `${word(n.operator)} ${expr(n.argument)}`);
      case 'ConditionalExpression':
        return reporter('control', `${word('if')} ${expr(n.test)} ${word('then')} ${expr(n.consequent)} ${word('else')} ${expr(n.alternate)}`);
      case 'MemberExpression':
        if (n.computed) return reporter('list', `${word('item')} ${expr(n.property)} ${word('of')} ${expr(n.object)}`);
        if (n.property.name === 'length') return reporter('operator', `${word('length of')} ${expr(n.object)}`);
        return reporter('sensing', `${word(n.property.name)} ${word('of')} ${expr(n.object)}`);
      case 'ArrayExpression':
        return reporter('list', `${word('list')} ${n.elements.map((e) => (e ? expr(e) : '')).join(' ')}`);
      case 'ObjectExpression':
        return objectSlots(n);
      case 'CallExpression':
        return callReporter(n) ?? generic(n);
      default:
        return generic(n);
    }
  }

  function callReporter(n) {
    const c = n.callee;
    if (c.type === 'Identifier') {
      if (c.name === 'thing') {
        const id = n.arguments[0]?.value;
        if (typeof id !== 'string') return reporter('sensing', `${word('thing')} ${expr(n.arguments[0])}`);
        return `<span class="bk-dd bk-thing">🧱 ${esc(thingName(id) ?? id.replace(/[-_]/g, ' '))}<i>▾</i></span>`;
      }
      const s = SPECS[c.name];
      if (s) {
        const shape = s[2] === 'boolean' ? boolean : reporter;
        return shape(s[0], fill(s[1], n.arguments));
      }
      if (userFns.has(c.name)) return reporter('custom', `${word(c.name)} ${n.arguments.map((a) => expr(a)).join(' ')}`);
    }
    if (c.type === 'MemberExpression' && !c.computed) {
      const name = c.property.name;
      if (c.object.type === 'Identifier' && c.object.name === 'Math' && MATH[name]) return reporter('operator', fill(MATH[name], n.arguments));
      if (name === 'repeat') return reporter('operator', `${expr(c.object)} ${word('repeated')} ${expr(n.arguments[0])} ${word('times')}`);
      if (name === 'includes') return boolean('operator', `${expr(c.object)} ${word('contains')} ${expr(n.arguments[0])}${word('?')}`);
    }
    return null;
  }

  // ---- statements --------------------------------------------------------------
  // Comments sitting before a statement, or after it on the same line, become
  // sticky notes above it.
  function notesFor(n) {
    const lineEnd = code.indexOf('\n', n.end);
    const out = [];
    for (const c of comments) {
      if (used.has(c)) continue;
      if (c.end <= n.start || (c.start >= n.end && (lineEnd < 0 || c.start < lineEnd))) {
        used.add(c);
        out.push(`<div class="bk-note">${esc(c.text)}</div>`);
      }
    }
    return out.join('');
  }

  // Each block carries its statement's offset in the code (data-at), which is
  // also the id trace.js reports while that statement runs.
  const tag = (html, at) => html.replace(/^<div /, `<div data-at="${at}" `);
  const list = (stmts) => stmts.map((s) => notesFor(s) + tag(stmt(s), s.start)).join('');
  const fnBody = (fn) => {
    if (!fn) return '';
    if (fn.type === 'Identifier') return tag(stmt({ type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: fn, arguments: [] }, start: fn.start, end: fn.end }), fn.start);
    return fn.body.type === 'BlockStatement' ? list(fn.body.body) : tag(stmt({ type: 'ExpressionStatement', expression: fn.body, start: fn.body.start, end: fn.body.end }), fn.body.start);
  };
  const fnParams = (fn) => (fn?.params?.length ? ` ${fn.params.map((p) => reporter('variable', esc(src(p)))).join(' ')}` : '');

  function eventParts(call) {
    const name = call.callee.name;
    const fn = call.arguments[call.arguments.length - 1];
    if (!(name in SPECS) || SPECS[name][2] !== 'hat' || !(isFn(fn) || (fn?.type === 'Identifier' && userFns.has(fn.name)))) return null;
    return { head: fill(SPECS[name][1], call.arguments) + fnParams(fn), fn };
  }

  // A top-level statement: event handlers and function definitions become
  // scripts with a hat; anything else is a loose block.
  function topLevel(s) {
    const call = s.type === 'ExpressionStatement' && unwrapAwait(s.expression);
    if (call?.type === 'CallExpression' && call.callee.type === 'Identifier') {
      if (call.callee.name === 'forever' && isFn(call.arguments[0])) {
        return script(tag(stack('event', word('when it starts'), 'bk-hat'), s.start), tag(cBlock('control', word('forever'), fnBody(call.arguments[0])), s.start));
      }
      const ev = eventParts(call);
      if (ev) return script(tag(stack('event', ev.head, 'bk-hat'), s.start), fnBody(ev.fn));
    }
    if (s.type === 'FunctionDeclaration') return script(tag(stack('custom', `${word('define')} ${word(s.id.name)}${fnParams(s)}`, 'bk-hat'), s.start), fnBody(s));
    if (s.type === 'VariableDeclaration' && s.declarations.length === 1 && isFn(s.declarations[0].init)) {
      const d = s.declarations[0];
      return script(tag(stack('custom', `${word('define')} ${word(src(d.id))}${fnParams(d.init)}`, 'bk-hat'), s.start), fnBody(d.init));
    }
    return null;
  }

  function stmt(s) {
    switch (s.type) {
      case 'ExpressionStatement': return exprStmt(unwrapAwait(s.expression), s);
      case 'VariableDeclaration':
        return s.declarations.map((d) => (d.init
          ? stack('variable', `${word('set')} ${pick(src(d.id))} ${word('to')} ${expr(d.init)}`)
          : stack('variable', `${word('make variable')} ${pick(src(d.id))}`))).join('');
      case 'FunctionDeclaration':
        return cBlock('custom', `${word('define')} ${word(s.id.name)}${fnParams(s)}`, fnBody(s));
      case 'IfStatement': {
        const more = s.alternate ? [[word('else'), s.alternate.type === 'BlockStatement' ? list(s.alternate.body) : tag(stmt(s.alternate), s.alternate.start)]] : [];
        return cBlock('control', `${word('if')} ${expr(s.test)} ${word('then')}`, body(s.consequent), more);
      }
      case 'WhileStatement':
        return cBlock('control', `${word('repeat while')} ${expr(s.test)}`, body(s.body));
      case 'DoWhileStatement':
        return cBlock('control', word('repeat'), body(s.body), [[`${word('again while')} ${expr(s.test)}`, '']]);
      case 'ForStatement': {
        const counted = countedLoop(s);
        if (counted) return cBlock('control', counted, body(s.body));
        return cBlock('control', `${word('for')} <code>${esc(code.slice(s.init?.start ?? s.start, s.update?.end ?? s.body.start))}</code>`, body(s.body));
      }
      case 'ForOfStatement': case 'ForInStatement': {
        const v = s.left.type === 'VariableDeclaration' ? src(s.left.declarations[0].id) : src(s.left);
        return cBlock('control', `${word('for each')} ${pick(v)} ${word('in')} ${expr(s.right)}`, body(s.body));
      }
      case 'BlockStatement': return list(s.body);
      case 'LabeledStatement': return stmt(s.body); // outer: while (...) — the label stays in the code view
      case 'ReturnStatement':
        return s.argument ? stack('custom', `${word('report')} ${expr(s.argument)}`, 'bk-cap') : stack('control', word('stop this script'), 'bk-cap');
      case 'BreakStatement': return stack('control', word('stop repeating'), 'bk-cap');
      case 'ContinueStatement': return stack('control', word('skip to the next time around'), 'bk-cap');
      case 'TryStatement':
        return cBlock('control', word('try'), list(s.block.body), s.handler ? [[word('if that goes wrong'), list(s.handler.body.body)]] : []);
      case 'EmptyStatement': return '';
      default: return generic(s, true);
    }
  }
  const body = (b) => (b.type === 'BlockStatement' ? list(b.body) : notesFor(b) + tag(stmt(b), b.start));

  // for (let i = 0; i < N; i++) → "repeat N times"
  function countedLoop(s) {
    const d = s.init?.declarations?.[0];
    if (!d || d.init?.type !== 'Literal' || d.init.value !== 0 || d.id.type !== 'Identifier') return null;
    const v = d.id.name;
    if (s.test?.type !== 'BinaryExpression' || s.test.operator !== '<' || s.test.left.name !== v) return null;
    if (s.update?.type !== 'UpdateExpression' || s.update.operator !== '++' || s.update.argument.name !== v) return null;
    const usesVar = new RegExp(`\\b${v}\\b`).test(src(s.body));
    return `${word('repeat')} ${expr(s.test.right)} ${word('times')}${usesVar ? ` ${word('counting with')} ${pick(v)}` : ''}`;
  }

  function exprStmt(e, s) {
    if (e.type === 'CallExpression') return callStmt(e, s);
    if (e.type === 'AssignmentExpression') {
      const target = e.left.type === 'Identifier' ? pick(e.left.name) : expr(e.left);
      const same = (n) => n.type === 'Identifier' && e.left.type === 'Identifier' && n.name === e.left.name;
      if (e.operator === '=' && e.right.type === 'BinaryExpression' && same(e.right.left) && (e.right.operator === '+' || e.right.operator === '-')) {
        const by = e.right.operator === '-' ? { type: 'UnaryExpression', operator: '-', argument: e.right.right, start: e.right.right.start, end: e.right.right.end } : e.right.right;
        return stack('variable', `${word('change')} ${target} ${word('by')} ${expr(by)}`);
      }
      if (e.operator === '+=' || e.operator === '-=') {
        const by = e.operator === '-=' ? { type: 'UnaryExpression', operator: '-', argument: e.right, start: e.right.start, end: e.right.end } : e.right;
        return stack('variable', `${word('change')} ${target} ${word('by')} ${expr(by)}`);
      }
      if (e.operator === '=') return stack('variable', `${word('set')} ${target} ${word('to')} ${expr(e.right)}`);
    }
    if (e.type === 'UpdateExpression') {
      return stack('variable', `${word('change')} ${pick(src(e.argument))} ${word('by')} <span class="bk-in">${e.operator === '++' ? 1 : -1}</span>`);
    }
    return generic(s, true);
  }

  function callStmt(e, s) {
    const c = e.callee;
    if (c.type === 'Identifier') {
      if (c.name === 'forever' && isFn(e.arguments[0])) return cBlock('control', word('forever'), fnBody(e.arguments[0]));
      const ev = eventParts(e);
      if (ev) return cBlock('event', ev.head, fnBody(ev.fn));
      const spec = SPECS[c.name];
      if (spec && !spec[2]) return stack(spec[0], fill(spec[1], e.arguments));
      if (userFns.has(c.name)) return stack('custom', `${word(c.name)} ${e.arguments.map((a) => expr(a)).join(' ')}`);
    }
    // part("arm").turnTo(90)
    if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'CallExpression' && c.object.callee.name === 'part') {
      const spec = PART_SPECS[c.property.name];
      const p = c.object.arguments[0];
      const partSlot = p?.type === 'Literal' ? pick(p.value, '⚙️ ') : expr(p);
      if (spec) return stack(spec[0], fill(spec[1], e.arguments, { p: partSlot }));
    }
    return generic(s, true);
  }

  // Top level: hats start new scripts; runs of loose statements share a stack.
  const out = [];
  let loose = '';
  const flush = () => { if (loose) out.push(script('', loose)); loose = ''; };
  for (const s of ast.body) {
    const notes = notesFor(s);
    const top = topLevel(s);
    if (top) { flush(); out.push(notes + top); } else loose += notes + tag(stmt(s), s.start);
  }
  flush();
  const tail = comments.filter((c) => !used.has(c)).map((c) => `<div class="bk-note">${esc(c.text)}</div>`).join('');
  return `<div class="bk-scripts">${out.join('')}${tail}</div>`;
}

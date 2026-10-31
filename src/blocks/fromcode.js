// Turns a behavior program (JavaScript) into Blockly blocks, keeping its
// shape: the same statements in the same order and nesting. The result is
// Blockly's JSON serialization plus, for every statement block, its offset in
// the code (the id trace.js reports while that statement runs, and the id a
// clicked script is run by). Anything without a block of its own becomes a
// gray block holding its JavaScript, so nothing is ever lost.
import { parse } from 'acorn';
import { SPEC, BY_FN, BY_PART, MENUS, OPS } from './lexicon.js';

const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression');
const q = (s) => JSON.stringify(s);
const CAPS = new Set(['bb_return', 'bb_break', 'bb_continue', 'bb_report', 'bb_forever']);
const EVENT_FNS = new Set(Object.values(SPEC).filter((s) => s.shape === 'hat' && s.fn).map((s) => s.fn));
const PRIMS = new Set([...Object.keys(BY_FN), 'part', 'thing', 'place', 'forever', 'see', 'look', 'nearest', 'touching', 'position', 'isClone', 'is', 'random', 'clone']);

// Text and notes show "\n" for a new line, since a field is one line.
export const escText = (s) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
export const unescText = (s) => s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));

export function shadowFor(kind, value) {
  if (kind === 'num') return { type: 'bb_num', fields: { NUM: Number(value) || 0 } };
  if (kind === 'text') return { type: 'bb_text', fields: { TEXT: escText(String(value)) } };
  if (MENUS[kind]) return { type: `bb_m_${kind}`, fields: { V: value } };
  return null;
}

export function codeToBlocks(code) {
  const comments = [];
  let ast;
  try {
    ast = parse(code, {
      ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true,
      onComment: (block, text, start, end) => comments.push({ text: text.split('\n').map((l) => l.trim().replace(/^\* ?/, '')).join('\n').trim(), start, end }),
    });
  } catch (err) {
    return { error: err.message };
  }
  let nextId = 1;
  const at = {};
  const used = new Set();
  const src = (n) => code.slice(n.start, n.end);

  const blk = (type, o = {}, pos) => {
    const b = { type, id: `b${nextId++}`, ...o };
    if (pos != null) at[b.id] = pos;
    return b;
  };
  // Raw JavaScript keeps its own relative indentation; the generator indents it again.
  const rawText = (n) => {
    for (const c of comments) if (c.start >= n.start && c.end <= n.end) used.add(c);
    const lineStart = code.lastIndexOf('\n', n.start - 1) + 1;
    const indent = /^[ \t]*/.exec(code.slice(lineStart, n.start))[0].length;
    return src(n).split('\n').map((l, i) => (i ? l.replace(new RegExp(`^[ \\t]{0,${indent}}`), '') : l)).join('\n');
  };
  const raws = []; // where the gray blocks' code is: [start, end]
  const raw = (n) => { raws.push([n.start, n.end]); return blk('bb_raw', { fields: { CODE: rawText(n) } }, n.start); };
  const rawR = (n) => blk('bb_rawR', { fields: { CODE: rawText(n) } });

  // Comments sitting before a statement, or after it on the same line, become
  // notes above it.
  function notesFor(n) {
    const lineEnd = code.indexOf('\n', n.end);
    const out = [];
    for (const c of comments) {
      if (used.has(c)) continue;
      if (c.end <= n.start || (c.start >= n.end && (lineEnd < 0 || c.start < lineEnd))) {
        used.add(c);
        out.push(blk('bb_note', { fields: { TEXT: escText(c.text) } }));
      }
    }
    return out;
  }

  // Link a list of statement blocks into a stack; returns the first one.
  function chain(list) {
    for (let i = 0; i < list.length - 1; i++) {
      if (CAPS.has(list[i].type)) list[i] = raw(list[i]._node); // nothing can follow a cap block
    }
    for (let i = list.length - 1; i > 0; i--) list[i - 1].next = { block: list[i] };
    for (const b of list) delete b._node;
    return list[0] ?? null;
  }
  const stack = (list) => {
    const first = chain(list);
    return first ? { block: first } : undefined;
  };
  // drop helper-only keys anywhere in the tree
  const clean = (b) => {
    if (!b || typeof b !== 'object') return b;
    delete b._node;
    for (const v of Object.values(b.inputs ?? {})) { clean(v.block); }
    if (b.next) clean(b.next.block);
    return b;
  };

  // ---- slots -------------------------------------------------------------------
  // The code for a menu value, if this node is one: "red", null, thing("tower"),
  // or an object filter of plain words.
  function menuCode(n) {
    if (!n) return null;
    if (n.type === 'Literal' && typeof n.value === 'string') return q(n.value);
    if (n.type === 'Literal' && n.value === null) return 'null';
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'thing'
      && n.arguments.length === 1 && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string') return `thing(${q(n.arguments[0].value)})`;
    if (n.type === 'ObjectExpression' && n.properties.length && n.properties.every((p) => p.type === 'Property' && !p.computed && p.key.type === 'Identifier'
      && p.value.type === 'Literal' && typeof p.value.value === 'string')) {
      return `{${n.properties.map((p) => `${p.key.name}: ${q(p.value.value)}`).join(', ')}}`;
    }
    return null;
  }
  const numValue = (n) => {
    if (n?.type === 'Literal' && typeof n.value === 'number') return n.value;
    if (n?.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'Literal' && typeof n.argument.value === 'number') return -n.argument.value;
    return null;
  };

  function slot(kind, def, n) {
    if (n === undefined) {
      const sh = shadowFor(kind, def);
      return sh ? { shadow: sh } : undefined;
    }
    if (kind === 'num' && numValue(n) != null) return { shadow: shadowFor('num', numValue(n)) };
    if (kind === 'text' && n.type === 'Literal' && typeof n.value === 'string') return { shadow: shadowFor('text', n.value) };
    if (MENUS[kind]) {
      const c = menuCode(n);
      if (c != null) return { shadow: shadowFor(kind, c) };
    }
    const sh = shadowFor(kind, def);
    return sh ? { shadow: sh, block: expr(n) } : { block: expr(n) };
  }
  const slotsFor = (spec, args, names = spec.params) => {
    const inputs = {}, fields = {};
    names.forEach((name, i) => {
      const [kind, def] = spec.slots[name];
      if (kind === 'key') fields[name] = args[i].value;
      else {
        const s = slot(kind, def, args[i]);
        if (s) inputs[name] = s;
      }
    });
    return { inputs, fields };
  };

  // ---- expressions -------------------------------------------------------------
  function expr(n) {
    switch (n.type) {
      case 'AwaitExpression': {
        const c = n.argument;
        if (c.type === 'CallExpression' && c.callee.type === 'Identifier') {
          const name = c.callee.name;
          if (name === 'clone' && c.arguments.length <= 2) {
            const s = SPEC.bb_cloneR;
            return blk('bb_cloneR', slotsFor(s, c.arguments));
          }
          const s = BY_FN[name];
          if (s?.awaits && c.arguments.length <= s.params.length && !c.arguments.some((a) => a.type === 'SpreadElement')) return blk(s.type, slotsFor(s, c.arguments));
          if (!PRIMS.has(name) && !c.arguments.some((a) => a.type === 'SpreadElement')) return callBlock('bb_callR', c, true);
        }
        return rawR(n);
      }
      case 'Literal':
        if (typeof n.value === 'number') return blk('bb_num', { fields: { NUM: n.value } });
        if (typeof n.value === 'string') return blk('bb_text', { fields: { TEXT: escText(n.value) } });
        if (typeof n.value === 'boolean') return blk('bb_bool', { fields: { V: String(n.value) } });
        if (n.value === null) return blk('bb_null');
        return rawR(n);
      case 'Identifier':
        if (n.name === 'undefined' || n.name === 'NaN' || n.name === 'Infinity') return rawR(n);
        return blk('bb_varGet', { fields: { V: n.name } });
      case 'TemplateLiteral': {
        const parts = [];
        n.quasis.forEach((qs, i) => {
          if (qs.value.cooked) parts.push({ shadow: shadowFor('text', qs.value.cooked) });
          if (n.expressions[i]) parts.push({ shadow: shadowFor('text', ''), block: expr(n.expressions[i]) });
        });
        if (n.quasis.some((qs) => qs.value.cooked == null)) return rawR(n);
        const inputs = {};
        parts.forEach((p, i) => { inputs[`P${i}`] = p; });
        return blk('bb_join', { extraState: { n: parts.length }, inputs });
      }
      case 'BinaryExpression': {
        const arith = OPS.arith.find(([, op]) => op === n.operator);
        if (arith) return blk('bb_arith', { fields: { OP: n.operator }, inputs: { A: slot('num', 0, n.left), B: slot('num', 0, n.right) } });
        if (OPS.compare.some(([, op]) => op === n.operator)) {
          return blk('bb_compare', { fields: { OP: n.operator }, inputs: { A: slot('any', null, n.left), B: slot('num', 0, n.right) } });
        }
        return rawR(n);
      }
      case 'LogicalExpression':
        if (n.operator === '??') return rawR(n);
        return blk('bb_logic', { fields: { OP: n.operator }, inputs: { A: slot('bool', null, n.left), B: slot('bool', null, n.right) } });
      case 'UnaryExpression':
        if (n.operator === '!') return blk('bb_not', { inputs: { A: slot('bool', null, n.argument) } });
        if (numValue(n) != null) return blk('bb_num', { fields: { NUM: numValue(n) } });
        return rawR(n);
      case 'ConditionalExpression':
        return blk('bb_ternary', { inputs: { C: slot('bool', null, n.test), A: slot('text', '', n.consequent), B: slot('text', '', n.alternate) } });
      case 'MemberExpression':
        if (n.optional || n.object.type === 'Super') return rawR(n);
        if (n.computed) return blk('bb_item', { inputs: { I: slot('num', 0, n.property), L: slot('any', null, n.object) } });
        if (n.property.type !== 'Identifier' || (n.object.type === 'Identifier' && /^(Math|Promise|JSON|Object|Number|String|Array)$/.test(n.object.name))) return rawR(n);
        if (n.property.name === 'length') return blk('bb_length', { inputs: { A: slot('text', '', n.object) } });
        return blk('bb_prop', { fields: { P: n.property.name }, inputs: { O: slot('any', null, n.object) } });
      case 'ArrayExpression': {
        if (n.elements.some((e) => !e || e.type === 'SpreadElement')) return rawR(n);
        const inputs = {};
        n.elements.forEach((e, i) => { inputs[`I${i}`] = slot('any', null, e); });
        return blk('bb_list', { extraState: { n: n.elements.length }, inputs });
      }
      case 'CallExpression':
        return callExpr(n) ?? rawR(n);
      default:
        return rawR(n);
    }
  }

  function callExpr(n) {
    const c = n.callee;
    const args = n.arguments;
    if (args.some((a) => a.type === 'SpreadElement') || n.optional) return null;
    if (c.type === 'Identifier') {
      const name = c.name;
      if (name === 'thing') {
        const mc = menuCode(n);
        if (mc) return blk('bb_m_target', { fields: { V: mc } });
        if (args.length === 1) return blk('bb_thing', { inputs: { ID: slot('text', '', args[0]) } });
        return null;
      }
      const s = BY_FN[name];
      if (s) {
        if (s.awaits || (s.shape !== 'reporter' && s.shape !== 'boolean') || args.length > s.params.length) return null;
        return blk(s.type, slotsFor(s, args));
      }
      if (!PRIMS.has(name) && !EVENT_FNS.has(name)) return callBlock('bb_callR', n, false);
      return null;
    }
    if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') {
      const p = c.property.name;
      if (c.object.type === 'Identifier' && c.object.name === 'Math') {
        if (OPS.math.some(([, f]) => f === p) && args.length === 1) return blk('bb_math', { fields: { F: p }, inputs: { A: slot('num', 0, args[0]) } });
        if (OPS.minmax.some(([, f]) => f === p) && args.length === 2) return blk('bb_minmax', { fields: { F: p }, inputs: { A: slot('num', 0, args[0]), B: slot('num', 0, args[1]) } });
        if (p === 'random' && !args.length) return blk('bb_fraction');
        return null;
      }
      if (p === 'repeat' && args.length === 1) return blk('bb_repeatText', { inputs: { A: slot('text', '', c.object), N: slot('num', 0, args[0]) } });
      if (p === 'includes' && args.length === 1) return blk('bb_contains', { inputs: { A: slot('text', '', c.object), B: slot('text', '', args[0]) } });
    }
    return null;
  }

  // A call to one of the program's own functions.
  function callBlock(type, n, awaited) {
    const inputs = {};
    n.arguments.forEach((a, i) => { inputs[`A${i}`] = slot('any', null, a); });
    return blk(type, { extraState: { name: n.callee.name, args: n.arguments.length, ...(awaited ? {} : { noWait: true }) }, inputs });
  }

  // ---- statements --------------------------------------------------------------
  // A block's statements, then any notes left at its end.
  const list = (stmts, inside) => {
    const out = stmts.flatMap((s) => [...notesFor(s), ...stmt(s)]);
    if (inside) {
      for (const c of comments) {
        if (!used.has(c) && c.start > inside.start && c.end < inside.end) { used.add(c); out.push(blk('bb_note', { fields: { TEXT: escText(c.text) } })); }
      }
    }
    return out;
  };
  const body = (n) => (n.type === 'BlockStatement' ? list(n.body, n) : list([n]));
  const withNode = (b, n) => Object.assign(b, { _node: n });

  // The statements of a handler or function. An expression body (`() => jump()`)
  // is its one statement, awaited, since its value is what the handler waits on.
  function fnStatements(fn) {
    if (fn.body.type === 'BlockStatement') return list(fn.body.body, fn.body);
    const e = fn.body;
    const fake = { type: 'ExpressionStatement', expression: e, start: e.start, end: e.end };
    if (e.type === 'CallExpression') {
      return [...notesFor(fake), ...exprStmt({ ...fake, expression: { type: 'AwaitExpression', argument: e, start: e.start, end: e.end } })];
    }
    return [...notesFor(fake), ...stmt(fake)];
  }
  const simpleParams = (fn) => fn.params.every((p) => p.type === 'Identifier');

  // An event: onKey("a", async () => {...}), and the same with a function's name.
  function eventBlock(call, s, inner) {
    const name = call.callee.name;
    const spec = Object.values(SPEC).find((x) => x.fn === name && x.shape === 'hat' && !x.inner);
    const args = call.arguments;
    let fn = args[args.length - 1];
    let given = args.slice(0, -1);
    if (name === 'onTouch' && args.length === 1) given = [];
    if (!spec || !fn || given.length > spec.params.length) return null;
    if (spec.params.some((p, i) => spec.slots[p][0] === 'key' && !(given[i]?.type === 'Literal' && typeof given[i].value === 'string'))) return null;
    if (name !== 'onTouch' && spec.params.length && given.length < spec.params.length) return null;
    let stmts, params = [];
    if (isFn(fn)) {
      if (!simpleParams(fn) || fn.generator) return null;
      params = fn.params.map((p) => p.name);
      stmts = fnStatements(fn);
    } else if (fn.type === 'Identifier') {
      stmts = [blk('bb_call', { extraState: { name: fn.name, args: 0 } }, fn.start)];
    } else return null;
    const { inputs, fields } = slotsFor(spec, given);
    const first = chain(stmts);
    // a hat's script hangs below it; the same event inside a script holds it in its mouth
    if (first && inner) inputs.DO = { block: first };
    return blk(inner ? `${spec.type}_in` : spec.type, {
      fields, inputs, ...(params.length ? { extraState: { params } } : {}), ...(first && !inner ? { next: { block: first } } : {}),
    }, s.start);
  }

  function stmt(s) {
    switch (s.type) {
      case 'ExpressionStatement': return exprStmt(s);
      case 'VariableDeclaration': {
        if (s.declarations.some((d) => d.id.type !== 'Identifier')) return [raw(s)];
        return s.declarations.map((d) => withNode(blk('bb_varDeclare', {
          fields: { V: d.id.name },
          ...(d.init ? { inputs: { X: slot('num', 0, d.init) } } : { extraState: { bare: true } }),
        }, s.start), s));
      }
      case 'IfStatement': {
        const inputs = { C: slot('bool', null, s.test), DO: stack(body(s.consequent)) };
        if (!s.alternate) return [withNode(blk('bb_if', { inputs }, s.start), s)];
        inputs.ELSE = stack(s.alternate.type === 'IfStatement' ? [...notesFor(s.alternate), ...stmt(s.alternate)] : body(s.alternate));
        return [withNode(blk('bb_ifElse', { inputs }, s.start), s)];
      }
      case 'WhileStatement':
        return [withNode(blk('bb_while', { inputs: { C: slot('bool', null, s.test), DO: stack(body(s.body)) } }, s.start), s)];
      case 'ForStatement': {
        const counted = countedLoop(s);
        if (!counted) return [raw(s)];
        return [withNode(blk('bb_repeat', { extraState: counted.state, inputs: { N: slot('num', 10, counted.times), DO: stack(body(s.body)) } }, s.start), s)];
      }
      case 'ForOfStatement': {
        const d = s.left.type === 'VariableDeclaration' && s.left.declarations.length === 1 ? s.left.declarations[0] : null;
        if (!d || d.id.type !== 'Identifier' || s.await) return [raw(s)];
        return [withNode(blk('bb_forEach', { fields: { V: d.id.name }, inputs: { L: slot('any', null, s.right), DO: stack(body(s.body)) } }, s.start), s)];
      }
      case 'ReturnStatement':
        return [withNode(s.argument ? blk('bb_report', { inputs: { V: slot('any', null, s.argument) } }, s.start) : blk('bb_return', {}, s.start), s)];
      case 'BreakStatement': return s.label ? [raw(s)] : [withNode(blk('bb_break', {}, s.start), s)];
      case 'ContinueStatement': return s.label ? [raw(s)] : [withNode(blk('bb_continue', {}, s.start), s)];
      case 'EmptyStatement': return [];
      default: return [raw(s)];
    }
  }

  // for (let i = 0; i < N; i++) -> "repeat N times", counting with i if the body uses it
  function countedLoop(s) {
    const d = s.init?.type === 'VariableDeclaration' && s.init.kind === 'let' && s.init.declarations.length === 1 ? s.init.declarations[0] : null;
    if (!d || d.init?.type !== 'Literal' || d.init.value !== 0 || d.id.type !== 'Identifier') return null;
    const v = d.id.name;
    if (s.test?.type !== 'BinaryExpression' || s.test.operator !== '<' || s.test.left.type !== 'Identifier' || s.test.left.name !== v) return null;
    if (s.update?.type !== 'UpdateExpression' || s.update.operator !== '++' || s.update.argument.type !== 'Identifier' || s.update.argument.name !== v) return null;
    if (new RegExp(`\\b${v}\\b`).test(src(s.test.right))) return null;
    const usedInBody = new RegExp(`\\b${v}\\b`).test(src(s.body));
    return { times: s.test.right, state: { v, ...(usedInBody ? { used: true } : {}) } };
  }

  function exprStmt(s) {
    let e = s.expression;
    const awaited = e.type === 'AwaitExpression';
    if (awaited) e = e.argument;
    if (e.type === 'CallExpression') return callStmt(e, s, awaited) ?? [raw(s)];
    if (awaited) return [raw(s)];
    if (e.type === 'AssignmentExpression' && e.left.type === 'Identifier') {
      const v = e.left.name;
      const same = (x) => x.type === 'Identifier' && x.name === v;
      const change = (by) => [withNode(blk('bb_varChange', { fields: { V: v }, inputs: { X: by } }, s.start), s)];
      if (e.operator === '+=') return change(slot('num', 1, e.right));
      if (e.operator === '=' && e.right.type === 'BinaryExpression' && e.right.operator === '+' && same(e.right.left)) return change(slot('num', 1, e.right.right));
      const minus = e.operator === '-=' ? e.right : e.operator === '=' && e.right.type === 'BinaryExpression' && e.right.operator === '-' && same(e.right.left) ? e.right.right : null;
      if (minus && numValue(minus) != null) return change({ shadow: shadowFor('num', -numValue(minus)) });
      if (e.operator === '=') return [withNode(blk('bb_varSet', { fields: { V: v }, inputs: { X: slot('num', 0, e.right) } }, s.start), s)];
      return [raw(s)];
    }
    if (e.type === 'UpdateExpression' && e.argument.type === 'Identifier') {
      return [withNode(blk('bb_varChange', { fields: { V: e.argument.name }, inputs: { X: { shadow: shadowFor('num', e.operator === '++' ? 1 : -1) } } }, s.start), s)];
    }
    return [raw(s)];
  }

  function callStmt(e, s, awaited) {
    const c = e.callee;
    const args = e.arguments;
    if (args.some((a) => a.type === 'SpreadElement') || e.optional) return null;
    if (c.type === 'Identifier') {
      const name = c.name;
      if (name === 'forever') {
        if (args.length !== 1 || !isFn(args[0]) || args[0].params.length) return null;
        return [withNode(blk('bb_forever', { inputs: { DO: stack(fnStatements(args[0])) } }, s.start), s)];
      }
      if (EVENT_FNS.has(name)) {
        const b = eventBlock(e, s, true);
        return b ? [withNode(b, s)] : null;
      }
      if (name === 'spawn') return spawnBlock(e, s);
      const spec = BY_FN[name];
      if (spec) {
        if (spec.shape !== 'stmt' || args.length > spec.params.length) return null;
        const b = blk(spec.type, slotsFor(spec, args), s.start);
        if (spec.wait && !awaited) b.extraState = { noWait: true };
        return [withNode(b, s)];
      }
      if (PRIMS.has(name)) return null;
      const b = callBlock('bb_call', e, awaited);
      at[b.id] = s.start;
      return [withNode(b, s)];
    }
    if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') {
      const o = c.object;
      // part("arm").turnTo(90)
      if (o.type === 'CallExpression' && o.callee.type === 'Identifier' && o.callee.name === 'part' && o.arguments.length === 1) {
        const spec = BY_PART[c.property.name];
        if (!spec || args.length > spec.params.length) return null;
        const { inputs, fields } = slotsFor(spec, args);
        inputs.P = slot('part', spec.slots.P[1], o.arguments[0]);
        const b = blk(spec.type, { inputs, fields }, s.start);
        if (spec.wait && !awaited) b.extraState = { noWait: true };
        return [withNode(b, s)];
      }
      // await Promise.all([a(), b()]) -> "at the same time"
      if (awaited && o.type === 'Identifier' && o.name === 'Promise' && c.property.name === 'all' && args.length === 1 && args[0].type === 'ArrayExpression') {
        const inner = [];
        for (const el of args[0].elements) {
          if (el?.type !== 'CallExpression') return null;
          const fake = { type: 'ExpressionStatement', expression: el, start: el.start, end: el.end };
          const got = callStmt(el, fake, true);
          if (!got) return null;
          for (const b of got) delete at[b.id]; // not statements of their own: nothing reports them running
          inner.push(...got);
        }
        return [withNode(blk('bb_together', { inputs: { DO: stack(inner) } }, s.start), s)];
      }
    }
    return null;
  }

  // spawn({color: "red", launch: 18}): one slot for each option it sets
  const SPAWN_KINDS = { color: 'color', size: 'size', at: 'at', launch: 'num', from: 'part', shape: 'shape' };
  function spawnBlock(e, s) {
    const [opts, ...rest] = e.arguments;
    if (rest.length) return null;
    if (opts && (opts.type !== 'ObjectExpression' || opts.properties.some((p) => p.type !== 'Property' || p.computed || p.shorthand || p.key.type !== 'Identifier' || !SPAWN_KINDS[p.key.name]))) return null;
    const keys = opts ? opts.properties.map((p) => p.key.name) : [];
    if (new Set(keys).size !== keys.length) return null;
    const inputs = {};
    for (const p of opts?.properties ?? []) inputs[p.key.name] = slot(SPAWN_KINDS[p.key.name], MENUS[SPAWN_KINDS[p.key.name]]?.def ?? 0, p.value);
    return [withNode(blk('bb_spawn', { extraState: { keys, ...(opts ? {} : { bare: true }) }, inputs }, s.start), s)];
  }

  // ---- top level ---------------------------------------------------------------
  // Events and function definitions start their own scripts (a hat on top);
  // runs of anything else share a stack.
  function topLevel(s) {
    const e = s.type === 'ExpressionStatement' && s.expression;
    if (e?.type === 'CallExpression' && e.callee.type === 'Identifier') {
      if (e.callee.name === 'forever') {
        const f = callStmt(e, s, false);
        if (f) return blk('bb_onStart', { next: { block: clean(f[0]) } }, s.start);
      }
      if (EVENT_FNS.has(e.callee.name)) return eventBlock(e, s, false);
    }
    if (s.type === 'FunctionDeclaration' && !s.generator && simpleParams(s)) {
      return defineBlock(s.id.name, s, 'function', s);
    }
    if (s.type === 'VariableDeclaration' && s.declarations.length === 1 && isFn(s.declarations[0].init) && s.declarations[0].id.type === 'Identifier'
      && !s.declarations[0].init.generator && simpleParams(s.declarations[0].init)) {
      return defineBlock(s.declarations[0].id.name, s.declarations[0].init, s.kind, s);
    }
    return null;
  }
  function defineBlock(name, fn, style, s) {
    let stmts;
    if (fn.body.type === 'BlockStatement') stmts = list(fn.body.body, fn.body);
    else stmts = [withNode(blk('bb_report', { inputs: { V: slot('any', null, fn.body) } }, fn.body.start), fn.body)];
    const first = chain(stmts);
    return blk('bb_define', {
      extraState: { name, params: fn.params.map((p) => p.name), ...(fn.async ? { async: true } : {}), style },
      ...(first ? { next: { block: first } } : {}),
    }, s.start);
  }

  const tops = [];
  let loose = [];
  const flush = () => { if (loose.length) tops.push(chain(loose)); loose = []; };
  for (const s of ast.body) {
    const notes = notesFor(s);
    const top = topLevel(s);
    if (top) {
      flush();
      if (notes.length) tops.push(chain(notes));
      tops.push(top);
    } else loose.push(...notes, ...stmt(s));
  }
  flush();
  const tail = comments.filter((c) => !used.has(c)).map((c) => blk('bb_note', { fields: { TEXT: escText(c.text) } }));
  if (tail.length) tops.push(chain(tail));
  tops.forEach((b, i) => { clean(b); b.x = 0; b.y = i * 1000; });
  return { json: { blocks: { languageVersion: 0, blocks: tops } }, at, order: tops.map((b) => b.id), raws };
}

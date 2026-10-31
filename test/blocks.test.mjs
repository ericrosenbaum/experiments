// Blocks <-> code. Every premade program and every test program turns into
// Blockly blocks and back into JavaScript that does the same thing (the same
// syntax tree, once harmless differences are smoothed out), and doing it
// again changes nothing. Premade programs draw without gray code blocks, and
// every block in the lexicon is used somewhere.
import assert from 'node:assert/strict';
import { parse } from 'acorn';
import { codeToBlocks } from '../src/blocks/fromcode.js';
import { Blockly, toCode, paletteContents, gen } from '../src/blocks/blockly.js';
import { SPEC } from '../src/blocks/lexicon.js';
import { corpus } from '../tools/blocks-corpus.mjs';
import { PROGRAMS } from './blocks-programs.js';

const roundTrip = (code) => {
  const r = codeToBlocks(code);
  assert.ok(!r.error, `should parse: ${r.error}\n${code}`);
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(r.json, ws);
  const types = ws.getAllBlocks(false).map((b) => b.type);
  const out = toCode(ws);
  const saved = Blockly.serialization.workspaces.save(ws);
  ws.dispose();
  return { ...out, types, from: r, saved };
};

// ---- an equivalence check on syntax trees ------------------------------------------
const ACTIONS = new Set(Object.values(SPEC).filter((s) => s.fn && !s.wait && !s.awaits && s.shape === 'stmt').map((s) => s.fn));
const DEFAULTS = {};
for (const s of Object.values(SPEC)) {
  if (!s.fn || s.inner || s.shape === 'hat' || s.special) continue;
  DEFAULTS[s.fn] = s.params.map((p) => s.slots[p]);
}
const PART_DEFAULTS = Object.fromEntries(Object.values(SPEC).filter((s) => s.part).map((s) => [s.part, s.params.map((p) => s.slots[p])]));
const lit = ([kind, def]) => {
  if (kind === 'num') return { type: 'Literal', value: def };
  if (kind === 'text') return { type: 'Literal', value: def };
  const v = JSON.parse(def);
  return { type: 'Literal', value: v };
};
const EVENTS = new Set(Object.values(SPEC).filter((s) => s.shape === 'hat' && s.fn).map((s) => s.fn));
const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression');

function normalize(code) {
  const ast = parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
  const block = (s) => (s.type === 'BlockStatement' ? s : { type: 'BlockStatement', body: [s] });
  const uses = (n, name) => {
    if (!n || typeof n !== 'object') return false;
    if (n.type === 'Identifier' && n.name === name) return true;
    return Object.values(n).some((v) => uses(v, name));
  };
  function fix(n) {
    if (Array.isArray(n)) return n.map(fix).filter((x) => x?.type !== 'EmptyStatement');
    if (!n || typeof n !== 'object') return n;
    // handlers: always async, always a block body; an expression body is awaited
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && (EVENTS.has(n.callee.name) || n.callee.name === 'forever')) {
      if (n.callee.name === 'onTouch' && n.arguments.length === 1) n.arguments.unshift({ type: 'Literal', value: null });
      const last = n.arguments.length - 1;
      const fn = n.arguments[last];
      if (fn?.type === 'Identifier') {
        n.arguments[last] = { type: 'ArrowFunctionExpression', async: true, params: [], body: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'AwaitExpression', argument: { type: 'CallExpression', callee: fn, arguments: [] } } }] } };
      } else if (isFn(fn)) {
        fn.type = 'ArrowFunctionExpression';
        fn.async = true;
        fn.id = null;
        if (fn.body.type !== 'BlockStatement') {
          const e = fn.body;
          fn.body = { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: e.type === 'CallExpression' ? { type: 'AwaitExpression', argument: e } : e }] };
        }
        fn.expression = false;
      }
      // onStart(async () => { forever(...) }) is the same as forever(...)
      const f = n.arguments[0];
      if (n.callee.name === 'onStart' && f?.body?.body?.length === 1 && f.params.length === 0) {
        const only = f.body.body[0].expression;
        if (only?.type === 'CallExpression' && only.callee.name === 'forever') return fix(only);
      }
    }
    if (n.type === 'ArrowFunctionExpression' && n.body.type !== 'BlockStatement') {
      n.body = { type: 'BlockStatement', body: [{ type: 'ReturnStatement', argument: n.body }] };
      n.expression = false;
    }
    // defaults the sandbox fills in
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && DEFAULTS[n.callee.name]) {
      DEFAULTS[n.callee.name].forEach((d, i) => { if (n.arguments[i] === undefined && d[1] !== undefined && d[0] !== 'any' && d[0] !== 'bool') n.arguments[i] = lit(d); });
    }
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'CallExpression' && n.callee.object.callee.name === 'part') {
      (PART_DEFAULTS[n.callee.property.name] ?? []).forEach((d, i) => { if (n.arguments[i] === undefined) n.arguments[i] = lit(d); });
    }
    // await on an instant action changes nothing
    if (n.type === 'AwaitExpression' && n.argument.type === 'CallExpression' && n.argument.callee.type === 'Identifier' && ACTIONS.has(n.argument.callee.name)) return fix(n.argument);
    if (n.type === 'IfStatement') { n.consequent = block(n.consequent); if (n.alternate && n.alternate.type !== 'IfStatement') n.alternate = block(n.alternate); }
    if (/^(For|ForOf|ForIn|While|DoWhile)Statement$/.test(n.type)) n.body = block(n.body);
    if (n.type === 'VariableDeclaration') n.kind = 'let';
    // a counted loop's name doesn't matter when nothing uses it
    if (n.type === 'ForStatement' && n.init?.declarations?.length === 1 && !uses(n.body, n.init.declarations[0].id.name)) {
      const v = n.init.declarations[0].id.name;
      const s = JSON.stringify(n.init) + JSON.stringify(n.test.left) + JSON.stringify(n.update);
      if (s.includes(v)) { n.init.declarations[0].id.name = '_'; n.test.left.name = '_'; n.update.argument.name = '_'; }
    }
    // x++, x = x + 1, x -= 1 ... -> x += ...
    if (n.type === 'UpdateExpression' && n.argument.type === 'Identifier') {
      return fix({ type: 'AssignmentExpression', operator: '+=', left: n.argument, right: { type: 'Literal', value: n.operator === '++' ? 1 : -1 } });
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') {
      const r = n.right;
      if (n.operator === '=' && r.type === 'BinaryExpression' && (r.operator === '+' || r.operator === '-') && r.left.type === 'Identifier' && r.left.name === n.left.name) {
        if (r.operator === '+') return fix({ ...n, operator: '+=', right: r.right });
        if (r.right.type === 'Literal' && typeof r.right.value === 'number') return fix({ ...n, operator: '+=', right: { type: 'Literal', value: -r.right.value } });
      }
      if (n.operator === '-=' && n.right.type === 'Literal' && typeof n.right.value === 'number') return fix({ ...n, operator: '+=', right: { type: 'Literal', value: -n.right.value } });
    }
    if (n.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'Literal' && typeof n.argument.value === 'number') return { type: 'Literal', value: -n.argument.value };
    if (n.type === 'TemplateElement') return { type: 'TemplateElement', cooked: n.value.cooked };
    if (n.type === 'Literal') return { type: 'Literal', value: n.regex ? String(n.value) : n.value };
    const out = {};
    for (const [k, v] of Object.entries(n)) {
      if (k === 'start' || k === 'end' || k === 'raw' || k === 'loc') continue;
      if (['id', 'expression', 'generator', 'optional'].includes(k) && !v) continue;
      out[k] = fix(v);
    }
    return out;
  }
  return JSON.stringify(fix(ast));
}

// ---- every program ------------------------------------------------------------------
const programs = [...corpus().map((p) => ({ ...p, premade: true })), ...PROGRAMS.map((code, i) => ({ where: `test program ${i + 1}`, code }))];
const seenTypes = new Set();
let rawCount = 0;
for (const p of programs) {
  const one = roundTrip(p.code);
  one.types.forEach((t) => seenTypes.add(t));
  assert.doesNotThrow(() => parse(one.code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true }), `${p.where}: the blocks' code should parse\n${one.code}`);
  const [a, b] = [normalize(one.code), normalize(p.code)];
  if (a !== b) {
    let i = 0;
    while (a[i] === b[i]) i++;
    assert.fail(`${p.where}: the blocks should do what the code does\n--- code\n${p.code}\n--- from the blocks\n${one.code}\n--- first difference\n${a.slice(i - 80, i + 120)}\n${b.slice(i - 80, i + 120)}`);
  }
  // again: nothing changes
  const two = roundTrip(one.code);
  assert.equal(two.code, one.code, `${p.where}: a second round trip should change nothing`);
  // where the generator says each statement starts is where the code says it does
  const want = Object.values(two.from.at).sort((a, b) => a - b);
  const got = [...new Set(Object.values(one.at))].sort((a, b) => a - b);
  assert.deepEqual([...new Set(want)], got, `${p.where}: statement offsets should match`);
  for (const [id, pos] of Object.entries(one.at)) {
    const ch = one.code.slice(pos, pos + 1);
    assert.ok(/[\w/({[`"!+\-]/.test(ch), `${p.where}: block ${id} should start at a statement, not "${one.code.slice(pos, pos + 20)}"`);
  }
  if (p.premade) {
    const raws = one.types.filter((t) => t === 'bb_raw' || t === 'bb_rawR');
    rawCount += raws.length;
    assert.ok(raws.length === 0, `${p.where}: "${p.text}" should draw without gray code blocks\n${p.code}`);
  }
}

// the code before any edit: the converter's offsets are where its statements start
{
  const code = PROGRAMS[0];
  const r = codeToBlocks(code);
  const ast = parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true });
  const starts = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (/Statement$|Declaration$/.test(n.type ?? '') && n.type !== 'BlockStatement') starts.add(n.start);
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };
  walk(ast);
  for (const pos of Object.values(r.at)) assert.ok(starts.has(pos) || /\w/.test(code[pos]), `offset ${pos} should be a statement`);
}

// every block in the lexicon shows up in some program
const missing = Object.keys(SPEC).filter((t) => !seenTypes.has(t) && !t.startsWith('bb_m_') && !t.endsWith('_in'));
assert.deepEqual(missing, [], 'every block should be used by some test program');

// the palette: every category has blocks, every block type (but menus) is offered, and each one makes code
const palette = paletteContents();
const offered = new Set(palette.flatMap((c) => c.blocks.map((b) => b.type)));
const notOffered = Object.keys(SPEC).filter((t) => !offered.has(t) && !t.startsWith('bb_m_') && !t.endsWith('_in') && t !== 'bb_num' && t !== 'bb_text');
assert.deepEqual(notOffered, [], 'every block should be in the palette');
for (const cat of palette) {
  assert.ok(cat.blocks.length, `${cat.name} should have blocks`);
  for (const def of cat.blocks) {
    const ws = new Blockly.Workspace();
    const { kind, ...state } = def;
    const b = Blockly.serialization.blocks.append(state, ws);
    let { code } = toCode(ws);
    if (b.outputConnection) code = `log(${gen.blockToCode(b)[0]});`;
    assert.doesNotThrow(() => parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true }), `${def.type} from the palette should make code that parses:\n${code}`);
    ws.dispose();
  }
}

// Blocks put together by hand (as from the palette) write sensible code.
const fromState = (blocks) => {
  const ws = new Blockly.Workspace();
  for (const b of blocks) Blockly.serialization.blocks.append(b, ws);
  const { code } = toCode(ws);
  ws.dispose();
  assert.doesNotThrow(() => parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true }), `should parse:\n${code}`);
  return code;
};
const num = (n) => ({ shadow: { type: 'bb_num', fields: { NUM: n } } });
const stmts = (...list) => { for (let i = list.length - 1; i > 0; i--) list[i - 1].next = { block: list[i] }; return { block: list[0] }; };
// "stop repeating" and "skip" outside a loop end this run of the script instead
assert.equal(fromState([{ type: 'bb_onStart', next: stmts({ type: 'bb_break' }) }]), 'onStart(async () => {\n  return;\n});\n');
assert.equal(fromState([{ type: 'bb_forever', inputs: { DO: stmts({ type: 'bb_continue' }) } }]), 'forever(async () => {\n  return;\n});\n');
assert.ok(fromState([{ type: 'bb_while', inputs: { DO: stmts({ type: 'bb_break' }) } }]).includes('break;'));
// a function that now waits for something becomes async; one that doesn't stays as it was
assert.ok(fromState([{ type: 'bb_define', extraState: { name: 'f', style: 'function' }, next: stmts({ type: 'bb_wait', inputs: { N: num(1) } }) }]).startsWith('async function f() {'));
assert.ok(fromState([{ type: 'bb_define', extraState: { name: 'f', style: 'function' }, next: stmts({ type: 'bb_jump', inputs: { N: num(1) } }) }]).startsWith('function f() {'));
// waiting inside an event inside a function doesn't make the function async
assert.ok(fromState([{ type: 'bb_define', extraState: { name: 'g', style: 'function' }, next: stmts({ type: 'bb_onKey_in', fields: { KEY: 'a' }, inputs: { DO: stmts({ type: 'bb_wait', inputs: { N: num(1) } }) } }) }]).startsWith('function g() {'));
// new loops count with i, then j inside
assert.ok(/for \(let i = 0; i < 2; i\+\+\) \{\n {2}for \(let j = 0; j < 3; j\+\+\)/.test(fromState([{ type: 'bb_repeat', inputs: { N: num(2), DO: stmts({ type: 'bb_repeat', inputs: { N: num(3) } }) } }])));
// text with quotes, backticks, ${ and new lines survives both ways
{
  const tricky = 'a "b" `c` ${d} \\ e\nf';
  const code = `say(\`${tricky.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\n/g, '\\n')}\${x}\`, 2);\nsay(${JSON.stringify(tricky)}, 2);\n`;
  const once = roundTrip(code).code;
  assert.equal(normalize(once), normalize(code), `tricky text should survive:\n${code}\n${once}`);
}
// "at the same time" with a stack inside one of its slots
assert.ok(fromState([{ type: 'bb_together', inputs: { DO: stmts({ type: 'bb_turn', inputs: { N: num(90) } }, { type: 'bb_jump', inputs: { N: num(5) } }) } }]).startsWith('await Promise.all([turn(90), jump(5)]);'));
// "don't wait": the await goes
assert.equal(fromState([{ type: 'bb_move', extraState: { noWait: true }, inputs: { N: num(5), S: num(7) } }]), 'move(5, 7);\n');

console.log(`blocks: ${programs.length} programs round-trip, ${seenTypes.size} block types used, ${rawCount} gray blocks in premade programs; all checks passed`);

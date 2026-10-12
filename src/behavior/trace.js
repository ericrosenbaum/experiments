// Adds tracing to a behavior program so the blocks view can light up what is
// running. Every statement inside a function is wrapped as
//   try { __on(ID); <statement> } finally { __off(ID); }
// and every event handler or function body as a whole is wrapped the same way,
// so its hat block glows while it runs. ID is the statement's offset in the
// original code, which is also the block's data-at in src/ui/blocks.js.
// try/finally keeps return, break and errors working exactly as before.
import { parse } from 'acorn';

const EVENTS = new Set(['onStart', 'onKey', 'onKeyUp', 'whileKey', 'onTouch', 'onMessage', 'onClone', 'forever', 'every']);
const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration');
// Declarations can't go inside a try block without changing their scope.
const NO_WRAP = new Set(['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration', 'EmptyStatement', 'BlockStatement']);

export function instrument(code) {
  let ast;
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
  } catch {
    return code; // the sandbox reports the typo
  }
  const edits = [];
  let depth = 0;
  const wrap = (start, end, open, close) => {
    depth++;
    edits.push({ pos: start, text: open, close: false, depth }, { pos: end, text: close, close: true, depth });
  };
  const hatOf = new Map(); // function node -> the id of the block that names it

  // Which functions are event handlers or definitions, and the hat they belong to.
  function noteHandlers(s, top) {
    const e = s.type === 'ExpressionStatement' && (s.expression.type === 'AwaitExpression' ? s.expression.argument : s.expression);
    if (e?.type === 'CallExpression' && e.callee.type === 'Identifier' && EVENTS.has(e.callee.name)) {
      const fn = e.arguments[e.arguments.length - 1];
      if (isFn(fn)) hatOf.set(fn, s.start);
      else if (fn?.type === 'Identifier') { // onKey("r", startHole)
        wrap(fn.start, fn.end, `(async (...__a) => { __on(${s.start}); __on(${fn.start}); try { return await `,
          ` (...__a); } finally { __off(${fn.start}); __off(${s.start}); } })`);
      }
    }
    if (s.type === 'FunctionDeclaration') hatOf.set(s, s.start);
    if (top && s.type === 'VariableDeclaration' && s.declarations.length === 1 && isFn(s.declarations[0].init)) hatOf.set(s.declarations[0].init, s.start);
  }

  function visitFn(fn) {
    const hat = hatOf.get(fn);
    const b = fn.body;
    if (b.type === 'BlockStatement') {
      if (hat !== undefined) wrap(b.start + 1, b.end - 1, ` __on(${hat}); try {`, `} finally { __off(${hat}); } `);
      for (const s of b.body) visitStmt(s, true);
    } else {
      // () => steer(70): the hat and the one block under it (blocks.js draws it at b.start)
      if (hat !== undefined && code[b.start - 1] !== '(') {
        wrap(b.start, b.end, `{ __on(${hat}); __on(${b.start}); try { return (`, `); } finally { __off(${b.start}); __off(${hat}); } }`);
      }
      visitNode(b);
    }
  }

  function visitStmt(s, inFn, labeled = false) {
    if (!s) return;
    noteHandlers(s, !inFn);
    if (inFn && !labeled && !NO_WRAP.has(s.type)) wrap(s.start, s.end, `try { __on(${s.start}); `, ` } finally { __off(${s.start}); }`);
    else if (inFn && s.type === 'VariableDeclaration') edits.push({ pos: s.start, text: `__on(${s.start}); __off(${s.start}); `, close: false, depth: ++depth });
    switch (s.type) {
      case 'BlockStatement': s.body.forEach((x) => visitStmt(x, inFn)); break;
      case 'IfStatement': visitNode(s.test); visitStmt(s.consequent, inFn); visitStmt(s.alternate, inFn); break;
      case 'ForStatement': visitNode(s.init); visitNode(s.test); visitNode(s.update); visitStmt(s.body, inFn); break;
      case 'ForOfStatement': case 'ForInStatement': visitNode(s.right); visitStmt(s.body, inFn); break;
      case 'WhileStatement': case 'DoWhileStatement': visitNode(s.test); visitStmt(s.body, inFn); break;
      case 'LabeledStatement': visitStmt(s.body, inFn, true); break;
      case 'TryStatement': visitStmt(s.block, inFn); if (s.handler) visitStmt(s.handler.body, inFn); visitStmt(s.finalizer, inFn); break;
      case 'FunctionDeclaration': visitFn(s); break;
      default: visitNode(s);
    }
  }

  // Look through expressions for functions (handlers, callbacks).
  function visitNode(n) {
    if (!n || typeof n.type !== 'string') return;
    if (isFn(n)) return visitFn(n);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === 'string' && visitNode(x));
      else if (v && typeof v.type === 'string') visitNode(v);
    }
  }

  // Mark each top-level script so the sandbox can run it on its own when its
  // stack is clicked: __hat(ID) before an event, __def(ID, fn) after a
  // function definition (clicking "define" runs the function).
  for (const s of ast.body) {
    const e = s.type === 'ExpressionStatement' && (s.expression.type === 'AwaitExpression' ? s.expression.argument : s.expression);
    if (e?.type === 'CallExpression' && e.callee.type === 'Identifier' && EVENTS.has(e.callee.name)) {
      edits.push({ pos: s.start, text: `__hat(${s.start}); `, close: false, depth: 0 });
    } else if (s.type === 'FunctionDeclaration' && s.id) {
      edits.push({ pos: s.end, text: ` __def(${s.start}, ${s.id.name});`, close: false, depth: 0 });
    } else if (s.type === 'VariableDeclaration' && s.declarations.length === 1 && isFn(s.declarations[0].init) && s.declarations[0].id.type === 'Identifier') {
      edits.push({ pos: s.end, text: ` __def(${s.start}, ${s.declarations[0].id.name});`, close: false, depth: 0 });
    }
  }
  for (const s of ast.body) visitStmt(s, false);

  // Apply insertions back to front. At the same spot: closings before
  // openings, inner closings first, outer openings first.
  edits.sort((a, b) => a.pos - b.pos || (a.close === b.close ? (a.close ? b.depth - a.depth : a.depth - b.depth) : a.close ? -1 : 1));
  let out = '';
  let at = 0;
  for (const e of edits) { out += code.slice(at, e.pos) + e.text; at = e.pos; }
  return out + code.slice(at);
}

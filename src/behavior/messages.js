// The messages things use to coordinate: which ones a program sends with
// broadcast(name) and which it listens for with onMessage(name, ...). Read
// from the code with acorn, so comments and strings don't fool it. A name
// built from pieces ("whack " + power) keeps its fixed start: "whack …".
import { parse } from 'acorn';

function nameOf(n) {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral') return n.expressions.length ? `${n.quasis[0].value.cooked}…` : n.quasis[0].value.cooked;
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const left = nameOf(n.left);
    return left == null ? null : left.endsWith('…') ? left : `${left}…`;
  }
  return null;
}

export function messagesIn(code) {
  const sends = new Set(), hears = new Set();
  let ast;
  try { ast = parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true }); } catch { return { sends, hears }; }
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
      const name = nameOf(n.arguments[0]);
      if (name) {
        if (n.callee.name === 'broadcast') sends.add(name);
        if (n.callee.name === 'onMessage') hears.add(name);
      }
    }
    for (const k in n) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && k !== 'loc') walk(v);
    }
  };
  walk(ast);
  return { sends, hears };
}

// Every message in a world: [{name, sentBy: [thing names], heardBy: [...]}],
// from things' enabled behaviors. behaviorsByKey: Map(key -> behaviors);
// nameFor(key) gives a thing's display name.
export function worldMessages(behaviorsByKey, nameFor) {
  const all = new Map();
  const entry = (name) => {
    if (!all.has(name)) all.set(name, { name, sentBy: new Set(), heardBy: new Set() });
    return all.get(name);
  };
  for (const [key, list] of behaviorsByKey) {
    for (const b of list) {
      if (!b.enabled || !b.code) continue;
      const { sends, hears } = messagesIn(b.code);
      for (const n of sends) entry(n).sentBy.add(nameFor(key));
      for (const n of hears) entry(n).heardBy.add(nameFor(key));
    }
  }
  return [...all.values()].map((m) => ({ name: m.name, sentBy: [...m.sentBy], heardBy: [...m.heardBy] }));
}

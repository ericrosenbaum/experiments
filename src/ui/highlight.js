// JavaScript syntax highlighting for the code view. It is a regex tokenizer,
// not a parser, so half-typed code (an unclosed string, a stray brace) still
// colors sensibly while a kid is editing.

const KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do', 'else', 'export',
  'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'switch',
  'throw', 'try', 'typeof', 'var', 'void', 'while', 'yield',
]);
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'this', 'NaN', 'Infinity']);

const TOKEN = new RegExp([
  /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))/.source, // 1 comment
  /("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\[\s\S])*`?)/.source, // 2 string
  /(\b\d+(?:\.\d+)?\b|\.\d+\b)/.source, // 3 number
  /([A-Za-z_$][\w$]*)(?=\s*\()/.source, // 4 function call
  /([A-Za-z_$][\w$]*)/.source, // 5 word
  /(=>|[=!<>]=?=?|&&|\|\||[-+*/%?:])/.source, // 6 operator
].join('|'), 'g');

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const span = (cls, s) => `<span class="hl-${cls}">${esc(s)}</span>`;

export function highlight(code) {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    out += esc(code.slice(last, m.index));
    last = m.index + m[0].length;
    const [all, comment, string, number, call, word, op] = m;
    if (comment) out += span('comment', all);
    else if (string) out += span('string', all);
    else if (number) out += span('number', all);
    else if (call) out += span(KEYWORDS.has(call) ? 'keyword' : 'fn', all);
    else if (word) out += span(KEYWORDS.has(word) ? 'keyword' : LITERALS.has(word) ? 'literal' : 'name', all);
    else if (op) out += span('op', all);
    else out += esc(all);
  }
  // a trailing newline needs something after it or the layer is a line short
  return out + esc(code.slice(last)) + '\n';
}

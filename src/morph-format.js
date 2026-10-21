// Reading and writing morphs (MelodyMorph documents).
//
// In memory a morph is plain data:
//   { title, author, description,
//     view: { zoom, x, y },            // framing, as on a 1024x768 screen
//     bells:    [{ x, y, note, octave, instrument }],
//     recBells: [{ x, y, notes: [{ time, note, octave, velocity, instrument }] }],
//     paths:    [{ x, y, points: [{ x, y, t }] }],   // points relative to x, y
//     lines:    [[{ x, y }, ...]] }
//
// The iPad app saved ofxXmlSettings files: a run of top-level tags with no
// root element. We read and write that format so old files still open, and
// use a compact JSON form for share links.

import { SCREEN_START_X, SCREEN_START_Y } from './config.js';

export function emptyMorph() {
  return {
    title: '',
    author: '',
    description: '',
    view: { zoom: 1, x: SCREEN_START_X, y: SCREEN_START_Y },
    bells: [],
    recBells: [],
    paths: [],
    lines: [],
  };
}

// --- a minimal XML reader, enough for ofxXmlSettings files ---

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return ENTITIES[e] ?? m;
  });
const encode = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** Parse into a tree of { tag, children, text }; the root has tag ''. */
export function parseXmlTree(xml) {
  const root = { tag: '', children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([\w:.-]+)[^>]*?(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) {
      top.text += decode(m[4]);
    } else if (m[2]) {
      if (m[1]) {
        if (stack.length > 1) stack.pop();
      } else {
        const node = { tag: m[2], children: [], text: '' };
        top.children.push(node);
        if (!m[3]) stack.push(node);
      }
    }
  }
  return root;
}

const kids = (node, tag) => node.children.filter((c) => c.tag === tag);
const kid = (node, tag) => node.children.find((c) => c.tag === tag);
const text = (node, path, fallback = '') => {
  let n = node;
  for (const tag of path.split(':')) {
    n = n && kid(n, tag);
  }
  return n ? n.text.trim() : fallback;
};
const num = (node, path, fallback) => {
  const v = parseFloat(text(node, path, ''));
  return Number.isFinite(v) ? v : fallback;
};

/** Read an ofxXmlSettings morph file. Defaults match the original loader. */
export function morphFromXml(xml) {
  const doc = parseXmlTree(xml);
  const morph = emptyMorph();
  morph.title = text(doc, 'TITLE:TEXT');
  morph.author = text(doc, 'AUTHOR:TEXT');
  morph.description = text(doc, 'DESCRIPTION:TEXT');
  morph.view = {
    zoom: num(doc, 'ZOOM:VALUE', 1),
    x: num(doc, 'SCREENPOS:X', SCREEN_START_X),
    y: num(doc, 'SCREENPOS:Y', SCREEN_START_Y),
  };
  morph.bells = kids(doc, 'BELL').map((b) => ({
    x: num(b, 'X', 0),
    y: num(b, 'Y', 0),
    note: num(b, 'NOTENUM', 0),
    octave: num(b, 'OCTAVE', 1),
    instrument: num(b, 'INSTRUMENT', 2),
  }));
  morph.recBells = kids(doc, 'RECBELL').map((b) => ({
    x: num(b, 'X', 0),
    y: num(b, 'Y', 0),
    notes: kids(b, 'NOTE').map((n) => ({
      time: num(n, 'TIME', 0),
      note: num(n, 'NOTE', 0),
      octave: num(n, 'OCTAVE', 0),
      velocity: num(n, 'VELOCITY', 1),
      instrument: num(n, 'INSTRUMENT', 0),
    })),
  }));
  morph.paths = kids(doc, 'PATHPLAYER').map((p) => ({
    x: num(p, 'X', 0),
    y: num(p, 'Y', 0),
    points: kids(p, 'P').map((pt) => ({ x: num(pt, 'X', 0), y: num(pt, 'Y', 0), t: num(pt, 'T', 0) })),
  }));
  morph.lines = kids(doc, 'LINE').map((l) => kids(l, 'P').map((pt) => ({ x: num(pt, 'X', 0), y: num(pt, 'Y', 0) })));
  // a recorder bell with no notes can't be drawn or played; the app never made one
  morph.recBells = morph.recBells.filter((b) => b.notes.length > 0);
  return morph;
}

/** Write a morph in the iPad app's file format. */
export function morphToXml(morph) {
  const out = [];
  const tag = (depth, name, body) => {
    const pad = '    '.repeat(depth);
    if (typeof body === 'function') {
      out.push(`${pad}<${name}>`);
      body(depth + 1);
      out.push(`${pad}</${name}>`);
    } else {
      out.push(`${pad}<${name}>${encode(body)}</${name}>`);
    }
  };
  const round = (v, places = 6) => +(+v).toFixed(places);
  tag(0, 'TITLE', (d) => tag(d, 'TEXT', morph.title ?? ''));
  tag(0, 'AUTHOR', (d) => tag(d, 'TEXT', morph.author ?? ''));
  tag(0, 'DESCRIPTION', (d) => tag(d, 'TEXT', morph.description ?? ''));
  tag(0, 'THUMBPATH', (d) => tag(d, 'LARGE', ''));
  tag(0, 'ZOOM', (d) => tag(d, 'VALUE', round(morph.view.zoom)));
  tag(0, 'SCREENPOS', (d) => {
    tag(d, 'X', round(morph.view.x, 4));
    tag(d, 'Y', round(morph.view.y, 4));
  });
  for (const b of morph.bells) {
    tag(0, 'BELL', (d) => {
      tag(d, 'X', Math.round(b.x));
      tag(d, 'Y', Math.round(b.y));
      tag(d, 'NOTENUM', b.note);
      tag(d, 'OCTAVE', b.octave);
      tag(d, 'INSTRUMENT', b.instrument);
    });
  }
  for (const b of morph.recBells) {
    tag(0, 'RECBELL', (d) => {
      tag(d, 'X', Math.round(b.x));
      tag(d, 'Y', Math.round(b.y));
      for (const n of b.notes) {
        tag(d, 'NOTE', (d2) => {
          tag(d2, 'TIME', round(n.time));
          tag(d2, 'NOTE', n.note);
          tag(d2, 'OCTAVE', n.octave);
          tag(d2, 'VELOCITY', round(n.velocity));
          tag(d2, 'INSTRUMENT', n.instrument);
        });
      }
    });
  }
  for (const p of morph.paths) {
    tag(0, 'PATHPLAYER', (d) => {
      tag(d, 'X', Math.round(p.x));
      tag(d, 'Y', Math.round(p.y));
      for (const pt of p.points) {
        tag(d, 'P', (d2) => {
          tag(d2, 'T', round(pt.t));
          tag(d2, 'X', Math.round(pt.x));
          tag(d2, 'Y', Math.round(pt.y));
        });
      }
    });
  }
  for (const line of morph.lines) {
    tag(0, 'LINE', (d) => {
      for (const pt of line) {
        tag(d, 'P', (d2) => {
          tag(d2, 'X', Math.round(pt.x));
          tag(d2, 'Y', Math.round(pt.y));
        });
      }
    });
  }
  return out.join('\n') + '\n';
}

// --- compact JSON, for share links and local saves ---

const r0 = Math.round;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function morphToCompact(m) {
  return {
    v: 1,
    t: m.title,
    a: m.author,
    d: m.description,
    z: [Math.round(m.view.zoom * 10000) / 10000, r0(m.view.x), r0(m.view.y)],
    b: m.bells.map((b) => [r0(b.x), r0(b.y), b.note, b.octave, b.instrument]),
    r: m.recBells.map((b) => [
      r0(b.x),
      r0(b.y),
      b.notes.map((n) => [r3(n.time), n.note, n.octave, n.instrument, r3(n.velocity)]),
    ]),
    p: m.paths.map((p) => [r0(p.x), r0(p.y), p.points.flatMap((pt) => [r0(pt.x), r0(pt.y), r3(pt.t)])]),
    l: m.lines.map((line) => line.flatMap((pt) => [r0(pt.x), r0(pt.y)])),
  };
}

export function morphFromCompact(c) {
  if (!c || c.v !== 1) throw new Error('Not a MelodyMorph file');
  const triples = (a) => Array.from({ length: Math.floor(a.length / 3) }, (_, i) => a.slice(i * 3, i * 3 + 3));
  const pairs = (a) => Array.from({ length: Math.floor(a.length / 2) }, (_, i) => a.slice(i * 2, i * 2 + 2));
  return {
    title: c.t ?? '',
    author: c.a ?? '',
    description: c.d ?? '',
    view: { zoom: c.z[0], x: c.z[1], y: c.z[2] },
    bells: (c.b ?? []).map(([x, y, note, octave, instrument]) => ({ x, y, note, octave, instrument })),
    recBells: (c.r ?? []).map(([x, y, notes]) => ({
      x,
      y,
      notes: notes.map(([time, note, octave, instrument, velocity]) => ({ time, note, octave, instrument, velocity })),
    })),
    paths: (c.p ?? []).map(([x, y, pts]) => ({ x, y, points: triples(pts).map(([px, py, t]) => ({ x: px, y: py, t })) })),
    lines: (c.l ?? []).map((pts) => pairs(pts).map(([x, y]) => ({ x, y }))),
  };
}

/** Read a file's text as either format. */
export function morphFromText(textContent) {
  const s = textContent.trim();
  if (s.startsWith('{')) return morphFromCompact(JSON.parse(s));
  return morphFromXml(s);
}

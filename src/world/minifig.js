// Minifigure meshes. Proportions are measured from the minifigure design
// patent (US D253,711, figs. 1 and 2) at 64 px per stud. Everything is built
// in "figure space": y = 0 under the feet, +z forward, +x the figure's left.
//
// Geometry primitives used here, beyond the boxes bricks are made of:
//   lathe        the head and the neck (a rounded cylinder)
//   taperedBox   the torso (narrower at the shoulders)
//   extruded     the legs (their side profile, with the foot sticking out)
//   tube         the arms (bent forward at the elbow)
//   cClip        the hands
//   wavyLathe    shaggy hair (a lathe whose profile changes around the axis)
//   decal        faces, torso prints and leg prints, drawn on a canvas
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { material, colorHex } from './bricks.js';

// Measured dimensions, in studs.
export const FIG = {
  legH: 1.94, legW: 0.95, legGap: 0.1, legBack: -0.55, thighFront: 0.27, toe: 0.56, footH: 0.5,
  hipH: 0.28,
  torsoH: 1.72, torsoBottomW: 1.94, torsoTopW: 1.36, torsoD: 1.1,
  neckH: 0.19, neckR: 0.43,
  headH: 1.18, headR: 0.68, studH: 0.21, studR: 0.32,
  shoulder: [0.94, 3.66, 0], // left arm pivot (mirror x for the right)
};
FIG.hipY = FIG.legH;
FIG.torsoY = FIG.legH + FIG.hipH;
FIG.neckY = FIG.torsoY + FIG.torsoH;
FIG.headY = FIG.neckY + FIG.neckH;
FIG.top = FIG.headY + FIG.headH + FIG.studH;

const SKIN = 'yellow';

// ---- primitives ----------------------------------------------------------------

function mesh(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, opts.material ?? material(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A cylinder with rounded top and bottom edges, standing on y = 0.
export function roundedCylinder(r, h, bottomFillet, topFillet, segments = 40) {
  const pts = [new THREE.Vector2(0, 0)];
  const arc = (cx, cy, rad, a0, a1) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (a1 - a0) * (i / 6);
      pts.push(new THREE.Vector2(cx + rad * Math.cos(a), cy + rad * Math.sin(a)));
    }
  };
  arc(r - bottomFillet, bottomFillet, bottomFillet, -Math.PI / 2, 0);
  arc(r - topFillet, h - topFillet, topFillet, 0, Math.PI / 2);
  pts.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(pts, segments);
}

// A dome-topped shell (helmets, hair), standing on y = 0: radius r, height h,
// rounded over the top with radius `round`. Leave out the front with `open`
// (degrees of the face left uncovered).
export function shell(r, h, round, open = 0, thickness = 0.06, segments = 40) {
  const outer = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    outer.push(new THREE.Vector2(r - round + round * Math.cos(a), h - round + round * Math.sin(a)));
  }
  const pts = [new THREE.Vector2(r - thickness, 0), new THREE.Vector2(r, 0), ...outer, new THREE.Vector2(0, h)];
  const gap = (open * Math.PI) / 180;
  const g = new THREE.LatheGeometry(pts, segments, gap / 2, Math.PI * 2 - gap);
  return g;
}

// A lathe whose profile may change around the axis: profile(phi) gives the
// [r, y] points for that angle (the same number for every angle), bottom to
// top. phi = 0 is the front (+z), positive toward the figure's left (+x).
export function wavyLathe(profile, segments = 64) {
  const cols = [];
  for (let i = 0; i <= segments; i++) cols.push(profile((i / segments) * Math.PI * 2));
  const rows = cols[0].length;
  const pos = [], uv = [], idx = [];
  cols.forEach((pts, i) => {
    const phi = (i / segments) * Math.PI * 2;
    pts.forEach(([r, y], j) => { pos.push(r * Math.sin(phi), y, r * Math.cos(phi)); uv.push(i / segments, j / (rows - 1)); });
  });
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = (i + 1) * rows + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const n = g.attributes.normal; // the first and last columns coincide: share their normals so there's no seam
  for (let j = 0; j < rows; j++) {
    const a = j, b = segments * rows + j;
    const v = new THREE.Vector3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// A thin surface that follows a side profile ([z, y] points, bottom to top),
// `width` across x: a decal that can wrap a curved front. uv v runs along it.
function strip(profile, width) {
  const pos = [], uv = [], idx = [], d = [0];
  for (let i = 1; i < profile.length; i++) d.push(d[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const len = d[d.length - 1];
  profile.forEach(([z, y], i) => { for (const s of [-1, 1]) { pos.push((s * width) / 2, y, z); uv.push((s + 1) / 2, d[i] / len); } });
  for (let i = 0; i < profile.length - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// A box whose top is narrower (in x) than its bottom, standing on y = 0.
export function taperedBox(bottomW, topW, h, d) {
  const g = new THREE.BoxGeometry(bottomW, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) p.setX(i, p.getX(i) * (topW / bottomW));
    p.setY(i, p.getY(i) + h / 2);
  }
  g.computeVertexNormals();
  return g;
}

// A side profile ([z, y] points, counter-clockwise) extruded across x.
export function extruded(profile, width, bevel = 0.03) {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10,
  });
  g.rotateY(-Math.PI / 2); // shape x -> figure z, extrusion -> -x
  g.translate(width / 2 - bevel, 0, 0);
  return g;
}

// A C-shaped clip: a thick ring with a gap, axis along z.
export function cClip(outer, inner, depth, gapDeg = 70) {
  const gap = (gapDeg * Math.PI) / 180;
  const a0 = -Math.PI / 2 + gap / 2, a1 = 1.5 * Math.PI - gap / 2;
  const s = new THREE.Shape();
  s.absarc(0, 0, outer, a0, a1, false);
  s.absarc(0, 0, inner, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 20 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// A canvas drawn once and used as a see-through texture.
function canvasTexture(w, h, draw) {
  if (typeof document === 'undefined') return null; // headless tests
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Thin shells are seen from both sides; casting shadows from their back face avoids striped self-shadowing.
const doubleSided = (color) => { const m = material(color).clone(); m.side = THREE.DoubleSide; m.shadowSide = THREE.BackSide; return m; };
const decalMaterial = (map) => new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.32, polygonOffset: true, polygonOffsetFactor: -2 });

// ---- faces ------------------------------------------------------------------------

const FACES = {
  smile(g, w, h) {
    g.fillStyle = '#111';
    for (const x of [0.4, 0.6]) { g.beginPath(); g.ellipse(w * x, h * 0.4, w * 0.022, h * 0.075, 0, 0, Math.PI * 2); g.fill(); }
    g.lineWidth = w * 0.018; g.lineCap = 'round'; g.strokeStyle = '#111';
    g.beginPath(); g.arc(w * 0.5, h * 0.42, w * 0.13, Math.PI * 0.22, Math.PI * 0.78); g.stroke();
  },
  stern(g, w, h) {
    FACES.smile(g, w, h);
    g.clearRect(w * 0.3, h * 0.55, w * 0.4, h * 0.3);
    g.strokeStyle = '#111'; g.lineWidth = w * 0.016; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.36, h * 0.24); g.lineTo(w * 0.44, h * 0.29); g.moveTo(w * 0.64, h * 0.24); g.lineTo(w * 0.56, h * 0.29); g.stroke();
    g.beginPath(); g.moveTo(w * 0.42, h * 0.66); g.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.58, h * 0.66); g.stroke();
  },
  mustache(g, w, h) {
    FACES.smile(g, w, h);
    g.fillStyle = '#5a3a1a';
    g.beginPath(); g.ellipse(w * 0.455, h * 0.6, w * 0.06, h * 0.06, 0.25, 0, Math.PI * 2); g.ellipse(w * 0.545, h * 0.6, w * 0.06, h * 0.06, -0.25, 0, Math.PI * 2); g.fill();
  },
  freckles(g, w, h) {
    FACES.smile(g, w, h);
    g.fillStyle = '#c06a2a';
    for (const [x, y] of [[0.36, 0.55], [0.39, 0.6], [0.34, 0.6], [0.64, 0.55], [0.61, 0.6], [0.66, 0.6]]) { g.beginPath(); g.arc(w * x, h * y, w * 0.007, 0, Math.PI * 2); g.fill(); }
  },
  alien(g, w, h) {
    g.fillStyle = '#111';
    for (const [x, a] of [[0.39, 0.5], [0.61, -0.5]]) { g.beginPath(); g.ellipse(w * x, h * 0.42, w * 0.06, h * 0.17, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff';
    for (const x of [0.37, 0.59]) { g.beginPath(); g.arc(w * x, h * 0.34, w * 0.012, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#111'; g.lineWidth = w * 0.012; g.lineCap = 'round';
    g.beginPath(); g.arc(w * 0.5, h * 0.6, w * 0.05, Math.PI * 0.25, Math.PI * 0.75); g.stroke();
  },
  scowl(g, w, h) { // heavy brows (his left one arched higher), a pencil mustache, a frown, a soul patch and rusty stubble
    g.fillStyle = '#111';
    for (const x of [0.415, 0.585]) { g.beginPath(); g.ellipse(w * x, h * 0.544, w * 0.026, h * 0.066, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff';
    for (const x of [0.4, 0.57]) { g.beginPath(); g.arc(w * x, h * 0.51, w * 0.0085, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#111'; // brows: thick at the nose, tapering outward, outer ends higher
    g.beginPath(); g.moveTo(w * 0.31, h * 0.425); g.lineTo(w * 0.455, h * 0.468); g.lineTo(w * 0.455, h * 0.534); g.lineTo(w * 0.31, h * 0.462); g.fill();
    g.beginPath(); g.moveTo(w * 0.545, h * 0.446); g.lineTo(w * 0.545, h * 0.512); g.lineTo(w * 0.675, h * 0.42); g.lineTo(w * 0.675, h * 0.382); g.fill();
    g.strokeStyle = '#111'; g.lineCap = 'round';
    g.lineWidth = w * 0.0115; // a pencil mustache: two thin strokes from under the nose, drooping, hooked down at the ends
    g.beginPath(); g.moveTo(w * 0.5, h * 0.68); g.quadraticCurveTo(w * 0.45, h * 0.69, w * 0.405, h * 0.718); g.moveTo(w * 0.5, h * 0.68); g.quadraticCurveTo(w * 0.55, h * 0.69, w * 0.595, h * 0.718); g.stroke();
    g.lineWidth = w * 0.016;
    g.beginPath(); g.moveTo(w * 0.408, h * 0.714); g.lineTo(w * 0.4, h * 0.742); g.moveTo(w * 0.592, h * 0.714); g.lineTo(w * 0.6, h * 0.742); g.stroke();
    g.lineWidth = w * 0.012; // a thin frown
    g.beginPath(); g.moveTo(w * 0.435, h * 0.826); g.quadraticCurveTo(w * 0.5, h * 0.794, w * 0.565, h * 0.826); g.stroke();
    g.fillStyle = '#111'; // soul patch
    g.beginPath(); g.moveTo(w * 0.477, h * 0.862); g.lineTo(w * 0.523, h * 0.862); g.lineTo(w * 0.5, h * 0.92); g.fill();
    g.fillStyle = '#8f3f2add'; // rusty stubble: a beard shadow along each jaw, under the mouth and over the chin
    const frac = (v) => v - Math.floor(v);
    const dot = (x, y) => { g.beginPath(); g.arc(w * x, h * y, w * 0.006, 0, Math.PI * 2); g.fill(); };
    for (let i = 0; i < 24; i++) { // a low-discrepancy scatter, so the dots don't line up
      const a = frac(i * 0.7548776662 + 0.11), b = frac(i * 0.5698402910 + 0.29);
      const t = 0.7 + 0.27 * b, u = 0.16 + (0.13 + 0.13 * b) * a; // the cheek widens toward the chin
      dot(u, t); dot(1 - u + 0.01 * (a - 0.5), t + 0.01 * (b - 0.5));
    }
    for (let i = 0; i < 12; i++) dot(0.36 + 0.28 * frac(i * 0.7548776662 + 0.5), 0.93 + 0.065 * frac(i * 0.5698402910 + 0.7));
    for (const [x, y] of [[0.43, 0.86], [0.455, 0.885], [0.57, 0.86], [0.545, 0.885]]) dot(x, y);
  },
};

// The face wraps around the front of the head, covering this much of its height (bottom to top).
const FACE_SPAN = { scowl: [0.02, 0.92] };
function face(kind) {
  const map = canvasTexture(512, 256, FACES[kind] ?? FACES.smile);
  if (!map) return null;
  const [lo, hi] = FACE_SPAN[kind] ?? [0.07, 0.87];
  const arc = (150 * Math.PI) / 180;
  const g = new THREE.CylinderGeometry(FIG.headR + 0.004, FIG.headR + 0.004, FIG.headH * (hi - lo), 40, 1, true, -arc / 2, arc);
  const m = new THREE.Mesh(g, decalMaterial(map));
  m.name = 'face';
  m.position.y = FIG.headY + FIG.headH * ((lo + hi) / 2);
  return m;
}

// ---- torso prints -------------------------------------------------------------------

const PRINTS = {
  // classic space logo
  space(g, w, h) {
    g.fillStyle = '#d6a64a'; g.beginPath(); g.arc(w * 0.5, h * 0.4, w * 0.12, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#7a2a12'; g.lineWidth = w * 0.025; g.beginPath(); g.ellipse(w * 0.5, h * 0.42, w * 0.24, h * 0.07, -0.35, 0.1, Math.PI * 2 - 0.4); g.stroke();
    g.fillStyle = '#c0261a'; g.beginPath(); g.moveTo(w * 0.7, h * 0.27); g.lineTo(w * 0.78, h * 0.22); g.lineTo(w * 0.74, h * 0.32); g.fill();
  },
  knight(g, w, h) { // a lion-ish crest on a shield
    g.fillStyle = '#f7c600'; g.beginPath(); g.moveTo(w * 0.32, h * 0.2); g.lineTo(w * 0.68, h * 0.2); g.lineTo(w * 0.68, h * 0.5); g.quadraticCurveTo(w * 0.68, h * 0.72, w * 0.5, h * 0.82); g.quadraticCurveTo(w * 0.32, h * 0.72, w * 0.32, h * 0.5); g.fill();
    g.fillStyle = '#c0261a'; g.beginPath(); g.arc(w * 0.5, h * 0.45, w * 0.09, 0, Math.PI * 2); g.fill();
  },
  overalls(g, w, h) {
    g.fillStyle = '#2f5fae';
    g.fillRect(w * 0.18, h * 0.45, w * 0.64, h * 0.55);
    g.fillRect(w * 0.26, 0, w * 0.1, h * 0.5); g.fillRect(w * 0.64, 0, w * 0.1, h * 0.5);
    g.fillStyle = '#f7c600'; for (const x of [0.31, 0.69]) { g.beginPath(); g.arc(w * x, h * 0.47, w * 0.025, 0, Math.PI * 2); g.fill(); }
  },
  buttons(g, w, h) {
    g.fillStyle = '#ffffffcc'; for (const y of [0.3, 0.5, 0.7]) { g.beginPath(); g.arc(w * 0.5, h * y, w * 0.025, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#00000055'; g.lineWidth = w * 0.012; g.beginPath(); g.moveTo(w * 0.5, h * 0.02); g.lineTo(w * 0.5, h); g.stroke();
  },
  zip(g, w, h) {
    g.strokeStyle = '#333'; g.lineWidth = w * 0.02; g.beginPath(); g.moveTo(w * 0.5, 0); g.lineTo(w * 0.5, h); g.stroke();
    g.fillStyle = '#9ba19d'; g.fillRect(w * 0.6, h * 0.25, w * 0.15, h * 0.1);
  },
  jersey(g, w, h) { // a team shirt: a white V-neck, a white stripe down each side and a ball on the chest
    g.strokeStyle = '#f2f3f2'; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = w * 0.045; g.beginPath(); g.moveTo(w * 0.36, h * 0.01); g.lineTo(w * 0.5, h * 0.2); g.lineTo(w * 0.64, h * 0.01); g.stroke();
    g.lineWidth = w * 0.05; for (const x of [0.13, 0.87]) { g.beginPath(); g.moveTo(w * x, h * 0.05); g.lineTo(w * (x < 0.5 ? x - 0.04 : x + 0.04), h); g.stroke(); }
    g.fillStyle = '#f2f3f2'; g.beginPath(); g.arc(w * 0.66, h * 0.4, w * 0.075, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1d20'; g.beginPath(); g.arc(w * 0.66, h * 0.4, w * 0.028, 0, Math.PI * 2); g.fill();
  },
  suit(g, w, h) { // an open jacket, lapels drawn in light lines, over a narrow purple vest with six ring buttons; a white collar at the neck
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#ffffff2e'; g.lineWidth = w * 0.007; // faint drape lines down the jacket
    for (const [x0, x1] of [[0.1, 0.13], [0.18, 0.21], [0.26, 0.3], [0.9, 0.87], [0.82, 0.79], [0.74, 0.7]]) { g.beginPath(); g.moveTo(w * x0, h * 0.12); g.quadraticCurveTo(w * ((x0 + x1) / 2 + (x0 < 0.5 ? 0.02 : -0.02)), h * 0.55, w * x1, h * 0.98); g.stroke(); }
    g.fillStyle = '#f2f2ee'; g.beginPath(); g.moveTo(w * 0.456, 0); g.lineTo(w * 0.544, 0); g.lineTo(w * 0.5, h * 0.135); g.fill(); // shirt
    const vestEdge = [[0.415, 0.04], [0.395, 0.257], [0.37, 0.624], [0.355, 0.882], [0.35, 0.95]]; // his right edge; mirrored for the left
    const X = (m, u) => w * (0.5 + m * (u - 0.5));
    g.fillStyle = '#6b43a8'; // vest, with a V neck around the shirt
    g.beginPath(); g.moveTo(X(1, 0.415), h * 0.04); g.lineTo(w * 0.456, h * 0.02); g.lineTo(w * 0.5, h * 0.135); g.lineTo(w * 0.544, h * 0.02);
    for (const [u, y] of vestEdge) g.lineTo(X(-1, u), h * y);
    for (const [u, y] of [...vestEdge].reverse()) g.lineTo(X(1, u), h * y);
    g.fill();
    g.strokeStyle = '#b4aec8'; g.lineWidth = w * 0.011; // the jacket's edges and lapels
    for (const m of [1, -1]) {
      g.beginPath(); vestEdge.forEach(([u, y], k) => (k ? g.lineTo : g.moveTo).call(g, X(m, u), h * y)); g.stroke(); // front edge, along the vest
      g.beginPath(); g.moveTo(X(m, 0.26), h * 0.055); g.quadraticCurveTo(X(m, 0.3), h * 0.5, X(m, 0.348), h * 0.882); g.stroke(); // lapel fold
      g.beginPath(); g.moveTo(X(m, 0.26), h * 0.055); g.lineTo(X(m, 0.415), h * 0.04); g.stroke(); // collar
    }
    for (let i = 0; i < 6; i++) { // ring buttons down the vest
      const y = h * (0.251 + i * 0.107);
      g.fillStyle = '#8a63c4'; g.beginPath(); g.arc(w * 0.5, y, w * 0.028, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2a1548'; g.lineWidth = w * 0.009; g.beginPath(); g.arc(w * 0.5, y, w * 0.028, 0, Math.PI * 2); g.stroke();
    }
  },
};

// Leg prints draw on the front of one leg (from the foot up over the rounded
// hip joint) and on the hips. `side` is 1 for the figure's left leg, -1 for its right.
const LEG_PRINTS = {
  tails: { // a suit jacket's tails: its front edge comes down and curves out to a hem at mid-thigh, beside a side seam
    leg(g, w, h, side) {
      const X = (ox) => w * (side < 0 ? ox : 1 - ox); // ox: 0 at the leg's outer edge, 1 at the inner
      g.strokeStyle = '#b4b4b4'; g.lineWidth = Math.max(1.5, w * 0.03); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(X(0.67), 0); g.lineTo(X(0.67), h * 0.25); g.quadraticCurveTo(X(0.5), h * 0.42, X(0.21), h * 0.5); g.lineTo(X(0), h * 0.52); g.stroke();
      g.beginPath(); g.moveTo(X(0.21), 0); g.lineTo(X(0.21), h * 0.5); g.stroke();
    },
    hips(g, w, h) {
      g.strokeStyle = '#b4b4b4'; g.lineWidth = Math.max(1.5, w * 0.013); g.lineCap = 'round';
      for (const u of [0.5 - 0.426, 0.5 - 0.191, 0.5 + 0.191, 0.5 + 0.426]) { g.beginPath(); g.moveTo(w * u, 0); g.lineTo(w * u, h); g.stroke(); }
    },
  },
};

// The print on one leg, in that leg's frame (it swings with it): a strip up
// the flat front and over the rounded top of the thigh.
function legPrint(kind, side) {
  const map = kind && canvasTexture(128, 256, (g, w, h) => LEG_PRINTS[kind].leg(g, w, h, side));
  if (!map) return null;
  const { legH, footH, thighFront: tf, legW } = FIG;
  const z = tf + 0.034, r = 0.354; // just outside the leg's bevelled surface
  const profile = [[z, footH + 0.02], [z, legH - 0.32]];
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); profile.push([tf - 0.32 + r * Math.cos(a), legH - 0.32 + r * Math.sin(a)]); }
  const m = new THREE.Mesh(strip(profile, legW - 0.1), decalMaterial(map));
  m.name = 'legprint';
  m.position.y = -(legH - 0.3);
  return m;
}

// The same print's part on the hips, on their front face.
function hipPrint(kind) {
  const map = kind && canvasTexture(256, 64, LEG_PRINTS[kind].hips);
  if (!map) return null;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(FIG.torsoBottomW - 0.06, FIG.hipH - 0.04), decalMaterial(map));
  m.name = 'hipprint';
  m.position.set(0, FIG.hipY + FIG.hipH / 2, (FIG.torsoD - 0.24) / 2 - 0.12 + 0.004);
  return m;
}

function torsoPrint(kind) {
  const map = kind && canvasTexture(256, 256, PRINTS[kind]);
  if (!map) return null;
  const { torsoBottomW: b, torsoTopW: t, torsoH: h, torsoD: d } = FIG;
  const s = new THREE.Shape([new THREE.Vector2(-b / 2, 0), new THREE.Vector2(b / 2, 0), new THREE.Vector2(t / 2, h), new THREE.Vector2(-t / 2, h)]);
  const g = new THREE.ShapeGeometry(s);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + b / 2) / b, p.getY(i) / h);
  const m = new THREE.Mesh(g, decalMaterial(map));
  m.name = 'print';
  m.position.set(0, FIG.torsoY, d / 2 + 0.004);
  return m;
}

// ---- hats and hair ------------------------------------------------------------------

const HATS = {
  hair(color = 'brown') { // short hair: covers the back and sides, with a fringe over the forehead
    const g = new THREE.Group();
    const r = FIG.headR + 0.07;
    const back = mesh(shell(r, FIG.headH * 0.75, 0.35, 150, 0.07), color, { material: doubleSided(color) });
    back.position.y = FIG.headY + FIG.headH * 0.3;
    const top = mesh(shell(r, 0.42, 0.38, 0, 0.07), color, { material: doubleSided(color) });
    top.position.y = FIG.headY + FIG.headH * 0.82;
    g.add(back, top);
    return g;
  },
  shaggy(color = 'black') { // long tousled hair, parted at the top left: a lock to his right brow, a long strand sweeping across his left temple, down past the ears
    const r = FIG.headR + 0.09;
    const { headY: y0, headH } = FIG;
    const shoulderY = y0 + headH * 0.84, top = y0 + headH + 0.32;
    // where the hair ends, around the head (degrees from the front, positive toward his left), as a fraction of the head's height
    const edge = [[-180, -0.08], [-120, 0.04], [-90, 0.14], [-65, 0.22], [-47, 0.47], [-35, 0.58], [-25, 0.6], [-8, 0.62], [10, 0.64], [24, 0.47], [38, 0.37], [50, 0.45], [62, 0.3], [75, 0.15], [90, 0.14], [120, 0.04], [180, -0.08]];
    const hairline = (deg) => {
      let i = 1;
      while (edge[i][0] < deg) i++;
      const [a0, h0] = edge[i - 1], [a1, h1] = edge[i];
      return h0 + ((deg - a0) / (a1 - a0)) * (h1 - h0);
    };
    const g = wavyLathe((phi) => {
      const deg = ((phi * 180) / Math.PI + 180) % 360 - 180;
      const wavy = 0.04 * Math.abs(Math.sin(phi * 5)) * smoothstep(50, 80, Math.abs(deg)); // ragged ends at the sides and back
      const bottom = y0 + headH * hairline(deg) - wavy;
      const bulge = 0.04 * (0.5 + 0.5 * Math.sin(7 * phi + 2));
      const pts = [[r, bottom], [r + bulge * 0.5, (bottom + shoulderY) / 2], [r + bulge, shoulderY]];
      for (let i = 1; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2);
        pts.push([(r + bulge) * Math.cos(a), shoulderY + (top - shoulderY) * Math.sin(a)]);
      }
      return pts;
    });
    const hair = new THREE.Group();
    hair.add(mesh(g, color, { material: doubleSided(color) }));
    // locks: flat tufts on the crown, swept from the part toward his left, plus the strand that lies across his left temple
    const DEG = Math.PI / 180, up = new THREE.Vector3(0, 1, 0);
    const locks = [ // [around, elevation, length, out, lean x, lean y, lean z]
      [-40, 55, 0.5, 0.5, -0.5, 0.45, 0.1], [-10, 78, 0.6, 0.3, 0.8, 0.25, 0.1], [20, 70, 0.65, 0.3, 0.8, 0, 0.1], [45, 58, 0.65, 0.3, 0.7, -0.3, 0], [70, 40, 0.65, 0.35, 0.4, -0.6, -0.2],
      [-12, 12, 1.05, 0.15, 0.85, -0.6, 0.15], [-75, 20, 0.6, 0.8, -0.3, 0.1, 0.2],
      [150, 50, 0.6, 0.35, 0.5, 0, -0.7], [-150, 45, 0.6, 0.35, -0.2, 0.1, -0.8], [-115, 62, 0.55, 0.35, 0.3, 0.1, -0.7],
    ];
    for (const [phi, el, len, out, lx, ly, lz] of locks) {
      const a = phi * DEG, e = el * DEG;
      const radial = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
      const at = new THREE.Vector3(r * radial.x, shoulderY + (top - shoulderY) * radial.y, r * radial.z);
      const dir = radial.clone().multiplyScalar(out).add(new THREE.Vector3(lx, ly, lz)).normalize();
      const tuft = mesh(new THREE.ConeGeometry(0.3, len, 14), color);
      tuft.scale.z = 0.45;
      tuft.quaternion.setFromUnitVectors(up, dir);
      tuft.position.copy(at).add(dir.multiplyScalar(len / 2 - 0.26));
      hair.add(tuft);
    }
    return hair;
  },
  cap(color = 'red') { // a ball cap with a brim
    const g = new THREE.Group();
    const dome = mesh(shell(FIG.headR + 0.07, 0.6, 0.5, 0, 0.07), color, { material: doubleSided(color) });
    dome.position.y = FIG.headY + FIG.headH * 0.7;
    const brim = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.07, 32, 1, false, -Math.PI / 2, Math.PI), color);
    brim.position.set(0, FIG.headY + FIG.headH * 0.74, FIG.headR * 0.62);
    brim.scale.z = 0.75;
    g.add(dome, brim);
    return g;
  },
  straw(color = 'tan') { // a wide-brimmed farmer's hat
    const g = new THREE.Group();
    const brim = mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.08, 40), color);
    brim.position.y = FIG.headY + FIG.headH * 0.78;
    const crown = mesh(roundedCylinder(FIG.headR + 0.06, 0.55, 0.02, 0.12), color);
    crown.position.y = FIG.headY + FIG.headH * 0.78;
    const band = mesh(new THREE.CylinderGeometry(FIG.headR + 0.075, FIG.headR + 0.075, 0.12, 40, 1, true), 'red');
    band.position.y = FIG.headY + FIG.headH * 0.78 + 0.12;
    g.add(brim, crown, band);
    return g;
  },
  helmet(color = 'gray') { // a knight's helmet with a nose guard
    const g = new THREE.Group();
    const dome = mesh(shell(FIG.headR + 0.08, FIG.headH * 0.72 + 0.12, 0.45), color, { material: doubleSided(color) });
    dome.position.y = FIG.headY + FIG.headH * 0.38;
    const nose = mesh(new THREE.BoxGeometry(0.14, 0.42, 0.08), color);
    nose.position.set(0, FIG.headY + FIG.headH * 0.36, FIG.headR + 0.1);
    const crest = mesh(new THREE.BoxGeometry(0.1, 0.22, 1.1), 'red');
    crest.position.y = FIG.headY + FIG.headH * 1.18;
    g.add(dome, nose, crest);
    return g;
  },
  space(color = 'white') { // classic space helmet: a shell open at the face, with a chin strap
    const g = new THREE.Group();
    const r = FIG.headR + 0.12;
    const back = mesh(shell(r, FIG.headH + 0.42, 0.5, 125, 0.08), color, { material: doubleSided(color) });
    back.position.y = FIG.headY - 0.02;
    const top = mesh(shell(r, 0.42, 0.42, 0, 0.08), color, { material: doubleSided(color) }); // closed over the face
    top.position.y = FIG.headY + FIG.headH;
    const strap = mesh(new THREE.TorusGeometry(r - 0.02, 0.05, 8, 40, Math.PI * 0.68), color);
    strap.rotation.set(Math.PI / 2, 0, Math.PI * 0.16);
    strap.position.y = FIG.headY + 0.04;
    g.add(back, top, strap);
    return g;
  },
  wizard(color = 'blue') {
    const g = new THREE.Group();
    const brim = mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.07, 40), color);
    brim.position.y = FIG.headY + FIG.headH * 0.8;
    const cone = mesh(new THREE.ConeGeometry(FIG.headR + 0.1, 1.8, 40), color);
    cone.position.y = FIG.headY + FIG.headH * 0.8 + 0.9;
    cone.rotation.z = 0.12;
    g.add(brim, cone);
    return g;
  },
  antennae(color = 'lime') {
    const g = new THREE.Group();
    for (const x of [-0.32, 0.32]) {
      const stalk = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 8), 'green');
      stalk.position.set(x, FIG.headY + FIG.headH + 0.2, 0);
      stalk.rotation.z = -x * 0.6;
      const ball = mesh(new THREE.SphereGeometry(0.11, 16, 10), color);
      ball.position.set(x * 1.35, FIG.headY + FIG.headH + 0.5, 0);
      g.add(stalk, ball);
    }
    return g;
  },
};

// ---- held things --------------------------------------------------------------------

// In the hand's frame: the grip axis is z.
const HELD = {
  sword() {
    const g = new THREE.Group();
    const grip = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 12), 'brown');
    grip.rotation.x = Math.PI / 2;
    const guard = mesh(new THREE.BoxGeometry(0.55, 0.12, 0.1), 'darkgray');
    guard.position.z = 0.3;
    const blade = mesh(new THREE.BoxGeometry(0.3, 0.07, 1.6), 'gray');
    blade.position.z = 1.15;
    g.add(grip, guard, blade);
    return g;
  },
  shield() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(-0.6, 0.6); s.lineTo(0.6, 0.6); s.lineTo(0.6, 0); s.quadraticCurveTo(0.6, -0.65, 0, -0.85); s.quadraticCurveTo(-0.6, -0.65, -0.6, 0); s.closePath();
    const board = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false }), 'blue');
    board.rotation.y = Math.PI / 2;
    board.position.set(0.3, 0.1, 0.1);
    const stripe = mesh(new THREE.BoxGeometry(0.02, 1.0, 0.2), 'yellow');
    stripe.position.set(0.39, 0.05, 0.1);
    g.add(board, stripe);
    return g;
  },
  pitchfork() {
    const g = new THREE.Group();
    const shaft = mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 10), 'brown');
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.5;
    g.add(shaft);
    for (const x of [-0.15, 0, 0.15]) {
      const tine = mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), 'darkgray');
      tine.position.set(x, 0, 2.2);
      g.add(tine);
    }
    const bar = mesh(new THREE.BoxGeometry(0.36, 0.05, 0.05), 'darkgray');
    bar.position.z = 1.97;
    g.add(bar);
    return g;
  },
  club() { // a putter, hanging down from the hand to the ground
    const g = new THREE.Group();
    const shaft = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8), 'darkgray');
    shaft.position.y = -1.0;
    const grip = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), 'black');
    grip.position.y = -0.1;
    const head = mesh(new THREE.BoxGeometry(0.22, 0.2, 0.7), 'gray');
    head.position.set(0, -2.05, 0.2);
    g.add(shaft, grip, head);
    g.rotation.x = 0.45; // the shaft hangs down and a little forward
    return g;
  },
  wand() {
    const g = new THREE.Group();
    const stick = mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 8), 'brown');
    stick.rotation.x = Math.PI / 2;
    stick.position.z = 0.4;
    const star = mesh(new THREE.OctahedronGeometry(0.16), 'yellow');
    star.position.z = 1.15;
    g.add(stick, star);
    return g;
  },
};

// ---- the figure ---------------------------------------------------------------------

// spec: {torso, arms, hands, hips, legs, head, face, print, legPrint, hat, hatColor, held: {left, right}}
// Returns groups in figure space: body (legs, hips, torso, neck), head, leftArm, rightArm, legs: [left, right].
export function buildMinifig(spec = {}) {
  const c = {
    torso: 'red', arms: spec.torso ?? 'red', hands: SKIN, hips: spec.legs ?? 'blue', legs: 'blue', head: SKIN, ...spec,
  };
  const body = new THREE.Group();

  // legs: side profile with the foot sticking out in front and a rounded hip
  const { legBack: bk, thighFront: tf, toe, footH, legH } = FIG;
  const profile = [[bk, 0], [toe, 0], [toe, footH], [tf, footH], [tf, legH - 0.32]];
  for (let i = 1; i <= 6; i++) { // round over the front of the hip joint
    const a = (i / 6) * (Math.PI / 2);
    profile.push([tf - 0.32 + 0.32 * Math.cos(a), legH - 0.32 + 0.32 * Math.sin(a)]);
  }
  profile.push([bk, legH]);
  const legGeo = extruded(profile, FIG.legW);
  const legs = [];
  for (const side of [1, -1]) {
    const leg = new THREE.Group(); // pivots at the hip, for walking
    leg.position.set(side * (FIG.legW + FIG.legGap) / 2, legH - 0.3, 0);
    const m = mesh(legGeo, c.legs);
    m.position.y = -(legH - 0.3);
    leg.add(m);
    const lp = legPrint(c.legPrint, side);
    if (lp) leg.add(lp);
    body.add(leg);
    legs.push(leg);
  }

  // hips: a band across the top of the legs
  const hips = mesh(new THREE.BoxGeometry(FIG.torsoBottomW, FIG.hipH, FIG.torsoD - 0.24), c.hips);
  hips.position.set(0, FIG.hipY + FIG.hipH / 2, -0.12);
  body.add(hips);
  const hp = hipPrint(c.legPrint);
  if (hp) body.add(hp);

  // torso, and whatever is printed on it
  const torso = mesh(taperedBox(FIG.torsoBottomW, FIG.torsoTopW, FIG.torsoH, FIG.torsoD), c.torso);
  torso.position.y = FIG.torsoY;
  body.add(torso);
  const print = torsoPrint(c.print);
  if (print) body.add(print);

  // neck
  const neck = mesh(new THREE.CylinderGeometry(FIG.neckR, FIG.neckR, FIG.neckH + 0.1, 24), c.head);
  neck.position.y = FIG.neckY + FIG.neckH / 2;
  body.add(neck);

  // head: rounded cylinder, stud on top, a face, maybe a hat
  const head = new THREE.Group();
  const skull = mesh(roundedCylinder(FIG.headR, FIG.headH, 0.2, 0.15), c.head);
  skull.name = 'skull';
  skull.position.y = FIG.headY;
  const stud = mesh(new THREE.CylinderGeometry(FIG.studR, FIG.studR, FIG.studH + 0.05, 24), c.head);
  stud.position.y = FIG.headY + FIG.headH + FIG.studH / 2 - 0.025;
  head.add(skull);
  if (!c.hat || c.hat === 'antennae') head.add(stud); // hair and hats cover the stud
  const f = face(c.face);
  if (f) head.add(f);
  if (c.hat && HATS[c.hat]) {
    // Hats don't cast shadows: a brim's soft shadow edge stripes the curved face under it.
    const hat = HATS[c.hat](c.hatColor);
    hat.name = 'hat';
    hat.traverse((o) => { o.castShadow = false; });
    head.add(hat);
  }

  const leftArm = arm(1, c);
  const rightArm = arm(-1, c);
  if (c.held?.left && HELD[c.held.left]) leftArm.userData.hand.add(HELD[c.held.left]());
  if (c.held?.right && HELD[c.held.right]) rightArm.userData.hand.add(HELD[c.held.right]());
  return { body, head, leftArm, rightArm, legs };
}

// A minifigure sitting down, for riders that are only there for looks (like a
// race car's driver). Legs swing forward at the hip and the arms reach out
// by `reach` degrees. The group's origin is where the backs of the thighs meet
// the seat, under the middle of the hips.
export function buildSeatedMinifig(spec = {}, { reach = 55 } = {}) {
  const fig = buildMinifig(spec);
  const g = new THREE.Group();
  for (const leg of fig.legs) leg.rotation.x = -Math.PI / 2; // legs pivot at the hip
  g.add(fig.body, fig.head);
  for (const [armObj, side] of [[fig.leftArm, 1], [fig.rightArm, -1]]) {
    const shoulder = new THREE.Group(); // swing the arm about its shoulder
    shoulder.position.set(side * FIG.shoulder[0], FIG.shoulder[1], FIG.shoulder[2]);
    shoulder.rotation.x = -reach * Math.PI / 180;
    armObj.position.set(-side * FIG.shoulder[0], -FIG.shoulder[1], -FIG.shoulder[2]);
    shoulder.add(armObj);
    g.add(shoulder);
  }
  const seated = new THREE.Group();
  g.position.y = -(FIG.legH - 0.3 + FIG.legBack); // the hip pivot, less the thigh's thickness below it
  seated.add(g);
  return seated;
}

// An arm hangs from the shoulder, bends forward at the elbow, and ends in a
// wrist and a C-shaped hand. side: 1 = left (+x), -1 = right.
function arm(side, c) {
  const g = new THREE.Group();
  const [sx, sy] = FIG.shoulder;
  const pts = [
    [sx, sy, 0], [sx + 0.17, sy - 0.55, -0.12], [sx + 0.27, sy - 1.02, -0.06], [sx + 0.34, sy - 1.36, 0.12],
  ].map(([x, y, z]) => new THREE.Vector3(x * side, y, z));
  const curve = new THREE.CatmullRomCurve3(pts);
  const sleeve = mesh(new THREE.TubeGeometry(curve, 24, 0.26, 16, false), c.arms);
  const shoulder = mesh(new THREE.SphereGeometry(0.27, 20, 14), c.arms);
  shoulder.position.copy(pts[0]);
  const end = mesh(new THREE.SphereGeometry(0.26, 16, 10), c.arms);
  end.position.copy(pts[3]);
  end.scale.set(1, 0.5, 1);
  g.add(sleeve, shoulder, end);

  // the hand sits past the wrist, pointing forward and down
  const dir = curve.getTangent(1).normalize();
  const wristPos = pts[3].clone().add(dir.clone().multiplyScalar(0.18));
  const wrist = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 12), c.hands);
  wrist.position.copy(wristPos);
  wrist.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const hand = new THREE.Group();
  hand.position.copy(pts[3].clone().add(dir.clone().multiplyScalar(0.5)));
  // the grip axis (z) is square to the forearm: forward and a little up
  hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.4, 0.92).normalize());
  const clip = mesh(cClip(0.3, 0.17, 0.3, 75), c.hands);
  clip.rotation.z = side * 0.5; // open toward the inside
  hand.add(clip);
  g.add(wrist, hand);
  g.userData.hand = hand;
  return g;
}

export { colorHex };

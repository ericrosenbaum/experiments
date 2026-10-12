// Brick geometry and materials. Units are studs: a 1x1 brick is 1 wide,
// 1.2 tall; a plate is 0.4 tall. Studs are drawn on top of every box whose
// footprint is a whole number of studs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../behavior/primitives.js';

export const BRICK_H = 1.2;
export const PLATE_H = 0.4;
const GAP = 0.02; // tiny shrink so neighbouring bricks read as separate pieces

const geoCache = new Map();
const matCache = new Map();

export function colorHex(color) {
  if (typeof color === 'number') return color;
  if (color in COLORS) return COLORS[color];
  return new THREE.Color(color).getHex();
}

// The glossy coat costs a little per pixel; slow GPUs go without it.
let gloss = 0.35;
export function setGloss(on) {
  gloss = on ? 0.35 : 0;
  for (const m of matCache.values()) if (m.clearcoat !== gloss) { m.clearcoat = gloss; m.needsUpdate = true; }
}

export function material(color, opts = {}) {
  const hex = colorHex(color);
  const key = hex + (opts.transparent ? 't' : '');
  if (!matCache.has(key)) {
    // ABS plastic: a fairly smooth base under a thin glossy coat.
    matCache.set(key, new THREE.MeshPhysicalMaterial({
      color: hex, roughness: 0.42, metalness: 0.0, clearcoat: gloss, clearcoatRoughness: 0.18,
      transparent: !!opts.transparent, opacity: opts.transparent ? 0.55 : 1,
    }));
  }
  return matCache.get(key);
}

export function brickGeometry(w, h, d, studs = true) {
  const key = `${w}|${h}|${d}|${studs}`;
  if (geoCache.has(key)) return geoCache.get(key);
  // Slightly rounded edges catch the light the way real bricks do.
  const bevel = Math.min(0.05, w / 6, h / 6, d / 6);
  const parts = [new RoundedBoxGeometry(w - GAP, h - GAP, d - GAP, 1, bevel)];
  const nx = Math.round(w), nz = Math.round(d);
  if (studs && Math.abs(w - nx) < 1e-6 && Math.abs(d - nz) < 1e-6 && nx * nz <= 64) {
    const stud = studGeometry();
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const s = stud.clone();
        s.translate(-w / 2 + 0.5 + i, h / 2 + 0.1 - GAP / 2, -d / 2 + 0.5 + k);
        parts.push(s);
      }
    }
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  geoCache.set(key, g);
  return g;
}

// A stud with a chamfered top edge, centered on its height (0.2 tall).
let studGeo = null;
function studGeometry() {
  if (!studGeo) {
    const pts = [[0.3, -0.1], [0.3, 0.075], [0.27, 0.1], [0, 0.1]].map(([x, y]) => new THREE.Vector2(x, y));
    studGeo = new THREE.LatheGeometry(pts, 12);
  }
  return studGeo;
}

export function brickMesh(w, h, d, color, studs = true) {
  const m = new THREE.Mesh(brickGeometry(w, h, d, studs), material(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A little LEGO flower, about 1.5 bricks tall: a 1x1 round plate, a stem
// with two leaves, five petals and a yellow center stud. Centered on its
// middle (y from -0.9 to 0.9), to match its physics body.
export function flowerMesh(color = 'red', leaf = 'green') {
  const g = new THREE.Group();
  const add = (geo, c, pos, rot, scale) => {
    const m = new THREE.Mesh(geo, material(c));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const ball = new THREE.SphereGeometry(1, 18, 12);
  add(new THREE.CylinderGeometry(0.48, 0.48, 0.38, 28), leaf, [0, -0.71, 0]); // round plate
  add(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20), leaf, [0, -0.46, 0]); // where the stem plugs in
  add(new THREE.CylinderGeometry(0.08, 0.09, 1.1, 12), leaf, [0, 0.03, 0]); // stem
  for (const side of [1, -1]) { // two leaves angled up and out
    add(ball, leaf, [side * 0.24, -0.12 + (side > 0 ? 0 : 0.18), 0], [0, side > 0 ? 0 : Math.PI / 5, side * 0.45], [0.3, 0.05, 0.14]);
  }
  const head = 0.66;
  for (let i = 0; i < 5; i++) { // petals, tipped up a little like a cup
    const a = (i / 5) * Math.PI * 2;
    const p = add(ball, color, [Math.sin(a) * 0.25, head, Math.cos(a) * 0.25], null, [0.15, 0.07, 0.21]);
    p.rotation.set(-0.35, a, 0, 'YXZ');
  }
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 20), 'yellow', [0, head + 0.04, 0]); // center
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), 'yellow', [0, head + 0.16, 0]); // its stud
  return g;
}

// A tire with a hub, axis along X.
export function wheelMesh(radius, width, color = 'black', hub = 'gray') {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), material(color));
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.04, 12), material(hub));
  hubM.rotation.z = Math.PI / 2;
  // a spoke so you can see it turn
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, radius * 1.1, 0.18), material('white'));
  g.add(tire, hubM, spoke);
  return g;
}

export const SIZES = {
  '1x1': [1, BRICK_H, 1], '1x2': [1, BRICK_H, 2], '2x2': [2, BRICK_H, 2], '1x4': [1, BRICK_H, 4],
  '2x4': [2, BRICK_H, 4], '2x3': [2, BRICK_H, 3], '4x4': [4, BRICK_H, 4], '1x6': [1, BRICK_H, 6],
  '2x6': [2, BRICK_H, 6],
};

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
  const key = hex + (opts.transparent ? 't' : '') + (opts.glass ? 'g' : '') + (opts.backSide ? 'b' : '');
  if (!matCache.has(key)) {
    // ABS plastic: a fairly smooth base under a thin glossy coat. Glass is
    // clear plastic: the color, paled, and mostly see-through.
    const c = opts.glass ? new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.12) : hex;
    matCache.set(key, new THREE.MeshPhysicalMaterial({
      color: c, roughness: opts.glass ? 0.1 : 0.42, metalness: 0.0, clearcoat: gloss, clearcoatRoughness: 0.18,
      transparent: !!(opts.transparent || opts.glass), opacity: opts.glass ? 0.45 : opts.transparent ? 0.55 : 1,
      depthWrite: !opts.glass, side: opts.backSide ? THREE.BackSide : THREE.FrontSide,
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

// One piece of a model, drawn to fill its box `size` (which is also its
// collider). `shape` picks the building element; the default is a brick.
//   round     a round brick, plate or tile (axis 'y', or 'x'/'z' to lie it
//             down like a log); a stud on top unless studs: false
//   container a hollow round brick, open on top, with a stud inside
//   bar       a thin rod (axis as for round)
//   ladder    two rails and rungs (about every 0.85 studs) in the X-Y plane
//   grille    a brick with grooves across its +X face
//   panel     a wall along its +X side with end walls and a base: a 1x4x3
//             panel (usually glass)
//   hull      a boat hull, open on top: the +Z end tapers to `tip` studs wide
//             over `taper` studs while its keel rises by `lift` and its top
//             edge drops by `sheer` (or rises, if negative); walls are `wall` thick over a floor
//             `floor` thick, and the floor's sides slope in by `deadrise`
//             underneath
// glass: true makes it see-through. rot: [x, y, z] radians turns it, in
// rotOrder (a three.js Euler order, 'XYZ' unless given).
export function pieceMesh(br) {
  const [w, h, d] = br.size;
  const shape = br.shape ?? 'brick';
  const studs = br.studs !== false;
  let obj;
  if (shape === 'brick' && !br.glass) obj = brickMesh(w, h, d, br.color, studs);
  else if (shape === 'brick') {
    obj = new THREE.Mesh(brickGeometry(w, h, d, studs), material(br.color, { glass: true }));
    obj.receiveShadow = true;
  } else {
    const mat = material(br.color, { glass: br.glass });
    obj = new THREE.Group();
    const add = (geo, pos = [0, 0, 0], rot, m = mat) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(...pos);
      if (rot) mesh.rotation.set(...rot);
      mesh.castShadow = !br.glass;
      mesh.receiveShadow = true;
      obj.add(mesh);
      return mesh;
    };
    // Lying round things: build along Y, then turn so Y points along the axis.
    const lay = br.axis === 'x' ? [0, 0, Math.PI / 2] : br.axis === 'z' ? [Math.PI / 2, 0, 0] : null;
    const [rw, rh, rd] = br.axis === 'x' ? [h, w, d] : br.axis === 'z' ? [w, d, h] : [w, h, d];
    const r = Math.min(rw, rd) / 2 - GAP / 2;
    if (shape === 'round' || shape === 'bar') {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, rh - GAP, shape === 'bar' ? 12 : 28), mat);
      g.add(body);
      if (shape === 'round' && studs && !lay) {
        const s = new THREE.Mesh(studGeometry(), mat);
        s.position.y = rh / 2 + 0.1 - GAP / 2;
        g.add(s);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = !br.glass; o.receiveShadow = true; } });
      if (lay) g.rotation.set(...lay);
      obj.add(g);
    } else if (shape === 'container') {
      const t = Math.min(0.18, r / 4), floor = 0.25, flat = -Math.PI / 2;
      const g = new THREE.Group();
      const part = (geo, y, rx, m = mat) => { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; mesh.rotation.x = rx; g.add(mesh); };
      part(new THREE.CylinderGeometry(r, r, rh, 40, 1, true), 0, 0);
      part(new THREE.CylinderGeometry(r - t, r - t, rh - floor, 40, 1, true), floor / 2, 0, material(br.color, { glass: br.glass, backSide: true }));
      part(new THREE.RingGeometry(r - t, r, 40), rh / 2, flat);
      part(new THREE.CircleGeometry(r - t, 40), -rh / 2 + floor, flat);
      part(new THREE.CircleGeometry(r, 40), -rh / 2, -flat);
      part(studGeometry(), -rh / 2 + floor + 0.1, 0);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = !br.glass; o.receiveShadow = true; } });
      if (lay) g.rotation.set(...lay);
      obj.add(g);
    } else if (shape === 'ladder') {
      const rail = Math.min(0.4, w / 7), rungs = Math.max(2, Math.round(h / 0.85));
      add(new THREE.BoxGeometry(rail, h, d), [-w / 2 + rail / 2, 0, 0]);
      add(new THREE.BoxGeometry(rail, h, d), [w / 2 - rail / 2, 0, 0]);
      add(new THREE.BoxGeometry(w - rail, rail, d), [0, h / 2 - rail / 2, 0]);
      add(new THREE.BoxGeometry(w - rail, rail, d), [0, -h / 2 + rail / 2, 0]);
      for (let i = 1; i < rungs; i++) add(new THREE.BoxGeometry(w - rail, rail * 0.8, d * 0.8), [0, -h / 2 + (h * i) / rungs, 0]);
    } else if (shape === 'grille') {
      add(brickGeometry(w - 0.12, h, d, false), [-0.06, 0, 0]);
      const n = Math.max(2, Math.round(h / 0.2));
      for (let i = 0; i < n; i++) add(new THREE.BoxGeometry(0.12, (h / n) * 0.55, d - 0.1), [w / 2 - 0.07, -h / 2 + (h * (i + 0.5)) / n, 0]);
    } else if (shape === 'panel') {
      const t = 0.16;
      add(brickGeometry(t, h - t, d - 2 * t, false), [w / 2 - t / 2, t / 2, 0]);
      for (const s of [1, -1]) add(brickGeometry(w, h - t, t, false), [0, t / 2, s * (d / 2 - t / 2)]);
      add(brickGeometry(w, t, d, false), [0, -h / 2 + t / 2, 0]);
      add(brickGeometry(t * 1.6, t, d - 2 * t, false), [w / 2 - t * 0.8, h / 2 - t / 2, 0]);
    } else if (shape === 'hull') {
      add(hullGeometry(br));
    }
  }
  if (br.rot) obj.rotation.set(...br.rot, br.rotOrder ?? 'XYZ');
  return obj;
}

// A boat hull (see pieceMesh): extruded straight up from its outline seen
// from above, with a hole for the inside, then the bow's keel bent upward.
function hullGeometry({ size: [w, h, d], tip = 0.6, taper = 6, lift = 1, sheer = 0, wall = 0.4, floor = 0.6, deadrise = 0 }) {
  const zs = d / 2 - taper; // where the bow starts to narrow
  const halfW = (z) => (z <= zs ? w / 2 : tip / 2 + (w / 2 - tip / 2) * (1 - ((z - zs) / taper) ** 2));
  const keel = (z) => -h / 2 + (z <= zs ? 0 : lift * ((z - zs) / taper) ** 1.8);
  const top = (z) => h / 2 - (z <= zs ? 0 : sheer * ((z - zs) / taper) ** 2);
  const N = 40;
  const zsAt = (z0, z1) => Array.from({ length: N + 1 }, (_, i) => z0 + ((z1 - z0) * i) / N);
  const outline = (inset, z0, z1) => {
    const zz = zsAt(z0, z1);
    // shape coordinates (x, -z): extruding along +Z then turning -90° about X stands it up
    return [...zz.map((z) => new THREE.Vector2(halfW(z) - inset, -z)), ...zz.reverse().map((z) => new THREE.Vector2(-(halfW(z) - inset), -z))];
  };
  // the inside ends where the walls would meet
  let zIn = d / 2;
  while (zIn > zs && halfW(zIn) - wall < 0.35) zIn -= 0.05;
  const outer = new THREE.Shape(outline(0, -d / 2, d / 2));
  const walls = outer.clone();
  walls.holes.push(new THREE.Path(outline(wall, -d / 2 + wall, zIn)));
  const extrude = (shape, depth, y0) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    return g;
  };
  const g = mergeGeometries([extrude(walls, h - floor, -h / 2 + floor), extrude(new THREE.Shape(outline(0, -d / 2, d / 2)), floor, -h / 2)].map((x) => (x.index ? x.toNonIndexed() : x)));
  // toward the bow, bend the keel up and the top edge down; the bottom
  // edges come in by the deadrise (never past the middle)
  const inset = (z) => Math.min(deadrise, halfW(z));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < -h / 2 + 1e-6) pos.setX(i, Math.sign(x) * Math.max(0, Math.abs(x) - inset(z)));
    pos.setY(i, y > h / 2 - 1e-6 ? top(z) : Math.min(top(z), Math.max(y, keel(z))));
  }
  g.computeVertexNormals();
  return g;
}

// A flexible hose along points (model space), drawn as a smooth tube.
export function hoseMesh({ points, radius = 0.16, color = 'darkgray', closed = false }) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 16, radius, 10, closed), material(color));
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

// A screen across the front and back faces of a w x h x d box, like a
// scoreboard's: text lit up on a dark panel, drawn on a canvas. draw(text)
// redraws it. Each line ("\n" starts a new one) is as big as will fit, and a
// color word ("RED", "blue") lights up in its own color. Headless (tests,
// the sim server) there's nothing to draw, so this returns null.
export function screenFaces(w, h, d, { ink = '#ffe9a8', back = '#121418' } = {}) {
  if (typeof document === 'undefined') return null;
  const pw = w * 0.96, ph = h * 0.92, px = Math.min(96, 2048 / pw);
  const c = document.createElement('canvas');
  c.width = Math.round(pw * px); c.height = Math.round(ph * px);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); // lit from inside, so the light doesn't dim it
  const group = new THREE.Group();
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    m.position.z = side * (d / 2 + 0.01);
    m.rotation.y = side > 0 ? 0 : Math.PI;
    m.userData.keepColor = true; // color() paints the board, not the picture on it
    group.add(m);
  }
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const inkFor = (word) => {
    const k = word.toLowerCase().replace(/[^a-z]/g, '');
    return k in COLORS && k !== 'black' ? `#${new THREE.Color(COLORS[k]).lerp(new THREE.Color(0xffffff), 0.15).getHexString()}` : ink;
  };
  const draw = (text) => {
    g.fillStyle = back; g.fillRect(0, 0, W, H);
    // a faint grid of dots, like the lamps of a real scoreboard
    g.fillStyle = '#ffffff0d';
    const step = H / 24;
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) { g.beginPath(); g.arc(x, y, step * 0.28, 0, Math.PI * 2); g.fill(); }
    const lines = String(text).split('\n').slice(0, 4);
    const font = (s) => `800 ${s}px "Arial Black", system-ui, sans-serif`;
    const sizes = lines.map((line) => {
      let s = (H * 0.86) / lines.length * (lines.length > 1 ? 0.92 : 0.8);
      g.font = font(s);
      const wide = g.measureText(line).width;
      if (wide > W * 0.92) s *= (W * 0.92) / wide;
      return s;
    });
    const total = sizes.reduce((a, s) => a + s * 1.08, 0);
    let y = (H - total) / 2;
    g.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const s = sizes[i];
      g.font = font(s);
      const words = line.split(/(\s+)/);
      let x = (W - g.measureText(line).width) / 2;
      y += s * 0.54;
      for (const word of words) {
        g.fillStyle = inkFor(word);
        g.shadowColor = g.fillStyle; g.shadowBlur = s * 0.12;
        g.fillText(word, x, y);
        x += g.measureText(word).width;
      }
      g.shadowBlur = 0;
      y += s * 0.54;
    });
    tex.needsUpdate = true;
  };
  return { group, draw };
}

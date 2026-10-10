// Renders Brick Talk mini builds (tools/bricktalk/builds.js) the way the
// original 64 were made: one small build per symbol, standing on the shared
// round pedestal in its category color, same camera and light for every build,
// transparent background with a soft shadow. Driven by tools/bricktalk/render.mjs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BUILDS, COLORS } from './builds.js';

const PEDESTAL = { people: 'Bright Blue', action: 'Dark Green', thing: 'Bright Yellow', place: 'Medium Lilac', feeling: 'Bright Red', social: 'Bright Orange', modifier: 'Medium Stone Grey' };

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

const mats = new Map();
function mat(name) {
  if (!mats.has(name)) {
    const c = COLORS[name];
    if (!c) throw new Error(`unknown color ${name}`);
    const transparent = name.startsWith('Transparent');
    mats.set(name, new THREE.MeshStandardMaterial({
      color: new THREE.Color(c), roughness: transparent ? 0.1 : 0.42, metalness: 0,
      transparent, opacity: transparent ? 0.55 : 1,
    }));
  }
  return mats.get(name);
}

// ---- part geometry (units: 1 = one stud; brick 1.2 tall, plate 0.4) --------------
const STUD_R = 0.3, STUD_H = 0.17;
function addStuds(group, w, d, y, color, every = 1) {
  for (let i = 0; i < w; i += every) for (let j = 0; j < d; j += every) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 20), mat(color));
    s.position.set(i - (w - 1) / 2, y + STUD_H / 2, j - (d - 1) / 2);
    group.add(s);
  }
}
const PARTS = {
  box({ w = 1, h = 1.2, d = 1, color, studs = false, r = 0.06 }) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat(color)));
    if (studs) addStuds(g, w, d, h / 2, color);
    return g;
  },
  cylinder({ r = 0.5, h = 1, color, seg = 40, r2 }) { return new THREE.Mesh(new THREE.CylinderGeometry(r2 ?? r, r, h, seg), mat(color)); },
  sphere({ r = 0.5, color }) { return new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat(color)); },
  dome({ r = 0.5, color }) { return new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(color)); },
  cone({ r = 0.5, h = 1, color }) { return new THREE.Mesh(new THREE.ConeGeometry(r, h, 32), mat(color)); },
  // A flat outline shape (2D points, in the x/y plane) extruded along z, with a soft bevel.
  shape({ pts, depth = 0.4, color, bevel = 0.08 }) {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24 });
    geo.translate(0, 0, -depth / 2);
    return new THREE.Mesh(geo, mat(color));
  },
  // A rounded slab built from a smooth 2D outline (e.g. a gamepad body).
  outline({ shape, depth = 0.5, color, bevel = 0.12 }) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 32 });
    geo.translate(0, 0, -depth / 2);
    return new THREE.Mesh(geo, mat(color));
  },
};

function place(obj, { at = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
  obj.position.set(...at);
  obj.scale.setScalar(scale);
  obj.rotation.set(...rot.map((d) => (d * Math.PI) / 180));
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

function buildGroup(items) {
  const g = new THREE.Group();
  for (const it of items) {
    if (it.group) { g.add(place(buildGroup(it.group), it)); continue; }
    const part = typeof it.part === 'function' ? it.part(THREE) : PARTS[it.part](it);
    g.add(place(part, it));
  }
  return g;
}

function pedestal(color) {
  return buildGroup([
    { part: 'cylinder', r: 3, h: 0.62, color, at: [0, 0.31, 0] },    // round plate 6×6
    { part: 'cylinder', r: 2.75, h: 0.26, color, at: [0, 0.75, 0] }, // round tile 5×5
  ]);
}

export function render(id, { size = 200 } = {}) {
  const spec = BUILDS[id];
  if (!spec) throw new Error(`no build for ${id}`);
  renderer.setSize(size, size);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-10, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
  key.shadow.radius = 4;
  key.shadow.bias = -0.0008;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(6, 4, 10);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(place(pedestal(PEDESTAL[spec.cat]), {}));
  const build = buildGroup(spec.parts);
  build.position.y = 0.88; // standing on the tile
  scene.add(build);

  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  const elev = (19 * Math.PI) / 180, az = (-8 * Math.PI) / 180, dist = 24;
  const target = new THREE.Vector3(0.75, 3.95, 0);
  cam.position.set(target.x + Math.sin(az) * Math.cos(elev) * dist, target.y + Math.sin(elev) * dist, target.z + Math.cos(az) * Math.cos(elev) * dist);
  cam.lookAt(target);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/webp', 0.92);
}

window.renderBuild = render;
window.buildIds = Object.keys(BUILDS);
window.renderReady = true;

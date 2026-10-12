// Loads each kid world (src/finder/kidworlds.js) into the real renderer and
// physics world, lets it settle, and shoots a wigglegram: three frames from
// the camera swung a little left, centered and right around the shot's
// target, so the target stays put and everything else sways. Also reads back
// what's in the world (things, models, behaviors and their compiled code) for
// the finder's metadata. Driven by tools/finder/render.mjs.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Graphics } from '../../src/graphics.js';
import { World } from '../../src/world/world.js';
import { Stage } from '../../src/stage.js';
import { WORLDS_BY_ID } from '../../src/world/worlds.js';
import { LIBRARY_BY_ID } from '../../src/world/library.js';
import { KID_WORLDS_BY_ID } from '../../src/finder/kidworlds.js';

await RAPIER.init();
const gfx = new Graphics(document.body);
const world = new World(RAPIER, gfx.scene);
const runtime = { stopAll() {}, start() {}, contacts: new Set() }; // nothing runs; this is a photo
const controls = { target: new THREE.Vector3(), update() {} };
const stage = new Stage({ world, runtime, ui: {}, view: { scene: gfx.scene, hemi: gfx.hemi, sun: gfx.sun, camera: gfx.camera, controls, gfx } });

const WIGGLE = [-2.4, 0, 2.4]; // degrees around the target
const DEG = Math.PI / 180;

function cameraAt({ target, yaw = 0, pitch = 28, dist = 30, fov = 40 }, dyaw) {
  const a = (yaw + dyaw) * DEG, p = pitch * DEG;
  const t = new THREE.Vector3(...target);
  gfx.camera.fov = fov;
  gfx.camera.aspect = 1;
  gfx.camera.updateProjectionMatrix();
  gfx.camera.position.set(t.x + Math.sin(a) * Math.cos(p) * dist, t.y + Math.sin(p) * dist, t.z - Math.cos(a) * Math.cos(p) * dist);
  gfx.camera.lookAt(t);
  return t;
}

window.shoot = async (id, size) => {
  const kw = KID_WORLDS_BY_ID[id];
  WORLDS_BY_ID[id] = { ...kw, camera: { pos: [0, 20, -30], target: kw.shot.target } };
  stage.load(id);
  for (let i = 0; i < 45; i++) world.step(1 / 60); // let loose bricks and models settle
  const sheet = document.createElement('canvas');
  sheet.width = size * WIGGLE.length; sheet.height = size;
  const g = sheet.getContext('2d');
  const src = gfx.renderer.domElement;
  for (const [i, d] of WIGGLE.entries()) {
    const t = cameraAt(kw.shot, d);
    for (let k = 0; k < 3; k++) gfx.render(1 / 60, t); // a few passes so the AO settles
    // centered square crop of the canvas
    const s = Math.min(src.width, src.height);
    g.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, i * size, 0, size, size);
  }
  return { sprite: sheet.toDataURL('image/webp', 0.86), meta: describe(id) };
};

// What's in the world, as a kid's metadata would list it.
function describe(id) {
  const things = [];
  for (const [thingId, e] of world.things()) {
    const members = world.byThing.get(thingId)?.size ?? 1;
    const m = e.kind === 'model' ? e.def : null;
    things.push({
      id: thingId, name: world.actor(thingId).name ?? e.name, kind: e.kind, color: e.color,
      type: m?.id, category: m ? LIBRARY_BY_ID[m.id]?.category : undefined, bricks: members,
    });
  }
  const behaviors = [];
  for (const [key, list] of stage.state.behaviors) {
    const owner = key === 'world' ? 'World' : world.actor(key).name ?? key;
    for (const b of list) behaviors.push({ owner, key, text: b.text, summary: b.summary, code: b.code, notes: b.notes || undefined });
  }
  return { things, behaviors, gravity: WORLDS_BY_ID[id].gravity ?? 1 };
}

window.renderReady = true;

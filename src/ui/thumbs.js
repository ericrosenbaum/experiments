// Library thumbnails, drawn in the page from the real builds: a scratch world
// (never stepped) builds one model or thing at a time, and a small offscreen
// renderer takes its picture from in front and a little above. They're made
// one per frame in the background, so the page stays quick, and they always
// match the models as they change.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from '../world/world.js';

const SIZE = 192; // pixels: shown at about 80, so sharp on a 2x screen
const FOV = 26;

export class Thumbnails {
  constructor() {
    this.scene = new THREE.Scene();
    this.world = new World(RAPIER, this.scene); // RAPIER is already initialized by the page
    this.scene.traverse((o) => { if (o.userData.ground) o.visible = false; });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.7));
    const sun = new THREE.DirectionalLight(0xfff4dd, 2.2);
    sun.position.set(4, 10, 7);
    this.scene.add(sun, sun.target);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(SIZE, SIZE, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
  }

  // A picture (a data URL) of one library entry: a model def, or a thing
  // from objects.js (it has build()).
  shoot(def) {
    const w = this.world;
    w.clear();
    if (def.build) def.build(w, { x: 0, z: 0, yaw: 0, id: 'thumb', name: def.name });
    else w.addModel(def, { x: 0, z: 0, yaw: 0, id: 'thumb' });
    w.sync();
    const box = new THREE.Box3();
    for (const e of w.entities.values()) if (e.kind !== 'ground') for (const { object3d } of e.bodies) box.expandByObject(object3d);
    if (box.isEmpty()) return null;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // from the front (+z), a little to the left and above, far enough back to fit it all
    const dir = new THREE.Vector3(0.55, 0.5, 1).normalize();
    const dist = (sphere.radius / Math.sin((FOV / 2) * Math.PI / 180)) * 1.02;
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = dist / 50;
    this.camera.far = dist * 3;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(sphere.center);
    // the sphere leaves room around tall, thin things (a minifig): come in
    // until its box just fills the picture, and center it
    this.camera.updateMatrixWorld();
    const pts = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z).project(this.camera));
    const lo = pts.reduce((m, p) => m.min(p), new THREE.Vector3(Infinity, Infinity, 0)), hi = pts.reduce((m, p) => m.max(p), new THREE.Vector3(-Infinity, -Infinity, 0));
    const fill = Math.max(hi.x - lo.x, hi.y - lo.y) / 2 * 1.12; // a little margin
    const mid = new THREE.Vector3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, sphere.center.clone().project(this.camera).z).unproject(this.camera); // the middle of what shows
    this.camera.position.copy(mid).addScaledVector(dir, dist * fill);
    this.camera.lookAt(mid);
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  // Shoot every def in turn, one a frame, calling done(def, url) for each.
  all(defs, done) {
    const queue = [...defs];
    const next = () => {
      const def = queue.shift();
      if (!def) { this.world.clear(); return; }
      try { const url = this.shoot(def); if (url) done(def, url); } catch (err) { console.warn(`no thumbnail for ${def.id}: ${err.message}`); }
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }
}

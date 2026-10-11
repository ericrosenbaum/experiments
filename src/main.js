import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from './world/world.js';
import { Runtime } from './behavior/runtime.js';
import { Audio } from './audio.js';
import { App } from './ui/app.js';
import { Stage } from './stage.js';
import { Chat } from './chat/chat.js';
import { Graphics } from './graphics.js';

await RAPIER.init();

// ---- rendering ---------------------------------------------------------------
const gfx = new Graphics(document.getElementById('viewport'));
const { renderer, scene, camera, hemi, sun } = gfx; // sky, fog and light colors come from the world's theme
camera.position.set(-6, 19, -27);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 3);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 6;
controls.maxDistance = 140;
controls.keys = {}; // arrow keys belong to the kids' programs
controls.update();

// ---- world + behaviors -------------------------------------------------------
const world = new World(RAPIER, scene);
const audio = new Audio(camera);
const app = new App({ world, scene, camera, controls, renderer, audio });
const runtime = new Runtime({ world, audio, ui: app });
const stage = new Stage({ world, runtime, ui: app, view: { scene, hemi, sun, camera, controls, gfx } });
app.attach({ runtime, stage });
app.boot();
const chat = new Chat({ app, camera, controls, world });

document.getElementById('loading').remove();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  world.step(dt);
  app.update(dt);
  chat.update();
  controls.update();
  gfx.render(dt, controls.target);
});

// for debugging / tests
Object.assign(window, { __bb: { world, runtime, app, stage, chat, camera, controls } });

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from './world/world.js';
import { Runtime } from './behavior/runtime.js';
import { Audio } from './audio.js';
import { App } from './ui/app.js';
import { Stage } from './stage.js';
import { LocalSession } from './session.js';
import { NetSession } from './net/session.js';
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
// With ?room=<name> in the URL the world lives on the sim server and this page
// shows a mirror of it; otherwise everything runs right here.
const roomId = new URLSearchParams(location.search).get('room')?.replace(/[^\w-]/g, '').slice(0, 40) || null;
const world = new World(RAPIER, scene);
const audio = new Audio(camera);
const app = new App({ world, scene, camera, controls, renderer, audio });
const view = { scene, hemi, sun, camera, controls, gfx };
let session, runtime = null, stage = null;
if (roomId) {
  session = new NetSession({ app, world, room: roomId });
} else {
  runtime = new Runtime({ world, audio, ui: app });
  stage = new Stage({ world, runtime, ui: app, view });
  session = new LocalSession({ app, world, stage, runtime });
}
app.attach({ session, view });
app.boot();
const chat = new Chat({ app, camera, controls, world, session });
app.chat = chat;

document.getElementById('loading').remove();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  session.update?.(); // a mirror places its bodies from the latest snapshots
  world.step(dt);
  app.update(dt);
  chat.update();
  controls.update();
  gfx.render(dt, controls.target);
});

// for debugging / tests (stage is the session: same behaviorsOf/worldId either way)
Object.assign(window, { __bb: { world, runtime, app, stage: session, session, chat, camera, controls } });

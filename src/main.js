import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from './world/world.js';
import { Runtime } from './behavior/runtime.js';
import { Audio } from './audio.js';
import { App } from './ui/app.js';
import { Stage } from './stage.js';
import { Chat } from './chat/chat.js';

await RAPIER.init();

// ---- rendering ---------------------------------------------------------------
const container = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene(); // sky, fog and light colors come from the world's theme

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
camera.position.set(-6, 19, -27);

const hemi = new THREE.HemisphereLight(0xdff1ff, 0x5d7a3a, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4dd, 2.4);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 150 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03; // keeps hat brims from striping the faces under them
scene.add(sun, sun.target);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 3);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 6;
controls.maxDistance = 140;
controls.keys = {}; // arrow keys belong to the kids' programs
controls.update();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- world + behaviors -------------------------------------------------------
const world = new World(RAPIER, scene);
const audio = new Audio(camera);
const app = new App({ world, scene, camera, controls, renderer, audio });
const runtime = new Runtime({ world, audio, ui: app });
const stage = new Stage({ world, runtime, ui: app, view: { scene, hemi, sun, camera, controls } });
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
  renderer.render(scene, camera);
});

// for debugging / tests
Object.assign(window, { __bb: { world, runtime, app, stage, chat, camera, controls } });

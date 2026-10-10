import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { World } from './world/world.js';
import { buildWorld } from './world/worldmap.js';
import { Runtime } from './behavior/runtime.js';
import { Audio } from './audio.js';
import { App } from './ui/app.js';
import { Net } from './net.js';
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3f5);
scene.fog = new THREE.Fog(0x9fd3f5, 90, 190);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
camera.position.set(-6, 19, -27);

scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5d7a3a, 1.4));
const sun = new THREE.DirectionalLight(0xfff4dd, 2.4);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 150 });
sun.shadow.bias = -0.0005;
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
buildWorld(world);
const audio = new Audio(camera);
const net = new Net(world);
const app = new App({ world, scene, camera, controls, renderer, audio, net });
const runtime = new Runtime({ world, audio, ui: app, net });
app.attachRuntime(runtime);
net.attach(runtime, app);
// Give other players' tabs a moment to say hello, so we can spawn clear of their models.
await new Promise((r) => setTimeout(r, 400));
net.update(0);
app.boot();
const chat = new Chat({ app, net, camera, controls, world });
net.chat = chat;

document.getElementById('loading').remove();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  world.step(dt);
  net.update(dt);
  app.update(dt);
  chat.update();
  controls.update();
  renderer.render(scene, camera);
});

// for debugging / tests
Object.assign(window, { __bb: { world, runtime, app, net, chat, camera, controls } });

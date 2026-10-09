// Headless physics harness: the real World + library, no renderer.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { World } from '../src/world/world.js';
import { LIBRARY_BY_ID } from '../src/world/library.js';

export async function makeWorld() {
  await RAPIER.init();
  return new World(RAPIER, new THREE.Scene());
}
export function run(world, seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) world.step(1 / 60); }
export { LIBRARY_BY_ID };

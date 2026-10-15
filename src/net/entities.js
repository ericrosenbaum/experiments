// How an entity crosses the wire: the sim server describes one (its recipe,
// where its bodies are, what color it was painted), and the page builds the
// same thing from that description in its mirror of the world.
import * as THREE from 'three';
import { LIBRARY_BY_ID } from '../world/library.js';
import { applyColor, applyPartColor } from '../behavior/runtime.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const pose = (body) => {
  const t = body.translation(), r = body.rotation();
  return [r3(t.x), r3(t.y), r3(t.z), r3(r.x), r3(r.y), r3(r.z), r3(r.w)];
};

// bids: the body ids the room assigned, one per body in e.bodies order.
export function describeEntity(e, bids) {
  const recipe = e.recipe ? JSON.parse(JSON.stringify(e.recipe)) : null;
  if (recipe && recipe.opts && 'color' in recipe.opts && e.kind !== 'model') recipe.opts.color = e.color; // painted since
  const parts = {};
  for (const [name, p] of e.parts) if (p.colorOverride) parts[name] = p.colorOverride;
  const [chassis] = e.bodies;
  return {
    id: e.id, thingId: e.thingId, name: e.name, kind: e.kind, color: e.color, recipe,
    yaw: e.kind === 'model' ? e.heading() : 0,
    bodies: e.bodies.map(({ body }) => pose(body)),
    bids,
    parts: Object.keys(parts).length ? parts : undefined,
    sleeping: chassis ? chassis.body.isSleeping() : false,
    owner: e.owner?.key ?? undefined,
  };
}

// Build it in a world (a mirror), returning the entity, or null if the
// recipe is unknown.
export function buildEntity(world, d) {
  if (!d.recipe || !d.bodies.length) return null;
  const [x, y, z, qx, qy, qz, qw] = d.bodies[0];
  const quat = new THREE.Quaternion(qx, qy, qz, qw);
  const def = d.recipe.type === 'model' ? LIBRARY_BY_ID[d.recipe.defId] : undefined;
  if (d.recipe.type === 'model' && !def) return null;
  const e = world.rebuild(d.recipe, { x, y, z, quat, yaw: d.yaw, id: d.id, thingId: d.thingId, name: d.name, def, sleeping: d.sleeping });
  if (!e) return null;
  placeEntity(e, d.bodies);
  if (d.owner) e.owner = world.actor(d.owner);
  if (d.kind === 'model' && d.color && def && d.color !== def.color) applyColor(world, world.actor(e.thingId), d.color);
  for (const [name, c] of Object.entries(d.parts ?? {})) { const p = e.parts.get(name); if (p) applyPartColor(world, p, c); }
  return e;
}

// Put every body of an entity where a description says.
export function placeEntity(e, bodies) {
  e.bodies.forEach(({ body, object3d }, i) => {
    const b = bodies[i];
    if (!b) return;
    body.setTranslation({ x: b[0], y: b[1], z: b[2] }, false);
    body.setRotation({ x: b[3], y: b[4], z: b[5], w: b[6] }, false);
    object3d.position.set(b[0], b[1], b[2]);
    object3d.quaternion.set(b[3], b[4], b[5], b[6]);
  });
}

// The parts of a behavior a player's page needs (none of its program state).
export function describeBehavior(b) {
  return {
    id: b.id, enabled: b.enabled, running: !!b.running, text: b.text, html: b.html, code: b.code,
    summary: b.summary, source: b.source, notes: b.notes, keys: b.keys, title: b.title, by: b.by,
  };
}

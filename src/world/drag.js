// Holding a thing where a hand (or a player's hand over the wire) wants it:
// every body goes back to where it was when the drag started, turned by yaw
// about the pivot and shifted by delta, lifted a little so it doesn't scrape.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

// Remember where an actor's bodies are, to hold them relative to that.
export function dragBase(actor) {
  return actor.bodies().map(({ body }) => {
    const t = body.translation(), r = body.rotation();
    return { body, t: new THREE.Vector3(t.x, t.y, t.z), q: new THREE.Quaternion(r.x, r.y, r.z, r.w) };
  });
}

export function holdDrag({ base, pivot, delta, yaw }, lift = 0.4) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw * DEG);
  for (const { body, t, q: bq } of base) {
    const pos = t.clone().sub(pivot).applyQuaternion(q).add(pivot).add(delta);
    pos.y += lift;
    const rot = q.clone().multiply(bq);
    body.setTranslation(pos, true);
    body.setRotation(rot, true);
    if (body.isKinematic()) { body.setNextKinematicTranslation(pos); body.setNextKinematicRotation(rot); }
    else { body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
  }
}

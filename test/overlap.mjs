// Pairs of colliders on different entities that interpenetrate, measured
// with Rapier's own contact query (negative distance = penetration).
export function overlappingColliders(world, tolerance = 0.01) {
  const out = [];
  const cols = [];
  world.physics.forEachCollider((c) => cols.push(c));
  for (let i = 0; i < cols.length; i++) {
    const a = world.colliderInfo.get(cols[i].handle);
    if (!a || a.entity.kind === 'ground') continue;
    for (let j = i + 1; j < cols.length; j++) {
      const b = world.colliderInfo.get(cols[j].handle);
      if (!b || b.entity.kind === 'ground' || a.entity === b.entity) continue;
      const c = cols[i].contactCollider(cols[j], 0);
      if (c && c.distance < -tolerance) out.push([a, b, -c.distance]);
    }
  }
  return out;
}

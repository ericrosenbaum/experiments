// Path planning for goTo(): a grid over the ground around the mover and its
// goal, with every cell some obstacle stands in marked blocked (padded by the
// mover's own size), then A* for the shortest way around and a pass that
// cuts corners wherever there's a clear straight line. Obstacles come from the
// physics colliders, so anything solid counts: houses, trees, bricks, other
// models. Things low enough to drive over (roads, ponds, plates) don't.
import * as THREE from 'three';

const CELL = 1; // studs
const MARGIN = 24; // studs of room around the mover and the goal
const MAX_CELLS = 170; // per side; bigger areas use bigger cells
const ShapeBall = 0, ShapeCuboid = 1, ShapeRoundCuboid = 12;

// World-space box of a collider, [minX, minY, minZ, maxX, maxY, maxZ].
function colliderBox(col) {
  const t = col.translation();
  let hx, hy, hz;
  if (col.shapeType() === ShapeBall) {
    hx = hy = hz = col.radius();
  } else {
    const type = col.shapeType();
    const round = type === ShapeRoundCuboid ? col.roundRadius() : 0; // rounded edges add to the core
    const core = type === ShapeCuboid || type === ShapeRoundCuboid ? col.halfExtents() : { x: 1, y: 1, z: 1 };
    const h = { x: core.x + round, y: core.y + round, z: core.z + round };
    const r = col.rotation();
    const m = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w))).elements;
    // a rotated box's extent on each world axis (column-major elements)
    hx = Math.abs(m[0]) * h.x + Math.abs(m[3]) * h.y + Math.abs(m[6]) * h.z;
    hy = Math.abs(m[1]) * h.x + Math.abs(m[4]) * h.y + Math.abs(m[7]) * h.z;
    hz = Math.abs(m[2]) * h.x + Math.abs(m[5]) * h.y + Math.abs(m[8]) * h.z;
  }
  return [t.x - hx, t.y - hy, t.z - hz, t.x + hx, t.y + hy, t.z + hz];
}

// The blocked cells around `from` and `to`, for a mover of the given size.
// ignore(entity) leaves out the mover itself and what it's heading for.
function occupancy(world, from, to, { radius, bottom, top, ignore }) {
  const minX = Math.min(from.x, to.x) - MARGIN, maxX = Math.max(from.x, to.x) + MARGIN;
  const minZ = Math.min(from.z, to.z) - MARGIN, maxZ = Math.max(from.z, to.z) + MARGIN;
  const cell = Math.max(CELL, (maxX - minX) / MAX_CELLS, (maxZ - minZ) / MAX_CELLS);
  const w = Math.ceil((maxX - minX) / cell), h = Math.ceil((maxZ - minZ) / cell);
  const blocked = new Uint8Array(w * h);
  world.physics.forEachCollider((col) => {
    if (col.isSensor() || !col.isEnabled()) return;
    const info = world.colliderInfo.get(col.handle);
    if (!info || info.entity.kind === 'ground' || ignore(info.entity)) return;
    const [x0, y0, z0, x1, y1, z1] = colliderBox(col);
    if (y1 < bottom + 0.45 || y0 > top) return; // low enough to drive over, or overhead
    const i0 = Math.max(0, Math.floor((x0 - radius - minX) / cell)), i1 = Math.min(w - 1, Math.floor((x1 + radius - minX) / cell));
    const j0 = Math.max(0, Math.floor((z0 - radius - minZ) / cell)), j1 = Math.min(h - 1, Math.floor((z1 + radius - minZ) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * w + i] = 1;
  });
  return { blocked, w, h, cell, minX, minZ };
}

// A* on the grid (8 neighbors, no squeezing diagonally between two blocked
// cells). Returns cell indices from start to goal, or null.
function astar(g, start, goal) {
  const { blocked, w, h } = g;
  const gx = goal % w, gz = Math.floor(goal / w);
  const heur = (c) => { const dx = Math.abs(c % w - gx), dz = Math.abs(Math.floor(c / w) - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const cost = new Float32Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const heap = [[heur(start), start]];
  cost[start] = 0;
  const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= item[0]) break; heap[i] = heap[p]; i = p; } heap[i] = item; };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < (m === i ? last[0] : heap[m][0])) m = l; if (r < heap.length && heap[r][0] < (m === i ? last[0] : heap[m][0])) m = r; if (m === i) break; heap[i] = heap[m]; i = m; } heap[i] = last; }
    return top;
  };
  let steps = 0;
  while (heap.length && steps++ < 60000) {
    const [, c] = pop();
    if (c === goal) {
      const path = [c];
      for (let p = came[c]; p !== -1; p = came[p]) path.push(p);
      return path.reverse();
    }
    const cx = c % w, cz = Math.floor(c / w);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const n = nz * w + nx;
      if (blocked[n]) continue;
      if (dx && dz && (blocked[cz * w + nx] || blocked[nz * w + cx])) continue;
      const nc = cost[c] + (dx && dz ? 1.414 : 1);
      if (nc < cost[n]) { cost[n] = nc; came[n] = c; push([nc + heur(n), n]); }
    }
  }
  return null;
}

// Is the straight line between two cells clear of blocked cells?
function clearLine(g, a, b) {
  const { blocked, w } = g;
  let x0 = a % w, z0 = Math.floor(a / w);
  const x1 = b % w, z1 = Math.floor(b / w);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) * 2;
  for (let s = 1; s < n; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / n), z = Math.round(z0 + ((z1 - z0) * s) / n);
    if (blocked[z * w + x]) return false;
  }
  return true;
}

// Waypoints (ground points) from `from` to `to` around obstacles, the last
// being `to` itself; [to] when the way is clear, null when there's no way.
export function planPath(world, from, to, opts) {
  const g = occupancy(world, from, to, opts);
  const cellOf = (p) => {
    const i = THREE.MathUtils.clamp(Math.floor((p.x - g.minX) / g.cell), 0, g.w - 1);
    const j = THREE.MathUtils.clamp(Math.floor((p.z - g.minZ) / g.cell), 0, g.h - 1);
    return j * g.w + i;
  };
  // The mover's own spot and the goal's are always open: the padding can
  // reach them (squeezed against a wall, a target standing by a tree).
  const free = (c, r) => { const ci = c % g.w, cj = Math.floor(c / g.w); for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) if (i >= 0 && j >= 0 && i < g.w && j < g.h) g.blocked[j * g.w + i] = 0; };
  const start = cellOf(from), goal = cellOf(to);
  free(start, 1);
  free(goal, Math.ceil(2 / g.cell));
  if (clearLine(g, start, goal)) return [to.clone()];
  const cells = astar(g, start, goal);
  if (!cells) return null;
  // keep only the corners: skip ahead to the farthest cell in a clear line
  const keep = [];
  let at = 0;
  while (at < cells.length - 1) {
    let next = cells.length - 1;
    while (next > at + 1 && !clearLine(g, cells[at], cells[next])) next--;
    keep.push(cells[next]);
    at = next;
  }
  const point = (c) => new THREE.Vector3(g.minX + (c % g.w + 0.5) * g.cell, 0, g.minZ + (Math.floor(c / g.w) + 0.5) * g.cell);
  const path = keep.slice(0, -1).map(point);
  path.push(to.clone());
  return path;
}

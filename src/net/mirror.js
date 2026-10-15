// The page's copy of a room's world. Nothing here is simulated: things are
// built from the server's descriptions and moved by its snapshots, drawn a
// little behind the newest one so motion between snapshots is smooth.
import { buildEntity, placeEntity } from './entities.js';
import { dequantize } from './codec.js';
import { applyColor, applyPartColor } from '../behavior/runtime.js';

const DELAY = 100; // ms behind the server: two snapshot intervals of headroom for jitter
const GAP = 150; // a body that was still for longer than this just starts from its last place
const HOLD_MS = 400; // after a drag, keep the thing where the hand left it until a snapshot moves it

export class Mirror {
  constructor(world) {
    this.world = world;
    world.mirror = true;
    this.bodies = new Map(); // bid -> {body, entity, main, prev, next}
    this.offset = null; // server clock - page clock, smoothed
    this.held = new Map(); // body -> until (ms): being dragged here, or just dropped
  }

  // A whole world, fresh.
  load(manifest, localNow) {
    this.world.clear();
    this.bodies.clear();
    this.held.clear();
    for (const d of manifest.entities) this.add(d);
    this.world.setGravity(manifest.gravity ?? 1);
    for (const p of manifest.pens ?? []) this.pen(p);
    if (manifest.groundColor) applyColor(this.world, this.world.actor('world'), manifest.groundColor);
    if (manifest.t != null) this.offset = manifest.t - localNow;
  }

  add(d) {
    const e = buildEntity(this.world, d);
    if (!e) return null;
    d.bids.forEach((bid, i) => {
      const b = e.bodies[i];
      if (b) this.bodies.set(bid, { body: b.body, entity: e, main: i === 0, prev: null, next: null });
    });
    return e;
  }

  remove(ids) {
    for (const id of ids) {
      const e = this.world.entities.get(id);
      if (!e) continue;
      for (const [bid, b] of this.bodies) if (b.entity === e) this.bodies.delete(bid);
      this.world.remove(e);
    }
  }

  color(key, color, part) {
    const a = this.world.actor(key);
    if (!a.alive) return;
    if (part) { const p = a.model?.parts.get(part); if (p) applyPartColor(this.world, p, color); } else applyColor(this.world, a, color);
  }

  pen(m) {
    if (!m.key) { this.world.clearDrawing(); return; }
    const p = this.world.pen(m.key);
    if (p.down !== m.down) p.last = null;
    p.down = m.down; p.color = m.color; p.size = m.size;
  }

  // Hold a thing's bodies where the page put them (a drag), ignoring snapshots.
  hold(bodies, forMs = Infinity) {
    const until = forMs === Infinity ? Infinity : performance.now() + forMs;
    for (const body of bodies) this.held.set(body, until);
  }
  drop(bodies) { this.hold(bodies, HOLD_MS); }

  applySnapshot(snap, localNow) {
    const off = snap.t - localNow;
    this.offset = this.offset == null ? off : this.offset + (off - this.offset) * 0.1;
    for (const [bid, qv] of snap.bodies) {
      const b = this.bodies.get(bid);
      if (!b) continue;
      const { p, q } = dequantize(qv);
      const sample = { t: snap.t, p, q };
      b.prev = b.next ?? sample;
      b.next = sample;
      if (this.held.get(b.body) !== Infinity) this.held.delete(b.body); // a dropped thing: the server has it now
    }
  }

  // Place every body for this frame.
  update(localNow) {
    if (this.offset == null) return;
    const renderT = localNow + this.offset - DELAY;
    const now = performance.now();
    for (const b of this.bodies.values()) {
      if (!b.next) continue;
      const until = this.held.get(b.body);
      if (until != null) { if (now < until) continue; this.held.delete(b.body); }
      let { prev, next } = b;
      if (next.t - prev.t > GAP) prev = { ...prev, t: next.t - 50 };
      let p, q;
      if (renderT >= next.t || prev === next) { p = next.p; q = next.q; }
      else if (renderT <= prev.t) { p = prev.p; q = prev.q; }
      else {
        const f = (renderT - prev.t) / (next.t - prev.t);
        p = [prev.p[0] + (next.p[0] - prev.p[0]) * f, prev.p[1] + (next.p[1] - prev.p[1]) * f, prev.p[2] + (next.p[2] - prev.p[2]) * f];
        q = slerp(prev.q, next.q, f);
      }
      b.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, false);
      b.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, false);
      if (b.main) { // how fast it's going, for the minifigures' legs
        const dt = (b.next.t - b.prev.t) / 1000;
        b.entity.mirrorSpeed = dt > 0 && dt < 1 ? Math.hypot(b.next.p[0] - b.prev.p[0], b.next.p[2] - b.prev.p[2]) / dt : 0;
      }
    }
  }
}

function slerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let s = 1;
  if (dot < 0) { dot = -dot; s = -1; }
  if (dot > 0.9995) {
    const out = [a[0] + (s * b[0] - a[0]) * t, a[1] + (s * b[1] - a[1]) * t, a[2] + (s * b[2] - a[2]) * t, a[3] + (s * b[3] - a[3]) * t];
    const l = Math.hypot(...out);
    return out.map((v) => v / l);
  }
  const th = Math.acos(dot), sin = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / sin, wb = s * Math.sin(t * th) / sin;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
}

export { placeEntity };

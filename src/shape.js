// A drawn stroke and the sound sung while drawing it, after Shape.mm.
//
// The stroke is a triangle strip: each touch point adds one vertex on either
// side of the finger's path, as far out as the sound was loud, colored by its
// pitch. Each point also remembers how far into the recording it was drawn,
// so touching the stroke anywhere plays the sound from there.
//
// Units are CSS pixels; the original's sizes were iPad retina pixels and are
// halved here.

const BULGE_RATIO = 2;
const BULGE_POINTS = 10;
const HIT_MARGIN = 5;
// Issue #4: the start is the easiest place to miss and the one people aim
// for most, so its hit area reaches this much further
const START_BULGE = 12;
const CAP_STEPS = 12;
// floats per vertex: x, y, r, g, b
export const STRIDE = 5;

export class Shape {
  constructor(id) {
    this.id = id;
    this.points = []; // { x, y, width, angle, color: [r, g, b], audioPos }
    this.vertices = new Float32Array(64 * 2 * STRIDE);
    this.vertexCount = 0;
    this.version = 0; // bumped whenever vertices change, for the renderer
    this.hit = null; // the strip widened by HIT_MARGIN, once the shape is done
    this.bounds = null;
    this.samples = null; // the recording, once the worklet hands it back
    this.finished = false;
    // playback, mirrored from the worklet
    this.playing = false;
    this.token = 0;
    this.playPos = 0;
  }

  /** Shape::addPoint: extend the stroke to `p`, heading from `prev`. */
  addPoint(p, prev, width, color, audioPos) {
    const angle = Math.atan2(p.y - prev.y, p.x - prev.x);
    const point = { x: p.x, y: p.y, width, angle, color, audioPos };
    this.points.push(point);
    if ((this.vertexCount + 2) * STRIDE > this.vertices.length) {
      const grown = new Float32Array(this.vertices.length * 2);
      grown.set(this.vertices);
      this.vertices = grown;
    }
    this.vertexCount += 2;
    writePoint(this.vertices, this.points.length - 1, point, width);
    if (this.points.length === 2) {
      // the first point's heading came from wherever the finger went down,
      // which can kink the start; square it to the first segment instead
      const first = this.points[0];
      first.angle = angle;
      writePoint(this.vertices, 0, first, first.width);
    }
    this.version++;
  }

  /** Shape::makeHitTestMesh, plus a bounding box to skip most tests early. */
  finish() {
    const n = this.points.length;
    this.hit = new Float32Array(n * 2 * 2);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const pt = this.points[i];
      const [ax, ay, bx, by] = sides(pt, pt.width + HIT_MARGIN);
      this.hit.set([ax, ay, bx, by], i * 4);
      minX = Math.min(minX, ax, bx);
      minY = Math.min(minY, ay, by);
      maxX = Math.max(maxX, ax, bx);
      maxY = Math.max(maxY, ay, by);
    }
    for (const [pt, r] of this.endCircles()) {
      minX = Math.min(minX, pt.x - r);
      minY = Math.min(minY, pt.y - r);
      maxX = Math.max(maxX, pt.x + r);
      maxY = Math.max(maxY, pt.y + r);
    }
    this.bounds = { minX, minY, maxX, maxY };
    this.finished = true;
  }

  // the round caps' hit areas, the start's enlarged
  endCircles() {
    const first = this.points[0];
    const last = this.points.at(-1);
    return [
      [first, first.width + HIT_MARGIN + START_BULGE],
      [last, last.width + HIT_MARGIN],
    ];
  }

  /** Is `p` on the shape (with a little margin)? */
  inside(p) {
    if (!this.hit || this.points.length < 2) return false;
    const b = this.bounds;
    if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) return false;
    for (const [pt, r] of this.endCircles()) if ((p.x - pt.x) ** 2 + (p.y - pt.y) ** 2 <= r * r) return true;
    const h = this.hit;
    const nv = h.length / 2;
    for (let i = 0; i < nv - 2; i++) {
      if (pointInTriangle(p.x, p.y, h[i * 2], h[i * 2 + 1], h[i * 2 + 2], h[i * 2 + 3], h[i * 2 + 4], h[i * 2 + 5])) return true;
    }
    return false;
  }

  /**
   * The point on the stroke's center line under `p`, as the segment it lies
   * on and how far along it. Issue #11: where a stroke crosses itself, the
   * finger is on several parts at once, and the one drawn last wins, since
   * that's the one on top. A "part" is a run of consecutive segments within
   * reach; within it, and when nothing is in reach, it's simply the closest.
   */
  closest(p) {
    const pts = this.points;
    if (pts.length < 2) return { segment: 0, t: 0 };
    let best = Infinity;
    let segment = 0;
    let t = 0;
    let run = null; // the latest run of in-reach segments: { last, best, segment, t }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const u = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
      const ex = a.x + u * dx - p.x;
      const ey = a.y + u * dy - p.y;
      const d = ex * ex + ey * ey;
      if (d < best) {
        best = d;
        segment = i;
        t = u;
      }
      const reach = Math.max(a.width, b.width) + HIT_MARGIN;
      if (d <= reach * reach) {
        if (!run || run.last !== i - 1) run = { last: i, best: Infinity, segment: i, t: u };
        run.last = i;
        if (d < run.best) Object.assign(run, { best: d, segment: i, t: u });
      }
    }
    return run ? { segment: run.segment, t: run.t } : { segment, t };
  }

  /** Where in the recording to start when touched at `p`. */
  audioPositionAt(p) {
    const { segment, t } = this.closest(p);
    const a = this.points[segment];
    const b = this.points[Math.min(segment + 1, this.points.length - 1)];
    return a.audioPos + (b.audioPos - a.audioPos) * t;
  }

  /** Direction of the stroke as drawn (radians) at the segment under `p`. */
  headingAt(p) {
    const { segment } = this.closest(p);
    const a = this.points[segment];
    const b = this.points[segment + 1];
    if (!b || (a.x === b.x && a.y === b.y)) return a.angle;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /**
   * Shape::updatePlayback: +1 to keep playing forward, -1 if the finger is
   * moving against the direction the stroke was drawn, or null to leave it.
   * Issue #2: the original compared raw angles, so heading left could read as
   * reversing on a stroke drawn leftward, and it took the heading of the
   * nearest touch point, which on a tight curve can point well off the
   * stroke. This compares the wrapped difference with the segment itself.
   */
  directionFor(p, prev) {
    if (p.x === prev.x && p.y === prev.y) return null;
    const touchAngle = Math.atan2(p.y - prev.y, p.x - prev.x);
    let diff = Math.abs(touchAngle - this.headingAt(p)) % (2 * Math.PI);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    return diff > Math.PI / 2 ? -1 : 1;
  }

  /**
   * How fast, in px per second, the finger moved along the stroke while
   * drawing it, around `p`; for turning a swipe's speed into a playback rate.
   */
  drawingSpeedAt(p, sampleRate) {
    const { segment } = this.closest(p);
    const pts = this.points;
    // over a few points either side: single segments are jittery
    const a = pts[Math.max(0, segment - 3)];
    const b = pts[Math.min(pts.length - 1, segment + 4)];
    let len = 0;
    for (let i = Math.max(0, segment - 3); i < Math.min(pts.length - 1, segment + 4); i++) {
      len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    const seconds = (b.audioPos - a.audioPos) / sampleRate;
    return seconds > 0 ? len / seconds : 0;
  }

  /** Shape::getIndexAtPlaybackPosition. */
  indexAtAudioPosition(pos) {
    const pts = this.points;
    for (let i = 1; i < pts.length; i++) if (pts[i].audioPos > pos) return i - 1;
    return pts.length - 1;
  }

  /**
   * Shape::animate: the vertices with a pulsing bulge trailing behind the
   * playback point. `time` is in seconds. Returns `scratch` (grown if needed).
   */
  animatedVertices(time, scratch) {
    const len = this.vertexCount * STRIDE;
    if (!scratch || scratch.length < len) scratch = new Float32Array(Math.max(len, 1024) * 2);
    scratch.set(this.vertices.subarray(0, len));
    // 5 + sin(frame / 3) * 5 retina pixels at 60 frames a second
    const osc = (5 + Math.sin(time * 20) * 5) / 2;
    const end = this.indexAtAudioPosition(this.playPos);
    for (let i = 0; i < BULGE_POINTS; i++) {
      const index = end - i;
      if (index < 0) break;
      const pt = this.points[index];
      const ratio = 1 - i / BULGE_POINTS;
      writePoint(scratch, index, pt, pt.width + pt.width * ratio * BULGE_RATIO + osc);
    }
    return scratch;
  }
}

/**
 * Issue #10: round caps on both ends, as triangles (x, y, r, g, b each), from
 * a strip's vertices so they follow the playback bulge too.
 */
export function capVertices(shape, verts, out) {
  const n = shape.points.length;
  const size = 2 * CAP_STEPS * 3 * STRIDE;
  if (!out || out.length < size) out = new Float32Array(size);
  let o = 0;
  for (const [i, from] of [
    [0, Math.PI / 2], // the start's cap sweeps around behind it
    [n - 1, -Math.PI / 2], // the end's, ahead of it
  ]) {
    const pt = shape.points[i];
    const v = i * 2 * STRIDE;
    const ax = verts[v];
    const ay = verts[v + 1];
    const bx = verts[v + STRIDE];
    const by = verts[v + STRIDE + 1];
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    const r = Math.hypot(ax - bx, ay - by) / 2;
    const [cr, cg, cb] = pt.color;
    for (let k = 0; k < CAP_STEPS; k++) {
      const t0 = pt.angle + from + (k / CAP_STEPS) * Math.PI;
      const t1 = pt.angle + from + ((k + 1) / CAP_STEPS) * Math.PI;
      for (const [x, y] of [
        [cx, cy],
        [cx + Math.cos(t0) * r, cy + Math.sin(t0) * r],
        [cx + Math.cos(t1) * r, cy + Math.sin(t1) * r],
      ]) {
        out[o++] = x;
        out[o++] = y;
        out[o++] = cr;
        out[o++] = cg;
        out[o++] = cb;
      }
    }
  }
  return out;
}

export const CAP_VERTEX_COUNT = 2 * CAP_STEPS * 3;

// the two strip vertices for a point: to its right, then to its left
function sides(pt, width) {
  const r = pt.angle + Math.PI / 2;
  const l = pt.angle - Math.PI / 2;
  return [pt.x + Math.cos(r) * width, pt.y + Math.sin(r) * width, pt.x + Math.cos(l) * width, pt.y + Math.sin(l) * width];
}

function writePoint(verts, i, pt, width) {
  const [ax, ay, bx, by] = sides(pt, width);
  const [r, g, b] = pt.color;
  const o = i * 2 * STRIDE;
  verts[o] = ax;
  verts[o + 1] = ay;
  verts[o + 2] = r;
  verts[o + 3] = g;
  verts[o + 4] = b;
  verts[o + 5] = bx;
  verts[o + 6] = by;
  verts[o + 7] = r;
  verts[o + 8] = g;
  verts[o + 9] = b;
}

function sign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const b1 = sign(px, py, ax, ay, bx, by) < 0;
  const b2 = sign(px, py, bx, by, cx, cy) < 0;
  const b3 = sign(px, py, cx, cy, ax, ay) < 0;
  return b1 === b2 && b2 === b3;
}

/** ofColor::setHsb with hue and saturation from 0 to 1 and full brightness, as 0–1 RGB. */
export function hsbToRgb(h, s) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return 1 - s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

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
    this.bounds = { minX, minY, maxX, maxY };
    this.finished = true;
  }

  /** Is `p` on the shape (with a little margin)? */
  inside(p) {
    if (!this.hit || this.points.length < 2) return false;
    const b = this.bounds;
    if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) return false;
    const h = this.hit;
    const nv = h.length / 2;
    for (let i = 0; i < nv - 2; i++) {
      if (pointInTriangle(p.x, p.y, h[i * 2], h[i * 2 + 1], h[i * 2 + 2], h[i * 2 + 3], h[i * 2 + 4], h[i * 2 + 5])) return true;
    }
    return false;
  }

  /**
   * The point on the stroke's center line closest to `p`, as the segment it
   * lies on and how far along it. `index` is the nearest vertex, rounded the
   * way ofPolyline::getClosestPoint rounds it.
   */
  closest(p) {
    const pts = this.points;
    if (pts.length < 2) return { segment: 0, t: 0, index: 0 };
    let best = Infinity;
    let segment = 0;
    let t = 0;
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
    }
    return { segment, t, index: t > 0.5 ? segment + 1 : segment };
  }

  /** Where in the recording to start when touched at `p`. */
  audioPositionAt(p) {
    const { segment, t } = this.closest(p);
    const a = this.points[segment];
    const b = this.points[Math.min(segment + 1, this.points.length - 1)];
    return a.audioPos + (b.audioPos - a.audioPos) * t;
  }

  /**
   * Shape::updatePlayback: +1 to keep playing forward, -1 if the finger is
   * moving against the direction the stroke was drawn, or null to leave it.
   */
  directionFor(p, prev) {
    if (p.x === prev.x && p.y === prev.y) return null;
    const { index } = this.closest(p);
    if (index <= 1) return null;
    const touchAngle = Math.atan2(p.y - prev.y, p.x - prev.x);
    // the original compared raw angles, so heading left could read as
    // reversing on a stroke drawn leftward; compare the wrapped difference
    let diff = Math.abs(touchAngle - this.points[index].angle) % (2 * Math.PI);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    return diff > Math.PI / 2 ? -1 : 1;
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

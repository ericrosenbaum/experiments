// Touch handling, modes and buttons, after ofApp.mm.
//
// Touch blank canvas and sing while you move: a stroke grows wherever there
// is sound, colored by its pitch and as wide as it is loud, and stops when
// the sound does. Touch a stroke to hear what was sung there; rub along it to
// keep going, or back against it to play in reverse. In lock mode every
// touch plays, so nothing gets drawn by accident.

import { Shape, hsbToRgb } from './shape.js';
import { encodeShape, decodeShape, saved } from './storage.js';

// Issue #1: a finger has to travel this far (px) before its direction can
// reverse a stroke, so a wobble while holding still doesn't
const REVERSE_DISTANCE = 8;
// Issue #3: strokes with less sound than this (seconds) are slips, not songs
const MIN_SOUND = 0.15;
// Issue #12: let go of a stroke while swiping along it at least this fast
// (px/s) and it keeps playing, faster or slower as the swipe was
const FLING_SPEED = 450;
const MAX_FLING_RATE = 4;

export class SingingFingers {
  constructor({ canvas, renderer, audio, hud }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.audio = audio;
    this.hud = hud;
    this.shapes = [];
    this.nextId = 1;
    this.locked = false;
    this.pointers = new Map(); // pointerId -> { kind: 'play' | 'draw', prev, shapes | shape }
    this.drawing = null; // the pointer that's drawing; one at a time, as there's one microphone

    audio.onEnded = (id, token) => {
      const s = this.byId(id);
      if (s && s.token === token) s.playing = false;
    };
    audio.onTick = (m) => {
      for (const [id, pos, token] of m.voices) {
        const s = this.byId(id);
        if (s && s.token === token) s.playPos = pos;
      }
    };
    audio.onRecorded = (id, samples) => {
      const s = this.byId(id);
      if (!s) return;
      s.samples = samples;
      saved.put(encodeShape(s, audio.sampleRate));
    };

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const frame = (ms) => {
      renderer.draw(this.shapes, ms / 1000);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  byId(id) {
    return this.shapes.find((s) => s.id === id);
  }

  /** Bring back the drawing from last time. Call once the audio is running. */
  async restore() {
    const recs = (await saved.all()).sort((a, b) => a.id - b.id);
    for (const rec of recs) {
      const { id, points, samples } = decodeShape(rec, this.audio.sampleRate);
      const s = new Shape(id);
      // addPoint takes the heading from the previous touch; recreate one
      // that gives the saved angle
      for (const p of points) s.addPoint(p, { x: p.x - Math.cos(p.angle), y: p.y - Math.sin(p.angle) }, p.width, p.color, p.audioPos);
      s.finish();
      s.samples = samples;
      this.audio.load(id, samples);
      this.shapes.push(s);
      this.nextId = Math.max(this.nextId, id + 1);
    }
    return recs.length;
  }

  pointFor(e) {
    return { x: e.clientX, y: e.clientY, t: e.timeStamp };
  }

  get color() {
    return hsbToRgb(this.audio.hue, this.audio.saturation);
  }

  // ofApp::touchDown
  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.pointFor(e);
    const touched = this.shapes.filter((s) => s.finished && s.inside(p));
    if (touched.length || this.locked) {
      const ptr = { kind: 'play', prev: p, shapes: new Set(touched), anchors: new Map(), trail: [p] };
      for (const s of touched) this.startPlaying(s, p, ptr);
      this.pointers.set(e.pointerId, ptr);
    } else if (!this.drawing) {
      this.drawing = { kind: 'draw', prev: p, shape: null };
      this.pointers.set(e.pointerId, this.drawing);
      if (!this.audio.mic) this.hud.noMic();
    }
  }

  // ofApp::touchMoved
  move(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) this.moveTo(ptr, this.pointFor(ev));
  }

  moveTo(ptr, p) {
    if (p.x === ptr.prev.x && p.y === ptr.prev.y) return;

    if (ptr.kind === 'play') {
      for (const s of this.shapes) {
        if (!s.finished || !s.inside(p)) continue;
        ptr.shapes.add(s);
        if (!s.playing) {
          this.startPlaying(s, p, ptr);
          continue;
        }
        const anchor = ptr.anchors.get(s) ?? p;
        if (Math.hypot(p.x - anchor.x, p.y - anchor.y) < REVERSE_DISTANCE) {
          if (!ptr.anchors.has(s)) ptr.anchors.set(s, p);
          continue;
        }
        const rate = s.directionFor(p, anchor);
        if (rate !== null) this.audio.direction(s.id, rate);
        ptr.anchors.set(s, p);
      }
      ptr.prev = p;
      ptr.trail.push(p);
      if (ptr.trail.length > 32) ptr.trail.shift();
      return;
    }

    const width = this.audio.width;
    if (!ptr.shape) {
      // waiting for a sound to start a stroke
      if (width > 0) {
        const s = new Shape(this.nextId++);
        this.shapes.push(s);
        this.audio.record(s.id);
        s.addPoint(p, ptr.prev, width, this.color, 0);
        ptr.shape = s;
      }
      ptr.prev = p;
    } else if (!(width > 0)) {
      // the sound stopped: end the stroke, and start another if it comes back
      this.endShape(ptr, p);
    } else {
      ptr.shape.addPoint(p, ptr.prev, width, this.color, this.recPos(ptr.shape));
      ptr.prev = p;
    }
  }

  // ofApp::touchUp
  up(e) {
    const ptr = this.pointers.get(e.pointerId);
    this.hud.hideTips();
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    if (ptr.kind === 'draw') {
      if (ptr.shape) this.endShape(ptr, this.pointFor(e));
      this.drawing = null;
      return;
    }
    // stop what this finger was playing, unless another finger still is, or
    // it was flung
    const held = new Set();
    for (const other of this.pointers.values()) if (other.kind === 'play') other.shapes.forEach((s) => held.add(s));
    const velocity = swipeVelocity(ptr.trail, e.timeStamp);
    for (const s of ptr.shapes) {
      if (held.has(s) || !s.playing) continue;
      if (!this.fling(s, ptr.prev, velocity)) this.stopPlaying(s);
    }
  }

  /** Issue #12: keep `s` playing after a swipe, at the swipe's speed. */
  fling(s, p, v) {
    if (!v || !s.inside(p)) return false;
    const heading = s.headingAt(p);
    const along = v.x * Math.cos(heading) + v.y * Math.sin(heading);
    if (Math.abs(along) < FLING_SPEED) return false;
    const drawn = s.drawingSpeedAt(p, this.audio.sampleRate);
    if (!(drawn > 0)) return false;
    const rate = Math.sign(along) * Math.min(MAX_FLING_RATE, Math.max(0.25, Math.abs(along) / drawn));
    this.audio.direction(s.id, rate);
    return true;
  }

  recPos(shape) {
    return this.audio.recId === shape.id ? this.audio.recPos : 0;
  }

  // ofApp::endShape
  endShape(ptr, p) {
    const s = ptr.shape;
    ptr.shape = null;
    // the original ended a stroke cut off by silence at zero width; with
    // round caps it keeps its last width instead
    const width = this.audio.width || s.points.at(-1).width;
    if (p.x !== ptr.prev.x || p.y !== ptr.prev.y) s.addPoint(p, ptr.prev, width, this.color, this.recPos(s));
    this.audio.endRecord(s.id);
    if (s.points.length < 2 || this.recPos(s) < MIN_SOUND * this.audio.sampleRate) {
      // a slip: too short to see, touch or hear
      this.removeShape(s);
      return;
    }
    s.finish();
  }

  // Shape::startPlaying
  startPlaying(s, p, ptr) {
    ptr?.anchors.set(s, p);
    s.playing = true;
    s.token++;
    s.playPos = s.audioPositionAt(p);
    this.audio.play(s.id, s.playPos, s.token);
  }

  // Shape::stopPlaying
  stopPlaying(s) {
    s.playing = false;
    this.audio.stop(s.id);
  }

  removeShape(s) {
    this.shapes.splice(this.shapes.indexOf(s), 1);
    this.renderer.forget(s);
    this.audio.remove(s.id);
    saved.delete(s.id);
  }

  undo() {
    if (this.drawing?.shape) {
      this.audio.endRecord(this.drawing.shape.id);
      this.drawing.shape = null;
    }
    const last = this.shapes.at(-1);
    if (last) this.removeShape(last);
  }

  clear() {
    if (this.drawing) this.drawing.shape = null;
    for (const s of this.shapes) this.renderer.forget(s);
    this.shapes = [];
    this.audio.clear();
    saved.clear();
  }

  setLocked(locked) {
    this.locked = locked;
  }
}

/** The finger's velocity (px/s) over its last tenth of a second, if it was still moving when lifted. */
function swipeVelocity(trail, now) {
  const last = trail.at(-1);
  if (!last || now - last.t > 60) return null;
  let first = last;
  for (let i = trail.length - 2; i >= 0 && last.t - trail[i].t <= 100; i--) first = trail[i];
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.015) return null;
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

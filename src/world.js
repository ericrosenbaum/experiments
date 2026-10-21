// The things on the canvas. Each keeps its document data plus a PixiJS
// display object, positioned in canvas units; the world container applies
// the camera.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { BELL_RADIUS, REC_BELL_RADIUS, PATH_PLAYER_RADIUS, PATH_HEAD_RADIUS, BUMP } from './config.js';
import { NOTE_FUNCTIONS, NOTE_NAMES, bellColor, hsv } from './music.js';

const pulse = (t) => 0.75 + 0.25 * Math.sin(t * 18); // selected things flash
const ease = (current, target, dt) => current + (target - current) * (1 - 0.9 ** (dt * 60));
const gray = (v) => {
  const c = Math.round(v * 255);
  return (c << 16) | (c << 8) | c;
};

class Item {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;
    this.radius = radius;
    this.selected = false;
    this.dragging = false;
    this.view = new Container();
  }
  hit(cx, cy) {
    return Math.hypot(cx - this.x, cy - this.y) < this.radius;
  }
  bump() {
    this.radius = this.baseRadius + BUMP;
  }
  moveBy(dx, dy) {
    this.x += dx;
    this.y += dy;
  }
  update(dt) {
    this.radius = ease(this.radius, this.baseRadius, dt);
  }
  destroy() {
    this.view.destroy({ children: true });
  }
}

export class Bell extends Item {
  kind = 'bell';

  constructor(textures, { x, y, note, octave, instrument }) {
    super(x, y, BELL_RADIUS);
    this.textures = textures;
    this.note = note;
    this.octave = octave;
    this.instrument = instrument;
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5);
    this.view.addChild(this.sprite);
    this.label = null;
    this.setPitch(note, octave);
  }

  setPitch(note, octave) {
    this.note = note;
    this.octave = octave;
    this.sprite.texture = this.textures.bells[this.instrument][NOTE_FUNCTIONS[note]];
    if (this.label) this.label.text = NOTE_NAMES[note];
  }

  /** Called by the app whenever this bell is played, however it was triggered. */
  trigger(app, source) {
    app.playBellNote(this, source);
  }

  sync(t, opts) {
    this.view.position.set(this.x, this.y);
    this.sprite.scale.set(this.radius / BELL_RADIUS);
    this.sprite.tint = bellColor(this.note, this.octave, this.selected ? pulse(t) : 1);
    this.view.alpha = this.dragging ? 0.78 : 1;
    if (opts.showNoteNames && !this.label) {
      this.label = new Text({
        text: NOTE_NAMES[this.note],
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 22,
          fontWeight: '700',
          fill: 0xffffff,
          dropShadow: { color: 0x000000, distance: 2, blur: 0, angle: Math.PI / 4, alpha: 1 },
        },
      });
      this.label.anchor.set(0.5);
      this.view.addChild(this.label);
    }
    if (this.label) this.label.visible = opts.showNoteNames;
  }

  toData() {
    return { x: this.x, y: this.y, note: this.note, octave: this.octave, instrument: this.instrument };
  }
}

const LOOKAHEAD = 0.1; // seconds of notes handed to the audio clock ahead of time

export class RecorderBell extends Item {
  kind = 'rec';

  constructor(textures, { x, y, notes }) {
    super(x, y, REC_BELL_RADIUS);
    this.notes = notes.map((n) => ({ ...n })).sort((a, b) => a.time - b.time);
    this.playing = false;
    this.shown = this.notes.length; // notes drawn in the little score
    this.scheduled = 0;
    this.start = 0;
    this.sprite = new Sprite(textures.recBell);
    this.sprite.anchor.set(0.5);
    this.score = new Graphics();
    this.view.addChild(this.sprite, this.score);
    this.drawnScore = -1;
  }

  trigger(app) {
    this.playing = !this.playing;
    if (this.playing) {
      this.start = app.audioNow() + 0.03;
      this.scheduled = 0;
      this.shown = 0;
    } else {
      this.shown = this.notes.length;
    }
    this.bump();
  }

  stop() {
    this.playing = false;
    this.shown = this.notes.length;
  }

  update(dt, app) {
    super.update(dt);
    if (!this.playing) return;
    const elapsed = app.audioNow() - this.start;
    // hand notes to the audio clock slightly early so they land on time
    while (this.scheduled < this.notes.length && this.notes[this.scheduled].time <= elapsed + LOOKAHEAD) {
      const n = this.notes[this.scheduled++];
      app.playRecordedNote(n, this.start + n.time);
    }
    // and show them as they sound
    while (this.shown < this.notes.length && this.notes[this.shown].time <= elapsed) {
      this.shown++;
      this.bump();
    }
    if (this.shown >= this.notes.length) this.playing = false;
  }

  sync(t) {
    this.view.position.set(this.x, this.y);
    this.view.scale.set(this.radius / REC_BELL_RADIUS);
    this.sprite.width = this.sprite.height = REC_BELL_RADIUS * 2;
    let v = this.playing ? 1 : 150 / 255;
    if (this.selected) v = pulse(t);
    this.sprite.tint = gray(v);
    this.view.alpha = this.dragging ? 0.78 : 1;
    if (this.drawnScore !== this.shown) this.drawScore();
  }

  // The recorded notes as colored diamonds: time across, pitch up.
  drawScore() {
    const r = REC_BELL_RADIUS;
    const last = this.notes.at(-1)?.time ?? 0;
    const duration = last < 0.5 ? 1 : last;
    const height = (r * 2) / 3;
    const width = r * 2 - r / 2;
    const noteHeight = height / 36;
    const x0 = -r + r / 4;
    const y0 = height / 2;
    const g = this.score.clear();
    for (let i = 0; i < this.shown; i++) {
      const n = this.notes[i];
      const x = x0 + (n.time / duration) * width;
      const y = y0 - (n.note + 1 + 12 * n.octave) * noteHeight;
      const s = 3.2;
      g.poly([x, y - s, x + s, y, x, y + s, x - s, y]).fill(hsv(n.note / 13, 1, 0.75));
    }
    this.drawnScore = this.shown;
  }

  toData() {
    return { x: this.x, y: this.y, notes: this.notes.map((n) => ({ ...n })) };
  }
}

const PATH_PINK = hsv(220 / 255, 1, 1);
const PATH_PINK_DIM = hsv(220 / 255, 1, 90 / 255);

export class PathPlayer extends Item {
  kind = 'path';

  constructor(textures, { x, y, points = [] }, now = 0) {
    super(x, y, PATH_PLAYER_RADIUS);
    this.points = points.map((p) => ({ ...p })); // relative to x, y
    this.playing = false;
    this.startTime = 0;
    this.index = 0;
    this.touching = new Set();
    this.drawingStart = now;
    this.headAngle = 0;
    this.lit = false; // force the path to look lit, for thumbnails

    this.line = new Graphics();
    this.sprite = new Sprite(textures.pathPlayer);
    this.sprite.anchor.set(0.5);
    this.head = new Sprite(textures.pathHead);
    this.head.anchor.set(0.5);
    this.head.visible = false;
    this.view.addChild(this.line, this.sprite, this.head);
    this.lineKey = '';
  }

  /** Add a point while drawing, in canvas coordinates. */
  addPoint(cx, cy, now) {
    const x = cx - this.x;
    const y = cy - this.y;
    if (this.points.length === 0) {
      // don't start the path inside the player; the clock starts on leaving it
      if (Math.hypot(x, y) < PATH_PLAYER_RADIUS) {
        this.drawingStart = now;
        return;
      }
    } else {
      const last = this.points.at(-1);
      if (Math.hypot(x - last.x, y - last.y) < 5) return;
    }
    this.points.push({ x, y, t: now - this.drawingStart });
  }

  trigger(app) {
    this.bump();
    this.index = 0;
    if (this.playing) {
      this.playing = false;
    } else {
      this.playing = true;
      this.startTime = app.clock();
      this.touching = new Set();
      this.headAngle = this.segmentAngle(1);
    }
  }

  stop() {
    this.playing = false;
  }

  segmentAngle(i) {
    const a = this.points[Math.max(i - 1, 0)];
    const b = this.points[Math.min(i, this.points.length - 1)];
    if (!a || !b) return 0;
    return Math.atan2(b.x - a.x, b.y - a.y);
  }

  update(dt, app) {
    super.update(dt);
    if (!this.playing || this.points.length < 2) return;
    const t = app.clock() - this.startTime;
    // step the head through every point that is due, so a slow frame can't
    // skip over a bell
    for (let guard = 0; guard < 2000 && this.points[this.index].t <= t; guard++) {
      if (this.playBellsUnderHead(app) === 'restarted') return;
      this.index++;
      if (this.index >= this.points.length) {
        this.playing = false;
        return;
      }
    }
  }

  // Trigger whatever the head has just moved onto. Reaching its own player
  // restarts the path, so a path that returns home loops forever.
  playBellsUnderHead(app) {
    const p = this.points[this.index];
    const hx = this.x + p.x;
    const hy = this.y + p.y;
    const under = new Set(app.items.filter((b) => Math.hypot(hx - b.x, hy - b.y) < b.baseRadius));
    for (const b of under) {
      if (this.touching.has(b)) continue;
      if (b === this) {
        if (this.index === 0) continue;
        this.index = 0;
        this.startTime = app.clock();
        this.touching = under;
        this.bump();
        return 'restarted';
      }
      b.trigger(app, 'path');
    }
    this.touching = under;
  }

  sync(t, opts) {
    this.view.position.set(this.x, this.y);
    const lit = this.playing || this.lit;
    const key = `${this.points.length}|${opts.zoom}|${lit}`;
    if (key !== this.lineKey) {
      this.lineKey = key;
      const g = this.line.clear();
      if (this.points.length > 1) {
        g.moveTo(this.points[0].x, this.points[0].y);
        for (const p of this.points) g.lineTo(p.x, p.y);
        g.stroke({ width: 2.5 / opts.zoom, color: lit ? PATH_PINK : PATH_PINK_DIM, cap: 'round', join: 'round' });
      }
    }

    const s = this.radius * 2;
    this.sprite.width = this.sprite.height = s;
    // the player's triangle points the way the path sets off
    this.sprite.rotation = Math.PI - this.segmentAngle(1);
    let v = this.playing ? 1 : 150 / 255;
    if (this.selected) v = pulse(t);
    this.sprite.tint = gray(v);
    this.view.alpha = this.dragging ? 0.78 : 1;

    this.head.visible = this.playing && this.index > 0;
    if (this.head.visible) {
      const a = this.points[this.index - 1];
      const b = this.points[this.index];
      const now = opts.clock - this.startTime;
      const f = b.t > a.t ? Math.min(Math.max((now - a.t) / (b.t - a.t), 0), 1) : 1;
      this.head.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      let diff = this.segmentAngle(this.index) - this.headAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.headAngle += diff / 2;
      this.head.rotation = Math.PI - this.headAngle;
      this.head.width = this.head.height = PATH_HEAD_RADIUS * 2;
    }
  }

  toData() {
    return { x: this.x, y: this.y, points: this.points.map((p) => ({ ...p })) };
  }
}

export class DrawingLine {
  kind = 'line';

  constructor(points = []) {
    this.points = points.map((p) => ({ ...p }));
    this.view = new Graphics();
    this.key = '';
  }

  addPoint(x, y) {
    const last = this.points.at(-1);
    if (last && Math.hypot(x - last.x, y - last.y) < 1) return;
    this.points.push({ x, y });
  }

  distanceTo(x, y) {
    let best = Infinity;
    for (const p of this.points) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
    return best;
  }

  sync(zoom) {
    const key = `${this.points.length}|${zoom}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.view.clear();
    if (this.points.length === 0) return;
    if (this.points.length === 1) {
      g.circle(this.points[0].x, this.points[0].y, 1.5 / zoom).fill(0xffffff);
      return;
    }
    g.moveTo(this.points[0].x, this.points[0].y);
    for (const p of this.points) g.lineTo(p.x, p.y);
    g.stroke({ width: 2 / zoom, color: 0xffffff, cap: 'round', join: 'round' });
  }

  destroy() {
    this.view.destroy();
  }

  toData() {
    return this.points.map((p) => ({ ...p }));
  }
}

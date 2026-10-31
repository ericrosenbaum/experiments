// The things on the canvas. Each keeps its document data plus a PixiJS
// display object, positioned in canvas units; the world container applies
// the camera.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { BELL_RADIUS, REC_BELL_RADIUS, PATH_PLAYER_RADIUS, PATH_HEAD_RADIUS, BUMP, THEME } from './config.js';
import { NOTE_FUNCTIONS, NOTE_NAMES, bellColor } from './music.js';
import { MASK_RADIUS, patternColor } from './bell-art.js';

const pulse = (t) => 0.75 + 0.25 * Math.sin(t * 18); // selected things flash
const ease = (current, target, dt) => current + (target - current) * (1 - 0.9 ** (dt * 60));
const gray = (v) => {
  const c = Math.round(v * 255);
  return (c << 16) | (c << 8) | c;
};
const RIPPLE_TIME = 0.45;

class Item {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;
    this.radius = radius;
    this.selected = false;
    this.dragging = false;
    this.view = new Container();
    // a ring that spreads out and fades each time the thing plays
    this.ripple = new Graphics();
    this.ripple.visible = false;
    this.rippleAge = Infinity;
    this.rippleColor = 0xffffff;
    this.view.addChild(this.ripple);
  }
  hit(cx, cy) {
    return Math.hypot(cx - this.x, cy - this.y) < this.radius;
  }
  bump() {
    this.radius = this.baseRadius + BUMP;
    this.rippleAge = 0;
  }
  moveBy(dx, dy) {
    this.x += dx;
    this.y += dy;
  }
  update(dt) {
    this.radius = ease(this.radius, this.baseRadius, dt);
    this.rippleAge += dt;
  }
  // shared per-frame look: position, dragging, selection flash, ripple
  syncCommon(t) {
    this.view.position.set(this.x, this.y);
    this.view.alpha = this.dragging ? 0.72 : 1;
    this.view.tint = this.selected ? gray(pulse(t)) : 0xffffff;
    const f = this.rippleAge / RIPPLE_TIME;
    this.ripple.visible = f < 1;
    if (f < 1) {
      const r = this.baseRadius * (1 + 0.6 * (1 - (1 - f) ** 2));
      this.ripple.clear().circle(0, 0, r).stroke({ width: 4 * (1 - f) + 1, color: this.rippleColor, alpha: 0.7 * (1 - f) });
    }
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
    // two white masks, tinted: the shape, and its band or stripes on top
    this.body = new Sprite();
    this.pattern = new Sprite();
    this.body.anchor.set(0.5);
    this.pattern.anchor.set(0.5);
    this.shape = new Container();
    this.shape.addChild(this.body, this.pattern);
    this.view.addChild(this.shape);
    this.label = null;
    this.setPitch(note, octave);
  }

  setPitch(note, octave) {
    this.note = note;
    this.octave = octave;
    const masks = this.textures.bells[this.instrument][NOTE_FUNCTIONS[note]];
    this.body.texture = masks.body;
    this.pattern.visible = !!masks.pattern;
    if (masks.pattern) this.pattern.texture = masks.pattern;
    const base = bellColor(note, octave);
    this.body.tint = base;
    this.pattern.tint = patternColor(base);
    this.rippleColor = patternColor(base);
    if (this.label) this.label.text = NOTE_NAMES[note];
  }

  /** Called by the app whenever this bell is played, however it was triggered. */
  trigger(app, source) {
    app.playBellNote(this, source);
  }

  sync(t, opts) {
    this.syncCommon(t);
    // masks draw the bell at MASK_RADIUS pixels; scale that to canvas units
    this.shape.scale.set(this.radius / MASK_RADIUS);
    if (opts.showNoteNames && !this.label) {
      this.label = new Text({
        text: NOTE_NAMES[this.note],
        style: {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 24,
          fontWeight: '700',
          fill: 0xffffff,
          stroke: { color: 0x1c1e23, width: 5, join: 'round' },
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
    this.rippleColor = THEME.lit;
    this.body = new Graphics();
    this.score = new Graphics();
    this.playhead = new Graphics();
    this.shape = new Container();
    this.shape.addChild(this.body, this.score, this.playhead);
    this.view.addChild(this.shape);
    this.drawn = '';
    this.elapsed = 0;
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
    const elapsed = (this.elapsed = app.audioNow() - this.start);
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
    this.syncCommon(t);
    this.shape.scale.set(this.radius / REC_BELL_RADIUS);
    const key = `${this.playing}|${this.shown}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.draw();
    }
    // a playhead sweeps across the score while it plays
    const g = this.playhead.clear();
    if (this.playing) {
      const { x0, y0, width, height, duration } = this.layout();
      const x = x0 + Math.min(Math.max(this.elapsed, 0) / duration, 1) * width;
      g.rect(x - 1, y0 - height, 2, height).fill({ color: THEME.litInk, alpha: 0.55 });
    }
  }

  layout() {
    const r = REC_BELL_RADIUS;
    const last = this.notes.at(-1)?.time ?? 0;
    return { x0: -r * 0.75, y0: r / 3, width: r * 1.5, height: (r * 2) / 3, duration: last < 0.5 ? 1 : last };
  }

  // A rounded square holding a little score: time across, pitch up, one
  // diamond per note in the bell's color.
  draw() {
    const r = REC_BELL_RADIUS;
    const lit = this.playing;
    this.body
      .clear()
      .roundRect(-r * 0.94, -r * 0.94, r * 1.88, r * 1.88, r * 0.32)
      .fill(lit ? THEME.lit : THEME.idle);
    const { x0, y0, width, height, duration } = this.layout();
    this.body
      .roundRect(x0 - 8, y0 - height - 6, width + 16, height + 12, 8)
      .fill(lit ? 0xd5d9e1 : 0x474b55);
    const g = this.score.clear();
    const noteHeight = height / 36;
    for (let i = 0; i < this.shown; i++) {
      const n = this.notes[i];
      const x = x0 + (n.time / duration) * width;
      const y = y0 - (n.note + 1 + 12 * n.octave) * noteHeight;
      const s = 4.6;
      g.poly([x, y - s, x + s, y, x, y + s, x - s, y]).fill(bellColor(n.note, n.octave));
    }
  }

  toData() {
    return { x: this.x, y: this.y, notes: this.notes.map((n) => ({ ...n })) };
  }
}


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
    this.rippleColor = THEME.path;
    // the player: a disc with an arrow pointing the way the path sets off
    this.puck = new Graphics();
    this.arrow = new Graphics();
    this.player = new Container();
    this.player.addChild(this.puck, this.arrow);
    // the head that travels the path
    const h = PATH_HEAD_RADIUS;
    this.head = new Graphics()
      .poly([0, -h * 0.9, h * 0.75, h * 0.65, 0, h * 0.35, -h * 0.75, h * 0.65])
      .fill(THEME.lit)
      .stroke({ width: 3, color: THEME.path, join: 'round' });
    this.head.visible = false;
    this.view.addChild(this.line, this.player, this.head);
    this.drawnLit = null;
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
    const lit = this.playing || this.lit;
    const key = `${this.points.length}|${opts.zoom}|${lit}`;
    if (key !== this.lineKey) {
      this.lineKey = key;
      const g = this.line.clear();
      if (this.points.length > 1) {
        g.moveTo(this.points[0].x, this.points[0].y);
        for (const p of this.points) g.lineTo(p.x, p.y);
        g.stroke({ width: 3 / opts.zoom, color: lit ? THEME.path : THEME.pathIdle, cap: 'round', join: 'round' });
      }
    }

    this.syncCommon(t);
    this.player.scale.set(this.radius / PATH_PLAYER_RADIUS);
    // arrow drawn pointing up; rotate it the way the path sets off
    this.arrow.rotation = Math.PI - this.segmentAngle(1);
    if (this.drawnLit !== this.playing) {
      this.drawnLit = this.playing;
      const r = PATH_PLAYER_RADIUS;
      this.puck.clear().circle(0, 0, r * 0.96).fill(this.playing ? THEME.lit : THEME.idle);
      this.arrow
        .clear()
        .poly([0, -r * 0.5, r * 0.42, r * 0.36, 0, r * 0.16, -r * 0.42, r * 0.36])
        .fill(this.playing ? THEME.path : THEME.idleInk)
        .stroke({ width: 4, color: this.playing ? THEME.path : THEME.idleInk, join: 'round' });
    }

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
      g.circle(this.points[0].x, this.points[0].y, 1.5 / zoom).fill(THEME.ink);
      return;
    }
    g.moveTo(this.points[0].x, this.points[0].y);
    for (const p of this.points) g.lineTo(p.x, p.y);
    g.stroke({ width: 2.5 / zoom, color: THEME.ink, cap: 'round', join: 'round' });
  }

  destroy() {
    this.view.destroy();
  }

  toData() {
    return this.points.map((p) => ({ ...p }));
  }
}

// The canvas: camera, input, modes, recording and selection. The HTML
// controls around it live in hud.js and talk to this through its methods and
// events.

import { Application, Assets, Container, Graphics, Rectangle, Texture, TilingSprite } from 'pixi.js';
import * as audio from './audio.js';
import {
  ASSETS,
  BACKGROUND,
  BELL_RADIUS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  GRID_COLOR,
  GRID_SPACING,
  MAX_ZOOM,
  MIN_ZOOM,
  SCREEN_START_X,
  SCREEN_START_Y,
} from './config.js';
import { DEFAULT_INSTRUMENT, INSTRUMENTS, shiftPitch } from './music.js';
import { Bell, DrawingLine, PathPlayer, RecorderBell } from './world.js';
import { emptyMorph } from './morph-format.js';

export class MelodyMorph {
  constructor(el) {
    this.el = el;
    this.items = []; // bells, recorder bells and path players, bottom to top
    this.lines = [];
    this.camera = { x: SCREEN_START_X, y: SCREEN_START_Y, zoom: 1 };
    this.mode = 'none';
    this.instrument = DEFAULT_INSTRUMENT;
    this.octave = 1;
    this.showAllNotes = false;
    this.showNoteNames = false;
    this.recording = false;
    this.recNotes = [];
    this.recFirst = null;
    this.selection = null; // { x0, y0, x1, y1 } in canvas units
    this.pointers = new Map();
    this.pinch = null;
    this.listeners = {};
    this.dirty = false; // unsaved changes
    // set by the HUD: is a screen point over the palette (where dropped bells go away)?
    this.isOverTrash = () => false;
    // set by the HUD: where new recorder bells appear, in screen pixels
    this.recordAnchor = () => ({ x: this.width - 140, y: 180 });
  }

  on(name, fn) {
    (this.listeners[name] ??= []).push(fn);
  }
  emit(name, ...args) {
    for (const fn of this.listeners[name] ?? []) fn(...args);
  }

  async init() {
    const pixi = (this.pixi = new Application());
    await pixi.init({
      resizeTo: this.el,
      background: BACKGROUND,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    this.el.appendChild(pixi.canvas);

    const [sheet, recBell, pathPlayer, pathHead] = await Promise.all(
      ['bell_spritesheet', 'rec_bell', 'path_player', 'path_head'].map((n) =>
        Assets.load(`${ASSETS}/other-images/${n}.png`),
      ),
    );
    // sprite sheet: a row per instrument, a column per note function
    const cell = (col, row) => new Texture({ source: sheet.source, frame: new Rectangle(col * 128, row * 128, 128, 128) });
    this.textures = {
      bells: INSTRUMENTS.map((_, row) => [0, 1, 2].map((col) => cell(col, row))),
      recBell,
      pathPlayer,
      pathHead,
    };

    this.grid = new TilingSprite({ texture: makeGridTexture(), width: 1, height: 1 });
    this.world = new Container();
    this.linesLayer = new Container();
    this.selectionGfx = new Graphics();
    this.itemsLayer = new Container();
    this.world.addChild(this.linesLayer, this.selectionGfx, this.itemsLayer);
    pixi.stage.addChild(this.grid, this.world);

    this.applyView(emptyMorph().view);
    pixi.ticker.add((ticker) => this.frame(Math.min(ticker.deltaMS / 1000, 0.1)));
    this.bindInput();
  }

  get width() {
    return this.pixi.screen.width;
  }
  get height() {
    return this.pixi.screen.height;
  }

  clock() {
    return performance.now() / 1000;
  }
  audioNow() {
    return audio.now();
  }

  // ---------- camera ----------

  toCanvas(sx, sy) {
    return { x: this.camera.x + sx / this.camera.zoom, y: this.camera.y + sy / this.camera.zoom };
  }
  toScreen(cx, cy) {
    return { x: (cx - this.camera.x) * this.camera.zoom, y: (cy - this.camera.y) * this.camera.zoom };
  }

  // Documents store their framing as seen on the iPad's 1024x768 screen;
  // scale it so the same part of the canvas fills this window.
  fitScale() {
    return Math.max(Math.min(this.width / DESIGN_WIDTH, this.height / DESIGN_HEIGHT), 0.5);
  }
  zoomLimits() {
    const s = this.fitScale();
    return [MIN_ZOOM * s, MAX_ZOOM * Math.max(s, 1)];
  }
  applyView(v) {
    const zoom = v.zoom * this.fitScale();
    const cx = v.x + DESIGN_WIDTH / 2 / v.zoom;
    const cy = v.y + DESIGN_HEIGHT / 2 / v.zoom;
    this.camera = { zoom, x: cx - this.width / 2 / zoom, y: cy - this.height / 2 / zoom };
  }
  currentView() {
    const { x, y, zoom } = this.camera;
    const vz = zoom / this.fitScale();
    const cx = x + this.width / 2 / zoom;
    const cy = y + this.height / 2 / zoom;
    return { zoom: vz, x: cx - DESIGN_WIDTH / 2 / vz, y: cy - DESIGN_HEIGHT / 2 / vz };
  }
  zoomAt(sx, sy, zoom) {
    const [lo, hi] = this.zoomLimits();
    zoom = Math.min(Math.max(zoom, lo), hi);
    const c = this.toCanvas(sx, sy);
    this.camera = { zoom, x: c.x - sx / zoom, y: c.y - sy / zoom };
  }
  zoomBy(factor) {
    this.zoomAt(this.width / 2, this.height / 2, this.camera.zoom * factor);
  }

  // ---------- frame ----------

  frame(dt) {
    const t = this.clock();
    for (const item of this.items) item.update(dt, this);
    const { x, y, zoom } = this.camera;
    const opts = { zoom, clock: t, showNoteNames: this.showNoteNames };
    for (const item of this.items) item.sync(t, opts);
    for (const line of this.lines) line.sync(zoom);

    this.world.scale.set(zoom);
    this.world.position.set(-x * zoom, -y * zoom);
    this.grid.width = this.width;
    this.grid.height = this.height;
    this.grid.tileScale.set(zoom);
    this.grid.tilePosition.set(-x * zoom, -y * zoom);

    const g = this.selectionGfx.clear();
    const r = this.selectionRect();
    if (r && r.w * r.h > 0) {
      g.rect(r.x, r.y, r.w, r.h)
        .fill({ color: 0xffff00, alpha: 0.1 })
        .stroke({ width: 1.5 / zoom, color: 0xffff00, alpha: 0.6 });
    }
    this.emit('frame');
  }

  // ---------- things on the canvas ----------

  addItem(item) {
    this.items.push(item);
    this.itemsLayer.addChild(item.view);
    this.dirty = true;
    return item;
  }
  removeItem(item) {
    const i = this.items.indexOf(item);
    if (i < 0) return;
    this.items.splice(i, 1);
    item.destroy();
    for (const p of this.pointers.values()) if (p.item === item) p.item = null;
    this.dirty = true;
  }
  bringToFront(item) {
    const i = this.items.indexOf(item);
    if (i < 0 || i === this.items.length - 1) return;
    this.items.splice(i, 1);
    this.items.push(item);
    this.itemsLayer.addChild(item.view);
  }
  itemAt(cx, cy) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].hit(cx, cy)) return this.items[i];
    }
    return null;
  }
  makeBell(data) {
    return new Bell(this.textures, data);
  }

  // ---------- sound ----------

  /** A bell sounds; `source` is 'user', 'palette' or 'path'. */
  playBellNote(bell, source) {
    audio.playNote(bell.instrument, bell.note, bell.octave);
    bell.bump();
    // the original didn't record the note made by pulling a bell out of the palette
    if (source !== 'palette') this.record(bell, audio.now());
  }
  playRecordedNote(n, when) {
    audio.playNote(n.instrument, n.note, n.octave, n.velocity, when);
    this.record(n, when);
  }

  // ---------- recording ----------

  toggleRecording() {
    if (!this.recording) {
      this.recording = true;
      this.recNotes = [];
      this.recFirst = null;
    } else {
      this.recording = false;
      if (this.recNotes.length > 0) {
        const a = this.recordAnchor();
        const c = this.toCanvas(a.x, a.y);
        const jitter = () => (Math.random() * 2 - 1) * 25;
        this.addItem(new RecorderBell(this.textures, { x: c.x + jitter(), y: c.y + jitter(), notes: this.recNotes }));
      }
      this.recNotes = [];
    }
    this.emit('recording', this.recording);
  }
  record(n, when) {
    if (!this.recording) return;
    this.recFirst ??= when;
    this.recNotes.push({
      time: Math.max(when - this.recFirst, 0),
      note: n.note,
      octave: n.octave,
      instrument: n.instrument,
      velocity: n.velocity ?? 1,
    });
  }

  stopAll() {
    for (const item of this.items) item.stop?.();
  }

  // ---------- modes ----------

  setMode(mode) {
    if (mode === this.mode) return;
    if (this.mode === 'select') this.clearSelection();
    this.mode = mode;
    this.el.className = `mode-${mode}`;
    this.emit('mode', mode);
  }

  // ---------- selection ----------

  selectionRect() {
    const s = this.selection;
    if (!s) return null;
    return { x: Math.min(s.x0, s.x1), y: Math.min(s.y0, s.y1), w: Math.abs(s.x1 - s.x0), h: Math.abs(s.y1 - s.y0) };
  }
  inSelection(cx, cy) {
    const r = this.selectionRect();
    return !!r && cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
  }
  selectedItems() {
    return this.items.filter((i) => i.selected);
  }
  clearSelection() {
    this.selection = null;
    for (const i of this.items) i.selected = false;
  }
  updateSelection() {
    for (const i of this.items) i.selected = this.inSelection(i.x, i.y);
  }
  duplicateSelection() {
    const OFFSET = 20;
    const copies = [];
    for (const item of this.selectedItems()) {
      item.selected = false;
      const data = { ...item.toData(), x: item.x + OFFSET, y: item.y + OFFSET };
      const copy =
        item.kind === 'bell'
          ? this.makeBell(data)
          : item.kind === 'rec'
            ? new RecorderBell(this.textures, data)
            : new PathPlayer(this.textures, data);
      copy.selected = true;
      copies.push(copy);
    }
    copies.forEach((c) => this.addItem(c));
    if (this.selection) {
      for (const k of ['x0', 'x1', 'y0', 'y1']) this.selection[k] += OFFSET;
    }
  }
  shiftSelectionPitch(steps) {
    for (const item of this.selectedItems()) {
      if (item.kind !== 'bell') continue;
      const p = shiftPitch(item.note, item.octave, steps, !this.showAllNotes);
      item.setPitch(p.note, p.octave);
    }
    this.dirty = true;
  }
  deleteSelection() {
    for (const item of this.selectedItems()) this.removeItem(item);
    this.selection = null;
  }

  // ---------- erasing ----------

  eraseAt(cx, cy) {
    const reach = Math.max(10, 10 / this.camera.zoom);
    let closest = null;
    let best = reach;
    for (const line of this.lines) {
      const d = line.distanceTo(cx, cy);
      if (d < best) {
        best = d;
        closest = line;
      }
    }
    if (closest) {
      this.lines.splice(this.lines.indexOf(closest), 1);
      closest.destroy();
      this.dirty = true;
    }
    for (const item of [...this.items]) if (item.hit(cx, cy)) this.removeItem(item);
  }

  // ---------- palette ----------

  /** Pull a new bell out of the palette under a pointer that's already down. */
  spawnFromPalette(note, e) {
    audio.unlock();
    this.emit('canvas-action');
    const bell = this.addItem(
      this.makeBell({ ...this.toCanvas(e.clientX, e.clientY), note, octave: this.octave, instrument: this.instrument }),
    );
    // on touch, the bell sits below the finger so you can see it
    const offsetY = e.pointerType === 'touch' ? BELL_RADIUS * this.camera.zoom : 0;
    bell.y += offsetY / this.camera.zoom;
    bell.dragging = true;
    if (this.mode !== 'mute') bell.trigger(this, 'palette');
    this.pointers.set(e.pointerId, {
      role: 'bell',
      item: bell,
      dragging: true,
      offset: { x: 0, y: offsetY },
      sx: e.clientX,
      sy: e.clientY,
    });
  }

  // ---------- input ----------

  bindInput() {
    const canvas = this.pixi.canvas;
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  onDown(e) {
    e.preventDefault();
    audio.unlock();
    this.emit('pointer-down');
    try {
      this.pixi.canvas.setPointerCapture(e.pointerId);
    } catch {}
    const sx = e.clientX;
    const sy = e.clientY;
    const c = this.toCanvas(sx, sy);
    const p = { role: 'pan', sx, sy, under: new Set() };
    this.pointers.set(e.pointerId, p);

    // right or middle mouse button always pans
    if (e.pointerType === 'mouse' && e.button !== 0) {
      this.startPan(p);
      return;
    }

    switch (this.mode) {
      case 'draw': {
        this.emit('canvas-action');
        const line = new DrawingLine([c]);
        this.lines.push(line);
        this.linesLayer.addChild(line.view);
        Object.assign(p, { role: 'draw', line });
        this.dirty = true;
        return;
      }
      case 'erase':
        this.emit('canvas-action');
        p.role = 'erase';
        this.eraseAt(c.x, c.y);
        return;
      case 'select':
        this.emit('canvas-action');
        if (this.selection && this.inSelection(c.x, c.y)) {
          Object.assign(p, { role: 'sel-drag', last: c });
        } else {
          this.clearSelection();
          this.selection = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
          p.role = 'sel-rect';
        }
        return;
      case 'path': {
        this.emit('canvas-action');
        const player = this.addItem(new PathPlayer(this.textures, c, this.clock()));
        Object.assign(p, { role: 'path', item: player });
        p.under = new Set([player]);
        return;
      }
      case 'slide':
        this.emit('canvas-action');
        p.role = 'slide';
        this.slideOver(p, c);
        return;
    }

    // play mode (or mute): tap a bell to play it, or grab empty canvas to pan
    const item = this.itemAt(c.x, c.y);
    if (item) {
      if (this.mode === 'mute') this.emit('canvas-action');
      else item.trigger(this, 'user');
      this.bringToFront(item);
      Object.assign(p, { role: 'bell', item, dragging: false });
      return;
    }
    this.startPan(p);
  }

  startPan(p) {
    p.role = 'pan';
    const pans = [...this.pointers.entries()].filter(([, q]) => q.role === 'pan');
    if (pans.length === 2) {
      const [a, b] = pans.map(([, q]) => q);
      const mid = { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 };
      this.pinch = {
        ids: pans.map(([id]) => id),
        dist: Math.max(Math.hypot(a.sx - b.sx, a.sy - b.sy), 1),
        zoom: this.camera.zoom,
        anchor: this.toCanvas(mid.x, mid.y),
      };
    }
    this.el.classList.add('panning');
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const psx = p.sx;
    const psy = p.sy;
    p.sx = e.clientX;
    p.sy = e.clientY;
    const c = this.toCanvas(p.sx, p.sy);

    switch (p.role) {
      case 'draw':
        p.line.addPoint(c.x, c.y);
        return;
      case 'erase':
        this.eraseAt(c.x, c.y);
        return;
      case 'sel-rect':
        this.selection.x1 = c.x;
        this.selection.y1 = c.y;
        this.updateSelection();
        return;
      case 'sel-drag': {
        const dx = c.x - p.last.x;
        const dy = c.y - p.last.y;
        for (const item of this.selectedItems()) item.moveBy(dx, dy);
        for (const k of ['x0', 'x1']) this.selection[k] += dx;
        for (const k of ['y0', 'y1']) this.selection[k] += dy;
        p.last = c;
        this.dirty = true;
        return;
      }
      case 'path':
        if (p.item) p.item.addPoint(c.x, c.y, this.clock());
        this.slideOver(p, c);
        return;
      case 'slide':
        this.slideOver(p, c);
        return;
      case 'bell': {
        const item = p.item;
        if (!item) return;
        if (!p.dragging) {
          // a bell only starts moving once the finger slides off its edge,
          // so playing it never nudges it
          const s = this.toScreen(item.x, item.y);
          if (Math.hypot(p.sx - s.x, p.sy - s.y) > item.radius * this.camera.zoom) {
            p.dragging = true;
            item.dragging = true;
            p.offset = { x: s.x - p.sx, y: s.y - p.sy };
          }
        }
        if (p.dragging) {
          const to = this.toCanvas(p.sx + p.offset.x, p.sy + p.offset.y);
          item.x = to.x;
          item.y = to.y;
          this.dirty = true;
          this.emit('trash-hover', this.isOverTrash(p.sx, p.sy));
        }
        return;
      }
      case 'pan':
        if (this.pinch && this.pinch.ids.includes(e.pointerId)) {
          const [a, b] = this.pinch.ids.map((id) => this.pointers.get(id));
          const mid = { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 };
          const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
          const [lo, hi] = this.zoomLimits();
          const zoom = Math.min(Math.max((this.pinch.zoom * dist) / this.pinch.dist, lo), hi);
          this.camera = { zoom, x: this.pinch.anchor.x - mid.x / zoom, y: this.pinch.anchor.y - mid.y / zoom };
        } else {
          this.camera.x -= (p.sx - psx) / this.camera.zoom;
          this.camera.y -= (p.sy - psy) / this.camera.zoom;
        }
        return;
    }
  }

  onUp(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);

    switch (p.role) {
      case 'bell':
        if (p.item) {
          p.item.dragging = false;
          if (p.dragging && !cancelled && this.isOverTrash(e.clientX, e.clientY)) this.removeItem(p.item);
        }
        this.emit('trash-hover', false);
        break;
      case 'path':
        // a path needs somewhere to go
        if (p.item && p.item.points.length < 2) this.removeItem(p.item);
        break;
      case 'sel-rect': {
        const r = this.selectionRect();
        if (!r || r.w * r.h < 4) this.clearSelection();
        break;
      }
      case 'pan':
        if (this.pinch?.ids.includes(e.pointerId)) this.pinch = null;
        break;
    }
    if (![...this.pointers.values()].some((q) => q.role === 'pan')) this.el.classList.remove('panning');
  }

  // Strumming: play each thing as the pointer slides onto it.
  slideOver(p, c) {
    const under = new Set(this.items.filter((i) => i.hit(c.x, c.y) && i !== p.item));
    for (const item of under) if (!p.under.has(item)) item.trigger(this, 'user');
    p.under = under;
  }

  onWheel(e) {
    e.preventDefault();
    // pinch on a trackpad arrives as ctrl+wheel with small deltas
    const k = e.ctrlKey ? 0.01 : 0.0015;
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomAt(e.clientX, e.clientY, this.camera.zoom * Math.exp(-delta * k));
  }

  // ---------- documents ----------

  clear() {
    this.stopAll();
    for (const item of this.items) item.destroy();
    for (const line of this.lines) line.destroy();
    this.items = [];
    this.lines = [];
    this.selection = null;
    this.pointers.clear();
    this.pinch = null;
    this.applyView(emptyMorph().view);
    this.dirty = false;
  }

  loadMorph(m) {
    this.clear();
    for (const b of m.bells) this.addItem(this.makeBell(b));
    for (const b of m.recBells) this.addItem(new RecorderBell(this.textures, b));
    for (const p of m.paths) this.addItem(new PathPlayer(this.textures, p));
    for (const pts of m.lines) {
      const line = new DrawingLine(pts);
      this.lines.push(line);
      this.linesLayer.addChild(line.view);
    }
    this.applyView(m.view);
    this.dirty = false;
  }

  toMorph(meta = {}) {
    const of = (kind) => this.items.filter((i) => i.kind === kind).map((i) => i.toData());
    return {
      title: meta.title ?? '',
      author: meta.author ?? '',
      description: meta.description ?? '',
      view: this.currentView(),
      bells: of('bell'),
      recBells: of('rec'),
      paths: of('path').filter((p) => p.points.length > 1),
      lines: this.lines.map((l) => l.toData()),
    };
  }

  isEmpty() {
    return this.items.length === 0 && this.lines.length === 0;
  }

  /** A 400x300 JPEG of the canvas without the grid, like the iPad's thumbnails. */
  thumbnail() {
    const paths = this.items.filter((i) => i.kind === 'path');
    const selected = this.selectedItems();
    this.grid.visible = false;
    this.selectionGfx.visible = false;
    selected.forEach((i) => (i.selected = false));
    paths.forEach((p) => (p.lit = true));
    this.frame(0);
    const src = this.pixi.renderer.extract.canvas({
      target: this.pixi.stage,
      frame: new Rectangle(0, 0, this.width, this.height),
    });
    this.grid.visible = true;
    this.selectionGfx.visible = true;
    selected.forEach((i) => (i.selected = true));
    paths.forEach((p) => (p.lit = false));

    const out = document.createElement('canvas');
    out.width = 400;
    out.height = 300;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#323232';
    ctx.fillRect(0, 0, 400, 300);
    // crop the middle 4:3 of the view
    const W = src.width;
    const H = src.height;
    const cw = Math.min(W, (H * 4) / 3);
    const ch = (cw * 3) / 4;
    ctx.drawImage(src, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, 400, 300);
    return out.toDataURL('image/jpeg', 0.82);
  }
}

// Two-by-two checkerboard of the original's 240-unit grid squares.
function makeGridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = GRID_SPACING * 2;
  const ctx = c.getContext('2d');
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex(BACKGROUND);
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = hex(GRID_COLOR);
  ctx.fillRect(GRID_SPACING, 0, GRID_SPACING, GRID_SPACING);
  ctx.fillRect(0, GRID_SPACING, GRID_SPACING, GRID_SPACING);
  return Texture.from(c);
}

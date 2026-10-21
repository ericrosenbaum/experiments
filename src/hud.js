// The controls around the canvas: instrument tabs, the note palette, tool
// buttons, record/stop, and keyboard shortcuts.

import { ASSETS, MODES } from './config.js';
import { INSTRUMENTS, NOTE_FUNCTIONS, NOTE_NAMES, bellColor, cssColor, isDiatonic } from './music.js';
import * as audio from './audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// How long a tool button must be held to count as "holding" rather than a tap.
const HOLD_MS = 350;

const KEYS = { d: 'draw', e: 'erase', s: 'select', p: 'path', m: 'mute', t: 'slide' };

export function bellIcon(instrument, fn, tint = '#ffffff') {
  const el = document.createElement('div');
  el.className = 'bell-icon';
  el.style.setProperty('--row', instrument);
  el.style.setProperty('--col', fn);
  el.style.setProperty('--tint', tint);
  return el;
}

export class Hud {
  constructor(app, prefs) {
    this.app = app;
    this.prefs = prefs;
    this.root = $('#hud');
    // absolute, since a url() inside a custom property resolves against the
    // stylesheet that uses it
    const sheet = new URL(`${ASSETS}/other-images/bell_spritesheet.png`, location.href).href;
    document.documentElement.style.setProperty('--sheet', `url("${sheet}")`);

    this.buildTabs();
    this.buildPalette();
    this.bindTools();
    this.bindButtons();
    this.bindKeys();

    app.isOverTrash = (x, y) => {
      if (this.root.classList.contains('ui-hidden')) return false;
      const r = $('#palette').getBoundingClientRect();
      const tabs = $('#instrument-tabs').getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= Math.min(tabs.top, r.top) - 4 && y <= r.bottom + 4;
    };
    app.recordAnchor = () => {
      const r = $('#record').getBoundingClientRect();
      return { x: r.left - 110, y: r.bottom + 120 };
    };
    app.on('trash-hover', (on) => $('#palette').classList.toggle('trash', on));
    app.on('recording', (on) => {
      $('#record').setAttribute('aria-pressed', on);
      $('#record img').src = `${ASSETS}/gui/${on ? 'rec_bell_maker_active' : 'rec_bell_maker'}.png`;
    });
    app.on('mode', () => this.syncTools());
    app.on('canvas-action', () => {
      if (this.held) this.held.used = true;
    });
    app.on('pointer-down', () => this.closeGear());
    app.on('frame', () => this.placeSelectionTools());

    this.setInstrument(app.instrument);
    this.setOctave(1);
    this.applyPrefs();
  }

  // ---------- instruments ----------

  buildTabs() {
    const tabs = $('#instrument-tabs');
    INSTRUMENTS.forEach((inst, i) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.title = `${inst.name} (${i + 1})`;
      b.append(bellIcon(i, 0));
      const name = document.createElement('span');
      name.className = 'tab-name';
      name.textContent = inst.name;
      b.append(name);
      b.addEventListener('click', () => this.setInstrument(i));
      tabs.append(b);
    });
  }

  setInstrument(i) {
    this.app.instrument = i;
    $$('#instrument-tabs .tab').forEach((t, j) => t.setAttribute('aria-selected', i === j));
    this.renderPaletteBells();
  }

  // ---------- palette ----------

  buildPalette() {
    const strip = $('.palette-strip');
    for (let octave = 0; octave < 3; octave++) {
      const group = document.createElement('div');
      group.className = 'palette-octave';
      for (let note = 0; note < 13; note++) {
        const el = document.createElement('div');
        el.className = 'pnote' + (isDiatonic(note) ? '' : ' accidental');
        el.dataset.note = note;
        el.dataset.octave = octave;
        el.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          if (+el.dataset.octave !== this.app.octave) return;
          this.app.spawnFromPalette(note, e);
        });
        group.append(el);
      }
      strip.append(group);
    }
    $('#octave-down').addEventListener('click', () => this.setOctave(this.app.octave - 1));
    $('#octave-up').addEventListener('click', () => this.setOctave(this.app.octave + 1));
  }

  renderPaletteBells() {
    for (const el of $$('.pnote')) {
      const note = +el.dataset.note;
      const octave = +el.dataset.octave;
      el.replaceChildren(bellIcon(this.app.instrument, NOTE_FUNCTIONS[note], cssColor(bellColor(note, octave))));
      if (this.app.showNoteNames) {
        const label = document.createElement('span');
        label.className = 'note-label';
        label.textContent = NOTE_NAMES[note];
        el.append(label);
      }
      el.hidden = !this.app.showAllNotes && !isDiatonic(note);
      el.title = `${NOTE_NAMES[note]} — drag out to place`;
    }
    $$('.palette-octave').forEach((g) => g.classList.toggle('compact', !this.app.showAllNotes));
  }

  setOctave(o) {
    o = Math.min(Math.max(o, 0), 2);
    this.app.octave = o;
    $('.palette-strip').style.transform = `translateX(${(-o * 100) / 3}%)`;
    $('#octave-down').disabled = o === 0;
    $('#octave-up').disabled = o === 2;
  }

  // ---------- tools (quasi-modes) ----------
  //
  // On the iPad you held a tool button with one finger and used the tool with
  // another. That still works on touch screens; a quick tap latches the tool
  // on instead, which is what you want with a mouse. Keys work the same way.

  bindTools() {
    for (const btn of $$('#tools [data-mode]')) {
      const mode = btn.dataset.mode;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.unlock();
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {}
        this.press(mode, `pointer${e.pointerId}`);
        btn.classList.add('held');
      });
      const release = (e) => {
        btn.classList.remove('held');
        this.release(`pointer${e.pointerId}`);
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('click', (e) => {
        // keyboard activation (Enter/Space) arrives as a click with no pointer
        if (e.detail === 0) this.app.setMode(this.app.mode === mode ? 'none' : mode);
      });
    }
  }

  press(mode, by) {
    if (this.held) return;
    this.held = { mode, by, wasActive: this.app.mode === mode, at: performance.now(), used: false };
    this.app.setMode(mode);
    this.syncTools();
  }

  release(by) {
    const h = this.held;
    if (!h || h.by !== by) return;
    this.held = null;
    const tap = !h.used && performance.now() - h.at < HOLD_MS;
    if (!tap || h.wasActive) this.app.setMode('none');
    this.syncTools();
  }

  syncTools() {
    for (const btn of $$('#tools [data-mode]')) {
      const on = btn.dataset.mode === this.app.mode;
      btn.classList.toggle('active', on);
      btn.classList.toggle('quasi', on && !!this.held);
      btn.setAttribute('aria-pressed', on);
    }
  }

  // ---------- other buttons ----------

  bindButtons() {
    $('#record').addEventListener('click', () => {
      audio.unlock();
      this.app.toggleRecording();
    });
    $('#stop-all').addEventListener('click', () => this.app.stopAll());
    $('#hide-ui').addEventListener('click', () => this.toggleChrome());

    $('#gear-btn').addEventListener('click', () => {
      const menu = $('#gear-menu');
      menu.hidden = !menu.hidden;
      $('#gear-btn').setAttribute('aria-expanded', !menu.hidden);
    });
    $('#opt-all-notes').addEventListener('change', (e) => {
      this.prefs.set('showAllNotes', e.target.checked);
      this.applyPrefs();
    });
    $('#opt-note-names').addEventListener('change', (e) => {
      this.prefs.set('showNoteNames', e.target.checked);
      this.applyPrefs();
    });

    for (const b of $$('#selection-tools [data-sel]')) {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => {
        const a = b.dataset.sel;
        if (a === 'duplicate') this.app.duplicateSelection();
        if (a === 'pitch-up') this.app.shiftSelectionPitch(1);
        if (a === 'pitch-down') this.app.shiftSelectionPitch(-1);
        if (a === 'delete') this.app.deleteSelection();
      });
    }
  }

  closeGear() {
    $('#gear-menu').hidden = true;
    $('#gear-btn').setAttribute('aria-expanded', false);
  }

  onGearAction(fn) {
    for (const b of $$('#gear-menu [data-action]')) {
      b.addEventListener('click', () => {
        this.closeGear();
        fn(b.dataset.action);
      });
    }
  }

  applyPrefs() {
    this.app.showAllNotes = !!this.prefs.get('showAllNotes');
    this.app.showNoteNames = !!this.prefs.get('showNoteNames');
    $('#opt-all-notes').checked = this.app.showAllNotes;
    $('#opt-note-names').checked = this.app.showNoteNames;
    this.renderPaletteBells();
  }

  // "Full screen" in the original hid the controls to make room. Strum stays,
  // since you still need it to play.
  toggleChrome() {
    const hidden = this.root.classList.toggle('ui-hidden');
    $('#hide-ui').setAttribute('aria-pressed', hidden);
    if (hidden && MODES.includes(this.app.mode) && this.app.mode !== 'slide') this.app.setMode('none');
    const fs = document.fullscreenEnabled;
    if (fs && hidden && !document.fullscreenElement && matchMedia('(pointer: coarse)').matches) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  placeSelectionTools() {
    const el = $('#selection-tools');
    const r = this.app.mode === 'select' ? this.app.selectionRect() : null;
    const show = !!r && r.w * r.h > 0 && this.app.selectedItems().length > 0 && !this.app.pointers.size;
    if (el.hidden === show) el.hidden = !show;
    if (!show) return;
    const s = this.app.toScreen(r.x, r.y);
    const x = Math.min(Math.max(s.x, 8), window.innerWidth - el.offsetWidth - 8);
    const y = Math.max(s.y, el.offsetHeight + 8);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  // ---------- keyboard ----------

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (this.modalOpen?.() || e.target.closest?.('input, textarea')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (KEYS[k]) {
        if (!e.repeat) this.press(KEYS[k], `key${k}`);
        e.preventDefault();
        return;
      }
      if (/^[1-5]$/.test(k)) this.setInstrument(+k - 1);
      else if (k === 'arrowleft') this.setOctave(this.app.octave - 1);
      else if (k === 'arrowright') this.setOctave(this.app.octave + 1);
      else if (k === 'r' && !e.repeat) {
        audio.unlock();
        this.app.toggleRecording();
      } else if (k === 'escape') this.app.stopAll();
      else if (k === 'h') this.toggleChrome();
      else if (k === '=' || k === '+') this.app.zoomBy(1.2);
      else if (k === '-' || k === '_') this.app.zoomBy(1 / 1.2);
      else if ((k === 'delete' || k === 'backspace') && this.app.mode === 'select') this.app.deleteSelection();
      else return;
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (KEYS[k]) this.release(`key${k}`);
    });
    window.addEventListener('blur', () => this.held && this.release(this.held.by));
  }

  toast(msg, ms = 2600) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
}

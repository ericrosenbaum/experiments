// A behavior's blocks in its card: a Blockly workspace sized to fit its
// scripts (the inspector scrolls, not the workspace). Editing the blocks
// writes the program again (src/blocks/blockly.js) and hands it to onEdit;
// clicking a script runs it; the blocks running right now glow.
import { Blockly, theme, toCode } from '../blocks/blockly.js';
import { codeToBlocks } from '../blocks/fromcode.js';

export const SCALE = 0.675; // Scratch's size for small screens
const PAD = 8; // px around the scripts
const ROOM = 36; // px of empty space below them, to drop more blocks into

export function injectOptions(readOnly) {
  return {
    renderer: 'zelos', theme, readOnly, sounds: false, media: 'blockly/', // a copy of Blockly's media (the page's CSP keeps it to this site) trashcan: false, comments: false, disable: false, collapse: false,
    zoom: { startScale: SCALE, controls: false, wheel: false, pinch: false },
    move: { scrollbars: false, drag: false, wheel: false },
  };
}

// Is Blockly in the middle of something (a drag, a menu or a text box open)?
export function blocklyBusy(ws) {
  return !!(ws?.isDragging?.() || Blockly.WidgetDiv.isVisible() || Blockly.DropDownDiv.isVisible());
}

export class BlockView {
  // onEdit(code): the blocks were changed; onRun(at): a script was clicked
  constructor({ code, readOnly = false, onEdit, onRun }) {
    Object.assign(this, { code, readOnly, onEdit, onRun });
    this.el = document.createElement('div');
    this.el.className = 'bk-view';
    this.host = document.createElement('div');
    this.host.className = 'bk-host';
    this.el.appendChild(this.host);
    this.ws = null;
    this.at = {};
    this.lit = new Set();
    this.error = null;
  }

  // Blockly measures its container, so it starts once the card is on the page.
  mount(slot) {
    if (this.el.parentElement !== slot) slot.replaceChildren(this.el);
    if (!this.ws) this._start();
    else this.fit();
  }

  _start() {
    const r = codeToBlocks(this.code);
    if (r.error) {
      this.error = r.error;
      this.el.innerHTML = `<div class="bk-error">These blocks don't fit together yet: ${r.error.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>`;
      return;
    }
    this.ws = Blockly.inject(this.host, injectOptions(this.readOnly));
    this.ws.bbView = this;
    // Blockly pushes blocks back inside a workspace that can't scroll; this one
    // grows to fit them instead (fit), so let them be.
    this.ws.getMetricsManager().hasFixedEdges = () => false;
    // Blockly opens its menus and text boxes inside the workspace, which the
    // card would clip; style.css makes them fixed, offset by where the card is.
    this.host.addEventListener('pointerdown', () => {
      const r = this.host.getBoundingClientRect();
      this.host.style.setProperty('--bb-x', `${r.left}px`);
      this.host.style.setProperty('--bb-y', `${r.top}px`);
    }, true);
    this._load(r);
    this.ws.addChangeListener((e) => this._changed(e));
  }

  _load(r) {
    Blockly.Events.disable();
    try {
      this.ws.clear();
      Blockly.serialization.workspaces.load(r.json, this.ws, { recordUndo: false });
      this.at = { ...r.at };
      this.layout(r.order);
    } finally {
      Blockly.Events.enable();
    }
    this.ws.clearUndo();
    this.fit();
  }

  // New code from somewhere else (Claude changed it, it was typed in): show it.
  setCode(code) {
    if (code === this.code) return;
    this.code = code;
    if (!this.ws) { this.el.replaceChildren(this.host); this.error = null; this._start(); return; }
    const r = codeToBlocks(code);
    if (!r.error) this._load(r);
  }

  // Scripts one under another, in the order the code has them; a note sits
  // just above the script it's about.
  layout(order) {
    const tops = order ? order.map((id) => this.ws.getBlockById(id)).filter(Boolean) : this.ws.getTopBlocks(true);
    let y = PAD / SCALE;
    let prevNote = false;
    for (const b of tops) {
      if (y > PAD / SCALE) y += prevNote ? 4 : 18;
      const xy = b.getRelativeToSurfaceXY();
      b.moveBy(PAD / SCALE - xy.x, y - xy.y);
      y += b.getHeightWidth().height;
      prevNote = b.type === 'bb_note' && !b.getNextBlock();
    }
  }

  // A script that grew (or was dropped) over the one below it pushes that one
  // down, so scripts never cover each other.
  unoverlap() {
    const tops = this.ws.getTopBlocks(true);
    const placed = [];
    Blockly.Events.disable(); // tidying up isn't something to undo
    for (const b of tops) {
      const box = b.getBoundingRectangle();
      let push = 0;
      for (const p of placed) {
        if (box.left < p.right && box.right > p.left && box.top + push < p.bottom + 12 && box.bottom + push > p.top) push = p.bottom + 12 - box.top;
      }
      if (push > 0) { b.moveBy(0, push); box.top += push; box.bottom += push; }
      placed.push(box);
    }
    Blockly.Events.enable();
  }

  // Size the workspace to its scripts.
  fit() {
    if (!this.ws) return;
    if (!this.readOnly) this.unoverlap();
    const box = this.ws.getBlocksBoundingBox();
    const empty = !this.ws.getTopBlocks(false).length;
    // anything dragged off the top or left comes back into view
    const dx = empty ? 0 : Math.min(0, box.left - PAD / SCALE), dy = empty ? 0 : Math.min(0, box.top - PAD / SCALE);
    if (dx || dy) {
      Blockly.Events.disable();
      for (const b of this.ws.getTopBlocks(false)) b.moveBy(-dx, -dy);
      Blockly.Events.enable();
    }
    const right = empty ? 0 : (box.right - dx) * SCALE + PAD;
    const bottom = empty ? 0 : (box.bottom - dy) * SCALE + PAD;
    const w = Math.max(this.el.clientWidth || 0, Math.ceil(right));
    const h = Math.ceil(bottom + (this.readOnly ? 0 : ROOM));
    if (this.host.style.width !== `${w}px` || this.host.style.height !== `${h}px`) {
      this.host.style.width = `${w}px`;
      this.host.style.height = `${Math.max(h, 28)}px`;
      Blockly.svgResize(this.ws);
    }
    this.el.classList.toggle('empty', empty);
  }

  _changed(e) {
    if (e.type === Blockly.Events.CLICK && e.targetType === 'block' && e.blockId) {
      const root = this.ws.getBlockById(e.blockId)?.getRootBlock();
      if (root && this.at[root.id] != null) this.onRun?.(this.at[root.id], this.el);
      return;
    }
    if (e.isUiEvent && e.type !== Blockly.Events.BLOCK_DRAG) return;
    if (this.readOnly) return;
    if (!e.isUiEvent) this.dirty = true;
    this._schedule();
  }

  _schedule(delay = 0) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._settle(), delay);
  }

  // Once Blockly is done (a drag dropped, a menu or a text box closed), write
  // the code again.
  _settle() {
    if (!this.ws) return;
    if (blocklyBusy(this.ws)) { this._schedule(250); return; }
    this.fit();
    if (!this.dirty) return;
    this.dirty = false;
    const { code, at } = toCode(this.ws);
    if (code === this.code) { this.at = at; return; }
    this.code = code;
    this.at = at;
    this.onEdit?.(code);
  }

  // Light up the blocks whose statements are running (ids are code offsets).
  light(isLit) {
    if (!this.ws) return;
    for (const [id, pos] of Object.entries(this.at)) {
      const on = isLit(pos);
      if (on === this.lit.has(id)) continue;
      const b = this.ws.getBlockById(id);
      if (!b) { this.lit.delete(id); continue; }
      b.getSvgRoot().classList.toggle('bb-lit', on);
      if (on) this.lit.add(id); else this.lit.delete(id);
    }
  }

  setReadOnly(ro) {
    if (ro === this.readOnly) return;
    this.readOnly = ro;
    if (this.ws) this.ws.setIsReadOnly?.(ro);
    this.fit();
  }

  dispose() {
    clearTimeout(this._timer);
    this.ws?.dispose();
    this.ws = null;
    this.el.remove();
  }
}

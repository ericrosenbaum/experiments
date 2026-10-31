// The blocks palette: every block, by category, in a panel that opens to the
// left of the inspector. Drag a block out of it onto a behavior's blocks to
// add it there (it snaps to the nearest place it fits), or onto "new
// behavior" to start a new one. The blocks are a Blockly flyout; the drag
// between it and the cards' workspaces is ours, since Blockly drags only
// within one workspace.
import { Blockly, theme, paletteContents, toCode } from '../blocks/blockly.js';
import { injectOptions } from './blockview.js';

const SNAP = 48; // px: how close a block has to be dropped to a place it fits

export class Palette {
  // targets(): [{el, view}] where a block can be dropped (view null: a new behavior)
  // onNew(code): a block was dropped on "new behavior"
  constructor({ el, targets, onNew, onOpenChange }) {
    Object.assign(this, { el, targets, onNew, onOpenChange });
    this.isOpen = false;
    el.innerHTML = `
      <div class="pal-head"><b>Blocks</b><span class="hint">Drag one onto a behavior</span><button class="icon-btn pal-close" title="Close the blocks" aria-label="Close the blocks"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="pal-body"><nav class="pal-cats" aria-label="Block categories"></nav><div class="pal-flyout"></div></div>`;
    el.querySelector('.pal-close').onclick = () => this.toggle(false);
    this.cats = el.querySelector('.pal-cats');
    this.host = el.querySelector('.pal-flyout');
    this.ws = null;
    this.stale = true;
  }

  toggle(open = !this.isOpen) {
    if (open === this.isOpen) return;
    this.isOpen = open;
    this.el.classList.toggle('hidden', !open);
    if (open) this.refresh();
    this.onOpenChange?.(open);
  }

  // The menus changed (another thing selected): rebuild the blocks.
  invalidate() {
    this.stale = true;
    if (this.isOpen) this.refresh();
  }

  refresh() {
    if (!this.ws) {
      this.ws = Blockly.inject(this.host, {
        ...injectOptions(false),
        toolbox: { kind: 'flyoutToolbox', contents: [] },
        move: { scrollbars: true, drag: false, wheel: true },
      });
      this.flyout = this.ws.getFlyout();
      this.host.addEventListener('pointerdown', (ev) => this._grab(ev), true);
      new ResizeObserver(() => this._fitHost()).observe(this.host);
    }
    if (!this.stale) return;
    this.stale = false;
    this.contents = paletteContents();
    const items = [];
    for (const cat of this.contents) {
      items.push({ kind: 'label', text: cat.name, 'web-class': `pal-label pal-label-${cat.key}` });
      for (const b of cat.blocks) items.push(b);
    }
    items.push({ kind: 'sep', gap: 3000 }, { kind: 'label', text: '.', 'web-class': 'pal-end' }); // room to scroll the last category up to the top
    this.ws.updateToolbox({ kind: 'flyoutToolbox', contents: items });
    this.cats.innerHTML = this.contents.map((c) => `<button data-cat="${c.key}" title="${c.name}"><span style="background:${c.color}"></span>${c.name}</button>`).join('');
    for (const btn of this.cats.children) btn.onclick = () => this.scrollTo(btn.dataset.cat);
    this._fitHost();
  }

  _fitHost() {
    if (!this.ws) return;
    Blockly.svgResize(this.ws);
    this.flyout?.position?.();
  }

  // Scroll the blocks to a category's label.
  scrollTo(cat) {
    const name = this.contents.find((c) => c.key === cat)?.name;
    const label = this.flyout.getContents().map((it) => it.getElement?.() ?? it).find((x) => x?.getButtonText?.() === name || x?.info?.text === name);
    if (!label) return;
    const fws = this.flyout.getWorkspace();
    const y = label.getPosition().y * fws.scale - 6;
    fws.scrollbar?.setY(Math.max(0, y));
    for (const b of this.cats.children) b.classList.toggle('on', b.dataset.cat === cat);
  }

  // ---- dragging a block out --------------------------------------------------------
  _grab(ev) {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    const g = ev.target.closest?.('.blocklyDraggable[data-id]');
    const fws = this.flyout?.getWorkspace();
    const hit = g && fws?.getBlockById(g.dataset.id);
    if (!hit) return; // the background: let the flyout scroll
    ev.stopPropagation();
    ev.preventDefault();
    const block = hit.getRootBlock();
    const state = Blockly.serialization.blocks.save(block, { addCoordinates: false, saveIds: false });
    const box = block.getSvgRoot().getBoundingClientRect();
    // where the block's origin is from the pointer (a hat's bump sits above its origin)
    const local = block.getSvgRoot().getBBox();
    const sc = fws.scale;
    const drag = {
      state, block, moved: false, start: { x: ev.clientX, y: ev.clientY },
      grab: { x: ev.clientX - box.left, y: ev.clientY - box.top }, origin: { x: ev.clientX - box.left - local.x * sc, y: ev.clientY - box.top - local.y * sc },
    };
    const move = (e) => this._move(drag, e);
    const up = (e) => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      this._drop(drag, e.type === 'pointercancel' ? null : e);
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
  }

  _ghost(drag) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `bb-ghost blocklySvg ${this.ws.getRenderer().getClassName()} ${theme.getClassName?.() ?? 'bricks-theme'}`);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `scale(${this.flyout.getWorkspace().scale})`);
    const copy = drag.block.getSvgRoot().cloneNode(true);
    copy.removeAttribute('transform');
    g.appendChild(copy);
    svg.appendChild(g);
    document.body.appendChild(svg);
    const box = copy.getBBox();
    const s = this.flyout.getWorkspace().scale;
    svg.setAttribute('width', Math.ceil((box.x + box.width) * s + 4));
    svg.setAttribute('height', Math.ceil((box.y + box.height) * s + 4));
    g.setAttribute('transform', `translate(${-box.x * s} ${-box.y * s}) scale(${s})`);
    drag.offset = { x: box.x * s, y: box.y * s };
    return svg;
  }

  _targetAt(x, y) {
    for (const t of this.targets()) {
      const r = t.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return t;
    }
    return null;
  }

  _move(drag, e) {
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < 4) return;
      drag.moved = true;
      drag.ghost = this._ghost(drag);
      document.body.classList.add('bb-dragging');
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - drag.grab.x + drag.offset.x}px, ${e.clientY - drag.grab.y + drag.offset.y}px)`;
    const t = this._targetAt(e.clientX, e.clientY);
    if (t !== drag.target) {
      drag.target?.el.classList.remove('bb-drop');
      t?.el.classList.add('bb-drop');
      drag.target = t;
    }
    this._preview(drag, t?.view && t.view.ws ? t.view : null, e);
  }

  // Where the block would go: the nearest connection it fits, lit up.
  _preview(drag, view, e) {
    drag.hint?.unhighlight?.();
    drag.hint = null;
    if (!view) return;
    const fit = this._fit(drag, view, e.clientX, e.clientY, true);
    if (fit) { fit.target.highlight?.(); drag.hint = fit.target; }
  }

  // The best place for the dragged block in a workspace, if dropped at x, y:
  // {mine, target}: which of its connections meets which one there.
  _fit(drag, view, x, y, dryRun) {
    const ws = view.ws;
    let block;
    Blockly.Events.disable();
    const bump = quietBumps();
    try {
      block = Blockly.serialization.blocks.append(drag.state, ws, { recordUndo: false });
      this._place(block, view, x, y, drag);
      bump.restore();
      let best = null;
      for (const mine of block.getConnections_(false)) {
        if (mine.isConnected?.() && mine.type !== Blockly.ConnectionType.NEXT_STATEMENT) continue;
        const found = mine.closest(SNAP / ws.scale, new Blockly.utils.Coordinate(0, 0));
        if (found?.connection && (!best || found.radius < best.radius) && ws.connectionChecker.canConnect(mine, found.connection, true, SNAP / ws.scale)) {
          best = { mine: mine.type, target: found.connection, radius: found.radius };
        }
      }
      return best;
    } finally {
      bump.restore();
      if (dryRun && block) block.dispose(false);
      Blockly.Events.enable();
    }
  }

  _place(block, view, x, y, drag) {
    // Blockly draws new blocks later; draw it now, so its connections are where it is.
    Blockly.renderManagement.triggerQueuedRenders(view.ws);
    view.ws.updateScreenCalculations?.(); // where the card is now: the inspector may have scrolled
    const p = Blockly.utils.svgMath.screenToWsCoordinates(view.ws, new Blockly.utils.Coordinate(x - drag.origin.x, y - drag.origin.y));
    const xy = block.getRelativeToSurfaceXY();
    block.moveBy(p.x - xy.x, p.y - xy.y);
  }

  _drop(drag, e) {
    drag.ghost?.remove();
    document.body.classList.remove('bb-dragging');
    drag.target?.el.classList.remove('bb-drop');
    drag.hint?.unhighlight?.();
    if (!drag.moved || !e) return;
    const t = this._targetAt(e.clientX, e.clientY);
    if (!t) return;
    if (!t.view) {
      // a new behavior made of this block
      const ws = new Blockly.Workspace();
      Blockly.serialization.blocks.append(drag.state, ws);
      const { code } = toCode(ws);
      ws.dispose();
      this.onNew?.(code);
      return;
    }
    const view = t.view;
    if (!view.ws) return;
    const fit = this._fit(drag, view, e.clientX, e.clientY, true);
    Blockly.Events.setGroup(true);
    const bump = quietBumps();
    try {
      const block = Blockly.serialization.blocks.append(drag.state, view.ws, { recordUndo: true });
      this._place(block, view, e.clientX, e.clientY, drag);
      bump.restore();
      if (fit) {
        const mine = block.getConnections_(false).find((c) => c.type === fit.mine);
        if (mine && view.ws.connectionChecker.canConnect(mine, fit.target, false)) mine.connect(fit.target);
      }
      block.select?.();
    } finally {
      bump.restore();
      Blockly.Events.setGroup(false);
    }
  }
}

// A new block is drawn where it's made (at first, the workspace's corner) and
// Blockly bumps away whatever it lands near; don't, until it's in its place.
function quietBumps() {
  const r = Blockly.config.snapRadius;
  Blockly.config.snapRadius = 0;
  return { restore: () => { Blockly.config.snapRadius = r; } };
}

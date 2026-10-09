// The kid-facing UI: selecting models, the sentence composer with pointing,
// behavior cards, speech bubbles, and the log.
import * as THREE from 'three';
import { LIBRARY, LIBRARY_BY_ID } from '../world/library.js';
import { colorHex } from '../world/bricks.js';
import { generateBehavior, probeClaude, syntaxError } from '../behavior/generate.js';
import { compileLocal } from '../behavior/compiler.js';
import { buildWorld } from '../world/worldmap.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const css = (hex) => '#' + colorHex(hex).toString(16).padStart(6, '0');

const STARTERS = [
  'When I press the up arrow, ', 'When I press space, ', 'Forever, ', 'When it bumps into ',
  'When I click it, ', 'Every 2 seconds, ', 'When it sees ', 'When it hears ',
];

const EXAMPLES = {
  racecar: [
    'When I press space, honk and jump high.',
    'When it bumps into a tree, say "Ouch!" and back up, then turn right.',
    'When I press f, throw a red brick.',
    'Forever, go to the ball fast.',
  ],
  robot: [
    'When I click it, raise both arms and say "Hello!" then lower both arms.',
    'Forever, turn the head left, wait 1 second, turn the head right, wait 1 second.',
    'When I press space, dance.',
    'Wander. When it bumps into anything, play beep and turn around.',
  ],
  digger: [
    'When I press space, lift the scoop, wait 1 second, lower the scoop.',
    'Go to the Rainbow Tower fast, then lift the scoop.',
    'When I press the arrows, drive and steer.',
  ],
  catapult: [
    'When I press space, put a brick in the throwing arm, wait 1 second, then fling.',
    'Face the Rainbow Tower.',
    'Every 3 seconds, put a red brick in the throwing arm, wait 1 second and fling.',
  ],
  dino: [
    'Chase the nearest car and roar.',
    'Forever, wag the tail.',
    'When it sees a red brick, roar and chomp.',
    'When I click it, jump high and roar.',
  ],
};

const ARROWS_TEXT = 'When I press the up arrow, drive forward. When I press the down arrow, drive backward. While I hold left, turn left. While I hold right, turn right.';

let behaviorIds = 1;

export class App {
  constructor({ world, scene, camera, controls, renderer, audio, net }) {
    Object.assign(this, { world, scene, camera, controls, renderer, audio, net });
    this.selected = null;
    this.follow = false;
    this.pointing = false;
    this.bubbles = new Map(); // entity -> {el, until}
    this.tags = new Map();
    this.savedRange = null;
    this.raycaster = new THREE.Raycaster();
    this.hoverBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffcc00);
    this.hoverBox.visible = false;
    scene.add(this.hoverBox);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.9, 40), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.85 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
    this.unread = 0;
  }

  attachRuntime(runtime) { this.runtime = runtime; }

  // ---- setup ------------------------------------------------------------------

  boot() {
    this._buildLibrary();
    this._wireButtons();
    this._wireComposer();
    this._wirePicking();
    this._wireKeys();
    probeClaude().then((ok) => {
      const s = $('gen-status');
      s.textContent = ok ? '✨ Claude writes the code' : '🔧 Offline helper writes the code';
      s.title = ok ? 'Descriptions are turned into code by Claude (claude-opus-5-5) on the dev server.'
        : 'No ANTHROPIC_API_KEY on the server, so a simple built-in compiler handles a fixed set of phrases. Start the dev server with a key to use Claude.';
      s.classList.toggle('good', ok);
    });

    // Start where no other player's models already are.
    const spots = [[0, 0], [0, -32], [-30, 30], [30, 32], [-40, -30], [40, -40]];
    const remotes = [...this.world.entities.values()].filter((e) => e.remote).map((e) => e.position);
    const [ox, oz] = spots.find(([x, z]) => remotes.every((p) => Math.hypot(p.x - x, p.z - z) > 14)) ?? [0, -32];
    const car = this.addModel('racecar', { x: ox, z: oz, yaw: 0 }, false);
    this.addModel('robot', { x: ox - 8, z: oz - 4, yaw: 20 }, false);
    this.addModel('catapult', { x: ox + 9, z: oz - 3, yaw: 25 }, false);
    if (ox || oz) {
      this.controls.target.set(ox, 1, oz + 3);
      this.camera.position.set(ox - 6, 19, oz - 27);
    }
    // The race car comes pre-taught to drive, so there's something to try right away.
    this._addBehavior(car, { text: ARROWS_TEXT, html: esc(ARROWS_TEXT), ...compileLocal(ARROWS_TEXT, car.def) });
    this.select(car);
  }

  addModel(defId, pose, select = true) {
    const def = LIBRARY_BY_ID[defId];
    if (!pose) {
      // drop it in front of the camera, on the ground
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const p = this.controls.target.clone().add(dir.setY(0).normalize().multiplyScalar(6));
      pose = { x: p.x + (Math.random() - 0.5) * 4, z: p.z + (Math.random() - 0.5) * 4, yaw: Math.atan2(-dir.x, -dir.z) * 180 / Math.PI + 180 };
    }
    const n = [...this.world.entities.values()].filter((e) => e.def?.id === defId && !e.remote).length;
    const e = this.world.addModel(def, { ...pose, name: n ? `${def.name} ${n + 1}` : def.name });
    e.behaviors = [];
    if (select) this.select(e);
    this.net?.announce();
    return e;
  }

  _buildLibrary() {
    const list = $('library-list');
    for (const def of LIBRARY) {
      const b = document.createElement('button');
      b.className = 'lib-card';
      b.innerHTML = `<span class="swatch" style="background:${css(def.color)}"></span><span><b>${esc(def.name)}</b><small>${esc(def.blurb)}</small><br><small>Parts: ${esc(def.parts.map((p) => p.name).join(', '))}</small></span>`;
      b.onclick = () => { this.addModel(def.id); $('library').classList.add('hidden'); };
      list.appendChild(b);
    }
  }

  _wireButtons() {
    $('btn-library').onclick = () => $('library').classList.toggle('hidden');
    document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => $(b.dataset.close).classList.add('hidden'); });
    $('btn-pause').onclick = () => {
      this.world.paused = !this.world.paused;
      $('btn-pause').textContent = this.world.paused ? '▶ Resume' : '⏸ Pause';
      $('btn-pause').classList.toggle('on', this.world.paused);
    };
    $('btn-reset').onclick = () => this.resetWorld();
    $('btn-follow').onclick = () => { this.follow = !this.follow; $('btn-follow').classList.toggle('on', this.follow); };
    $('btn-mute').onclick = () => { this.audio.muted = !this.audio.muted; $('btn-mute').textContent = this.audio.muted ? '🔇' : '🔊'; };
    $('btn-respawn').onclick = () => this.selected && this.world.resetModel(this.selected);
    $('btn-remove').onclick = () => {
      const e = this.selected;
      if (!e) return;
      this.runtime.stopAll(e);
      for (const b of e.spawned ?? []) if (!b.removed) this.world.remove(b);
      this.world.remove(e);
      this.select(null);
      this.net?.announce();
    };
    $('btn-make').onclick = () => this.make();
    $('btn-point').onclick = () => this.setPointing(!this.pointing);
    $('btn-console').onclick = () => {
      $('console').classList.toggle('collapsed');
      this.unread = 0;
      $('console-badge').textContent = '';
    };
    const starters = $('starters');
    for (const s of STARTERS) {
      const b = document.createElement('button');
      b.className = 'starter';
      b.textContent = s.replace(/, $/, '…').replace(/ $/, '…');
      b.onmousedown = (ev) => ev.preventDefault();
      b.onclick = () => this._insertText(s);
      starters.appendChild(b);
    }
  }

  resetWorld() {
    const models = [...this.world.entities.values()].filter((e) => e.kind === 'model' && !e.remote);
    for (const m of models) this.runtime.stopAll(m);
    for (const e of [...this.world.entities.values()]) if (e.kind !== 'model' && e.kind !== 'ground') this.world.remove(e);
    buildWorld(this.world);
    for (const m of models) {
      m.spawned = [];
      this.world.resetModel(m);
      for (const b of m.behaviors) if (b.enabled) this.runtime.start(m, b);
    }
    this.renderBehaviors();
  }

  // ---- selection ----------------------------------------------------------------

  select(e) {
    if (e && (e.kind !== 'model' || e.remote)) return;
    this.selected = e;
    $('no-selection').classList.toggle('hidden', !!e);
    $('selection').classList.toggle('hidden', !e);
    this.ring.visible = !!e;
    if (!e) return;
    $('sel-name').textContent = e.name;
    $('sel-swatch').style.background = css(e.def.color);
    $('sel-blurb').textContent = e.def.blurb;
    const parts = $('sel-parts');
    parts.innerHTML = '';
    for (const p of e.def.parts) {
      const b = document.createElement('button');
      b.className = 'chip part';
      b.innerHTML = `<span class="ico">${p.kind === 'wheel' ? '◎' : '↻'}</span>${esc(p.name)}`;
      b.onmousedown = (ev) => ev.preventDefault();
      b.onclick = () => this.insertChip({ type: 'part', name: p.name });
      b.onmouseenter = () => this._highlight(e.parts.get(p.name)?.object3d);
      b.onmouseleave = () => this._highlight(null);
      parts.appendChild(b);
    }
    const ex = $('examples');
    ex.innerHTML = '<div class="hint">Try one:</div>';
    for (const t of EXAMPLES[e.def.id] ?? []) {
      const b = document.createElement('button');
      b.className = 'ex';
      b.textContent = `“${t}”`;
      b.onclick = () => { $('composer').textContent = t; this.savedRange = null; };
      ex.appendChild(b);
    }
    this.renderBehaviors();
  }

  _highlight(obj) {
    if (!obj) { this.hoverBox.visible = false; this.hoverTarget = null; return; }
    this.hoverTarget = obj;
    this.hoverBox.setFromObject(obj);
    this.hoverBox.visible = true;
  }

  // ---- picking and pointing -----------------------------------------------------

  _pick(ev) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      if (h.object === this.ring || h.object === this.hoverBox) continue;
      let o = h.object, entity = null, part = null;
      while (o) {
        if (!part && o.userData.part) part = o.userData.part;
        if (o.userData.entity) { entity = o.userData.entity; break; }
        o = o.parent;
      }
      if (entity) return { entity, part, point: h.point, object: h.object };
      if (h.object.geometry?.type === 'PlaneGeometry') return { ground: true, point: h.point };
    }
    return null;
  }

  _objectFor(hit) {
    if (!hit || hit.ground) return null;
    const e = hit.entity;
    if (hit.part) return e.parts.get(hit.part)?.object3d;
    // a group of bricks (house/tower): highlight the hit brick
    return e.bodies[0]?.object3d;
  }

  _wirePicking() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY, alt: ev.altKey }; });
    el.addEventListener('pointermove', (ev) => {
      if (!(this.pointing || ev.altKey) || down) { if (this.hoverBox.visible && !this._partHover) this._highlight(null); return; }
      const hit = this._pick(ev);
      this._highlight(this._objectFor(hit));
      $('point-hint').textContent = hit ? this._describeHit(hit).label : '';
    });
    el.addEventListener('pointerup', (ev) => {
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      const alt = down.alt || ev.altKey;
      down = null;
      if (moved > 5 || ev.button !== 0) return;
      const hit = this._pick(ev);
      if (this.pointing || alt) {
        if (hit && this.selected) this.insertChip(this._describeHit(hit).chip);
        return;
      }
      if (hit?.entity?.kind === 'model') {
        this.runtime.click(hit.entity);
        if (!hit.entity.remote) this.select(hit.entity);
      }
    });
  }

  _describeHit(hit) {
    if (hit.ground) {
      const x = Math.round(hit.point.x), z = Math.round(hit.point.z);
      return { chip: { type: 'place', x, z }, label: `the ground at ${x}, ${z}` };
    }
    const e = hit.entity;
    if (e === this.selected && hit.part) return { chip: { type: 'part', name: hit.part }, label: `its ${hit.part}` };
    const d = e.describe();
    return { chip: { type: 'thing', id: d.id, name: d.name }, label: d.name };
  }

  setPointing(on) {
    this.pointing = on;
    $('btn-point').classList.toggle('on', on);
    $('viewport').classList.toggle('pointing', on);
    $('point-hint').textContent = on ? 'Click a part, a thing, or the ground' : '';
    if (!on) this._highlight(null);
  }

  // ---- composer -----------------------------------------------------------------

  _wireComposer() {
    const c = $('composer');
    const save = () => {
      const sel = getSelection();
      if (sel.rangeCount && c.contains(sel.anchorNode)) this.savedRange = sel.getRangeAt(0).cloneRange();
    };
    c.addEventListener('keyup', save);
    c.addEventListener('mouseup', save);
    c.addEventListener('input', save);
    c.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); this.make(); }
    });
    c.addEventListener('paste', (ev) => { // plain text only
      ev.preventDefault();
      this._insertText(ev.clipboardData.getData('text/plain'));
    });
  }

  _range() {
    const c = $('composer');
    if (this.savedRange && c.contains(this.savedRange.startContainer)) return this.savedRange;
    const r = document.createRange();
    r.selectNodeContents(c);
    r.collapse(false);
    return r;
  }

  _insertNode(node) {
    const r = this._range();
    r.deleteContents();
    r.insertNode(node);
    r.setStartAfter(node);
    r.collapse(true);
    this.savedRange = r.cloneRange();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  _insertText(text) {
    $('composer').focus();
    this._insertNode(document.createTextNode(text));
  }

  insertChip(chip) {
    const span = document.createElement('span');
    span.contentEditable = 'false';
    span.className = `chip ${chip.type}`;
    if (chip.type === 'part') {
      span.dataset.token = `{part:${chip.name}}`;
      span.innerHTML = `<span class="ico">↻</span>${esc(chip.name)}`;
    } else if (chip.type === 'thing') {
      span.dataset.token = `{thing:${chip.id}|${chip.name}}`;
      span.innerHTML = `<span class="ico">◆</span>${esc(chip.name)}`;
    } else {
      span.dataset.token = `{place:${chip.x},${chip.z}}`;
      span.innerHTML = `<span class="ico">📍</span>here (${chip.x}, ${chip.z})`;
    }
    this._insertNode(span);
    this._insertNode(document.createTextNode(' '));
  }

  serialize(node = $('composer')) {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) out += n.textContent;
      else if (n.dataset?.token) out += n.dataset.token;
      else if (n.nodeName === 'BR') out += '\n';
      else { out += (n.nodeName === 'DIV' ? '\n' : '') + this.serialize(n); }
    }
    return out.replace(/ /g, ' ');
  }

  // ---- making behaviors -------------------------------------------------------

  async make() {
    const e = this.selected;
    const text = this.serialize().trim();
    if (!e || !text) return;
    const btn = $('btn-make');
    btn.disabled = true;
    btn.textContent = '✨ Thinking…';
    try {
      const here = e.position;
      const things = [...this.world.things().entries()]
        .filter(([, t]) => t !== e)
        .map(([id, t]) => ({ ...t.describe(), id, distance: Math.round(this.world.thingCenter(id).distanceTo(here)) }))
        .sort((a, b) => a.distance - b.distance);
      const res = await generateBehavior({
        text, model: e.def, things,
        otherBehaviors: e.behaviors.filter((b) => b.enabled).flatMap((b) => b.summary ?? []),
      });
      if (!res.code.trim()) {
        this.log(`I couldn't turn that into a program${res.unknown?.length ? `: I didn't understand “${res.unknown.join('”, “')}”` : ''}.`, 'error');
        return;
      }
      this._addBehavior(e, { text, html: $('composer').innerHTML, ...res });
      $('composer').innerHTML = '';
      this.savedRange = null;
      this.setPointing(false);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Make it so';
    }
  }

  _addBehavior(e, b) {
    const behavior = {
      id: behaviorIds++, enabled: true, running: false,
      text: b.text, html: b.html, code: b.code, summary: b.summary ?? [], source: b.source,
      notes: [b.notes, b.unknown?.length ? `I didn't understand: “${b.unknown.join('”, “')}”` : ''].filter(Boolean).join(' '),
      title: (b.summary?.[0] ?? b.text).slice(0, 40),
    };
    e.behaviors.push(behavior);
    this.runtime.start(e, behavior);
    this.renderBehaviors();
  }

  _restart(e, b) {
    for (const p of [...this.runtime.programs]) if (p.behavior === b) p.stop();
    this.runtime._resetControls(e);
    if (b.enabled) this.runtime.start(e, b);
  }

  renderBehaviors() {
    const e = this.selected;
    const list = $('behaviors');
    if (!e) return;
    list.innerHTML = '';
    $('behavior-count').textContent = e.behaviors.length ? `(${e.behaviors.length})` : '(nothing yet)';
    for (const b of e.behaviors) {
      const card = document.createElement('div');
      card.className = `behavior ${b.enabled ? '' : 'off'} ${b.running ? 'running' : ''}`;
      card.innerHTML = `
        <div class="b-head">
          <div class="b-said">${b.html ? sanitizeHtml(b.html) : esc(b.text)}</div>
          <button class="toggle ${b.enabled ? 'on' : ''}" title="Turn this behavior on or off">${b.enabled ? 'ON' : 'OFF'}</button>
          <button class="mini edit" title="Put these words back in the box to change them">✎</button>
          <button class="mini del" title="Forget this behavior">✕</button>
        </div>
        <ul>${b.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        ${b.notes ? `<div class="notes">${esc(b.notes)}</div>` : ''}
        <details><summary>See the code <span class="src">· written by ${b.source === 'claude' ? 'Claude' : 'the offline helper'}</span></summary>
          <textarea spellcheck="false">${esc(b.code)}</textarea>
          <button class="mini run">Run edited code</button>
        </details>`;
      card.querySelector('.toggle').onclick = () => { b.enabled = !b.enabled; this._restart(e, b); this.renderBehaviors(); };
      card.querySelector('.del').onclick = () => {
        b.enabled = false;
        this._restart(e, b);
        e.behaviors.splice(e.behaviors.indexOf(b), 1);
        this.renderBehaviors();
      };
      card.querySelector('.edit').onclick = () => { $('composer').innerHTML = b.html ?? esc(b.text); this.savedRange = null; $('composer').focus(); };
      card.querySelector('.run').onclick = () => {
        const code = card.querySelector('textarea').value;
        const err = syntaxError(code);
        if (err) { this.log(`That code has a typo: ${err}`, 'error'); return; }
        b.code = code;
        b.source = 'edited';
        b.enabled = true;
        this._restart(e, b);
        this.renderBehaviors();
      };
      list.appendChild(card);
    }
  }

  onProgramsChanged() {
    clearTimeout(this._rerender);
    this._rerender = setTimeout(() => {
      if (document.activeElement?.tagName !== 'TEXTAREA') this.renderBehaviors();
    }, 50);
  }

  // ---- keys -------------------------------------------------------------------

  _wireKeys() {
    const typing = () => {
      const a = document.activeElement;
      return a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
    };
    const norm = (k) => (k.length === 1 ? k.toLowerCase() : k);
    addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { this.setPointing(false); return; }
      if (typing() || ev.metaKey || ev.ctrlKey) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) ev.preventDefault();
      this.runtime.keyDown(norm(ev.key));
    });
    addEventListener('keyup', (ev) => this.runtime.keyUp(norm(ev.key)));
    addEventListener('blur', () => { for (const k of [...this.runtime.heldKeys]) this.runtime.keyUp(k); });
  }

  // ---- bubbles, log, per-frame --------------------------------------------------

  say(entity, text, seconds) {
    let b = this.bubbles.get(entity);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'bubble';
      $('bubbles').appendChild(el);
      b = { el };
      this.bubbles.set(entity, b);
    }
    b.el.textContent = text;
    b.until = performance.now() + seconds * 1000;
  }

  log(msg, level = 'info') {
    const body = $('console-body');
    const line = document.createElement('div');
    line.className = level;
    line.textContent = msg;
    body.appendChild(line);
    while (body.childNodes.length > 200) body.firstChild.remove();
    body.scrollTop = body.scrollHeight;
    if ($('console').classList.contains('collapsed')) {
      if (level === 'error') $('console').classList.remove('collapsed');
      else { this.unread++; $('console-badge').textContent = this.unread; }
    }
  }

  _screen(pos) {
    const v = pos.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }

  update() {
    const e = this.selected;
    if (e?.removed) this.select(null);
    if (this.selected) {
      const p = this.selected.position;
      this.ring.position.set(p.x, 0.03, p.z);
      if (this.follow) {
        const delta = p.clone().sub(this.controls.target);
        delta.y = 0;
        delta.multiplyScalar(0.08);
        this.controls.target.add(delta);
        this.camera.position.add(delta);
      }
    }
    if (this.hoverBox.visible && this.hoverTarget) this.hoverBox.setFromObject(this.hoverTarget);

    const now = performance.now();
    for (const [ent, b] of this.bubbles) {
      if (now > b.until || ent.removed) { b.el.remove(); this.bubbles.delete(ent); continue; }
      const s = this._screen(ent.position.add(new THREE.Vector3(0, 5, 0)));
      b.el.style.display = s ? '' : 'none';
      if (s) { b.el.style.left = `${s.x}px`; b.el.style.top = `${s.y}px`; }
    }
    // name tags for friends' models
    for (const ent of this.world.entities.values()) {
      if (!ent.remote) continue;
      let tag = this.tags.get(ent);
      if (!tag) {
        tag = document.createElement('div');
        tag.className = 'tag';
        tag.textContent = ent.name;
        $('bubbles').appendChild(tag);
        this.tags.set(ent, tag);
      }
      const s = this._screen(ent.position.add(new THREE.Vector3(0, 3.5, 0)));
      tag.style.display = s ? '' : 'none';
      if (s) { tag.style.left = `${s.x}px`; tag.style.top = `${s.y}px`; }
    }
    for (const [ent, tag] of this.tags) if (ent.removed) { tag.remove(); this.tags.delete(ent); }
  }
}

// Behavior cards echo the kid's words with their chips; keep only text and chip spans.
function sanitizeHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (node) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) out += esc(n.textContent);
      else if (n.classList?.contains('chip')) out += `<span class="chip ${['part', 'thing', 'place'].find((c) => n.classList.contains(c)) ?? ''}">${esc(n.textContent)}</span>`;
      else out += (n.nodeName === 'DIV' || n.nodeName === 'BR' ? ' ' : '') + walk(n);
    }
    return out;
  };
  return walk(tpl.content);
}

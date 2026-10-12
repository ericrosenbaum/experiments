// The kid-facing UI: picking worlds, selecting things (a model, a whole
// assembly, one brick of it, or the World), dragging them around, the
// sentence composer with pointing, behavior cards, speech bubbles, the log.
import * as THREE from 'three';
import { LIBRARY, LIBRARY_BY_ID, CATEGORIES } from '../world/library.js';
import { WORLDS } from '../world/worlds.js';
import { colorHex } from '../world/bricks.js';
import { generateBehavior, findNamedBehaviors, probeClaude, syntaxError } from '../behavior/generate.js';
import { renderBlocks } from './blocks.js';
import { highlight } from './highlight.js';
import { keyLabels, padGroups, padHtml } from './pad.js';
import { makeBehavior, describeTarget } from '../stage.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const css = (hex) => '#' + colorHex(hex).toString(16).padStart(6, '0');
const DEG = Math.PI / 180;
// popup name -> [popup id, the button that opens it]
const POPS = { top: ['top-menu', 'btn-top-menu'], menu: ['sel-menu', 'btn-more'], parts: ['parts-pop', 'btn-parts'] };
const svg = (d, w = 15) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  chevron: svg('<path d="M6 9l6 6 6-6"/>', 18),
  code: svg('<path d="M8 4H7a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1"/>'),
  play: svg('<path d="M7 5v14l11-7z"/>', 13),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
};

export class App {
  constructor({ world, scene, camera, controls, renderer, audio }) {
    Object.assign(this, { world, scene, camera, controls, renderer, audio });
    this.selected = null; // an Actor
    this.follow = false;
    this.pointing = false;
    this.drag = null;
    this.bubbles = new Map(); // actor -> {el, until}
    this.savedRange = null;
    this.raycaster = new THREE.Raycaster();
    this.hoverBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffcc00);
    this.hoverBox.visible = false;
    scene.add(this.hoverBox);
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd400);
    this.selBox.visible = false;
    scene.add(this.selBox);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.9, 40), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.85 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
    // Which way the selected thing will go, for things with no front of their
    // own (a ball, a whole house): an arrow on the ground.
    const arrow = new THREE.Shape([[-0.25, 0], [0.25, 0], [0.25, 3], [0.7, 3], [0, 4.2], [-0.7, 3], [-0.25, 3]].map(([x, y]) => new THREE.Vector2(x, y)));
    this.aim = new THREE.Mesh(new THREE.ShapeGeometry(arrow), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.aim.geometry.rotateX(Math.PI / 2); // lie flat, pointing along +z
    this.aim.visible = false;
    scene.add(this.aim);
    for (const o of [this.hoverBox, this.selBox, this.ring, this.aim]) o.raycast = () => {};
    this.unread = 0;
  }

  attach({ runtime, stage }) { this.runtime = runtime; this.stage = stage; }

  // ---- setup ------------------------------------------------------------------

  boot() {
    this._buildWorldPicker();
    this._buildLibrary();
    this._wireButtons();
    this._wireComposer();
    this._wirePicking();
    this._wireKeys();
    probeClaude().then((ok) => {
      if (!ok) this.log('🔧 No ANTHROPIC_API_KEY on the server, so a simple offline helper writes the code (it knows a fixed set of phrases). Start the dev server with a key to use Claude.');
    });
    this.loadWorld(location.hash.slice(1) || 'playground');
  }

  setFollow(on) {
    this.follow = on;
    $('btn-follow').classList.toggle('checked', on);
    $('btn-follow').setAttribute('aria-checked', String(on));
  }

  // The World button shows how many behaviors the World has.
  renderWorldCount() {
    const n = this.stage ? this.stage.behaviorsOf('world').length : 0;
    $('world-count').textContent = n;
    $('btn-world').title = `World rules (${n === 1 ? '1 behavior' : `${n} behaviors`}): teach the World itself (gravity, dropping and copying things), or click the ground`;
  }

  loadWorld(id) {
    this.select(null);
    this.stage.load(id);
    $('world-select').value = this.stage.worldId;
    if (location.hash.slice(1) !== this.stage.worldId) history.replaceState(null, '', `#${this.stage.worldId}`);
    this.select(this.world.actor(this.stage.preset.select));
    this.setFollow(!!this.stage.preset.follow); // big worlds start with the camera following the player
    this.log(`${this.stage.preset.emoji} ${this.stage.preset.name}: ${this.stage.preset.blurb}`);
  }

  _buildWorldPicker() {
    const sel = $('world-select');
    for (const w of WORLDS) {
      const o = document.createElement('option');
      o.value = w.id;
      o.textContent = `${w.emoji} ${w.name}`;
      sel.appendChild(o);
    }
    sel.onchange = () => { this.loadWorld(sel.value); sel.blur(); };
  }

  _buildLibrary() {
    const list = $('library-list');
    for (const [cat, title] of CATEGORIES) {
      const h = document.createElement('div');
      h.className = 'lib-cat';
      h.textContent = title;
      list.appendChild(h);
      for (const def of LIBRARY.filter((d) => d.category === cat)) {
        const b = document.createElement('button');
        b.className = 'lib-card';
        b.innerHTML = `<span class="swatch" style="background:${css(def.color)}"></span><span><b>${esc(def.name)}</b><small>${esc(def.blurb)}</small><br><small>Parts: ${esc(def.parts.map((p) => p.name).join(', ') || 'none')}</small></span>`;
        b.onclick = () => { this.addModel(def.id); $('library').classList.add('hidden'); };
        list.appendChild(b);
      }
    }
  }

  addModel(defId) {
    // drop it in front of the camera, on the ground
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const p = this.controls.target.clone().add(dir.setY(0).normalize().multiplyScalar(6));
    const pose = { x: p.x + (Math.random() - 0.5) * 4, z: p.z + (Math.random() - 0.5) * 4, yaw: Math.atan2(-dir.x, -dir.z) * 180 / Math.PI + 180 };
    const a = this.stage.addModel(defId, pose);
    this.select(a);
    return a;
  }

  _wireButtons() {
    $('btn-library').onclick = () => $('library').classList.toggle('hidden');
    document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => $(b.dataset.close).classList.add('hidden'); });
    $('btn-pause').onclick = () => {
      this.world.paused = !this.world.paused;
      $('btn-pause').querySelector('span').textContent = this.world.paused ? 'Resume' : 'Pause';
      $('btn-pause').classList.toggle('paused', this.world.paused);
    };
    $('btn-reset').onclick = () => this.stage.reset();
    $('btn-world').onclick = () => this.select(this.world.actor('world'));
    $('btn-follow').onclick = () => this.setFollow(!this.follow);
    $('btn-mute').onclick = () => {
      this.audio.muted = !this.audio.muted;
      $('btn-mute').classList.toggle('muted', this.audio.muted);
      $('btn-mute').setAttribute('aria-checked', String(!this.audio.muted));
    };
    $('btn-top-menu').onclick = (ev) => { ev.stopPropagation(); this.setPop('top', $('top-menu').classList.contains('hidden')); };
    $('top-menu').onclick = (ev) => { ev.stopPropagation(); this.setPop('top', false); }; // every item closes it
    $('btn-respawn').onclick = () => { const m = this.selected?.model; if (m) this.world.resetModel(m); };
    $('btn-whole').onclick = () => { const e = this.selected?.members[0]; if (e) this.select(this.world.actorOf(e)); };
    $('btn-copy').onclick = () => {
      const a = this.selected;
      if (!a || a.isWorld) return;
      const copy = this.stage.cloneActor(a, null);
      if (copy) this.select(copy);
    };
    $('btn-turn').onclick = () => {
      const a = this.selected;
      if (!a?.alive || a.isWorld) return;
      const pivot = a.position;
      this.world.transform(a.members, { dyaw: 45, pivot });
      if (a.usesOwnYaw) a.yaw = (a.yaw ?? 0) + 45;
      this.stage.recordMove(a.key, new THREE.Vector3(), 45, pivot);
    };
    $('btn-remove').onclick = () => {
      const a = this.selected;
      if (!a || a.isWorld) return;
      this.stage.removeActor(a, { forever: true });
      this.select(null);
    };
    $('btn-make').onclick = () => this.make();
    $('btn-point').onclick = () => this.setPointing(!this.pointing);
    $('btn-more').onclick = (ev) => { ev.stopPropagation(); this.setPop('menu', $('sel-menu').classList.contains('hidden')); };
    $('btn-parts').onmousedown = (ev) => ev.preventDefault(); // keep the cursor in the composer
    $('btn-parts').onclick = (ev) => { ev.stopPropagation(); this.setPop('parts', $('parts-pop').classList.contains('hidden')); };
    $('sel-menu').onclick = () => this.setPop('menu', false); // every item closes it
    $('parts-pop').onclick = (ev) => ev.stopPropagation(); // stay open to add several parts
    const closeAll = () => { for (const p of Object.keys(POPS)) this.setPop(p, false); };
    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeAll(); });
    this._wireSpeech();
    $('btn-console').onclick = () => this.setConsole(false);
    $('btn-console-open').onclick = () => this.setConsole(true);
  }

  // The popups: the top bar's menu, and the inspector's ⋯ menu and Parts popover
  setPop(which, open) {
    if (open) for (const p of Object.keys(POPS)) if (p !== which) this.setPop(p, false); // one at a time
    const [pop, btn] = POPS[which].map($);
    pop.classList.toggle('hidden', !open);
    btn.classList.toggle('on', open);
    btn.setAttribute('aria-expanded', String(open));
  }

  // ---- selection ----------------------------------------------------------------

  select(actor) {
    if (actor && !actor.alive) actor = null;
    if (actor !== this.selected) { this.stopListening?.(); this.setPointing(false); this.setPop('menu', false); this.setPop('parts', false); }
    this.selected = actor;
    this.runtime.setKeyTarget(actor);
    $('no-selection').classList.toggle('hidden', !!actor);
    $('selection').classList.toggle('hidden', !actor);
    $('btn-world').classList.toggle('on', !!actor?.isWorld);
    this.ring.visible = false;
    this.selBox.visible = false;
    if (!actor) return;
    const kind = actor.kind;
    const model = actor.model;
    $('sel-name').textContent = actor.name;
    $('sel-swatch').style.background = actor.isWorld ? 'conic-gradient(#3f9e44, #0a64d6, #3f9e44)' : css(model?.def.color ?? actor.color ?? 'gray');
    const whole = kind === 'piece' ? this.world.actorOf(actor.members[0]) : null;
    $('btn-respawn').classList.toggle('hidden', !model);
    $('btn-whole').classList.toggle('hidden', kind !== 'piece');
    $('btn-whole').querySelector('span').textContent = whole ? `Back to the whole ${whole.name}` : '';
    for (const id of ['btn-copy', 'btn-turn', 'btn-remove']) $(id).classList.toggle('hidden', actor.isWorld);
    $('btn-more').classList.toggle('hidden', actor.isWorld); // the World has nothing to copy, turn or delete

    const parts = $('sel-parts');
    parts.innerHTML = '';
    $('btn-parts').classList.toggle('hidden', !model?.def.parts.length);
    for (const p of model?.def.parts ?? []) {
      const b = document.createElement('button');
      b.className = 'chip part';
      b.innerHTML = `<span class="ico">${p.kind === 'wheel' ? '◎' : '↻'}</span>${esc(p.name)}`;
      b.onmousedown = (ev) => ev.preventDefault();
      b.onclick = () => this.insertChip({ type: 'part', name: p.name });
      b.onmouseenter = () => this._highlight(model.parts.get(p.name)?.object3d);
      b.onmouseleave = () => this._highlight(null);
      parts.appendChild(b);
    }
    $('composer').dataset.placeholder = actor.isWorld ? 'At the start, turn off gravity…' : 'When I press the up arrow, drive forward…';
    this.renderBehaviors();
  }

  onWorldRebuilt() {
    if (this.selected && !this.selected.alive) this.select(null);
    else if (this.selected) this.select(this.selected);
    for (const b of this.bubbles.values()) b.el.remove();
    this.bubbles.clear();
  }
  onActorRemoved(actor) { if (this.selected === actor) this.select(null); }
  onActorAdded() { this.onProgramsChanged(); }

  _highlight(obj) {
    if (!obj) { this.hoverBox.visible = false; this.hoverTarget = null; return; }
    this.hoverTarget = obj;
    this.hoverBox.setFromObject(obj);
    this.hoverBox.visible = true;
  }

  // ---- picking, pointing and dragging -------------------------------------------

  _ndc(ev) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  }

  _pick(ev) {
    this.raycaster.setFromCamera(this._ndc(ev), this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      let o = h.object, entity = null, part = null;
      while (o) {
        if (!part && o.userData.part) part = o.userData.part;
        if (o.userData.entity) { entity = o.userData.entity; break; }
        o = o.parent;
      }
      if (entity && !entity.removed) return { entity, part, point: h.point, object: h.object };
      if (h.object.userData.ground) return { ground: true, point: h.point };
    }
    return null;
  }

  _objectFor(hit) {
    if (!hit || hit.ground) return null;
    const e = hit.entity;
    if (hit.part) return e.parts.get(hit.part)?.object3d;
    return e.bodies[0]?.object3d;
  }

  _wirePicking() {
    const el = this.renderer.domElement;
    const viewport = $('viewport');
    let down = null;
    // Capture phase on the container runs before OrbitControls (on the canvas),
    // so grabbing the selected thing drags it instead of turning the camera.
    viewport.addEventListener('pointerdown', (ev) => {
      down = { x: ev.clientX, y: ev.clientY, alt: ev.altKey };
      if (ev.button !== 0 || this.pointing || ev.altKey || !this.selected || this.selected.isWorld) return;
      const hit = this._pick(ev);
      if (hit?.entity && this.selected.has(hit.entity)) {
        ev.stopPropagation();
        this._startDrag(hit, ev);
      }
    }, true);
    viewport.addEventListener('wheel', (ev) => {
      if (!this.drag) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.drag.yaw += Math.sign(ev.deltaY) * -15;
    }, { capture: true, passive: false });
    addEventListener('pointermove', (ev) => {
      if (this.drag) { this._moveDrag(ev); return; }
      if (ev.target !== el) return;
      if (!(this.pointing || ev.altKey) || down) {
        if (this.hoverBox.visible && !this._partHover) this._highlight(null);
        const over = !down && this.selected && !this.selected.isWorld ? this._pick(ev)?.entity : null;
        el.style.cursor = over && this.selected.has(over) ? 'grab' : '';
        return;
      }
      const hit = this._pick(ev);
      this._highlight(this._objectFor(hit));
      $('point-hint').textContent = hit ? this._describeHit(hit).label : '';
    });
    addEventListener('pointerup', (ev) => {
      const wasDrag = this.drag;
      if (wasDrag) this._endDrag();
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      const alt = down.alt || ev.altKey;
      down = null;
      if (moved > 5 || ev.button !== 0 || (ev.target !== el && !wasDrag)) return;
      const hit = this._pick(ev);
      if (this.pointing || alt) {
        if (hit && this.selected) this.insertChip(this._describeHit(hit).chip);
        return;
      }
      this._click(hit);
    });
    el.addEventListener('dblclick', (ev) => {
      const hit = this._pick(ev);
      if (!hit?.entity || hit.entity.kind === 'model') return;
      const whole = this.world.actorOf(hit.entity);
      if (whole.members.length > 1) this.select(this.world.actor(hit.entity.id));
    });
  }

  _click(hit) {
    if (!hit) { this.select(null); return; }
    if (hit.ground) {
      const w = this.world.actor('world');
      this.select(w);
      return;
    }
    const whole = this.world.actorOf(hit.entity);
    const piece = this.world.actor(hit.entity.id);
    // keep a picked-out brick selected when it's the one clicked
    this.select(this.selected === piece ? piece : whole);
  }

  _startDrag(hit, ev) {
    const a = this.selected;
    this.controls.enabled = false;
    const pivot = a.position;
    this.drag = {
      actor: a, pivot, yaw: 0, delta: new THREE.Vector3(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y),
      start: hit.point.clone(),
      base: a.bodies().map(({ body }) => {
        const t = body.translation(), r = body.rotation();
        return { body, t: new THREE.Vector3(t.x, t.y, t.z), q: new THREE.Quaternion(r.x, r.y, r.z, r.w) };
      }),
      moved: false,
    };
    this.renderer.domElement.style.cursor = 'grabbing';
    this._moveDrag(ev);
  }

  _moveDrag(ev) {
    const d = this.drag;
    this.raycaster.setFromCamera(this._ndc(ev), this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(d.plane, p)) return;
    d.delta.set(p.x - d.start.x, 0, p.z - d.start.z);
    if (d.delta.length() > 0.2) d.moved = true;
  }

  // Hold the dragged thing where the pointer is (every frame, against gravity).
  _holdDrag(d = this.drag, lift = 0.4) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw * DEG);
    for (const { body, t, q: bq } of d.base) {
      const pos = t.clone().sub(d.pivot).applyQuaternion(q).add(d.pivot).add(d.delta);
      pos.y += lift;
      const rot = q.clone().multiply(bq);
      body.setTranslation(pos, true);
      body.setRotation(rot, true);
      if (body.isKinematic()) { body.setNextKinematicTranslation(pos); body.setNextKinematicRotation(rot); }
      else { body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
    }
  }

  _endDrag() {
    const d = this.drag;
    this.drag = null;
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = '';
    // Put it back where it was, then (if it moved) apply the move for real,
    // so it's remembered for Reset.
    this._holdDrag({ ...d, delta: new THREE.Vector3(), yaw: 0 }, 0);
    if (!d.moved && !d.yaw) return;
    this.world.transform(d.actor.members, { delta: d.delta, dyaw: d.yaw, pivot: d.pivot });
    for (const { body } of d.base) {
      if (body.isDynamic()) { body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true); body.wakeUp(); }
    }
    if (d.actor.usesOwnYaw && d.yaw) d.actor.yaw = (d.actor.yaw ?? 0) + d.yaw;
    this.stage.recordMove(d.actor.key, d.delta, d.yaw, d.pivot);
  }

  _describeHit(hit) {
    if (hit.ground) {
      const x = Math.round(hit.point.x), z = Math.round(hit.point.z);
      return { chip: { type: 'place', x, z }, label: `the ground at ${x}, ${z}` };
    }
    const e = hit.entity;
    if (this.selected?.model === e && hit.part) return { chip: { type: 'part', name: hit.part }, label: `its ${hit.part}` };
    const d = this.world.actorOf(e).describe();
    return { chip: { type: 'thing', id: d.id, name: d.name }, label: d.name };
  }

  setPointing(on) {
    this.pointing = on;
    $('btn-point').classList.toggle('on', on);
    $('viewport').classList.toggle('pointing', on);
    $('point-hint').textContent = on ? 'Click a part, a thing, or the ground' : this.listening ? 'Say what it should do' : '';
    if (!on) this._highlight(null);
  }

  // ---- talking ------------------------------------------------------------------

  // Browser speech recognition (Chrome, Edge, Safari). Final words go in at the
  // cursor like typing, so a kid can say "go to", point at a tree, and keep talking.
  _wireSpeech() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    const btn = $('btn-talk');
    btn.classList.remove('hidden');
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    this.listening = false;
    btn.onmousedown = (ev) => ev.preventDefault(); // keep the cursor in the composer
    btn.onclick = () => (this.listening ? rec.stop() : rec.start());
    rec.onstart = () => {
      this.listening = true;
      btn.classList.add('on');
      btn.title = 'Listening… click to stop';
      $('point-hint').textContent = 'Say what it should do';
    };
    rec.onend = () => {
      this.listening = false;
      btn.classList.remove('on');
      btn.title = 'Talk: say what it should do. You can point while you talk. Say “generate” to finish.';
      $('point-hint').textContent = this.pointing ? 'Click a part, a thing, or the ground' : '';
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') this.log('I need permission to use the microphone to hear you.', 'error');
      else if (ev.error !== 'no-speech' && ev.error !== 'aborted') this.log(`Listening stopped: ${ev.error}`, 'error');
    };
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r.isFinal) { interim += r[0].transcript; continue; }
        let words = r[0].transcript.trim();
        const done = /\b(make it so|generate)\W*$/i.test(words);
        if (done) words = words.replace(/\W*(make it so|generate)\W*$/i, '');
        if (words) this._insertSpoken(words);
        if (done) { rec.stop(); this.make(); return; }
      }
      $('point-hint').textContent = interim ? `🎤 …${interim.trim()}` : 'Say what it should do';
    };
    this.stopListening = () => this.listening && rec.stop();
  }

  _insertSpoken(words) {
    const r = this._range();
    const pre = document.createRange();
    pre.selectNodeContents($('composer'));
    pre.setEnd(r.startContainer, r.startOffset);
    const before = pre.toString();
    if (!before.trim() || /[.!?]\s*$/.test(before)) words = words[0].toUpperCase() + words.slice(1);
    this._insertText((before && !/\s$/.test(before) ? ' ' : '') + words + ' ');
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
      // Enter sends; Shift+Enter starts a new line; Enter that finishes an IME word doesn't send
      if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
      ev.preventDefault();
      if (!$('btn-make').disabled) this.make();
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
    return out.replace(/ /g, ' ');
  }

  // ---- making behaviors -------------------------------------------------------

  async make() {
    const a = this.selected;
    const text = this.serialize().trim();
    if (!a || !text) return;
    this.stopListening?.();
    const btn = $('btn-make');
    btn.disabled = true;
    btn.title = 'Generating…';
    $('point-hint').textContent = 'Generating…';
    try {
      const here = a.position;
      const things = [...this.world.things().entries()]
        .filter(([id]) => id !== a.key)
        .map(([id]) => ({ ...this.world.actor(id).describe(), id, distance: Math.round(this.world.thingCenter(id).distanceTo(here)) }))
        .sort((x, y) => x.distance - y.distance);
      const behaviors = this.stage.behaviorsOf(a.key);
      const named = findNamedBehaviors(text, behaviors);
      const res = await generateBehavior({
        text, model: describeTarget(a), things,
        otherBehaviors: behaviors.filter((b) => b.enabled && !named.includes(b)).flatMap((b) => b.summary ?? []),
        named: named.map((b) => ({ title: b.title, summary: b.summary, code: b.code })),
      });
      if (!res.code.trim()) {
        this.log(`I couldn't turn that into a program${res.unknown?.length ? `: I didn't understand “${res.unknown.join('”, “')}”` : ''}.`, 'error');
        return;
      }
      if (!a.alive) return;
      const target = res.modifies && named.find((b) => b.title === res.modifies && behaviors.includes(b));
      if (target) this._changeBehavior(a, target, { text, html: $('composer').innerHTML, ...res });
      else this._addBehavior(a, { text, html: $('composer').innerHTML, ...res });
      $('composer').innerHTML = '';
      this.savedRange = null;
      this.setPointing(false);
    } finally {
      btn.disabled = false;
      btn.title = 'Generate (Enter)';
      if ($('point-hint').textContent === 'Generating…') $('point-hint').textContent = '';
    }
  }

  _addBehavior(a, b) {
    const behavior = makeBehavior({
      ...b,
      notes: [b.notes, b.unknown?.length ? `I didn't understand: “${b.unknown.join('”, “')}”` : ''].filter(Boolean).join(' '),
    });
    this.stage.behaviorsOf(a.key).push(behavior);
    if (behavior.notes) this.log(`${behavior.title}: ${behavior.notes}`);
    this.runtime.start(a, behavior);
    this.renderBehaviors();
  }

  // A request that named an existing behavior and asked to change it: swap in
  // the new program on the same card, keeping its place in the list.
  _changeBehavior(a, b, res) {
    const fresh = makeBehavior({ ...res, title: res.title || b.title });
    Object.assign(b, {
      code: fresh.code, title: fresh.title, summary: fresh.summary, keys: fresh.keys, notes: fresh.notes, source: fresh.source,
      text: res.text, html: res.html, enabled: true, collapsed: false, draft: null, changedAt: performance.now(),
    });
    this.log(`Changed “${b.title}”${b.notes ? `: ${b.notes}` : ''}`);
    this._restart(a, b);
    this.renderBehaviors();
    $('behaviors').querySelector(`[data-bid="${b.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  _restart(a, b) {
    for (const p of [...this.runtime.programs]) if (p.behavior === b) p.stop();
    this.runtime.resetControls(a);
    if (a.isWorld && !b.enabled && /\bgravity\(/.test(b.code)) this.world.setGravity(1); // switching a gravity rule off
    if (b.enabled) this.runtime.start(a, b);
  }

  renderBehaviors() {
    const a = this.selected;
    const list = $('behaviors');
    this.renderPad();
    this.renderWorldCount();
    if (!a) return;
    list.innerHTML = '';
    const behaviors = this.stage.behaviorsOf(a.key);
    $('behavior-count').textContent = behaviors.length ? `(${behaviors.length})` : '(none yet)';
    for (const b of behaviors) {
      const card = document.createElement('div');
      card.className = `behavior ${b.enabled ? '' : 'off'} ${b.running ? 'running' : ''}`;
      card.dataset.bid = b.id;
      card.innerHTML = `
        <div class="b-head">
          <button class="fold" title="${b.collapsed ? 'Show the blocks' : 'Fold it up'}" aria-expanded="${!b.collapsed}">${ICON.chevron}</button>
          <div class="b-title">${esc(b.title)}</div>
          <button class="switch ${b.enabled ? 'on' : ''}" role="switch" aria-checked="${b.enabled}" title="Turn this behavior on or off">
            <span class="sw-label">${b.enabled ? 'On' : 'Off'}</span><span class="sw-track"><span class="sw-knob"></span></span>
          </button>
        </div>
        ${b.collapsed ? '' : `<div class="b-body">
          ${b.showCode ? `<div class="code-edit"><pre aria-hidden="true">${highlight(b.draft ?? b.code)}</pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code for ${esc(b.title)}">${esc(b.draft ?? b.code)}</textarea></div>` : this._blocksFor(b)}
          <div class="b-foot">
            <button class="code" title="${b.showCode ? 'Back to the blocks' : 'See the JavaScript'}">${ICON.code}${b.showCode ? 'View blocks' : 'View code'}</button>
            <span class="grow"></span>
            ${b.showCode ? `<button class="run" title="Run your changes to the code (${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'}+Enter)" ${b.draft == null ? 'disabled' : ''}>${ICON.play}Run</button>` : ''}
            <button class="del" title="Forget this behavior">${ICON.trash}Delete</button>
          </div>
        </div>`}`;
      card.classList.toggle('collapsed', !!b.collapsed);
      const sinceChange = performance.now() - (b.changedAt ?? -1e9);
      if (sinceChange < 1200) { // flash a card that was just changed, picking up where a re-render left off
        card.classList.add('changed');
        card.style.animationDelay = `${-sinceChange}ms`;
      }
      const fold = () => { b.collapsed = !b.collapsed; this.renderBehaviors(); };
      card.querySelector('.fold').onclick = fold;
      card.querySelector('.b-title').onclick = fold;
      card.querySelector('.switch').onclick = () => { b.enabled = !b.enabled; this._restart(a, b); this.renderBehaviors(); };
      if (b.collapsed) { list.appendChild(card); continue; }
      card.querySelector('.code').onclick = () => { b.showCode = !b.showCode; this.renderBehaviors(); };
      card.querySelector('.del').onclick = () => {
        b.enabled = false;
        this._restart(a, b);
        behaviors.splice(behaviors.indexOf(b), 1);
        this.renderBehaviors();
      };
      const ta = card.querySelector('.code-edit textarea');
      if (ta) {
        const layer = card.querySelector('.code-edit pre');
        const run = card.querySelector('.run');
        const lines = ta.value.split('\n').length;
        ta.parentElement.style.height = `${Math.round(Math.min(Math.max(lines * 20 + 24, 240), innerHeight * 0.6))}px`; // fit the code
        ta.oninput = () => {
          layer.innerHTML = highlight(ta.value);
          b.draft = ta.value === b.code ? null : ta.value; // kept across re-renders until it runs
          run.disabled = b.draft == null;
        };
        ta.onscroll = () => { layer.scrollTop = ta.scrollTop; layer.scrollLeft = ta.scrollLeft; };
        ta.onkeydown = (ev) => {
          if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); if (!run.disabled) run.click(); return; }
          if (ev.key !== 'Tab' || ev.shiftKey) return; // Tab indents instead of leaving the box
          ev.preventDefault();
          document.execCommand('insertText', false, '  ');
        };
      }
      if (card.querySelector('.run')) card.querySelector('.run').onclick = () => {
        const code = card.querySelector('textarea').value;
        if (code === b.code) return;
        const err = syntaxError(code);
        if (err) { this.log(`That code has a typo: ${err}`, 'error'); return; }
        b.code = code;
        b.draft = null;
        b.keys = null; // the labels may not fit the new code
        b.source = 'edited';
        b.enabled = true;
        this._restart(a, b);
        this.renderBehaviors();
      };
      list.appendChild(card);
    }
  }

  // ---- key pad ------------------------------------------------------------------

  // A button for every key the selected thing's behaviors listen to. Holding
  // a button is the same as holding the key.
  renderPad() {
    const pad = $('pad');
    const labels = {};
    for (const b of this.selected ? this.stage.behaviorsOf(this.selected.key) : []) {
      if (!b.enabled) continue;
      if (b._keyLabels?.code !== b.code) b._keyLabels = { code: b.code, labels: keyLabels(b.code) };
      const read = b._keyLabels.labels;
      for (const k of Object.keys(read)) {
        const l = b.keys?.[k] ?? read[k];
        labels[k] = labels[k] && labels[k] !== l ? `${labels[k]} · ${l}` : l;
      }
    }
    const html = padHtml(padGroups(labels));
    if (html === this._padHtml) return; // don't rebuild under a finger that's holding a button
    this._padHtml = html;
    for (const k of [...this.runtime.heldKeys]) this.runtime.keyUp(k);
    pad.innerHTML = html;
    pad.classList.toggle('hidden', !html);
    for (const btn of pad.querySelectorAll('.pad-key')) {
      const key = btn.dataset.key;
      const up = () => { btn.classList.remove('down'); this.runtime.keyUp(key); };
      btn.onpointerdown = (ev) => {
        ev.preventDefault();
        btn.setPointerCapture(ev.pointerId);
        btn.classList.add('down');
        this.runtime.keyDown(key);
      };
      btn.onpointerup = up;
      btn.onpointercancel = up;
      btn.onlostpointercapture = up;
    }
  }

  _padShowKey(key, down) {
    for (const btn of $('pad').querySelectorAll('.pad-key')) if (btn.dataset.key === key) btn.classList.toggle('down', down);
  }

  _blocksFor(b) {
    if (b._blocks?.code !== b.code) {
      const things = this.world.things();
      const thingName = (id) => (things.has(id) ? this.world.actor(id).name : null);
      b._blocks = { code: b.code, html: renderBlocks(b.code, { thingName }) };
    }
    return b._blocks.html;
  }

  // Light up the blocks the selected thing's programs are running right now
  // (or ran in the last moment, so quick blocks still flash).
  _lightBlocks() {
    const a = this.selected;
    if (!a) return;
    const now = performance.now();
    const programs = [...this.runtime.programs].filter((p) => p.actor === a);
    for (const card of $('behaviors').children) {
      const p = programs.find((x) => x.behavior.id === +card.dataset.bid);
      for (const el of card.querySelectorAll('[data-at]')) {
        const id = +el.dataset.at;
        el.classList.toggle('lit', !!p && (p.live.has(id) || now - (p.lastSeen.get(id) ?? -1e9) < 400));
      }
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
      return a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
    };
    const norm = (k) => (k.length === 1 ? k.toLowerCase() : k);
    addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { this.setPointing(false); return; }
      if (typing() || ev.metaKey || ev.ctrlKey) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) ev.preventDefault();
      this.runtime.keyDown(norm(ev.key));
      this._padShowKey(norm(ev.key), true);
    });
    addEventListener('keyup', (ev) => { this.runtime.keyUp(norm(ev.key)); this._padShowKey(norm(ev.key), false); });
    addEventListener('blur', () => { for (const k of [...this.runtime.heldKeys]) this.runtime.keyUp(k); });
  }

  // ---- bubbles, log, per-frame --------------------------------------------------

  say(actor, text, seconds) {
    let b = this.bubbles.get(actor);
    if (!b) {
      const el = document.createElement('div');
      el.className = actor.isWorld ? 'banner' : 'bubble';
      $('bubbles').appendChild(el);
      b = { el };
      this.bubbles.set(actor, b);
    }
    b.el.textContent = text;
    b.until = performance.now() + seconds * 1000;
  }

  // The program log folds down to a round button in the corner while it's not in use.
  setConsole(open) {
    $('console').classList.toggle('collapsed', !open);
    if (open) { this.unread = 0; $('console-badge').textContent = ''; }
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
      if (level === 'error') this.setConsole(true);
      else { this.unread++; $('console-badge').textContent = this.unread; }
    }
  }

  _screen(pos) {
    const v = pos.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }

  update() {
    if (this.drag) { this._holdDrag(); this.world.sync(); }
    this._lightBlocks();
    const a = this.selected;
    if (a && !a.alive) this.select(null);
    this.ring.visible = false;
    this.selBox.visible = false;
    this.aim.visible = false;
    if (this.selected && !this.selected.isWorld) {
      if (this.selected.usesOwnYaw) {
        const s = this.selected, c = s.position, box = s.bounds(true); // precise, or a rolled ball's box dips below the ground
        const reach = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
        const f = s.forward();
        this.aim.position.set(c.x + f.x * (reach + 0.3), box.min.y + 0.06, c.z + f.z * (reach + 0.3));
        this.aim.rotation.y = s.heading() * DEG;
        this.aim.visible = true;
      }
      const p = this.selected.position;
      if (this.selected.model) {
        this.ring.visible = true;
        this.ring.position.set(p.x, 0.07, p.z); // above roads and ponds
      } else {
        this.selBox.box.copy(this.selected.bounds()).expandByScalar(0.15);
        this.selBox.visible = true;
      }
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
    for (const [actor, b] of this.bubbles) {
      if (now > b.until || !actor.alive) { b.el.remove(); this.bubbles.delete(actor); continue; }
      if (actor.isWorld) continue; // the World's words are a banner at the top
      const top = actor.bounds().max.y;
      const s = this._screen(actor.position.setY(top + 1));
      b.el.style.display = s ? '' : 'none';
      if (s) { b.el.style.left = `${s.x}px`; b.el.style.top = `${s.y}px`; }
    }
  }
}

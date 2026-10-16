// The kid-facing UI: picking worlds, selecting things (a model, a whole
// assembly, one brick of it, or the World), dragging them around, the
// sentence composer with pointing, behavior cards, speech bubbles, the log.
import * as THREE from 'three';
import { LIBRARY, LIBRARY_BY_ID, CATEGORIES, modelBottom } from '../world/library.js';
import { WORLDS } from '../world/worlds.js';
import { colorHex } from '../world/bricks.js';
import { generateBehavior, findNamedBehaviors, probeClaude } from '../behavior/generate.js';
import { renderBlocks } from './blocks.js';
import { highlight } from './highlight.js';
import { keyLabels, padGroups, padHtml } from './pad.js';
import { describeTarget, applyTheme } from '../stage.js';
import { dragBase, holdDrag } from '../world/drag.js';
import { worldMessages } from '../behavior/messages.js';
import { NO_ROOM_KEY } from '../net/session.js';

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
    this.seen = new Map(); // actor -> {el, until}: what see() looked at, above its speech bubble
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
    this.readOnly = false; // looking at a thing another player is using
    this.marks = new Map(); // player id -> {box, tag}: what other players have selected
    this.sheet = new Sheet(this); // on phones the inspector is a sheet at the bottom
  }

  // session: the LocalSession (single player) or NetSession (a room); view: the lights and camera, for themes
  attach({ session, view }) { this.session = session; this.view = view; }
  get net() { return this.session.mode === 'net'; }

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
    if (this.net) { $('btn-pause').classList.add('hidden'); this.log(`🔗 Joining room “${this.session.room}”…`); }
    try { // back from a room that had no server
      if (sessionStorage.getItem(NO_ROOM_KEY)) { sessionStorage.removeItem(NO_ROOM_KEY); this.toast("Couldn't reach a room server, so you're playing alone"); this.log('🔗 Playing together needs the sim server (npm run sim). This page has none, so it runs alone.'); }
    } catch { /* storage blocked */ }
    this.sheet.boot();
    this.session.start(location.hash.slice(1) || 'playground');
  }

  setLibrary(open) {
    $('library').classList.toggle('hidden', !open);
    $('btn-library').classList.toggle('on', open);
    $('btn-library').setAttribute('aria-expanded', String(open));
  }

  setFollow(on) {
    this.follow = on;
    $('btn-follow').classList.toggle('on', on);
    $('btn-follow').setAttribute('aria-pressed', String(on));
    $('btn-follow-m').setAttribute('aria-checked', String(on));
  }

  // The World button shows how many behaviors the World has.
  renderWorldCount() {
    const n = this.session ? this.session.behaviorsOf('world').length : 0;
    $('world-count').textContent = n || ''; // no badge when the World has no behaviors
    $('btn-world').title = `World rules (${n === 1 ? '1 behavior' : `${n} behaviors`}): teach the World itself (gravity, dropping and copying things), or click the ground`;
  }

  loadWorld(id) {
    this.select(null);
    this.session.loadWorld(id);
  }

  // The session loaded (or reloaded) a world: a new one, or Reset in a room.
  onWorldLoaded() {
    const { session } = this;
    const preset = session.preset;
    this.select(null);
    if (this.net) this.applyTheme(preset);
    $('world-select').value = session.worldId;
    if (location.hash.slice(1) !== session.worldId) history.replaceState(null, '', `#${session.worldId}`);
    for (const b of this.bubbles.values()) b.el.remove();
    this.bubbles.clear();
    this.select(this.world.actor(preset.select));
    this.setFollow(!!preset.follow); // off, unless the world starts following its player (MEGA GOLF)
    this.log(`${preset.emoji} ${preset.name}: ${preset.blurb}`);
    this.renderPlayers();
  }

  // In a room the Stage lives on the server; the page sets the look itself.
  applyTheme(preset) {
    if (!this.view) return;
    applyTheme(this.view, this.world, preset.theme);
    const { pos, target } = preset.camera;
    this.camera.position.set(...pos);
    this.controls.target.set(...target);
    this.controls.update();
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
        b.onclick = () => { this.addModel(def.id); this.setLibrary(false); };
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
    this.session.addModel(defId, pose);
  }

  // Something this page asked for (a model, a copy) is in the world: pick it up.
  onMade(key) {
    const a = this.world.actor(key);
    if (a.alive) { this.select(a); this.sheet.open('half'); }
  }

  _wireButtons() {
    $('btn-library').onclick = () => this.setLibrary($('library').classList.contains('hidden'));
    document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => (b.dataset.close === 'library' ? this.setLibrary(false) : $(b.dataset.close).classList.add('hidden')); });
    $('btn-pause').onclick = () => {
      this.world.paused = !this.world.paused;
      $('btn-pause').querySelector('span').textContent = this.world.paused ? 'Resume' : 'Pause';
      $('btn-pause').classList.toggle('paused', this.world.paused);
    };
    $('btn-reset').onclick = () => this.session.reset();
    $('btn-export').onclick = () => this.exportWorld();
    $('btn-world').onclick = () => this.select(this.world.actor('world'));
    $('btn-follow').onclick = () => this.setFollow(!this.follow);
    $('btn-mute').onclick = () => {
      this.audio.muted = !this.audio.muted;
      $('btn-mute').classList.toggle('muted', this.audio.muted);
      $('btn-mute').setAttribute('aria-checked', String(!this.audio.muted));
    };
    $('btn-top-menu').onclick = (ev) => { ev.stopPropagation(); this.setPop('top', $('top-menu').classList.contains('hidden')); };
    $('top-menu').onclick = (ev) => { ev.stopPropagation(); this.setPop('top', false); }; // every item closes it
    $('btn-respawn').onclick = () => { if (this.selected?.model && !this.readOnly) this.session.respawn(this.selected); };
    $('btn-whole').onclick = () => { const e = this.selected?.members[0]; if (e) this.select(this.world.actorOf(e)); };
    $('btn-copy').onclick = () => {
      const a = this.selected;
      if (!a || a.isWorld || this.readOnly) return;
      this.session.clone(a);
    };
    $('btn-turn').onclick = () => {
      const a = this.selected;
      if (!a?.alive || a.isWorld || a.fixed || this.readOnly) return;
      this.session.turn(a);
    };
    $('btn-remove').onclick = () => {
      const a = this.selected;
      if (!a || a.isWorld || this.readOnly) return;
      this.session.remove(a);
      this.select(null);
    };
    $('btn-together').onclick = () => this.playTogether();
    // on phones these three live in the menu instead of the bar
    $('btn-world-m').onclick = () => $('btn-world').click();
    $('btn-reset-m').onclick = () => $('btn-reset').click();
    $('btn-follow-m').onclick = () => $('btn-follow').click();
    $('btn-make').onclick = () => this.make();
    $('btn-point').onclick = () => this.setPointing(!this.pointing);
    $('btn-more').onclick = (ev) => {
      ev.stopPropagation();
      if (this.sheet.state === 'peek') this.sheet.open('half'); // room for the menu below the name
      this.setPop('menu', $('sel-menu').classList.contains('hidden'));
    };
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
    if (actor !== this.selected) { this.stopListening?.(); this.setPointing(false); this.setFollow(false); this.setPop('menu', false); this.setPop('parts', false); }
    this.selected = actor;
    // Another player's thing can be looked at but not used: no lock is asked for.
    const holder = this.session.holderOf(actor?.key);
    this.readOnly = !!holder;
    this.session.select(holder ? null : actor);
    const lock = $('sel-lock');
    lock.classList.toggle('hidden', !holder);
    if (holder) { lock.textContent = `${holder.name} is using this`; lock.style.background = holder.color; }
    $('composer').contentEditable = String(!holder);
    $('btn-make').disabled = !!holder;
    $('btn-more').disabled = !!holder;
    $('selection').classList.toggle('read-only', !!holder);
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
    $('btn-turn').classList.toggle('hidden', actor.isWorld || actor.fixed); // a fixed thing (a playing field) stays put
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
  onThingsChanged() { if (this.selected && !this.selected.alive) this.select(null); }
  onBehaviorsChanged(key) {
    this.renderWorldCount();
    if (this.selected?.key === key) this.onProgramsChanged();
  }

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
      // A second finger while dragging turns the thing (there's no wheel on a phone).
      if (this.drag && ev.pointerId !== this.drag.pointerId) {
        ev.stopPropagation();
        this.drag.twist = { id: ev.pointerId, x: ev.clientX };
        return;
      }
      down = { x: ev.clientX, y: ev.clientY, alt: ev.altKey };
      this._pressStart(ev);
      if (ev.button !== 0 || this.pointing || ev.altKey || !this.selected || this.selected.isWorld || this.selected.fixed || this.readOnly) return;
      const hit = this._pick(ev);
      if (hit?.entity && this.selected.has(hit.entity)) {
        ev.stopPropagation();
        this._pressCancel();
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
      if (this.drag) {
        if (this.drag.twist && ev.pointerId === this.drag.twist.id) { this.drag.yaw += (ev.clientX - this.drag.twist.x) * 0.5; this.drag.twist.x = ev.clientX; return; }
        if (ev.pointerId === this.drag.pointerId) this._moveDrag(ev);
        return;
      }
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 8) this._pressCancel();
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
      if (this.drag?.twist && ev.pointerId === this.drag.twist.id) { this.drag.twist = null; return; }
      const wasDrag = this.drag;
      if (wasDrag) this._endDrag();
      const pressed = this._pressCancel();
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      const alt = down.alt || ev.altKey;
      down = null;
      if (pressed) return; // the press already picked one brick
      if (moved > 5 || ev.button !== 0 || (ev.target !== el && !wasDrag)) return;
      const hit = this._pick(ev);
      if (this.pointing || alt) {
        if (hit && this.selected) this.insertChip(this._describeHit(hit).chip);
        return;
      }
      this._click(hit);
    });
    el.addEventListener('dblclick', (ev) => this._pickOne(this._pick(ev)));
  }

  // One brick out of an assembly (a double-click, or a press on a phone).
  _pickOne(hit) {
    if (!hit?.entity || hit.entity.kind === 'model') return;
    const whole = this.world.actorOf(hit.entity);
    if (whole.members.length > 1) { this.select(this.world.actor(hit.entity.id)); this.sheet.open('half'); }
  }

  // Pressing and holding on a touch screen picks one brick, like a double-click.
  _pressStart(ev) {
    this._pressCancel();
    if (ev.pointerType !== 'touch' || this.pointing) return;
    const at = { clientX: ev.clientX, clientY: ev.clientY };
    this._press = setTimeout(() => {
      this._press = null;
      const hit = this._pick(at);
      if (!hit?.entity || hit.entity.kind === 'model' || this.world.actorOf(hit.entity).members.length < 2) return;
      this._pressed = true;
      navigator.vibrate?.(15);
      this._pickOne(hit);
    }, 500);
  }
  _pressCancel() {
    clearTimeout(this._press);
    this._press = null;
    const was = this._pressed;
    this._pressed = false;
    return was;
  }

  _click(hit) {
    if (!hit) { this.select(null); this.sheet.open('peek'); return; }
    if (hit.ground) {
      const w = this.world.actor('world');
      this.select(w);
      this.sheet.open('half');
      return;
    }
    const whole = this.world.actorOf(hit.entity);
    const piece = this.world.actor(hit.entity.id);
    // keep a picked-out brick selected when it's the one clicked
    this.select(this.selected === piece ? piece : whole);
    this.sheet.open('half');
  }

  _startDrag(hit, ev) {
    const a = this.selected;
    this.controls.enabled = false;
    const pivot = a.position;
    this.world.refreshQueries?.(); // a mirror's shape casts only see where things were last stepped
    this.drag = {
      actor: a, pivot, yaw: 0, delta: new THREE.Vector3(), pointerId: ev.pointerId, twist: null,
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y),
      start: hit.point.clone(),
      base: dragBase(a),
      moved: false, frames: 0,
    };
    // Its footprint and bottom, for riding up over whatever it's dragged onto.
    const box = a.bounds(true);
    const c = box.getCenter(new THREE.Vector3());
    this.drag.foot = { minY: box.min.y, cx: c.x, cz: c.z, hx: (box.max.x - box.min.x) / 2, hz: (box.max.z - box.min.z) / 2 };
    this.drag.own = new Set();
    for (const { body } of this.drag.base) for (let i = 0; i < body.numColliders(); i++) this.drag.own.add(body.collider(i).handle);
    this.renderer.domElement.style.cursor = 'grabbing';
    this.session.dragStart(this.drag);
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

  // Lift the dragged thing up through anything under it, so it rides on top
  // and lands there when dropped: drop its footprint straight down from high
  // above, through everything but itself, and stand it on the first thing hit.
  // It is only ever raised, so floating things (coins, clouds) stay up.
  _liftOver(d) {
    const { R, physics } = this.world;
    const f = d.foot;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw * DEG);
    const at = new THREE.Vector3(f.cx, 0, f.cz).sub(d.pivot).applyQuaternion(q).add(d.pivot);
    const cos = Math.abs(Math.cos(d.yaw * DEG)), sin = Math.abs(Math.sin(d.yaw * DEG));
    const hx = Math.max(0.05, (cos * f.hx + sin * f.hz) * 0.95), hz = Math.max(0.05, (sin * f.hx + cos * f.hz) * 0.95);
    const from = 300;
    if (this.world.mirror && d.frames++ % 10 === 0) this.world.refreshQueries();
    const hit = physics.castShape(
      { x: at.x + d.delta.x, y: from, z: at.z + d.delta.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 },
      new R.Cuboid(hx, 0.05, hz), 0, from + 50, false, R.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined, undefined, undefined, (col) => !d.own.has(col.handle),
    );
    const surface = hit ? from - hit.time_of_impact - 0.05 : 0;
    d.delta.y = Math.max(0, surface + 0.02 - f.minY);
  }

  // Hold the dragged thing where the pointer is (every frame, against gravity).
  _holdDrag(d = this.drag, lift = 0.4) { holdDrag(d, lift); }

  _endDrag() {
    const d = this.drag;
    this.drag = null;
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = '';
    // Single player: put it back where it was, then apply the move for real so
    // it's remembered for Reset. In a room: tell the server, which does that.
    this.session.dragEnd(d);
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
      this._showInterim('');
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
        this._showInterim(''); // the final words take the place of the guess
        if (words) this._insertSpoken(words);
        if (done) { rec.stop(); this.make(); return; }
      }
      this._showInterim(interim.trim());
    };
    this.stopListening = () => this.listening && rec.stop();
  }

  // What the recognizer has heard so far, shown greyed at the cursor in the
  // box until it settles on the final words. Never part of what's sent.
  _showInterim(text) {
    let el = this.interimEl;
    if (!text) { el?.remove(); this.interimEl = null; return; }
    if (!el?.isConnected) {
      el = this.interimEl = document.createElement('span');
      el.className = 'interim';
      el.contentEditable = 'false';
      this._insertNode(el);
    }
    const r = document.createRange();
    r.selectNodeContents($('composer'));
    r.setEndBefore(el);
    const before = r.toString();
    el.textContent = (before && !/\s$/.test(before) ? ' ' : '') + text;
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
      else if (n.classList?.contains('interim')) continue; // words still being heard
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
      const behaviors = this.session.behaviorsOf(a.key);
      const named = findNamedBehaviors(text, behaviors);
      const res = await generateBehavior({
        text, model: describeTarget(a), things,
        otherBehaviors: behaviors.filter((b) => b.enabled && !named.includes(b)).flatMap((b) => b.summary ?? []),
        named: named.map((b) => ({ title: b.title, summary: b.summary, code: b.code })),
        // the messages things already send and listen for, so this one can join in
        messages: worldMessages(this.session.behaviorMap(), (k) => {
          const name = k === 'world' ? 'the World' : this.world.actor(k).describe().name;
          return k === a.key ? `${name} (this thing)` : name;
        }),
      });
      if (!res.code.trim()) {
        this.log(`I couldn't turn that into a program${res.unknown?.length ? `: I didn't understand “${res.unknown.join('”, “')}”` : ''}.`, 'error');
        return;
      }
      if (!a.alive) return;
      const target = res.modifies && named.find((b) => b.title === res.modifies && behaviors.includes(b));
      try {
        if (target) this.session.change(a, target, { text, html: $('composer').innerHTML, ...res });
        else this.session.teach(a, { text, html: $('composer').innerHTML, ...res });
      } catch (err) { this.log(err.message, 'error'); return; }
      this.renderBehaviors();
      if (target) $('behaviors').querySelector(`[data-bid="${target.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      $('composer').innerHTML = '';
      this.savedRange = null;
      this.setPointing(false);
    } finally {
      btn.disabled = false;
      btn.title = 'Generate (Enter)';
      if ($('point-hint').textContent === 'Generating…') $('point-hint').textContent = '';
    }
  }

  renderBehaviors() {
    const a = this.selected;
    const list = $('behaviors');
    this.renderPad();
    this.renderWorldCount();
    if (!a) return;
    list.innerHTML = '';
    const behaviors = this.session.behaviorsOf(a.key);
    const ro = this.readOnly;
    $('behavior-count').textContent = behaviors.length ? `(${behaviors.length})` : '(none yet)';
    for (const b of behaviors) {
      const card = document.createElement('div');
      card.className = `behavior ${b.enabled ? '' : 'off'} ${b.running ? 'running' : ''}`;
      card.dataset.bid = b.id;
      const by = this.net && b.by && b.by !== this.session.me.id ? this.session.players.find((p) => p.id === b.by) : null;
      card.innerHTML = `
        <div class="b-head">
          <button class="fold" title="${b.collapsed ? 'Show the blocks' : 'Fold it up'}" aria-expanded="${!b.collapsed}">${ICON.chevron}</button>
          <div class="b-title">${esc(b.title)}${by ? `<span class="by" style="color:${by.color}" title="Taught by ${esc(by.name)}">${esc(by.name)}</span>` : ''}</div>
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
      card.querySelector('.switch').onclick = () => { if (ro) return; this.session.setEnabled(a, b, !b.enabled); this.renderBehaviors(); };
      if (b.collapsed) { list.appendChild(card); continue; }
      card.querySelector('.bk-scripts')?.addEventListener('click', (ev) => {
        const script = ev.target.closest('.bk-script');
        const at = script?.querySelector('[data-at]')?.dataset.at;
        if (at != null) this.runScript(a, b, Number(at), script);
      });
      card.querySelector('.code').onclick = () => { b.showCode = !b.showCode; this.renderBehaviors(); };
      card.querySelector('.del').onclick = () => {
        if (ro) return;
        this.session.deleteBehavior(a, b);
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
        if (code === b.code || ro) return;
        try { this.session.editCode(a, b, code); } catch (err) { this.log(err.message, 'error'); return; }
        this.renderBehaviors();
      };
      list.appendChild(card);
    }
  }

  // Clicking a stack of blocks runs it once, like in Scratch: the behavior's
  // program fires that script's handler (a key, a message, a "define"...).
  runScript(a, b, at, el) {
    if (this.readOnly) { this._nope(el); return; }
    if (!this.session.runScript(a, b, at)) { this.log(`“${b.title}” is switched off. Turn it on to run its blocks.`); this._nope(el); }
  }

  onScriptRan(b, at, ok, off) {
    if (off) this.log(`“${b.title}” is switched off. Turn it on to run its blocks.`);
    if (ok) return;
    const el = $('behaviors').querySelector(`[data-bid="${b.id}"] .bk-script [data-at="${at}"]`)?.closest('.bk-script');
    this._nope(el);
  }

  _nope(el) { // a quick shake: there's nothing in this stack to run
    if (!el) return;
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
  }

  // ---- key pad ------------------------------------------------------------------

  // A button for every key the selected thing's behaviors listen to. Holding
  // a button is the same as holding the key.
  renderPad() {
    const pad = $('pad');
    const labels = {};
    for (const b of this.selected && !this.readOnly ? this.session.behaviorsOf(this.selected.key) : []) {
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
    for (const k of [...this.session.heldKeys]) this.session.keyUp(k);
    pad.innerHTML = html;
    pad.classList.toggle('hidden', !html);
    this._watchPad();
    for (const btn of pad.querySelectorAll('.pad-key')) {
      const key = btn.dataset.key;
      const up = () => { btn.classList.remove('down'); this.session.keyUp(key); };
      btn.onpointerdown = (ev) => {
        ev.preventDefault();
        btn.setPointerCapture(ev.pointerId);
        btn.classList.add('down');
        this.session.keyDown(key);
      };
      btn.onpointerup = up;
      btn.onpointercancel = up;
      btn.onlostpointercapture = up;
    }
  }

  _padShowKey(key, down) {
    for (const btn of $('pad').querySelectorAll('.pad-key')) if (btn.dataset.key === key) btn.classList.toggle('down', down);
  }

  // With many keys the groups wrap into a second row and the pad hides a lot
  // of the scene on a phone, so then the keys shrink (.dense) to fit in one
  // row more often. Re-fit whenever the pad's size changes: new keys, a turn
  // of the phone, or coming back from behind the full sheet or the library.
  _watchPad() {
    if (this._padWatch) return;
    const pad = $('pad');
    // fit on the next frame: changing the pad's size inside the observer's own callback would be a reported loop
    this._padWatch = new ResizeObserver(() => { cancelAnimationFrame(this._padFit); this._padFit = requestAnimationFrame(() => this._fitPad()); });
    this._padWatch.observe(pad);
  }
  _fitPad() {
    const pad = $('pad');
    pad.classList.remove('dense');
    const bottoms = new Set([...pad.children].map((g) => Math.round(g.getBoundingClientRect().bottom)));
    pad.classList.toggle('dense', bottoms.size > 1); // groups on one row (align-items: flex-end) share a bottom edge
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
    const behaviors = this.session.behaviorsOf(a.key);
    for (const card of $('behaviors').children) {
      const b = behaviors.find((x) => x.id === +card.dataset.bid);
      const t = b && this.session.traceOf(a, b);
      for (const el of card.querySelectorAll('[data-at]')) {
        const id = +el.dataset.at;
        el.classList.toggle('lit', !!t && (t.live.has(id) || now - (t.lastSeen.get(id) ?? -1e9) < 400));
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
      this.session.keyDown(norm(ev.key));
      this._padShowKey(norm(ev.key), true);
    });
    addEventListener('keyup', (ev) => { this.session.keyUp(norm(ev.key)); this._padShowKey(norm(ev.key), false); });
    addEventListener('blur', () => { for (const k of [...this.session.heldKeys]) this.session.keyUp(k); });
  }

  // ---- eyes -----------------------------------------------------------------------

  // A picture of what's straight ahead of a thing, from about where its eyes
  // are, as base64 JPEG (for see()). It renders one frame from there with the
  // thing itself and the selection marks hidden, shrinks it to 512 wide, then
  // draws the normal view again straight away, so nothing flickers.
  snapshot(actor) {
    const box = actor.bounds();
    const f = actor.forward();
    // from its middle (it's hidden in the picture), so a thing right in
    // front of it fits in the frame instead of filling it
    const eye = box.getCenter(new THREE.Vector3());
    eye.y = box.min.y + (box.max.y - box.min.y) * 0.8;
    const cam = new THREE.PerspectiveCamera(75, this.camera.aspect, 0.1, 300);
    cam.position.copy(eye);
    cam.lookAt(eye.clone().add(f.clone().multiplyScalar(10)).add(new THREE.Vector3(0, -1.5, 0))); // a little downward
    const hidden = [this.ring, this.selBox, this.aim, this.hoverBox, ...actor.members.flatMap((e) => e.bodies.map((b) => b.object3d))]
      .filter((o) => o?.visible);
    for (const o of hidden) o.visible = false;
    let data = null;
    try {
      this.renderer.render(this.scene, cam);
      const src = this.renderer.domElement;
      const out = document.createElement('canvas');
      out.width = 512;
      out.height = Math.round(512 * src.height / src.width);
      out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
      data = out.toDataURL('image/jpeg', 0.85).split(',')[1];
      this.lastSnapshot = data; // handy for checking what a thing saw
    } finally {
      for (const o of hidden) o.visible = true;
      this.renderer.render(this.scene, this.camera);
    }
    return data;
  }

  // Show what a thing's see() looked at: a balloon with the picture and,
  // once Claude answers, the label it chose ("looking…" until then).
  showSeen(actor, image, label) {
    let b = this.seen.get(actor);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'bubble seen';
      el.innerHTML = '<img alt=""><span></span>';
      $('bubbles').appendChild(el);
      b = { el };
      this.seen.set(actor, b);
    }
    b.el.querySelector('img').src = `data:image/jpeg;base64,${image}`;
    b.el.querySelector('img').alt = `What ${actor.describe().name} saw`;
    const cap = b.el.querySelector('span');
    cap.textContent = label == null ? 'looking…' : label;
    b.el.classList.toggle('pending', label == null);
    b.el.classList.toggle('none', label === 'none');
    b.until = performance.now() + (label == null ? 30000 : 4000);
  }

  // ---- export -------------------------------------------------------------------

  // Save the current world as JSON: what it's based on, what was added, moved
  // or deleted, every behavior, and where everything is right now, so it can
  // be turned into a premade world.
  exportWorld() {
    const { session, world } = this;
    const st = session.exportState();
    const round = (v) => Math.round(v * 100) / 100;
    const xyz = (v) => [round(v.x), round(v.y), round(v.z)];
    const things = [...world.things().keys()].map((key) => {
      const a = world.actor(key);
      const d = a.describe();
      const box = a.bounds();
      return {
        key, name: d.name, kind: d.kind, color: d.color, ...(d.type ? { model: d.type } : {}),
        position: xyz(a.position), heading: round(a.heading()), bottom: round(box.min.y),
        ...(a.members.length > 1 ? { bricks: a.members.length } : {}),
      };
    });
    const behaviors = {};
    for (const [key, list] of st.behaviors) {
      if (!list.length) continue;
      behaviors[key] = list.map((b) => ({
        title: b.title, text: b.text, summary: b.summary, code: b.code,
        ...(b.keys && Object.keys(b.keys).length ? { keys: b.keys } : {}),
        ...(b.enabled ? {} : { enabled: false }), source: b.source,
      }));
    }
    const out = {
      format: 'brick-behaviors-world', version: 1, exported: new Date().toISOString(),
      basedOn: session.worldId, name: session.preset.name,
      camera: { pos: xyz(this.camera.position), target: xyz(this.controls.target) },
      gravity: world.gravityScale,
      added: st.added, moved: st.moved, deleted: st.deleted,
      behaviors, things,
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${session.worldId}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.log(`💾 Saved ${a.download}: ${things.length} things, ${Object.values(behaviors).flat().length} behaviors.`);
  }

  // ---- other players --------------------------------------------------------------

  // Start (or share) a room: a short random name in the URL, same world.
  playTogether() {
    const url = new URL(location.href);
    if (!url.searchParams.get('room')) {
      url.searchParams.set('room', Math.random().toString(36).slice(2, 7));
      location.href = url.href; // reload into the room
      return;
    }
    navigator.clipboard?.writeText(url.href).then(() => this.toast('Link copied. Send it to a friend!'), () => this.toast(url.href));
  }

  renderPlayers() {
    const el = $('players');
    if (!this.net) { el.innerHTML = ''; return; }
    const { players, me } = this.session;
    el.innerHTML = players.map((p) => `<span class="player ${p.id === me.id ? 'me' : ''}" style="--c:${esc(p.color)}" data-initial="${esc((p.name[0] ?? '?').toUpperCase())}" title="${p.id === me.id ? 'You: click to change your name' : esc(p.name)}"><span>${esc(p.name)}</span></span>`).join('');
    const mine = el.querySelector('.player.me');
    if (mine) mine.onclick = () => { const name = prompt('What should we call you?', me.name); if (name?.trim()) this.session.rename(name); };
    $('btn-together').classList.toggle('on', true);
    $('btn-together').title = 'Copy the link to this room';
  }

  onPlayers() {
    const before = this._playerIds ?? new Set();
    const now = new Set(this.session.players.map((p) => p.id));
    this._playerIds = now;
    this.renderPlayers();
    for (const id of now) if (!before.has(id) && id !== this.session.me.id && before.size) this.toast(`${this.session.players.find((p) => p.id === id)?.name} joined`);
    for (const id of before) if (!now.has(id)) { this.marks.get(id)?.box.removeFromParent(); this.marks.get(id)?.tag.remove(); this.marks.delete(id); }
    this.renderBehaviors(); // "taught by" labels, and a thing may have been let go
    if (this.selected && this.readOnly && !this.session.holderOf(this.selected.key)) this.select(this.selected); // theirs no more: take it
  }

  onSelected(playerId, key) {
    if (playerId === this.session.me.id) return;
    // The thing I was only looking at is free now: take it.
    if (this.selected && this.readOnly && !this.session.holderOf(this.selected.key)) this.select(this.selected);
    void key;
  }

  onLockDenied(key, name) {
    this.toast(`${name} is using that`);
    if (this.selected?.key === key) this.select(this.selected); // keep looking, read-only now
  }

  onConnection(state, info) {
    const el = $('net-status');
    const msgs = {
      open: null, lost: 'Connection lost. Reconnecting…', failed: 'No room server. Retrying…',
      full: `This room is full (${info} players).`, noRooms: 'The server has no room for another room right now.',
    };
    el.textContent = msgs[state] ?? '';
    el.classList.toggle('hidden', !msgs[state]);
    if (state === 'open') this.toast(`You're in room “${this.session.room}” as ${this.session.me.name}`);
  }

  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  // Colored outlines and name tags on what other players have selected.
  _updateMarks() {
    if (!this.net) return;
    const { players, me } = this.session;
    const seen = new Set();
    for (const p of players) {
      if (p.id === me.id || !p.selection || p.selection === 'world') continue;
      const a = this.world.actor(p.selection);
      if (!a.alive) continue;
      seen.add(p.id);
      let m = this.marks.get(p.id);
      if (!m) {
        const box = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(p.color));
        box.raycast = () => {};
        this.scene.add(box);
        const tag = document.createElement('div');
        tag.className = 'tag';
        $('bubbles').appendChild(tag);
        m = { box, tag };
        this.marks.set(p.id, m);
      }
      m.box.box.copy(a.bounds()).expandByScalar(0.2);
      m.box.visible = true;
      m.tag.textContent = p.name;
      m.tag.style.background = p.color;
      const s = this._screen(a.position.setY(a.bounds().max.y + 0.6));
      m.tag.style.display = s ? '' : 'none';
      if (s) { m.tag.style.left = `${s.x}px`; m.tag.style.top = `${s.y}px`; }
    }
    for (const [id, m] of this.marks) if (!seen.has(id)) { m.box.visible = false; m.tag.style.display = 'none'; }
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
  }

  log(msg, level = 'info') {
    const body = $('console-body');
    const line = document.createElement('div');
    line.className = level;
    line.textContent = msg;
    body.appendChild(line);
    while (body.childNodes.length > 200) body.firstChild.remove();
    body.scrollTop = body.scrollHeight;
    if (level !== 'error') return;
    if (this.sheet.active) this.toast(msg.length > 140 ? `${msg.slice(0, 140)}…` : msg); // no log on a phone: errors pop up
    else if ($('console').classList.contains('collapsed')) this.setConsole(true); // errors open it
  }

  _screen(pos) {
    const v = pos.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }

  update() {
    if (this.drag) { this._liftOver(this.drag); this._holdDrag(); this.world.sync(); }
    this._lightBlocks();
    this._updateMarks();
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
        // at its feet, wherever it stands (a raised green, a plateau); just above roads and ponds on the ground
        const m = this.selected.model;
        const feet = m.chassis.translation().y + modelBottom(m.def); // its colliders' bottom (a held putter hangs lower)
        this.ring.visible = true;
        this.ring.position.set(p.x, Math.max(0.07, feet + 0.07), p.z);
      } else {
        this.selBox.box.copy(this.selected.bounds()).expandByScalar(0.15);
        this.selBox.visible = true;
      }
      // not while dragging: the camera moving under the pointer would push the
      // dragged thing further along, faster and faster
      if (this.follow && !this.drag) {
        const delta = p.clone().sub(this.controls.target);
        delta.y = 0;
        delta.multiplyScalar(0.08);
        this.controls.target.add(delta);
        this.camera.position.add(delta);
      }
    }
    if (this.hoverBox.visible && this.hoverTarget) this.hoverBox.setFromObject(this.hoverTarget);

    const now = performance.now();
    for (const [actor, b] of this.seen) {
      if (now > b.until || !actor.alive) { b.el.remove(); this.seen.delete(actor); continue; }
      const s = this._screen(actor.position.setY(actor.bounds().max.y + 1));
      b.el.style.display = s ? '' : 'none';
      if (s) { b.el.style.left = `${s.x}px`; b.el.style.top = `${s.y}px`; }
    }
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

// On phones the inspector is a sheet at the bottom of the screen with three
// heights: peek (just the name of what's selected), half, and full (for
// typing). Drag the handle, or tap it to toggle; the key pad floats
// above whatever height it has. A keyboard lifts it (--kb) on browsers that
// don't shrink the page for it.
const SHEET_PEEK = 78;
class Sheet {
  constructor(app) {
    this.app = app;
    this.state = 'peek';
    this.media = matchMedia('(max-width: 760px) and (orientation: portrait)'); // the same rule as the stylesheet's
  }
  get active() { return this.media.matches; }
  get el() { return $('inspector'); }

  boot() {
    const handle = $('sheet-handle');
    let start = null;
    handle.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      start = { y: ev.clientY, h: this.el.offsetHeight, moved: false };
      this.el.classList.add('dragging');
    });
    handle.addEventListener('pointermove', (ev) => {
      if (!start) return;
      const h = Math.max(SHEET_PEEK, Math.min(this._px('full'), start.h + (start.y - ev.clientY)));
      if (Math.abs(ev.clientY - start.y) > 6) start.moved = true;
      this.el.style.height = `${h}px`;
      document.documentElement.style.setProperty('--sheet-h', `${h}px`);
    });
    const end = () => {
      if (!start) return;
      const { moved } = start;
      const h = this.el.offsetHeight;
      start = null;
      this.el.classList.remove('dragging');
      this.el.style.height = '';
      if (!moved) { this.open(this.state === 'peek' ? 'half' : this.state === 'half' ? 'full' : 'peek'); return; }
      // snap to the nearest height
      const states = ['peek', 'half', 'full'];
      this.open(states.reduce((best, st) => (Math.abs(this._px(st) - h) < Math.abs(this._px(best) - h) ? st : best), 'half'));
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    // typing wants the whole sheet, and the keyboard out of the way
    $('composer').addEventListener('focus', () => { if (this.active) this.open('full'); });
    $('composer').addEventListener('blur', () => { if (this.active && this.state === 'full') setTimeout(() => { if (document.activeElement !== $('composer')) this.open('half'); }, 150); });
    const vv = window.visualViewport;
    if (vv) {
      const onKb = () => {
        const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
        document.documentElement.style.setProperty('--kb', `${this.active && kb > 80 ? kb : 0}px`);
        this.apply();
      };
      vv.addEventListener('resize', onKb);
      vv.addEventListener('scroll', onKb);
    }
    addEventListener('resize', () => this.apply());
    this.media.addEventListener?.('change', () => this.apply());
    this.apply();
  }

  _px(state) {
    const kb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb')) || 0;
    const h = innerHeight - kb;
    return state === 'peek' ? SHEET_PEEK : state === 'half' ? Math.round(h * 0.5) : Math.round(h * 0.92);
  }

  open(state) {
    if (!this.active) return;
    this.state = state;
    this.apply();
  }

  apply() {
    const root = document.documentElement;
    const on = this.active;
    document.body.classList.toggle('sheet-peek', on && this.state === 'peek');
    document.body.classList.toggle('sheet-half', on && this.state === 'half');
    document.body.classList.toggle('sheet-full', on && this.state === 'full');
    if (!on) { root.style.removeProperty('--sheet-h'); root.style.setProperty('--kb', '0px'); return; }
    root.style.setProperty('--sheet-h', `${this._px(this.state)}px`);
    if (this.state !== 'full') this.el.scrollTop = 0;
  }
}

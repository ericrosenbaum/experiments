// The kid-facing UI: picking worlds, selecting things (a model, a whole
// assembly, one brick of it, or the World), dragging them around, the
// sentence composer with pointing, behavior cards, speech bubbles, the log.
import * as THREE from 'three';
import { LIBRARY, LIBRARY_BY_ID, CATEGORIES } from '../world/library.js';
import { WORLDS } from '../world/worlds.js';
import { colorHex } from '../world/bricks.js';
import { generateBehavior, probeClaude, syntaxError } from '../behavior/generate.js';
import { makeBehavior, describeTarget } from '../stage.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const css = (hex) => '#' + colorHex(hex).toString(16).padStart(6, '0');
const DEG = Math.PI / 180;

const STARTERS = [
  'When I press the up arrow, ', 'When I press space, ', 'Forever, ', 'When it bumps into ',
  'When I click it, ', 'Every 2 seconds, ', 'When it sees ', 'When it hears ',
];
const WORLD_STARTERS = ['At the start, ', 'When I press space, ', 'Every 2 seconds, ', 'When I click the ground, ', 'When it hears '];

const THING_EXAMPLES = {
  tree: ['When I click it, turn orange and say "Autumn!"', 'When I press the up arrow, move forward.', 'When I press c, make a copy of itself.'],
  house: ['When I press the arrows, drive and steer.', 'When I click it, jump high.', 'When I press space, turn around.'],
  castle: ['When I click it, play drum and say "Who goes there?"', 'When I press c, make a copy of itself to the right.', 'When I press space, jump.'],
  coin: ['When it bumps into the hero, play coin and disappear.', 'Forever, turn left.', 'Every 2 seconds, fly up for 1 second then fly down for 1 second.'],
  asteroid: ['Forever, turn left slowly.', 'When it bumps into the spaceship, play crash and disappear.', 'Every 4 seconds, make a copy of itself.'],
  platform: ['Forever, move 6 studs, then move back 6 studs.', 'When it bumps into the hero, fly up for 2 seconds then fly down for 2 seconds.'],
};
const PIECE_EXAMPLES = ['When I click it, jump high and turn red.', 'When I press space, push it up.', 'When I click it, make a copy of itself above.'];
const BRICK_EXAMPLES = ['When I click it, jump high and play boing.', 'When I press the arrows, drive and steer.', 'When I press c, make a copy of itself in front.', 'Every 3 seconds, turn a random color.'];
const WORLD_EXAMPLES = [
  'At the start, turn off gravity.',
  'When I press g, turn gravity back on.',
  'When I press m, make the gravity weak like on the moon.',
  'Every 3 seconds, drop a red brick.',
  'When I press c, make a copy of the race car.',
  'When I click the ground, say "Hello, world!"',
];

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
      const s = $('gen-status');
      s.textContent = ok ? '✨ Claude writes the code' : '🔧 Offline helper writes the code';
      s.title = ok ? 'Descriptions are turned into code by Claude (claude-opus-5-5) on the dev server.'
        : 'No ANTHROPIC_API_KEY on the server, so a simple built-in compiler handles a fixed set of phrases. Start the dev server with a key to use Claude.';
      s.classList.toggle('good', ok);
    });
    this.loadWorld(location.hash.slice(1) || 'playground');
  }

  loadWorld(id) {
    this.select(null);
    this.stage.load(id);
    $('world-select').value = this.stage.worldId;
    if (location.hash.slice(1) !== this.stage.worldId) history.replaceState(null, '', `#${this.stage.worldId}`);
    this.select(this.world.actor(this.stage.preset.select));
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
      $('btn-pause').textContent = this.world.paused ? '▶ Resume' : '⏸ Pause';
      $('btn-pause').classList.toggle('on', this.world.paused);
    };
    $('btn-reset').onclick = () => this.stage.reset();
    $('btn-world').onclick = () => this.select(this.world.actor('world'));
    $('btn-follow').onclick = () => { this.follow = !this.follow; $('btn-follow').classList.toggle('on', this.follow); };
    $('btn-mute').onclick = () => { this.audio.muted = !this.audio.muted; $('btn-mute').textContent = this.audio.muted ? '🔇' : '🔊'; };
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
    this._wireSpeech();
    $('btn-console').onclick = () => {
      $('console').classList.toggle('collapsed');
      this.unread = 0;
      $('console-badge').textContent = '';
    };
  }

  _renderStarters(isWorld) {
    const starters = $('starters');
    starters.innerHTML = '';
    for (const s of isWorld ? WORLD_STARTERS : STARTERS) {
      const b = document.createElement('button');
      b.className = 'starter';
      b.textContent = s.replace(/, $/, '…').replace(/ $/, '…');
      b.onmousedown = (ev) => ev.preventDefault();
      b.onclick = () => this._insertText(s);
      starters.appendChild(b);
    }
  }

  // ---- selection ----------------------------------------------------------------

  select(actor) {
    if (actor && !actor.alive) actor = null;
    if (actor !== this.selected) { this.stopListening?.(); this.setPointing(false); }
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
    const members = actor.members;
    const whole = kind === 'piece' ? this.world.actorOf(members[0]) : null;
    $('sel-kind').textContent = {
      world: 'World rules', model: `Model · ${model?.def.name}`, piece: `One brick of ${whole?.name}`,
      thing: members.length > 1 ? `${members.length} loose bricks` : members[0]?.chassis.isKinematic() ? 'Prop' : `Loose ${members[0]?.kind}`,
    }[kind] ?? '';
    $('sel-blurb').textContent = actor.isWorld
      ? 'Rules for the whole world: gravity, dropping bricks, copying things, and what happens when you click the ground. Only things in the world can move, so the World never drives.'
      : describeTarget(actor).blurb;
    $('sel-hint').innerHTML = actor.isWorld ? 'Click the ground any time to come back here.'
      : `Drag it to move it · scroll while dragging to turn it${kind === 'thing' && members.length > 1 ? ' · <b>double-click</b> one brick to teach just that brick' : ''}`;
    $('btn-respawn').classList.toggle('hidden', !model);
    $('btn-whole').classList.toggle('hidden', kind !== 'piece');
    $('btn-whole').title = whole ? `Back to the whole ${whole.name}` : '';
    for (const id of ['btn-copy', 'btn-turn', 'btn-remove']) $(id).classList.toggle('hidden', actor.isWorld);

    const parts = $('sel-parts');
    parts.innerHTML = '';
    $('parts-section').classList.toggle('hidden', !model?.def.parts.length);
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
    this._renderStarters(actor.isWorld);
    const ex = $('examples');
    ex.innerHTML = '<div class="hint">Try one:</div>';
    const kindOf = members[0]?.kind;
    const examples = actor.isWorld ? WORLD_EXAMPLES : model ? model.def.examples ?? [] : kind === 'piece' ? PIECE_EXAMPLES : THING_EXAMPLES[kindOf] ?? BRICK_EXAMPLES;
    for (const t of examples) {
      const b = document.createElement('button');
      b.className = 'ex';
      b.textContent = `“${t}”`;
      b.onclick = () => { $('composer').textContent = t; this.savedRange = null; };
      ex.appendChild(b);
    }
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
      this.runtime.click(w);
      return;
    }
    const whole = this.world.actorOf(hit.entity);
    const piece = this.world.actor(hit.entity.id);
    // keep a picked-out brick selected when it's the one clicked
    this.select(this.selected === piece ? piece : whole);
    this.runtime.click(whole);
    if (piece !== whole) this.runtime.click(piece);
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
      btn.textContent = '🎤 Listening…';
      $('point-hint').textContent = 'Say what it should do';
    };
    rec.onend = () => {
      this.listening = false;
      btn.classList.remove('on');
      btn.textContent = '🎤 Talk';
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
        const done = /\bmake it so\W*$/i.test(words);
        if (done) words = words.replace(/\W*make it so\W*$/i, '');
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
    btn.textContent = '✨ Thinking…';
    try {
      const here = a.position;
      const things = [...this.world.things().entries()]
        .filter(([id]) => id !== a.key)
        .map(([id]) => ({ ...this.world.actor(id).describe(), id, distance: Math.round(this.world.thingCenter(id).distanceTo(here)) }))
        .sort((x, y) => x.distance - y.distance);
      const res = await generateBehavior({
        text, model: describeTarget(a), things,
        otherBehaviors: this.stage.behaviorsOf(a.key).filter((b) => b.enabled).flatMap((b) => b.summary ?? []),
      });
      if (!res.code.trim()) {
        this.log(`I couldn't turn that into a program${res.unknown?.length ? `: I didn't understand “${res.unknown.join('”, “')}”` : ''}.`, 'error');
        return;
      }
      if (!a.alive) return;
      this._addBehavior(a, { text, html: $('composer').innerHTML, ...res });
      $('composer').innerHTML = '';
      this.savedRange = null;
      this.setPointing(false);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Make it so';
    }
  }

  _addBehavior(a, b) {
    const behavior = makeBehavior({
      ...b,
      notes: [b.notes, b.unknown?.length ? `I didn't understand: “${b.unknown.join('”, “')}”` : ''].filter(Boolean).join(' '),
    });
    this.stage.behaviorsOf(a.key).push(behavior);
    this.runtime.start(a, behavior);
    this.renderBehaviors();
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
    if (!a) return;
    list.innerHTML = '';
    const behaviors = this.stage.behaviorsOf(a.key);
    $('behavior-count').textContent = behaviors.length ? `(${behaviors.length})` : '(nothing yet)';
    $('behaviors-title').textContent = a.isWorld ? 'World rules' : 'What it knows';
    for (const b of behaviors) {
      const card = document.createElement('div');
      card.className = `behavior ${b.enabled ? '' : 'off'} ${b.running ? 'running' : ''}`;
      const by = { claude: 'Claude', premade: 'the world (it came with it)', edited: 'you' }[b.source] ?? 'the offline helper';
      card.innerHTML = `
        <div class="b-head">
          <div class="b-said">${b.html ? sanitizeHtml(b.html) : esc(b.text)}</div>
          <button class="toggle ${b.enabled ? 'on' : ''}" title="Turn this behavior on or off">${b.enabled ? 'ON' : 'OFF'}</button>
          <button class="mini edit" title="Put these words back in the box to change them">✎</button>
          <button class="mini del" title="Forget this behavior">✕</button>
        </div>
        <ul>${b.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        ${b.notes ? `<div class="notes">${esc(b.notes)}</div>` : ''}
        <details><summary>See the code <span class="src">· written by ${by}</span></summary>
          <textarea spellcheck="false">${esc(b.code)}</textarea>
          <button class="mini run">Run edited code</button>
        </details>`;
      card.querySelector('.toggle').onclick = () => { b.enabled = !b.enabled; this._restart(a, b); this.renderBehaviors(); };
      card.querySelector('.del').onclick = () => {
        b.enabled = false;
        this._restart(a, b);
        behaviors.splice(behaviors.indexOf(b), 1);
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
        this._restart(a, b);
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
      return a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
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
    if (this.drag) { this._holdDrag(); this.world.sync(); }
    const a = this.selected;
    if (a && !a.alive) this.select(null);
    this.ring.visible = false;
    this.selBox.visible = false;
    this.aim.visible = false;
    if (this.selected && !this.selected.isWorld) {
      if (this.selected.usesOwnYaw) {
        const s = this.selected, c = s.position, box = s.bounds();
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

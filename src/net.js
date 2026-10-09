// Multiplayer seam. Each player simulates (and is authoritative for) their
// own models; everyone else's models appear as kinematic copies you can bump
// into, see with look()/nearest(), and chase. broadcast() messages, speech
// bubbles and sounds are shared too.
//
// The transport here is BroadcastChannel, so "players" are browser tabs on
// one machine — enough to prototype the interactions. Swapping in a
// WebSocket relay only means replacing `this.channel`.
import { LIBRARY_BY_ID } from './world/library.js';

const SEND_HZ = 15;
const STALE_MS = 3000;

export class Net {
  constructor(world) {
    this.world = world;
    this.player = Math.random().toString(36).slice(2, 8);
    this.peers = new Map(); // player -> lastSeen
    this.remotes = new Map(); // `${player}:${id}` -> {entity, lastSeen, target}
    this.acc = 0;
    try { this.channel = new BroadcastChannel('brick-behaviors'); } catch { this.channel = null; }
    if (this.channel) this.channel.onmessage = (ev) => this._receive(ev.data);
    addEventListener('beforeunload', () => this._send({ t: 'bye' }));
  }

  attach(runtime, app) { this.runtime = runtime; this.app = app; }

  _send(msg) { this.channel?.postMessage({ ...msg, from: this.player }); }

  announce() { this.acc = 1; } // send state on the next frame

  sendMessage(name) { this._send({ t: 'msg', name }); }
  sendSay(entity, text, seconds) { this._send({ t: 'say', id: entity.id, text, seconds }); }
  sendSound(name, pos) { this._send({ t: 'sound', name, pos: [pos.x, pos.y, pos.z] }); }

  update(dt) {
    if (!this.channel) return;
    this.acc += dt;
    if (this.acc >= 1 / SEND_HZ) {
      this.acc = 0;
      const models = [];
      for (const e of this.world.entities.values()) {
        if (e.kind !== 'model' || e.remote || e.removed) continue;
        models.push({
          id: e.id, defId: e.def.id, name: e.name,
          bodies: e.bodies.map(({ body }) => { const t = body.translation(), r = body.rotation(); return [t.x, t.y, t.z, r.x, r.y, r.z, r.w]; }),
        });
      }
      this._send({ t: 'state', models });
    }
    const now = performance.now();
    for (const [key, r] of this.remotes) {
      if (now - r.lastSeen > STALE_MS) { this.world.remove(r.entity); this.remotes.delete(key); continue; }
      r.entity.bodies.forEach(({ body }, i) => {
        const s = r.target[i];
        if (!s) return;
        body.setNextKinematicTranslation({ x: s[0], y: s[1], z: s[2] });
        body.setNextKinematicRotation({ x: s[3], y: s[4], z: s[5], w: s[6] });
      });
    }
    for (const [p, seen] of this.peers) if (now - seen > STALE_MS) this.peers.delete(p);
    const el = document.getElementById('net-status');
    const n = this.peers.size + 1;
    if (el && el.dataset.n !== String(n)) {
      el.dataset.n = n;
      el.textContent = `👥 ${n} player${n === 1 ? '' : 's'}`;
      el.classList.toggle('good', n > 1);
    }
  }

  _receive(m) {
    if (!m || m.from === this.player) return;
    this.peers.set(m.from, performance.now());
    switch (m.t) {
      case 'state': {
        const seen = new Set();
        for (const s of m.models ?? []) {
          const key = `${m.from}:${s.id}`;
          seen.add(key);
          let r = this.remotes.get(key);
          if (!r) {
            const def = LIBRARY_BY_ID[s.defId];
            if (!def) continue;
            const [x, , z] = s.bodies[0];
            const entity = this.world.addModel(def, { x, z, remote: true, name: `Friend's ${s.name}`, id: `r-${key}` });
            r = { entity };
            this.remotes.set(key, r);
          }
          r.lastSeen = performance.now();
          r.target = s.bodies;
        }
        for (const [key, r] of this.remotes) {
          if (key.startsWith(`${m.from}:`) && !seen.has(key)) { this.world.remove(r.entity); this.remotes.delete(key); }
        }
        break;
      }
      case 'msg': this.runtime?.broadcast(String(m.name).slice(0, 40), true); break;
      case 'say': {
        const r = this.remotes.get(`${m.from}:${m.id}`);
        if (r) this.app?.say(r.entity, String(m.text).slice(0, 80), Math.min(10, Number(m.seconds) || 2));
        break;
      }
      case 'sound': this.app?.audio.play(String(m.name), { x: m.pos?.[0] ?? 0, y: m.pos?.[1] ?? 0, z: m.pos?.[2] ?? 0 }); break;
      case 'bye':
        for (const [key, r] of this.remotes) if (key.startsWith(`${m.from}:`)) { this.world.remove(r.entity); this.remotes.delete(key); }
        this.peers.delete(m.from);
        break;
    }
  }
}

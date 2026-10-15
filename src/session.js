// What the page does to the world goes through a session. Single-player, it
// is the Stage and Runtime on this page; in a room it is messages to the
// sim server (src/net/session.js). Both have the same methods, so the UI
// doesn't care which it has.
import * as THREE from 'three';
import { holdDrag } from './world/drag.js';

export class LocalSession {
  constructor({ app, world, stage, runtime }) {
    Object.assign(this, { app, world, stage, runtime });
    this.mode = 'local';
    this.me = { id: 'local', name: 'You', color: '#ffd400' };
    this.players = [];
  }

  get worldId() { return this.stage.worldId; }
  get preset() { return this.stage.preset; }
  get heldKeys() { return this.runtime.heldKeys; }
  get connected() { return true; }

  start(worldId) { this.loadWorld(worldId); }
  loadWorld(id) { this.stage.load(id); this.app.onWorldLoaded(); }
  reset() { this.stage.reset(); }

  select(actor) { this.runtime.setKeyTarget(actor); }
  holderOf() { return null; }
  canEdit() { return true; }

  keyDown(key) { this.runtime.keyDown(key); }
  keyUp(key) { this.runtime.keyUp(key); }

  addModel(defId, pose) { const a = this.stage.addModel(defId, pose); this.app.onMade(a.key, 'model'); }
  clone(actor) { const copy = this.stage.cloneActor(actor, null); if (copy) this.app.onMade(copy.key, 'copy'); }
  remove(actor) { this.stage.removeActor(actor, { forever: true }); }
  turn(actor) { this.stage.turn(actor, 45); }
  respawn(actor) { this.stage.respawn(actor); }

  dragStart() {}
  drag() {}
  // The page held the thing itself; put it back, then apply the move for real.
  dragEnd(d) {
    holdDrag({ ...d, delta: new THREE.Vector3(), yaw: 0 }, 0);
    if (!d.moved && !d.yaw) return;
    this.stage.endDrag(d.actor, d.delta, d.yaw, d.pivot);
  }

  behaviorsOf(key) { return this.stage.behaviorsOf(key); }
  behaviorMap() { return this.stage.state.behaviors; }
  teach(actor, b) { return this.stage.teach(actor, b); }
  change(actor, b, res) { this.stage.changeBehavior(actor, b, res); }
  setEnabled(actor, b, on) { this.stage.setEnabled(actor, b, on); }
  deleteBehavior(actor, b) { this.stage.deleteBehavior(actor, b); }
  editCode(actor, b, code) { this.stage.editCode(actor, b, code); }
  runScript(actor, b, at) {
    const p = this.stage.programOf(actor, b);
    if (!p) return false;
    p.runScript(at);
    return true;
  }
  traceOf(actor, b) {
    const p = this.stage.programOf(actor, b);
    return p ? { live: p.live, lastSeen: p.lastSeen } : null;
  }
  running() { return [...this.runtime.programs].map((p) => `${p.actor.key}:${p.behavior.running ? 'ok' : 'loading'}`); }

  chat() {}
  exportState() { const s = this.stage.state; return { added: s.added, moved: s.moves, deleted: [...s.deleted], behaviors: s.behaviors }; }
}

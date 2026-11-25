// One call. Holds who is here, the world's modules (with history for undo and
// rollback), the last shared-state snapshot, and the queue of Claude requests.
// It relays media signalling and state between browsers; it runs no world code.
import { DEFAULT_MODULES } from '../src/world/primitives.js';
import * as claude from './claude.js';

export const MAX_PLAYERS = 6;
const MAX_HISTORY = 30;
const MAX_REQUESTS = 300; // Claude code requests per room, so a leaked link has a ceiling
const MAX_QUEUE = 5;
const MAX_TRIAGE = 4; // utterances being checked at once
const TRANSCRIPT = 12;
const MAX_MODULES = 40;
const MAX_CODE = 40_000;

const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export class Room {
  constructor(id) {
    this.id = id;
    this.clients = new Map(); // id -> {id, name, slot, ws, state}; insertion order = join order
    this.nextId = 1;
    this.version = 1;
    this.modules = { ...DEFAULT_MODULES };
    this.history = [];
    this.shared = {};
    this.transcript = [];
    this.recent = []; // for echo suppression
    this.chain = Promise.resolve();
    this.queued = 0;
    this.triaging = 0;
    this.model = claude.DEFAULT_MODEL;
    this.requests = 0;
    this.last = null; // the change most recently applied, kept until it proves itself
    this.errorSeen = 0;
  }

  get size() { return this.clients.size; }
  get hostId() { return this.clients.keys().next().value ?? null; }
  roster() { return [...this.clients.values()].map(({ id, name, slot }) => ({ id, name, slot })); }
  broadcast(m, except) { for (const c of this.clients.values()) if (c !== except) send(c.ws, m); }
  status(kind, text, by) { this.broadcast({ type: 'status', kind, text, by }); }

  add(ws, name) {
    const used = new Set([...this.clients.values()].map((c) => c.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const client = { id: `p${this.nextId++}`, name, slot, ws, state: null };
    const peers = [...this.clients.keys()];
    this.clients.set(client.id, client);
    const states = {};
    for (const c of this.clients.values()) if (c.state) states[c.id] = c.state;
    send(ws, {
      type: 'welcome', id: client.id, slot, peers, players: this.roster(), hostId: this.hostId,
      program: { version: this.version, modules: this.modules }, shared: this.shared, states, ai: claude.mode(),
      model: this.model, models: claude.mode() === 'mock' ? [] : claude.MODELS,
    });
    this.broadcast({ type: 'roster', players: this.roster(), hostId: this.hostId }, client);
    return client;
  }

  remove(client) {
    if (this.clients.get(client.id) !== client) return;
    this.clients.delete(client.id);
    this.broadcast({ type: 'roster', players: this.roster(), hostId: this.hostId, left: client.id });
  }

  handle(client, m) {
    switch (m.type) {
      case 'signal': {
        const to = this.clients.get(m.to);
        if (to) send(to.ws, { type: 'signal', from: client.id, data: m.data });
        break;
      }
      case 'state':
        client.state = m.s;
        this.broadcast({ type: 'state', id: client.id, s: m.s }, client);
        break;
      case 'shared':
        if (client.id !== this.hostId || !m.s || typeof m.s !== 'object') break;
        this.shared = m.s;
        this.broadcast({ type: 'shared', s: m.s }, client);
        break;
      case 'utter': this.heard(client, m.text, false); break;
      case 'ask': this.heard(client, m.text, true); break;
      case 'undo': this.enqueue(() => this.undo()); break;
      case 'error': this.onError(m); break;
      case 'model':
        if (m.model === this.model || !claude.MODELS.some((x) => x.id === m.model)) break;
        this.model = m.model;
        this.broadcast({ type: 'model', model: this.model });
        break;
    }
  }

  // ---- hearing ----------------------------------------------------------

  heard(client, raw, typed) {
    const text = String(raw ?? '').trim().slice(0, 400);
    if (!text) return;
    const now = Date.now();
    if (!typed) {
      // One person's voice coming out of another's speakers gets recognised
      // twice. Keep whichever arrived first.
      const n = norm(text);
      this.recent = this.recent.filter((r) => now - r.at < 4000);
      if (n.length > 8 && this.recent.some((r) => r.id !== client.id && (r.n.includes(n) || n.includes(r.n)))) return;
      this.recent.push({ id: client.id, n, at: now });
    }
    const utterance = { id: client.id, name: client.name, text };
    const earlier = this.transcript.slice(-TRANSCRIPT);
    this.transcript.push(utterance);
    if (this.transcript.length > 50) this.transcript.splice(0, this.transcript.length - 50);
    this.broadcast({ type: 'heard', ...utterance, typed });
    const speaker = { id: client.id, name: client.name };
    if (!claude.available()) {
      if (typed) this.status('error', 'No Claude key on the server, so nothing can change. Add ANTHROPIC_API_KEY to .env.local and restart.');
      return;
    }
    if (typed) {
      if (/^undo\W*$/i.test(text)) this.enqueue(() => this.undo());
      else this.enqueue(() => this.change(speaker, text));
      return;
    }
    if (text.split(/\s+/).length < 2) return;
    // Checked right away, not in the queue, so talk during a build is not
    // held up behind it; only a real request waits its turn.
    if (this.triaging >= MAX_TRIAGE) return;
    this.triaging++;
    claude.triage({ transcript: earlier, utterance }).then((verdict) => {
      if (verdict.kind === 'undo') this.enqueue(() => this.undo());
      else if (verdict.kind === 'change' && verdict.request) this.enqueue(() => this.change(speaker, verdict.request));
    }, (err) => console.error(`[${this.id}] triage:`, err.message)).finally(() => { this.triaging--; });
  }

  enqueue(job) {
    if (this.queued >= MAX_QUEUE) { this.status('error', 'Too many requests are waiting. Give me a moment.'); return; }
    this.queued++;
    this.chain = this.chain.then(job).catch((err) => console.error(`[${this.id}]`, err)).finally(() => { this.queued--; });
  }

  // ---- changing the world -----------------------------------------------

  async change(speaker, request, failure = null, attempt = 0) {
    if (++this.requests > MAX_REQUESTS) { this.status('error', 'This room has used up its changes. Start a new room to keep going.'); return; }
    this.status(failure ? 'fixing' : 'building', request, speaker.name);
    let out;
    const model = this.model;
    const started = Date.now();
    try {
      out = await claude.generate({
        players: this.roster(), speaker, modules: this.modules,
        transcript: this.transcript.slice(-TRANSCRIPT), request, failure,
      }, model);
      console.log(`[${this.id}] ${model} answered in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`[${this.id}] generate:`, err.message);
      this.status('error', `Claude could not answer: ${err.message}`);
      return;
    }
    const ops = (out.ops ?? []).map((o) => ({ ...o, name: String(o.name).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) })).filter((o) => o.name);
    if (!ops.length) { this.status('done', out.say || 'Nothing to change.'); return; }
    const problem = checkOps(ops);
    if (problem) {
      if (attempt < 1) return this.change(speaker, request, { message: problem, ops }, attempt + 1);
      this.status('error', 'I could not get that to work, so nothing changed.');
      return;
    }
    const next = { ...this.modules };
    for (const o of ops) { if (o.op === 'delete') delete next[o.name]; else next[o.name] = o.code; }
    if (Object.keys(next).length > MAX_MODULES) { this.status('error', 'The world has too many pieces. Ask me to remove some first.'); return; }
    this.commit(next, out.say);
    this.last = { speaker, request, ops, version: this.version, attempt };
  }

  commit(modules, say) {
    this.history.push(this.modules);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.modules = modules;
    this.version++;
    this.broadcast({ type: 'program', version: this.version, modules });
    this.status('done', say || 'Done.');
  }

  restore() {
    this.modules = this.history.pop();
    this.version++;
    this.last = null;
    this.broadcast({ type: 'program', version: this.version, modules: this.modules });
  }

  async undo() {
    if (!this.history.length) { this.status('done', 'Nothing to undo.'); return; }
    this.restore();
    this.status('done', 'Undone.');
  }

  // A browser reports that world code threw or froze.
  onError(m) {
    if (m.version !== this.version || this.errorSeen === this.version) return;
    this.errorSeen = this.version;
    const message = `${m.module ? `module "${m.module}" ` : ''}${String(m.message).slice(0, 500)}`;
    console.error(`[${this.id}] v${m.version} ${message}`);
    const last = this.last;
    if (!last || last.version !== this.version) {
      // Older code that broke later (say, when someone new joined). Each
      // browser has switched the module off; say so and leave it for a person to ask.
      this.status('error', `Something stopped working: ${message}. Ask me to fix it.`);
      return;
    }
    this.restore();
    if (last.attempt < 1) this.enqueue(() => this.change(last.speaker, last.request, { message, ops: last.ops }, last.attempt + 1));
    else this.status('error', 'That did not work, so I put things back.');
  }
}

// Compile (never run) each module to catch typos before anyone's screen breaks.
function checkOps(ops) {
  for (const o of ops) {
    if (o.op !== 'upsert') continue;
    if (o.code.length > MAX_CODE) return `module "${o.name}" is too long`;
    try { new Function('ctx', `"use strict";\n${o.code}`); } catch (err) { return `module "${o.name}" has a syntax error: ${err.message}`; }
  }
  return null;
}

// Brick Talk chat: a small collapsible window. You type (any language), Claude
// maps it to symbols, the validator checks it, and only symbol ids go out —
// to the chat log, to a bubble over your model in the world, and to other tabs.
// "Friend" mode and 🎲 simulate another player's message arriving in the world.
import * as THREE from 'three';
import { symbolImg, readAs, validateMessage } from './symbols.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const BUBBLE_SECONDS = 7;

// Canned friend messages for 🎲 (already symbols, so no API call needed).
const FRIEND_LINES = [
  [['hi'], ['we', 'build', 'castle', 'question']],
  [['wow'], ['car', 'you', 'cool']],
  [['everyone', 'follow', 'me'], ['go', 'fast']],
  [['me', 'not', 'find', 'key'], ['you', 'help', 'me', 'question']],
  [['laugh'], ['tree', 'break']],
  [['sorry'], ['me', 'break', 'house']],
  [['we', 'play', 'again', 'question']],
  [['look', 'up'], ['rocket', 'big']],
];

export class Chat {
  constructor({ app, net, camera, controls, world }) {
    Object.assign(this, { app, net, camera, controls, world });
    this.asFriend = false;
    this.busy = false;
    this.bubbles = []; // {el, anchor: () => Vector3, until}
    this.friendSpot = null;
    this._build();
  }

  _build() {
    const el = document.createElement('section');
    el.id = 'chat';
    el.className = 'collapsed';
    el.innerHTML = `
      <button class="chat-head" id="chat-toggle" aria-expanded="false">
        <span>${symbolImg('hi', 24)} Brick Talk</span><span id="chat-badge"></span><span class="chev">▴</span>
      </button>
      <div class="chat-body">
        <div id="chat-log" aria-live="polite"></div>
        <form id="chat-form" autocomplete="off">
          <button type="button" id="chat-who" class="who" title="Who's talking. Switch to Friend to simulate another player.">Me</button>
          <input id="chat-input" placeholder="Say something…" maxlength="300" />
          <button type="button" id="chat-dice" class="icon" title="Simulate a friend's message">🎲</button>
          <button type="submit" class="icon send" title="Send">➤</button>
        </form>
      </div>`;
    document.body.insertBefore(el, $('console').nextSibling);
    this.el = el;
    this.unread = 0;

    $('chat-toggle').onclick = () => this.setOpen(el.classList.contains('collapsed'));
    $('chat-who').onclick = () => {
      this.asFriend = !this.asFriend;
      $('chat-who').textContent = this.asFriend ? 'Friend' : 'Me';
      $('chat-who').classList.toggle('friend', this.asFriend);
    };
    $('chat-dice').onclick = () => this.receive({ phrases: FRIEND_LINES[(Math.random() * FRIEND_LINES.length) | 0], simulated: true });
    $('chat-form').onsubmit = (ev) => { ev.preventDefault(); this.send($('chat-input').value); };

    fetch('./api/bricktalk').then((r) => r.json()).then((j) => {
      if (!j.available) this._note('Brick Talk needs ANTHROPIC_API_KEY on the dev server to translate messages. 🎲 still works.', 'warn');
    }).catch(() => this._note("Couldn't reach the Brick Talk server.", 'warn'));
  }

  setOpen(open) {
    this.el.classList.toggle('collapsed', !open);
    $('chat-toggle').setAttribute('aria-expanded', String(open));
    if (open) { this.unread = 0; $('chat-badge').textContent = ''; $('chat-input').focus(); }
  }

  async send(text) {
    text = text.trim();
    if (!text || this.busy) return;
    this.busy = true;
    const input = $('chat-input');
    input.disabled = true;
    const pending = this._row(this.asFriend ? 'friend' : 'me', `<span class="said">“${esc(text)}”</span><span class="dots">…</span>`);
    const notes = [];
    if (/\d/.test(text)) notes.push("Numbers can't be sent.");
    if (/https?:|www\.|\.com|@/i.test(text)) notes.push("Links and addresses can't be sent.");
    try {
      const r = await fetch('./api/bricktalk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error ?? `HTTP ${r.status}`);
      if (out.dropped?.length) notes.push(`Not sent: ${out.dropped.map((w) => `<s>${esc(w)}</s>`).join(' ')}`);
      if (out.blocked?.length) notes.push(esc(out.blocked.join(' ')));
      const v = validateMessage(out.phrases);
      pending.remove();
      if (!v.ok) {
        this._row(this.asFriend ? 'friend' : 'me', `<span class="said">“${esc(text)}”</span><div class="blocked">Not sent. ${esc(v.why.join(' '))}</div>${this._notes(notes)}`);
      } else if (this.asFriend) {
        this.receive({ phrases: out.phrases, simulated: true, said: text, notes });
      } else {
        this._show('me', out.phrases, { said: text, notes });
        this._bubble(out.phrases, this._myAnchor(), 'me');
        this.net?.sendChat(out.phrases, this.app.selected?.id);
      }
      input.value = '';
    } catch (err) {
      pending.remove();
      this._note(`Couldn't translate: ${esc(err.message)}`, 'warn');
    } finally {
      this.busy = false;
      input.disabled = false;
      input.focus();
    }
  }

  // A message from someone else: a real tab (via net) or a simulated friend.
  receive({ phrases, from, modelId, simulated, said, notes = [] }) {
    if (!validateMessage(phrases).ok) return; // never render anything that isn't valid Brick Talk
    this._show('friend', phrases, { said: simulated ? said : null, notes, simulated });
    this._bubble(phrases, this._friendAnchor(from, modelId), 'friend');
    if (this.el.classList.contains('collapsed')) { this.unread++; $('chat-badge').textContent = this.unread; }
  }

  // ---- anchors in the world -------------------------------------------------------
  _myAnchor() {
    const e = this.app.selected;
    if (e && !e.removed) return () => (e.removed ? null : e.position.add(new THREE.Vector3(0, 5, 0)));
    const p = this.controls.target.clone().add(new THREE.Vector3(0, 4, 0));
    return () => p;
  }

  _friendAnchor(from, modelId) {
    const remotes = [...this.world.entities.values()].filter((e) => e.remote && !e.removed);
    const e = remotes.find((r) => from && modelId && r.id === `r-${from}:${modelId}`)
      ?? remotes.find((r) => from && r.id.startsWith(`r-${from}:`))
      ?? (!from ? remotes[0] : null);
    if (e) return () => (e.removed ? null : e.position.add(new THREE.Vector3(0, 5, 0)));
    // No friend model around (e.g. simulating alone): float the bubble at a spot near
    // the middle of the view, and keep using that spot so the "friend" stays put.
    if (!this.friendSpot || this.friendSpot.distanceTo(this.controls.target) > 30) {
      const off = new THREE.Vector3(-12, 0, 6);
      this.friendSpot = this.controls.target.clone().add(off).setY(4);
    }
    const p = this.friendSpot.clone();
    return () => p;
  }

  // ---- rendering ------------------------------------------------------------------
  _seq(phrases, px) {
    return phrases.map((p) => `<span class="phrase">${p.map((id) => symbolImg(id, px)).join('')}</span>`).join('');
  }

  _notes(notes) { return notes.length ? `<div class="notes">${notes.join(' ')}</div>` : ''; }

  _show(who, phrases, { said, notes = [], simulated } = {}) {
    const label = who === 'me' ? 'You' : simulated ? 'Friend (simulated)' : 'Friend';
    this._row(who,
      `<div class="name">${label}</div>${said ? `<span class="said">“${esc(said)}”</span>` : ''}
       <div class="seq">${this._seq(phrases, 54)}</div>
       <div class="reads">${esc(phrases.map(readAs).join(' / '))}</div>${this._notes(notes)}`);
  }

  _row(who, html) {
    const row = document.createElement('div');
    row.className = `msg ${who}`;
    row.innerHTML = html;
    const log = $('chat-log');
    log.appendChild(row);
    while (log.childNodes.length > 60) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    return row;
  }

  _note(html, cls = '') { this._row(`sys ${cls}`, html); }

  _bubble(phrases, anchor, who) {
    const el = document.createElement('div');
    el.className = `sym-bubble ${who}`;
    el.innerHTML = this._seq(phrases, 48);
    $('bubbles').appendChild(el);
    // One bubble per speaker spot: a new message replaces the old one there.
    const first = anchor();
    for (const b of this.bubbles) {
      const p = b.anchor();
      if (p && first && p.distanceTo(first) < 0.5) b.until = 0;
    }
    this.bubbles.push({ el, anchor, until: performance.now() + BUBBLE_SECONDS * 1000 });
  }

  update() {
    const now = performance.now();
    this.bubbles = this.bubbles.filter((b) => {
      const p = now < b.until ? b.anchor() : null;
      if (!p) { b.el.remove(); return false; }
      const s = this.app._screen(p);
      b.el.style.display = s ? '' : 'none';
      if (s) { b.el.style.left = `${s.x}px`; b.el.style.top = `${s.y}px`; }
      b.el.classList.toggle('fading', b.until - now < 600);
      return true;
    });
  }
}

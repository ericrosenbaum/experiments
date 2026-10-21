// Modal dialogs: the Open menu, the Save dialog and Help.

import { ASSETS } from './config.js';
import { morphFromText, morphFromXml } from './morph-format.js';
import { downloadXml, saves, shareUrl } from './storage.js';

const h = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
};

export class Menus {
  constructor({ app, hud, doc }) {
    this.app = app;
    this.hud = hud;
    this.doc = doc; // { title, author, description } of the open morph
    this.modal = document.getElementById('modal');
    this.panel = this.modal.querySelector('.modal-panel');
    this.tab = 'examples';
    this.examples = null;
    hud.modalOpen = () => !this.modal.hidden;

    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (this.modal.hidden) {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          this.openSave();
        } else if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
          e.preventDefault();
          this.openMenu();
        } else if (e.key === '?' && !e.target.closest?.('input, textarea')) {
          this.openHelp();
        }
        return;
      }
      if (e.key === 'Escape') this.close();
    });
  }

  show(content, { narrow = false, label = '' } = {}) {
    this.panel.className = `modal-panel${narrow ? ' narrow' : ''}`;
    this.panel.setAttribute('aria-label', label);
    this.panel.replaceChildren(...content);
    this.modal.hidden = false;
    this.panel.querySelector('[autofocus]')?.focus();
  }

  close() {
    this.modal.hidden = true;
    this.panel.replaceChildren();
  }

  head(title, ...extra) {
    return h('div', { class: 'modal-head' }, h('h2', {}, title), ...extra, h('button', { class: 'close-x', 'aria-label': 'Close', onclick: () => this.close() }, '×'));
  }

  async loadExamples() {
    if (!this.examples) {
      const res = await fetch(`${ASSETS}/examples/index.json`);
      this.examples = (await res.json()).map((e, i) => ({ ...e, title: e.title || `Example ${i + 1}` }));
    }
    return this.examples;
  }

  async openExample(ex) {
    const res = await fetch(`${ASSETS}/examples/${ex.file}`);
    const morph = morphFromXml(await res.text());
    this.useMorph({ ...morph, title: morph.title || ex.title });
  }

  /** Put a morph on the canvas and make it the current document. */
  useMorph(morph) {
    this.app.loadMorph(morph);
    Object.assign(this.doc, { title: morph.title, author: morph.author, description: morph.description });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  confirmDiscard() {
    return !this.app.dirty || this.app.isEmpty() || confirm('Discard the changes on the canvas?');
  }

  newCanvas() {
    if (!this.confirmDiscard()) return;
    this.app.clear();
    Object.assign(this.doc, { title: '', author: this.doc.author, description: '' });
  }

  // ---------- Open ----------

  async openMenu() {
    const grid = h('div', { class: 'thumb-grid' });
    const detail = h('div', { class: 'detail' });
    const tabButton = (id, label) =>
      h(
        'button',
        {
          role: 'tab',
          'aria-selected': this.tab === id,
          onclick: () => {
            this.tab = id;
            this.openMenu();
          },
        },
        label,
      );
    const tabs = h('div', { class: 'seg', role: 'tablist' }, tabButton('examples', 'Examples'), tabButton('mine', 'My Stuff'));
    const fileInput = h('input', {
      type: 'file',
      accept: '.xml,.json,application/xml,text/xml,application/json',
      hidden: true,
      onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const morph = morphFromText(await file.text());
          if (!this.confirmDiscard()) return;
          this.useMorph({ ...morph, title: morph.title || file.name.replace(/\.\w+$/, '') });
          this.close();
        } catch (err) {
          this.hud.toast(`Couldn't open that file: ${err.message}`);
        }
      },
    });
    const openBtn = h('button', { class: 'btn primary', disabled: true }, 'Open');
    const deleteBtn = h('button', { class: 'btn danger', hidden: this.tab !== 'mine', disabled: true }, 'Delete');

    this.show(
      [
        this.head('Open', tabs),
        h('div', { class: 'modal-body' }, h('div', { class: 'open-layout' }, grid, detail)),
        h(
          'div',
          { class: 'modal-foot' },
          h('button', { class: 'btn', style: 'margin-right:auto', onclick: () => fileInput.click() }, 'Import file…'),
          fileInput,
          deleteBtn,
          h('button', { class: 'btn', onclick: () => this.close() }, 'Cancel'),
          openBtn,
        ),
      ],
      { label: 'Open' },
    );

    let entries;
    if (this.tab === 'examples') {
      try {
        entries = (await this.loadExamples()).map((ex) => ({
          title: ex.title,
          author: ex.author,
          description: ex.description,
          thumb: `${ASSETS}/examples/${ex.thumb}`,
          open: () => this.openExample(ex),
        }));
      } catch {
        grid.append(h('div', { class: 'empty' }, "Couldn't load the examples."));
        return;
      }
    } else {
      entries = saves.list().map((s) => ({
        title: s.title || 'Untitled',
        author: s.author,
        description: s.description,
        thumb: s.thumb,
        date: new Date(s.savedAt),
        open: async () => this.useMorph(saves.load(s)),
        remove: () => saves.remove(s.id),
      }));
      if (!entries.length) {
        grid.append(
          h('div', { class: 'empty' }, 'Nothing saved yet.', h('br'), 'Use Save in the menu to keep a morph in this browser.'),
        );
      }
    }

    let selected = null;
    const choose = (entry, btn) => {
      selected = entry;
      grid.querySelectorAll('.thumb').forEach((t) => t.setAttribute('aria-selected', t === btn));
      openBtn.disabled = false;
      deleteBtn.disabled = !entry.remove;
      detail.replaceChildren(
        ...[
        h('img', { src: entry.thumb, alt: '' }),
        h('h3', {}, entry.title),
        entry.author ? h('div', { class: 'by' }, `by ${entry.author}`) : null,
        entry.date ? h('div', { class: 'by' }, entry.date.toLocaleString()) : null,
        entry.description && entry.description !== '---' ? h('p', {}, entry.description) : null,
        ].filter(Boolean),
      );
    };
    const open = async (entry) => {
      if (!this.confirmDiscard()) return;
      try {
        await entry.open();
        this.close();
      } catch (err) {
        this.hud.toast(`Couldn't open that: ${err.message}`);
      }
    };
    openBtn.onclick = () => selected && open(selected);
    deleteBtn.onclick = () => {
      if (selected?.remove && confirm(`Delete “${selected.title}”?`)) {
        selected.remove();
        this.openMenu();
      }
    };
    for (const entry of entries) {
      const btn = h(
        'button',
        { class: 'thumb', title: entry.title, 'aria-selected': false },
        h('img', { src: entry.thumb, alt: '', loading: 'lazy' }),
        h('span', {}, entry.title),
      );
      btn.addEventListener('click', () => choose(entry, btn));
      btn.addEventListener('dblclick', () => open(entry));
      grid.append(btn);
    }
    if (entries.length) choose(entries[0], grid.querySelector('.thumb'));
  }

  // ---------- Save ----------

  openSave() {
    if (this.app.isEmpty()) {
      this.hud.toast('Put some bells on the canvas first.');
      return;
    }
    const thumb = this.app.thumbnail();
    const field = (label, el) => h('label', { class: 'field' }, label, el);
    const title = h('input', { value: this.doc.title, placeholder: 'untitled', autofocus: true, maxlength: 80 });
    const author = h('input', { value: this.doc.author, placeholder: 'anonymous', maxlength: 80 });
    const description = h('textarea', { placeholder: 'What is it? How do you play it?', maxlength: 2000 });
    description.value = this.doc.description;

    const current = () => {
      Object.assign(this.doc, { title: title.value.trim(), author: author.value.trim(), description: description.value.trim() });
      return this.app.toMorph(this.doc);
    };

    this.show(
      [
        this.head('Save'),
        h(
          'div',
          { class: 'modal-body' },
          h(
            'div',
            { class: 'save-layout' },
            h('img', { src: thumb, alt: 'Preview' }),
            h('div', {}, field('Title', title), field('Author', author), field('Description', description)),
          ),
        ),
        h(
          'div',
          { class: 'modal-foot' },
          h(
            'button',
            {
              class: 'btn',
              style: 'margin-right:auto',
              title: 'A link that opens this morph, for sharing',
              onclick: async () => {
                const url = shareUrl(current());
                try {
                  await navigator.clipboard.writeText(url);
                  this.hud.toast('Share link copied.');
                } catch {
                  prompt('Copy this link:', url);
                }
              },
            },
            'Copy share link',
          ),
          h(
            'button',
            { class: 'btn', title: 'The iPad app’s file format', onclick: () => downloadXml(current()) },
            'Download file',
          ),
          h(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                try {
                  saves.add(current(), thumb);
                  this.app.dirty = false;
                  this.close();
                  this.hud.toast('Saved to My Stuff.');
                } catch (err) {
                  this.hud.toast(err.message, 5000);
                }
              },
            },
            'Save to My Stuff',
          ),
        ),
      ],
      { narrow: true, label: 'Save' },
    );
  }

  // ---------- Help ----------

  openHelp() {
    // the original's animated help pages
    const slides = [
      ['help1.gif', 'Drag a note from the palette, then tap it to play it'],
      ['help2.gif', 'Shift the palette up and down an octave with the arrows'],
      ['help3.gif', 'Use the tabs to change instruments'],
      ['help4.gif', 'Hold down the pencil button and draw'],
      ['help5.gif', 'Hold down the strum button and slide across bells'],
    ];
    let i = 0;
    const img = h('img', { alt: '' });
    const caption = h('p');
    const counter = h('span');
    const update = () => {
      img.src = `${ASSETS}/help/gifs/${slides[i][0]}`;
      img.alt = slides[i][1];
      caption.textContent = slides[i][1];
      counter.textContent = `${i + 1} / ${slides.length}`;
    };
    const step = (d) => {
      i = (i + d + slides.length) % slides.length;
      update();
    };
    update();
    const li = (b, ...rest) => h('li', {}, h('b', {}, b), ' ', ...rest);
    const k = (s) => h('kbd', {}, s);

    this.show(
      [
        this.head('MelodyMorph'),
        h(
          'div',
          { class: 'modal-body' },
          h(
            'div',
            { class: 'help-slide' },
            img,
            caption,
            h(
              'div',
              { class: 'help-nav' },
              h('button', { class: 'btn', onclick: () => step(-1), 'aria-label': 'Previous' }, '‹'),
              counter,
              h('button', { class: 'btn', onclick: () => step(1), 'aria-label': 'Next', autofocus: true }, '›'),
            ),
          ),
          h(
            'ul',
            { class: 'help-list' },
            li('Play:', 'tap a bell. Drag it off its edge to move it; drop it on the palette to delete it.'),
            li('Move around:', 'drag the background. Pinch, scroll or ', k('+'), k('−'), ' to zoom.'),
            li('Record:', 'tap the red button, play some bells, tap it again. You get a recorder bell; tap it to play back.'),
            li('Paths:', 'with the path tool, drag out from a point. Tap the path player to send it along; it plays whatever it crosses, and loops if it ends where it started.'),
            li('Select:', 'drag a box, then drag inside it to move, or duplicate, transpose and delete.'),
            li('Tools:', 'tap one to keep it on, or hold it while you use it with another finger. Keys: hold ', k('D'), 'raw ', k('E'), 'rase ', k('S'), 'elect ', k('P'), 'ath ', k('M'), 'ute s', k('T'), 'rum.'),
            li('More keys:', k('1'), '–', k('5'), ' instruments, ', k('←'), k('→'), ' octave, ', k('R'), ' record, ', k('Esc'), ' stop all, ', k('H'), ' hide controls.'),
            li('Save and share:', 'the gear menu saves to this browser, downloads the iPad app’s file format, or copies a link.'),
          ),
        ),
      ],
      { narrow: true, label: 'Help' },
    );
  }
}

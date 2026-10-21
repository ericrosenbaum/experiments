import { MelodyMorph } from './app.js';
import { Hud } from './hud.js';
import { Menus } from './menus.js';
import { ASSETS } from './config.js';
import { loadSamples } from './audio.js';
import { autosave, morphFromHash, prefs } from './storage.js';

async function boot() {
  const font = new FontFace('NewMedia', `url("${ASSETS}/fonts/NewMediaFett.ttf")`);
  document.fonts.add(font);
  font.load().catch(() => {});

  const loading = document.getElementById('loading');
  loadSamples()
    .then(() => loading.classList.add('done'))
    .catch(() => (loading.textContent = "Couldn't load the sounds. Try reloading."));

  const app = new MelodyMorph(document.getElementById('stage'));
  await app.init();
  const hud = new Hud(app, prefs);
  const doc = { title: '', author: prefs.get('author') ?? '', description: '' };
  const menus = new Menus({ app, hud, doc });

  hud.onGearAction((action) => {
    if (action === 'open') menus.openMenu();
    if (action === 'save') menus.openSave();
    if (action === 'new') menus.newCanvas();
  });
  document.getElementById('help-btn').addEventListener('click', () => menus.openHelp());

  // what to show first: a shared link, then whatever was here last time
  let shared = null;
  try {
    shared = morphFromHash();
  } catch (err) {
    hud.toast(err.message, 5000);
  }
  if (shared) {
    menus.useMorph(shared);
    if (shared.title) hud.toast(`“${shared.title}”${shared.author ? ` by ${shared.author}` : ''}`, 4000);
  } else {
    const last = autosave.get();
    if (last) {
      app.loadMorph(last);
      Object.assign(doc, { title: last.title, author: last.author || doc.author, description: last.description });
      app.dirty = true;
    }
  }

  if (!prefs.get('seenHelp')) {
    prefs.set('seenHelp', true);
    menus.openHelp();
  }

  // keep the canvas across reloads
  let lastSaved = null;
  const persist = () => {
    lastSaved = autosave.put(app.toMorph(doc), lastSaved);
    if (doc.author) prefs.set('author', doc.author);
  };
  setInterval(persist, 3000);
  addEventListener('pagehide', persist);
  addEventListener('hashchange', () => {
    try {
      const m = morphFromHash();
      if (m && menus.confirmDiscard()) menus.useMorph(m);
    } catch (err) {
      hud.toast(err.message, 5000);
    }
  });

  window.melodymorph = app; // handy from the console
}

boot();

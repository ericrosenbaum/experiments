import { Audio } from './audio.js';
import { Renderer } from './renderer.js';
import { Hud } from './hud.js';
import { SingingFingers } from './app.js';
import { prefs } from './storage.js';

const canvas = document.getElementById('stage');
const audio = new Audio();
const hud = new Hud();
const app = new SingingFingers({ canvas, renderer: new Renderer(canvas), audio, hud });
hud.bind(app);
window.singingFingers = app; // handy from the console

// The microphone and sound both need a tap first, so the original's launch
// picture doubles as the start button.
const splash = document.getElementById('splash');
const startBtn = document.getElementById('start');
let starting = false;

async function start() {
  if (starting) return;
  starting = true;
  startBtn.textContent = 'Starting…';
  try {
    await audio.start();
  } catch (err) {
    startBtn.textContent = 'Tap to try again';
    hud.toast(`Couldn’t start the sound: ${err.message}`, 6000);
    starting = false;
    return;
  }
  splash.classList.add('gone');
  setTimeout(() => (splash.hidden = true), 400);
  const restored = await app.restore();
  if (audio.micError) {
    hud.toast(
      audio.micError.name === 'NotAllowedError'
        ? 'Without the microphone you can play what’s here but not draw. Allow it in your browser’s site settings, then reload.'
        : `No microphone: ${audio.micError.message}`,
      7000,
    );
  } else if (!restored && !prefs.get('seenTips')) {
    hud.showTips();
  }
  prefs.set('seenTips', true);
}

startBtn.addEventListener('click', start);
splash.addEventListener('click', start);

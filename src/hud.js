// The four buttons, the tips picture and the occasional message. The
// original drew 68 px retina images with a 10 px margin; these are HTML
// buttons with the same images.

export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.tips = document.getElementById('tips');
    this.toastEl = document.getElementById('toast');
    this.lockBtn = document.getElementById('lock');
    this.helpBtn = document.getElementById('help');
    this.toastTimer = 0;
    this.warnedNoMic = false;
  }

  bind(app) {
    const press = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    press('clear', () => app.clear());
    press('undo', () => app.undo());
    press('lock', () => this.setLocked(app, !app.locked));
    press('help', () => this.toggleTips());

    addEventListener('keydown', (e) => {
      if (e.repeat || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (!app.locked) app.undo();
      } else if (k === 'l' && !e.metaKey && !e.ctrlKey) {
        this.setLocked(app, !app.locked);
      } else if ((k === 'h' || k === '?') && !app.locked) {
        this.toggleTips();
      } else if (k === 'escape') {
        this.hideTips();
      }
    });
  }

  // ofApp::lockButtonPressed: locking hides every button but the lock
  setLocked(app, locked) {
    app.setLocked(locked);
    this.el.classList.toggle('locked', locked);
    this.lockBtn.setAttribute('aria-pressed', String(locked));
    this.lockBtn.querySelector('img').src = `./assets/ui/${locked ? 'lock-closed' : 'lock-open'}.png`;
    this.lockBtn.title = locked ? 'Unlock, to draw again (L)' : 'Lock: touches only play, never draw (L)';
    if (locked) this.hideTips();
  }

  toggleTips() {
    this.showTips(this.tips.hidden);
  }

  showTips(show = true) {
    this.tips.hidden = !show;
    this.helpBtn.setAttribute('aria-pressed', String(show));
  }

  hideTips() {
    this.showTips(false);
  }

  toast(text, ms = 3500) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  noMic() {
    if (this.warnedNoMic) return;
    this.warnedNoMic = true;
    this.toast('Drawing needs the microphone. Allow it in your browser’s site settings, then reload.', 6000);
  }
}

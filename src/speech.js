// Always-on speech recognition (Chrome's Web Speech API). The browser ends a
// session after a pause or an error, so this starts a new one each time until
// told to stop.
export function listen({ onInterim, onFinal, onState }) {
  const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!SR) { onState('unsupported'); return { start() {}, stop() {}, supported: false }; }
  let wanted = false;
  let rec = null;
  let fails = 0;

  function begin() {
    if (!wanted || rec) return;
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.onstart = () => onState('on');
    rec.onresult = (ev) => {
      fails = 0;
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) { const text = r[0].transcript.trim(); if (text) onFinal(text); } else interim += r[0].transcript;
      }
      onInterim(interim.trim());
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { wanted = false; onState('blocked'); }
      else if (ev.error !== 'no-speech' && ev.error !== 'aborted') fails++;
    };
    rec.onend = () => {
      rec = null;
      onInterim('');
      if (!wanted) { onState('off'); return; }
      setTimeout(begin, Math.min(5000, 250 * 2 ** fails));
    };
    try { rec.start(); } catch { rec = null; setTimeout(begin, 1000); }
  }

  return {
    supported: true,
    start() { wanted = true; fails = 0; begin(); },
    stop() { wanted = false; try { rec?.stop(); } catch { /* not started */ } if (!rec) onState('off'); },
  };
}

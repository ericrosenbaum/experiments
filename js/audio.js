// Sound effects and music beds, both optional, both suggested from the words an
// author speaks.
//
// Sound effects are recordings from the Scratch sound library, the same
// processed clips as brick-behaviors (sounds/<id>.mp3, see sounds/CREDITS.txt).
// In a world they're the rule `sound <id>` on an option: the clip plays just
// before the result line.
//
// Music beds loop quietly under a scene (`scene.music`) and dip while a voice
// is speaking. A bed is either a recorded clip (`src`, looped) or, until there
// are clips, a small generative piece made here with Web Audio.

// ---- catalogue ---------------------------------------------------------------
//   about: what it sounds like   fits: words in a line that suggest it
export const SOUNDS = [
  // animals
  ['meow', 'a cat', 'cat kitten kitty purr biscuit'], ['woof', 'a dog barking', 'dog puppy bark'],
  ['chirp', 'a little bird', 'bird birds chirp sparrow robin'], ['squawk', 'a loud bird', 'parrot squawk chicken'],
  ['seagull', 'seagulls', 'seagull seagulls gull gulls pier harbor beach'], ['quack', 'a duck', 'duck ducks pond'],
  ['owl', 'an owl hooting', 'owl night'], ['croak', 'a frog', 'frog toad ribbit'], ['cricket', 'a cricket', 'cricket crickets bug'],
  ['squeak', 'small squeaks', 'mouse mice squeak hamster'], ['moo', 'a cow', 'cow farm'], ['baa', 'a sheep', 'sheep lamb'],
  ['rooster', 'a rooster crowing', 'rooster morning farm'], ['neigh', 'a horse', 'horse pony'], ['howl', 'a wolf howling', 'wolf howl'],
  ['monkey', 'a chattering monkey', 'monkey'], ['growl', 'a growl', 'growl bear monster'], ['roar', 'a deep roar', 'roar dragon lion dinosaur'],
  // things & places
  ['creak', 'a creaking door', 'creak creaky attic trunk old ladder'], ['doorbell', 'a doorbell', 'doorbell knock visitor'],
  ['bell', "a ship's bell", 'bell ship boat boats'], ['gong', 'a big bell tolling', 'tower clock church'],
  ['splash', 'a splash', 'splash puddle puddles water swim pond toes wave'], ['drip', 'a water drop', 'drip leak leaking rain raindrop'],
  ['whoosh', 'a fast swoosh', 'whoosh flip throw skip wind slides'], ['clang', 'metal clanging', 'metal pan pot sword armor'],
  ['smash', 'glass breaking', 'glass break broke'], ['drum', 'a drum hit', 'drum drums'], ['bounce', 'a ball bouncing', 'ball bounce'],
  ['hit', 'whacking a ball', 'bat tennis'], ['honk', 'a car horn', 'car truck bus taxi'], ['vroom', 'an engine', 'engine race motor'],
  ['whistle', 'a train whistle', 'train'], ['siren', 'a siren', 'police ambulance siren'], ['flyby', 'zooming overhead', 'rocket jet plane launch blasts'],
  ['beep', 'a computer beep', 'computer button screen robot beep'], ['alert', 'an alarm', 'alarm warning'], ['boom', 'an explosion', 'boom explosion'],
  // people
  ['laugh', 'someone laughing', 'laugh laughs laughing giggle funny'], ['clap', 'clapping', 'clap applause'], ['yay', 'a crowd cheering', 'cheer crowd'],
  ['hey', 'someone shouting hey', 'hey shout ahoy wave'], ['gasp', 'a gasp', 'gasp gasps surprise'], ['snore', 'snoring', 'nap sleep snore doze asleep'],
  ['sneeze', 'a sneeze', 'sneeze dust dusty'], ['chomp', 'a big bite', 'bite eat crunch chomp toast'], ['scream', 'a scream', 'scream'],
  // cartoon & magic
  ['boing', 'a springy boing', 'boing spring bounce trampoline'], ['bonk', 'a bonk', 'bonk bump'], ['wobble', 'a wobble', 'wobble jelly'],
  ['squish', 'a squishy pop', 'squish dough knead slime'], ['squeaky', 'a squeaky toy', 'toy squeaky'], ['slide', 'a slide whistle', 'slide'],
  ['scramble', 'feet running', 'run scurry scurries runs'], ['drumroll', 'a drum roll', 'drumroll'], ['tada', 'ta-da', 'tada surprise costume'],
  ['dundun', 'dun dun dunnn', 'dramatic mystery'], ['magic', 'a spell', 'magic spell wizard'], ['wand', 'a wand swish', 'wand fairy'],
  ['sparkle', 'twinkly sparkles', 'sparkle sparkles sparkly rainbow star shiny shell whale'], ['zoop', 'a quick zoop', 'zoop'],
  ['teleport', 'teleporting', 'teleport vanish'], ['coin', 'collecting a coin', 'coin money pay'], ['collect', 'picking something up', 'find found collect'],
  ['win', 'a you-win jingle', 'win won'], ['lose', 'a game-over jingle', 'lose lost'], ['oops', 'a goofy oops', 'oops mistake'],
  ['jump', 'a jump', 'jump hop hops'], ['pew', 'a blaster', 'blaster'], ['whiz', 'whizzing past', 'whiz zoom'],
].map(([id, about, fits]) => ({ id, about, fits: fits.split(' ') }));
export const SOUND_IDS = new Set(SOUNDS.map((s) => s.id));

// Music beds. To use recorded soundtrack clips, give an entry `src:
// 'music/<file>.mp3'` (looped seamlessly); entries without `src` are generated.
export const MUSIC = [
  { id: 'cozy', about: 'warm, slow, homey', fits: 'kitchen home house cozy warm blanket couch bakery bread toast cat morning living saturday', gen: { bpm: 66, root: 57, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]], wave: 'triangle', notes: 0.35 } },
  { id: 'morning', about: 'bright and light', fits: 'sunny sunrise morning garden flowers park bright breakfast birds', gen: { bpm: 84, root: 62, scale: [0, 2, 4, 7, 9, 12], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], wave: 'sine', notes: 0.55 } },
  { id: 'sea', about: 'waves and a slow drift', fits: 'sea ocean beach waves pier harbor boat boats sand shore seagulls fisherman', gen: { bpm: 54, root: 50, scale: [0, 2, 4, 7, 9], chords: [[0, 7, 12, 16], [5, 12, 16, 21], [9, 12, 16, 19], [7, 14, 17, 23]], wave: 'sine', notes: 0.25, noise: 'waves' } },
  { id: 'rain', about: 'soft rain and a quiet pad', fits: 'rain raining rainy puddles puddle storm wet porch window', gen: { bpm: 60, root: 55, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17]], wave: 'triangle', notes: 0.2, noise: 'rain' } },
  { id: 'curious', about: 'twinkly, wondering', fits: 'attic dusty mystery secret trunk boxes old lighthouse strange hidden explore curious', gen: { bpm: 72, root: 60, scale: [0, 2, 4, 6, 7, 11, 12], chords: [[0, 4, 7, 11], [2, 6, 9, 14], [0, 4, 7, 11], [-1, 2, 6, 11]], wave: 'sine', notes: 0.5 } },
  { id: 'night', about: 'still, starry, crickets', fits: 'night stars moon dark sleep bedtime quiet owl', gen: { bpm: 50, root: 48, scale: [0, 2, 3, 7, 10], chords: [[0, 7, 15], [-4, 3, 12], [-2, 5, 14], [-5, 2, 10]], wave: 'sine', notes: 0.2, noise: 'crickets' } },
  { id: 'space', about: 'humming, spacey, a bit tense', fits: 'space rocket ship stars alarm planet astronaut bridge airlock pod', gen: { bpm: 58, root: 45, scale: [0, 1, 5, 7, 8], chords: [[0, 7, 13], [1, 8, 13], [-2, 5, 12], [0, 7, 15]], wave: 'sawtooth', notes: 0.25 } },
];
for (const m of MUSIC) m.fits = m.fits.split(' ');
export const MUSIC_BY_ID = Object.fromEntries(MUSIC.map((m) => [m.id, m]));

// ---- suggestions -------------------------------------------------------------
const words = (t) => new Set(String(t || '').toLowerCase().match(/[a-z]+/g) || []);
function score(text, list, limit) {
  const w = words(text);
  return list.map((x) => ({ id: x.id, n: x.fits.filter((f) => w.has(f)).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, limit).map((x) => x.id);
}
export const suggestSounds = (text, limit = 3) => score(text, SOUNDS, limit);
export const suggestMusic = (text, limit = 2) => score(text, MUSIC, limit);

// ---- playback ----------------------------------------------------------------
let ctx = null;
let master = null; // music level (ducked under voices)
let sfxOut = null;
const BASE = 0.22;
const DUCKED = 0.07;
export function audioContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = BASE; master.connect(ctx.destination);
    sfxOut = ctx.createGain(); sfxOut.gain.value = 0.9; sfxOut.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const buffers = new Map();
async function load(url) {
  if (!buffers.has(url)) {
    buffers.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }).then((b) => audioContext().decodeAudioData(b)));
  }
  return buffers.get(url);
}

// Resolves when the effect ends, or after `maxWait` seconds so long effects
// overlap the next line instead of holding it up.
export async function playSound(id, { maxWait = 1.4 } = {}) {
  if (!SOUND_IDS.has(id)) return;
  try {
    const buf = await load(`sounds/${id}.mp3`);
    const src = audioContext().createBufferSource();
    src.buffer = buf;
    src.connect(sfxOut);
    src.start();
    await new Promise((res) => setTimeout(res, Math.min(buf.duration, maxWait) * 1000));
  } catch { /* missing file: stay silent */ }
}

export function duck(on) {
  if (!master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(on ? DUCKED : BASE, t, on ? 0.08 : 0.6);
}

// ---- music beds --------------------------------------------------------------
let current = null; // { id, stop() }
export const currentMusic = () => current?.id || null;

export function setMusic(id) {
  if ((current?.id || null) === (id || null)) return;
  current?.stop();
  current = null;
  const m = MUSIC_BY_ID[id];
  if (!m) return;
  audioContext();
  current = m.src ? clipBed(m) : genBed(m);
}

function bus() {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5); // fade in
  g.connect(master);
  return g;
}
function fadeOut(g, after) {
  const t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0, t + 1.5);
  setTimeout(() => { after?.(); g.disconnect(); }, 1700);
}

function clipBed(m) {
  const g = bus();
  let src = null;
  let stopped = false;
  load(m.src).then((buf) => {
    if (stopped) return;
    src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true; src.connect(g); src.start();
  }).catch(() => {});
  return { id: m.id, stop: () => { stopped = true; fadeOut(g, () => src?.stop()); } };
}

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// A generative bed: a slow chord pad, a few soft plucked notes from the scale,
// and optionally a noise texture (waves, rain, crickets).
function genBed(m) {
  const p = m.gen;
  const out = bus();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.wave === 'sawtooth' ? 900 : 2400; lp.connect(out);
  const beat = 60 / p.bpm;
  const bar = beat * 4;
  let next = ctx.currentTime + 0.1;
  let chordIx = 0;
  let step = 0;
  let last = 2;

  const pad = (notes, t) => {
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = p.wave; o.frequency.value = hz(p.root - 12 + n); o.detune.value = det;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05 / notes.length * (p.wave === 'sawtooth' ? 0.6 : 1.4), t + bar * 0.4);
        g.gain.linearRampToValueAtTime(0, t + bar * 1.15);
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + bar * 1.2);
      }
    }
  };
  const pluck = (midi, t) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = hz(midi);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + beat * 2.5);
    o.connect(g); g.connect(lp); o.start(t); o.stop(t + beat * 2.6);
  };

  const tick = () => {
    while (next < ctx.currentTime + 0.4) {
      if (step % 4 === 0) { pad(p.chords[chordIx % p.chords.length], next); chordIx++; }
      if (Math.random() < p.notes) {
        last = Math.max(0, Math.min(p.scale.length - 1, last + Math.round((Math.random() - 0.5) * 3)));
        pluck(p.root + 12 + p.scale[last], next + (Math.random() < 0.3 ? beat / 2 : 0));
      }
      next += beat; step++;
    }
  };
  tick();
  const timer = setInterval(tick, 150);
  const noise = p.noise ? noiseBed(p.noise, out) : null;
  return { id: m.id, stop: () => { clearInterval(timer); noise?.stop(); fadeOut(out); } };
}

let noiseBuf = null;
function noiseBed(kind, out) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); const g = ctx.createGain();
  src.connect(f); f.connect(g); g.connect(out);
  let lfo = null; let timer = null;
  if (kind === 'waves') {
    f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0.12;
    lfo = ctx.createOscillator(); const depth = ctx.createGain();
    lfo.frequency.value = 0.09; depth.gain.value = 0.1; lfo.connect(depth); depth.connect(g.gain); lfo.start();
  } else if (kind === 'rain') {
    f.type = 'highpass'; f.frequency.value = 2500; g.gain.value = 0.06;
  } else if (kind === 'crickets') {
    f.type = 'bandpass'; f.frequency.value = 4500; f.Q.value = 30; g.gain.value = 0;
    timer = setInterval(() => { // little bursts of chirping
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.25, t + i * 0.09); g.gain.setValueAtTime(0, t + i * 0.09 + 0.04); }
    }, 1100 + Math.random() * 900);
  }
  src.start();
  return { stop: () => { clearInterval(timer); lfo?.stop(); setTimeout(() => src.stop(), 1700); } };
}

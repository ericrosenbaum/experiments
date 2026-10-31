// Sound effects, and the shared audio output that music and effects play
// through. Both are optional and suggested from the words an author speaks.
//
// Sound effects are recordings from the Scratch sound library, the same
// processed clips as brick-behaviors (sounds/<id>.mp3, see sounds/CREDITS.txt).
// In a world they're the rule `sound <id>` on an option: the clip plays just
// before the result line.
//
// Scene music lives in music.js; it plays through musicOut() here, which dips
// while a voice is speaking.

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


// ---- suggestions -------------------------------------------------------------
const words = (t) => new Set(String(t || '').toLowerCase().match(/[a-z]+/g) || []);
function score(text, list, limit) {
  const w = words(text);
  return list.map((x) => ({ id: x.id, n: x.fits.filter((f) => w.has(f)).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, limit).map((x) => x.id);
}
export const suggestSounds = (text, limit = 3) => score(text, SOUNDS, limit);

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
export async function load(url) {
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

export function musicOut() {
  audioContext();
  return master;
}

export function duck(on) {
  if (!master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(on ? DUCKED : BASE, t, on ? 0.08 : 0.6);
}

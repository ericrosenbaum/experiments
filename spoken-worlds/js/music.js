// Scene music, adapted from the Story Soundtrack Lab (stars-and-stories): its
// mood set, keyword weights, and clip engine. Each mood has four 30-second
// clips (music/, credits in music/CREDITS.txt). While a mood plays, its clips
// follow one another with a crossfade; on a mood change the first clip is the
// one closest in key, brightness and busyness to what was playing, so the
// switch doesn't lurch.
//
// In a world, a scene's mood is `scene.music`. Authoring suggests one from the
// words of the scene's description, using the lab's weighted keywords.

import { audioContext, musicOut, load } from './audio.js';

// label, nightlight color, character, and weighted keywords ("word:weight";
// plurals match too). Straight from the lab.
export const MOODS = {
  settling:  { label: "Settling in",   color: "#8a93b3", desc: "Soft glassy chords, a few stars",
    kw: ["ready:.6","okay:.4","wait:.6","let me:.6","sit:.6","lap:.8","blanket:.8"] },
  once_upon: { label: "Once upon a time", color: "#c6a6ec", desc: "Music-box arpeggio, lydian shimmer",
    kw: ["once upon a time:3","long ago:2","this one's about:2","story about:2","there was:1","began to read:2","ancient book:2"] },
  cozy:      { label: "Cozy home",     color: "#eda86c", desc: "Warm pad, gentle bells, soft bass",
    kw: ["home:1.5","castle","house","doorbell:1.5","lunch","snack","tea","cozy:2","warm","happy","back home:2","bed"] },
  wonder:    { label: "Wonder",        color: "#86d4ea", desc: "High bells over a bright floating pad",
    kw: ["sparkly:1.5","sparkle:1.5","glow:1.5","glowing:1.5","rainbow","gold","silver","amazing:1.5","beautiful:1.5","never seen:2","wow","shining","crystal","magic"] },
  potion:    { label: "Potion magic",  color: "#b48cf2", desc: "Swirling dorian bells and bubbles",
    kw: ["potion:2.5","ingredient:2","brew:2","sip:1.5","drink","cauldron:2","spell:2","bubbling:2","poof:1.5","kersploosh:2","boil:1.5","fish to pish:2"] },
  journey:   { label: "Setting off",   color: "#6cc3a0", desc: "Plucked strings, marching drum, sea breeze",
    kw: ["sail:2","sailing:2","ship:1.5","boat:1.5","map:1.5","travel","land ho:2.5","island","road trip:2","train","set off:2","adventure","across the"] },
  flight:    { label: "Flight",        color: "#93c2ff", desc: "Fast rising bells, wind, open lydian",
    kw: ["fly:2","flew:2","flying:2","flap:2","wing:1.5","soar:2.5","soared:2.5","sky","cloud","whoosh:1.5","owl","in the air:2"] },
  deep:      { label: "The deep",      color: "#3f7fbf", desc: "Low dark drone, slow bells, bubbles",
    kw: ["ocean:1.5","underwater:2.5","deep:2","shark:.6","whale:2","swim:1","swam:1","sea:.8","kelp","fish","bubble","mergirl","coral","diving:2"] },
  mischief:  { label: "Mischief",      color: "#f29fc6", desc: "Bouncy pizzicato and ticking",
    kw: ["yuck:2","blah:2","yucky:2","silly:2","tricked","crunch:1.5","munch:1.5","spat","mud","ptewie:2","giggle","funny:1.5","stinky:2","puke","grrr:1.5","disgusting:2","dirty"] },
  trouble:   { label: "Uh-oh",         color: "#e2786a", desc: "Pulsing low ostinato and heartbeat",
    kw: ["problem:2","oh no:2.5","uh oh:2.5","stuck:2","buried:2","broken","danger:2.5","scary:2","help:1","rush","can't:1","hurry:2","emergency:2"] },
  sad:       { label: "Lonely",        color: "#8b93cc", desc: "Slow falling bells in minor",
    kw: ["sad:2.5","lonely:2.5","lost:1.5","cry:2","crying:2","alone:2","poor:1","miss","went out:1.5","no glow:2"] },
  search:    { label: "Searching",     color: "#d2bd5c", desc: "Curious dorian pluck and steady pulse",
    kw: ["find:1.5","look for:2","search:2.5","searched:2.5","where:1","mission:2","flashlight:1.5","clue:2","trail:2","follow:1.5","quest:2","looking"] },
  triumph:   { label: "Rescue!",       color: "#f4c542", desc: "Big warm chords, drums, rising bells",
    kw: ["found:1.2","we found:3","found you:3","saved:2.5","saves the day:3","rescue:2","hooray:3","yay:2.5","did it:2.5","it worked:3","fixed:2","we did"] },
  friends:   { label: "Friends",       color: "#ef8e8e", desc: "Lyrical major, broken chords",
    kw: ["friend:1.5","thank you:2","nice to meet:2","together:1.5","hug:2","hold hands:2","love you:2","welcome","help you:1.5","company"] },
  nightfall: { label: "Nightfall",     color: "#6c62b8", desc: "Dim lydian chords, sparse bells, breeze",
    kw: ["sunset:2.5","night:1.5","dark:1","darkness:2","moon:1.5","stars","evening:2","quiet:1.5"] },
  lullaby:   { label: "Goodnight",     color: "#a9b3e2", desc: "Slow music-box lullaby",
    kw: ["the end:3","end of:1.5","goodnight:3","good night:3","sleep:1.5","turn off the light:3","mwah:2","sweet dreams:3","bedtime"] },
};
export const MOOD_IDS = Object.keys(MOODS);

// The lab's keywords come from bedtime stories; these add words that turn up
// in small explorable places (rooms, towns, outdoors).
const MORE_KW = {
  settling: ['rain:1.5', 'raining:1.5', 'rainy:1.5', 'puddle:1.2', 'drip', 'nap:1.5', 'couch'],
  cozy: ['kitchen:2', 'toast:1.5', 'bakery:2', 'bread:1.5', 'pancake:1.5', 'piano', 'radio', 'cat', 'saturday:1.5', 'living room:2', 'porch', 'smells like:1.5'],
  wonder: ['lighthouse:1.5', 'telescope:1.5', 'spyglass:1.5', 'view', 'whole street:1.5', 'whole harbor:2', 'sunrise:1.5', 'shell'],
  journey: ['pier:2', 'harbor:2', 'dock:2', 'fisherman:1.5', 'seagull:1.5', 'boats:1.5', 'rocks', 'street'],
  deep: ['waves:1.5', 'cold sand:1.5', 'beach:1.2', 'shore:1.5'],
  search: ['attic:2.5', 'dusty:2', 'dust:1.5', 'trunk:1.5', 'boxes:1.5', 'drawer', 'hidden:2', 'secret:2', 'mystery:2', 'corridor:1.5'],
  trouble: ['alarm:2.5', 'siren:2', 'warning:2', 'flashing:1.5', 'evacuate:2.5', 'breach:2.5'],
  mischief: ['mouse:1', 'squeak:1.5', 'frog:1.2', 'splash:1.5', 'muddy:1.5'],
  flight: ['rocket:1.5', 'launch:2', 'blasts:2', 'pod:1'],
  nightfall: ['window:1', 'airlock:1.5'],
};

// Four clips per mood: title, composer/source, key (0 = C) and mode, spectral
// brightness, and busyness — measured in the lab, used to pick smooth changes.
export const CLIPS = {
  settling: [
    {"title": "Shrine", "credit": "yd", "key": 0, "mode": "maj", "bright": 745, "busy": 0.89, "file": "settling-1.m4a"},
    {"title": "Rainy", "credit": "Ove Melaa", "key": 1, "mode": "min", "bright": 1599, "busy": 0.82, "file": "settling-2.m4a"},
    {"title": "Nature", "credit": "John Dum, Hedgewars", "key": 0, "mode": "maj", "bright": 908, "busy": 1.08, "file": "settling-3.m4a"},
    {"title": "Cradle of Civilization", "credit": "0 A.D.", "key": 2, "mode": "maj", "bright": 968, "busy": 1.17, "file": "settling-4.m4a"},
  ],
  once_upon: [
    {"title": "Elvish Theme", "credit": "Battle for Wesnoth", "key": 0, "mode": "min", "bright": 1641, "busy": 1.05, "file": "once_upon-1.m4a"},
    {"title": "Elf Land", "credit": "Battle for Wesnoth", "key": 10, "mode": "maj", "bright": 1089, "busy": 0.94, "file": "once_upon-2.m4a"},
    {"title": "Sunrise", "credit": "0 A.D.", "key": 4, "mode": "min", "bright": 994, "busy": 1.2, "file": "once_upon-3.m4a"},
    {"title": "As Seasons Change", "credit": "0 A.D.", "key": 2, "mode": "min", "bright": 890, "busy": 1.29, "file": "once_upon-4.m4a"},
  ],
  cozy: [
    {"title": "Caketown", "credit": "Matthew Pablo", "key": 2, "mode": "maj", "bright": 912, "busy": 1.28, "file": "cozy-1.m4a"},
    {"title": "Town Theme", "credit": "Flare", "key": 9, "mode": "min", "bright": 544, "busy": 1.03, "file": "cozy-2.m4a"},
    {"title": "Tavern in the Mist", "credit": "0 A.D.", "key": 0, "mode": "min", "bright": 1312, "busy": 1.3, "file": "cozy-3.m4a"},
    {"title": "An Old Warhorse Goes to Pasture", "credit": "0 A.D.", "key": 9, "mode": "min", "bright": 905, "busy": 1.49, "file": "cozy-4.m4a"},
  ],
  wonder: [
    {"title": "Silvan Sanctuary", "credit": "Battle for Wesnoth", "key": 7, "mode": "maj", "bright": 1260, "busy": 1.14, "file": "wonder-1.m4a"},
    {"title": "Mountain Shrine", "credit": "Valyria Tear", "key": 3, "mode": "min", "bright": 582, "busy": 1.27, "file": "wonder-2.m4a"},
    {"title": "Mountain Idyll", "credit": "0 A.D.", "key": 5, "mode": "maj", "bright": 1266, "busy": 0.94, "file": "wonder-3.m4a"},
    {"title": "Elysian Fields", "credit": "0 A.D.", "key": 0, "mode": "min", "bright": 1181, "busy": 1.0, "file": "wonder-4.m4a"},
  ],
  potion: [
    {"title": "Magical Theme", "credit": "Flare", "key": 9, "mode": "min", "bright": 495, "busy": 0.98, "file": "potion-1.m4a"},
    {"title": "Revelation", "credit": "Battle for Wesnoth", "key": 8, "mode": "min", "bright": 641, "busy": 1.02, "file": "potion-2.m4a"},
    {"title": "Karmic Confluence", "credit": "0 A.D.", "key": 6, "mode": "maj", "bright": 1485, "busy": 1.38, "file": "potion-3.m4a"},
    {"title": "Mirage", "credit": "0 A.D.", "key": 4, "mode": "min", "bright": 977, "busy": 1.36, "file": "potion-4.m4a"},
  ],
  journey: [
    {"title": "Overworld Theme", "credit": "Flare", "key": 9, "mode": "min", "bright": 1120, "busy": 1.25, "file": "journey-1.m4a"},
    {"title": "Expedition", "credit": "0 A.D.", "key": 2, "mode": "maj", "bright": 827, "busy": 1.3, "file": "journey-2.m4a"},
    {"title": "Pirate", "credit": "Jonatan Nilsson, Hedgewars", "key": 4, "mode": "maj", "bright": 1205, "busy": 1.3, "file": "journey-3.m4a"},
    {"title": "The Road Ahead", "credit": "0 A.D.", "key": 11, "mode": "min", "bright": 1020, "busy": 1.22, "file": "journey-4.m4a"},
  ],
  flight: [
    {"title": "Return to Wesnoth", "credit": "Battle for Wesnoth", "key": 10, "mode": "min", "bright": 1402, "busy": 0.99, "file": "flight-1.m4a"},
    {"title": "Overworld", "credit": "Valyria Tear", "key": 2, "mode": "maj", "bright": 767, "busy": 1.12, "file": "flight-2.m4a"},
    {"title": "Land Between the Two Seas", "credit": "0 A.D.", "key": 0, "mode": "maj", "bright": 1227, "busy": 2.19, "file": "flight-3.m4a"},
    {"title": "Peaks of Atlas", "credit": "0 A.D.", "key": 10, "mode": "min", "bright": 1026, "busy": 1.37, "file": "flight-4.m4a"},
  ],
  deep: [
    {"title": "Underground", "credit": "Battle for Wesnoth", "key": 7, "mode": "min", "bright": 780, "busy": 0.88, "file": "deep-1.m4a"},
    {"title": "Cave Theme", "credit": "Flare", "key": 9, "mode": "min", "bright": 244, "busy": 0.72, "file": "deep-2.m4a"},
    {"title": "Underwater", "credit": "Hedgewars", "key": 2, "mode": "maj", "bright": 532, "busy": 2.09, "file": "deep-3.m4a"},
    {"title": "Water's Edge", "credit": "0 A.D.", "key": 4, "mode": "min", "bright": 812, "busy": 1.16, "file": "deep-4.m4a"},
  ],
  mischief: [
    {"title": "School of Quirks", "credit": "Zander Noriega", "key": 8, "mode": "min", "bright": 1523, "busy": 2.03, "file": "mischief-1.m4a"},
    {"title": "Three Sheets to the Wind", "credit": "Battle for Wesnoth", "key": 6, "mode": "min", "bright": 1492, "busy": 1.02, "file": "mischief-2.m4a"},
    {"title": "Sheep", "credit": "Hedgewars", "key": 0, "mode": "maj", "bright": 821, "busy": 1.83, "file": "mischief-3.m4a"},
    {"title": "Whistler", "credit": "0 A.D.", "key": 0, "mode": "maj", "bright": 1099, "busy": 1.12, "file": "mischief-4.m4a"},
  ],
  trouble: [
    {"title": "Suspense", "credit": "Battle for Wesnoth", "key": 0, "mode": "min", "bright": 1077, "busy": 0.99, "file": "trouble-1.m4a"},
    {"title": "Awareness", "credit": "el Corleo", "key": 4, "mode": "min", "bright": 1075, "busy": 1.12, "file": "trouble-2.m4a"},
    {"title": "Calm Before the Storm", "credit": "0 A.D.", "key": 0, "mode": "min", "bright": 1303, "busy": 1.33, "file": "trouble-3.m4a"},
    {"title": "Halloween", "credit": "Hedgewars", "key": 2, "mode": "min", "bright": 1406, "busy": 1.81, "file": "trouble-4.m4a"},
  ],
  sad: [
    {"title": "Sad Moment", "credit": "Valyria Tear", "key": 5, "mode": "min", "bright": 1308, "busy": 0.93, "file": "sad-1.m4a"},
    {"title": "Sad", "credit": "Battle for Wesnoth", "key": 2, "mode": "maj", "bright": 843, "busy": 0.8, "file": "sad-2.m4a"},
    {"title": "Dried Tears", "credit": "0 A.D.", "key": 4, "mode": "min", "bright": 1366, "busy": 0.98, "file": "sad-3.m4a"},
    {"title": "Hill of Sorrows", "credit": "0 A.D.", "key": 1, "mode": "min", "bright": 953, "busy": 1.24, "file": "sad-4.m4a"},
  ],
  search: [
    {"title": "Into the Shadows", "credit": "Battle for Wesnoth", "key": 11, "mode": "min", "bright": 849, "busy": 0.97, "file": "search-1.m4a"},
    {"title": "Dungeon Theme", "credit": "Flare", "key": 4, "mode": "min", "bright": 726, "busy": 0.84, "file": "search-2.m4a"},
    {"title": "Northern Frontier", "credit": "0 A.D.", "key": 4, "mode": "min", "bright": 912, "busy": 1.38, "file": "search-3.m4a"},
    {"title": "Point of No Return", "credit": "0 A.D.", "key": 0, "mode": "maj", "bright": 1130, "busy": 1.29, "file": "search-4.m4a"},
  ],
  triumph: [
    {"title": "Heroism", "credit": "Edward J. Blakeley", "key": 5, "mode": "min", "bright": 1040, "busy": 1.21, "file": "triumph-1.m4a"},
    {"title": "Heroes' Rite", "credit": "Battle for Wesnoth", "key": 0, "mode": "min", "bright": 1127, "busy": 0.9, "file": "triumph-2.m4a"},
    {"title": "You Are Victorious!", "credit": "0 A.D.", "key": 6, "mode": "min", "bright": 1311, "busy": 1.21, "file": "triumph-3.m4a"},
    {"title": "Forging a City-State", "credit": "0 A.D.", "key": 7, "mode": "min", "bright": 1190, "busy": 1.06, "file": "triumph-4.m4a"},
  ],
  friends: [
    {"title": "Love Theme", "credit": "Battle for Wesnoth", "key": 9, "mode": "min", "bright": 1264, "busy": 0.96, "file": "friends-1.m4a"},
    {"title": "Soliloquy", "credit": "Matthew Pablo", "key": 10, "mode": "maj", "bright": 1091, "busy": 1.06, "file": "friends-2.m4a"},
    {"title": "Solstice Festival", "credit": "0 A.D.", "key": 0, "mode": "maj", "bright": 957, "busy": 1.5, "file": "friends-3.m4a"},
    {"title": "Harvest Festival", "credit": "0 A.D.", "key": 4, "mode": "min", "bright": 1239, "busy": 1.78, "file": "friends-4.m4a"},
  ],
  nightfall: [
    {"title": "Forest at Night", "credit": "Valyria Tear", "key": 7, "mode": "min", "bright": 2026, "busy": 0.87, "file": "nightfall-1.m4a"},
    {"title": "Nunc Dimittis", "credit": "Battle for Wesnoth", "key": 7, "mode": "maj", "bright": 1238, "busy": 0.99, "file": "nightfall-2.m4a"},
    {"title": "Harvest Moon", "credit": "0 A.D.", "key": 2, "mode": "min", "bright": 909, "busy": 1.35, "file": "nightfall-3.m4a"},
    {"title": "Albian Nocturne", "credit": "0 A.D.", "key": 0, "mode": "maj", "bright": 1206, "busy": 0.98, "file": "nightfall-4.m4a"},
  ],
  lullaby: [
    {"title": "Safe Room Theme", "credit": "Flare", "key": 1, "mode": "min", "bright": 706, "busy": 1.67, "file": "lullaby-1.m4a"},
    {"title": "Transience", "credit": "Battle for Wesnoth", "key": 9, "mode": "min", "bright": 845, "busy": 0.9, "file": "lullaby-2.m4a"},
    {"title": "Juno Protect You", "credit": "0 A.D.", "key": 2, "mode": "min", "bright": 1104, "busy": 1.34, "file": "lullaby-3.m4a"},
    {"title": "Midwinter", "credit": "0 A.D.", "key": 5, "mode": "min", "bright": 551, "busy": 1.08, "file": "lullaby-4.m4a"},
  ],
};

export const moodLabel = (id) => MOODS[id]?.label || id;

// ---- suggestions -------------------------------------------------------------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LEX = [];
for (const id of MOOD_IDS) {
  for (const k of [...MOODS[id].kw, ...(MORE_KW[id] || [])]) {
    const [word, w] = k.split(':');
    LEX.push({ id, w: parseFloat(w || '1'), re: new RegExp('\\b' + escapeRe(word).replace(/'/g, "['’]") + '(?:e?s)?\\b', 'gi') });
  }
}

// Moods ranked by weighted keyword hits in the text, best first.
export function suggestMusic(text, limit = 2) {
  const s = {};
  for (const L of LEX) {
    const n = (String(text || '').match(L.re) || []).length;
    if (n) s[L.id] = (s[L.id] || 0) + n * L.w;
  }
  return Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}

// ---- clip engine (the lab's ClipEngine / makeVoice) -------------------------
function tonicPos(c) { const t = c.mode === 'min' ? (c.key + 3) % 12 : c.key; return (t * 7) % 12; }
function clipDistance(a, b) {
  if (!a || !b) return 0;
  const d = Math.abs(tonicPos(a) - tonicPos(b));
  const fifths = Math.min(d, 12 - d) / 6;
  return fifths * 0.5 + Math.min(1, Math.abs(a.bright - b.bright) / 900) * 0.3 + Math.min(1, Math.abs(a.busy - b.busy) / 1.2) * 0.2;
}

const XF = 2.5; // crossfade between consecutive clips, seconds
const FADE = { trouble: 1.5, triumph: 1.5 }; // the lab's quicker moods; others fade over 3 s
let voice = null;
let currentId = null;
let currentClip = null; // last clip that started, for picking a smooth next one
let nowPlaying = null; // that clip, if it belongs to the current mood
export const currentMusic = () => currentId;
export const currentTrack = () => nowPlaying && `${nowPlaying.title} (${nowPlaying.credit})`;

const clipUrl = (c) => `music/${c.file}`;

function firstClip(id) {
  const list = CLIPS[id];
  if (!currentClip) return Math.floor(Math.random() * list.length);
  let best = 0;
  let bd = Infinity;
  list.forEach((c, i) => { const d = clipDistance(currentClip, c) + Math.random() * 0.15; if (d < bd) { bd = d; best = i; } });
  return best;
}

export function setMusic(id) {
  id = CLIPS[id] ? id : null;
  if (id === currentId) return;
  const fade = FADE[id] || 3;
  voice?.stop(id ? fade : 2);
  voice = null;
  nowPlaying = null;
  currentId = id;
  if (id) voice = makeVoice(id, fade, firstClip(id));
}

function makeVoice(id, fade, startIdx) {
  const ctx = audioContext();
  const list = CLIPS[id];
  const g = ctx.createGain();
  g.connect(musicOut());
  let stopped = false;
  let timer = null;
  let srcs = [];
  let k = startIdx;
  async function next(at, first) {
    if (stopped) return;
    const clip = list[k % list.length];
    k++;
    let buf;
    try { buf = await load(clipUrl(clip)); } catch { return; }
    if (stopped) return;
    const t = Math.max(at, ctx.currentTime + 0.05);
    const dur = buf.duration;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const sg = ctx.createGain();
    s.connect(sg);
    sg.connect(g);
    sg.gain.setValueAtTime(first ? 1 : 0, t);
    if (!first) sg.gain.linearRampToValueAtTime(1, t + XF);
    sg.gain.setValueAtTime(1, t + dur - XF);
    sg.gain.linearRampToValueAtTime(0, t + dur);
    s.start(t);
    s.stop(t + dur + 0.05);
    srcs.push(s);
    s.onended = () => { srcs = srcs.filter((x) => x !== s); };
    setTimeout(() => { if (!stopped) currentClip = nowPlaying = clip; }, Math.max(0, (t - ctx.currentTime) * 1000));
    load(clipUrl(list[k % list.length])).catch(() => {}); // fetch the next clip early
    const nextAt = t + dur - XF;
    timer = setTimeout(() => next(nextAt, false), Math.max(0, (nextAt - ctx.currentTime - 1.5) * 1000));
  }
  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(1, t0 + fade);
  next(t0, true);
  return {
    stop(f) {
      stopped = true;
      clearTimeout(timer);
      const n = ctx.currentTime;
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(g.gain.value, n);
      g.gain.linearRampToValueAtTime(0, n + f);
      setTimeout(() => { srcs.forEach((s) => { try { s.stop(); } catch {} }); g.disconnect(); }, f * 1000 + 300);
    },
  };
}

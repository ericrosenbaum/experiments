// World Finder: the sentence parser and the decision model, against the
// rendered worlds in public/finder/worlds.json.
import fs from 'node:fs';
import { parse, prefsFrom, read, decide, CRITERIA_BY_ID } from '../src/finder/model.js';

const WORLDS = JSON.parse(fs.readFileSync(new URL('../public/finder/worlds.json', import.meta.url)));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const said = (t) => parse(t).map((p) => `${p.polarity > 0 ? '+' : '-'}${p.id}`).join(' ');
const picks = (prefs) => WORLDS.filter((w) => decide(read(w).facts, prefs).pick).map((w) => w.id);

// ---- parsing ---------------------------------------------------------------------
check(said('I like dragons and castles, but nothing too scary. Something easy!') === '+dragons +castles -spooky +beginner', 'likes, a negated clause, and a level word');
check(said('space with no gravity') === '+space +float', '"no gravity" is a thing you like, not a negation');
check(said('I hate racing. I love cozy farms') === '-racing +cozy +farms', 'negation ends at the sentence');
check(said('too easy is boring, I want tricky puzzles') === '-beginner +advanced +building', '"too easy" is a dislike');
check(said('robots too!') === '+robots', '"too" on its own is not a negation');
check(said('qwerty') === '', 'unknown words give nothing');
check(JSON.stringify(prefsFrom(parse('dragons. no dragons'))) === '{"dragons":-1}', 'the last thing said wins');
for (const p of parse('dragons castles space robots farms easy hard africa')) check(p.id in CRITERIA_BY_ID, `parses to a real criterion: ${p.id}`);

// ---- reading worlds ----------------------------------------------------------------
check(WORLDS.length >= 20, `${WORLDS.length} worlds rendered`);
for (const w of WORLDS) {
  const { facts } = read(w);
  const region = facts.find((f) => f.kind === 'maker').hits[0]?.crit;
  if (!region) check(false, `${w.id}: maker's country has a region`);
  if (!facts.some((f) => f.kind === 'level')) check(false, `${w.id}: has a level`);
  if (!fs.existsSync(new URL(`../public/${w.thumb}`, import.meta.url))) check(false, `${w.id}: thumbnail exists`);
  for (const b of w.behaviors) if (b.notes) check(false, `${w.id}: "${b.text}" compiled without notes (${b.notes})`);
}
check(true, 'every world has a region, a level and a thumbnail; every behavior compiled');

// ---- deciding --------------------------------------------------------------------------
const space = picks({ space: 1, float: 1 });
check(['planet-zib', 'moon-base', 'alien-zoo', 'asteroid-dodge'].every((id) => space.includes(id)) && space.length === 4, `space + low gravity picks the four space worlds (${space})`);
check(picks({ robots: 1, music: 1 }).includes('robot-disco'), 'robots + music finds the dance party');
const scary = picks({ dragons: 1, castles: 1, spooky: -1 });
check(scary.includes('dragon-mountain') && !scary.includes('hay-maze'), `dragons + castles, not spooky (${scary})`);
check(!picks({ cozy: 1, farms: 1, racing: -1 }).includes('moo-racetrack'), 'a dislike keeps the racetrack out');
check(picks({}).length === 0 && picks({ spooky: -1 }).length === 0, 'nothing is picked without a like');
const d = decide(read(WORLDS.find((w) => w.id === 'pond-picnic')).facts, { cozy: 1, animals: 1 });
check(d.pick && d.reasons[0].p >= d.reasons.at(-1).p, 'reasons come best first');
const partial = decide(read(WORLDS[0]).facts, { dragons: 1 }, 1);
check(partial.p.dragons === 0, 'scoring part way through only counts the facts so far');

if (fails) { console.log(`${fails} failed`); process.exit(1); }

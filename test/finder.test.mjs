// World Finder: the sentence parser and the decision model, against the
// rendered worlds in public/finder/worlds.json.
import fs from 'node:fs';
import { parse, prefsFrom, read, decide, hitsFor, crit, CRITERIA, CRITERIA_BY_ID } from '../src/finder/model.js';
import { responseSchema, systemPrompt, buildUserMessage, keywordsOf } from '../src/finder/prompt.js';

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

// ---- keywords --------------------------------------------------------------------------
const KEYWORDS = keywordsOf(WORLDS);
check(WORLDS.every((w) => w.keywords?.length >= 10), 'every world has keywords');
check(KEYWORDS.length > 100 && KEYWORDS.every((k) => k === k.toLowerCase().trim()), `${KEYWORDS.length} keywords, lowercase`);
const geo = { 'kw:geology': { matches: ['volcano', 'lava', 'magma', 'fossil'], related: ['crystal'] } };
const geoPicks = WORLDS.filter((w) => decide(read(w).facts, { 'kw:geology': 1 }, undefined, geo).pick).map((w) => w.id);
check(geoPicks.includes('volcano-island') && !geoPicks.includes('wizard-tower'), `a keyword wish picks worlds with its keywords, not ones only loosely related (${geoPicks})`);
const volcano = read(WORLDS.find((w) => w.id === 'volcano-island')).facts.find((f) => f.kind === 'keywords');
check(hitsFor(volcano, { 'kw:geology': 1 }, geo)[0]?.w === 1, 'a world keyword fills the wish that matches it');
const wiz = read(WORLDS.find((w) => w.id === 'wizard-tower')).facts.find((f) => f.kind === 'keywords');
check(hitsFor(wiz, { 'kw:geology': 1 }, geo)[0]?.w < 0.5, 'a related keyword counts for less than the bar');
const both = decide(read(WORLDS.find((w) => w.id === 'dragon-mountain')).facts, { dragons: 1, 'kw:bones': 1 }, undefined, { 'kw:bones': ['fossil', 'bone'] });
check(!both.pick, 'a keyword wish counts double, so meeting only the tag beside it isn\'t enough');
check(parse('I want lava, not a fossil', KEYWORDS).map((p) => `${p.polarity > 0 ? '+' : '-'}${p.id}`).join(' ') === '+kw:lava -kw:fossil', 'offline: world keywords become keyword wishes');
check(parse('dragons and lava', KEYWORDS).map((p) => p.id).join(' ') === 'dragons kw:lava', 'offline: a word the tag list knows stays a tag');
check(crit('kw:lava').label === 'lava' && crit('dragons').label === 'Dinos & dragons', 'labels for tags and keyword wishes');

// ---- the Claude prompt -------------------------------------------------------------------
const schema = responseSchema(KEYWORDS), SYSTEM_PROMPT = systemPrompt(KEYWORDS);
const ids = schema.properties.wishes.items.properties.id.enum;
check(ids.length === CRITERIA.length && CRITERIA.every((c) => ids.includes(c.id)), 'the schema can name every tag, and only tags');
check(schema.properties.keywords.items.properties.matches.items.enum === KEYWORDS, 'the schema can name every keyword, and only keywords');
check(CRITERIA.every((c) => SYSTEM_PROMPT.includes(`  ${c.id}: ${c.label}`)), 'the prompt lists every tag');
check(SYSTEM_PROMPT.includes(KEYWORDS.join(', ')), 'the prompt lists every keyword');
check(buildUserMessage('dragons <3').includes('<said>\ndragons <3\n</said>'), 'the user message wraps what the kid said');

if (fails) { console.log(`${fails} failed`); process.exit(1); }

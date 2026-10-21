import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { morphFromXml, morphToXml, morphToCompact, morphFromCompact, morphFromText } from '../src/morph-format.js';

const dir = new URL('../public/assets/examples/', import.meta.url);
const exampleFiles = readdirSync(dir).filter((f) => f.endsWith('.xml'));

test('every example file parses', () => {
  assert.ok(exampleFiles.length >= 40);
  for (const f of exampleFiles) {
    const m = morphFromXml(readFileSync(new URL(f, dir), 'utf8'));
    const items = m.bells.length + m.recBells.length + m.paths.length + m.lines.length;
    assert.ok(items > 0, `${f} is empty`);
    assert.ok(Number.isFinite(m.view.zoom) && m.view.zoom > 0, `${f} zoom`);
    for (const b of m.bells) {
      assert.ok(b.note >= 0 && b.note <= 12 && b.octave >= 0 && b.octave <= 2, `${f} bell range`);
      assert.ok(b.instrument >= 0 && b.instrument <= 4, `${f} instrument`);
    }
  }
});

test('reads the first example exactly', () => {
  const m = morphFromXml(readFileSync(new URL('2013-04-16-22-51-44-219.xml', dir), 'utf8'));
  assert.equal(m.view.zoom, 0.326157);
  assert.deepEqual(m.bells[0], { x: 1418, y: 408, note: 2, octave: 1, instrument: 3 });
  assert.deepEqual(m.recBells[0].notes[2], { time: 0.03125, note: 0, octave: 1, velocity: 0.911611, instrument: 3 });
});

test('decodes entities in titles', () => {
  const titles = exampleFiles.map((f) => morphFromXml(readFileSync(new URL(f, dir), 'utf8')).title);
  assert.ok(titles.includes('Heart & Soul'));
  assert.ok(titles.includes("It's all a big hustle"));
});

test('XML and compact forms round-trip', () => {
  for (const f of exampleFiles) {
    const m = morphFromXml(readFileSync(new URL(f, dir), 'utf8'));
    const again = morphFromXml(morphToXml(m));
    assert.deepEqual(again.bells, m.bells.map((b) => ({ ...b, x: Math.round(b.x), y: Math.round(b.y) })));
    assert.equal(again.recBells.length, m.recBells.length);
    assert.equal(again.paths.length, m.paths.length);
    const viaCompact = morphFromText(JSON.stringify(morphToCompact(again)));
    assert.deepEqual(viaCompact.bells, again.bells);
    assert.deepEqual(viaCompact.lines, again.lines);
    assert.equal(viaCompact.title, again.title);
    assert.deepEqual(
      viaCompact.paths.map((p) => p.points.length),
      again.paths.map((p) => p.points.length),
    );
  }
});

test('compact rejects other JSON', () => {
  assert.throws(() => morphFromCompact({ hello: 1 }));
});

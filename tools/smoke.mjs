// Drive the app in headless Chromium: visit every world, select things, drive
// with the keys (only the selected thing should move), drag, clone, teach
// behaviors through the composer, and take screenshots.
// usage: node tools/smoke.mjs [url] [outdir] [chromium executable]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

// Headless software rendering is far too slow for the full graphics (a few
// frames a second, so physics runs in slow motion); use the plain look.
const url = (() => { const u = new URL(process.argv[2] ?? 'http://localhost:5173/'); if (!u.searchParams.has('fx')) u.searchParams.set('fx', 'low'); return u.href; })();
const out = process.argv[3] ?? '.';
const exe = process.argv[4] ?? [
  '/opt/pw-browsers/chromium',
  `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) process.exitCode = 1; };

await page.goto(url);
await page.waitForFunction(() => window.__bb?.stage?.worldId, null, { timeout: 30000 });
await page.waitForTimeout(1500);

const pos = (key) => page.evaluate((k) => { const p = window.__bb.world.actor(k).position; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }; }, key);
const selectKey = (key) => page.evaluate((k) => window.__bb.app.select(window.__bb.world.actor(k)), key);
const selected = () => page.evaluate(() => window.__bb.app.selected?.key ?? null);
const running = () => page.evaluate(() => [...window.__bb.runtime.programs].map((p) => `${p.actor.key}:${p.behavior.running ? 'ok' : 'loading'}`));
// screen position of an actor
const screenOf = (key) => page.evaluate((k) => {
  const { world, camera } = window.__bb;
  const v = world.actor(k).position.project(camera);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}, key);

// ---- every world loads and its programs start ---------------------------------
for (const id of ['playground', 'castle', 'space', 'platformer', 'village', 'farm']) {
  await page.selectOption('#world-select', id);
  await page.waitForTimeout(2000);
  const progs = await running();
  check(progs.length > 0 && progs.every((p) => p.endsWith(':ok')), `${id}: ${progs.length} programs running`);
  await page.screenshot({ path: `${out}/world-${id}.png` });
}

// ---- keys go only to the selected thing -----------------------------------------
await page.selectOption('#world-select', 'castle');
await page.waitForTimeout(1500);
await page.mouse.click(300, 400); // focus the page (clicking the sky deselects)
await page.waitForTimeout(200);
await selectKey('knight');
const k0 = await pos('knight'), h0 = await pos('horse'), c0 = await pos('catapult');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(1200);
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(400);
const k1 = await pos('knight'), c1 = await pos('catapult');
check(Math.hypot(k1.x - k0.x, k1.z - k0.z) > 4, `the selected knight drives with ↑ (${Math.hypot(k1.x - k0.x, k1.z - k0.z).toFixed(1)} studs)`);
check(Math.hypot(c1.x - c0.x, c1.z - c0.z) < 0.5, 'the catapult (also taught ← →) stays put');
void h0;

// the catapult throws on space only when it's selected
const bricks = () => page.evaluate(() => [...window.__bb.world.entities.values()].filter((e) => e.owner?.key === 'catapult').length);
await page.keyboard.press(' ');
await page.waitForTimeout(400);
check(await bricks() === 0, 'space does nothing to the catapult while the knight is selected');
await selectKey('catapult');
await page.keyboard.press(' ');
await page.waitForTimeout(3000);
check(await bricks() === 1, 'space makes the selected catapult throw');
await page.screenshot({ path: `${out}/castle-throw.png` });

// ---- clicking selects: a model, a whole assembly, one brick, the World ---------
await page.selectOption('#world-select', 'playground');
await page.waitForTimeout(1500);
let s = await screenOf('tower');
await page.mouse.click(s.x, s.y);
await page.waitForTimeout(300);
check(await selected() === 'tower', `clicking the tower selects the whole tower (${await selected()})`);
await page.mouse.dblclick(s.x, s.y);
await page.waitForTimeout(300);
const piece = await selected();
check(/^tower\.\d+$/.test(piece ?? ''), `double-clicking picks one brick (${piece})`);
await page.click('#btn-whole');
check(await selected() === 'tower', 'the ⬆ button goes back to the whole tower');
await page.mouse.click(700, 700); // ground near the bottom of the view
await page.waitForTimeout(300);
check(await selected() === 'world', `clicking the ground selects the World (${await selected()})`);
await page.screenshot({ path: `${out}/world-rules.png` });

// ---- drag to move ----------------------------------------------------------------
await selectKey('robot');
s = await screenOf('robot');
const r0 = await pos('robot');
await page.mouse.move(s.x, s.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(s.x + i * 15, s.y + i * 5);
await page.mouse.wheel(0, 100);
await page.mouse.up();
await page.waitForTimeout(800);
const r1 = await pos('robot');
check(Math.hypot(r1.x - r0.x, r1.z - r0.z) > 3, `dragging moves the robot (${Math.hypot(r1.x - r0.x, r1.z - r0.z).toFixed(1)} studs)`);
check(await selected() === 'robot', 'and it stays selected');
await page.click('#btn-reset');
await page.waitForTimeout(800);
const r2 = await pos('robot');
check(Math.hypot(r2.x - r1.x, r2.z - r1.z) < 1, 'Reset keeps it where it was dragged');

// ---- teach through the composer --------------------------------------------------
async function teach(key, text) {
  await selectKey(key);
  await page.click('#composer');
  await page.keyboard.type(text);
  await page.click('#btn-make');
  await page.waitForFunction(() => !document.getElementById('btn-make').disabled, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  return page.evaluate((k) => { const b = window.__bb.stage.behaviorsOf(k).at(-1); return { code: b?.code, summary: b?.summary, notes: b?.notes, source: b?.source }; }, key);
}
const copyCount = () => page.evaluate(() => [...window.__bb.world.byThing.keys()].filter((k) => k.includes('~')).length);
let b = await teach('tower', 'When I press c, make a copy of itself to the right.');
console.log('  tower behavior:', b.source, b.summary, b.notes || '');
await page.mouse.click(5, 300); // blur the composer (left edge: sky)
await selectKey('tower');
await page.keyboard.press('c');
await page.waitForTimeout(1500);
check(await copyCount() === 1, 'pressing c clones the selected tower');
await page.screenshot({ path: `${out}/tower-copy.png` });

b = await teach('world', 'When I press g, turn off gravity.');
console.log('  world rule:', b.source, b.summary, b.notes || '');
await page.mouse.click(5, 300);
await selectKey('world');
await page.keyboard.press('g');
await page.waitForTimeout(500);
check(await page.evaluate(() => window.__bb.world.gravityScale) === 0, 'a World rule turns off gravity');

b = await teach('ball', 'When I press j, jump high and turn red.');
console.log('  ball behavior:', b.source, b.summary, b.notes || '');

// the 🗑 / ⧉ buttons
await selectKey('racecar');
await page.click('#btn-copy');
await page.waitForTimeout(500);
const sel = await selected();
check(sel?.startsWith('racecar~'), `⧉ copies the race car and selects the copy (${sel})`);
check(await page.evaluate((k) => window.__bb.stage.behaviorsOf(k).length, sel) === 1, 'the copy knows how to drive too');

await page.waitForTimeout(500);
console.log(errors.length ? `errors:\n  ${[...new Set(errors)].join('\n  ')}` : 'no page errors');
if (errors.some((e) => e.startsWith('pageerror'))) process.exitCode = 1;
await browser.close();

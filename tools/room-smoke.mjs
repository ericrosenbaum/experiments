// Two pages in one room, in headless Chromium: both see the same world, a
// drive in one tab moves the thing in the other, locks show up, a behavior
// taught in one tab runs for both, and Reset in one resets both.
// usage: node tools/room-smoke.mjs [url] [outdir] [chromium executable]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const room = `t${Math.random().toString(36).slice(2, 7)}`;
const base = new URL(process.argv[2] ?? 'http://localhost:5173/');
base.searchParams.set('fx', 'low');
base.searchParams.set('room', room);
const out = process.argv[3] ?? '.';
const exe = process.argv[4] ?? [
  '/opt/pw-browsers/chromium',
  `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) process.exitCode = 1; };
const open = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} ${m.type()}: ${m.text()}`); });
  await page.goto(`${base.href}#castle`);
  await page.waitForFunction(() => window.__bb?.session?.connected && window.__bb.session.worldId, null, { timeout: 90000, polling: 500 });
  await page.waitForTimeout(1200);
  return page;
};
// A page in the background gets no animation frames, so place the mirror's bodies before reading.
const pos = (page, key) => page.evaluate((k) => { window.__bb.session.update(); const p = window.__bb.world.actor(k).position; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }; }, key);
const front = async (page) => { await page.bringToFront(); await page.waitForTimeout(800); }; // a page that was in the background catches up on its messages
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const selectKey = (page, key) => page.evaluate((k) => window.__bb.app.select(window.__bb.world.actor(k)), key);
const selected = (page) => page.evaluate(() => window.__bb.app.selected?.key ?? null);

const A = await open('A');
const B = await open('B');
const ents = async (p) => p.evaluate(() => [...window.__bb.world.entities.keys()].sort());
const ea = await ents(A), eb = await ents(B);
check(ea.length > 20 && ea.join() === eb.join(), `both pages mirror the same ${ea.length} entities`);
check(await A.evaluate(() => window.__bb.session.players.length) === 2, 'both see two players');
check((await A.evaluate(() => window.__bb.session.running())).every((s) => s.endsWith(':ok')), 'the castle programs run on the server');

// ---- driving in A moves the knight in B ----------------------------------------
await front(A);
await A.mouse.click(300, 400);
await selectKey(A, 'knight');
await A.waitForTimeout(300);
const k0 = await pos(B, 'knight');
await A.keyboard.down('ArrowUp');
await A.waitForTimeout(1200);
await A.keyboard.up('ArrowUp');
await A.waitForTimeout(600);
const k1 = await pos(B, 'knight');
check(dist(k0, k1) > 4, `A drives the knight and B sees it move (${dist(k0, k1).toFixed(1)} studs)`);
const ka = await pos(A, 'knight');
check(dist(ka, k1) < 1.5, `both pages agree where it is (${dist(ka, k1).toFixed(2)} studs apart)`);

// ---- locks ----------------------------------------------------------------------
await front(B);
await B.mouse.click(300, 400);
await selectKey(B, 'knight');
await B.waitForTimeout(400);
check(await B.evaluate(() => window.__bb.app.readOnly), "B can look at the knight but it's A's");
check(await B.evaluate(() => !!document.querySelector('#sel-lock:not(.hidden)')), 'B sees who is using it');
const outline = await B.waitForFunction(() => { window.__bb.app.update(0); return [...window.__bb.app.marks.values()].some((m) => m.box.visible); }, null, { timeout: 5000, polling: 200 }).then(() => true, () => false);
check(outline, "B sees A's outline on the knight");
await selectKey(A, 'horse');
await A.waitForTimeout(500);
check(await B.evaluate(() => !window.__bb.app.readOnly) && await selected(B) === 'knight', 'when A lets go, B gets the knight');
await B.screenshot({ path: `${out}/room-b.png` });

// ---- teaching in B runs for both ---------------------------------------------------
await B.click('#composer');
await B.keyboard.type('When I press j, jump high.');
await B.click('#btn-make');
await B.waitForFunction(() => !document.getElementById('btn-make').disabled, null, { timeout: 60000 });
await B.waitForTimeout(800);
const listA = await A.evaluate(() => window.__bb.session.behaviorsOf('knight').map((b) => `${b.title}:${b.running}`));
check(listA.some((s) => s.endsWith(':true')) && listA.length >= 2, `A sees the knight's new behavior running (${listA.join(', ')})`);
await B.mouse.click(5, 300);
await selectKey(B, 'knight');
await B.waitForTimeout(300);
const y0 = (await pos(A, 'knight')).y;
await B.keyboard.press('j');
await B.waitForTimeout(400);
check((await pos(A, 'knight')).y > y0 + 1, 'B presses j and A sees the knight jump');

// ---- drag in A, seen in B; Reset in B, seen in A --------------------------------------
await front(A);
await selectKey(A, 'catapult');
await A.waitForTimeout(300);
const s = await A.evaluate(() => { const { world, camera } = window.__bb; const v = world.actor('catapult').position.project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
const c0 = await pos(B, 'catapult');
await A.mouse.move(s.x, s.y);
await A.mouse.down();
for (let i = 1; i <= 10; i++) { await A.mouse.move(s.x + i * 12, s.y + i * 4); await A.waitForTimeout(30); }
await A.mouse.up();
await A.waitForTimeout(800);
const c1 = await pos(B, 'catapult');
check(dist(c0, c1) > 2, `A drags the catapult and B sees it (${dist(c0, c1).toFixed(1)} studs)`);
await front(B);
await B.click('#btn-reset');
await B.waitForTimeout(1200);
check(dist(await pos(A, 'catapult'), c1) < 1, 'Reset in B keeps it where A dragged it, in A too');
check(dist(await pos(A, 'knight'), k0) < 1.5, 'and the knight is back at its start in A');

// ---- a page leaving frees its lock ------------------------------------------------------
await selectKey(B, 'knight');
await B.waitForTimeout(300);
await front(A);
await B.waitForTimeout(300);
await B.close();
await A.waitForTimeout(800);
check(await A.evaluate(() => window.__bb.session.players.length) === 1, 'A sees B leave');
await selectKey(A, 'knight');
await A.waitForTimeout(400);
check(!(await A.evaluate(() => window.__bb.app.readOnly)), "the knight is free again once B is gone");
await A.screenshot({ path: `${out}/room-a.png` });

console.log(errors.length ? `errors:\n  ${[...new Set(errors)].join('\n  ')}` : 'no page errors');
if (errors.some((e) => e.includes('pageerror'))) process.exitCode = 1;
await browser.close();

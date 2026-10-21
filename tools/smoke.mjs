// Drives the built app in headless Chromium: opens an example, plays bells,
// pulls one from the palette, records, draws a path. Run with the preview
// server up: npx vite preview --port 4173, then node tools/smoke.mjs [outdir]
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const url = process.env.URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => window.melodymorph?.textures);
await page.waitForSelector('#loading.done', { state: 'attached', timeout: 20000 });
await page.screenshot({ path: `${out}/1-help.png` });
await page.keyboard.press('Escape');

// pull a bell out of the palette (E, octave 1) and drop it on the canvas
const pnote = page.locator('.palette-octave').nth(1).locator('.pnote').nth(4);
const b = await pnote.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down();
await page.mouse.move(640, 420, { steps: 8 });
await page.mouse.up();
const n1 = await page.evaluate(() => window.melodymorph.items.length);
// tap it
await page.mouse.click(640, 420);
await page.screenshot({ path: `${out}/2-bell.png` });

// record two taps into a recorder bell
await page.click('#record');
await page.mouse.click(640, 420);
await page.waitForTimeout(300);
await page.mouse.click(640, 420);
await page.click('#record');
const kinds = await page.evaluate(() => window.melodymorph.items.map((i) => i.kind));

// draw a path through the bell
await page.keyboard.down('p');
await page.mouse.move(400, 420);
await page.mouse.down();
await page.mouse.move(520, 420, { steps: 5 });
await page.mouse.move(900, 420, { steps: 20 });
await page.mouse.up();
await page.keyboard.up('p');
const mode = await page.evaluate(() => window.melodymorph.mode);
await page.mouse.click(400, 420); // start the path player
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/3-path.png` });

// open an example
await page.click('#gear-btn');
await page.click('[data-action=open]');
await page.waitForSelector('.thumb');
await page.screenshot({ path: `${out}/4-open.png` });
page.once('dialog', (d) => d.accept());
await page.locator('.thumb').nth(18).dblclick();
await page.waitForTimeout(400);
const loaded = await page.evaluate(() => window.melodymorph.items.length);
await page.screenshot({ path: `${out}/5-example.png` });

// save dialog
await page.click('#gear-btn');
await page.click('[data-action=save]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/6-save.png` });
await page.click('text=Save to My Stuff');
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melodymorph.saves')).length);

// phone size
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/7-phone.png` });

console.log(JSON.stringify({ afterPalette: n1, kinds, mode, loaded, saved, errors }, null, 1));
await browser.close();

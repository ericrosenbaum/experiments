// Multi-touch checks in headless Chromium: pinch to zoom, and holding the
// pencil with one finger while drawing with another.
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.URL ?? 'http://localhost:4173/');
await page.waitForFunction(() => window.melodymorph?.textures);
await page.evaluate(() => document.querySelector('.close-x')?.click());
const cdp = await ctx.newCDPSession(page);
const touch = (type, points) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });

const z0 = await page.evaluate(() => window.melodymorph.camera.zoom);
await touch('touchStart', [[150, 600], [250, 600]]);
for (let i = 1; i <= 10; i++) await touch('touchMove', [[150 - i * 8, 600], [250 + i * 8, 600]]);
await touch('touchEnd', []);
const z1 = await page.evaluate(() => window.melodymorph.camera.zoom);

// hold the pencil (finger 0) and draw with finger 1
const pencil = await page.locator('[data-mode=draw]').boundingBox();
const px = pencil.x + pencil.width / 2;
const py = pencil.y + pencil.height / 2;
await touch('touchStart', [[px, py]]);
await touch('touchStart', [[px, py], [200, 500]]);
for (let i = 1; i <= 10; i++) await touch('touchMove', [[px, py], [200 + i * 10, 500 + i * 5]]);
await touch('touchEnd', [[px, py]]);
const during = await page.evaluate(() => window.melodymorph.mode);
await touch('touchEnd', []);
await page.waitForTimeout(100);
const after = await page.evaluate(() => ({ mode: window.melodymorph.mode, lines: window.melodymorph.lines.length }));
await page.screenshot({ path: `${out}/8-phone-touch.png` });
console.log(JSON.stringify({ z0, z1, during, after, errors }));
await browser.close();

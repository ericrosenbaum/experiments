// Render the minifig for review: front/side silhouettes (to overlay on the
// patent drawings) and shaded color views. Needs the dev server running.
// usage: node tools/minifig/review.mjs <outdir> [specs.json]
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? '.';
const specs = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : '[{}]';
const base = process.env.BRICK_URL ?? 'http://localhost:5173/';
const exe = ['/opt/pw-browsers/chromium', `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
for (const mode of ['front', 'side', 'color']) {
  const s = mode === 'color' ? specs : JSON.stringify([JSON.parse(specs)[0] ?? {}]);
  await page.goto(`${base}tools/minifig/render.html?mode=${mode}&specs=${encodeURIComponent(s)}`);
  await page.waitForFunction(() => window.done, null, { timeout: 30000 });
  await (await page.$('canvas')).screenshot({ path: `${out}/${mode}.png` });
}
await browser.close();

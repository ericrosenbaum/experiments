// Render a library model to a PNG (see render.html for the view params).
// Needs the dev server running.
// usage: node tools/model/review.mjs <out.png> [query, e.g. "id=skyship&az=90&el=25"]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'model.png';
const query = process.argv[3] ?? 'id=skyship';
const base = process.env.BRICK_URL ?? 'http://localhost:5173/';
const exe = ['/opt/pw-browsers/chromium', `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
await page.goto(`${base}tools/model/render.html?${query}`);
await page.waitForFunction(() => window.done, null, { timeout: 30000 });
await (await page.$('canvas')).screenshot({ path: out });
await browser.close();

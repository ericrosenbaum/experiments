// Render the World Finder thumbnails and metadata in headless Chrome.
// usage: node tools/finder/render.mjs [id,id,...]
//   needs the dev server running (npm run dev) on BRICK_URL or localhost:5173.
//   Writes public/finder/<id>.webp (three wigglegram frames side by side) and
//   public/finder/worlds.json (every world's card info plus what's in it).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { KID_WORLDS } from '../../src/finder/kidworlds.js';

const SIZE = 440; // px per frame
const only = process.argv[2]?.split(',');
const base = process.env.BRICK_URL ?? 'http://localhost:5173/';
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = 'public/finder';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
await page.goto(new URL('tools/finder/render.html', base).href);
await page.waitForFunction(() => window.renderReady, null, { timeout: 60000 });

const manifestPath = path.join(out, 'worlds.json');
const prev = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
const meta = new Map(prev.map((w) => [w.id, w]));
for (const kw of KID_WORLDS) {
  if (only && !only.includes(kw.id)) continue;
  const { sprite, meta: m } = await page.evaluate(([id, s]) => window.shoot(id, s), [kw.id, SIZE]);
  fs.writeFileSync(path.join(out, `${kw.id}.webp`), Buffer.from(sprite.split(',')[1], 'base64'));
  const { id, title, summary, by, tags } = kw;
  meta.set(id, { id, title, summary, by, tags, thumb: `finder/${id}.webp`, frames: 3, ...m });
  console.log('rendered', id, `${m.things.length} things, ${m.behaviors.length} behaviors`);
}
const list = KID_WORLDS.map((w) => meta.get(w.id)).filter(Boolean);
fs.writeFileSync(manifestPath, JSON.stringify(list, null, 1));
await browser.close();

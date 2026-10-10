// Render Brick Talk builds in headless Chrome and write review sheets.
// usage: node tools/bricktalk/render.mjs <id,id,...> <outdir> [--install]
//   needs the dev server running (npm run dev) on BRICK_URL or localhost:5173.
//   Writes <outdir>/<id>.webp, plus review.png comparing the new build with the
//   current one at full size and at chat size, next to look-alike candidates.
//   --install copies the new webp into public/bricktalk/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [idsArg, out = '.', ...flags] = process.argv.slice(2);
const ids = idsArg.split(',');
const base = process.env.BRICK_URL ?? 'http://localhost:5173/';
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(new URL('tools/bricktalk/render.html', base).href);
await page.waitForFunction(() => window.renderReady, null, { timeout: 30000 });

for (const id of ids) {
  const url = await page.evaluate((id) => window.renderBuild(id), id);
  const file = path.join(out, `${id}.webp`);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  if (flags.includes('--install')) fs.copyFileSync(file, path.join('public/bricktalk', `${id}.webp`));
  // Review sheet: current vs new at 200px, then both at the chat (38px) and
  // bubble (48px) sizes, among every other build of the same category and a
  // few cross-category neighbors — the look-alike check from the original review.
  const sheet = await page.evaluate(async ({ id, url, base }) => {
    const all = ['me','you','we','friend','everyone','build','break','go','come','look','find','give','help','want','stop','wait','follow','play','win','trade','hide','brick','house','castle','bridge','tree','water','car','boat','rocket','gem','key','door','flag','star','monster','animal','music','color','here','there','up','down','inside','happy','sad','laugh','wow','love','cool','hi','thanks','sorry','yes','no','question','not','more','big','small','fast','again','now','many'];
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(src); i.src = src; });
    const cur = await load(new URL(`bricktalk/${id}.webp`, base).href).catch(() => null);
    const neu = await load(url);
    const c = document.createElement('canvas');
    c.width = 1100; c.height = 760;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#222'; g.font = 'bold 16px sans-serif';
    g.fillText('current', 20, 22); g.fillText('new', 240, 22);
    if (cur) g.drawImage(cur, 10, 30, 200, 200);
    g.drawImage(neu, 230, 30, 200, 200);
    for (const [k, px] of [[0, 38], [1, 48]]) {
      const y = 260 + k * 90;
      g.fillText(`${px}px`, 20, y + 20);
      if (cur) g.drawImage(cur, 80, y, px, px);
      g.drawImage(neu, 140, y, px, px);
    }
    // all 64 at 38px with the new one swapped in, on a chat-bubble grey
    g.fillText('all symbols at 38px (new one outlined)', 20, 470);
    g.fillStyle = '#f1f3f5'; g.fillRect(10, 480, 1080, 270);
    let n = 0;
    for (const other of all) {
      const img = other === id ? neu : await load(new URL(`bricktalk/${other}.webp`, base).href);
      const x = 20 + (n % 16) * 66, y = 492 + Math.floor(n / 16) * 64;
      g.drawImage(img, x, y, 38, 38);
      if (other === id) { g.strokeStyle = '#e03'; g.lineWidth = 2; g.strokeRect(x - 3, y - 3, 44, 44); }
      g.fillStyle = '#555'; g.font = '10px sans-serif'; g.fillText(other, x, y + 50);
      n++;
    }
    return c.toDataURL('image/png');
  }, { id, url, base });
  fs.writeFileSync(path.join(out, `${id}-review.png`), Buffer.from(sheet.split(',')[1], 'base64'));
  console.log('rendered', id);
}
await browser.close();

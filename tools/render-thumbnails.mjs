// Renders every example's thumbnail with the current look, as the iPad app
// did: the saved framing on a 1024x768 screen, scaled to 400x300.
// Writes public/assets/examples/thumbs/<name>.jpg. Needs the preview server:
//   npm run build && npx vite preview --port 4173 & node tools/render-thumbnails.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../public/assets/examples/', import.meta.url);
const out = new URL('thumbs/', dir);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.addInitScript(() => localStorage.setItem('melodymorph.prefs', JSON.stringify({ seenHelp: true })));
await page.goto(process.env.URL ?? 'http://localhost:4173/');
await page.waitForFunction(() => window.melodymorph?.morphFromXml);

const files = readdirSync(dir).filter((f) => f.endsWith('.xml')).sort();
for (const file of files) {
  const xml = readFileSync(new URL(file, dir), 'utf8');
  const dataUrl = await page.evaluate((text) => {
    const app = window.melodymorph;
    app.loadMorph(app.morphFromXml(text));
    return app.thumbnail();
  }, xml);
  writeFileSync(new URL(file.replace(/\.xml$/, '.jpg'), out), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
console.log(`rendered ${files.length} thumbnails`);
await browser.close();

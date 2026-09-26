// Screenshots ericrosenbaum.com and records computed styles, so the redesign
// can match the Squarespace look. Writes into scrape/look/.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'scrape/look';
fs.mkdirSync(OUT, { recursive: true });
const PAGES = ['', 'makeymakey', 'bio', 'media', 'earlier-work', 'glowdoodle'];
const VIEWS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const PICK = ['body', 'h1', 'h2', 'h3', 'p', 'a', '#logo', '.logo', '.site-title', '.site-tagline', 'nav a', '#mainNavigation a',
  '.main-nav a', '.project-title', '.project', '.project-image', '#sidebar', '.sidebar', 'header', '#header', '#page', '#projectPages',
  '.project-description', '.image-meta', 'footer', '#footer', '.social-links a', 'strong', 'em'];
const PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'color',
  'background-color', 'width', 'max-width', 'margin', 'padding', 'border', 'text-align', 'position', 'display', 'grid-template-columns', 'gap'];

const browser = await chromium.launch();
const styles = {};
for (const [vname, vp] of Object.entries(VIEWS)) {
  const page = await browser.newPage({ viewport: vp });
  for (const slug of PAGES) {
    const url = 'https://www.ericrosenbaum.com/' + slug;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      // Scroll through to trigger lazy-loaded images.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1500);
      const name = `${vname}-${slug || 'home'}`;
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      await page.screenshot({ path: `${OUT}/${name}-fold.png` });
      if (vname === 'desktop') {
        styles[slug || 'home'] = await page.evaluate(({ PICK, PROPS }) => {
          const out = {};
          for (const sel of PICK) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const cs = getComputedStyle(el), r = el.getBoundingClientRect();
            out[sel] = Object.fromEntries(PROPS.map(p => [p, cs.getPropertyValue(p)]));
            out[sel].rect = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
            out[sel].text = (el.textContent || '').trim().slice(0, 60);
          }
          out.fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight} ${f.style}`);
          out.stylesheets = [...document.styleSheets].map(s => s.href).filter(Boolean);
          return out;
        }, { PICK, PROPS });
      }
      console.log('ok', name);
    } catch (e) { console.log('fail', vname, url, e.message); }
  }
  await page.close();
}
fs.writeFileSync(`${OUT}/styles.json`, JSON.stringify(styles, null, 2));
await browser.close();

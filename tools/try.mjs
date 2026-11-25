// Drives two pages against the real Claude and saves a screenshot after each
// request, to eyeball what the prompt produces.
// Run: node tools/try.mjs <dir-for-screenshots> ["request" ...]   (prefix a request with "b:" to have the second person ask)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [dir, ...asks] = process.argv.slice(2);
const requests = asks.length ? asks : ['make my video a circle', 'b:put us on a soccer field with a ball, and let us move around with the arrow keys'];
const PORT = 8798;
const root = path.resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node', ['--env-file-if-exists=.env.local', 'server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => { log += d; process.stdout.write(d); });
server.stderr.on('data', (d) => { log += d; process.stdout.write(d); });
for (let i = 0; i < 100 && !log.includes('worldchat on'); i++) await sleep(100);

const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const room = `try-${Date.now().toString(36)}`;
  const pages = {};
  for (const [k, name] of [['a', 'Ana'], ['b', 'Ben']]) {
    const p = pages[k] = await context.newPage();
    p.on('pageerror', (err) => console.log(`[${name}] page error: ${err.message}`));
    p.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[${name}] ${msg.text().slice(0, 300)}`); });
    await p.goto(`http://localhost:${PORT}/?room=${room}&name=${name}&auto=1&listen=0`);
    await p.waitForFunction(() => window.__wc.meId);
  }
  await sleep(2000);
  let i = 0;
  for (const raw of requests) {
    const who = raw.startsWith('b:') ? 'b' : 'a';
    const text = raw.replace(/^[ab]:/, '');
    const page = pages[who];
    const started = Date.now();
    await page.fill('#text', text);
    await page.press('#text', 'Enter');
    await page.waitForFunction(() => ['building', 'fixing'].includes(window.__wc.kind), null, { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => !['building', 'fixing'].includes(window.__wc.kind), null, { timeout: 120000 });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    await sleep(2500); // let errors and retries surface
    await page.waitForFunction(() => !['building', 'fixing'].includes(window.__wc.kind), null, { timeout: 120000 });
    const st = await page.evaluate(() => ({ kind: window.__wc.kind, status: window.__wc.status, version: window.__wc.version, needs: window.__wc.needs }));
    console.log(`\n#${++i} ${who === 'a' ? 'Ana' : 'Ben'}: ${text}\n   ${secs}s -> [${st.kind}] ${st.status}  (v${st.version}, needs: ${st.needs?.join(',') || 'none'})`);
    for (const k of ['a', 'b']) {
      await pages[k].keyboard.down('ArrowRight'); await sleep(250); await pages[k].keyboard.up('ArrowRight');
    }
    await pages.a.screenshot({ path: path.join(dir, `try-${i}-a.png`) });
    await pages.b.screenshot({ path: path.join(dir, `try-${i}-b.png`) });
  }
} finally {
  await browser.close();
  server.kill();
}

// End-to-end check with two real Chrome pages, fake cameras and a mock Claude.
// Run: npm test   (needs Google Chrome installed; set SHOTS=<dir> to keep screenshots)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 8799;
const root = path.resolve(import.meta.dirname, '..');
const room = `test-${Date.now().toString(36)}`;
const url = (name) => `http://localhost:${PORT}/?room=${room}&name=${name}&auto=1&listen=0`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['server/index.js'], { cwd: root, env: { ...process.env, MOCK_CLAUDE: '1', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 100 && !serverLog.includes('worldchat on'); i++) await sleep(100);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: process.env.HEADED !== '1',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
let failed = 0;
const check = (ok, label, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`); };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const open = async (name) => {
    const page = await context.newPage();
    page.on('pageerror', (err) => console.log(`[${name}] page error: ${err.message}`));
    await page.goto(url(name));
    return page;
  };
  const a = await open('Ana');
  await a.waitForFunction(() => window.__wc.meId);
  const b = await open('Ben');
  for (const p of [a, b]) await p.waitForFunction(() => window.__wc.players === 2);

  // Read one world pixel, or find the centre of everything in one colour.
  const pixel = (page, x, y) => page.evaluate(([x, y]) => {
    const c = document.createElement('canvas'); c.width = 1; c.height = 1;
    const g = c.getContext('2d'); g.drawImage(document.getElementById('world'), -x, -y);
    return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, [x, y]);
  const centre = (page, rgb) => page.evaluate((rgb) => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(document.getElementById('world'), 0, 0, 320, 180);
    const d = g.getImageData(0, 0, 320, 180).data;
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - rgb[0]) < 40 && Math.abs(d[i + 1] - rgb[1]) < 40 && Math.abs(d[i + 2] - rgb[2]) < 40) { n++; sx += (i / 4) % 320; sy += Math.floor(i / 4 / 320); }
    return n ? { x: (sx / n) * 5, y: (sy / n) * 5, n } : null;
  }, rgb);
  const near = (p, rgb, tol = 30) => p.every((v, i) => Math.abs(v - rgb[i]) <= tol);
  const lit = (p) => p[1] > 100 && p[2] < 90; // the fake camera is all greens
  const FIELD = [40, 40, 200];
  const BAR = [255, 128, 0];
  const ask = async (page, text) => { await page.fill('#text', text); await page.press('#text', 'Enter'); };
  const status = (page, text, timeout = 15000) => page.waitForFunction((t) => window.__wc.status.includes(t), text, { timeout }).then(() => true, () => false);
  const shot = async (name) => { if (process.env.SHOTS) for (const [n, p] of [['a', a], ['b', b]]) await p.screenshot({ path: path.join(process.env.SHOTS, `${name}-${n}.png`) }); };

  // 1. Each sees the other's camera (fake camera: a bright test pattern).
  await sleep(2500);
  check(lit(await pixel(a, 530, 450)), 'Ana sees her own video');
  check(lit(await pixel(a, 1070, 450)), "Ana sees Ben's video over WebRTC", String(await pixel(a, 1070, 450)));
  check(lit(await pixel(b, 530, 450)), "Ben sees Ana's video over WebRTC", String(await pixel(b, 530, 450)));
  check(near(await pixel(a, 20, 20), [0, 0, 0]), 'background starts black');
  await shot('1-start');

  // 2. A typed request changes the world for both.
  await ask(a, 'put us on a field');
  check(await status(b, 'Field is in'), 'Ben sees the status of Ana\'s request');
  await sleep(300);
  for (const [n, p] of [['Ana', a], ['Ben', b]]) check(near(await pixel(p, 20, 20), FIELD), `${n}'s background became the field`);

  // 3. Own-player control replicates: Ana walks right, Ben sees her tile leave its seat.
  await ask(b, 'let us walk with the arrow keys');
  await status(a, 'Arrow keys');
  check(lit(await pixel(b, 340, 450)), "before walking, Ana's tile covers x=340 on Ben's screen");
  await a.keyboard.down('ArrowRight'); await sleep(600); await a.keyboard.up('ArrowRight');
  await sleep(400);
  check(near(await pixel(b, 340, 450), FIELD), "after walking, Ben sees field where Ana's tile was", String(await pixel(b, 340, 450)));
  check(lit(await pixel(b, 1260, 450)), "Ben's own tile stayed put on Ben's screen");

  // 4. Host-simulated shared state: one ball, same place on both screens.
  await ask(a, 'add a ball');
  await status(b, 'ball');
  await sleep(600);
  const [ba, bb] = await Promise.all([centre(a, [255, 0, 255]), centre(b, [255, 0, 255])]);
  check(ba && bb, 'both see the ball');
  if (ba && bb) check(Math.hypot(ba.x - bb.x, ba.y - bb.y) < 120, 'the ball is in the same place for both', `${Math.round(ba.x)},${Math.round(ba.y)} vs ${Math.round(bb.x)},${Math.round(bb.y)}`);
  await sleep(500);
  const ba2 = await centre(a, [255, 0, 255]);
  check(ba && ba2 && Math.hypot(ba.x - ba2.x, ba.y - ba2.y) > 20, 'the ball is moving');
  await shot('4-ball');

  // 5. Code that throws is rolled back and retried with the error.
  await ask(a, 'add a broken bar');
  check(await status(a, 'Fixed: blue bar'), 'a throwing module was rolled back and the retry landed');
  await sleep(300);
  for (const [n, p] of [['Ana', a], ['Ben', b]]) check(near(await pixel(p, 800, 20), BAR), `${n} sees the fixed bar`);

  // 6. A loop that never ends: the watchdog replaces the worker, the call survives.
  await ask(b, 'freeze the world');
  check(await status(a, 'would have frozen', 30000), 'an endless loop was caught, rolled back and reported');
  await sleep(1500);
  for (const [n, p] of [['Ana', a], ['Ben', b]]) {
    const c1 = await centre(p, [255, 0, 255]); await sleep(400); const c2 = await centre(p, [255, 0, 255]);
    check(c1 && c2 && Math.hypot(c1.x - c2.x, c1.y - c2.y) > 10, `${n}'s world is running again after the freeze`);
    check(lit(await pixel(p, 1070, 450)), `${n} still sees Ben's video after the freeze`);
  }

  // 7. Syntax errors never reach a browser.
  await ask(a, 'add a typo');
  check(await status(a, 'Fixed the typo'), 'a syntax error was caught on the server and retried');

  // 8. Undo.
  await a.click('#undo'); // takes back the typo module
  await status(a, 'Undone');
  await a.click('#undo'); // takes back the bar
  await sleep(600);
  check(near(await pixel(b, 800, 20), FIELD), 'undo removed the bar for Ben', String(await pixel(b, 800, 20)));

  // 9. Speech path: chatter is ignored, a request is acted on.
  const v0 = await a.evaluate(() => window.__wc.version);
  await a.evaluate(() => window.__wc.say("that's so cool"));
  await sleep(800);
  check(await a.evaluate(() => window.__wc.version) === v0, 'ordinary talk changes nothing');
  await b.evaluate(() => window.__wc.say('make my video a circle'));
  check(await status(a, 'circles'), 'a spoken request is acted on');
  await sleep(400);
  await shot('9-end');

  // 10. Leaving: the roster shrinks and the host role moves on.
  await a.close();
  await b.waitForFunction(() => window.__wc.players === 1, null, { timeout: 5000 }).then(() => check(true, 'Ben sees Ana leave'), () => check(false, 'Ben sees Ana leave'));
  await sleep(500);
  const c1 = await centre(b, [255, 0, 255]); await sleep(400); const c2 = await centre(b, [255, 0, 255]);
  check(c1 && c2 && Math.hypot(c1.x - c2.x, c1.y - c2.y) > 10, 'Ben took over simulating the ball');
} catch (err) {
  failed++;
  console.log('FAIL test crashed:', err);
} finally {
  await browser.close();
  server.kill();
}
if (failed) console.log(`\nserver log:\n${serverLog}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

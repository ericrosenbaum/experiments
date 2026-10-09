// Drive the app in headless Chromium: load the world, drive the car with the
// arrow keys, teach behaviors through the composer, and take screenshots.
// usage: node tools/smoke.mjs [url] [outdir]
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '.';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(url);
await page.waitForFunction(() => window.__bb, null, { timeout: 30000 });
await page.waitForTimeout(1500);

const state = () => page.evaluate(() => {
  const { world } = window.__bb;
  const out = {};
  for (const e of world.entities.values()) if (e.kind === 'model') { const p = e.position; out[e.name] = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), h: Math.round(e.heading()) }; }
  return out;
});
console.log('start', await state());
await page.screenshot({ path: `${out}/01-start.png` });

// drive the car with the pre-taught arrow behavior
await page.mouse.click(700, 500); // focus canvas (may select something)
await page.evaluate(() => window.__bb.app.select([...window.__bb.world.entities.values()].find((e) => e.name === 'Race Car')));
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(1500);
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(800);
await page.keyboard.up('ArrowLeft');
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(500);
console.log('after driving', await state());

// teach the robot something via the composer
async function teach(modelName, text) {
  await page.evaluate((n) => window.__bb.app.select([...window.__bb.world.entities.values()].find((e) => e.name === n)), modelName);
  await page.click('#composer');
  await page.keyboard.type(text);
  await page.click('#btn-make');
  await page.waitForTimeout(300);
}
await teach('Robot', 'When I press space, raise both arms and say "Hello!" then turn around');
await page.click('canvas', { position: { x: 300, y: 300 } }).catch(() => {});
await page.evaluate(() => document.activeElement.blur());
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/02-robot.png` });
console.log('after robot', await state());

await teach('Catapult', 'When I press c, put a red brick in the throwing arm, wait 1 second, then fling');
await page.evaluate(() => document.activeElement.blur());
await page.keyboard.press('c');
await page.waitForTimeout(2500);
const bricks = await page.evaluate(() => [...window.__bb.world.entities.values()].filter((e) => e.owner?.name === 'Catapult').map((e) => { const p = e.position; return [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]; }));
console.log('catapult bricks', bricks);
await page.screenshot({ path: `${out}/03-catapult.png` });

// sandbox: no network, and a runaway loop gets stopped by the watchdog
const sandbox = await page.evaluate(async () => {
  const { app, runtime, world } = window.__bb;
  const robot = [...world.entities.values()].find((e) => e.name === 'Robot');
  const probes = {
    fetchType: 'onStart(async () => { log("fetch:" + typeof fetch + " xhr:" + typeof XMLHttpRequest + " proto:" + typeof Object.getPrototypeOf(globalThis).fetch + " doc:" + typeof document); });',
    loop: 'onStart(() => { while (true) {} });',
  };
  for (const [title, code] of Object.entries(probes)) {
    const b = { id: 900 + title.length, title, code, summary: [], enabled: true };
    robot.behaviors.push(b);
    runtime.start(robot, b);
  }
  await new Promise((r) => setTimeout(r, 6000));
  return { programs: [...runtime.programs].map((p) => p.behavior.title) };
});
console.log('sandbox', sandbox);
const robotParts = await page.evaluate(() => [...[...window.__bb.world.entities.values()].find((e) => e.name === 'Robot').parts.values()].map((p) => [p.def.name, p.angle]));
console.log('robot part targets', robotParts);
const log = await page.evaluate(() => document.getElementById('console-body').innerText);
console.log('LOG:\n' + log);
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();

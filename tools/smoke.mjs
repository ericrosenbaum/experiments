// Drives the built app in headless Chrome with a fake microphone that "sings"
// a few notes: draws a stroke, touches it, rubs it backwards, undoes, locks,
// and checks the drawing comes back after a reload. Run with the preview
// server up: npx vite preview --port 4173, then node tools/smoke.mjs [outdir]
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const url = process.env.URL ?? 'http://localhost:4173/';

// four seconds of notes with gaps, looped by Chrome: C, E, G, rest
const sr = 48000;
const notes = [261.63, 329.63, 392, 0];
const n = sr * 4;
const wav = Buffer.alloc(44 + n * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + n * 2, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sr, 24);
wav.writeUInt32LE(sr * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) {
  const f = notes[Math.floor(i / sr)];
  const v = f ? 0.4 * (Math.sin((2 * Math.PI * f * i) / sr) + 0.4 * Math.sin((4 * Math.PI * f * i) / sr)) : 0;
  wav.writeInt16LE(Math.round(v * 20000), 44 + i * 2);
}
const wavPath = join(mkdtempSync(join(tmpdir(), 'sf-')), 'sing.wav');
writeFileSync(wavPath, wav);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wavPath}`,
  ],
});
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, permissions: ['microphone'] });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.screenshot({ path: `${out}/1-splash.png` });
await page.click('#start');
await page.waitForFunction(() => window.singingFingers.audio.running);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/2-tips.png` });
const sf = (fn) => page.evaluate(fn);
const mic = await sf(() => ({ mic: !!window.singingFingers.audio.mic, err: String(window.singingFingers.audio.micError) }));

// wait for a note, then draw an arc while it sings through the next ones
await page.waitForFunction(() => window.singingFingers.audio.width > 0, null, { timeout: 8000 });
await page.mouse.move(200, 600);
await page.mouse.down();
const pts = [];
for (let i = 0; i <= 180; i++) {
  const a = Math.PI - (i / 180) * Math.PI;
  pts.push([512 + Math.cos(a) * 300, 600 - Math.sin(a) * 300]);
}
for (const [x, y] of pts) {
  await page.mouse.move(x, y);
  await page.waitForTimeout(15);
}
await page.mouse.up();
await page.waitForTimeout(300);
const drawn = await sf(() =>
  window.singingFingers.shapes.map((s) => ({
    points: s.points.length,
    samples: s.samples?.length ?? 0,
    lastAudioPos: s.points.at(-1).audioPos,
    colors: [...new Set(s.points.map((p) => p.color.map((c) => c.toFixed(2)).join(',')))].length,
  })),
);
await page.screenshot({ path: `${out}/3-drawn.png` });

// touch the first stroke and hold: it plays and bulges
const first = await sf(() => {
  const p = window.singingFingers.shapes[0].points[3];
  return [p.x, p.y];
});
await page.mouse.move(...first);
await page.mouse.down();
await page.waitForTimeout(400);
const playing = await sf(() => window.singingFingers.shapes.map((s) => [s.playing, Math.round(s.playPos)]));
await page.screenshot({ path: `${out}/4-playing.png` });
await page.mouse.up();
await page.waitForTimeout(200);
const stopped = await sf(() => window.singingFingers.shapes.every((s) => !s.playing));

// lock: blank canvas no longer draws
await page.click('#lock');
await page.mouse.move(100, 100);
await page.mouse.down();
await page.mouse.move(300, 150, { steps: 30 });
await page.mouse.up();
const afterLock = await sf(() => window.singingFingers.shapes.length);
await page.screenshot({ path: `${out}/5-locked.png` });
await page.click('#lock');

// reload: the drawing comes back and still plays
await page.waitForTimeout(500);
await page.reload();
await page.click('#start');
await page.waitForFunction(() => window.singingFingers.shapes.length > 0, null, { timeout: 5000 });
const restored = await sf(() => window.singingFingers.shapes.map((s) => [s.points.length, s.samples.length]));
await page.mouse.move(...first);
await page.mouse.down();
await page.waitForTimeout(300);
const replay = await sf(() => window.singingFingers.shapes[0].playing && window.singingFingers.shapes[0].playPos > 0);
await page.mouse.up();

// undo everything
const before = restored.length;
await page.click('#undo');
const afterUndo = await sf(() => window.singingFingers.shapes.length);

// phone size
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#help');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/6-phone.png` });

console.log(JSON.stringify({ mic, drawn, playing, stopped, afterLock, restored, replay, before, afterUndo, errors }, null, 1));
await browser.close();

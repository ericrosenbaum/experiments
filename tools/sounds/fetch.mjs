// Downloads the recorded sounds in src/behavior/sounds.js from the Scratch
// asset server and writes public/sounds/<id>.mp3: mono, loudness-matched,
// slowed by `rate` and cut to `max` seconds with a short fade. Needs ffmpeg.
//
//   node tools/sounds/fetch.mjs path/to/scratch-gui/.../libraries/sounds.json [--force]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SOUND_LIST } from '../../src/behavior/sounds.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(root, 'public/sounds');
const [libPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const force = process.argv.includes('--force');
if (!libPath) { console.error('usage: node tools/sounds/fetch.mjs <scratch sounds.json> [--force]'); process.exit(1); }

const library = Object.fromEntries(JSON.parse(fs.readFileSync(libPath, 'utf8')).map((s) => [s.name, s]));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-sounds-'));
fs.mkdirSync(OUT, { recursive: true });
const credits = [];

for (const s of SOUND_LIST.filter((x) => x.from)) {
  const src = library[s.from];
  if (!src) throw new Error(`"${s.from}" isn't in the Scratch sound library`);
  credits.push(`${s.id}.mp3\t${s.from}`);
  const out = path.join(OUT, `${s.id}.mp3`);
  if (fs.existsSync(out) && !force) continue;
  const raw = path.join(tmp, src.md5ext);
  if (!fs.existsSync(raw)) {
    const res = await fetch(`https://assets.scratch.mit.edu/internalapi/asset/${src.md5ext}/get/`);
    if (!res.ok) throw new Error(`${s.from}: HTTP ${res.status}`);
    fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  }
  const len = src.sampleCount / src.rate / (s.rate ?? 1);
  const max = Math.min(len, s.max ?? Infinity);
  const filters = [
    s.rate ? `asetrate=${src.rate}*${s.rate},aresample=${src.rate}` : null, // lower and slower, like a slowed tape
    `atrim=0:${max.toFixed(2)}`,
    max < len ? `afade=t=out:st=${Math.max(0, max - 0.4).toFixed(2)}:d=0.4` : null,
    'loudnorm=I=-18:TP=-2:LRA=11',
  ].filter(Boolean).join(',');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', filters, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', out]);
  console.log(`${s.id.padEnd(10)} ← ${s.from} (${max.toFixed(1)}s)`);
}

fs.writeFileSync(path.join(OUT, 'CREDITS.txt'), `Recordings from the Scratch sound library (https://scratch.mit.edu), fetched by
tools/sounds/fetch.mjs. File, then the sound's name in the library:

${credits.join('\n')}
`);
fs.rmSync(tmp, { recursive: true, force: true });

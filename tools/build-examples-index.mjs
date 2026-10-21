// Writes public/assets/examples/index.json, the list the Open menu shows.
// The examples are listed in filename order, as the iPad app did.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { morphFromXml } from '../src/morph-format.js';

const dir = new URL('../public/assets/examples/', import.meta.url);

// Newer examples have a same-named .png; the older bells_<stamp>.xml ones
// have largeThumbImage_<stamp>.png.
function thumbFor(file) {
  const base = file.replace(/\.xml$/, '');
  const candidates = [`${base}.png`, `largeThumbImage_${base.replace(/^bells_/, '')}.png`];
  const found = candidates.find((c) => existsSync(new URL(c, dir)));
  if (!found) throw new Error(`no thumbnail for ${file}`);
  return found;
}
// Many examples were never given a title. Name those after their file
// ("Example 8a"), or for the date-stamped ones, when they were saved.
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
function fallbackTitle(file) {
  const numbered = file.match(/^example-0*(\w+)\.xml$/);
  if (numbered) return `Example ${numbered[1]}`;
  const [, y, mo, d, h, mi] = file.match(/(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)/);
  return `${MONTHS[mo - 1]} ${+d}, ${y}, ${+h % 12 || 12}:${mi} ${h < 12 ? 'AM' : 'PM'}`;
}

const examples = readdirSync(dir)
  .filter((f) => f.endsWith('.xml'))
  .sort()
  .map((file) => {
    const m = morphFromXml(readFileSync(new URL(file, dir), 'utf8'));
    return {
      file,
      thumb: thumbFor(file),
      title: m.title || fallbackTitle(file),
      author: m.author,
      description: m.description,
    };
  });

writeFileSync(new URL('index.json', dir), JSON.stringify(examples, null, 2) + '\n');
console.log(`indexed ${examples.length} examples`);

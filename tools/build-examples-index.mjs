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
const examples = readdirSync(dir)
  .filter((f) => f.endsWith('.xml'))
  .sort()
  .map((file) => {
    const m = morphFromXml(readFileSync(new URL(file, dir), 'utf8'));
    return {
      file,
      thumb: thumbFor(file),
      title: m.title,
      author: m.author,
      description: m.description,
    };
  });

writeFileSync(new URL('index.json', dir), JSON.stringify(examples, null, 2) + '\n');
console.log(`indexed ${examples.length} examples`);

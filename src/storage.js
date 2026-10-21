// Preferences, "My Stuff" saves, autosave and share links. Everything lives
// in this browser's localStorage; share links carry the whole morph in the
// URL instead of on a server.

import LZString from 'lz-string';
import { morphFromCompact, morphToCompact, morphToXml } from './morph-format.js';

const PREFS = 'melodymorph.prefs';
const SAVES = 'melodymorph.saves';
const AUTOSAVE = 'melodymorph.autosave';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const prefs = {
  get: (k) => read(PREFS, {})[k],
  set: (k, v) => write(PREFS, { ...read(PREFS, {}), [k]: v }),
};

export const saves = {
  /** Newest first. */
  list: () => read(SAVES, []),
  add(morph, thumb) {
    const entry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      savedAt: new Date().toISOString(),
      title: morph.title,
      author: morph.author,
      description: morph.description,
      thumb,
      data: morphToCompact(morph),
    };
    if (!write(SAVES, [entry, ...saves.list()])) {
      throw new Error("This browser's storage is full. Delete something from My Stuff, or download the file instead.");
    }
    return entry;
  },
  remove: (id) => write(SAVES, saves.list().filter((s) => s.id !== id)),
  load: (entry) => morphFromCompact(entry.data),
};

export const autosave = {
  get() {
    const c = read(AUTOSAVE, null);
    try {
      return c ? morphFromCompact(c) : null;
    } catch {
      return null;
    }
  },
  /** Returns the serialized form so callers can skip unchanged writes. */
  put(morph, last) {
    const s = JSON.stringify(morphToCompact(morph));
    if (s !== last) {
      try {
        localStorage.setItem(AUTOSAVE, s);
      } catch {}
    }
    return s;
  },
};

export function shareUrl(morph) {
  const packed = LZString.compressToEncodedURIComponent(JSON.stringify(morphToCompact(morph)));
  const url = new URL(location.href);
  url.search = '';
  url.hash = `m=${packed}`;
  return url.toString();
}

/** The morph in this page's #m= share link, if any. */
export function morphFromHash() {
  const m = /^#m=(.+)$/.exec(location.hash);
  if (!m) return null;
  const json = LZString.decompressFromEncodedURIComponent(m[1]);
  if (!json) throw new Error('This share link looks damaged.');
  return morphFromCompact(JSON.parse(json));
}

export function downloadXml(morph) {
  const name = (morph.title || 'melodymorph').replace(/[^\w\- ]+/g, '').trim() || 'melodymorph';
  const blob = new Blob([morphToXml(morph)], { type: 'application/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.xml`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

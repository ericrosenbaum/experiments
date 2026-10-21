// Keeps the drawing, sounds and all, across reloads, in IndexedDB (a few
// seconds of audio is far too big for localStorage). One record per shape.

const DB = 'singing-fingers';
const STORE = 'shapes';
// per point: x, y, width, angle, r, g, b, audioPos
const FIELDS = 8;

let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export function encodeShape(shape, sampleRate) {
  const pts = new Float32Array(shape.points.length * FIELDS);
  shape.points.forEach((p, i) => pts.set([p.x, p.y, p.width, p.angle, ...p.color, p.audioPos], i * FIELDS));
  return { id: shape.id, points: pts, samples: shape.samples, sampleRate };
}

/** The shape's points and its sound, resampled to `sampleRate` if need be. */
export function decodeShape(rec, sampleRate) {
  const ratio = sampleRate / rec.sampleRate;
  const points = [];
  for (let i = 0; i < rec.points.length; i += FIELDS) {
    const f = rec.points.subarray(i, i + FIELDS);
    points.push({ x: f[0], y: f[1], width: f[2], angle: f[3], color: [f[4], f[5], f[6]], audioPos: Math.round(f[7] * ratio) });
  }
  return { id: rec.id, points, samples: resample(rec.samples, ratio) };
}

function resample(samples, ratio) {
  if (ratio === 1) return samples;
  const out = new Float32Array(Math.floor(samples.length * ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i / ratio;
    const k = Math.floor(x);
    const a = samples[k] ?? 0;
    const b = samples[k + 1] ?? a;
    out[i] = a + (b - a) * (x - k);
  }
  return out;
}

export const saved = {
  all: () => run('readonly', (s) => s.getAll()).catch(() => []),
  put: (rec) => run('readwrite', (s) => s.put(rec)).catch(() => {}),
  delete: (id) => run('readwrite', (s) => s.delete(id)).catch(() => {}),
  clear: () => run('readwrite', (s) => s.clear()).catch(() => {}),
};

export const prefs = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(`singing-fingers.${key}`));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`singing-fingers.${key}`, JSON.stringify(value));
    } catch {
      // private mode, storage full: not worth bothering anyone about
    }
  },
};

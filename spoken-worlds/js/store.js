// Everything lives in this browser's IndexedDB: worlds (JSON), clips (audio
// Blobs), and play progress. Export/import packs a world and its clips into one
// file; text-only worlds can also travel in a URL hash.

const DB = 'spoken-worlds';
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        for (const s of ['worlds', 'clips', 'progress']) r.result.createObjectStore(s);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    navigator.storage?.persist?.();
  }
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}

export const putWorld = (w) => tx('worlds', 'readwrite', (s) => s.put(w, w.id));
export const getWorld = (id) => tx('worlds', 'readonly', (s) => s.get(id));
export const listWorlds = () => tx('worlds', 'readonly', (s) => s.getAll());
export const deleteWorld = (id) => tx('worlds', 'readwrite', (s) => s.delete(id));
export const putClip = (id, blob) => tx('clips', 'readwrite', (s) => s.put(blob, id));
export const getClip = (id) => tx('clips', 'readonly', (s) => s.get(id));
export const putProgress = (id, st) => tx('progress', 'readwrite', (s) => s.put(st, id));
export const getProgress = (id) => tx('progress', 'readonly', (s) => s.get(id));

export const newId = () => Math.random().toString(36).slice(2, 10);

export async function saveRecording(blob) {
  const id = 'clip-' + newId();
  await putClip(id, blob);
  return id;
}

// Every { clip } referenced anywhere in the world.
function clipIds(world) {
  const ids = new Set();
  JSON.stringify(world, (k, v) => { if (k === 'clip' && v) ids.add(v); return v; });
  return [...ids];
}

const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

export async function exportWorld(world) {
  const clips = {};
  for (const id of clipIds(world)) {
    const b = await getClip(id);
    if (b) clips[id] = await blobToDataUrl(b);
  }
  const json = JSON.stringify({ format: 'spoken-world', version: 1, world, clips });
  return new File([json], `${(world.title || 'world').replace(/[^\w]+/g, '-')}.spokenworld.json`, { type: 'application/json' });
}

export async function importWorld(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'spoken-world') throw new Error('Not a Spoken Worlds file');
  for (const [id, url] of Object.entries(data.clips || {})) {
    await putClip(id, await (await fetch(url)).blob());
  }
  await putWorld(data.world);
  return data.world;
}

export async function shareFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}

// ---- text-only worlds in a link --------------------------------------------
const b64url = (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function worldToHash(world) {
  const textOnly = JSON.parse(JSON.stringify(world, (k, v) => (k === 'clip' ? undefined : v)));
  const stream = new Blob([JSON.stringify(textOnly)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return '#w=' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function worldFromHash(hash) {
  const m = /#w=([\w-]+)/.exec(hash);
  if (!m) return null;
  const stream = new Blob([unb64url(m[1])]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

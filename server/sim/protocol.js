// What a player's page may send a room, and what each message must look like.
// Every inbound message goes through `validate` first; anything else is
// dropped. Strings are cut to size, numbers must be finite, and keys and ids
// are plain text.

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const key = (v) => (typeof v === 'string' && /^[\w.~-]{1,64}$/.test(v) ? v : null);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
const int = (v) => (Number.isInteger(v) && v >= 0 && v < 1e9 ? v : null);
const bool = (v) => !!v;
const vec = (v) => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? v.map((n) => Math.max(-500, Math.min(500, n))) : null);

export const CODE_MAX = 20_000;
export const TEXT_MAX = 2_000;

function behavior(b) {
  if (!b || typeof b !== 'object') return null;
  const code = str(b.code, CODE_MAX + 1);
  if (code == null || code.length > CODE_MAX) return null;
  const keys = b.keys && typeof b.keys === 'object' && !Array.isArray(b.keys)
    ? Object.fromEntries(Object.entries(b.keys).slice(0, 40).map(([k, v]) => [str(k, 20) ?? '', str(v, 40) ?? '']).filter(([k]) => k))
    : null;
  return {
    text: str(b.text, TEXT_MAX) ?? '', html: str(b.html, TEXT_MAX * 4) ?? undefined, code,
    summary: Array.isArray(b.summary) ? b.summary.slice(0, 30).map((s) => str(s, 300) ?? '') : [],
    title: str(b.title, 80) ?? '', notes: str(b.notes, 1000) ?? '', source: str(b.source, 20) ?? 'claude', keys,
    unknown: Array.isArray(b.unknown) ? b.unknown.slice(0, 10).map((s) => str(s, 100) ?? '') : [],
  };
}

const SHAPES = {
  hello: (m) => ({ room: str(m.room, 40), name: str(m.name, 24), playerId: str(m.playerId, 40), world: m.world == null ? null : key(m.world) }),
  select: (m) => (m.key == null ? { key: null } : key(m.key) ? { key: key(m.key) } : null),
  key: (m) => ({ key: str(m.key, 20), down: bool(m.down) }),
  dragStart: (m) => ({ key: key(m.key) }),
  drag: (m) => ({ key: key(m.key), delta: vec(m.delta), yaw: num(m.yaw, -3600, 3600) }),
  dragEnd: (m) => ({ key: key(m.key), delta: vec(m.delta), yaw: num(m.yaw, -3600, 3600), moved: bool(m.moved) }),
  turn: (m) => ({ key: key(m.key), degrees: num(m.degrees ?? 45, -360, 360) }),
  respawn: (m) => ({ key: key(m.key) }),
  clone: (m) => ({ key: key(m.key) }),
  remove: (m) => ({ key: key(m.key) }),
  addModel: (m) => ({ defId: key(m.defId), pose: m.pose && typeof m.pose === 'object' ? { x: num(m.pose.x, -200, 200) ?? 0, z: num(m.pose.z, -200, 200) ?? 0, yaw: num(m.pose.yaw, -3600, 3600) ?? 0 } : { x: 0, z: 0, yaw: 0 } }),
  teach: (m) => ({ key: key(m.key), behavior: behavior(m.behavior) }),
  change: (m) => ({ key: key(m.key), id: int(m.id), behavior: behavior(m.behavior) }),
  behavior: (m) => ({ key: key(m.key), id: int(m.id), op: ['enable', 'disable', 'delete', 'edit'].includes(m.op) ? m.op : null, code: m.op === 'edit' ? str(m.code, CODE_MAX) : undefined }),
  run: (m) => ({ key: key(m.key), id: int(m.id), at: int(m.at) }),
  reset: () => ({}),
  world: (m) => ({ id: key(m.id) }),
  chat: (m) => ({ phrases: Array.isArray(m.phrases) ? m.phrases.slice(0, 6).map((p) => (Array.isArray(p) ? p.slice(0, 8).map((s) => key(s) ?? '') : [])) : null, said: str(m.said, 300) ?? null }),
  seeReply: (m) => ({ id: int(m.id), label: str(m.label, 100) ?? 'none' }),
  pong: (m) => ({ t: num(m.t, 0, 1e15) }),
};

const REQUIRED = {
  hello: ['room'], select: [], key: ['key'], dragStart: ['key'], drag: ['key', 'delta', 'yaw'], dragEnd: ['key', 'delta', 'yaw'],
  turn: ['key'], respawn: ['key'], clone: ['key'], remove: ['key'], addModel: ['defId'], teach: ['key', 'behavior'],
  change: ['key', 'id', 'behavior'], behavior: ['key', 'id', 'op'], run: ['key', 'id', 'at'], reset: [], world: ['id'],
  chat: ['phrases'], seeReply: ['id'], pong: [],
};

// A clean copy of the message, or null if it is malformed.
export function validate(m) {
  if (!m || typeof m !== 'object' || typeof m.type !== 'string' || !SHAPES[m.type]) return null;
  const out = SHAPES[m.type](m);
  if (!out) return null;
  for (const f of REQUIRED[m.type]) if (out[f] == null) return null;
  return { type: m.type, ...out };
}

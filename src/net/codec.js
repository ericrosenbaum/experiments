// The binary snapshot: which bodies moved and where they are now. Shared by
// the sim server (encode) and the page (decode).
//
//   u8 kind (1)  u8 flags (1 = full)  f64 server time (ms)  u16 count
//   then per body: u16 body id, i16 x y z (1/64 stud), u8 largest quaternion
//   component, i16 × 3 the other three ("smallest three"), 15 bytes a body.

export const KIND_SNAPSHOT = 1;
const POS_SCALE = 64;
const POS_MAX = 32767 / POS_SCALE; // ±512 studs, beyond the world's cleanup bound
const Q_SCALE = 32767 / Math.SQRT1_2;

const clampPos = (v) => Math.max(-POS_MAX, Math.min(POS_MAX, v));

// Quantize a transform to the integers the wire carries, so the server can
// compare them with what it last sent.
export function quantize(t, r) {
  const x = Math.round(clampPos(t.x) * POS_SCALE), y = Math.round(clampPos(t.y) * POS_SCALE), z = Math.round(clampPos(t.z) * POS_SCALE);
  const q = [r.x, r.y, r.z, r.w];
  let big = 0;
  for (let i = 1; i < 4; i++) if (Math.abs(q[i]) > Math.abs(q[big])) big = i;
  const sign = q[big] < 0 ? -1 : 1;
  const rest = [];
  for (let i = 0; i < 4; i++) if (i !== big) rest.push(Math.round(Math.max(-1, Math.min(1, q[i] * sign / Math.SQRT1_2)) * 32767));
  return [x, y, z, big, rest[0], rest[1], rest[2]];
}

export function dequantize(v) {
  const [x, y, z, big, a, b, c] = v;
  const rest = [a / Q_SCALE, b / Q_SCALE, c / Q_SCALE];
  const q = [0, 0, 0, 0];
  let j = 0;
  let sum = 0;
  for (let i = 0; i < 4; i++) if (i !== big) { q[i] = rest[j++]; sum += q[i] * q[i]; }
  q[big] = Math.sqrt(Math.max(0, 1 - sum));
  return { p: [x / POS_SCALE, y / POS_SCALE, z / POS_SCALE], q };
}

export const sameQuant = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6];

// bodies: [[bid, quantized]]
export function encodeSnapshot({ t, full, bodies }) {
  const buf = new ArrayBuffer(12 + bodies.length * 15);
  const v = new DataView(buf);
  v.setUint8(0, KIND_SNAPSHOT);
  v.setUint8(1, full ? 1 : 0);
  v.setFloat64(2, t);
  v.setUint16(10, bodies.length);
  let o = 12;
  for (const [bid, qv] of bodies) {
    v.setUint16(o, bid); o += 2;
    v.setInt16(o, qv[0]); v.setInt16(o + 2, qv[1]); v.setInt16(o + 4, qv[2]); o += 6;
    v.setUint8(o, qv[3]); o += 1;
    v.setInt16(o, qv[4]); v.setInt16(o + 2, qv[5]); v.setInt16(o + 4, qv[6]); o += 6;
  }
  return buf;
}

export function decodeSnapshot(buf) {
  const v = new DataView(buf);
  if (v.getUint8(0) !== KIND_SNAPSHOT) return null;
  const full = !!v.getUint8(1);
  const t = v.getFloat64(2);
  const n = v.getUint16(10);
  const bodies = [];
  let o = 12;
  for (let i = 0; i < n; i++) {
    const bid = v.getUint16(o); o += 2;
    const qv = [v.getInt16(o), v.getInt16(o + 2), v.getInt16(o + 4), 0, 0, 0, 0]; o += 6;
    qv[3] = v.getUint8(o); o += 1;
    qv[4] = v.getInt16(o); qv[5] = v.getInt16(o + 2); qv[6] = v.getInt16(o + 4); o += 6;
    bodies.push([bid, qv]);
  }
  return { t, full, bodies };
}

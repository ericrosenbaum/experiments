"use strict";

/**
 * Smart Brick proximity display.
 *
 * Every BLE advertisement the bridge hears fires one ripple through a field of
 * LEGO studs. The field's colour temperature tracks smoothed signal strength,
 * so the whole page runs cold and blue when the brick is far away and turns
 * white hot when it is next to the laptop.
 */

/* ------------------------------------------------------------------ *
 * Signal model
 * ------------------------------------------------------------------ */

// Decibel readings that map to "touching" and "out of range". These are only
// defaults; the calibration controls overwrite them for the user's own room.
const DEFAULT_NEAR_RSSI = -44;
const DEFAULT_FAR_RSSI = -92;

// Log-distance path loss constants. TX_AT_1M is a typical BLE reference power
// and PATH_LOSS_N is an indoor exponent. Both are approximations, which is why
// the distance figure is presented as an estimate.
const TX_AT_1M = -59;
const PATH_LOSS_N = 2.5;

// No advertisement for this long means the brick is gone, not merely quiet.
const STALE_AFTER_MS = 2000;

const CALIBRATION_KEY = "smart-brick-proximity:calibration";

const signal = {
  rssi: null,
  rate: 0,
  lastPacketAt: 0,
  device: null,
  bluetooth: "unknown",
  scanning: false,
  connected: false,
};

let calibration = { near: DEFAULT_NEAR_RSSI, far: DEFAULT_FAR_RSSI };

function loadCalibration() {
  try {
    const saved = JSON.parse(localStorage.getItem(CALIBRATION_KEY) || "null");
    if (saved && Number.isFinite(saved.near) && Number.isFinite(saved.far) && saved.near > saved.far) {
      calibration = { near: saved.near, far: saved.far };
    }
  } catch {
    /* Private browsing or blocked storage: the defaults are fine. */
  }
}

function saveCalibration() {
  try {
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
  } catch {
    /* Nothing to do; calibration simply will not persist. */
  }
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function isStale() {
  return !signal.lastPacketAt || Date.now() - signal.lastPacketAt > STALE_AFTER_MS;
}

/** Normalised 0..1 closeness, using the current calibration endpoints. */
function proximity() {
  if (signal.rssi === null || isStale()) return 0;
  const span = calibration.near - calibration.far;
  if (span <= 0) return 0;
  return clamp01((signal.rssi - calibration.far) / span);
}

/** Very rough metres, from the log-distance path loss model. */
function estimatedMetres() {
  if (signal.rssi === null || isStale()) return null;
  const metres = Math.pow(10, (TX_AT_1M - signal.rssi) / (10 * PATH_LOSS_N));
  return Math.min(60, Math.max(0.05, metres));
}

/* ------------------------------------------------------------------ *
 * Colour ramp
 * ------------------------------------------------------------------ */

// Cold deep blue, through ice and warm sand, to white hot. The ramp deliberately
// passes through a near-neutral pale tone rather than green, which keeps every
// intermediate mix clean.
const RAMP = [
  [0.0, [28, 62, 110]],
  [0.28, [42, 140, 200]],
  [0.5, [150, 205, 230]],
  [0.68, [244, 206, 140]],
  [0.84, [255, 138, 64]],
  [1.0, [255, 236, 214]],
];

function rampColor(position) {
  const p = clamp01(position);
  for (let i = 1; i < RAMP.length; i += 1) {
    const [stopPos, stopColor] = RAMP[i];
    const [prevPos, prevColor] = RAMP[i - 1];
    if (p <= stopPos) {
      const t = (p - prevPos) / (stopPos - prevPos || 1);
      return [
        Math.round(prevColor[0] + (stopColor[0] - prevColor[0]) * t),
        Math.round(prevColor[1] + (stopColor[1] - prevColor[1]) * t),
        Math.round(prevColor[2] + (stopColor[2] - prevColor[2]) * t),
      ];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

const rgb = (c, alpha = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
const shade = (c, amount) =>
  amount >= 0
    ? c.map((v) => Math.round(v + (255 - v) * amount))
    : c.map((v) => Math.round(v * (1 + amount)));

/* ------------------------------------------------------------------ *
 * Stud field
 * ------------------------------------------------------------------ */

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");

const SPRITE_LEVELS = 20;
const RESTING_COLOR = [30, 44, 62];

let dpr = 1;
let viewWidth = 0;
let viewHeight = 0;
let studs = [];
let sprites = [];
let baseLayer = null;
let origin = { x: 0, y: 0 };
let maxStudDistance = 1;
let studRadius = 13;
let studSpacing = 42;

/** Draw one stud, lit in the given colour, onto its own small canvas. */
function makeStudSprite(color, radius) {
  const size = radius * 4;
  const sprite = document.createElement("canvas");
  sprite.width = Math.ceil(size * dpr);
  sprite.height = Math.ceil(size * dpr);
  const g = sprite.getContext("2d");
  g.scale(dpr, dpr);

  const c = size / 2;

  // Halo, kept tight: a wide one merges neighbouring studs into a single wash
  // and destroys the ring structure of the ripples.
  const halo = g.createRadialGradient(c, c, radius * 0.7, c, c, radius * 1.75);
  halo.addColorStop(0, rgb(color, 0.3));
  halo.addColorStop(0.45, rgb(color, 0.07));
  halo.addColorStop(1, rgb(color, 0));
  g.fillStyle = halo;
  g.beginPath();
  g.arc(c, c, radius * 1.75, 0, Math.PI * 2);
  g.fill();

  // Stud body, lit from the upper left.
  const body = g.createRadialGradient(
    c - radius * 0.32,
    c - radius * 0.36,
    radius * 0.08,
    c,
    c,
    radius * 1.05,
  );
  body.addColorStop(0, rgb(shade(color, 0.45)));
  body.addColorStop(0.62, rgb(color));
  body.addColorStop(1, rgb(shade(color, -0.4)));
  g.fillStyle = body;
  g.beginPath();
  g.arc(c, c, radius, 0, Math.PI * 2);
  g.fill();

  // The raised circle on top of a LEGO stud.
  g.strokeStyle = rgb(shade(color, 0.35), 0.55);
  g.lineWidth = Math.max(1, radius * 0.12);
  g.beginPath();
  g.arc(c, c, radius * 0.56, 0, Math.PI * 2);
  g.stroke();

  // Rim highlight.
  g.strokeStyle = rgb(shade(color, 0.6), 0.4);
  g.lineWidth = Math.max(1, radius * 0.1);
  g.beginPath();
  g.arc(c, c, radius * 0.87, Math.PI * 1.08, Math.PI * 1.78);
  g.stroke();

  return sprite;
}

function buildField() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;

  canvas.width = Math.floor(viewWidth * dpr);
  canvas.height = Math.floor(viewHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Scale the studs so the field reads as a baseplate at any window size.
  // Chunky studs with dark gaps between them read as LEGO; fine ones turn into
  // a texture and lose the ripple rings.
  const shortEdge = Math.min(viewWidth, viewHeight);
  studSpacing = Math.max(42, Math.min(76, shortEdge / 13));
  studRadius = studSpacing * 0.29;

  sprites = [];
  for (let i = 0; i < SPRITE_LEVELS; i += 1) {
    sprites.push(makeStudSprite(rampColor(i / (SPRITE_LEVELS - 1)), studRadius));
  }
  const restingSprite = makeStudSprite(RESTING_COLOR, studRadius);

  // Off-centre origin: the composition is more interesting than a bullseye.
  origin = { x: viewWidth * 0.6, y: viewHeight * 0.44 };

  const cols = Math.ceil(viewWidth / studSpacing) + 2;
  const rows = Math.ceil(viewHeight / studSpacing) + 2;
  const offsetX = (viewWidth - (cols - 1) * studSpacing) / 2;
  const offsetY = (viewHeight - (rows - 1) * studSpacing) / 2;

  studs = [];
  maxStudDistance = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = offsetX + col * studSpacing;
      const y = offsetY + row * studSpacing;
      const distance = Math.hypot(x - origin.x, y - origin.y);
      maxStudDistance = Math.max(maxStudDistance, distance);
      studs.push({ x, y, distance, phase: Math.random() * Math.PI * 2 });
    }
  }

  // The resting grid never changes, so it is rendered once and blitted.
  baseLayer = document.createElement("canvas");
  baseLayer.width = canvas.width;
  baseLayer.height = canvas.height;
  const base = baseLayer.getContext("2d");
  base.scale(dpr, dpr);
  base.globalAlpha = 0.62;
  const spriteSize = studRadius * 4;
  for (const stud of studs) {
    base.drawImage(restingSprite, stud.x - spriteSize / 2, stud.y - spriteSize / 2, spriteSize, spriteSize);
  }
}

/* ------------------------------------------------------------------ *
 * Ripples
 * ------------------------------------------------------------------ */

const MAX_RIPPLES = 26;
const MIN_RIPPLE_GAP_MS = 70;

const ripples = [];
let lastRippleAt = 0;

function spawnRipple(amplitude) {
  const now = performance.now();
  if (now - lastRippleAt < MIN_RIPPLE_GAP_MS) return;
  lastRippleAt = now;
  ripples.push({ born: now, amplitude });
  if (ripples.length > MAX_RIPPLES) ripples.shift();
}

/* ------------------------------------------------------------------ *
 * Render loop
 * ------------------------------------------------------------------ */

let visualTemp = 0;
let lastIdleRippleAt = 0;

function render(now) {
  const target = proximity();
  // Ease the temperature so a single noisy advertisement cannot make the
  // whole page flinch.
  visualTemp += (target - visualTemp) * 0.07;

  const stale = isStale();
  // While searching, emit a slow cold pulse so the field still breathes.
  if (stale && now - lastIdleRippleAt > 2600) {
    lastIdleRippleAt = now;
    ripples.push({ born: now, amplitude: 0.3 });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
  }

  const rippleSpeed = 250 + 460 * visualTemp;
  const rippleWidth = studSpacing * 1.15;
  const rippleLife = (maxStudDistance + rippleWidth) / rippleSpeed;

  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    const age = (now - ripples[i].born) / 1000;
    if (age > rippleLife) ripples.splice(i, 1);
  }

  const hot = rampColor(visualTemp);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  // Atmospheric glow behind the field.
  const glowRadius = Math.max(viewWidth, viewHeight) * (0.16 + 0.2 * visualTemp);
  const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, glowRadius);
  glow.addColorStop(0, rgb(hot, 0.09 + 0.15 * visualTemp));
  glow.addColorStop(0.5, rgb(hot, 0.03 + 0.05 * visualTemp));
  glow.addColorStop(1, rgb(hot, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  ctx.drawImage(baseLayer, 0, 0, viewWidth, viewHeight);

  // Lit studs accumulate additively, so overlapping crests bloom to white.
  ctx.globalCompositeOperation = "lighter";
  const spriteSize = studRadius * 4;
  const halfSprite = spriteSize / 2;
  const coreRadius = studSpacing * 1.6 + viewHeight * 0.26 * visualTemp;
  const seconds = now / 1000;

  for (const stud of studs) {
    // Idle shimmer keeps the plate alive even with no signal at all. Kept low,
    // so the rings stay the brightest thing on screen.
    let energy = 0.022 + 0.016 * Math.sin(seconds * 0.6 + stud.phase);

    // Standing glow around the origin, growing with proximity.
    if (stud.distance < coreRadius) {
      energy += visualTemp * 0.6 * Math.pow(1 - stud.distance / coreRadius, 1.4);
    }

    // Each advertisement, expanding outward.
    for (const ripple of ripples) {
      const age = (now - ripple.born) / 1000;
      const radius = rippleSpeed * age;
      const offset = Math.abs(stud.distance - radius);
      if (offset < rippleWidth) {
        // A sharp crest profile keeps each packet a distinct ring rather than
        // a general brightening of the plate. The gentle fade curve lets a
        // ring stay legible most of the way out to the edge.
        const crest = Math.pow(1 - offset / rippleWidth, 1.25);
        const fade = Math.pow(1 - age / rippleLife, 0.6);
        energy += ripple.amplitude * crest * fade * (0.6 + 0.4 * visualTemp);
      }
    }

    if (energy <= 0.035) continue;
    energy = Math.min(1, energy);

    // Ambient temperature dominates the colour so a whole ripple reads as one
    // warm ring; local energy only pushes the crest further up the ramp.
    const level = Math.round(clamp01(visualTemp * 0.78 + energy * 0.35) * (SPRITE_LEVELS - 1));
    ctx.globalAlpha = energy;
    ctx.drawImage(sprites[level], stud.x - halfSprite, stud.y - halfSprite, spriteSize, spriteSize);
  }

  // Vignette, drawn last to settle the edges.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  const vignette = ctx.createRadialGradient(
    viewWidth / 2,
    viewHeight / 2,
    Math.min(viewWidth, viewHeight) * 0.3,
    viewWidth / 2,
    viewHeight / 2,
    Math.max(viewWidth, viewHeight) * 0.8,
  );
  vignette.addColorStop(0, "rgba(5, 7, 12, 0)");
  vignette.addColorStop(1, "rgba(5, 7, 12, 0.82)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  document.documentElement.style.setProperty("--signal", rgb(hot));
  document.documentElement.style.setProperty("--signal-soft", rgb(hot, 0.3));

  requestAnimationFrame(render);
}

/* ------------------------------------------------------------------ *
 * Sparkline
 * ------------------------------------------------------------------ */

const sparkCanvas = document.getElementById("spark");
const sparkCtx = sparkCanvas.getContext("2d");
const HISTORY_MS = 90000;
const history = [];

function recordHistory() {
  const now = Date.now();
  history.push({ t: now, rssi: isStale() ? null : signal.rssi });
  while (history.length > 0 && now - history[0].t > HISTORY_MS) history.shift();
}

function drawSpark() {
  const width = sparkCanvas.clientWidth;
  const height = sparkCanvas.clientHeight;
  if (width === 0 || height === 0) return;

  sparkCanvas.width = Math.floor(width * dpr);
  sparkCanvas.height = Math.floor(height * dpr);
  sparkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sparkCtx.clearRect(0, 0, width, height);

  if (history.length < 2) return;

  const now = Date.now();
  const top = calibration.near + 6;
  const bottom = calibration.far - 6;
  const toY = (value) => height - clamp01((value - bottom) / (top - bottom)) * height;
  const toX = (time) => width - ((now - time) / HISTORY_MS) * width;

  const color = rampColor(proximity());

  // Filled area under the trace, broken wherever the signal was lost.
  sparkCtx.beginPath();
  let penDown = false;
  for (const point of history) {
    if (point.rssi === null) {
      penDown = false;
      continue;
    }
    const x = toX(point.t);
    const y = toY(point.rssi);
    if (!penDown) {
      sparkCtx.moveTo(x, y);
      penDown = true;
    } else {
      sparkCtx.lineTo(x, y);
    }
  }
  sparkCtx.strokeStyle = rgb(color, 0.9);
  sparkCtx.lineWidth = 1.25;
  sparkCtx.lineJoin = "round";
  sparkCtx.stroke();

  sparkCtx.lineTo(width, height);
  sparkCtx.lineTo(toX(history[0].t), height);
  sparkCtx.closePath();
  const fill = sparkCtx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, rgb(color, 0.26));
  fill.addColorStop(1, rgb(color, 0));
  sparkCtx.fillStyle = fill;
  sparkCtx.fill();
}

/* ------------------------------------------------------------------ *
 * Readouts
 * ------------------------------------------------------------------ */

const el = {
  statusText: document.getElementById("statusText"),
  pulse: document.getElementById("pulse"),
  rssi: document.getElementById("outRssi"),
  rate: document.getElementById("outRate"),
  signatures: document.getElementById("outSignatures"),
  id: document.getElementById("outId"),
  distance: document.getElementById("outDistance"),
  meterFill: document.getElementById("meterFill"),
  nearValue: document.getElementById("nearValue"),
  farValue: document.getElementById("farValue"),
};

function statusLine() {
  if (!signal.connected) return "Bridge offline";
  if (signal.bluetooth !== "poweredOn") return `Bluetooth ${signal.bluetooth}`;
  if (!signal.scanning) return "Scanner idle";
  if (isStale()) return "Searching";
  return "Signal locked";
}

function updateReadouts() {
  el.statusText.textContent = statusLine();

  const stale = isStale();
  el.rssi.textContent = signal.rssi === null || stale ? "—" : `${signal.rssi.toFixed(1)} dBm`;
  el.rate.textContent = stale ? "—" : `${signal.rate.toFixed(1)} / s`;
  el.signatures.textContent =
    !stale && signal.device?.signatures?.length ? signal.device.signatures.join(" · ") : "—";
  el.id.textContent = !stale && signal.device?.id ? signal.device.id.slice(0, 8) : "—";

  const metres = estimatedMetres();
  el.distance.textContent = metres === null ? "—" : metres < 10 ? metres.toFixed(1) : String(Math.round(metres));
  el.meterFill.style.width = `${(proximity() * 100).toFixed(1)}%`;

  el.nearValue.textContent = `${Math.round(calibration.near)}`;
  el.farValue.textContent = `${Math.round(calibration.far)}`;
}

let pulseTimer = 0;
function flashPulse() {
  el.pulse.classList.add("lit");
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => el.pulse.classList.remove("lit"), 70);
}

/* ------------------------------------------------------------------ *
 * Server-sent events
 * ------------------------------------------------------------------ */

function applySnapshot(data) {
  signal.rssi = typeof data.rssi === "number" ? data.rssi : null;
  signal.rate = data.rate || 0;
  signal.lastPacketAt = data.lastPacketAt || 0;
  signal.device = data.device || null;
  signal.bluetooth = data.bluetooth || "unknown";
  signal.scanning = Boolean(data.scanning);

  // The bridge and the browser may disagree about the clock, so rebase the
  // last-packet time onto local time.
  if (data.sinceLastPacket !== null && data.sinceLastPacket !== undefined) {
    signal.lastPacketAt = Date.now() - data.sinceLastPacket;
  }
}

function connect() {
  const source = new EventSource("/events");

  source.addEventListener("open", () => {
    signal.connected = true;
  });

  source.addEventListener("status", (event) => {
    signal.connected = true;
    applySnapshot(JSON.parse(event.data));
  });

  source.addEventListener("packet", (event) => {
    signal.connected = true;
    applySnapshot(JSON.parse(event.data));
    spawnRipple(0.85 + 0.5 * proximity());
    flashPulse();
  });

  source.addEventListener("error", () => {
    signal.connected = false;
    source.close();
    // EventSource reconnects on its own, but only for transient errors; a
    // restarted bridge needs a fresh connection.
    setTimeout(connect, 1500);
  });
}

/* ------------------------------------------------------------------ *
 * Calibration controls
 * ------------------------------------------------------------------ */

document.getElementById("setNear").addEventListener("click", () => {
  if (signal.rssi === null || isStale()) return;
  calibration.near = Math.max(signal.rssi, calibration.far + 6);
  saveCalibration();
  updateReadouts();
});

document.getElementById("setFar").addEventListener("click", () => {
  if (signal.rssi === null || isStale()) return;
  calibration.far = Math.min(signal.rssi, calibration.near - 6);
  saveCalibration();
  updateReadouts();
});

document.getElementById("resetCal").addEventListener("click", () => {
  calibration = { near: DEFAULT_NEAR_RSSI, far: DEFAULT_FAR_RSSI };
  saveCalibration();
  updateReadouts();
});

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

loadCalibration();
buildField();
connect();
requestAnimationFrame(render);

setInterval(() => {
  updateReadouts();
}, 100);

setInterval(() => {
  recordHistory();
  drawSpark();
}, 250);

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    buildField();
    drawSpark();
  }, 150);
});

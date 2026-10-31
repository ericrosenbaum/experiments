// Flat, vector bells. The five shapes and three patterns of the original
// sprite sheet, drawn with Canvas 2D: as white masks that the canvas tints
// per note (so color animation stays cheap), and as ready-colored icons for
// the HTML palette and tabs.

import { INSTRUMENTS, bellColor, cssColor } from './music.js';

/** Unit-radius outline of each instrument's shape, centered on 0,0. */
function shapePath(shape) {
  const p = new Path2D();
  switch (shape) {
    case 'ring':
      p.arc(0, 0, 0.98, 0, Math.PI * 2);
      p.moveTo(0.4, 0);
      p.arc(0, 0, 0.4, 0, Math.PI * 2, true);
      break;
    case 'square':
      p.roundRect(-0.86, -0.86, 1.72, 1.72, 0.3);
      break;
    case 'ball':
      p.arc(0, 0, 0.98, 0, Math.PI * 2);
      break;
    case 'star': {
      const spikes = 12;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 ? 0.76 : 0.97;
        const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
        p[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      p.closePath();
      break;
    }
    case 'triangle': {
      // rounded corners: arcTo along each edge
      const pts = [
        [0, -0.98],
        [1, 0.84],
        [-1, 0.84],
      ];
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const start = mid(pts[2], pts[0]);
      p.moveTo(...start);
      for (let i = 0; i < 3; i++) p.arcTo(...pts[i], ...mid(pts[i], pts[(i + 1) % 3]), 0.2);
      p.closePath();
      break;
    }
  }
  return p;
}

const fillRule = (shape) => (shape === 'ring' ? 'evenodd' : 'nonzero');

/** fn 1 = a band across the middle (scale notes), 2 = stripes (chromatic). */
function patternPath(fn) {
  const p = new Path2D();
  if (fn === 1) p.rect(-1.2, -0.3, 2.4, 0.6);
  if (fn === 2) {
    for (let k = 1; k < 9; k += 2) p.rect(-1 + (k * 2) / 9, -1.2, 2 / 9, 2.4);
  }
  return p;
}

/**
 * Draw a bell into a 2D context, centered at cx, cy with radius r (pixels).
 * `body` and `pattern` are CSS colors; pass null to skip either.
 */
export function drawBell(ctx, { shape, fn, body, pattern, cx, cy, r }) {
  const outline = shapePath(shape);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(r, r);
  if (body) {
    ctx.fillStyle = body;
    ctx.fill(outline, fillRule(shape));
    if (shape === 'star') {
      // soften the star's points
      ctx.lineJoin = 'round';
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = body;
      ctx.stroke(outline);
    }
  }
  if (pattern && fn > 0) {
    ctx.clip(outline, fillRule(shape));
    ctx.fillStyle = pattern;
    ctx.fill(patternPath(fn));
  }
  ctx.restore();
}

export const MASK_SIZE = 256;
export const MASK_RADIUS = 120; // the bell's radius inside the mask canvas

/**
 * White masks for every instrument and note function, as canvases:
 * masks[instrument][fn] = { body, pattern }.
 */
export function bellMasks() {
  return INSTRUMENTS.map(({ shape }) =>
    [0, 1, 2].map((fn) => {
      const make = (body, pattern) => {
        const c = document.createElement('canvas');
        c.width = c.height = MASK_SIZE;
        drawBell(c.getContext('2d'), { shape, fn, body, pattern, cx: MASK_SIZE / 2, cy: MASK_SIZE / 2, r: MASK_RADIUS });
        return c;
      };
      return { body: make('#fff', null), pattern: fn ? make(null, '#fff') : null };
    }),
  );
}

/** The lighter color used for a bell's band or stripes. */
export function patternColor(base) {
  const mix = (c) => Math.round(c + (255 - c) * 0.5);
  return (mix(base >> 16) << 16) | (mix((base >> 8) & 255) << 8) | mix(base & 255);
}

/** A colored bell icon as a <canvas>, sized in CSS pixels. */
export function bellIcon(instrument, fn, { note = null, octave = 1, size = 40, body, pattern } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const c = document.createElement('canvas');
  c.className = 'bell-icon';
  c.width = c.height = Math.round(size * dpr);
  const base = note == null ? null : bellColor(note, octave);
  drawBell(c.getContext('2d'), {
    shape: INSTRUMENTS[instrument].shape,
    fn,
    body: body ?? cssColor(base),
    pattern: pattern ?? cssColor(patternColor(base)),
    cx: c.width / 2,
    cy: c.height / 2,
    r: c.width / 2 - dpr,
  });
  return c;
}

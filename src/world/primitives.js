// The one description of what world code can use. The worker implements it
// (world.worker.js) and the prompt quotes it (server/prompt.js), so keep the
// two in step by editing here.

export const WORLD = { W: 1600, H: 900 };

// Where a new player stands, by seat number.
export const SEATS = [[530, 450], [1070, 450], [530, 220], [1070, 220], [530, 680], [1070, 680]];

export const HOOKS = [
  ['layer', 'number, default 0. Modules draw in ascending layer order: backgrounds negative, videos 0, overlays positive.'],
  ['needs', "array of camera features this module reads: any of 'hands', 'face', 'pose', 'cutout'. Each one costs CPU for everyone, so list only what you use."],
  ['control(ctx, me, dt)', 'runs every frame on each person\'s own computer for their own player only. The only place that may change me.x, me.y, me.scale, me.vars. Read ctx.key / ctx.pointer here.'],
  ['simulate(ctx, dt)', 'runs every frame on one computer only (the host). The only place that may change ctx.shared. Use it for things everyone must agree on: a ball, a score, a timer.'],
  ['draw(ctx, g)', 'runs every frame on every computer. g is a CanvasRenderingContext2D for the 1600x900 world, reset to defaults before each frame. Must not change players or ctx.shared.'],
];

export const CTX = [
  ['ctx.W, ctx.H', 'world size, always 1600 x 900. (0,0) is top left.'],
  ['ctx.t, ctx.dt', 'seconds since this computer joined, and seconds since the last frame.'],
  ['ctx.players', 'array of every player in the room, in join order.'],
  ['ctx.player(id)', 'one player by id, or null if they have left.'],
  ['ctx.me', 'the player on this computer.'],
  ['ctx.isHost', 'true on the one computer that runs simulate.'],
  ['ctx.shared', 'plain JSON object copied from the host to everyone about 30 times a second. Survives code changes. Create entries lazily in simulate: `const ball = ctx.shared.ball ??= {x: 800, y: 450, vx: 0, vy: 0}`. In draw, always guard: `const ball = ctx.shared.ball; if (!ball) return;`'],
  ['ctx.key(name)', "true while this computer's key is held. Names are KeyboardEvent.key values: 'ArrowLeft', 'ArrowUp', 'a', ' ' (or 'space'), 'Enter'."],
  ['ctx.pressed(name)', 'true only on the frame the key went down.'],
  ['ctx.pointer', "{x, y, down} this computer's mouse in world coordinates."],
  ['ctx.drawVideo(g, player, x, y, w, h?, opts?)', "draws the player's camera centred on (x, y), w wide. h defaults to the camera's own shape; if given, the picture is cropped to fill. opts.cutout: true draws the person with their background removed (needs 'cutout'). Shape it by clipping first: g.save(); g.beginPath(); g.arc(x, y, r, 0, 7); g.clip(); ctx.drawVideo(...); g.restore(). Honours the current transform, so g.rotate and g.scale work."],
  ['ctx.toWorld(player, point)', "turns a camera point (x, y from 0 to 1, as in player.hands / face / pose) into world coordinates, matching where that player's video was last drawn. Returns {x, y}."],
  ['ctx.videoRect(player)', 'the {x, y, w, h} box (top left corner and size) where that player\'s video was last drawn, or null.'],
];

export const PLAYER = [
  ['id, name', "id is stable, like 'p1'. name is what they typed."],
  ['x, y, scale', 'where and how big. Starts at a seat with scale 1. Only the owner changes them, in control.'],
  ['vars', 'plain JSON object the owner can write in control and everyone can read. Use it for anything about a player others must see: facing, jumping, a pressed key. Other players and the host read it; they cannot write it.'],
  ['hasVideo', 'false if their camera is off.'],
  ['hands', "needs 'hands'. Array of 0 to 2 hands, each {points: [21 x {x, y}]}. Indices: 0 wrist, 4 thumb tip, 8 index tip, 12 middle tip, 16 ring tip, 20 pinky tip; 5, 9, 13, 17 are the knuckles."],
  ['face', "needs 'face'. null, or {leftEye, rightEye, nose, mouth, chin, forehead, left, right} (each {x, y}; left/right are the face edges as seen on screen), plus mouthOpen (0 closed to 1 wide), and roll (head tilt in radians)."],
  ['pose', "needs 'pose'. null, or 33 body points {x, y, v} (v is visibility 0 to 1). 0 nose, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 23/24 hips, 25/26 knees, 27/28 ankles."],
];

const lines = (rows) => rows.map(([sig, text]) => `- \`${sig}\`: ${text}`).join('\n');

export function reference() {
  return `### Module hooks\n${lines(HOOKS)}\n\n### ctx\n${lines(CTX)}\n\n### A player\n${lines(PLAYER)}`;
}

// What a brand new room runs.
export const DEFAULT_MODULES = {
  tiles: `// Draws everyone's camera as a tile with their name under it.
return {
  layer: 0,
  draw(ctx, g) {
    for (const p of ctx.players) {
      const w = 420 * p.scale;
      ctx.drawVideo(g, p, p.x, p.y, w);
      const r = ctx.videoRect(p);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.font = '600 22px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(p.name, p.x, r.y + r.h + 30);
    }
  },
};`,
};

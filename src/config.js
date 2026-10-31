// Constants carried over from the original app's config.h. Canvas units are
// the original iPad's points: the app was designed for a 1024x768 screen.

export const NUM_NOTES = 13; // C up to the C an octave above
export const BELL_RADIUS = 50;
export const REC_BELL_RADIUS = 75;
export const PATH_PLAYER_RADIUS = 50;
export const PATH_HEAD_RADIUS = 25;
export const BUMP = 25; // radius added when a bell plays, easing back after

export const DESIGN_WIDTH = 1024;
export const DESIGN_HEIGHT = 768;
export const SCREEN_START_X = 100;
export const SCREEN_START_Y = 100;

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 1.9;

// Bell colors: hue from the note as before. The flat style tones down the
// original's fully saturated HSV a little; octaves still read as darker
// (low) and paler (high).
export const BELL_SATURATION = 0.8;
export const BELL_VALUE = 0.96;
export const LOW_OCT_BRIGHTNESS = 0.6;
export const HIGH_OCT_SATURATION = 0.48;

export const GRID_SPACING = 240;
// Flat theme. The canvas keeps the original's checkerboard, in cooler grays.
export const BACKGROUND = 0x1c1e23;
export const GRID_COLOR = 0x212329;
export const THEME = {
  idle: 0x585d69, // players and recorder bells at rest
  idleInk: 0xc3c8d2,
  lit: 0xeef0f4, // ... and while playing
  litInk: 0x1c1e23,
  ink: 0xe7e9ee, // drawn lines
  path: 0xff3dc8, // the original's pink (HSB 220/255, 255, 255), a touch softer
  pathIdle: 0x7a3a69,
  select: 0xffd84a,
};

export const MODES = /** @type {const} */ (['draw', 'erase', 'select', 'path', 'mute', 'slide']);

export const ASSETS = './assets';

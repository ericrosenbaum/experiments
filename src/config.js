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

export const LOW_OCT_BRIGHTNESS = 0.5;
export const HIGH_OCT_SATURATION = 0.5;

export const GRID_SPACING = 240;
export const BACKGROUND = 0x323232; // ofBackground(50)
export const GRID_COLOR = 0x373737; // ofSetColor(55)

export const MODES = /** @type {const} */ (['draw', 'erase', 'select', 'path', 'mute', 'slide']);

export const ASSETS = './assets';

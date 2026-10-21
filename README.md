# Singing Fingers (web)

A browser port of [Singing Fingers](https://github.com/ericrosenbaum/singing-fingers),
an iPad app (openFrameworks) where you sing while you draw, then touch the
drawing to hear it.

Will be live at https://ericrosenbaum.github.io/experiments/singingfingers/

```sh
npm install
npm run dev      # http://localhost:5173 (the microphone needs localhost or https)
npm test         # pitch tracking, analysis and stroke geometry
npm run build    # dist/, deployed by .github/workflows/deploy.yml
```

## What carries over

- Touch blank canvas and sing while you move: a stroke grows wherever there
  is sound, colored by the pitch class of what you sing (C red, around the
  color wheel to B), white for noisy sounds, and as wide as it is loud. When
  the sound stops the stroke ends; when it starts again, a new one begins.
- Touch a stroke to hear what was sung at that spot, with the same pulsing
  bulge running along it. Rub against the direction it was drawn and it
  plays backward, easing through the turnaround like a record being
  scratched. Several fingers can play several strokes at once.
- Trash, undo, lock (every touch plays, never draws; hides the other
  buttons) and the tips picture, with the original's images.
- The same analysis: the dywapitch wavelet pitch tracker, the same loudness
  curve, zero-crossing noise test and 100-sample fades, adjusted for
  whatever sample rate the browser runs at.

## What's different

- **Rendering**: WebGL triangle strips with per-vertex color, as the
  original's `ofMesh`. Sizes are in CSS pixels (half the original's retina
  pixels).
- **Sound**: an AudioWorklet does what `audioIn()`/`audioOut()` did: it
  analyzes and records the microphone and mixes the strokes' playback on the
  audio thread. The microphone is opened raw (no echo cancellation, noise
  suppression or gain control). A soft clipper replaces hard clipping when
  many strokes play at once.
- **Start screen**: browsers need a tap before they'll make sound or open the
  microphone, so the original's launch picture is the start button.
- **Saving**: the drawing, sounds and all, is kept in the browser
  (IndexedDB) across reloads.
- **Small fixes**: playback interpolates between samples (the original's
  interpolation was a no-op); each finger has its own
  previous position; a stroke's first point lines up with the stroke. The silence gate also stays a little above
  the room's background level, so a noisy laptop doesn't draw on its own;
  in a quiet room it is the original's.
- Mouse works too, and there are keys: Z undo, L lock, H tips.

## Fixes from the original's issue list

- [#1](https://github.com/ericrosenbaum/singing-fingers/issues/1): a finger
  has to move 8 px before it can reverse a stroke, so a wobble doesn't.
- [#2](https://github.com/ericrosenbaum/singing-fingers/issues/2): direction
  is judged against the segment under the finger, with wrapped angles.
- [#3](https://github.com/ericrosenbaum/singing-fingers/issues/3): strokes
  with less than 0.15 s of sound are dropped.
- [#4](https://github.com/ericrosenbaum/singing-fingers/issues/4): the start
  of a stroke has a bigger touch target.
- [#5](https://github.com/ericrosenbaum/singing-fingers/issues/5): starting a
  stroke takes a bit more sound than keeping one going, besides the
  background-level gate above.
- [#10](https://github.com/ericrosenbaum/singing-fingers/issues/10): round
  caps on both ends (strokes cut off by silence keep their width rather than
  pinching to a point).
- [#11](https://github.com/ericrosenbaum/singing-fingers/issues/11): touching
  where a stroke crosses itself plays the part drawn last.
- [#12](https://github.com/ericrosenbaum/singing-fingers/issues/12), one of
  its ideas: swipe along a stroke and let go, and it keeps playing to the
  end, faster or slower with the swipe, backward if you swiped backward.
- In the spirit of [#13](https://github.com/ericrosenbaum/singing-fingers/issues/13):
  touching a stroke that's still playing crossfades instead of clicking.

## Layout

- `src/app.js`: touches, modes, buttons (after `ofApp.mm`)
- `src/shape.js`: a stroke's mesh, hit test, playback position and
  animation (after `Shape.mm`)
- `src/worklet.js`: analysis, recording and playback on the audio thread
- `src/analysis.js`, `src/pitch.js`: color and width from sound; the pitch
  tracker port
- `src/audio.js`, `src/renderer.js`, `src/hud.js`, `src/storage.js`
- `public/assets/`: the original's images and icons
- `tools/smoke.mjs`: headless Chrome with a fake microphone that sings,
  against `npx vite preview --port 4173`

The pitch tracker is Antoine Schmitt's dywapitchtrack (MIT licence).

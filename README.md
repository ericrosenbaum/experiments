# MelodyMorph (web)

A browser port of [MelodyMorph](https://github.com/ericrosenbaum/melodymorph),
an iPad app (openFrameworks, 2011–2014) for making interactive musical
instruments and compositions out of colored bells.

Live at https://ericrosenbaum.github.io/experiments/melodymorph/

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # file format and tuning tests
npm run build    # dist/, deployed by .github/workflows/deploy.yml
```

## What carries over

Everything you could do on the iPad:

- Drag bells out of the palette, tap to play, drag off a bell's edge to move
  it, drop it back on the palette to delete it. Pan and pinch-zoom the canvas.
- Five instruments (bass, e-piano, piano, pluck, vibes) with the original
  samples, played at the original pitches, and three octaves.
- Bell shapes and colors: hue by note, darker low octave, paler high octave,
  plain/band/stripes for triad/scale/chromatic notes.
- Record button → recorder bells with their little score; path players that
  trigger whatever they cross and loop when they return home.
- Draw, erase, select (move, duplicate, pitch ±), mute and strum tools, as
  quasi-modes: hold the button with one finger and use it with another.
- Show all notes / note names, stop all, hide controls, the animated help.
- All 47 example morphs, loading from the original XML files.

## What's different

- **Rendering**: PixiJS (WebGL) instead of openFrameworks. Bells are tinted
  sprites from the original sprite sheet, as before.
- **Sound**: Tone.js instead of ofxMaxim. Same voice model as `PolySynth.h`:
  8 voices per instrument, one second of sustain then the same exponential
  decay, oldest voice stolen with a short fade. Notes from recorder bells are
  scheduled on the audio clock, so playback no longer depends on frame rate.
  A compressor and limiter replace the old hard clip.
- **UI**: HTML/CSS controls instead of ofxUI and UIKit nibs, laid out for
  any screen size, phones included. Tool buttons also latch on a tap (for
  mice), and there are keyboard shortcuts (see Help).
- **Saving and sharing**: the MIT sharing server is long gone. Morphs save to
  "My Stuff" in the browser's local storage, can be shared as a link (the
  whole morph, compressed into the URL), and can be downloaded or imported
  as the iPad app's XML format. The canvas autosaves across reloads.
- **Small fixes** from the original's to-do list: notes played by path
  players are recorded; pitch ± steps through the scale when only scale notes
  are shown; paths with no length aren't kept; a selection can be deleted.
- Old documents framed for the 1024×768 iPad screen are rescaled to fit the
  window.

## Layout

- `src/app.js`: canvas, camera, input, modes, recording, selection
- `src/world.js`: bells, recorder bells, path players, drawn lines
- `src/audio.js`: sample voices on Tone.js
- `src/music.js`: notes, colors, sample/pitch mapping
- `src/morph-format.js`: the XML file format and the compact share format
- `src/hud.js`, `src/menus.js`, `src/storage.js`: controls, dialogs, saving
- `public/assets/`: the original's images, samples, fonts, help GIFs and
  examples; `archive/` holds older example sets and art that the app
  doesn't load
- `tools/smoke.mjs`, `tools/smoke-touch.mjs`: headless-Chromium checks
  against `npx vite preview --port 4173`

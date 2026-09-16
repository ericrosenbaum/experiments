# sleep spectrogram

A single-file, browser-only spectrogram viewer for long overnight audio
recordings, built for scanning a recording of a sleeping child for breathing
pauses, snoring, and other irregularities.

**Run it:** open `index.html` in Chrome, Edge or Safari (double-clicking the
file works; no server or build step). Drop in the recording or use
*Open audio…*. Anything the browser can decode works, including `.m4a`.

## What it does

- **Whole-night to single-breath zoom.** Scroll over the spectrogram to zoom
  the time axis around the cursor, drag to pan, or use the zoom presets
  (All / 5 min / 1 min / 15 s / 5 s). The overview strip at the bottom shows
  where you are in the full recording; click it to jump.
- **Loudness strip** under the spectrogram, so breathing rhythm reads as a
  picket fence even when the spectrogram is zoomed out.
- **Quiet-stretch finder.** Set a loudness threshold (red dashed line) and a
  minimum duration; every stretch of the recording that stays below the
  threshold for at least that long is listed and shaded red. Click one to
  zoom to it. Short blips above the threshold (under 0.3 s) do not break a
  stretch. This is a scanning aid to find places worth looking at, not a
  diagnosis.
- **Listen.** Click to place the playhead, `space` to play. Gain boost up to
  +40 dB and an 80 Hz high-pass for quiet recordings. The view follows the
  playhead.
- **Measure.** Shift-drag to select a stretch; the duration is shown and
  `space` plays just that selection.
- **Markers.** Double-click or press `M` to drop a marker, label it in the
  side panel, export as CSV. Markers are remembered per file in the browser.
- **Display controls.** Colormap, frequency range (500 Hz to 8 kHz), linear
  or log frequency axis, dB floor/ceiling with an *auto* button.
- **Analysis controls.** Sample rate (default 16 kHz, shows up to 8 kHz),
  FFT window (default 1024, about 64 ms and 15.6 Hz bins) and overlap.

## How it works

Audio is decoded and resampled by the Web Audio API, mixed to mono, then a
Hann-windowed STFT runs in a Web Worker (with a main-thread fallback). Levels
are stored as 8-bit dB values (-120 to 0 dBFS) together with a max-pooled time
pyramid, so drawing at any zoom level is a cheap max over a handful of frames
per pixel. A 30-minute recording at the default settings is about 60 MB of
spectrogram plus 60 MB of pyramid and analyses in a few seconds.

Everything runs locally in the browser; the recording never leaves the
machine.

## Reading a sleep recording

- Each breath is a broadband smear (a few hundred Hz up to several kHz) and a
  bump on the loudness strip. At a 5 s zoom you can see inhale and exhale as
  two bursts.
- Snoring shows as a low-frequency buzz with harmonics, mostly under 500 Hz.
  The log-frequency axis helps here.
- The pattern to look for is a stretch with no breath bumps followed by a
  loud gasp or snort, then breathing resuming. The quiet-stretch finder is
  tuned to surface exactly that.

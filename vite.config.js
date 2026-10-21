import { defineConfig } from 'vite';

// Served from https://ericrosenbaum.github.io/experiments/melodymorph/,
// so every asset path must be relative.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 800 }, // PixiJS + Tone.js
});

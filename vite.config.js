import { defineConfig, loadEnv } from 'vite';
import { generateMiddleware } from './server/generate.js';
import { bricktalkMiddleware } from './server/bricktalk.js';
import { finderMiddleware } from './server/finder.js';

const claudeApi = {
  name: 'claude-generate-api',
  configureServer(server) { server.middlewares.use(generateMiddleware()); server.middlewares.use(bricktalkMiddleware()); server.middlewares.use(finderMiddleware()); },
  configurePreviewServer(server) { server.middlewares.use(generateMiddleware()); server.middlewares.use(bricktalkMiddleware()); server.middlewares.use(finderMiddleware()); },
};

export default defineConfig(({ mode }) => {
  // Load ANTHROPIC_* from .env / .env.local into process.env for the server
  // middleware only. These are not VITE_-prefixed, so they never reach the page.
  const env = loadEnv(mode, process.cwd(), 'ANTHROPIC_');
  for (const [k, v] of Object.entries(env)) if (v && !process.env[k]) process.env[k] = v;
  return config;
});

const config = {
  base: './',
  plugins: [claudeApi],
  build: { target: 'esnext', rollupOptions: { input: { main: 'index.html', finder: 'finder.html' } } },
  worker: { format: 'es' },
};

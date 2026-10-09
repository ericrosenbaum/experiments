import { defineConfig } from 'vite';
import { generateMiddleware } from './server/generate.js';

const claudeApi = {
  name: 'claude-generate-api',
  configureServer(server) { server.middlewares.use(generateMiddleware()); },
  configurePreviewServer(server) { server.middlewares.use(generateMiddleware()); },
};

export default defineConfig({
  base: './',
  plugins: [claudeApi],
  build: { target: 'esnext' },
  worker: { format: 'es' },
});

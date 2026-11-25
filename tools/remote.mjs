// npm run dev:remote (your API key) or npm run dev:remote:cc (your Claude Code
// login): hosts a call from this computer. It builds the page, runs the server
// and opens a Cloudflare quick tunnel to it, so a friend elsewhere can join
// over https (cameras need https off localhost). The link works until you stop
// this with Ctrl+C, and anyone who has it can spend your Claude usage meanwhile.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = process.env.PORT ?? '8787';

// The built page, not the dev server: Vite's dev server is not meant to face the internet.
const build = spawnSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn('node', ['--env-file-if-exists=.env.local', 'server/index.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, PORT: port, NODE_ENV: 'production' } });
const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
tunnel.on('error', () => {
  console.error('\ncloudflared is not installed. Install it with: brew install cloudflared\n');
  server.kill();
  process.exit(1);
});
// One room for this run, so you and your friend open the same link.
const room = Array.from(crypto.randomBytes(6), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
let shown = false;
const show = (d) => {
  const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m || shown) return;
  shown = true;
  console.log(`\nShare this link, and open it yourself too:\n\n  ${m[0]}/?room=${room}\n\nIt can take a few seconds to start working. Ctrl+C ends the call for everyone.\n`);
};
tunnel.stdout.on('data', show);
tunnel.stderr.on('data', show);
tunnel.on('exit', (code) => { if (!shown) console.error(`\nThe tunnel stopped before giving a link (cloudflared exited with ${code}).\n`); server.kill(); process.exit(1); });
const stop = () => { server.kill(); tunnel.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', stop);

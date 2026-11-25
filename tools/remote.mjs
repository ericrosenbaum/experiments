// npm run dev:remote: runs the server and opens a Cloudflare quick tunnel to
// it, so a friend elsewhere can join over https (cameras need https off localhost).
// Anyone with the link can spend your Claude key while this runs.
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = process.env.PORT ?? '8787';
const server = spawn('node', ['--env-file-if-exists=.env.local', 'server/index.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, PORT: port } });
const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
tunnel.on('error', () => {
  console.error('\ncloudflared is not installed. Install it with: brew install cloudflared\n');
  server.kill();
  process.exit(1);
});
const show = (d) => { const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m) console.log(`\nShare this link: ${m[0]}\n`); };
tunnel.stdout.on('data', show);
tunnel.stderr.on('data', show);
const stop = () => { server.kill(); tunnel.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', stop);

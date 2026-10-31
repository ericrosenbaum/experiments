// Run the page (vite) and the sim server together, one terminal.
//   node tools/dev-all.mjs         this computer only (localhost)
//   node tools/dev-all.mjs --lan   also other computers, tablets and phones on
//                                  the same Wi-Fi, for playing in a room together
//   node tools/dev-all.mjs --remote  anyone, anywhere: a Cloudflare quick tunnel
//                                  gives this computer a public https address
//                                  (needs cloudflared: brew install cloudflared)
// Players reach the sim server through the page's own /ws (vite proxies it),
// so only the page's port has to be reachable, and one tunnel carries both.
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const remote = process.argv.includes('--remote');
const lan = remote || process.argv.includes('--lan');
const port = process.env.PORT || '5173';
// On the internet, programs from strangers' pages run on this computer: use the
// V8 isolate sandbox (a worker thread is not a security boundary).
const simEnv = { ...process.env, PORT: process.env.SIM_PORT || '8787', ...(remote ? { SANDBOX: 'isolate' } : {}) };
if (remote) {
  try { await import('isolated-vm'); } catch {
    console.error('\n  ✋ --remote runs other people\'s programs on this computer, so it needs the isolated-vm sandbox,');
    console.error('     which did not load. Try: npm install isolated-vm\n');
    process.exit(1);
  }
}
const procs = new Set();
let stopping = false;
const run = (cmd, args, opts) => { const p = spawn(cmd, args, { stdio: 'inherit', ...opts }); procs.add(p); p.on('exit', () => procs.delete(p)); return p; };
const stop = () => { stopping = true; for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// On your own: restart the sim server when its code changes. For players on
// the Wi-Fi: no restarts mid-game when you edit, but if it ever crashes it
// comes straight back (their pages rejoin a fresh room).
function sim() {
  const p = run('node', [...(lan ? [] : ['--watch']), 'server/sim/index.js'], { env: simEnv });
  p.on('exit', (code, signal) => {
    if (stopping) return;
    if (!lan) { if (code) stop(); return; }
    console.log(`\n  ⚠️  the sim server stopped (${code ?? signal}); starting it again\n`);
    setTimeout(sim, 1000);
  });
}
sim();
run('npx', ['vite', '--port', port, '--strictPort', ...(lan && !remote ? ['--host'] : [])], { env: { ...process.env, ...(remote ? { DEV_TUNNEL: '1' } : {}) }, shell: process.platform === 'win32' })
  .on('exit', (code) => { if (code && !stopping) stop(); });

if (remote) {
  // A quick tunnel: no Cloudflare account, a new random https address each run,
  // gone when this stops. It prints the address on stderr among its own logs.
  const t = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(t);
  let shown = false;
  const scan = (buf) => {
    const m = !shown && String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!m) return;
    shown = true;
    console.log(`\n  🌍 Play together from anywhere: open ${m[0]}/`);
    console.log('     Open it on this computer too (not localhost), press Play together, and share the link it shows.');
    console.log('     It can take ~20 seconds before the address answers. It changes every time you start this.');
    console.log('     Anyone with the link can play, and can make programs with Claude on your API key.\n');
  };
  t.stdout.on('data', scan);
  t.stderr.on('data', scan);
  t.on('error', (err) => {
    if (err.code === 'ENOENT') console.error('\n  ✋ --remote needs cloudflared. On a Mac: brew install cloudflared\n');
    else console.error(`\n  ✋ cloudflared: ${err.message}\n`);
    stop();
  });
  t.on('exit', (code) => { procs.delete(t); if (!stopping) { console.error(`\n  ✋ the tunnel stopped (${code})\n`); stop(); } });
} else if (lan) {
  // This computer's addresses on the local network (Wi-Fi or wired).
  const ips = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  setTimeout(() => {
    const urls = ips.map((ip) => `http://${ip}:${port}/`);
    console.log(`\n  🧱 Play together on this Wi-Fi: open ${urls[0] ?? `http://<this computer's address>:${port}/`}`);
    for (const u of urls.slice(1)) console.log(`     (or ${u})`);
    console.log('     Open it on this computer too (not localhost), press Play together, and share the link it shows.');
    console.log('     Over plain http the Talk button is hidden: browsers only allow the microphone on https or localhost.\n');
  }, 1500);
}

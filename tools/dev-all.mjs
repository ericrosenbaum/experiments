// Run the page (vite) and the sim server together, one terminal.
//   node tools/dev-all.mjs         this computer only (localhost)
//   node tools/dev-all.mjs --lan   also other computers, tablets and phones on
//                                  the same Wi-Fi, for playing in a room together
// Players on the Wi-Fi reach the sim server through the page's own /ws (vite
// proxies it), so only the page's port has to be reachable.
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const lan = process.argv.includes('--lan');
const port = process.env.PORT || '5173';
const simEnv = { ...process.env, PORT: process.env.SIM_PORT || '8787' };
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
run('npx', ['vite', '--port', port, '--strictPort', ...(lan ? ['--host'] : [])], { env: process.env, shell: process.platform === 'win32' })
  .on('exit', (code) => { if (code && !stopping) stop(); });

if (lan) {
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

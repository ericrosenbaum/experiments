// Run the page (vite) and the sim server together, one terminal.
import { spawn } from 'node:child_process';
const procs = [
  spawn('node', ['--watch', 'server/sim/index.js'], { stdio: 'inherit', env: process.env }),
  spawn('npx', ['vite'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) stop(); });

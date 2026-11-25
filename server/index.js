// The whole backend in one process: serves the page (through Vite in dev, from
// dist/ in production), and runs the rooms over a WebSocket at /ws?room=<id>.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { Room, MAX_PLAYERS } from './room.js';
import { mode } from './claude.js';

const PORT = Number(process.env.PORT ?? 8787);
const PROD = process.env.NODE_ENV === 'production';
const ORIGINS = (process.env.ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_ROOMS = 20;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const root = path.resolve(import.meta.dirname, '..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.json': 'application/json' };

function serveFile(res, dir, rel) {
  const file = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
  return true;
}

let page; // (req, res) => void
if (PROD) {
  const dist = path.join(root, 'dist');
  page = (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (serveFile(res, dist, rel === '/' ? 'index.html' : rel)) return;
    if (serveFile(res, dist, 'index.html')) return;
    res.writeHead(404).end('not built: run npm run build');
  };
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, appType: 'spa', server: { middlewareMode: true, hmr: false, allowedHosts: true } });
  page = (req, res) => vite.middlewares(req, res);
}

const wasmDir = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/healthz') { res.writeHead(200).end('ok'); return; }
  if (pathname.startsWith('/mp-wasm/')) {
    if (!serveFile(res, wasmDir, pathname.slice('/mp-wasm/'.length))) res.writeHead(404).end();
    return;
  }
  page(req, res);
});

const rooms = new Map(); // id -> {room, timer}
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const id = url.searchParams.get('room') ?? '';
  const okOrigin = !ORIGINS.length || ORIGINS.includes(req.headers.origin);
  if (url.pathname !== '/ws' || !/^[a-z0-9-]{3,40}$/.test(id) || !okOrigin) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => connect(ws, id));
});

function connect(ws, id) {
  let entry = rooms.get(id);
  if (!entry) {
    if (rooms.size >= MAX_ROOMS) { ws.close(1013, 'The server is full. Try again later.'); return; }
    entry = { room: new Room(id), timer: null };
    rooms.set(id, entry);
  }
  const { room } = entry;
  let client = null;
  let count = 0;
  const window = setInterval(() => { count = 0; }, 1000);

  ws.on('message', (data) => {
    if (++count > 120) return; // per second, per browser
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!client) {
      if (m.type !== 'hello') return;
      if (room.size >= MAX_PLAYERS) { ws.close(1013, 'This room is full.'); return; }
      clearTimeout(entry.timer);
      const name = String(m.name ?? '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 20) || 'Someone';
      client = room.add(ws, name);
      return;
    }
    room.handle(client, m);
  });
  ws.on('close', () => {
    clearInterval(window);
    if (!client) { if (!room.size && !entry.timer) rooms.delete(id); return; }
    room.remove(client);
    // Keep an empty room's world for a while so a refresh does not wipe it.
    if (!room.size) entry.timer = setTimeout(() => { if (!room.size) rooms.delete(id); }, ROOM_IDLE_MS);
  });
  ws.on('error', () => {});
}

server.listen(PORT, () => {
  const ai = mode();
  console.log(`worldchat on http://localhost:${PORT}  (${ai === 'claude' ? 'Claude ready' : ai === 'claude-code' ? 'Claude via your Claude Code login' : ai === 'mock' ? 'mock Claude' : 'no ANTHROPIC_API_KEY: the world cannot be changed'})`);
});

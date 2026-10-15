// The sim server: rooms over WebSockets. One process holds many rooms, each
// stepping its own world. Pages connect to /ws?room=<id>, send a hello, and
// from then on exchange the messages in protocol.js (JSON) and snapshots
// (binary). Locally the Vite dev server proxies /ws here; in the cloud the
// page connects straight to this process (see docs/multiplayer-plan.md).
//
//   PORT          port to listen on (8787)
//   MAX_ROOMS     rooms this process will hold at once (20)
//   ROOM_IDLE_MS  how long an empty room stays before it is torn down (10 min)
//   ORIGINS       comma-separated page origins allowed to connect (any when unset)
//   LAG_MS        development: delay every message both ways by this much (0)
//   SANDBOX       'thread' (default) or 'isolate' (isolated-vm, see sandbox-isolate.js)
import http from 'node:http';
import { WebSocketServer } from 'ws';
import RAPIER from '@dimforge/rapier3d-compat';
import { Room, MAX_PLAYERS } from './room.js';
import { sandboxFactory } from './sandbox-node.js';
import { validate } from './protocol.js';

const PORT = Number(process.env.PORT) || 8787;
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 20;
const ROOM_IDLE_MS = Number(process.env.ROOM_IDLE_MS) || 10 * 60 * 1000;
const ORIGINS = (process.env.ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const LAG_MS = Number(process.env.LAG_MS) || 0;
const HELLO_TIMEOUT = 10_000;
const PING_MS = 15_000;

const log = (...a) => console.log(new Date().toISOString(), ...a);

export async function startServer({ port = PORT } = {}) {
  await RAPIER.init();
  const makeSandbox = await sandboxFactory();
  const rooms = new Map();

  const roomFor = (id, worldId) => {
    let room = rooms.get(id);
    if (room) return room;
    if (rooms.size >= MAX_ROOMS) return null;
    room = new Room({
      id, RAPIER, makeSandbox, worldId, log, idleMs: ROOM_IDLE_MS,
      onEmpty: (r) => { rooms.delete(r.id); r.dispose(); log(`room ${r.id}: closed (idle)`); },
    });
    rooms.set(id, room);
    log(`room ${id}: opened (${worldId ?? 'playground'})`);
    return room;
  };

  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0) }));
      return;
    }
    res.statusCode = 404;
    res.end('sim server: connect to /ws?room=<id>');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const origin = req.headers.origin;
    if (ORIGINS.length && origin && !ORIGINS.includes(origin)) { log(`refused origin ${origin}`); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const roomId = (url.searchParams.get('room') ?? '').replace(/[^\w-]/g, '').slice(0, 40);
    let room = null, player = null;
    const delay = (fn) => (LAG_MS ? setTimeout(fn, LAG_MS) : fn());
    const sock = {
      send: (data) => delay(() => { if (ws.readyState === ws.OPEN) ws.send(data); }),
      close: () => ws.close(),
    };
    const helloTimer = setTimeout(() => { if (!player) ws.close(); }, HELLO_TIMEOUT);
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let m;
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (!player) {
        const hello = validate(m);
        if (!hello || hello.type !== 'hello' || !roomId) { ws.close(); return; }
        clearTimeout(helloTimer);
        room = roomFor(roomId, hello.world ?? undefined);
        if (!room) { ws.send(JSON.stringify({ type: 'full', max: MAX_PLAYERS, rooms: true })); ws.close(); return; }
        player = room.join(sock, hello);
        if (!player) room = null;
        return;
      }
      delay(() => { if (player) room.handle(player, m); });
    });
    const bye = () => { clearTimeout(helloTimer); if (room && player) room.leave(player); player = null; };
    ws.on('close', bye);
    ws.on('error', bye);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  // Drop sockets that stopped answering pings (a closed laptop).
  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, PING_MS);

  await new Promise((resolve) => server.listen(port, resolve));
  log(`sim server listening on :${server.address().port}${LAG_MS ? ` (adding ${LAG_MS}ms lag each way)` : ''}`);

  const close = () => new Promise((resolve) => {
    clearInterval(pinger);
    for (const r of rooms.values()) r.dispose();
    rooms.clear();
    for (const ws of wss.clients) ws.terminate();
    server.close(() => resolve());
  });
  return { server, wss, rooms, close, port: server.address().port };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const s = await startServer();
  const stop = async () => { await s.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

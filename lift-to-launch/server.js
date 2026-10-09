"use strict";

/**
 * Lift to Launch bridge.
 *
 * Runs worker.js in a loop to keep a connection to the Smart Brick, turns its
 * charging-state readings into a small flight state machine, and streams that
 * state to the page over Server-Sent Events.
 *
 *   docked  --(charging goes to 0)-->  flying   (launch)
 *   flying  --(charging reads 1)---->  docked   (landing)
 *
 * Lift detection is fast because the link is still up when charging drops.
 * The brick then closes the link about 1.7 seconds later, so a landing is only
 * seen when a new worker reconnects and reads charging = 1. The flight state
 * deliberately survives that gap.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 8766);
const PUBLIC_DIR = path.join(__dirname, "public");
const RESTART_DELAY_MS = 800;

const state = {
  // unknown until the first charging reading; then docked or flying
  phase: "unknown",
  // searching, connected, or reconnecting
  link: "searching",
  flightStartedAt: null,
  lastFlightMs: null,
  launches: 0,
  battery: null,
};

const clients = new Set();

function snapshot() {
  const now = Date.now();
  return {
    ...state,
    flightElapsedMs: state.flightStartedAt ? now - state.flightStartedAt : null,
    serverTime: now,
  };
}

function broadcast(event, payload = snapshot()) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
}

function log(message) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`${time}  ${message}`);
}

function setLink(link) {
  if (state.link === link) return;
  state.link = link;
  broadcast("state");
}

function onCharging(docked, at) {
  const previous = state.phase;

  if (!docked && previous !== "flying") {
    state.phase = "flying";
    state.flightStartedAt = at;
    // A brick that is already off the dock when we first meet it is flying,
    // but nobody saw it take off, so that is not a launch.
    if (previous === "docked") {
      state.launches += 1;
      log(`LAUNCH #${state.launches}`);
      broadcast("launch");
    } else {
      broadcast("state");
    }
    return;
  }

  if (docked && previous !== "docked") {
    if (previous === "flying" && state.flightStartedAt) {
      state.lastFlightMs = at - state.flightStartedAt;
      log(`LANDED after ${(state.lastFlightMs / 1000).toFixed(1)} s`);
      state.phase = "docked";
      state.flightStartedAt = null;
      broadcast("land");
    } else {
      state.phase = "docked";
      broadcast("state");
    }
  }
}

function handleWorkerEvent(event) {
  switch (event.type) {
    case "connected":
      if (typeof event.battery === "number") state.battery = event.battery;
      setLink("connected");
      break;
    case "charging":
      onCharging(event.docked, event.at);
      break;
    case "disconnected":
    case "stalled":
    case "connect_failed":
      setLink("reconnecting");
      break;
    case "not_found":
      // While flying, the brick is off its dock and not accepting connections,
      // so failing to find it is expected and says nothing about the flight.
      setLink(state.phase === "flying" ? "reconnecting" : "searching");
      break;
    default:
      break;
  }
}

let worker = null;
let shuttingDown = false;

function startWorker() {
  if (shuttingDown) return;

  worker = spawn(process.execPath, [path.join(__dirname, "worker.js")], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  let buffer = "";
  worker.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        handleWorkerEvent(JSON.parse(line));
      } catch {
        /* ignore anything that is not one of our JSON lines */
      }
    }
  });

  worker.on("exit", () => {
    worker = null;
    setTimeout(startWorker, RESTART_DELAY_MS);
  });
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function serveStatic(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.join(PUBLIC_DIR, path.normalize(requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, body) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.url === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(snapshot()));
    return;
  }

  serveStatic(req, res);
});

// Keeps idle proxies and browsers from closing a quiet stream.
setInterval(() => {
  for (const res of clients) {
    try {
      res.write(": keepalive\n\n");
    } catch {
      clients.delete(res);
    }
  }
}, 15000);

server.listen(PORT, "127.0.0.1", () => {
  log(`Lift to Launch: http://127.0.0.1:${PORT}`);
  startWorker();
});

function shutdown() {
  shuttingDown = true;
  if (worker) worker.kill("SIGTERM");
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

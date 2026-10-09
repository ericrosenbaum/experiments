"use strict";

/**
 * Smart Brick proximity bridge.
 *
 * Scans for the LEGO Smart Brick's BLE advertisements and streams each one to
 * the browser over Server-Sent Events. The browser cannot read these packets
 * itself: the brick's beacon advertisement is non-connectable, and Web
 * Bluetooth on macOS offers no passive scanning, so this process does the
 * listening and the page does the drawing.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const noble = require("@stoprocent/noble");

const PORT = Number(process.env.PORT || 8765);
const PUBLIC_DIR = path.join(__dirname, "public");

// A LEGO advertisement is identified by any of three independent markers, so a
// brick is still recognised whether it is docked (named, with manufacturer
// data) or awake on the desk (bare FC96 beacon only).
const LEGO_COMPANY_ID_LE = "9703"; // 0x0397 little-endian, LEGO System A/S
const LEGO_BEACON_SERVICE = "fc96"; // 16-bit service UUID assigned to LEGO
const LEGO_WDX_SERVICE = "fef6"; // WDX service, advertised while docked

// Exponential moving average weight applied to raw RSSI. Radio noise on a
// single advertisement runs to about 10 dB, so this is deliberately heavy.
const RSSI_SMOOTHING = 0.25;
// Trailing window used to report the advertisement rate.
const RATE_WINDOW_MS = 3000;
// Cadence of the idle status event, which keeps the page's staleness clock
// honest when no packets are arriving at all.
const STATUS_INTERVAL_MS = 400;

const state = {
  bluetooth: "unknown",
  scanning: false,
  smoothedRssi: null,
  lastPacketAt: 0,
  recent: [], // timestamps, for the rate calculation
  device: null, // { id, name, mac, signatures }
};

const clients = new Set();

/** Classify an advertisement, returning null if it is not from a LEGO device. */
function readLegoAdvertisement(peripheral) {
  const ad = peripheral.advertisement || {};
  const localName = ad.localName || "";
  const manufacturerHex = ad.manufacturerData ? ad.manufacturerData.toString("hex") : "";
  const serviceData = Array.isArray(ad.serviceData) ? ad.serviceData : [];
  const serviceUuids = Array.isArray(ad.serviceUuids) ? ad.serviceUuids : [];

  const hasBeacon = serviceData.some((entry) => String(entry.uuid).toLowerCase() === LEGO_BEACON_SERVICE);
  const hasWdx = serviceUuids.some((uuid) => String(uuid).toLowerCase() === LEGO_WDX_SERVICE);
  const hasCompanyId = manufacturerHex.startsWith(LEGO_COMPANY_ID_LE);
  const hasName = localName.toLowerCase().includes("smart brick");

  if (!hasBeacon && !hasWdx && !hasCompanyId && !hasName) return null;

  const signatures = [];
  if (hasBeacon) signatures.push("FC96");
  if (hasWdx) signatures.push("FEF6");
  if (hasCompanyId) signatures.push("0x0397");

  return {
    id: peripheral.id,
    rssi: peripheral.rssi,
    name: localName || "Smart Brick",
    signatures,
    // Docked bricks advertise a connectable packet; the desk beacon does not.
    connectable: peripheral.connectable === true,
  };
}

function trimRateWindow(now) {
  const cutoff = now - RATE_WINDOW_MS;
  while (state.recent.length > 0 && state.recent[0] < cutoff) state.recent.shift();
}

function packetRate(now) {
  trimRateWindow(now);
  return state.recent.length / (RATE_WINDOW_MS / 1000);
}

function snapshot(now) {
  return {
    bluetooth: state.bluetooth,
    scanning: state.scanning,
    rssi: state.smoothedRssi,
    rate: Number(packetRate(now).toFixed(2)),
    lastPacketAt: state.lastPacketAt,
    sinceLastPacket: state.lastPacketAt ? now - state.lastPacketAt : null,
    device: state.device,
    serverTime: now,
  };
}

function broadcast(event, payload) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    // A slow or closed client must never stall the scanner.
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
}

function onAdvertisement(peripheral) {
  const reading = readLegoAdvertisement(peripheral);
  if (!reading) return;

  const now = Date.now();
  state.smoothedRssi =
    state.smoothedRssi === null
      ? reading.rssi
      : state.smoothedRssi + RSSI_SMOOTHING * (reading.rssi - state.smoothedRssi);
  state.lastPacketAt = now;
  state.recent.push(now);
  state.device = {
    id: reading.id,
    name: reading.name,
    signatures: reading.signatures,
    connectable: reading.connectable,
  };

  broadcast("packet", {
    ...snapshot(now),
    rawRssi: reading.rssi,
  });
}

function startScanning() {
  noble
    .startScanningAsync([], true) // no filter, allow duplicates: we need every packet
    .then(() => {
      state.scanning = true;
      console.log("Scanning for LEGO Smart Brick advertisements...");
      broadcast("status", snapshot(Date.now()));
    })
    .catch((error) => {
      state.scanning = false;
      console.error("Failed to start scanning:", error.message);
      broadcast("status", snapshot(Date.now()));
    });
}

noble.on("stateChange", (bluetoothState) => {
  state.bluetooth = bluetoothState;
  console.log("Bluetooth adapter:", bluetoothState);
  if (bluetoothState === "poweredOn") {
    startScanning();
  } else {
    state.scanning = false;
    broadcast("status", snapshot(Date.now()));
  }
});

noble.on("discover", onAdvertisement);

setInterval(() => {
  if (clients.size > 0) broadcast("status", snapshot(Date.now()));
}, STATUS_INTERVAL_MS);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.join(PUBLIC_DIR, path.normalize(requested));

  // Refuse anything that escapes the public directory.
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
    // Tell the client where things stand before the next packet arrives.
    res.write(`event: status\ndata: ${JSON.stringify(snapshot(Date.now()))}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.url === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(snapshot(Date.now())));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Smart Brick proximity display: http://127.0.0.1:${PORT}`);
});

function shutdown() {
  console.log("\nStopping scan.");
  noble.stopScanning(() => process.exit(0));
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

"use strict";

/**
 * One connection session with the Smart Brick.
 *
 * Connects, then polls the charging-state register as fast as the brick
 * answers, printing one JSON line per event on stdout. It exits when the
 * connection ends for any reason, and server.js starts a fresh worker.
 *
 * A fresh process per session is deliberate. node-smartplay remembers
 * peripherals it has already reported and will not report the same brick
 * again after a failed connect, and the brick drops the link about 1.7 seconds
 * after every lift. Restarting the process sidesteps both.
 */

process.on("unhandledRejection", () => {});

const { SmartPlay } = require("node-smartplay");

const CHARGING_STATE = 0x93;
const UX_SIGNAL = 0x90;
const KEEPALIVE = [0xea, 0x00];
const KEEPALIVE_EVERY_MS = 500;
const CONNECT_TIMEOUT_MS = 20000;
const READ_TIMEOUT_MS = 2500;
const SCAN_TIMEOUT_MS = 30000;
const MAX_CONSECUTIVE_FAILURES = 4;

function emit(type, extra = {}) {
  process.stdout.write(`${JSON.stringify({ type, at: Date.now(), ...extra })}\n`);
}

function finish(type, extra) {
  emit(type, extra);
  process.exit(0);
}

// The library's own timeouts only arm after the GATT write is acknowledged,
// and on macOS that acknowledgement can be lost, so every request gets an
// outer deadline of its own.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

const smartPlay = new SmartPlay();
let claimed = false;

const giveUp = setTimeout(() => finish("not_found"), SCAN_TIMEOUT_MS);

smartPlay.on("discover", async (device) => {
  if (claimed) return;
  claimed = true;
  clearTimeout(giveUp);

  try {
    await withTimeout(device.connect(), CONNECT_TIMEOUT_MS);
  } catch (error) {
    try {
      device.disconnect();
    } catch {
      /* already gone */
    }
    finish("connect_failed", { reason: error.message });
  }

  // The library polls battery and charging on its own timer. Those requests
  // overlap with ours and wedge the link, so all traffic goes through the loop
  // below, one request at a time.
  device.stopPolling();
  const connection = device.connection;

  emit("connected", { battery: device.battery });
  device.on("disconnect", () => finish("disconnected"));

  let lastValue = null;
  let failures = 0;
  let lastKeepalive = 0;

  for (;;) {
    try {
      const response = await withTimeout(connection.readRegister(CHARGING_STATE, READ_TIMEOUT_MS), READ_TIMEOUT_MS + 500);
      failures = 0;
      const value = response.data[0];
      if (value !== lastValue) {
        lastValue = value;
        emit("charging", { value, docked: value !== 0 });
      }
    } catch {
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        try {
          device.disconnect();
        } catch {
          /* already gone */
        }
        finish("stalled");
      }
    }

    // Without a periodic keepalive the brick treats the session as idle.
    if (Date.now() - lastKeepalive > KEEPALIVE_EVERY_MS) {
      try {
        await withTimeout(connection.writeRegister(UX_SIGNAL, KEEPALIVE, false), READ_TIMEOUT_MS);
      } catch {
        /* a missed keepalive is harmless; a dead link shows up in the reads */
      }
      lastKeepalive = Date.now();
    }
  }
});

smartPlay.scan();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

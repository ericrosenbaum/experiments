"use strict";

/**
 * Lift to Launch page.
 *
 * The bridge streams the flight phase. This page only animates changes to it:
 * docked to flying ignites and launches the rocket, flying to docked brings it
 * back down onto the pad.
 */

const IGNITION_MS = 400;
const LANDING_MS = 1700;
const LANDED_MESSAGE_MS = 4000;

// Press L to fake a lift or a landing, for trying the page without a brick.
const SIMULATE_KEY = "l";

const body = document.body;
const el = {
  link: document.getElementById("link"),
  linkText: document.getElementById("linkText"),
  count: document.getElementById("count"),
  prompt: document.getElementById("prompt"),
  timer: document.getElementById("timer"),
};

let phase = null;
let flightStartedAt = null;
let lastFlightMs = null;
let landedAt = 0;
let simulated = false;
let timers = [];

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function later(fn, ms) {
  timers.push(setTimeout(fn, ms));
}

/** Put the page into a phase without animating, for first paint and resyncs. */
function placePhase(next) {
  clearTimers();
  body.classList.add("no-anim");
  body.classList.remove("igniting", "landing");
  body.dataset.phase = next;
  // Force a style flush so the jump happens before animations are re-enabled.
  void body.offsetHeight;
  requestAnimationFrame(() => body.classList.remove("no-anim"));
}

function launch() {
  clearTimers();
  body.classList.remove("no-anim", "landing");
  body.classList.add("igniting");
  body.dataset.phase = "flying";
  later(() => body.classList.remove("igniting"), IGNITION_MS);
}

function land() {
  clearTimers();
  body.classList.remove("no-anim", "igniting");
  body.classList.add("landing");
  body.dataset.phase = "docked";
  landedAt = Date.now();
  later(() => body.classList.remove("landing"), LANDING_MS);
}

function applyPhase(next) {
  if (next === phase) return;
  if (phase === "docked" && next === "flying") launch();
  else if (phase === "flying" && next === "docked") land();
  else placePhase(next);
  phase = next;
  render();
}

function formatClock(ms) {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function render() {
  if (phase === "flying") {
    el.prompt.textContent = "Liftoff!";
    el.timer.textContent = flightStartedAt ? `T+ ${formatClock(Date.now() - flightStartedAt)}` : "In flight";
  } else if (phase === "docked") {
    const justLanded = lastFlightMs !== null && Date.now() - landedAt < LANDED_MESSAGE_MS;
    el.prompt.textContent = justLanded ? "Touchdown" : "Lift the brick to launch";
    el.timer.textContent = justLanded ? `${(lastFlightMs / 1000).toFixed(1)} s flight` : "";
  } else {
    el.prompt.textContent = "Wake the brick on its dock";
    el.timer.textContent = "";
  }
}

const LINK_TEXT = {
  searching: "Looking for the brick",
  reconnecting: "Reconnecting to the brick",
  connected: "Brick connected",
  offline: "Bridge offline",
};

function renderLink(link, launches) {
  el.link.dataset.link = link;
  el.linkText.textContent = simulated ? "Simulating (press L)" : LINK_TEXT[link] || link;
  el.count.textContent = launches ? `${launches} launch${launches === 1 ? "" : "es"}` : "";
}

function applyState(data) {
  if (simulated) return;
  flightStartedAt = data.flightElapsedMs !== null ? Date.now() - data.flightElapsedMs : null;
  if (data.lastFlightMs !== null) lastFlightMs = data.lastFlightMs;
  applyPhase(data.phase);
  renderLink(data.link, data.launches);
}

function connect() {
  const source = new EventSource("/events");
  // A reconnected stream may have missed transitions; place, don't animate.
  source.addEventListener("open", () => {
    phase = null;
  });
  for (const name of ["state", "launch", "land"]) {
    source.addEventListener(name, (event) => applyState(JSON.parse(event.data)));
  }
  source.addEventListener("error", () => {
    source.close();
    if (!simulated) renderLink("offline", 0);
    setTimeout(connect, 1500);
  });
}

let simulatedLaunches = 0;
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== SIMULATE_KEY || event.repeat) return;
  if (!simulated) {
    simulated = true;
    if (phase !== "flying") applyPhase("docked");
  }
  if (phase === "flying") {
    lastFlightMs = Date.now() - flightStartedAt;
    flightStartedAt = null;
    applyPhase("docked");
  } else {
    simulatedLaunches += 1;
    flightStartedAt = Date.now();
    applyPhase("flying");
  }
  renderLink("connected", simulatedLaunches);
});

setInterval(render, 100);
connect();

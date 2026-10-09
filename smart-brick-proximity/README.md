# Smart Brick Proximity

A live proximity display for a LEGO Smart Brick, driven by the brick's own
Bluetooth Low Energy advertisements. Every advertisement the Mac overhears fires
one ripple through a field of LEGO studs, and the field's colour temperature
tracks smoothed signal strength: cold blue when the brick is across the room,
white hot when it is beside the laptop.

Nothing is sent to the brick. This only listens.

## Running it

```bash
npm install
npm start
```

Then open <http://127.0.0.1:8765>.

The first run will make macOS ask for Bluetooth permission for whichever app is
running Node, usually Terminal or your editor. Without it the scanner sees
nothing and the page sits on "Searching".

## Waking the brick up

The brick has to be awake before it transmits anything at all.

| Brick state | What it advertises | Shows up here |
| --- | --- | --- |
| Asleep | nothing | no |
| Awake, off the dock | FC96 beacon, non-connectable | yes |
| Awake, on the charging dock | FC96 beacon plus a connectable "Smart Brick" packet with LEGO company ID 0x0397 | yes |

Shake it or set it on the dock. The `Advertises` row names which markers the
current packet carried, so it doubles as a readout of what the brick is doing.

## Calibrating

Signal strength depends on your room, your body, and which way the brick is
facing, so the default endpoints are only a starting point. Hold the brick where
you want the display to read full and press **Set near**. Carry it to the far
edge of where you care and press **Set far**. The two values persist in the
browser. **Reset** puts them back to -44 and -92 dBm.

## How it fits together

- `server.js` scans for LEGO advertisements with `@stoprocent/noble`, smooths the
  signal strength, and streams every packet to the browser over Server-Sent
  Events at `/events`. It also serves the page.
- `public/app.js` turns that stream into the stud field. Each packet becomes a
  ripple; the smoothed signal drives colour temperature and the readouts.

A browser cannot do this part on its own. The beacon advertisement is
non-connectable, so Web Bluetooth's device picker will not reach it, and Chrome
on macOS offers no passive advertisement scanning. Hence the local bridge.

## About the distance figure

The large number is a guess, not a measurement. It comes from the standard
log-distance path loss model with a reference power of -59 dBm at one metre and
an indoor path loss exponent of 2.5. Radio strength swings by roughly 10 dB from
one advertisement to the next as the brick turns or a hand passes over it, so
treat the number as a band rather than a reading. The decibel figure in the
telemetry rail is the real measurement.

## Endpoints

| Path | Purpose |
| --- | --- |
| `/` | the display |
| `/events` | SSE stream, one `packet` event per advertisement plus a `status` event every 400 ms |
| `/api/state` | current state as JSON, useful for debugging |

Set `PORT` to move it off 8765. The server binds to loopback only.

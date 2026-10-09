# Lift to Launch

Lift the LEGO Smart Brick off its charging dock and a rocket launches on screen.
Set it back on the dock and the rocket lands.

## Running it

```bash
npm install
npm start
```

Then open <http://127.0.0.1:8766>.

The brick has to be awake on its dock when you start. It only accepts Bluetooth
connections if it booted on the dock, so if the page keeps saying it is looking
for the brick, take the brick off, put it back, and shake it awake.

macOS will ask for Bluetooth permission for whichever app runs Node the first
time.

Press **L** on the page to fake a launch or a landing without the brick.

## How it works

The brick reports whether it is on the dock through its charging-state
register. `worker.js` connects and reads that register about ten times a second.
`server.js` turns the readings into a flight state and streams it to the page.

| You do | The Mac sees | Delay |
| --- | --- | --- |
| Lift the brick | charging drops to 0 on the live connection | about 0.1 s |
| (nothing) | the brick closes the connection | 1.7 s after the lift |
| Put it back | a new connection reads charging = 1 | about 2 s, longer after a long flight |

The brick always drops the connection shortly after a lift. That is its own
behaviour, not a bug here. So a landing only registers once the Mac reconnects,
which is why touchdown lags the real put-back by a couple of seconds. The server
starts a fresh worker process for every connection, because the Bluetooth
library will not rediscover a brick after a failed attempt.

## Files

| File | Role |
| --- | --- |
| `worker.js` | one connection session; prints JSON events and exits when the link ends |
| `server.js` | restarts the worker, runs the docked and flying state machine, serves the page |
| `public/` | the page: a rocket emoji, a pad, and a flight timer |

`/api/state` returns the current state as JSON, which is handy for debugging.
Set `PORT` to move the server off 8766.

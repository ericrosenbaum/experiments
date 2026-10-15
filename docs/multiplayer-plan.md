# Multiplayer prototype plan

A plan for making Brick Behaviors a shared world: a handful of kids in one room, one physics simulation everyone sees, visible selections with locks, and kids' programs running against the shared world. The server starts on a laptop and moves to the cloud without changing shape.

Status: built. Every phase below is implemented on the `claude/brick-behaviors` branch; the README's "Playing together" section is the user-facing summary. What differs from the plan as written is listed at the end, in section 13.

## 1. Goals and non-goals

Goals

- 2 to 6 players in a room, joined by link. No accounts, no login.
- One simulation. Everyone sees the same bricks fall the same way, within a tenth of a second.
- Each player's selection is visible to the others, and selecting a thing locks it: only you can drive it, drag it, or teach it until you let go.
- Programs belong to the world, not to a browser tab. A coin keeps spinning and a slime keeps patrolling whether or not the kid who taught it is still here.
- A server that runs on a local machine today and on a cloud host next month with the same code and a config change.

Non-goals for the prototype

- Persistence beyond the life of a room (a room that sits empty for ten minutes is gone).
- Client-side prediction or rollback. The toy tolerates 50 to 150 ms of input lag.
- More than one world per room at a time. Switching worlds switches it for everyone.
- Voice, text chat with words, or moderation beyond what Brick Talk already enforces.

## 2. What we already have

The codebase is closer to this than it looks.

| Already there | Why it matters |
|---|---|
| `World` runs without a renderer (`test/physics.harness.mjs` builds the real world in Node and steps it) | The server can run the exact same physics code. No port, no second engine. |
| Every entity has a `recipe` and `World.rebuild(recipe, pose)` covers models, bricks, flowers, statics and balls | A client can mirror a server-built world from a list of recipes instead of rebuilding presets itself. |
| `World.paused` already turns `step()` into "just sync meshes" | The client's world becomes a mirror by never stepping it. |
| The sandbox talks to its host only through JSON messages (`cmd`, `query`, `reply`, `key`, `touch`, `trace`...) | The host (`runtime.js`) can live on the server; the message shape is already transport-neutral. |
| `Runtime` validates and clamps every command, with per-actor caps | This is the server's trust boundary already written. |
| `Stage` state is plain data: behaviors per actor key, added models, moves, deletions | That map is the room state. Serializing it is trivial. |
| Actors are looked up by stable keys and survive rebuilds | Locks and behaviors can be keyed the same way across the wire. |
| `src/net.js` in history (commit 36414df) shared `say`, sounds and broadcasts between tabs | Reuse the event forwarding; drop the per-player authority model. |
| Claude endpoints are stateless functions already deployed on Vercel | They stay where they are. The sim server never needs an API key. |

What is missing: a process that owns the world, a wire protocol, players and locks, a Node-side sandbox, and a client that renders what it is told instead of what it computes.

## 3. The architecture decision: one authoritative simulation

Three ways to synchronize physics were considered.

| Option | How | Verdict |
|---|---|---|
| Per-player authority (what `net.js` did) | Each browser simulates its own models and sends transforms; others show kinematic copies | Shared props were never shared. Two kids pushing the same tower see two towers. Rejected. |
| Deterministic lockstep | Every client runs the same inputs through the same Rapier build | Programs use `setTimeout`, `Math.random()` and async Claude calls, so inputs are not the whole story. Rejected. |
| Server-authoritative | One process steps the world and runs the programs; clients send intents and render snapshots | Matches the headless harness we already have. Chosen. |

The picture:

```
 browser (kid A)            sim server (one process, many rooms)          browser (kid B)
 ┌───────────────┐          ┌──────────────────────────────────┐          ┌───────────────┐
 │ mirror World  │ snapshots│ Room                             │ snapshots│ mirror World  │
 │ (paused, no   │◄─────────│   World (Rapier, 60 Hz)          │─────────►│ (paused)      │
 │  stepping)    │  events  │   Runtime (validates, drives)    │  events  │               │
 │ UI, picking,  │─────────►│   Stage state (behaviors, moves) │◄─────────│ UI            │
 │ keys, drags   │ intents  │   Players, locks                 │ intents  │               │
 │ Claude calls ─┼──┐       │   Sandboxes (one per player)     │          │               │
 └───────────────┘  │       └──────────────────────────────────┘          └───────────────┘
                    ▼
            Vercel /api/generate, /api/bricktalk, /api/see  (stateless, unchanged)
```

Consequences worth saying out loud:

- The browser stops being the place where physics and programs happen. The `App` keeps picking, dragging, composing and rendering. Everything it used to call on `Stage` and `Runtime` becomes a message.
- Input lag equals one round trip. On a LAN that is a few milliseconds. From a cloud region it is 30 to 120 ms. Driving a race car at 120 ms feels floaty but fine for this toy. If it is not fine, the fix is client prediction for the locked model only, which this design leaves room for and the prototype skips.
- `see()` needs a picture from the model's eyes, and only a browser can render one. The server asks the lock holder's browser (or any browser in the room) to render and label it. Details in section 7.

## 4. Components

### 4.1 Sim server (`server/sim/`)

Node 22, plain `ws` (no socket.io: we want binary frames and nothing else). One process serves many rooms. Files:

- `index.js`: HTTP server for health checks plus the WebSocket upgrade at `/ws?room=<id>`. Reads `PORT`, `MAX_ROOMS`, `ROOM_IDLE_MS`.
- `room.js`: owns a `World`, a `Runtime`, the stage state, the player list and the lock table. Steps the world on a fixed 60 Hz timer, sends snapshots at 20 Hz.
- `player.js`: a socket, an id, a name, a color, a selection, and a rate limiter.
- `protocol.js`: message types, validation of every inbound message (shape and bounds), and encoders for the binary snapshot.
- `snapshot.js`: which bodies changed since the last send, quantized.
- `sandbox-host.js`: runs behavior code in Node sandboxes behind the same interface the browser `Worker` offered.
- `manifest.js`: turns the live world into the joining-client payload and back.

`src/world/` and `src/behavior/runtime.js` are imported as they are. `src/stage.js` moves most of its logic server-side (see 4.3).

### 4.2 Wire protocol

JSON for everything except snapshots. Every inbound message is validated against a schema in `protocol.js` and dropped with a log line if it fails. Sizes are capped (code at 20 KB, text at 200 characters, 60 messages a second per player).

Client to server

| Message | Payload | Notes |
|---|---|---|
| `hello` | `{room, name?, playerId?}` | `playerId` from `sessionStorage`, so two tabs are two players. |
| `select` | `{key \| null}` | Requests a lock. Server answers `lock` or `lockDenied`. |
| `key` | `{key, down}` | Only honored for programs on the player's locked actor, and for World rules. |
| `drag` | `{key, x, y, z, yaw}` | At most 20 a second, lock holder only. `dragEnd` records the move for Reset. |
| `turn`, `respawn`, `clone`, `remove`, `addModel` | as today's buttons | Lock holder only (`addModel` needs no lock). |
| `teach` | `{key, behavior}` | The behavior as `makeBehavior` takes it: text, code, summary, title, keys. Code is parsed with acorn on the server before it runs. |
| `behavior` | `{id, op: 'enable' \| 'disable' \| 'delete' \| 'edit', code?}` | Lock holder only. |
| `run` | `{behaviorId, at}` | Click a stack of blocks. |
| `reset`, `world` | `{}` / `{id}` | Anyone. Broadcast as "Sam reset the world". |
| `chat` | `{symbols[]}` | Brick Talk symbols, validated again on the server. |
| `seeReply` | `{queryId, label}` | Answers a `seeRequest`. |

Server to client

| Message | Payload | Notes |
|---|---|---|
| `welcome` | `{playerId, color, manifest}` | Manifest: world id, gravity, entities (id, thingId, name, kind, recipe, pose, sleeping), behaviors per key, locks, players, pens, bubbles. |
| `players` | full list | On every join and leave. |
| `lock` / `lockDenied` | `{key, playerId}` / `{key, holder}` | |
| snapshot | binary | Section 5. |
| `add` / `remove` | `{entities[]}` / `{ids[]}` | Spawn, clone, explode, cleanup, Reset. |
| `behaviors` | `{key, list}` | Whole list for one actor; lists are short. |
| `program` | `{behaviorId, running, error?}` | |
| `log` | `{text, level, playerId?}` | Program log lines go to the player who taught the behavior, and to the room for errors. |
| `say`, `sound`, `color`, `pen`, `gravity`, `theme` | as the runtime emits them | Cosmetic effects that the physics snapshot does not carry. |
| `trace` | `{behaviorId, live, seen}` | Only to the lock holder, so blocks light up for the kid who is looking. |
| `seeRequest` | `{queryId, key, labels}` | To the lock holder, else any client. |
| `chat` | `{from, symbols}` | |

### 4.3 Where `Stage` goes

`Stage` today does two jobs: it keeps the per-world state and it applies the theme and camera. Split it:

- `server/sim/room.js` absorbs `load`, `reset`, `addModel`, `recordMove`, `removeActor`, `cloneActor` and the `saved` map (a room keeps the state of worlds it has visited, as today).
- `src/stage.js` keeps `applyTheme` and the camera move, plus a read-only copy of the behaviors map fed by `behaviors` messages, so the inspector keeps working.

The `Runtime` keeps three outward hooks that today point at the UI and audio: `ui.log`, `ui.say`, `audio.play`, plus `onActorAdded` and `onActorRemoved`. On the server they point at a `RoomEvents` object that turns each into a message. Nothing else in `runtime.js` touches the DOM.

### 4.4 Client changes

`src/ui/app.js` calls into `stage` and `runtime` in about thirty places (select, drag, clone, remove, respawn, teach, enable, edit, run, reset, world switch, key handling, the pad, the blocks view). Introduce `src/session.js`, a client object with those same method names that sends messages and applies replies to the mirror. `app.js` is then changed call by call, not rewritten.

The mirror world: the same `World` class, with Rapier bodies created so `position`, `bounds()` and picking keep working, but never stepped. A `mirror` flag on `step()` skips physics and runs only the cosmetic parts (`sync`, pens, figure leg swing). Snapshot positions are written straight into bodies with `setTranslation` and `setRotation`.

Everything a kid sees about other players is new UI: colored outline boxes on their selections with a name tag, a players strip in the top bar, "Maya is using this" in the inspector with the composer greyed out, and a toast when someone joins, leaves, resets or switches worlds.

## 5. Synchronized physics

### Server loop

- Fixed 60 Hz step with an accumulator, as today, but driven by `setInterval` with drift correction rather than a frame callback. A room that falls behind by more than four steps drops the extra time rather than catching up (same as the current cap).
- Snapshot at 20 Hz. Each snapshot carries only bodies that moved since the last snapshot (compare quantized transforms, skip sleeping bodies). Sleeping bodies cost nothing on the wire, which is most of a castle most of the time.
- A full snapshot every 2 seconds and on join, so a lost frame heals.

### Format

Binary, one `DataView`. Per body: a `uint16` index assigned when the entity is added (the `add` message carries it), position as three `int16` at 1/64 stud (range of plus or minus 512 studs, beyond the world's cleanup bound of 150), rotation as smallest-three with three `int16`. 14 bytes per body.

Expected traffic per client: a busy moment is about 40 moving bodies (a car hitting a tower, an exploding tree) at 20 Hz, about 11 KB a second. Quiet moments are a few hundred bytes a second. Six players is nothing for a laptop or a small cloud instance.

Start with JSON snapshots in Phase 1 to get things on screen, then switch to binary in Phase 4 once there is something to measure.

### Client interpolation

Render 100 ms behind the newest snapshot (two snapshot intervals) and interpolate position and rotation between the two surrounding snapshots. A body with only one snapshot in the buffer holds still. This is the standard approach and gives smooth motion at 20 Hz without prediction.

### Entity lifecycle

The server is the only builder. On join the client gets the manifest and calls `World.rebuild` for every entity. Spawned bricks, clones, explosion fragments and flowers arrive as `add` messages with their recipe. `remove` covers cleanup, `remove()`, Reset and world switches (Reset sends a fresh manifest rather than hundreds of removes).

Checked: every builder in `src/world/props.js` goes through `addStatic` or `addBrick`, and the worlds add balls and models through `addBall` and `addModel`, so every entity already has a recipe the client can rebuild from. No new recipe types are needed.

### Drags

A drag is a stream of `drag` messages from the lock holder. The server moves the bodies to each requested pose with `World.transform` as it does locally today, and on `dragEnd` records the move so Reset puts the thing back there. The dragging client also moves its own mirror immediately so the hand feels attached, and the next snapshot agrees with it.

## 6. Selection and locks

Rules

- A player's selection is a lock request. The server grants it if nothing else holds the key, and tells the room. Selecting something else or selecting nothing releases it. Disconnect releases every lock that player held, at once.
- A lock covers the whole actor as the UI understands it: selecting a house locks every brick of the house; double-clicking out one brick locks only that brick, and the whole house becomes selectable by someone else minus that brick. Locks are keyed by actor key exactly like behaviors.
- A lock gives its holder: key presses to that actor's programs, dragging and turning, copy, delete, respawn, and teaching or editing behaviors. Everyone else can point at the thing in chips, `goTo` it, bump it, and read its behavior cards.
- The World is never locked. Any player who has the World selected sends keys to World rules, so "when I press space, drop bricks from the sky" works for everyone. Editing World rules is last-write-wins on a per-behavior basis, which is fine for a handful of kids and simple to explain.
- Copies made by `clone()` start unlocked.
- No idle timeout on locks in the prototype. A kid staring at the composer for five minutes is still using the thing. If hoarding turns out to be a problem, add a "may I?" request that nudges the holder.

What the others see

- The selected thing gets an outline in the holder's color and a small name tag above it, both driven by `lock` messages and the mirror's bounds. The existing `selBox` code is the template.
- The inspector for a locked thing shows the cards read-only with a banner: "Maya is using this".
- A denied selection (two kids click the same thing in the same hundred milliseconds) snaps back with a short toast. The client selects optimistically, so the common case feels instant.

This also answers an open question in the README. Keys going only to the selected thing per player means two kids can each control a thing at once, which single-player could not do.

## 7. User code execution

### Where programs run

On the server, in the room, regardless of who is connected. The alternative, keeping the sandbox in the owner's browser and tunneling its messages to the server, was considered seriously because it reuses the existing Web Worker sandbox and the browser is a strong security boundary. It lost on three points: premade behaviors (coins, slimes, the catapult) would need a designated "host" browser and a hand-off when that kid leaves, every `look()` or `move()` would pay a round trip, and programs would stop when their author closed the tab, which breaks "programs belong to the world".

The room runs one sandbox per player plus one for the room itself. A player's sandbox runs the behaviors they taught; the room's sandbox runs premade behaviors and anything whose author has left. Programs are multiplexed inside a sandbox by behavior id, so `sandbox.worker.js` grows a `program` field on every message and keeps its handler tables per program. Fewer sandboxes than programs matters on a server: a platformer world has a few dozen programs running at once.

When a player leaves, their programs stop and restart in the room sandbox. `forever` loops begin again from the top. That is acceptable and easy to explain: "your programs keep going, they just start over".

### The sandbox interface

`sandbox-host.js` presents the same four operations the browser `Worker` did: `load(programId, code, isClone)`, `post(message)`, `onMessage(handler)`, `terminate()`. The `Runtime` does not know which implementation is behind it. Two implementations:

1. `worker_threads`, for local development. Same `sandbox.worker.js` with a ten-line shim that maps `self.postMessage` to `parentPort`. Resource limits via `resourceLimits` (64 MB heap, small stack). The same global stripping, extended for Node: `process`, `require`, `module`, and dynamic `import()` by passing `--disallow-code-generation-from-strings` off (we need `new AsyncFunction`) but running the worker with `--experimental-permission` style flags where available. This is not a security boundary. It is fine on your own laptop with your own kids' code.
2. `isolated-vm`, before anything is reachable from the internet. A real V8 isolate per sandbox with a memory limit and a CPU timeout per call, no Node globals at all. This is what Screeps uses to run thousands of players' scripts in one process. The sandbox API already funnels every effect through `post`, so the port is wrapping the API object as isolate references and implementing `wait` with a host-side timer. Budget two days.

The watchdog stays: a sandbox that misses pings for 3.5 seconds is terminated and its programs restarted with the kid-readable "got stuck" message. With one sandbox per player, a stuck loop takes down that player's other programs for a moment, not the room's.

### The trust boundary is the Runtime, as today

Every `cmd` and `query` from a sandbox goes through the existing whitelist and clamps. New checks on top:

- Commands apply only to the actor the program was started on. There is no way for one program to address another actor except through the primitives that already allow it (`goTo`, `clone`, `nearest`).
- Per-player caps instead of per-room caps for spawn rates, copies and spawned bricks, so one kid cannot fill the world.
- A per-sandbox command rate limit (200 a second is generous; a `forever` loop that spams `spawn` hits the existing 8 a second cap first).
- `teach` code must parse with acorn, be under 20 KB, and reference only known primitives (the compiler already knows the names). Claude-generated and hand-edited code go through the same gate.

### Generation and `see()`

Generation stays where it is. The browser calls `/api/generate` on Vercel, shows the card, and only then sends `teach` with the resulting code. The sim server never holds an API key.

`see()` is the one primitive that needs a camera. The server sends `seeRequest` to the lock holder's browser (or any browser in the room if none). That browser renders the view from the model's eyes exactly as today, calls `/api/see` itself, and answers with `seeReply`. The runtime's existing one-call-a-second limit becomes per room. If no browser answers in four seconds the query resolves to `"none"`.

### Ownership and editing

A behavior remembers who taught it (`by: playerId`). Anyone holding the lock can edit, disable or delete it, since the thing is theirs for now. The card shows "taught by Maya" so kids know whose work they are changing. Reset keeps behaviors, as today.

## 8. Local development setup

Two processes, one command.

```bash
npm run sim      # node --watch server/sim/index.js   (port 8787)
npm run dev      # vite, with /ws proxied to the sim server (ws: true)
npm run dev:all  # both, via concurrently
```

- Vite's `server.proxy` forwards `/ws` with `ws: true`, so the page talks to the same origin in dev and in the cloud. The client reads `VITE_SIM_URL` only when set, for pointing a Vercel preview at a cloud sim.
- Rooms come from the URL: `#castle?room=maya`. No room means a random five-letter one, written back into the URL so the link is shareable.
- Two players for testing is two tabs. `sessionStorage` holds the player id, so tabs are distinct and a reload keeps the same identity.
- A `?lag=150` query on the dev server adds a delay to every frame in both directions. Everything about feel should be tested with lag on, from day one.
- The sim process logs one line per room per minute: players, bodies, awake bodies, snapshot bytes, step time. That is the whole observability story until the cloud phase.

For testing, `test/room.test.mjs` runs a room with fake sockets in Node and asserts: two joiners get identical manifests, a lock is exclusive and released on disconnect, keys reach only the locked actor, a taught behavior runs and its commands apply, snapshots carry only moved bodies. `tools/smoke.mjs` grows a second page and checks that a tower toppled in page one is toppled in page two.

## 9. Cloud migration

### What has to be true

The sim server holds state and long-lived sockets, so it cannot be a Vercel function. It needs a host that runs a container, accepts WebSockets, and keeps one process up for hours. Everything stateless stays on Vercel.

| Host | Fit | Notes |
|---|---|---|
| Fly.io | Good | Containers, WebSockets, regions near the players, cheap at this scale, `fly-replay` lets a room pin to a machine later. Recommended. |
| Railway or Render | Good | Same shape, simpler dashboard, fewer regions. Fine alternative. |
| Cloudflare Durable Objects | Awkward | One object per room is the right model and WASM runs, but there is no `worker_threads` or isolate API for the sandboxes, and a 60 Hz loop fights the alarm model. Revisit if the sandbox moves to QuickJS in WASM. |
| Vercel | No | Functions cannot hold a socket or a loop. |

### Steps

1. `Dockerfile` for the sim server: `node:22-slim`, `npm ci --omit=dev`, `node server/sim/index.js`. Rapier is WASM, so no native build step. `isolated-vm` is a native addon and builds in the image when it arrives.
2. `fly.toml` with one machine, a health check on `/healthz`, `auto_stop_machines` off (rooms must not be put to sleep mid-game), `PORT` and `ROOM_IDLE_MS` as env.
3. TLS is terminated by the host, so the page connects to `wss://<app>.fly.dev/ws`. Set `VITE_SIM_URL` in the Vercel project and allow the Vercel origin in the sim's `Origin` check.
4. Secrets: none on the sim server. The Anthropic key stays on Vercel.
5. Limits before the link is public: `MAX_ROOMS`, max 6 players a room, idle room teardown, a cap on total sandboxes per process, and the `isolated-vm` sandbox from section 7.
6. Scaling path if it is ever needed: today one process runs every room. The next step is one process per room (a Fly machine each, `fly-replay` routing by room id). The protocol and room code do not change for that; only `index.js` does.

### What does not change

The room, protocol, snapshot and sandbox code are identical locally and in the cloud. Local differences are env vars and the proxy. That is the point of starting with a real server on the laptop rather than a BroadcastChannel shortcut.

## 10. Phases

Each phase ends with something you can show in two browser tabs.

| Phase | Work | Done when | Size |
|---|---|---|---|
| 0. Seams | `RoomEvents` hooks in `Runtime`; `SandboxHost` interface with the `worker_threads` implementation; `mirror` mode in `World.step`; `Room` class running headless with programs, no network | `test/room.test.mjs` runs the platformer with its premade behaviors in Node and coins vanish when the hero touches them | 2 days |
| 1. Shared physics | `ws` server, rooms by URL, manifest, JSON snapshots, `add`/`remove`, mirror client with interpolation, `Session` object | Two tabs show the same toppling tower. Reset and world switch work from either tab. | 3 days |
| 2. Players and locks | Players strip, names and colors, `select` locks, outlines and tags, keys and drags routed by lock, inspector read-only state, join and leave toasts | Two kids drive two different things with the arrow keys at the same time. A third cannot grab either. | 2 days |
| 3. Programs over the wire | `teach`, edit, enable, delete, run-a-stack, logs, trace to the lock holder, `say`, sounds, colors, pens, `see()` via the browser, ownership labels, Brick Talk through the room | Teach a behavior in one tab, see it run in the other, including bubbles and sounds. Close the teaching tab; the behavior keeps running. | 4 days |
| 4. Hardening | Binary snapshots, full snapshot cadence, reconnect with the same player id, rate limits and caps per player, idle rooms, the `?lag` switch and a feel pass at 120 ms, the two-page smoke test | Plays well at 120 ms added lag; a reload mid-game comes back in place. | 2 days |
| 5. Cloud | Dockerfile, Fly app, wss, `VITE_SIM_URL` on Vercel, health check, one-line-a-minute logs | A link shared with someone on another network works. | 1 day |
| 6. Before public | `isolated-vm` sandbox, origin checks, abuse caps, a kill switch per room | Untrusted code cannot reach the host process or the network. | 2 days |

About 16 working days end to end. Phases 0 through 2 are the risky ones, because they touch `app.js` the most. Phase 3 is mostly plumbing once the seams exist.

## 11. Risks and open questions

- The `app.js` refactor is the largest single piece of work and the easiest to underestimate. Mitigation: the `Session` object keeps the method names `app.js` already calls, so the change is one call site at a time, with the single-player path still working until the end of Phase 2.
- `worker_threads` is not a sandbox. Nothing may be exposed to the internet before Phase 6. Keep the local phases local.
- Explosions and a 160-piece castle create bursts of moving bodies. The budget in section 5 covers it, but a kid with `forever(() => explode())` on forty copies will find the limit. Per-player caps are the answer, and the existing clone cap of 40 per room may need to become per player.
- Drags from a laggy client fight the physics for a moment. The server treats a dragged thing as kinematic for the duration, as the local drag does, so it should feel right. Test with lag.
- Clock: the server's 60 Hz `setInterval` is noisier than a browser frame callback. Measure step jitter in the per-minute log; if it matters, step on a worker thread.
- Who may switch the world or press Reset? The plan says anyone, with a toast. If that produces chaos with real kids, a one-tap "ask" that needs a second player to agree is cheap.
- Room lifetime and sharing: a room dies ten minutes after the last player leaves. Saving a room's state as JSON so a link can be revisited tomorrow is small and worth doing after Phase 5, not before.
- Key routing for World rules: every player with the World selected sends keys to World programs. If two kids both hold space, "drop bricks" fires for each press. That is probably what they want.

## 12. First steps

1. Branch `multiplayer`. Add `server/sim/` and `test/room.test.mjs`.
2. Phase 0 in the order listed: the `Runtime` hooks first (smallest), then `SandboxHost`, then the `Room` class around the existing harness.
3. Do not touch `app.js` until a headless room runs the platformer in a Node test. That test is the proof that the server side works before any networking exists.

## 13. What was built, and where it differs from the plan

Everything in sections 4 through 10 exists. The differences:

- **Snapshots went binary from the start** (15 bytes a body, not 14: a byte for the quaternion's largest component), with a codec test instead of a JSON interim.
- **Selection of a locked thing is read-only viewing**, not a denied click. The page shows the cards and a banner with the holder's name, asks for no lock, and takes the thing the moment the holder lets go. A real denial (two clicks within the same tick) still snaps back with a toast.
- **Leaving hands programs to the room sandbox** as planned; the `by` label stays so cards still say who taught them.
- **`see()`** is answered by the lock holder's page as planned, with an 8 second timeout on the server.
- **The isolate sandbox is in** (Phase 6) and the Dockerfile selects it. A worker thread stays the default for `npm run sim`, since it starts faster and nothing local is exposed. The confinement test (`test/sandbox.test.mjs`) runs both kinds: no Node or network globals inside, and a loop that never pauses stops only its own sandbox.
- **Rate limits and caps**: 60 messages a second per page, 12 library models and 40 behaviors per player, 6 players and 20 rooms per process. The clone cap of 40 stayed per room.
- **Renaming** was added (click your own chip); the plan had none.
- **Lag switch** is `LAG_MS` on the sim server rather than a query on the page, so one setting covers both directions and every page.
- **Not built**: client prediction, a "may I?" for Reset, saving rooms to disk. Section 11 still describes them accurately.

What the two-page smoke test showed about headless Chromium is worth knowing: a page in the background gets neither animation frames nor prompt message delivery there, so the test places the mirror by hand before reading positions. Real browsers behave better, and the mirror is designed for it either way: snapshots that arrive late are applied the moment the tab is visible again.

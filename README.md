# Brick Behaviors (prototype)

Kids describe how their virtual brick creations should behave in structured natural language, made of words plus things they point at. The description becomes a small program. That program runs in a sandbox and can only call high-level primitives, which act on a physics world.

Building is out of scope here. You pick a premade world, add premade models from a library, and teach anything in the world (models, houses, trees, single bricks, or the World itself) how to behave.

```bash
npm install
cp .env.example .env.local           # then paste your key into .env.local
npm run dev                          # Claude writes the code if a key is set,
                                     # otherwise the offline compiler is used
npm test                             # compiler, prompt, physics, geometry, stage, codec, sandbox and room checks (headless)
npm run dev:all                      # the page plus the sim server, for playing together (below)
```

Add `#castle`, `#space`, `#platformer`, `#village`, `#farm` or `#calvinball` to the URL to start in that world.

## What's on screen

- **Worlds** (picker, top left). Each one has its own look, gravity, props, models and a few behaviors that come already taught:
  - 🧱 **Playground**: trees, two loose-brick houses, a rainbow tower, a ramp, a ball. Race car, catapult, and a skyship floating over the ramp (arrows steer it, w/s fly it up and down, space pulls its lever). Kelvin, a moody fellow in a pinstripe suit, stands by the car (arrows walk him, h says hello).
  - 🏰 **Castle**: a loose-brick castle on a hill with a catapult aimed at it (space throws; three throws knock bricks loose). A knight, a horse, a dragon, tents, a well, hay.
  - 🚀 **Space**: no gravity (it's a World rule you can switch off). A starfighter that flies with w/s and shoots, a UFO, a rocket that blasts off when clicked, two aliens, floating asteroids, a moon base, stars and a ringed planet.
  - 🍄 **Platform Game**: steps and ledges, a moving platform, spinning coins that vanish when the Hero touches them, patrolling slimes, a surprise block and a goal flag.
  - 🏘️ **Village**: houses along the roads, a fountain, market stalls, a bell tower. A dump truck, Mayor Bot.
  - ⛳ **Minigolf**: a playable three-hole course: a straight hole, a dogleg, and one guarded by a spinning gate. The golf ball is the player: ← → aim it (an arrow on the ground shows where), hold space to charge a putt and let go to hit, ↑ taps, R goes back to the tee. Each cup is a real hole in the green with a sensor that tells the ball "in the hole"; the ball counts strokes and moves itself to the next tee. All of it is ordinary behaviors you can read and change.
  - 🚜 **Farm**: barn, silo, carrots and corn, a pond, a cow pen with two cows that moo, a horse and a tractor.
  - 🏟️ **Calvinball**: a game for Red against Blue that you're meant to change. The field is a big one (82 × 52 studs), split into a red half and a blue half, with a center circle and a low wall of heavy loose bricks around it. There's a brick goal 18 studs wide at each end, two players and a race car per team, a ball on the center spot, and a big scoreboard. Pick a player: the arrows run and space kicks. Every rule is a behavior you can open and rewrite. Each goal's net tells everyone "red scores" or "blue scores". The scoreboard counts the points and `show()`s them on its screen (first to 5 wins, R starts a new game). The ball flies away from whoever kicks it and goes back to the middle after a goal. Cones, benches, water coolers, spare bricks, corner flags, stadium lights and trees fill out the field. Only the field itself is fixed (a prop built with `fixed: true`: you can select it and teach it, but not drag or turn it, so it can't be picked up by accident). Everything else can be knocked over. The walls, trees and cones break into bricks, while the lights, flags, benches, coolers, goals and scoreboard topple as whole pieces (a prop built with `dynamic: true`). The goals are heavy enough that the ball can't move them but a car can, and a toppled scoreboard keeps showing the score. Reset stands everything back up. In a room, each kid grabs a player.

  Each world keeps its own state, so switching away and back finds everything as you left it.
- **Library** (＋): a search box and section links stay at the top while you scroll. 27 models in five groups. People (knight, hero, astronaut, farmer, villager, wizard, golfer, Kelvin, a Red player and a Blue player), vehicles (race car, digger, catapult, tractor, dump truck, skyship), characters (robot, slime), animals (dino, dragon, horse, turtle, cow) and space (alien, spaceship, UFO, rocket). The Red and Blue players come already knowing how to run (arrows) and kick (space).
- **Skyship**: built to match four photos of a real brick build (tools/model/review.mjs renders a model from any angle to compare). It brought new building elements to `src/world/bricks.js`: round bricks and logs, hollow round containers, bars, ladders, grilles, see-through glass and glass panels, a boat hull with a tapered bow and a sloped chine, turned pieces (`rot`) and flexible hoses. A model with `floats: true` ignores gravity and hovers where it is.
- **Minifigures**: the people are real minifigs, not stacks of bricks. Their proportions are measured from the minifigure design patent (US D253,711, figs. 1 and 2) and match its front and side silhouettes to within about 0.05 studs. `src/world/minifig.js` builds them from new primitives: a lathed head and neck, a tapered torso, extruded leg profiles, bent tube arms, C-clip hands, and canvas decals for faces, torso prints and leg prints. On top of those go hats and hair (helmet, cap, straw hat, space helmet, wizard hat, short hair, shaggy hair, antennae) and things to hold (sword, shield, pitchfork, wand). Physics uses a few hidden boxes; the head turns, the arms swing, and the legs stride when it walks.
- **Inspector** (right): what's selected, its parts, the composer, examples, and the behaviors it knows.
- **Camera**: drag the sky or ground to orbit, right-drag to pan, scroll to zoom. 🎥 Follow keeps the selection in view.

## On a phone or tablet

The same page works on touch screens. In portrait the inspector is a sheet at the bottom with three heights: a peek (just the name of what's selected and its ⋯ menu), half, and full for typing; drag its handle or tap it. The key pad floats above the sheet; Follow, Reset and World rules move into the ☰ menu. On a phone held sideways the inspector is a narrower panel on the right, as on a desktop. One finger orbits the camera, two fingers zoom and pan; tap a thing to select it and drag it to move it; while dragging, slide a second finger sideways to turn it (the wheel's job on a desktop); press and hold a brick of a house or castle to pick just that brick. Errors pop up as toasts, since there is no program log on a small screen. Touch devices start with the plain graphics look.

## Selecting, moving, keys

- **Click** a model to select it, or any brick of an assembly (a house, the castle, the tower) to select the whole assembly. Props like trees, platforms and coins are things too.
- **Double-click** a brick in an assembly to select just that brick. ⬆ goes back to the whole thing.
- **Click the ground** (or 🌍 World rules) to select the **World**. World rules can change `gravity()`, drop bricks from the sky, `clone()` things, say things in a banner, recolor the ground, and react to keys and to clicks on the ground. The World itself never moves.
- Clicking the sky selects nothing.
- **Only the selected thing hears the keyboard.** Several things can all be taught the arrow keys, and only the one you've selected moves.
- **Drag** the selected thing to move it; **scroll while dragging** to turn it. ↻ turns it 45°, ⧉ copies it with everything it knows, 🗑 removes it from this world, ⟲ puts a model back where it started.
- **⟲ Reset world** rebuilds the world. Things stay where you dragged them, deleted things stay deleted, copies go away, and every behavior starts again.

## Describing a behavior

The composer is a text box that also holds **chips**:

| Chip | How you make it | Serialized as |
|---|---|---|
| a part of your model | click it in the parts list, or 👉 Point and click it in 3D | `{part:left arm}` |
| a thing in the world | 👉 Point (or Alt-click) on a tree, house, tower, another model… | `{thing:tower\|Rainbow Tower}` |
| a spot on the ground | 👉 Point (or Alt-click) on the ground | `{place:-3,8}` |

The sentence-starter buttons ("When I press space…", "Forever…", "When it bumps into…") give the language some structure without turning it into a form. *Make it so* (or ⌘/Ctrl+Enter) generates the program. The card it creates shows:

1. the kid's own words, chips included;
2. a plain-English read-back of each rule ("While ↑ is held: drive forward"), so the kid can check that it understood;
3. the code, which can be edited and re-run;
4. notes on anything it couldn't do.

Each behavior can be switched on and off, edited, or deleted. A model can run several behaviors at the same time.

### Two code generators

- **Claude** (`server/generate.js`, `src/behavior/prompt.js`). This runs when the dev server has `ANTHROPIC_API_KEY`. The key stays on the server, and the page calls `POST /api/generate`. The request includes the model's parts with their angle ranges, the nearby things with their ids, and the model's other behaviors. Claude returns `{summary[], code, notes}` through structured output.
- **Offline compiler** (`src/behavior/compiler.js`). This is a pattern-based fallback that covers common phrasings: key, touch, see, click, message, forever and every triggers, plus drive, turn, go to or chase, the part motions, throwing bricks, sounds, say and dance. Anything it can't parse goes into the notes ("I didn't understand: fly to the moon"). It also shows the kind of code Claude is expected to write.

## The primitives

`src/behavior/primitives.js` is the single source of truth. The worker, the host validator, the Claude prompt and the tests all read from it.

Every program belongs to one **actor** (`src/world/actor.js`): a model, an assembly (everything sharing a thing id), one brick of an assembly, or the World. Actors are looked up by stable ids, so behaviors survive the world being rebuilt.

- **events**: `onStart`, `onKey`, `onKeyUp`, `whileKey`, `onTouch(filter)`, `onClick`, `onMessage`, `onClone`, `forever`, `every`
- **movement**: `drive(speed)`, `steer(rate)`, `rise(speed)` (fly up/down), `stop()`, `jump()`, `push()`, and the awaitable `move(dist)`, `turn(deg)`, `goTo(target)`, `face(target)`, `teleport(target)` (jump there and land on whatever is below). Assemblies of loose bricks drive as one block (frictionless while driven, so the bottom row keeps up); props slide kinematically.
- **copies**: `await clone(what, where)` copies a thing with all its behaviors (`what`: null for itself, `thing("id")` or a kind; `where`: `place(x, z)`, `"front"`, `"back"`, `"left"`, `"right"`, `"above"`, or nothing for a clear spot beside it). Copies run their behaviors too, plus `onClone`; `isClone()` tells them apart. At most 40 copies and 3 per second. `remove()` takes a thing out of the world.
- **world rules**: `gravity(amount)` (1 normal, 0 floating, negative falls up), only from the World.
- **parts**: `part(name).spin()`, `part(name).turnTo(deg)`, `part(name).wiggle()`, `part(name).color()`
- **world**: `spawn({color, size, at, launch, from})`, `play(sound)`, `say(text)`, `show(text)` (writes on a thing's screen, like the Calvinball scoreboard's, until the next `show`; color words light up in their color), `broadcast(name)`, `color()`
- **sensing**: `look(dist)` (raycast straight ahead), `nearest(filter)`, `touching(filter)`, `position()`, `is(thing, filter)`
- **references**: `thing(id)`, `place(x, z)`. Filters can be a color, a kind (`"tree"`, `"brick"`, `"model"`…), `{color, kind}`, or a thing reference.

## Sandbox

Each behavior runs in its own **Web Worker** (`src/behavior/sandbox.worker.js`):

- The only names in scope are the primitives. Before user code runs, the worker deletes `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, storage, `postMessage` and the other dangerous globals, from both the worker global and its prototype chain. The page's CSP blocks outside network access as a second layer.
- Only JSON-cloned data crosses to the page. The host (`src/behavior/runtime.js`) accepts only whitelisted commands, clamps every number (speeds, angles, launch force), rate-limits spawning to 8 bricks per second, and caps each model at 60 spawned bricks.
- A **watchdog** pings each worker every second. A program stuck in a loop that never awaits gets stopped, with a kid-readable message: "got stuck — a loop never paused. Try adding wait() inside it."
- Errors show up in the Program log.

## Physics

The physics engine is Rapier 3D, and Three.js mirrors its bodies for rendering (`src/world/world.js`).

- Units are studs. A brick is 1.2 studs tall and a plate 0.4. Gravity is a toy-scale −25 studs/s².
- Every brick is a box collider. A model's chassis is one compound body, and its parts are separate bodies joined by **revolute joints**:
  - **Wheels** are ball colliders with velocity motors. Steering is differential, with a small yaw assist so four grippy wheels can still turn.
  - **Hinges** use position motors. The target angle moves at a fixed swing speed per part, which keeps motions smooth and gives the catapult a sensible throw (about 20 studs).
- Contacts are disabled within a model, so arms don't fight wheels.
- "Glide" models (Robot, Dino) stay upright and move by velocity control.
- Collision events feed `onTouch` and `touching()`. Raycasts feed `look()`.



## Playing together

Press 👥 **Play together** in the top bar (or add `?room=<name>` to the URL) and share the link. Everyone in a room sees one world: the physics runs once, on a small **sim server**, and each page shows a mirror of it. Up to 6 players.

- **Selecting locks.** The thing you select is yours until you pick something else or leave: only your keys drive it, only you can drag, copy, delete or teach it. Everyone else sees your name on it in your color and can read its behaviors but not change them. Clicking a thing someone else is using shows it read-only, with "Maya is using this"; the moment they let go, it's yours. The World is never locked: anyone with the ground selected sends keys to World rules.
- **Programs belong to the world.** Behaviors run on the server, so a coin keeps spinning and a slime keeps patrolling whether or not the kid who taught them is still here. A card shows who taught it. When a player leaves, their programs keep running (they start over from the top).
- **Brick Talk is real** in a room: the symbols go to the others and appear over the thing you have selected. Words never leave your page.
- Reset and switching worlds happen for everyone, and the log says who did it. Click your own name chip to rename yourself.
- `see()` still needs a camera: the server asks the browser of whoever is using that thing to take the picture.

How it works (the plan is in [`docs/multiplayer-plan.md`](docs/multiplayer-plan.md)):

```
page A  ──intents (select, keys, drags, teach…)──►  sim server: one Room per link        ◄──  page B
        ◄──20 Hz binary snapshots + events───────   World + Runtime + Stage, unchanged   ───►
                                                    programs in sandboxes, one per player
```

- `npm run sim` starts the server (`server/sim/`, port 8787); `npm run dev` proxies `/ws` to it, so `npm run dev:all` is the usual way. `LAG_MS=120 npm run sim` delays every message both ways, to feel what the cloud feels like.
- The server is the only thing that steps physics. Pages build the world from the server's descriptions (`src/net/entities.js`) and move bodies from delta snapshots (`src/net/codec.js`, 15 bytes per moved body), drawn 100 ms behind and interpolated (`src/net/mirror.js`). Dragging is held on your page and on the server at once, so it feels attached.
- Programs run in **sandboxes** on the server behind one interface (`src/behavior/sandbox-host.js`): a worker thread per player for local play (`server/sim/sandbox-node.js`), or a V8 isolate with a memory limit and a time limit per slice (`server/sim/sandbox-isolate.js`, `SANDBOX=isolate`) for a server on the internet. Either way `process`, `require`, `fetch` and friends don't exist inside, every command still goes through the Runtime's whitelist and clamps, and a loop that never pauses stops only its own sandbox.
- `server/sim/protocol.js` validates every message; a page is limited to 60 messages a second, 12 added models and 40 taught behaviors. Rooms close ten minutes after the last player leaves.
- Cloud: `Dockerfile` and `fly.toml` run the sim server on Fly.io (any host with containers and WebSockets works). The page stays on Vercel with `VITE_SIM_URL=wss://<app>.fly.dev/ws`; set `ORIGINS` on the server to the page's origin. The Claude endpoints stay on Vercel: the sim server never holds an API key.
- `node tools/room-smoke.mjs` opens two pages in one room in headless Chromium and checks driving, locks, teaching, drags and Reset across them.

## Brick Talk chat

A collapsible chat window (bottom left) based on the Brick Talk concept: you type in any language, and what gets sent is only a row of symbols, never your words. In a room the symbols go to the other players; alone, the other side of the conversation is simulated. Each symbol is a small 3D-rendered brick build on a pedestal in its category color (`public/bricktalk/<id>.webp`, extracted from the Brick Talk artifact).

To redesign a symbol, describe its build in `tools/bricktalk/builds.js` and run `node tools/bricktalk/render.mjs <ids> <outdir>` with the dev server up (set `BRICK_URL` if it isn't on :5173). The script renders each build in headless Chrome with three.js, matching the camera, lights and pedestal of the originals, and writes `<id>-review.png`, which compares the old and new versions at chat sizes and shows the new one next to all 64 symbols. Add `--install` to copy the result into `public/bricktalk/`. `go` is in there only as the calibration reference; `play` is the redrawn game controller.

- **Translation is always Claude** (`server/bricktalk.js`, `POST /api/bricktalk`, `claude-haiku-5-5`). The response schema's enum is the 64 symbol ids, so the model can't return anything else. There's no offline fallback; without a key the chat says so.
- **The validator is the safety layer** (`src/chat/symbols.js`). Every phrase is checked on the server and again on the page (grammar, no name-calling, at most 6 symbols). Dropped words and blocked phrases are shown to the sender only.
- **In the world**, a sent message appears as a symbol bubble over the selected thing (or near the middle of the view if nothing, or the World, is selected).
- **Simulating a friend**: switch the **Me / Friend** button to Friend and type, or press 🎲 for a canned friend message. It shows up in the log and as a yellow-outlined bubble over another model near the middle of the view.


## Layout

```
src/behavior/  primitives.js  the API spec (source of truth)
               compiler.js    offline structured-language compiler
               prompt.js      Claude prompt + response schema
               generate.js    picks Claude vs offline, syntax-checks the result
               runtime.js     host side: workers, validation, tasks, sensing
               sandbox.worker.js
               filter.js      shared "does this thing match 'red' / 'tree'?"
src/world/     world.js       Rapier + Three entities, joints, motors, gravity
               minifig.js     minifigure meshes, hats, faces, prints, held things
               actor.js       what a program runs on: model, assembly, brick, World
               library.js     premade models as data
               worlds.js      the premade worlds (theme, props, models, pre-taught behaviors)
               props.js       builders for castles, houses, platforms, coins, barns...
               bricks.js      brick geometry/materials
src/stage.js   current world, behaviors per thing, teach/edit/clone/remove, drags, Reset
src/session.js single player: the Stage and Runtime on this page, behind the session interface
src/net/       session.js  a room: the same interface, as messages to the sim server
               mirror.js   the page's copy of the server's world, moved by snapshots
               codec.js    binary delta snapshots; entities.js  how things cross the wire
src/ui/app.js  world picker, selecting/dragging, composer, behavior cards, bubbles, players
src/chat/      symbols.js     Brick Talk vocabulary, build images, validator
               prompt.js      Claude prompt + enum schema
               chat.js        the chat window and in-world bubbles
tools/bricktalk/ render.mjs   re-render symbol builds (builds.js, render.js)
server/        /api/generate, /api/bricktalk, /api/see (Vite middleware)
server/sim/    the sim server: index.js (WebSockets), room.js (one world, players, locks),
               protocol.js, sandbox-node.js (worker threads), sandbox-isolate.js (isolated-vm)
test/          compiler / prompt / physics / geometry / stage / codec / sandbox / room checks
tools/         smoke.mjs (headless browser run), room-smoke.mjs (two pages in a room), model-probe, castle-probe, golf-probe, physics probes
tools/minifig/ render.html + review.mjs render minifigs (patent-scale silhouettes and color views);
               overlay.py overlays the silhouettes on the patent drawing to compare
```

## Open questions this prototype raises

- **Resolving ambiguity.** "Wave your arm" on a model with two arms. Right now the generator guesses and says so in the notes. A follow-up question could be better.
- **Pointing at parts of other models.** Today, pointing at another model gives you the whole thing.
- **Key conflicts** between several behaviors on the same thing. Keys now go only to the selected thing, which settles conflicts between things but makes games with two controllable things harder.
- **Copies and their code.** Copies run every behavior they inherit, including `forever` and `onStart`; a copy-making loop copies itself until the 40-copy limit. `onClone`/`isClone()` give a way out, but kids won't find it without help.
- **Who may Reset or switch worlds** in a room. Anyone, today, with a note in the log. If that's chaos with real kids, a "may I?" that needs one other player to agree is cheap.
- **Lag.** Driving from a cloud server feels floaty past about 120 ms. Prediction for the thing you're driving would fix it and is deliberately not built yet.

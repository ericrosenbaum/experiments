# Brick Behaviors (prototype)

Kids describe how their virtual brick creations should behave in structured natural language, made of words plus things they point at. The description becomes a small program. That program runs in a sandbox and can only call high-level primitives, which act on a physics world.

Building is out of scope here. You pick a premade world, add premade models from a library, and teach anything in the world (models, houses, trees, single bricks, or the World itself) how to behave.

```bash
npm install
cp .env.example .env.local           # then paste your key into .env.local
npm run dev                          # Claude writes the code if a key is set,
                                     # otherwise the offline compiler is used
npm test                             # compiler, prompt, physics, geometry, stage checks (headless)
```

Add `#castle`, `#space`, `#platformer`, `#village` or `#farm` to the URL to start in that world.

## What's on screen

- **Worlds** (picker, top left). Each one has its own look, gravity, props, models and a few behaviors that come already taught:
  - 🧱 **Playground**: trees, two loose-brick houses, a rainbow tower, a ramp, a ball. Race car, robot, catapult.
  - 🏰 **Castle**: a loose-brick castle on a hill with a catapult aimed at it (space throws; three throws knock bricks loose). A knight, a horse, a dragon, tents, a well, hay.
  - 🚀 **Space**: no gravity (it's a World rule you can switch off). A starfighter that flies with w/s and shoots, a UFO, a rocket that blasts off when clicked, two aliens, floating asteroids, a moon base, stars and a ringed planet.
  - 🍄 **Platform Game**: steps and ledges, a moving platform, spinning coins that vanish when the Hero touches them, patrolling slimes, a surprise block and a goal flag.
  - 🏘️ **Village**: houses along the roads, a fountain, market stalls, a bell tower. A dump truck, Mayor Bot.
  - 🚜 **Farm**: barn, silo, carrots and corn, a pond, a cow pen with two cows that moo, a horse and a tractor.

  Each world keeps its own state, so switching away and back finds everything as you left it.
- **Library** (＋ Add model): 21 models in five groups. People (knight, hero, astronaut, farmer, villager, wizard), vehicles (race car, digger, catapult, tractor, dump truck), characters (robot, slime), animals (dino, dragon, horse, cow) and space (alien, spaceship, UFO, rocket).
- **Minifigures**: the people are real minifigs, not stacks of bricks. Their proportions are measured from the minifigure design patent (US D253,711, figs. 1 and 2) and match its front and side silhouettes to within about 0.05 studs. `src/world/minifig.js` builds them from new primitives: a lathed head and neck, a tapered torso, extruded leg profiles, bent tube arms, C-clip hands, and canvas decals for faces and torso prints. On top of those go hats and hair (helmet, cap, straw hat, space helmet, wizard hat, hair, antennae) and things to hold (sword, shield, pitchfork, wand). Physics uses a few hidden boxes; the head turns, the arms swing, and the legs stride when it walks.
- **Inspector** (right): what's selected, its parts, the composer, examples, and the behaviors it knows.
- **Camera**: drag the sky or ground to orbit, right-drag to pan, scroll to zoom. 🎥 Follow keeps the selection in view.

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
- **movement**: `drive(speed)`, `steer(rate)`, `rise(speed)` (fly up/down), `stop()`, `jump()`, `push()`, and the awaitable `move(dist)`, `turn(deg)`, `goTo(target)`, `face(target)`. Assemblies of loose bricks drive as one block (frictionless while driven, so the bottom row keeps up); props slide kinematically.
- **copies**: `await clone(what, where)` copies a thing with all its behaviors (`what`: null for itself, `thing("id")` or a kind; `where`: `place(x, z)`, `"front"`, `"back"`, `"left"`, `"right"`, `"above"`, or nothing for a clear spot beside it). Copies run their behaviors too, plus `onClone`; `isClone()` tells them apart. At most 40 copies and 3 per second. `remove()` takes a thing out of the world.
- **world rules**: `gravity(amount)` (1 normal, 0 floating, negative falls up), only from the World.
- **parts**: `part(name).spin()`, `part(name).turnTo(deg)`, `part(name).wiggle()`, `part(name).color()`
- **world**: `spawn({color, size, at, launch, from})`, `play(sound)`, `say(text)`, `broadcast(name)`, `color()`
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



## Brick Talk chat

A collapsible chat window (bottom left) based on the Brick Talk concept: you type in any language, and what gets "sent" is only a row of symbols, never your words. There's no multiplayer, so the other side of the conversation is simulated. Each symbol is a small 3D-rendered brick build on a pedestal in its category color (`public/bricktalk/<id>.webp`, extracted from the Brick Talk artifact).

To redesign a symbol, describe its build in `tools/bricktalk/builds.js` and run `node tools/bricktalk/render.mjs <ids> <outdir>` with the dev server up (set `BRICK_URL` if it isn't on :5173). The script renders each build in headless Chrome with three.js, matching the camera, lights and pedestal of the originals, and writes `<id>-review.png`, which compares the old and new versions at chat sizes and shows the new one next to all 64 symbols. Add `--install` to copy the result into `public/bricktalk/`. `go` is in there only as the calibration reference; `play` is the redrawn game controller.

- **Translation is always Claude** (`server/bricktalk.js`, `POST /api/bricktalk`, `claude-haiku-5-5`). The response schema's enum is the 64 symbol ids, so the model can't return anything else. There's no offline fallback; without a key the chat says so.
- **The validator is the safety layer** (`src/chat/symbols.js`). Every phrase is checked on the server and again on the page (grammar, no name-calling, at most 6 symbols). Dropped words and blocked phrases are shown to the sender only.
- **In the world**, a sent message appears as a symbol bubble over the selected thing (or near the middle of the view if nothing, or the World, is selected).
- **Simulating a friend**: switch the **Me / Friend** button to Friend and type, or press 🎲 for a canned friend message. It shows up in the log and as a yellow-outlined bubble over another model near the middle of the view.


## World Finder (`finder.html`)

A separate page (open `/finder.html` on the dev server) that demonstrates a world-finding agent for kids. It has two screens. On the first, you type or say (🎤 inside the box) what you feel like in your own words, in any language ("dragons and castles, but nothing too scary, something easy"). **Claude** turns the sentence into tags, plus *keyword wishes* for anything more specific: "lava" or "geology" becomes a wish that looks for the worlds' `lava`, `volcano`, `magma`… keywords (`server/finder.js`, `POST /api/finder`, `claude-opus-5-5` at low effort, structured output whose enums are the tag list and the keyword list; prompt in `src/finder/prompt.js`). It reads the sentence when you pause typing, stop talking, or press Find, and it highlights the words behind each tag. Until Claude answers, and whenever there's no API key, the on-device word list (`parse()`) guesses instead. The wishes appear as chips under the sentence; tap one to flip it to *no thanks* or remove it. All the tags (kind of play, what it's about, things to do, level, where it was made) are behind *Browse all tags*. On the second, a small decision model reads 24 worlds "made by kids around the world", one at a time, while you watch:

- the next three worlds wait beside the lens, and a progress bar marks each world picked or passed;
- the world in the lens plays as a **wigglegram** (three frames from a small camera swing, played L-M-R-M). Under it, only the *clues* (facts that count toward one of your wishes) are listed, and each wish's bar fills as they arrive. *Show everything it reads* switches to the full stream: maker, tags, things, models, each behavior's read-back, and a complexity line. The ring around the lens is the overall match, with the bar it needs to clear marked on it;
- matches stamp **MATCH!** and fly to *Picked for you* as cards: title, a two-line summary, and a badge with the match % and the wish it matched best (hover for the maker and every reason). Hovering a card plays its wigglegram.

**The model** (`src/finder/model.js`) runs in the page; only the sentence goes to Claude, never the worlds or the matching. `read(world)` turns a world's metadata into facts, each with weighted evidence for criteria. The evidence comes from the maker's tags, its keywords, the things in the world (a dragon model is strong evidence for *dinos & dragons*, hay bales are weak evidence for *farms*), the compiled behavior code (`whileKey` + `drive` means *drive it with keys*, `onTouch` + `remove()` means *collect things*), the gravity, and a complexity score that sets *easy to start* vs. *lots going on*. Evidence for a wish combines as a noisy-OR. A keyword wish is filled by a world with any of its `matches` keywords; its `related` ones (loose links like crystal for geology) count 0.4. The match is the average over your likes, with keyword wishes counted double because they're you being specific, minus 0.8× the strongest dislike. A world is picked at 50% or more, unless something you said no to is at least 60% present. `parse(text)` reads sentences with a word list and negation scopes ("not", "no", "hate", "too hard" and so on), which run to the end of the clause.

**The worlds** are dioramas in `src/finder/kidworlds.js`, built from the same props and library models as the main app. Each one lists its maker, tags, behaviors and a thumbnail camera shot. With the dev server up, `node tools/finder/render.mjs [ids]` (set `BRICK_URL` if it isn't on :5173) loads each world into the real renderer and physics, lets it settle, and shoots the three wiggle frames into `public/finder/<id>.webp`. It also writes `public/finder/worlds.json`, which holds what's actually in each world (things, models, behaviors and their compiled code) for the page to read. Then `node --env-file=.env.local tools/finder/keywords.mjs [ids]` asks Claude for 15–25 specific keywords per world from that metadata and adds them to `worlds.json` (re-rendering keeps them).

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
src/stage.js   current world, behaviors per thing, clone/remove, drags, Reset
src/ui/app.js  world picker, selecting/dragging, composer, behavior cards, bubbles
src/chat/      symbols.js     Brick Talk vocabulary, build images, validator
               prompt.js      Claude prompt + enum schema
               chat.js        the chat window and in-world bubbles
tools/bricktalk/ render.mjs   re-render symbol builds (builds.js, render.js)
finder.html    World Finder page
src/finder/    kidworlds.js   the kid-made worlds (dioramas + maker, tags, thumbnail shot)
               model.js       on-device decision model + offline sentence parser
               prompt.js      Claude prompt + tag-enum schema for /api/finder
               finder.js/.css the page
tools/finder/  render.mjs     render wigglegram thumbnails + worlds.json (render.html, render.js)
               keywords.mjs   pull 15–25 keywords per world out with Claude, into worlds.json
server/        /api/generate, /api/bricktalk, /api/finder (Vite middleware)
test/          compiler / prompt / physics / geometry / stage / finder checks
tools/         smoke.mjs (headless browser run), model-probe, castle-probe, physics probes
tools/minifig/ render.html + review.mjs render minifigs (patent-scale silhouettes and color views);
               overlay.py overlays the silhouettes on the patent drawing to compare
```

## Open questions this prototype raises

- **Resolving ambiguity.** "Wave your arm" on a model with two arms. Right now the generator guesses and says so in the notes. A follow-up question could be better.
- **Pointing at parts of other models.** Today, pointing at another model gives you the whole thing.
- **Key conflicts** between several behaviors on the same thing. Keys now go only to the selected thing, which settles conflicts between things but makes games with two controllable things harder.
- **Copies and their code.** Copies run every behavior they inherit, including `forever` and `onStart`; a copy-making loop copies itself until the 40-copy limit. `onClone`/`isClone()` give a way out, but kids won't find it without help.
- **Multiplayer** was removed for now; it's in git history (commit 38421c2). The Brick Talk chat stays as a single-player demo.

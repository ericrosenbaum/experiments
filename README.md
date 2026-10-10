# Brick Behaviors (prototype)

Kids describe how their virtual brick creations should behave in structured natural language, made of words plus things they point at. The description becomes a small program. That program runs in a sandbox and can only call high-level primitives, which act on a physics world.

Building is out of scope here. You pick premade models from a library and teach them behaviors.

```bash
npm install
cp .env.example .env.local           # then paste your key into .env.local
npm run dev                          # Claude writes the code if a key is set,
                                     # otherwise the offline compiler is used
npm test                             # compiler, prompt, physics checks (headless)
```

Open the page in a second tab to get a second "player".

## What's on screen

- **World**: a green baseplate with trees, two brick houses, a 12-layer rainbow tower, a ramp, a ball and some loose bricks. The houses and tower are made of loose dynamic bricks that start out asleep, so you can knock them over.
- **Library** (＋ Add model): Race Car, Robot, Digger, Catapult and Dino. Each one has named parts: wheels, plus hinged pieces such as arms, a head, a tail, a scoop or a throwing arm.
- **Inspector** (right): the selected model's parts, the composer, examples, and the behaviors it knows.
- **Camera**: drag to orbit, right-drag to pan, scroll to zoom. 🎥 Follow keeps the selected model in view. The arrow keys are left free for the kids' programs.

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

- **events**: `onStart`, `onKey`, `onKeyUp`, `whileKey`, `onTouch(filter)`, `onClick`, `onMessage`, `forever`, `every`
- **movement**: `drive(speed)`, `steer(rate)`, `stop()`, `jump()`, `push()`, and the awaitable `move(dist)`, `turn(deg)`, `goTo(target)`, `face(target)`
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

## Multiplayer seam

`src/net.js` shares state between players. Each player is authoritative for their own models and sends their transforms 15 times a second. Everyone else's models show up as **kinematic** copies with a name tag, and you can bump them, `look()` at them, chase them, or `goTo` them. `broadcast()` messages, speech bubbles and sounds are shared too, so `onMessage("party", …)` can be triggered by a friend's model.

The transport is `BroadcastChannel`, so for now players are browser tabs. Moving to a real relay only means replacing the channel. New players spawn in a spot that no other player is using.

## Brick Talk chat

A collapsible chat window (bottom left) based on the Brick Talk concept: you type in any language, and other players only ever see a row of symbols, never your words. Each symbol is a small 3D-rendered brick build on a pedestal in its category color (`public/bricktalk/<id>.webp`, extracted from the Brick Talk artifact).

To redesign a symbol, describe its build in `tools/bricktalk/builds.js` and run `node tools/bricktalk/render.mjs <ids> <outdir>` with the dev server up (set `BRICK_URL` if it isn't on :5173). The script renders each build in headless Chrome with three.js, matching the camera, lights and pedestal of the originals, and writes `<id>-review.png`, which compares the old and new versions at chat sizes and shows the new one next to all 64 symbols. Add `--install` to copy the result into `public/bricktalk/`. `go` is in there only as the calibration reference; `play` is the redrawn game controller.

- **Translation is always Claude** (`server/bricktalk.js`, `POST /api/bricktalk`, `claude-haiku-5-5`). The response schema's enum is the 64 symbol ids, so the model can't return anything else. There's no offline fallback; without a key the chat says so.
- **The validator is the safety layer** (`src/chat/symbols.js`). Every phrase is checked on the server and again on the page (grammar, no name-calling, at most 6 symbols). Dropped words and blocked phrases are shown to the sender only.
- **In the world**, a sent message appears as a symbol bubble over your selected model and is shared with other tabs, where it appears over your model's copy.
- **Simulating a friend**: switch the **Me / Friend** button to Friend and type, or press 🎲 for a canned friend message. It shows up in the log and as a yellow-outlined bubble over a friend's model (or a spot near the middle of the view if no friend is connected).

## Layout

```
src/behavior/  primitives.js  the API spec (source of truth)
               compiler.js    offline structured-language compiler
               prompt.js      Claude prompt + response schema
               generate.js    picks Claude vs offline, syntax-checks the result
               runtime.js     host side: workers, validation, tasks, sensing
               sandbox.worker.js
               filter.js      shared "does this thing match 'red' / 'tree'?"
src/world/     world.js       Rapier + Three entities, joints, motors
               library.js     premade models as data
               worldmap.js    the premade world
               bricks.js      brick geometry/materials
src/ui/app.js  composer, pointing, behavior cards, bubbles
src/chat/      symbols.js     Brick Talk vocabulary, build images, validator
               prompt.js      Claude prompt + enum schema
               chat.js        the chat window and in-world bubbles
src/net.js     multiplayer
tools/bricktalk/ render.mjs   re-render symbol builds (builds.js, render.js)
server/        /api/generate, /api/bricktalk (Vite middleware)
test/          compiler / prompt / physics checks
tools/         smoke.mjs (headless browser run), physics probes
```

## Open questions this prototype raises

- **Resolving ambiguity.** "Wave your arm" on a model with two arms. Right now the generator guesses and says so in the notes. A follow-up question could be better.
- **Pointing at parts of other models.** Today, pointing at another model gives you the whole thing.
- **Key conflicts** between several behaviors, or several players' models, that listen to the same keys.
- **Who runs a program in multiplayer.** Currently each owner runs their own. Shared props such as the tower aren't synced yet, so each player has their own copy.
